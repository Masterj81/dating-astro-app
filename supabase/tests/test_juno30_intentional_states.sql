-- =============================================================================
-- JUNO-30 — tests comportementaux des états cron intentionnels
--          (migration 20260914000001)
-- =============================================================================
--
-- HOW TO RUN (après application de la migration — locale ou staging d'abord) :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/test_juno30_intentional_states.sql
--
-- Tout le fichier est enveloppé dans une transaction qui se termine par
-- ROLLBACK : les tâches cron synthétiques créées ici ne deviennent jamais
-- visibles pour le lanceur pg_cron (lignes non commises), les requêtes
-- net.http_post ne partent jamais (pg_net n'envoie que du commis), et la
-- base n'est modifiée en rien. Chaque assertion RAISE en cas d'échec, donc
-- ON_ERROR_STOP=1 transforme une régression en code de sortie non nul.
--
-- RÉGRESSIONS COUVERTES (exigées le 14 septembre 2026 avant application) :
--   R1  base sans le job (simulation « base neuve »)      -> CONFORME absent
--   R2  deux tâches visant la fonction                    -> ALERTE, partout
--   R3  registre des décisions illisible                  -> INDETERMINE, jamais OK
--   R4  tâche réactivée sans secret Vault                 -> CRITIQUE
--   R5  décision manuelle + publieur cron actif           -> ALERTE publieur
--   R6  tâche désactivée par décision                     -> DESACTIVEE, jamais OK
--   R7  privilèges du registre                            -> clients rien, service lecture
--
-- PRÉREQUIS : 20260914000001 APPLIQUÉE (fonction + registre existants).
-- La rejouabilité sur base neuve est par conception (aucune exigence de la
-- migration ne porte sur le job ni sur l'historique) ; R1 en simule l'état.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  v_jobid  cron.job.jobid%TYPE;
  v_verdict TEXT;
  v_count  INTEGER;
BEGIN
  -- Prérequis -------------------------------------------------------------
  IF to_regprocedure('public.check_cron_edge_health()') IS NULL THEN
    RAISE EXCEPTION 'PREREQUIS : check_cron_edge_health absente — appliquer 20260914000001 d abord';
  END IF;
  IF to_regclass('public.cron_task_decisions') IS NULL THEN
    RAISE EXCEPTION 'PREREQUIS : cron_task_decisions absente — appliquer 20260914000001 d abord';
  END IF;

  -- =====================================================================
  -- R6 + R7 — l'état courant est intentionnel, et le registre est verrouillé
  -- =====================================================================
  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'daily-horoscope-push';
  IF v_verdict IS NULL
     OR v_verdict LIKE 'OK%'
     OR (v_verdict NOT LIKE 'DESACTIVEE%'
         AND v_verdict NOT LIKE 'CONFORME : desactivee et absente%') THEN
    RAISE EXCEPTION 'R6 ECHOUE : verdict « % » — attendu DESACTIVEE... ou CONFORME absent, jamais OK', v_verdict;
  END IF;

  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'publish-scheduled-posts';
  IF v_verdict IS NULL OR v_verdict NOT LIKE 'CONFORME : aucun cron publieur%' THEN
    RAISE EXCEPTION 'R6 ECHOUE (publieur) : verdict « % »', v_verdict;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS c,
                unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p
     WHERE has_table_privilege(c, 'public.cron_task_decisions', p)
  ) THEN
    RAISE EXCEPTION 'R7 ECHOUE : un role client accede au registre';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.cron_task_decisions', 'SELECT') THEN
    RAISE EXCEPTION 'R7 ECHOUE : service_role ne lit pas le registre';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) AS p
     WHERE has_table_privilege('service_role', 'public.cron_task_decisions', p)
  ) THEN
    RAISE EXCEPTION 'R7 ECHOUE : service_role peut ecrire dans le registre';
  END IF;

  -- =====================================================================
  -- R1 — la tâche absente se lit CONFORME (simulation base neuve / déjà
  --      désplanifiée). Le ROLLBACK final rétablit la ligne réelle : le
  --      lanceur pg_cron ne voit jamais une suppression non commise.
  -- =====================================================================
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-horoscope-push';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'daily-horoscope-push';
  IF v_verdict IS NULL OR v_verdict NOT LIKE 'CONFORME : desactivee et absente%' THEN
    RAISE EXCEPTION 'R1 ECHOUE : verdict « % » — attendu CONFORME : desactivee et absente', v_verdict;
  END IF;

  -- Restaurer la tâche pour les scénarios suivants, désarmée comme la
  -- migration l a laissée (active = false, planning d origine conservé).
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.schedule('daily-horoscope-push', '0 12 * * *',
      'SELECT net.http_post(url := ''https://example.invalid/functions/v1/send-daily-horoscope'','
      || ' headers := jsonb_build_object(''Content-Type'', ''application/json'','
      || ' ''x-daily-horoscope-secret'', ''''), body := ''{}''::jsonb);');
    -- cron.schedule crée un NOUVEAU jobid, actif par défaut : on le désarme
    -- pour revenir à l état post-migration. example.invalid ne résout rien —
    -- et de toute façon la transaction n est jamais commise.
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-horoscope-push';
    PERFORM cron.alter_job(v_jobid, NULL, NULL, NULL, NULL, FALSE);
  END IF;

  -- =====================================================================
  -- R2 — deux tâches visant la fonction : ALERTE sur chacune, et le prédicat
  --      d ambiguïté de la migration (nom OU cible) les voit toutes les deux.
  -- =====================================================================
  PERFORM cron.schedule('juno30-test-horo-double', '5 5 5 5 *',
    'SELECT net.http_post(url := ''https://example.invalid/functions/v1/send-daily-horoscope'','
    || ' headers := ''{"Content-Type": "application/json"}''::jsonb, body := ''{}''::jsonb);');

  SELECT count(*) INTO v_count
    FROM cron.job j
   WHERE j.jobname = 'daily-horoscope-push'
      OR j.command LIKE '%functions/v1/send-daily-horoscope%';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'R2 ECHOUE : le predicat d ambiguite ne voit que % tache(s), 2 attendues', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.check_cron_edge_health()
   WHERE verdict LIKE 'ALERTE : plusieurs taches visent send-daily-horoscope%';
  IF v_count < 2 THEN
    RAISE EXCEPTION 'R2 ECHOUE : % verdict(s) ALERTE plusieurs-taches, 2 attendues', v_count;
  END IF;

  -- cron.unschedule(nom) LEVE une erreur si le nom est absent : la forme par
  -- jobid, PERFORM ... FROM cron.job WHERE ..., ne s exécute que si la ligne
  -- existe — idempotent.
  PERFORM cron.unschedule(j.jobid) FROM cron.job j
   WHERE j.jobname = 'juno30-test-horo-double';

  -- =====================================================================
  -- R3 — registre illisible : INDETERMINE partout, jamais OK. Le RENAME
  --      rend le SELECT de la fonction en erreur ; son drapeau de lecture
  --      doit transformer cela en INDETERMINE, pas en faux vert.
  --      (Le ROLLBACK final annule le RENAME.)
  -- =====================================================================
  ALTER TABLE public.cron_task_decisions RENAME TO cron_task_decisions_invisible;

  SELECT count(*) INTO v_count FROM public.check_cron_edge_health()
   WHERE verdict NOT LIKE 'INDETERMINE : registre des decisions produit illisible%';
  IF v_count > 0 THEN
    SELECT verdict INTO v_verdict FROM public.check_cron_edge_health() LIMIT 1;
    RAISE EXCEPTION 'R3 ECHOUE : au moins un verdict n est pas INDETERMINE : « % »', v_verdict;
  END IF;

  ALTER TABLE public.cron_task_decisions_invisible RENAME TO cron_task_decisions;

  -- =====================================================================
  -- R4 — tâche réactivée SANS secret Vault valide : CRITIQUE, échec visible.
  -- =====================================================================
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-horoscope-push';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, NULL, NULL, NULL, NULL, TRUE);

    SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
     WHERE jobname = 'daily-horoscope-push';
    IF v_verdict IS NULL
       OR v_verdict NOT LIKE 'CRITIQUE : reactivee SANS secret Vault valide%' THEN
      RAISE EXCEPTION 'R4 ECHOUE : verdict « % » — attendu CRITIQUE : reactivee SANS secret Vault valide', v_verdict;
    END IF;

    PERFORM cron.alter_job(v_jobid, NULL, NULL, NULL, NULL, FALSE);
  ELSE
    RAISE NOTICE 'R4 SAUTE : la tâche est absente de cette base';
  END IF;

  -- =====================================================================
  -- R5 — décision « publication manuelle uniquement » + publieur cron actif :
  --      ALERTE publieur. La tâche synthétique vise example.invalid et n est
  --      jamais commise : rien ne peut partir.
  -- =====================================================================
  PERFORM cron.schedule('juno30-test-pub-actif', '7 7 7 7 *',
    'SELECT net.http_post(url := ''https://example.invalid/functions/v1/publish-scheduled-posts'','
    || ' headers := jsonb_build_object(''Content-Type'', ''application/json''), body := ''{}''::jsonb);');

  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'juno30-test-pub-actif';
  IF v_verdict IS NULL
     OR v_verdict NOT LIKE 'ALERTE : publieur cron present malgre la decision%' THEN
    RAISE EXCEPTION 'R5 ECHOUE : verdict « % » — attendu ALERTE : publieur cron present', v_verdict;
  END IF;

  PERFORM cron.unschedule(j.jobid) FROM cron.job j
   WHERE j.jobname = 'juno30-test-pub-actif';

  -- =====================================================================
  -- Retour à l état de départ (le ROLLBACK final s en charge aussi ; ces
  -- nettoyages idempotents ne sont là que pour la lisibilité des journaux).
  -- =====================================================================
  PERFORM cron.unschedule(j.jobid) FROM cron.job j
   WHERE j.jobname IN ('juno30-test-pub-actif', 'juno30-test-horo-double');
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-horoscope-push';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(v_jobid, NULL, NULL, NULL, NULL, FALSE);
  END IF;

  RAISE NOTICE 'JUNO-30 : R1 a R7 vertes.';
END
$test$;

ROLLBACK;
