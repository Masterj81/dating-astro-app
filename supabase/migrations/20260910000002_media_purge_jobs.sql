-- =============================================================================
-- JUNO-09 phase B — l'état durable qui survit à la suppression du compte
-- =============================================================================
--
-- LE CONSTAT
-- ---------------------------------------------------------------------------
-- Les trois chemins de suppression appellent `auth.admin.deleteUser()` et rien
-- d'autre. La cascade emporte `profiles` et les tables liées ; elle n'emporte
-- **aucun objet de Storage**, qui vit dans `storage.objects` et n'a pas de clé
-- étrangère vers `auth.users`.
--
-- Mesuré le 9 septembre 2026, corrigé le 10 après la fermeture de JUNO-29 :
--
--     orphelins `avatars`         4
--     orphelins `verifications`   1   <- vidéo du visage, la plus sensible
--     -------------------------------
--     TOTAL                       5   plus ancien : 1er février 2026
--
-- La catégorie `verifications` est un média biométrique au sens large, conservé
-- sans compte et sans base légale depuis plus de sept mois.
--
-- POURQUOI UNE TABLE, ET POURQUOI SANS CLÉ ÉTRANGÈRE
-- ---------------------------------------------------------------------------
-- L'ordre des opérations décidé en phase A est : créer le travail, PUIS
-- supprimer le compte Auth, PUIS purger et reprendre. C'est le seul ordre qui
-- garde de quoi finir le travail après la disparition du compte.
--
-- Une clé étrangère vers `auth.users` détruirait exactement cela : la ligne
-- serait emportée par la cascade au moment précis où elle devient utile.
-- **L'absence de FK est la fonctionnalité**, pas un oubli, et l'auto-vérification
-- en fin de fichier échoue si quelqu'un l'ajoute « pour faire propre ».
--
-- CE QUI N'ENTRE JAMAIS DANS CETTE TABLE
-- ---------------------------------------------------------------------------
-- Aucun chemin, nom de fichier, URL publique ou signée, jeton, contenu, ni
-- message d'erreur libre. Une table de suivi de purge qui journalise les chemins
-- qu'elle a supprimés recrée la donnée qu'elle est censée effacer — et elle
-- survit 90 jours à la suppression du compte.
--
-- Deux garde-fous structurels, pas deux conventions :
--   * `last_error_class` porte une CLASSE prise dans une énumération vérifiée
--     par CHECK — jamais un SQLERRM ;
--   * `per_category` est validée par `_media_purge_shape_ok`, qui n'accepte que
--     les buckets de la liste blanche et, sous chacun, quatre clés entières.
--     Un chemin ne peut donc pas y être rangé, même par accident.
--
-- RÉTENTION : 90 jours après complétion (20260910000003). Ce sont des journaux
-- techniques de reprise, pas une trace de conformité.
--
-- IDEMPOTENT : IF NOT EXISTS partout, CREATE OR REPLACE pour les fonctions.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La forme de `per_category`, vérifiable par une contrainte
-- ---------------------------------------------------------------------------
--
-- IMMUTABLE parce qu'une CHECK l'exige. Elle ne lit aucune table : la liste
-- blanche des buckets est en dur ici, ce qui la rend vérifiable par un
-- validateur statique et impossible à élargir par une écriture de donnée.
CREATE OR REPLACE FUNCTION public._media_purge_shape_ok(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_value IS NOT NULL
     AND jsonb_typeof(p_value) = 'object'
     -- Chaque clé de premier niveau est un bucket de la liste blanche.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_value) AS k(bucket)
        WHERE k.bucket NOT IN ('avatars', 'voice-intros', 'verifications')
     )
     -- Chaque valeur est un objet.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_value) AS e(bucket, payload)
        WHERE jsonb_typeof(e.payload) <> 'object'
     )
     -- Sous chaque bucket, uniquement ces quatre clés.
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_each(p_value) AS e(bucket, payload),
              jsonb_object_keys(e.payload) AS m(metric)
        WHERE m.metric NOT IN ('found', 'deleted', 'failed', 'done')
     )
     -- Et leurs valeurs sont des nombres ou des booléens. JAMAIS une chaîne :
     -- c'est cette ligne qui rend un chemin instockable.
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_each(p_value) AS e(bucket, payload),
              jsonb_each(e.payload) AS v(metric, val)
        WHERE jsonb_typeof(v.val) NOT IN ('number', 'boolean')
     );
$$;

COMMENT ON FUNCTION public._media_purge_shape_ok IS
  'JUNO-09. Valide la forme de media_purge_jobs.per_category : buckets de la liste blanche, quatre metriques, valeurs numeriques ou booleennes. Interdit structurellement le stockage d un chemin ou d un nom de fichier.';

-- ---------------------------------------------------------------------------
-- 2. La table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.media_purge_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- PAS DE RÉFÉRENCE VERS auth.users. Voir l'en-tête : la ligne doit survivre à
  -- la cascade, c'est sa seule raison d'être.
  user_id       UUID        NOT NULL,

  requested_by  TEXT        NOT NULL
                CHECK (requested_by IN ('mobile_cron', 'web_immediate', 'manual')),

  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'failed')),

  per_category  JSONB       NOT NULL DEFAULT '{}'::jsonb
                CHECK (public._media_purge_shape_ok(per_category)),

  attempts      INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),

  -- Une CLASSE, jamais un message. L'énumération est fermée : un SQLERRM ne
  -- peut pas être écrit ici, la contrainte le refuse.
  last_error_class TEXT
                CHECK (last_error_class IS NULL OR last_error_class IN (
                  'storage_unavailable',
                  'permission_denied',
                  'bucket_missing',
                  'ambiguous_ownership',
                  'rate_limited',
                  'timeout',
                  'unknown'
                )),

  claimed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,

  -- Un travail terminé porte une date de fin ; un travail en cours n'en porte
  -- pas. Sans cette contrainte, la rétention à 90 jours n'aurait aucune borne
  -- fiable sur laquelle s'appuyer.
  CONSTRAINT media_purge_jobs_completed_at_matches_status
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

COMMENT ON TABLE public.media_purge_jobs IS
  'JUNO-09. Travaux de purge des medias apres suppression de compte. SANS cle etrangere vers auth.users, deliberement : la ligne doit survivre a la cascade pour permettre la reprise. Ne contient jamais de chemin, nom de fichier, URL ni message d erreur libre.';

COMMENT ON COLUMN public.media_purge_jobs.user_id IS
  'UUID du compte supprime. Pas de FK : la ligne survit a la suppression Auth, c est le mecanisme entier.';
COMMENT ON COLUMN public.media_purge_jobs.last_error_class IS
  'CLASSE d erreur prise dans une enumeration fermee. Jamais un SQLERRM : un message d erreur peut contenir un chemin.';

-- Un seul travail ouvert par compte : l'exécutant peut rappeler sans créer de
-- doublon, et la reprise n'a jamais deux lignes à réconcilier.
CREATE UNIQUE INDEX IF NOT EXISTS ux_media_purge_jobs_open_per_user
  ON public.media_purge_jobs (user_id)
  WHERE status <> 'completed';

-- La file de reprise : les non terminés, les moins tentés d'abord.
CREATE INDEX IF NOT EXISTS ix_media_purge_jobs_pending
  ON public.media_purge_jobs (attempts, created_at)
  WHERE status = 'pending';

-- La rétention.
CREATE INDEX IF NOT EXISTS ix_media_purge_jobs_completed_at
  ON public.media_purge_jobs (completed_at)
  WHERE status = 'completed';

-- ---------------------------------------------------------------------------
-- 3. Privilèges — fermés par défaut, et vérifiés
-- ---------------------------------------------------------------------------
--
-- Supabase applique un GRANT ALL au niveau du schéma. Ne pas révoquer
-- explicitement ici laisserait `authenticated` lire la table : c'est exactement
-- ce qui s'est passé sur `messages` (JUNO-08), où le privilège ne venait
-- d'aucune migration.
ALTER TABLE public.media_purge_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_purge_jobs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.media_purge_jobs FROM PUBLIC;
REVOKE ALL ON public.media_purge_jobs FROM anon;
REVOKE ALL ON public.media_purge_jobs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_purge_jobs TO service_role;

REVOKE EXECUTE ON FUNCTION public._media_purge_shape_ok(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._media_purge_shape_ok(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public._media_purge_shape_ok(JSONB) FROM authenticated;

-- Aucune policy n'est créée. RLS active sans policy = deny-all pour tout rôle
-- soumis à RLS. `service_role` la contourne, et c'est le seul appelant.

-- ---------------------------------------------------------------------------
-- 4. `updated_at`
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._media_purge_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_purge_jobs_touch ON public.media_purge_jobs;
CREATE TRIGGER media_purge_jobs_touch
  BEFORE UPDATE ON public.media_purge_jobs
  FOR EACH ROW EXECUTE FUNCTION public._media_purge_touch();

-- ---------------------------------------------------------------------------
-- 5. Les RPC — la frontière où chaque entrée est revalidée
-- ---------------------------------------------------------------------------
--
-- La fonction edge valide déjà ses entrées. Ces fonctions les valident À
-- NOUVEAU, à la frontière de la base, pour qu'un refactor étourdi de la
-- fonction edge ne puisse pas élargir en silence ce qui atteint la table.
-- Accordées à `service_role` SEUL — jamais à `authenticated`.

-- 5.1 Créer (ou retrouver) le travail. PRÉALABLE OBLIGATOIRE à la suppression
--     Auth : si cet appel échoue, l'exécutant doit s'arrêter.
CREATE OR REPLACE FUNCTION public.create_media_purge_job(
  p_user_id      UUID,
  p_requested_by TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id manquant';
  END IF;
  IF p_requested_by IS NULL
     OR p_requested_by NOT IN ('mobile_cron', 'web_immediate', 'manual') THEN
    RAISE EXCEPTION 'requested_by invalide';
  END IF;

  -- Un travail ouvert existe déjà ? Le réutiliser. Rappeler ne doit jamais
  -- créer un doublon, sinon la reprise traite deux fois le même compte.
  SELECT j.id INTO v_id
    FROM public.media_purge_jobs j
   WHERE j.user_id = p_user_id AND j.status <> 'completed'
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.media_purge_jobs (user_id, requested_by, status)
  VALUES (p_user_id, p_requested_by, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5.2 Enregistrer le résultat d'une passe.
CREATE OR REPLACE FUNCTION public.record_media_purge_result(
  p_job_id       UUID,
  p_per_category JSONB,
  p_done         BOOLEAN,
  p_error_class  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'job_id manquant';
  END IF;
  IF NOT public._media_purge_shape_ok(COALESCE(p_per_category, '{}'::jsonb)) THEN
    -- Refuser plutôt que tronquer : un appelant qui tente d'écrire une chaîne
    -- ici essaie de ranger un chemin, volontairement ou non.
    RAISE EXCEPTION 'per_category de forme invalide : seules des metriques numeriques sont acceptees';
  END IF;
  IF p_error_class IS NOT NULL AND p_error_class NOT IN (
       'storage_unavailable', 'permission_denied', 'bucket_missing',
       'ambiguous_ownership', 'rate_limited', 'timeout', 'unknown') THEN
    RAISE EXCEPTION 'classe d erreur inconnue';
  END IF;

  UPDATE public.media_purge_jobs
     SET per_category     = COALESCE(p_per_category, '{}'::jsonb),
         status           = CASE WHEN p_done THEN 'completed' ELSE 'pending' END,
         completed_at     = CASE WHEN p_done THEN NOW() ELSE NULL END,
         last_error_class = p_error_class,
         claimed_at       = NULL
   WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'travail de purge introuvable';
  END IF;
END;
$$;

-- 5.3 Réclamer des travaux à reprendre.
--
-- `FOR UPDATE SKIP LOCKED` : deux passages concurrents ne prennent jamais la
-- même ligne. `claimed_at` borne la reprise d'un travail qu'une exécution
-- interrompue aurait laissé réclamé.
CREATE OR REPLACE FUNCTION public.claim_media_purge_jobs(
  p_limit          INTEGER DEFAULT 10,
  p_max_attempts   INTEGER DEFAULT 20,
  p_stale_seconds  INTEGER DEFAULT 900
)
RETURNS TABLE (job_id UUID, user_id UUID, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 100 THEN
    RAISE EXCEPTION 'limite invalide';
  END IF;

  RETURN QUERY
  WITH candidats AS (
    SELECT j.id
      FROM public.media_purge_jobs j
     WHERE j.status = 'pending'
       AND j.attempts < p_max_attempts
       AND (j.claimed_at IS NULL
            OR j.claimed_at < NOW() - make_interval(secs => p_stale_seconds))
     ORDER BY j.attempts, j.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.media_purge_jobs j
     SET attempts   = j.attempts + 1,
         claimed_at = NOW()
    FROM candidats c
   WHERE j.id = c.id
  RETURNING j.id, j.user_id, j.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_media_purge_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_media_purge_result(UUID, JSONB, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_media_purge_jobs(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_media_purge_job(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_media_purge_result(UUID, JSONB, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_media_purge_jobs(INTEGER, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- Auto-vérification : les deux moitiés — le défaut est absent ET le produit a
-- ce qu'il lui faut.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- (a) LA propriété qui fait tout tenir : aucune clé étrangère.
  SELECT count(*) INTO v_count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'media_purge_jobs'
     AND c.contype = 'f';
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'media_purge_jobs porte % cle(s) etrangere(s) : la ligne serait emportee par la cascade au moment ou elle devient utile', v_count;
  END IF;

  -- (b) Aucune colonne susceptible de porter un chemin.
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'media_purge_jobs'
     AND (column_name ~* '(path|file|name|url|key|object)'
          AND column_name NOT IN ('last_error_class'));
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'media_purge_jobs porte % colonne(s) pouvant contenir un chemin ou un nom de fichier', v_count;
  END IF;

  -- (c) RLS active, et aucune policy — deny-all.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'media_purge_jobs' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS n est pas active sur media_purge_jobs';
  END IF;
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'media_purge_jobs';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'media_purge_jobs porte % policy : deny-all attendu', v_count;
  END IF;

  -- (d) Aucun privilège pour un rôle client. PUBLIC n'est pas dans pg_authid,
  -- donc has_table_privilege('public', …) LÈVE : on passe par aclexplode et
  -- grantee = 0, qui est la façon dont PUBLIC est représenté.
  SELECT count(*) INTO v_count
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'media_purge_jobs'
     AND grantee IN ('anon', 'authenticated');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'media_purge_jobs accorde % privilege(s) a un role client', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
   WHERE n.nspname = 'public' AND c.relname = 'media_purge_jobs'
     AND a.grantee = 0;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'media_purge_jobs accorde % privilege(s) a PUBLIC', v_count;
  END IF;

  -- (e) …et le produit a bien ce qu'il lui faut.
  IF NOT has_table_privilege('service_role', 'public.media_purge_jobs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.media_purge_jobs', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.media_purge_jobs', 'SELECT') THEN
    RAISE EXCEPTION 'service_role ne peut pas ecrire dans media_purge_jobs : la purge ne pourrait pas fonctionner';
  END IF;

  FOR v_count IN
    SELECT 1 FROM (VALUES
      ('public.create_media_purge_job(uuid, text)'),
      ('public.record_media_purge_result(uuid, jsonb, boolean, text)'),
      ('public.claim_media_purge_jobs(integer, integer, integer)')
    ) AS f(sig)
    WHERE to_regprocedure(f.sig) IS NULL
  LOOP
    RAISE EXCEPTION 'une RPC de purge attendue est absente';
  END LOOP;

  IF has_function_privilege('anon', 'public.create_media_purge_job(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_media_purge_job(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_media_purge_jobs(integer, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'une RPC de purge est appelable par un role client';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.create_media_purge_job(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role ne peut pas creer un travail de purge';
  END IF;

  -- (f) La contrainte de forme refuse bien une chaîne — donc un chemin.
  BEGIN
    PERFORM 1 WHERE public._media_purge_shape_ok('{"avatars":{"found":"a/b.jpg"}}'::jsonb);
    IF public._media_purge_shape_ok('{"avatars":{"found":"a/b.jpg"}}'::jsonb) THEN
      RAISE EXCEPTION 'la contrainte de forme accepte une chaine : un chemin pourrait etre stocke';
    END IF;
  END;
  IF NOT public._media_purge_shape_ok('{"avatars":{"found":3,"deleted":3,"failed":0,"done":true}}'::jsonb) THEN
    RAISE EXCEPTION 'la contrainte de forme refuse une valeur legitime';
  END IF;
  IF public._media_purge_shape_ok('{"autre-bucket":{"found":1}}'::jsonb) THEN
    RAISE EXCEPTION 'la contrainte de forme accepte un bucket hors liste blanche';
  END IF;

  RAISE NOTICE 'media_purge_jobs en place : aucune FK, deny-all, service_role seul, forme contrainte.';
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
--   supabase/tests/diagnose_media_purge_jobs.sql
--
-- Cette migration ne supprime RIEN et ne purge rien. Elle crée l'état durable
-- que la fonction edge `purge-user-media` utilisera. Le rattrapage des cinq
-- orphelins historiques est un livrable séparé, non exécutable sans validation
-- humaine du rapport — voir docs/runbooks/media-purge-2026-09.md §8.
--
-- RETOUR ARRIÈRE
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.media_purge_jobs;
--   DROP FUNCTION IF EXISTS public.create_media_purge_job(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.record_media_purge_result(UUID, JSONB, BOOLEAN, TEXT);
--   DROP FUNCTION IF EXISTS public.claim_media_purge_jobs(INTEGER, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public._media_purge_touch();
--   DROP FUNCTION IF EXISTS public._media_purge_shape_ok(JSONB);
--
-- Aucune donnée utilisateur n'est perdue par ce retour arrière : la table ne
-- contient que des compteurs de reprise. Mais les travaux non terminés le sont,
-- et les objets correspondants redeviennent des orphelins non suivis. Exporter
-- `SELECT user_id FROM media_purge_jobs WHERE status <> 'completed'` avant.
