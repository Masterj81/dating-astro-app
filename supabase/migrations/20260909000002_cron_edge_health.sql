-- =============================================================================
-- JUNO-30 — pg_cron ne sait pas si une fonction edge a répondu
-- =============================================================================
--
-- CONSTAT DISTINCT DE JUNO-29. Celui-ci est la raison pour laquelle JUNO-29 a
-- pu durer 142 nuits sans que personne ne le voie.
--
-- CE QUI EST OBSERVABLE, ET CE QUI NE L'EST PAS
-- ---------------------------------------------------------------------------
-- `cron.job_run_details.status = 'succeeded'` signifie : la commande SQL s'est
-- exécutée sans erreur. Or cette commande est `SELECT net.http_post(...)`, qui
-- se contente de METTRE EN FILE une requête et rend un identifiant. Elle réussit
-- donc toujours — que la fonction edge réponde 200, 401, 500, ou rien du tout.
--
-- Mesuré le 9 septembre 2026 : 142 exécutions, 142 « réussies », zéro
-- suppression effectuée. Le seul témoin était une ligne 401 dans
-- `net._http_response`, table que rien ne consulte et que pg_net PURGE au bout
-- de quelques heures.
--
-- Quatre tâches cron appellent une fonction edge par `net.http_post` :
--   daily-horoscope-push        0 12 * * *   -> send-daily-horoscope
--   publish-scheduled-posts     */5 * * * *  -> publish-scheduled-posts
--   process-expired-deletions   0 3 * * *    -> process-expired-deletions
--   send-scheduled-emails       (20260824000001)
--
-- Trois d'entre elles ont été planifiées par 20260419000005, qui charge leur
-- secret via `public._load_cron_secret` — lequel se termine par
-- `COALESCE(current_setting(p_guc, TRUE), '')`. Le même défaut fail-open que
-- JUNO-29, écrit une fois et appliqué trois fois.
--
-- CE QUE FAIT CE FICHIER
-- ---------------------------------------------------------------------------
-- Une fonction de santé qui juge sur le RÉSULTAT, pas sur la configuration.
-- Pour chaque tâche edge planifiée, elle rend :
--   * l'état du secret dans la commande — et surtout s'il est VIDE ;
--   * le dernier passage pg_cron ;
--   * les réponses non-2xx observées sur la fenêtre que pg_net conserve ;
--   * **le retard métier**, quand il est mesurable — le seul signal qui aurait
--     crié en avril.
--
-- Elle ne modifie rien. Elle rend visible.
--
-- Elle ne CORRIGE pas les secrets des trois autres tâches : c'est une décision
-- d'exploitation, et le diagnostic
-- supabase/tests/diagnose_cron_edge_supervision.sql dit lesquelles sont
-- concernées avant qu'on y touche.
--
-- IDEMPOTENT : CREATE OR REPLACE, GRANT restatés.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_cron_edge_health()
RETURNS TABLE (
  jobname        TEXT,
  target         TEXT,
  schedule       TEXT,
  active         BOOLEAN,
  secret_state   TEXT,
  last_run       TIMESTAMPTZ,
  last_run_state TEXT,
  backlog        INTEGER,
  verdict        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r                 RECORD;
  v_target          TEXT;
  v_literal         TEXT;
  v_vault           BOOLEAN;
  v_plain           BOOLEAN;
  v_secret          TEXT;
  v_last            TIMESTAMPTZ;
  v_state           TEXT;
  v_backlog         INTEGER;
  v_non2xx          INTEGER;
  -- « La lecture a-t-elle abouti ? » — distinct de « la valeur est-elle nulle ? ».
  --
  -- Sans ces drapeaux, un EXCEPTION WHEN OTHERS met la variable à NULL, la
  -- branche correspondante du verdict est sautée, et le verdict retombe sur
  -- « OK ». Une supervision qui répond OK parce qu'elle n'a pas pu regarder est
  -- exactement le défaut qu'elle est censée révéler : c'est JUNO-29 réécrit
  -- dans l'outil qui devait le détecter.
  v_non2xx_read     BOOLEAN;
  v_runs_read       BOOLEAN;
  v_backlog_read    BOOLEAN;
  v_backlog_defined BOOLEAN;
BEGIN
  -- Les réponses non-2xx sont globales : pg_net ne relie pas une réponse à la
  -- tâche qui l'a émise. C'est une limite honnête de ce contrôle, et la raison
  -- pour laquelle le retard métier compte davantage.
  BEGIN
    SELECT count(*)::int INTO v_non2xx
      FROM net._http_response
     WHERE status_code IS NULL OR status_code < 200 OR status_code >= 300;
    v_non2xx_read := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_non2xx := NULL;
    v_non2xx_read := FALSE;
  END;

  FOR r IN
    SELECT j.jobid, j.jobname AS name, j.schedule AS sched, j.active AS act, j.command AS cmd
      FROM cron.job j
     WHERE j.command ~ 'net\.http_post'
     ORDER BY j.jobname
  LOOP
    v_target  := (regexp_match(r.cmd, 'functions/v1/([a-z-]+)'))[1];
    v_vault   := r.cmd ~ 'vault\.decrypted_secrets';
    -- DEUX formes d en-tete, et la seconde a ete manquee jusqu au 9 sep 2026.
    -- jsonb_build_object('x-...-secret', '...') etait detectee ; la forme
    -- '{"x-...-secret": "..."}'::jsonb ne l etait pas. Or c est celle que
    -- portait process-scheduled-emails, avec sa valeur EN CLAIR : le controle
    -- annoncait « aucun en-tete de secret » sur la seule tache qui en portait
    -- un en dur. Un detecteur aveugle a une forme d ecriture ne rassure pas
    -- moins qu un detecteur absent — il rassure davantage, et a tort.
    v_literal := COALESCE(
      (regexp_match(r.cmd, '''x-[a-z-]+-secret''\s*,\s*''([^'']*)'''))[1],
      (regexp_match(r.cmd, '"x-[a-z-]+-secret"\s*:\s*"([^"]*)"'))[1]
    );

    -- Independant de v_vault : un litteral residuel a cote d une lecture du
    -- coffre resterait une valeur en clair dans une table, donc reste signale.
    v_plain := v_literal IS NOT NULL AND v_literal <> '';

    -- Seule la LONGUEUR sort d ici, jamais la valeur ni un fragment.
    v_secret := CASE
      WHEN v_plain              THEN 'EN CLAIR dans la commande ('
                                     || length(v_literal)::text || ' car.)'
      WHEN v_vault              THEN 'coffre, lu a l execution'
      WHEN v_literal IS NULL    THEN 'aucun en-tete de secret'
      ELSE 'VIDE'
    END;

    BEGIN
      SELECT max(d.start_time) INTO v_last
        FROM cron.job_run_details d WHERE d.jobid = r.jobid;
      SELECT d.status INTO v_state
        FROM cron.job_run_details d WHERE d.jobid = r.jobid
       ORDER BY d.start_time DESC LIMIT 1;
      v_runs_read := TRUE;
    EXCEPTION WHEN OTHERS THEN
      v_last := NULL; v_state := NULL; v_runs_read := FALSE;
    END;

    -- Le retard métier : la seule mesure qui distingue « la tâche tourne » de
    -- « la tâche fait son travail ».
    v_backlog := NULL;
    v_backlog_defined := v_target IN
      ('process-expired-deletions', 'publish-scheduled-posts', 'send-scheduled-emails');
    v_backlog_read := NOT v_backlog_defined;   -- rien à lire = rien à rater
    BEGIN
      IF v_target = 'process-expired-deletions' THEN
        SELECT count(*)::int INTO v_backlog FROM public.profiles p
         WHERE p.deletion_scheduled_for IS NOT NULL AND p.deletion_scheduled_for < now();
        v_backlog_read := TRUE;
      ELSIF v_target = 'publish-scheduled-posts' THEN
        SELECT count(*)::int INTO v_backlog FROM public.marketing_posts m
         WHERE m.status = 'scheduled' AND m.scheduled_for < now() - INTERVAL '1 hour';
        v_backlog_read := TRUE;
      ELSIF v_target = 'send-scheduled-emails' THEN
        SELECT count(*)::int INTO v_backlog FROM public.scheduled_emails e
         WHERE e.status = 'pending' AND e.scheduled_for < now() - INTERVAL '2 hours';
        v_backlog_read := TRUE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_backlog := NULL;
      v_backlog_read := FALSE;
    END;

    RETURN QUERY SELECT
      r.name,
      COALESCE(v_target, '?'),
      r.sched,
      r.act,
      v_secret,
      v_last,
      COALESCE(v_state, 'inconnu'),
      v_backlog,
      -- Ordre delibere : ce qui est CERTAINEMENT casse, puis ce qui n a PAS PU
      -- etre verifie, puis ce qui va bien. Une lecture impossible ne doit
      -- jamais se lire « OK » — c est la faute meme que ce controle traque.
      CASE
        WHEN v_plain             THEN 'CRITIQUE : secret EN CLAIR dans cron.job.command'
                                      || ' — deplacer vers le coffre ET TOURNER la valeur'
        WHEN v_secret = 'VIDE'   THEN 'CRITIQUE : secret vide, 401 garanti'
        WHEN NOT r.act           THEN 'DESARMEE'
        WHEN NOT v_runs_read     THEN 'INDETERMINE : historique pg_cron illisible'
        -- Une tache replanifiee n a PAS d historique : cron.unschedule +
        -- cron.schedule cree un NOUVEAU jobid, et cron.job_run_details ne suit
        -- pas l ancien. « jamais executee » avec un retard metier NUL et LU est
        -- donc l etat normal entre la replanification et le premier passage —
        -- pas une alerte. Constate le 9 sep 2026 sur process-expired-deletions,
        -- rearmee a 18h alors que son passage est a 03:00 UTC : le controle
        -- criait ALERTE sur une tache dont le retard metier valait zero.
        -- Le garde tient dans les DEUX conjonctions : si le retard n est pas
        -- mesurable pour cette tache, ou n a pas pu etre lu, on retombe sur
        -- l alerte. Une lecture impossible ne se lit jamais « en attente ».
        WHEN v_last IS NULL AND v_backlog_defined AND v_backlog_read
             AND v_backlog = 0
                                 THEN 'EN ATTENTE : replanifiee, premier passage a venir'
        WHEN v_last IS NULL      THEN 'ALERTE : jamais executee'
        WHEN v_backlog_defined AND NOT v_backlog_read
                                 THEN 'INDETERMINE : retard metier illisible'
        WHEN v_backlog IS NOT NULL AND v_backlog > 0
                                 THEN 'CRITIQUE : ' || v_backlog::text || ' en retard'
        WHEN NOT v_non2xx_read   THEN 'INDETERMINE : reponses HTTP illisibles'
        WHEN v_non2xx > 0        THEN 'A VERIFIER : ' || v_non2xx::text
                                      || ' reponse(s) non-2xx toutes taches confondues'
        WHEN NOT v_backlog_defined
                                 THEN 'OK (aucun retard metier mesurable pour cette tache)'
        ELSE 'OK'
      END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_cron_edge_health() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_cron_edge_health() TO service_role;

COMMENT ON FUNCTION public.check_cron_edge_health IS
  'JUNO-30. Sante des taches cron qui appellent une fonction edge. Juge sur le RESULTAT (retard metier, reponses non-2xx) et non sur la configuration : cron.job_run_details rend succeeded des que net.http_post a mis la requete en file, sans jamais lire le code de reponse. C est ce qui a rendu JUNO-29 invisible pendant 142 nuits.';

-- ---------------------------------------------------------------------------
-- Auto-vérification.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF to_regprocedure('public.check_cron_edge_health()') IS NULL THEN
    RAISE EXCEPTION 'la fonction de sante n existe pas';
  END IF;

  IF has_function_privilege('anon', 'public.check_cron_edge_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_cron_edge_health()', 'EXECUTE') THEN
    RAISE EXCEPTION 'la fonction de sante est appelable par un role client';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_cron_edge_health()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role ne peut pas appeler la fonction de sante';
  END IF;

  -- Elle doit rendre au moins une ligne : sinon elle ne surveille rien, et un
  -- controle qui ne regarde rien est pire qu absent — il rassure.
  SELECT count(*) INTO v_rows FROM public.check_cron_edge_health();
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'aucune tache cron edge detectee : le controle serait vide de sens';
  END IF;

  RAISE NOTICE 'Sante des taches edge en place : % tache(s) surveillee(s).', v_rows;
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
--   SELECT * FROM public.check_cron_edge_health();
--
-- À lire dans cet ordre :
--   0. `secret_state = 'EN CLAIR'` -> la valeur du secret est écrite dans
--      `cron.job.command`, lisible par tout rôle capable de lire cette table
--      et présente dans chaque sauvegarde. La déplacer vers le coffre ne
--      suffit pas : la valeur a été exposée, elle doit être TOURNÉE.
--   1. `secret_state = 'VIDE'`  -> la tâche répond 401 en silence, comme
--      process-expired-deletions depuis avril. C'est le cas à traiter en
--      premier, et il concerne potentiellement daily-horoscope-push et
--      publish-scheduled-posts, planifiées par le même 20260419000005.
--   2. `backlog > 0`            -> la tâche tourne mais ne fait pas son travail.
--   3. `last_run` ancien        -> elle ne tourne plus.
--   4. `EN ATTENTE`             -> replanifiée à l'instant, retard métier nul,
--      premier passage pas encore venu. Normal ; doit devenir `OK` après le
--      passage suivant. Si l'état persiste au-delà d'une période de
--      planification, la tâche ne se déclenche pas.
--
-- LIMITE ASSUMÉE : pg_net ne relie pas une réponse à la tâche émettrice, et
-- purge `net._http_response` au bout de quelques heures. La colonne
-- non-2xx est donc globale et à courte mémoire. C'est le `backlog` qui porte le
-- signal fiable — parce qu'il mesure le produit, pas la plomberie.
--
-- SUITE PROPOSÉE, HORS PÉRIMÈTRE DE CE FICHIER : appeler cette fonction une
-- fois par jour et alerter sur `CRITIQUE`. Aucune alerte n'est créée ici : le
-- canal (courriel, Slack, tableau de bord) est une décision d'exploitation.
