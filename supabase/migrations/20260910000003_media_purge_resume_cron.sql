-- =============================================================================
-- JUNO-09 phase B — reprise des purges inachevées, et rétention à 90 jours
-- =============================================================================
--
-- CE QUE CETTE TÂCHE FAIT, ET CE QU'ELLE NE FAIT PAS
-- ---------------------------------------------------------------------------
-- Elle appelle `purge-user-media` en mode reprise. Cette fonction ne traite QUE
-- les lignes `media_purge_jobs` de statut `pending` — donc uniquement des
-- comptes DÉJÀ supprimés d'`auth.users`, dont la purge s'est interrompue.
--
-- Elle ne cherche pas d'orphelins, n'inspecte pas `storage.objects`, et ne peut
-- pas atteindre un objet dont aucun travail ne porte l'UUID. **Les cinq
-- orphelins historiques mesurés le 9 septembre ne sont donc pas concernés** :
-- aucun travail ne les désigne, et leur rattrapage est un livrable séparé qui
-- exige une validation humaine du rapport (runbook §8).
--
-- POURQUOI ELLE EST ARMÉE, contrairement à 20260909000001
-- ---------------------------------------------------------------------------
-- L'arbitrage n'est pas le même. Une tâche de suppression de comptes désarmée
-- ne détruit rien ; une tâche de reprise de purge désarmée laisse s'accumuler
-- en silence exactement le défaut que JUNO-09 décrit — des médias conservés
-- après la disparition du compte, sans que personne ne le voie.
--
-- Et le risque d'armer est mesurable : à l'installation, la file est VIDE. Le
-- bloc de vérification l'affiche. La tâche n'a rien à faire tant qu'un compte
-- n'a pas été supprimé, et son premier travail réel sera créé par un exécutant.
--
-- Elle est donc armée, et sa charge est bornée : `p_limit` travaux par passage.
--
-- LE SECRET
-- ---------------------------------------------------------------------------
-- Lu dans le coffre À CHAQUE PASSAGE, sous `cron_media_purge_secret`. La
-- commande ne porte que son NOM. Le garde `_assert_cron_secret` (20260910000001)
-- la précède et LÈVE si le secret est absent, vide ou sous 32 caractères : un
-- secret manquant produit un passage `failed` visible, pas un 401 silencieux
-- compté comme `succeeded`.
--
-- PRÉREQUIS — cette migration ÉCHOUERA sans lui :
--   * `cron_media_purge_secret` dans le coffre, ≥ 32 caractères ;
--   * il doit valoir EXACTEMENT `MEDIA_PURGE_SECRET` côté fonction edge.
-- La procédure ordonnée est dans docs/runbooks/media-purge-2026-09.md §5.
--
-- IDEMPOTENT : unschedule gardé par EXISTS, puis schedule.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Prérequis
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
  v_len   INTEGER;
BEGIN
  IF to_regclass('public.media_purge_jobs') IS NULL THEN
    RAISE EXCEPTION 'media_purge_jobs absente : appliquer 20260910000002 d abord';
  END IF;
  IF to_regprocedure('public.claim_media_purge_jobs(integer, integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'claim_media_purge_jobs absente : appliquer 20260910000002 d abord';
  END IF;
  IF to_regprocedure('public._assert_cron_secret(text)') IS NULL THEN
    RAISE EXCEPTION 'le garde _assert_cron_secret est absent : appliquer 20260910000001 d abord';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION 'extension supabase_vault absente : le secret retournerait en clair dans cron.job.command';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'extension pg_cron absente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'extension pg_net absente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    RAISE EXCEPTION 'net.http_post introuvable';
  END IF;

  SELECT count(*) INTO v_count
    FROM vault.decrypted_secrets v WHERE v.name = 'cron_media_purge_secret';
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'secret vault "cron_media_purge_secret" absent. Le poser AVANT (runbook §5). Pas de repli : c est ce que COALESCE(..., '''') avalait.';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'plusieurs secrets vault nommes "cron_media_purge_secret" : lecture non deterministe';
  END IF;

  SELECT length(v.decrypted_secret) INTO v_len
    FROM vault.decrypted_secrets v WHERE v.name = 'cron_media_purge_secret';
  IF v_len IS NULL OR v_len < 32 THEN
    RAISE EXCEPTION 'secret vault "cron_media_purge_secret" absent, vide ou trop court (< 32) : generer 64 hexadecimaux';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Rétention — 90 jours après complétion
-- ---------------------------------------------------------------------------
--
-- Ce sont des journaux techniques de reprise, pas une trace de conformité. Les
-- garder indéfiniment conserverait, 90 jours durant puis pour toujours, la liste
-- des UUID de comptes supprimés — une donnée que la suppression était censée
-- faire disparaître.
--
-- Ne supprime QUE les travaux `completed` : un travail `pending` de plus de
-- 90 jours est un défaut à voir, pas une ligne à ranger.
CREATE OR REPLACE FUNCTION public.purge_completed_media_purge_jobs(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 OR p_retention_days > 365 THEN
    RAISE EXCEPTION 'retention invalide : attendu entre 1 et 365 jours';
  END IF;

  DELETE FROM public.media_purge_jobs
   WHERE status = 'completed'
     AND completed_at IS NOT NULL
     AND completed_at < NOW() - make_interval(days => p_retention_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_completed_media_purge_jobs(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_completed_media_purge_jobs(INTEGER) TO service_role;

COMMENT ON FUNCTION public.purge_completed_media_purge_jobs IS
  'JUNO-09. Retention a 90 jours des travaux de purge TERMINES. Ne touche jamais un travail pending : un travail en attente depuis 90 jours est un defaut a voir, pas une ligne a ranger.';

-- ---------------------------------------------------------------------------
-- 3. Les deux tâches
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_url     TEXT;
  v_pending INTEGER;
BEGIN
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/purge-user-media';

  IF v_url !~ '^https://[a-z0-9.-]+/functions/v1/purge-user-media$' THEN
    RAISE EXCEPTION 'URL cible invalide : %', v_url;
  END IF;

  -- Ce que l'armement met réellement en mouvement, à cet instant.
  SELECT count(*) INTO v_pending
    FROM public.media_purge_jobs WHERE status = 'pending';
  RAISE NOTICE 'File de reprise a l installation : % travail(aux) en attente.', v_pending;

  PERFORM cron.unschedule('media-purge-resume')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'media-purge-resume');

  PERFORM cron.schedule(
    'media-purge-resume',
    '*/10 * * * *',
    format(
      $cron$
      SELECT public._assert_cron_secret('cron_media_purge_secret');
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-media-purge-secret',
            (SELECT v.decrypted_secret FROM vault.decrypted_secrets v
              WHERE v.name = 'cron_media_purge_secret')
        ),
        body := '{"mode":"resume","limit":10}'::jsonb
      );
      $cron$,
      v_url
    )
  );

  -- La rétention. Pas d'appel HTTP : c'est du SQL pur, donc `succeeded` y
  -- signifie vraiment réussi — l'une des rares fois où c'est le cas.
  PERFORM cron.unschedule('media-purge-retention')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'media-purge-retention');

  PERFORM cron.schedule(
    'media-purge-retention',
    '17 4 * * *',
    $cron$SELECT public.purge_completed_media_purge_jobs(90);$cron$
  );
END
$$;

-- ---------------------------------------------------------------------------
-- Auto-vérification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cmd    TEXT;
  v_active BOOLEAN;
  v_sched  TEXT;
BEGIN
  SELECT command, active, schedule INTO v_cmd, v_active, v_sched
    FROM cron.job WHERE jobname = 'media-purge-resume';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'la tache de reprise n a pas ete planifiee';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION
      'la tache de reprise est inactive : les purges inachevees s accumuleraient en silence, ce qui EST JUNO-09';
  END IF;
  IF v_sched <> '*/10 * * * *' THEN
    RAISE EXCEPTION 'calendrier attendu */10 * * * *, obtenu : %', v_sched;
  END IF;

  -- Le secret n'est pas dans la commande, dans NI L'UNE NI L'AUTRE des deux
  -- orthographes. La seconde est celle qui a échappé au contrôle pendant une
  -- journée en septembre.
  IF v_cmd ~ '''x-[a-z-]+-secret''\s*,\s*''' THEN
    RAISE EXCEPTION 'en-tete de secret litteral (forme jsonb_build_object) : JUNO-31 reintroduit';
  END IF;
  IF v_cmd ~ '"x-[a-z-]+-secret"\s*:\s*"' THEN
    RAISE EXCEPTION 'en-tete de secret litteral (forme JSON) : JUNO-31 reintroduit';
  END IF;
  IF v_cmd !~ 'vault\.decrypted_secrets' THEN
    RAISE EXCEPTION 'la commande ne lit pas le coffre a l execution';
  END IF;
  IF v_cmd !~ 'cron_media_purge_secret' THEN
    RAISE EXCEPTION 'la commande ne reference pas le secret vault attendu';
  END IF;
  IF v_cmd !~ '_assert_cron_secret\(''cron_media_purge_secret''\)' THEN
    RAISE EXCEPTION 'le garde d execution est absent de la commande';
  END IF;
  IF v_cmd !~ 'functions/v1/purge-user-media' THEN
    RAISE EXCEPTION 'la commande ne vise pas purge-user-media';
  END IF;
  IF (SELECT count(DISTINCT m[1])
        FROM regexp_matches(v_cmd, 'functions/v1/([a-z-]+)', 'g') AS m) <> 1 THEN
    RAISE EXCEPTION 'la commande vise plusieurs fonctions edge';
  END IF;
  -- Le mode est figé dans la commande : la tâche ne peut PAS purger un compte
  -- arbitraire, seulement reprendre des travaux déjà enregistrés.
  IF v_cmd !~ '"mode"\s*:\s*"resume"' THEN
    RAISE EXCEPTION 'la commande n est pas en mode reprise : elle pourrait viser un compte arbitraire';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE command ~ 'functions/v1/purge-user-media') <> 1 THEN
    RAISE EXCEPTION 'plusieurs taches visent purge-user-media';
  END IF;

  -- La rétention.
  SELECT command, active, schedule INTO v_cmd, v_active, v_sched
    FROM cron.job WHERE jobname = 'media-purge-retention';
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'la tache de retention n a pas ete planifiee';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'la tache de retention est inactive';
  END IF;
  IF v_cmd !~ 'purge_completed_media_purge_jobs\(90\)' THEN
    RAISE EXCEPTION 'la retention n est pas a 90 jours';
  END IF;

  -- Et la rétention ne peut pas emporter un travail en attente.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'purge_completed_media_purge_jobs'
       AND p.prosrc !~ 'status\s*=\s*''completed'''
  ) THEN
    RAISE EXCEPTION 'la retention ne filtre pas sur status = completed : elle pourrait effacer un travail inacheve';
  END IF;

  RAISE NOTICE 'Reprise */10 et retention 90 j en place, secret lu dans le coffre, mode fige a resume.';
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
--   SELECT * FROM public.check_cron_edge_health();   -- 20260910000004 l'y ajoute
--   supabase/tests/diagnose_media_purge_jobs.sql
--
-- La preuve qui compte n'est pas `succeeded` — c'est le retard métier :
--
--   SELECT count(*) FROM public.media_purge_jobs
--    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour';
--
-- RETOUR ARRIÈRE
-- ---------------------------------------------------------------------------
--   SELECT cron.unschedule('media-purge-resume');
--   SELECT cron.unschedule('media-purge-retention');
--
-- Désarmer la reprise n'efface rien : les travaux restent `pending` et la
-- purge synchrone des exécutants continue de traiter le cas courant. Ce qui
-- s'arrête, ce sont les REPRISES — donc les purges qui avaient échoué. Ne pas
-- laisser cet état durer : c'est le défaut d'origine.
