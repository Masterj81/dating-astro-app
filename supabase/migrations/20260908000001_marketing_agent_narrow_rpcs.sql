-- =============================================================================
-- JUNO-04 — donner à marketingagent une surface étroite, pour lui retirer la
-- clé service_role
-- =============================================================================
--
-- LE CONSTAT, ET CE QU'IL EST VRAIMENT
-- ------------------------------------
-- `marketingagent/.env` contient `SUPABASE_SERVICE_ROLE_KEY`, un JWT valide
-- jusqu'en 2036. Vérifié le 8 septembre 2026 : ce fichier n'a JAMAIS été suivi
-- par git (0 ajout sur toutes les refs), il est couvert par `.gitignore:34`,
-- aucun fichier suivi ne contient de JWT, aucun workflow CI ne reçoit la
-- variable, et aucun code de marketingagent n'imprime `process.env`.
--
-- Il n'y a donc AUCUNE exposition démontrée. Le constat n'est pas « la clé a
-- fuité », c'est « un processus local détient un privilège administratif
-- général sur la base de production ». Ce sont deux problèmes différents et un
-- seul se corrige par une rotation : remplacer une clé omnipotente par une
-- autre clé omnipotente ne change rien au privilège.
--
-- CE QUE MARKETINGAGENT FAIT RÉELLEMENT
-- -------------------------------------
-- Inventaire exhaustif, lu dans le dépôt (cloud-scheduler.ts, upload-image.ts) :
--
--   1. téléverser une image marketing dans le stockage ;
--   2. insérer une ligne dans `marketing_posts` ;
--   3. lister la file (30 lignes, tri par `scheduled_for`) ;
--   4. relire le statut de N lignes par id.
--
-- Quatre opérations. La clé qu'il détient lui donne en plus : la lecture de
-- `profiles` entière (toutes les PII, toutes les données de naissance), de
-- `messages`, l'API d'administration `auth.users`, et l'écriture sur tout.
--
-- CE QUE FAIT CE FICHIER
-- ----------------------
-- Trois fonctions, une par opération de base, qui valident leurs entrées et
-- n'acceptent ni SQL, ni nom de table, ni nom de colonne, ni opérateur
-- dynamique. Elles ne sont exécutables que par `service_role`, c'est-à-dire par
-- la fonction edge `marketing-agent` — jamais par `anon`, jamais par
-- `authenticated`, jamais par PUBLIC.
--
-- La clé service_role ne disparaît pas : elle DÉMÉNAGE. Elle passe du poste de
-- travail au magasin de secrets de Supabase, où elle vit déjà pour quinze
-- autres fonctions. Le poste ne détient plus qu'un jeton (`MARKETING_AGENT_TOKEN`)
-- qui ne sait faire que ces quatre choses.
--
-- POURQUOI DES RPC ALORS QUE service_role IGNORE DÉJÀ RLS
-- ------------------------------------------------------
-- Honnêtement : ces fonctions n'empêchent pas la fonction edge de faire autre
-- chose, puisqu'elle détient la clé. Leur valeur est ailleurs, et elle est
-- réelle :
--
--   * la surface base du chemin marketing devient lisible en SQL, en entier,
--     sans lire du TypeScript ;
--   * la validation des entrées vit à la frontière de la base, donc un futur
--     remaniement de la fonction edge ne peut pas la contourner par distraction ;
--   * si l'on veut un jour retirer service_role de la fonction edge elle-même
--     (un rôle Postgres dédié, un compte de service), les GRANT sont déjà le
--     point d'application.
--
-- IDEMPOTENT : CREATE OR REPLACE, INSERT ... ON CONFLICT DO NOTHING, GRANT et
-- REVOKE restatés. Rejouable sans effet de bord.
--
-- À APPLIQUER dans l'éditeur SQL, puis relancer
-- supabase/tests/verify_20260908_marketing_least_privilege.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Le bucket des images marketing, déclaré ici pour la première fois
-- ---------------------------------------------------------------------------
--
-- `marketing-images` existe en production depuis au moins avril 2026 —
-- `20260416000001_drop_public_bucket_listing_policies.sql` retire une de ses
-- politiques — mais AUCUNE migration ne le crée. C'est exactement la dérive que
-- décrit JUNO-15 : l'historique ne décrit pas la base. Cette ligne le déclare,
-- sans rien changer s'il est déjà là.
--
-- `public = true` est délibéré et nécessaire : Blotato, puis Facebook et
-- Instagram, récupèrent l'image par URL, sans jeton. La politique de LISTAGE a
-- été retirée en avril et ne revient pas — on peut lire une image dont on
-- connaît l'URL, on ne peut pas énumérer le bucket.
--
-- Le contenu est du matériel promotionnel destiné à la publication. Aucune
-- donnée personnelle n'y entre. C'est aussi pourquoi il ne partage plus le
-- bucket `avatars` avec les photos de profil, ce que faisait cloud-scheduler.ts.
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-images', 'marketing-images', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Programmer une publication
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_agent_schedule_post(
  p_text          TEXT,
  p_topic         TEXT,
  p_ai_score      INTEGER,
  p_platforms     TEXT[],
  p_scheduled_for TIMESTAMPTZ,
  p_image_url     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Liste blanche. Un tableau `platforms` arbitraire finirait dans
  -- publish-scheduled-posts, qui le passe à Blotato.
  c_platforms CONSTANT TEXT[] := ARRAY[
    'facebook', 'instagram', 'threads', 'tiktok', 'twitter', 'linkedin'
  ];
  v_id UUID;
BEGIN
  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RAISE EXCEPTION 'text_required' USING ERRCODE = '22023';
  END IF;
  IF length(p_text) > 5000 THEN
    RAISE EXCEPTION 'text_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_topic IS NOT NULL AND length(p_topic) > 200 THEN
    RAISE EXCEPTION 'topic_too_long' USING ERRCODE = '22023';
  END IF;
  IF p_ai_score IS NOT NULL AND (p_ai_score < 0 OR p_ai_score > 100) THEN
    RAISE EXCEPTION 'ai_score_out_of_range' USING ERRCODE = '22023';
  END IF;

  IF p_platforms IS NULL OR cardinality(p_platforms) = 0 THEN
    RAISE EXCEPTION 'platforms_required' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_platforms) > cardinality(c_platforms) THEN
    RAISE EXCEPTION 'too_many_platforms' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_platforms) AS candidate
     WHERE candidate IS NULL OR NOT (candidate = ANY (c_platforms))
  ) THEN
    RAISE EXCEPTION 'unknown_platform' USING ERRCODE = '22023';
  END IF;

  IF p_scheduled_for IS NULL THEN
    RAISE EXCEPTION 'scheduled_for_required' USING ERRCODE = '22023';
  END IF;
  -- Une date absurde est une erreur d'appel, pas une intention. La borne basse
  -- tolère une journée : le planificateur local et la base peuvent diverger, et
  -- une publication rétroactive de quelques heures est un cas normal.
  IF p_scheduled_for < now() - INTERVAL '1 day'
     OR p_scheduled_for > now() + INTERVAL '1 year' THEN
    RAISE EXCEPTION 'scheduled_for_out_of_range' USING ERRCODE = '22023';
  END IF;

  -- L'URL d'image doit désigner un objet public de CE bucket. Sans cette
  -- contrainte, la colonne accepterait `javascript:`, `data:` ou l'URL d'un
  -- tiers — et `image_url` est repris tel quel par publish-scheduled-posts.
  IF p_image_url IS NOT NULL AND p_image_url !~
     '^https://[A-Za-z0-9._-]+/storage/v1/object/public/marketing-images/[A-Za-z0-9/_.-]+$' THEN
    RAISE EXCEPTION 'image_url_not_in_marketing_bucket' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.marketing_posts
    (text, topic, ai_score, platforms, status, scheduled_for, image_url)
  VALUES
    (p_text, p_topic, COALESCE(p_ai_score, 0), p_platforms, 'scheduled',
     p_scheduled_for, p_image_url)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lister la file
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_agent_list_queue(
  p_limit  INTEGER DEFAULT 30,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  text            TEXT,
  topic           TEXT,
  status          TEXT,
  scheduled_for   TIMESTAMPTZ,
  posted_at       TIMESTAMPTZ,
  blotato_post_id TEXT,
  error           TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('scheduled', 'posted', 'failed') THEN
    RAISE EXCEPTION 'unknown_status' USING ERRCODE = '22023';
  END IF;

  -- Borné, jamais interpolé. Le tri et les colonnes sont fixes : il n'y a pas
  -- de paramètre qui puisse désigner une colonne ou un opérateur.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);

  RETURN QUERY
  SELECT
    p.id, p.text, p.topic, p.status, p.scheduled_for, p.posted_at,
    p.blotato_post_id, p.error, p.image_url, p.created_at
  FROM public.marketing_posts p
  WHERE p_status IS NULL OR p.status = p_status
  ORDER BY p.scheduled_for DESC
  LIMIT v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Relire le statut de publications connues
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketing_agent_post_statuses(p_ids UUID[])
RETURNS TABLE (
  id              UUID,
  status          TEXT,
  posted_at       TIMESTAMPTZ,
  blotato_post_id TEXT,
  error           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_ids) > 200 THEN
    RAISE EXCEPTION 'too_many_ids' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.id, p.status, p.posted_at, p.blotato_post_id, p.error
  FROM public.marketing_posts p
  WHERE p.id = ANY (p_ids);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privilèges : service_role et personne d'autre
-- ---------------------------------------------------------------------------
--
-- `authenticated` est explicitement exclu. Un compte JUNO ordinaire n'a aucune
-- raison de lire la file marketing, et le défaut de ce projet est de ne pas
-- exposer une RPC à `authenticated` — voir supabase/SECURITY.md.
REVOKE EXECUTE ON FUNCTION public.marketing_agent_schedule_post(TEXT, TEXT, INTEGER, TEXT[], TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marketing_agent_list_queue(INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marketing_agent_post_statuses(UUID[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.marketing_agent_schedule_post(TEXT, TEXT, INTEGER, TEXT[], TIMESTAMPTZ, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_agent_list_queue(INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_agent_post_statuses(UUID[])
  TO service_role;

COMMENT ON FUNCTION public.marketing_agent_schedule_post IS
  'JUNO-04. Narrow write surface for the marketing agent: one INSERT into marketing_posts, with every input validated here rather than only in the caller. Reachable only through the `marketing-agent` edge function (service_role). image_url must name an object in the public marketing-images bucket — publish-scheduled-posts passes that value straight to Blotato.';
COMMENT ON FUNCTION public.marketing_agent_list_queue IS
  'JUNO-04. Narrow read surface for the marketing agent. Fixed columns, fixed ordering, bounded limit, allowlisted status. No parameter can name a column or an operator.';
COMMENT ON FUNCTION public.marketing_agent_post_statuses IS
  'JUNO-04. Status read-back for posts the agent already knows the ids of. Bounded at 200 ids.';

-- ---------------------------------------------------------------------------
-- Auto-vérification : échouer plutôt que d'annoncer un succès.
-- ---------------------------------------------------------------------------
--
-- PostgreSQL émet `WARNING: no privileges could be revoked` et VALIDE quand
-- même — c'est ainsi que 20260903000002 a « réussi » sans rien fermer. Toute
-- migration de privilège de cette vague vérifie donc ses deux moitiés : le
-- privilège est bien retiré, ET le produit a bien ce qu'il lui faut.
DO $$
DECLARE
  v_sig    TEXT;
  v_role   TEXT;
  v_def    TEXT;
  v_oid    OID;
  v_acl    ACLITEM[];
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.marketing_agent_schedule_post(text,text,integer,text[],timestamptz,text)',
    'public.marketing_agent_list_queue(integer,text)',
    'public.marketing_agent_post_statuses(uuid[])'
  ] LOOP
    -- Elle existe.
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION '% n''existe pas', v_sig;
    END IF;
    v_oid := to_regprocedure(v_sig)::oid;

    -- Aucun rôle client nommé ne peut l'appeler.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_sig, 'EXECUTE') THEN
        RAISE EXCEPTION '% est appelable par %', v_sig, v_role;
      END IF;
    END LOOP;

    -- Et PUBLIC non plus.
    --
    -- PAS has_function_privilege('public', …) : PUBLIC n'est pas une ligne de
    -- pg_authid, donc cet appel lève « role "public" does not exist » et fait
    -- échouer la migration au lieu de la vérifier. Le pseudo-rôle porte l'OID 0
    -- dans l'ACL, et une ACL NULL signifie « privilèges par défaut », c'est-à-dire
    -- EXECUTE accordé à PUBLIC — le cas exact que le REVOKE ci-dessus supprime.
    SELECT p.proacl INTO v_acl FROM pg_proc p WHERE p.oid = v_oid;
    IF v_acl IS NULL THEN
      RAISE EXCEPTION '% garde les privileges par defaut : PUBLIC peut l''appeler', v_sig;
    END IF;
    IF EXISTS (
      SELECT 1 FROM aclexplode(v_acl) a
       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION '% est appelable par PUBLIC', v_sig;
    END IF;

    -- La fonction edge, elle, doit pouvoir l'appeler.
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role ne peut pas appeler % — la fonction edge serait cassee', v_sig;
    END IF;

    -- search_path épinglé, sinon un schéma injecté redéfinit les objets.
    -- Lu dans proconfig plutôt que dans le texte de la définition : c'est la
    -- forme que la vérification de la vague 1 a exécutée sur la production.
    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p, unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS c
       WHERE p.oid = v_oid AND c LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION '% n''epingle pas search_path', v_sig;
    END IF;

    SELECT pg_get_functiondef(v_oid) INTO v_def;

    -- Aucun SQL dynamique. Une seule occurrence d'EXECUTE suffirait à rendre
    -- la liste blanche décorative.
    IF v_def ~* '\mEXECUTE\M\s+(format|''|"|\$)' THEN
      RAISE EXCEPTION '% construit du SQL dynamique', v_sig;
    END IF;
  END LOOP;

  -- Le bucket est déclaré et lisible publiquement : sans cela, Blotato,
  -- Facebook et Instagram ne peuvent pas récupérer l'image.
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'marketing-images' AND public
  ) THEN
    RAISE EXCEPTION 'le bucket marketing-images est absent ou prive : les images ne se publieraient pas';
  END IF;

  -- Et la table cible est toujours fermée à l'accès direct.
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'marketing_posts' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS n''est plus active sur marketing_posts';
  END IF;

  RAISE NOTICE 'Surface marketing etroite en place : 3 RPC, service_role uniquement.';
END
$$;

commit;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
-- 1. Déployer la fonction edge `marketing-agent`.
-- 2. `supabase secrets set MARKETING_AGENT_TOKEN=<valeur générée localement>`.
-- 3. Mettre la même valeur dans `marketingagent/.env`, puis RETIRER
--    `SUPABASE_SERVICE_ROLE_KEY` de ce fichier.
-- 4. Vérifier les quatre opérations : `npm run cloud-list`, une programmation,
--    une synchronisation, un téléversement d'image.
-- 5. Relancer supabase/tests/verify_20260908_marketing_least_privilege.sql.
--
-- La procédure complète, y compris ce qu'il faut vérifier entre chaque étape,
-- est dans docs/runbooks/service-role-least-privilege-2026-09.md.
--
-- ROLLBACK : les trois fonctions peuvent être supprimées sans effet sur le
-- produit tant que marketingagent utilise encore la clé service_role. Le point
-- de non-retour est l'étape 3.
