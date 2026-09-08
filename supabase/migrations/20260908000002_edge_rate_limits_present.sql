-- =============================================================================
-- Rendre `check_edge_rate_limit` réellement présente en production
-- =============================================================================
--
-- CE QUI A ÉTÉ DÉCOUVERT, ET COMMENT
-- ----------------------------------
-- Le 8 septembre 2026, la vérification de la vague 2 s'est arrêtée sur :
--
--     ERROR: 42883: function "public.check_edge_rate_limit(text,integer,integer)"
--            does not exist
--
-- `has_function_privilege` avec une signature textuelle LÈVE quand la fonction
-- n'existe pas, au lieu de rendre NULL. L'erreur venait donc de la requête de
-- contrôle — mais ce qu'elle a révélé est réel : **la fonction n'est pas dans
-- la base**. Elle est pourtant créée par
-- `20260420000004_rate_limiting.sql`, qui vit dans ce dépôt depuis avril.
--
-- C'est JUNO-15 en miniature : l'historique des migrations ne décrit pas la
-- base. Neuf migrations ont été appliquées à la main dans l'éditeur SQL ;
-- celle-ci ne l'a manifestement jamais été.
--
-- POURQUOI PERSONNE NE L'A VU
-- ---------------------------
-- Trois fonctions edge déployées l'appellent, et **toutes les trois échouent
-- ouvert** :
--
--   calculate-chart    « if the function literally doesn't exist yet (fresh
--                        env), allow but log once » → return false
--   claim-referral     console.warn puis on continue
--   claim-promo-code   console.error puis on continue
--
-- Leur limite de débit est donc inopérante depuis avril, en silence. Le seul
-- symptôme est une ligne d'avertissement dans des journaux que personne ne lit,
-- et le comportement observable — les requêtes passent — est exactement celui
-- d'un limiteur qui fonctionne et qu'on n'a pas encore saturé.
--
-- C'est la même forme de défaut que JUNO-02 : un contrôle qui n'a pas pu
-- s'exécuter et qui a répondu « oui ».
--
-- POURQUOI CETTE MIGRATION MAINTENANT
-- -----------------------------------
-- `marketing-agent` (JUNO-04) appelle la même fonction et échoue **fermé** —
-- ce qui est la bonne conception, et ce qui veut dire qu'elle refuserait
-- 100 % des requêtes avec 503 tant que cette migration n'est pas appliquée.
-- La corriger n'est donc pas un à-côté : c'est une dépendance de la vague 2.
--
-- CE FICHIER EST UNE COPIE CONFORME DE 20260420000004
-- ---------------------------------------------------
-- Mêmes objets, mêmes définitions, mêmes privilèges — y compris
-- `SET search_path = public` plutôt que `''`, qui est la forme d'origine.
-- Rien n'est « amélioré au passage » : deux définitions divergentes de la même
-- fonction dans deux migrations est précisément la dérive que ce dépôt combat
-- ailleurs (les deux éphémérides, les deux jeux de tarot).
--
-- Si la fonction existe déjà et est identique, ce fichier ne fait rien.
--
-- IDEMPOTENT : CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, GRANT restatés.

BEGIN;

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key           TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_window_start
  ON public.edge_rate_limits (window_start);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to edge_rate_limits"
  ON public.edge_rate_limits;
CREATE POLICY "Deny all direct access to edge_rate_limits"
  ON public.edge_rate_limits FOR ALL USING (false);

CREATE OR REPLACE FUNCTION public.check_edge_rate_limit(
  p_key             TEXT,
  p_max             INTEGER,
  p_window_seconds  INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RETURN FALSE; -- defensive: refuse unkeyed requests
  END IF;
  IF p_max IS NULL OR p_max <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Tumbling window: bucket = floor(now / window) * window
  v_bucket := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.edge_rate_limits (key, window_start, count)
  VALUES (p_key, v_bucket, 1)
  ON CONFLICT (key, window_start) DO UPDATE
     SET count = public.edge_rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
-- Intentionally granted to authenticated callers too: the function simply
-- increments a counter on a caller-supplied key. Callers cannot bypass their
-- own rate limit, and can already trigger it by making real requests. This
-- lets lightly-privileged edge functions (e.g. calculate-chart) use a plain
-- JWT client rather than escalating to service_role for rate limiting alone.
GRANT  EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_edge_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.edge_rate_limits
   WHERE window_start < NOW() - INTERVAL '2 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  PERFORM cron.schedule(
    'cleanup-edge-rate-limits',
    '15 3 * * *',
    $cron$SELECT public.cleanup_edge_rate_limits();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable — schedule cleanup_edge_rate_limits() manually';
END $$;

-- ---------------------------------------------------------------------------
-- Auto-vérification : les deux moitiés.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_allowed BOOLEAN;
  v_key     TEXT := 'selfcheck:' || gen_random_uuid()::text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'edge_rate_limits'
  ) THEN
    RAISE EXCEPTION 'edge_rate_limits n''existe pas';
  END IF;

  IF to_regprocedure('public.check_edge_rate_limit(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'check_edge_rate_limit n''existe pas apres cette migration';
  END IF;

  -- Le privilège existe pour les deux rôles qui en ont besoin. `authenticated`
  -- est délibéré et documenté ci-dessus : calculate-chart l'appelle avec un
  -- simple JWT plutôt que de s'élever à service_role pour cela seul.
  IF NOT has_function_privilege('service_role',
        'public.check_edge_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role ne peut pas appeler check_edge_rate_limit';
  END IF;
  IF NOT has_function_privilege('authenticated',
        'public.check_edge_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ne peut pas appeler check_edge_rate_limit';
  END IF;

  -- Et elle COMPTE réellement. Une fonction présente qui rendrait toujours
  -- TRUE serait indiscernable d'un limiteur absent, du point de vue des trois
  -- fonctions qui échouent ouvert.
  SELECT public.check_edge_rate_limit(v_key, 1, 60) INTO v_allowed;
  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'le premier appel aurait du etre autorise';
  END IF;
  SELECT public.check_edge_rate_limit(v_key, 1, 60) INTO v_allowed;
  IF v_allowed IS NOT FALSE THEN
    RAISE EXCEPTION 'le deuxieme appel aurait du etre refuse : le compteur n''incremente pas';
  END IF;

  -- Ne pas laisser la sonde derrière soi.
  DELETE FROM public.edge_rate_limits WHERE key = v_key;

  -- Une cle vide doit être refusée, pas comptée.
  SELECT public.check_edge_rate_limit('', 10, 60) INTO v_allowed;
  IF v_allowed IS NOT FALSE THEN
    RAISE EXCEPTION 'une cle vide est acceptee';
  END IF;

  RAISE NOTICE 'check_edge_rate_limit presente, privilegiee et fonctionnelle.';
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
-- Trois fonctions edge déjà déployées retrouvent leur limite de débit sans
-- redéploiement : `calculate-chart` (30/min), `claim-referral` (10/h) et
-- `claim-promo-code` (10/h). Elles appelaient déjà cette RPC ; elle répondra
-- désormais au lieu d'échouer.
--
-- **Surveiller** : si l'une de ces trois voit soudain des 429, ce n'est pas une
-- régression — c'est le limiteur qui fonctionne pour la première fois depuis
-- avril. Vérifier que les seuils sont raisonnables avant de conclure.
--
-- ROLLBACK : `DROP FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER);`
-- ramène les trois fonctions à leur comportement actuel (limiteur mort, fail
-- open) et casse `marketing-agent`, qui échoue fermé.
