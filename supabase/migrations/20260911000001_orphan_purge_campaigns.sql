-- =============================================================================
-- JUNO-09 phase C — le registre des campagnes de rattrapage
-- =============================================================================
--
-- POURQUOI UNE TABLE DISTINCTE DE `media_purge_jobs`
-- ---------------------------------------------------------------------------
-- `media_purge_jobs` est conçue pour des comptes dont la propriété du média
-- était connue AVANT la suppression : l'exécutant crée la ligne, puis supprime.
-- Y fabriquer des travaux historiques inventerait une provenance que personne
-- n'a — le compte est parti depuis des mois, et rien n'a jamais enregistré ce
-- qu'il possédait.
--
-- Cette table enregistre donc des CAMPAGNES, pas des comptes. Une campagne est
-- un manifeste, ses compteurs, ses empreintes et son résultat.
--
-- CE QU'ELLE NE CONTIENT JAMAIS
-- ---------------------------------------------------------------------------
-- Aucun chemin, aucun nom de fichier, aucune URL, aucun UUID de compte, **et
-- aucun identifiant d'objet**. Les identifiants d'objets vivent uniquement dans
-- le manifeste local, qui est gitignoré et détruit après la campagne.
--
-- Ce qui reste ici est ce qui doit survivre : combien d'objets, dans quels
-- buckets, sous quelle empreinte, avec quel résultat. C'est suffisant pour
-- prouver ce qui a été fait, et insuffisant pour reconstituer ce qui a été
-- supprimé — ce qui est exactement le bon dosage pour une trace de suppression.
--
-- `last_error_class` porte une CLASSE prise dans une énumération fermée, jamais
-- un message : un message d'erreur de stockage contient le chemin qui a échoué,
-- et la contrainte CHECK est ce qui rend son écriture IMPOSSIBLE plutôt que
-- déconseillée.
--
-- LE PLAFOND EST DANS LA BASE, ET LE RELEVER DEMANDE UNE MIGRATION
-- ---------------------------------------------------------------------------
-- `volume_cap` est contraint à l'intervalle [1, 5]. La première campagne en
-- attend exactement 5. Une campagne future plus large exigera donc une migration
-- explicite — c'est une friction voulue : un plafond que le code peut relever
-- seul n'est pas un plafond.
--
-- IDEMPOTENT : IF NOT EXISTS partout, CREATE OR REPLACE pour les fonctions.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. La forme des compteurs, vérifiable par contrainte
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._orphan_counts_ok(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_value IS NOT NULL
     AND jsonb_typeof(p_value) = 'object'
     -- Trois clés, exactement.
     AND (SELECT count(*) FROM jsonb_object_keys(p_value)) = 3
     AND p_value ? 'objects' AND p_value ? 'byBucket' AND p_value ? 'byCategory'
     AND jsonb_typeof(p_value -> 'objects') = 'number'
     AND jsonb_typeof(p_value -> 'byBucket') = 'object'
     AND jsonb_typeof(p_value -> 'byCategory') = 'object'
     -- Les buckets sont ceux de la liste blanche, et rien d'autre.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_value -> 'byBucket') AS k(bucket)
        WHERE k.bucket NOT IN ('avatars', 'voice-intros', 'verifications')
     )
     -- Les catégories sont les quatre classes de la phase A.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_value -> 'byCategory') AS k(cat)
        WHERE k.cat NOT IN ('orphan_proven', 'auth_owner_exists',
                            'ambiguous_ownership', 'unknown_path_shape')
     )
     -- Et toutes les valeurs sont numériques. JAMAIS une chaîne : c'est cette
     -- ligne qui rend un chemin instockable ici.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_value -> 'byBucket') AS e(k, v)
        WHERE jsonb_typeof(e.v) <> 'number'
     )
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p_value -> 'byCategory') AS e(k, v)
        WHERE jsonb_typeof(e.v) <> 'number'
     );
$$;

COMMENT ON FUNCTION public._orphan_counts_ok IS
  'JUNO-09 phase C. Valide la forme des compteurs de campagne : trois cles, buckets et categories de la liste blanche, valeurs numeriques uniquement. Interdit structurellement le stockage d un chemin.';

-- ---------------------------------------------------------------------------
-- 2. La table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orphan_purge_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiant lisible : date + 6 hexadécimaux. Unique, donc une campagne ne
  -- peut pas être enregistrée deux fois sous deux résultats différents.
  campaign_id   TEXT        NOT NULL UNIQUE
                CHECK (campaign_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{6}$'),

  project_ref   TEXT        NOT NULL CHECK (project_ref ~ '^[a-z]{20}$'),
  tool_version  TEXT        NOT NULL CHECK (tool_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),

  -- Empreintes en hexadécimal minuscule, longueur fixe. Une empreinte tronquée
  -- ou majuscule est refusée : c'est ce qui empêche un « à peu près ».
  manifest_hash TEXT        NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  approval_hash TEXT        CHECK (approval_hash IS NULL OR approval_hash ~ '^[0-9a-f]{64}$'),

  counts        JSONB       NOT NULL CHECK (public._orphan_counts_ok(counts)),

  -- Le plafond de la campagne. [1, 5] : relever au-delà exige une migration.
  volume_cap    INTEGER     NOT NULL CHECK (volume_cap BETWEEN 1 AND 5),

  status        TEXT        NOT NULL DEFAULT 'discovered'
                CHECK (status IN ('discovered', 'approved', 'executed', 'aborted')),

  auth_users_at_discovery INTEGER NOT NULL CHECK (auth_users_at_discovery >= 0),

  deleted        INTEGER    NOT NULL DEFAULT 0 CHECK (deleted >= 0),
  already_absent INTEGER    NOT NULL DEFAULT 0 CHECK (already_absent >= 0),
  failed         INTEGER    NOT NULL DEFAULT 0 CHECK (failed >= 0),

  last_error_class TEXT
                CHECK (last_error_class IS NULL OR last_error_class IN (
                  'auth_owner_exists', 'ambiguous_ownership', 'unknown_path_shape',
                  'storage_unavailable', 'permission_denied', 'timeout',
                  'manifest_mismatch', 'approval_mismatch', 'volume_limit_exceeded',
                  'unknown'
                )),

  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  executed_at   TIMESTAMPTZ,

  -- Un état approuvé porte une date et une empreinte d'approbation ; un état
  -- exécuté porte une date d'exécution. Sans ces deux contraintes, le registre
  -- pourrait affirmer « exécuté » sans jamais avoir été approuvé.
  CONSTRAINT orphan_campaign_approved_coherent
    CHECK ((approved_at IS NOT NULL) = (approval_hash IS NOT NULL)),
  CONSTRAINT orphan_campaign_executed_coherent
    CHECK ((status = 'executed') = (executed_at IS NOT NULL)),
  CONSTRAINT orphan_campaign_executed_needs_approval
    CHECK (status <> 'executed' OR approval_hash IS NOT NULL),

  -- Le résultat ne peut pas dépasser ce qui a été approuvé.
  CONSTRAINT orphan_campaign_result_within_cap
    CHECK (deleted + already_absent + failed <= volume_cap)
);

COMMENT ON TABLE public.orphan_purge_campaigns IS
  'JUNO-09 phase C. Registre des campagnes de rattrapage des medias orphelins historiques. Ne contient AUCUN chemin, nom de fichier, URL, UUID de compte ni identifiant d objet : compteurs, empreintes et resultat uniquement.';

CREATE INDEX IF NOT EXISTS ix_orphan_purge_campaigns_status
  ON public.orphan_purge_campaigns (status, discovered_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Privilèges — fermés, et vérifiés
-- ---------------------------------------------------------------------------
ALTER TABLE public.orphan_purge_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orphan_purge_campaigns FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.orphan_purge_campaigns FROM PUBLIC;
REVOKE ALL ON public.orphan_purge_campaigns FROM anon;
REVOKE ALL ON public.orphan_purge_campaigns FROM authenticated;

-- Et de `service_role` AUSSI. Les privilèges par défaut de Supabase
-- (`ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
-- service_role`) lui donnent TOUT à la création de la table, DELETE et TRUNCATE
-- compris. Un GRANT qui en liste trois n'en retire aucun : il s'ajoute.
--
-- Première application, 11 septembre 2026 : sans cette ligne, l'auto-vérification
-- (c) a refusé de valider et la transaction a été annulée. C'est exactement son
-- rôle. Révoquer d'abord, accorder ensuite — pour `service_role` comme pour les
-- rôles clients.
REVOKE ALL ON public.orphan_purge_campaigns FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.orphan_purge_campaigns TO service_role;
-- Ni DELETE ni TRUNCATE : une campagne enregistrée ne s'efface pas. C'est la
-- trace. (Le rôle `postgres` de l'éditeur SQL, propriétaire de la table, le peut
-- toujours : ce garde borne l'outillage applicatif, pas l'administrateur.)

REVOKE EXECUTE ON FUNCTION public._orphan_counts_ok(JSONB) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les trois RPC — une par porte, chacune revalide sa propre étape
-- ---------------------------------------------------------------------------

-- 4.1 Porte A/B — enregistrer la découverte et l'empreinte du manifeste.
CREATE OR REPLACE FUNCTION public.record_orphan_discovery(
  p_campaign_id   TEXT,
  p_project_ref   TEXT,
  p_tool_version  TEXT,
  p_manifest_hash TEXT,
  p_counts        JSONB,
  p_volume_cap    INTEGER,
  p_auth_users    INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_volume_cap IS NULL OR p_volume_cap < 1 OR p_volume_cap > 5 THEN
    RAISE EXCEPTION 'plafond de volume invalide : attendu entre 1 et 5';
  END IF;
  IF (p_counts ->> 'objects')::int > p_volume_cap THEN
    RAISE EXCEPTION 'la decouverte depasse le plafond declare';
  END IF;

  INSERT INTO public.orphan_purge_campaigns (
    campaign_id, project_ref, tool_version, manifest_hash,
    counts, volume_cap, auth_users_at_discovery, status
  ) VALUES (
    p_campaign_id, p_project_ref, p_tool_version, p_manifest_hash,
    p_counts, p_volume_cap, p_auth_users, 'discovered'
  )
  ON CONFLICT (campaign_id) DO UPDATE
     SET manifest_hash = EXCLUDED.manifest_hash,
         counts        = EXCLUDED.counts,
         volume_cap    = EXCLUDED.volume_cap,
         auth_users_at_discovery = EXCLUDED.auth_users_at_discovery,
         discovered_at = NOW()
   -- Une campagne déjà exécutée n'est jamais réécrite : la trace est finale.
   WHERE public.orphan_purge_campaigns.status <> 'executed';
END;
$$;

-- 4.2 Porte C — enregistrer l'approbation.
--
-- Elle EXIGE que l'empreinte du manifeste soit celle vue à la découverte. C'est
-- un quatrième contrôle indépendant : même si le manifeste local et l'artefact
-- d'approbation étaient tous deux retouchés de façon cohérente, la base refuse.
CREATE OR REPLACE FUNCTION public.record_orphan_approval(
  p_campaign_id   TEXT,
  p_manifest_hash TEXT,
  p_approval_hash TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_known TEXT;
  v_status TEXT;
BEGIN
  SELECT manifest_hash, status INTO v_known, v_status
    FROM public.orphan_purge_campaigns WHERE campaign_id = p_campaign_id;

  IF v_known IS NULL THEN
    RAISE EXCEPTION 'campagne inconnue : la decouverte doit preceder l approbation';
  END IF;
  IF v_status = 'executed' THEN
    RAISE EXCEPTION 'campagne deja executee : elle ne peut pas etre re-approuvee';
  END IF;
  IF v_known <> p_manifest_hash THEN
    RAISE EXCEPTION
      'empreinte du manifeste differente de celle enregistree a la decouverte : approbation refusee';
  END IF;

  UPDATE public.orphan_purge_campaigns
     SET approval_hash = p_approval_hash,
         approved_at   = NOW(),
         status        = 'approved'
   WHERE campaign_id = p_campaign_id;
END;
$$;

-- 4.3 Porte D — enregistrer le résultat.
CREATE OR REPLACE FUNCTION public.record_orphan_execution(
  p_campaign_id    TEXT,
  p_manifest_hash  TEXT,
  p_approval_hash  TEXT,
  p_deleted        INTEGER,
  p_already_absent INTEGER,
  p_failed         INTEGER,
  p_error_class    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.orphan_purge_campaigns;
BEGIN
  SELECT * INTO v_row FROM public.orphan_purge_campaigns
   WHERE campaign_id = p_campaign_id;

  IF v_row.campaign_id IS NULL THEN
    RAISE EXCEPTION 'campagne inconnue';
  END IF;
  IF v_row.status <> 'approved' THEN
    RAISE EXCEPTION 'campagne non approuvee (statut : %) : execution refusee', v_row.status;
  END IF;
  IF v_row.manifest_hash <> p_manifest_hash THEN
    RAISE EXCEPTION 'empreinte du manifeste differente : execution refusee';
  END IF;
  IF v_row.approval_hash <> p_approval_hash THEN
    RAISE EXCEPTION 'empreinte d approbation differente : execution refusee';
  END IF;
  IF COALESCE(p_deleted, 0) + COALESCE(p_already_absent, 0) + COALESCE(p_failed, 0)
       > v_row.volume_cap THEN
    RAISE EXCEPTION 'le resultat depasse le plafond de la campagne';
  END IF;

  UPDATE public.orphan_purge_campaigns
     SET deleted          = COALESCE(p_deleted, 0),
         already_absent   = COALESCE(p_already_absent, 0),
         failed           = COALESCE(p_failed, 0),
         last_error_class = p_error_class,
         status           = 'executed',
         executed_at      = NOW()
   WHERE campaign_id = p_campaign_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_orphan_discovery(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_orphan_approval(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_orphan_execution(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_orphan_discovery(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_orphan_approval(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_orphan_execution(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Les trois lectures — parce que `storage` et `auth` NE SONT PAS exposés
-- ---------------------------------------------------------------------------
--
-- `config.toml:13` expose `public` et `graphql_public`, et rien d'autre. Une
-- fonction edge ne peut donc pas lire `storage.objects` ni `auth.users` par
-- PostgREST : elle passe par ces trois RPC.
--
-- Ce détour n'est pas un pis-aller. Il place la lecture derrière une frontière
-- où elle est bornée : `orphan_scan_objects` ne rend QUE les trois buckets de la
-- liste blanche, et `auth_users_present` ne rend QUE les identifiants demandés —
-- elle ne peut pas servir à énumérer les comptes.
--
-- Elles rendent des chemins, ce qui est nécessaire : la fonction edge doit
-- classer, puis supprimer par chemin. Ces chemins ne quittent jamais la fonction
-- — ni vers une réponse, ni vers un journal, ni vers le manifeste. Le validateur
-- statique l'assert.

CREATE OR REPLACE FUNCTION public.orphan_scan_objects()
RETURNS TABLE (
  object_id  UUID,
  bucket     TEXT,
  path       TEXT,
  created_at TIMESTAMPTZ,
  size_bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT o.id,
         o.bucket_id,
         o.name,
         o.created_at,
         COALESCE((o.metadata ->> 'size')::bigint, 0)
    FROM storage.objects o
   -- Liste blanche en dur. Un bucket passé en paramètre serait un bucket qui
   -- peut grandir par accident.
   WHERE o.bucket_id IN ('avatars', 'voice-intros', 'verifications');
$$;

CREATE OR REPLACE FUNCTION public.orphan_lookup_objects(p_ids UUID[])
RETURNS TABLE (
  object_id  UUID,
  bucket     TEXT,
  path       TEXT,
  created_at TIMESTAMPTZ,
  size_bytes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT o.id,
         o.bucket_id,
         o.name,
         o.created_at,
         COALESCE((o.metadata ->> 'size')::bigint, 0)
    FROM storage.objects o
   WHERE o.bucket_id IN ('avatars', 'voice-intros', 'verifications')
     AND o.id = ANY(COALESCE(p_ids, ARRAY[]::UUID[]))
     -- Au plus le plafond de la campagne : un tableau de mille identifiants ne
     -- doit pas pouvoir servir de primitive de lecture en masse.
     AND array_length(p_ids, 1) <= 5;
$$;

-- Rend UNIQUEMENT ceux des identifiants demandés qui existent. Ne peut pas
-- énumérer auth.users : sans liste d'entrée, elle ne rend rien.
CREATE OR REPLACE FUNCTION public.auth_users_present(p_ids UUID[])
RETURNS TABLE (user_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT u.id FROM auth.users u
   WHERE u.id = ANY(COALESCE(p_ids, ARRAY[]::UUID[]));
$$;

CREATE OR REPLACE FUNCTION public.auth_users_total()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::int FROM auth.users;
$$;

REVOKE EXECUTE ON FUNCTION public.orphan_scan_objects() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orphan_lookup_objects(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_users_present(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_users_total() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.orphan_scan_objects() TO service_role;
GRANT EXECUTE ON FUNCTION public.orphan_lookup_objects(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_users_present(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_users_total() TO service_role;

COMMENT ON FUNCTION public.orphan_scan_objects IS
  'JUNO-09 phase C. Lecture seule des trois buckets de medias utilisateur. Liste blanche en dur, aucun parametre.';
COMMENT ON FUNCTION public.auth_users_present IS
  'JUNO-09 phase C. Rend uniquement ceux des identifiants demandes qui existent dans auth.users. Ne peut pas enumerer les comptes : sans liste d entree elle ne rend rien.';

-- ---------------------------------------------------------------------------
-- Auto-vérification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
  v_priv  TEXT;
BEGIN
  -- (a) aucune colonne susceptible de porter un chemin ou un identifiant d'objet
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'orphan_purge_campaigns'
     AND column_name ~* '(path|file|url|object|owner|email)';
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'orphan_purge_campaigns porte % colonne(s) pouvant contenir un chemin ou un identifiant', v_count;
  END IF;

  -- (b) deny-all
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'orphan_purge_campaigns' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS n est pas active sur orphan_purge_campaigns';
  END IF;
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'orphan_purge_campaigns';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'orphan_purge_campaigns porte % policy : deny-all attendu', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'orphan_purge_campaigns'
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'orphan_purge_campaigns accorde % privilege(s) a un role client', v_count;
  END IF;

  -- (c) la trace ne s'efface pas — ni ligne à ligne (DELETE), ni d'un bloc
  -- (TRUNCATE). Exactement SELECT, INSERT, UPDATE, et rien d'autre : c'est ce
  -- contrôle qui a refusé la première application, parce que le GRANT étroit
  -- s'ajoutait au ALL par défaut au lieu de le remplacer.
  FOREACH v_priv IN ARRAY ARRAY['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('service_role', 'public.orphan_purge_campaigns', v_priv) THEN
      RAISE EXCEPTION
        'service_role detient % sur orphan_purge_campaigns : la trace ne serait pas une trace', v_priv;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.orphan_purge_campaigns', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.orphan_purge_campaigns', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role ne peut pas enregistrer une campagne';
  END IF;

  -- (d) les trois RPC existent et sont fermées aux rôles clients
  FOR v_count IN
    SELECT 1 FROM (VALUES
      ('public.record_orphan_discovery(text, text, text, text, jsonb, integer, integer)'),
      ('public.record_orphan_approval(text, text, text)'),
      ('public.record_orphan_execution(text, text, text, integer, integer, integer, text)')
    ) AS f(sig)
    WHERE to_regprocedure(f.sig) IS NULL
  LOOP
    RAISE EXCEPTION 'une RPC de campagne attendue est absente';
  END LOOP;

  IF has_function_privilege('authenticated', 'public.record_orphan_execution(text, text, text, integer, integer, integer, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_orphan_discovery(text, text, text, text, jsonb, integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'une RPC de campagne est appelable par un role client';
  END IF;

  -- (e) la contrainte de forme refuse une chaîne — donc un chemin
  IF public._orphan_counts_ok(
       '{"objects":5,"byBucket":{"avatars":"a/b.jpg"},"byCategory":{"orphan_proven":5}}'::jsonb) THEN
    RAISE EXCEPTION 'la contrainte de forme accepte une chaine : un chemin pourrait etre stocke';
  END IF;
  IF public._orphan_counts_ok(
       '{"objects":5,"byBucket":{"marketing-images":5},"byCategory":{"orphan_proven":5}}'::jsonb) THEN
    RAISE EXCEPTION 'la contrainte de forme accepte un bucket hors liste blanche';
  END IF;
  IF NOT public._orphan_counts_ok(
       '{"objects":5,"byBucket":{"avatars":4,"verifications":1},"byCategory":{"orphan_proven":5}}'::jsonb) THEN
    RAISE EXCEPTION 'la contrainte de forme refuse une valeur legitime';
  END IF;

  -- (f) le plafond est bien borné à 5 par la base
  BEGIN
    INSERT INTO public.orphan_purge_campaigns (
      campaign_id, project_ref, tool_version, manifest_hash, counts,
      volume_cap, auth_users_at_discovery)
    VALUES ('1970-01-01-000000', 'aaaaaaaaaaaaaaaaaaaa', '0.0.0',
            repeat('0', 64),
            '{"objects":1,"byBucket":{"avatars":1},"byCategory":{"orphan_proven":1}}'::jsonb,
            6, 0);
    RAISE EXCEPTION 'un plafond de 6 a ete accepte : le relever ne demanderait pas de migration';
  EXCEPTION
    WHEN check_violation THEN NULL;  -- attendu
  END;

  -- (g) les quatre lectures existent, sont fermées aux rôles clients, et le
  -- balayage ne prend AUCUN paramètre de bucket.
  FOR v_count IN
    SELECT 1 FROM (VALUES
      ('public.orphan_scan_objects()'),
      ('public.orphan_lookup_objects(uuid[])'),
      ('public.auth_users_present(uuid[])'),
      ('public.auth_users_total()')
    ) AS f(sig)
    WHERE to_regprocedure(f.sig) IS NULL
  LOOP
    RAISE EXCEPTION 'une RPC de lecture attendue est absente';
  END LOOP;

  FOR v_count IN
    SELECT 1 FROM (VALUES
      ('public.orphan_scan_objects()'),
      ('public.orphan_lookup_objects(uuid[])'),
      ('public.auth_users_present(uuid[])'),
      ('public.auth_users_total()')
    ) AS f(sig)
    WHERE has_function_privilege('anon', f.sig, 'EXECUTE')
       OR has_function_privilege('authenticated', f.sig, 'EXECUTE')
  LOOP
    RAISE EXCEPTION
      'une RPC de lecture est appelable par un role client : auth_users_present deviendrait un oracle de comptes';
  END LOOP;

  -- La liste blanche des buckets est en dur dans le balayage, pas paramétrable.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'orphan_scan_objects'
       AND (p.pronargs <> 0 OR p.prosrc !~ 'verifications')
  ) THEN
    RAISE EXCEPTION 'orphan_scan_objects prend un parametre ou perd sa liste blanche';
  END IF;

  RAISE NOTICE 'orphan_purge_campaigns en place : deny-all, sans DELETE, plafond borne a 5, forme contrainte, 4 lectures fermees.';
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
--   supabase/tests/diagnose_orphan_purge.sql
--
-- Cette migration ne supprime RIEN et ne purge rien. Elle crée le registre que la
-- fonction `purge-orphan-media` remplira. L'exécution destructive est décrite
-- dans docs/runbooks/orphan-media-catchup-2026-09.md et exige quatre artefacts
-- distincts.
--
-- RETOUR ARRIÈRE
-- ---------------------------------------------------------------------------
--   DROP TABLE IF EXISTS public.orphan_purge_campaigns;
--   DROP FUNCTION IF EXISTS public.record_orphan_discovery(TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.record_orphan_approval(TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.record_orphan_execution(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT);
--   DROP FUNCTION IF EXISTS public._orphan_counts_ok(JSONB);
--
-- Aucune donnée utilisateur n'est perdue : la table ne contient que des
-- compteurs et des empreintes. Mais la trace des campagnes exécutées l'est —
-- exporter `SELECT campaign_id, manifest_hash, counts, deleted, already_absent,
-- failed, executed_at FROM orphan_purge_campaigns` avant.
