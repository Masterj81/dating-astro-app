-- =============================================================================
-- JUNO-09 / JUNO-30 — la supervision doit savoir mesurer la nouvelle tâche
-- =============================================================================
--
-- POURQUOI CETTE MIGRATION EXISTE
-- ---------------------------------------------------------------------------
-- `check_cron_edge_health()` (20260909000002) juge sur le RÉSULTAT, c'est-à-dire
-- sur un retard métier qu'elle sait calculer pour trois cibles seulement. La
-- tâche `media-purge-resume` ajoutée par 20260910000003 n'en fait pas partie :
-- elle se lirait donc `OK (aucun retard metier mesurable pour cette tache)`.
--
-- Cette formule est honnête, et c'est précisément ce qui la rend dangereuse ici.
-- Une purge de médias qui ne se termine jamais est le défaut JUNO-09 lui-même,
-- et une supervision qui répond « OK » parce qu'elle ne sait pas regarder est
-- exactement la faute qu'elle est censée révéler.
--
-- La fonction est donc remplacée pour connaître une quatrième source de retard :
--
--     travaux media_purge_jobs encore `pending` au-delà d'une heure
--
-- Une heure, parce que la purge synchrone de l'exécutant traite le cas courant
-- en quelques secondes. Ce qui survit une heure est une reprise qui n'aboutit
-- pas — pas un travail récent en cours de route.
--
-- LE CORPS N'EST PAS RETRANSCRIT
-- ---------------------------------------------------------------------------
-- Il est REGÉNÉRÉ depuis 20260909000002 par un script, puis patché en deux
-- points : la liste des cibles à retard mesurable, et une branche de calcul.
-- Retranscrire deux cents lignes à la main produirait une divergence — c'est
-- exactement comment les deux copies de l'éphéméride et les deux jeux de tarot
-- ont dérivé dans ce dépôt.
--
-- 20260909000002 n'est PAS modifiée. `CREATE OR REPLACE` est additif.
--
-- Les trois drapeaux « la lecture a-t-elle abouti ? » et les branches
-- `INDETERMINE` sont conservés à l'identique : une lecture impossible ne doit
-- jamais se lire « OK », et la nouvelle branche respecte la même règle — elle
-- pose `v_backlog_read := TRUE` seulement après avoir lu.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.media_purge_jobs') IS NULL THEN
    RAISE EXCEPTION 'media_purge_jobs absente : appliquer 20260910000002 d abord';
  END IF;
  IF to_regprocedure('public.check_cron_edge_health()') IS NULL THEN
    RAISE EXCEPTION 'check_cron_edge_health absente : appliquer 20260909000002 d abord';
  END IF;
END
$$;

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
      ('process-expired-deletions', 'publish-scheduled-posts', 'send-scheduled-emails',
       'purge-user-media');
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
      ELSIF v_target = 'purge-user-media' THEN
        -- JUNO-09. Le retard metier d une purge est le nombre de travaux
        -- encore `pending` au-dela d une heure : la purge synchrone traite le
        -- cas courant en quelques secondes, donc tout ce qui survit une heure
        -- est une reprise qui n aboutit pas. C est la mesure du produit, pas de
        -- la plomberie.
        SELECT count(*)::int INTO v_backlog FROM public.media_purge_jobs j
         WHERE j.status = 'pending' AND j.created_at < now() - INTERVAL '1 hour';
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
  'JUNO-30 + JUNO-09. Sante des taches cron qui appellent une fonction edge. Juge sur le RESULTAT (retard metier, reponses non-2xx) et non sur la configuration. Quatre sources de retard : suppressions expirees, posts programmes, courriels programmes, et purges de medias inachevees.';

-- ---------------------------------------------------------------------------
-- Auto-vérification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_src  TEXT;
  v_rows INTEGER;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_cron_edge_health';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'la fonction de sante n existe pas';
  END IF;

  -- (a) elle connaît la nouvelle cible, des deux côtés : la liste ET le calcul.
  IF v_src !~ 'purge-user-media' THEN
    RAISE EXCEPTION 'la fonction de sante ignore purge-user-media';
  END IF;
  IF v_src !~ 'media_purge_jobs' THEN
    RAISE EXCEPTION 'la fonction de sante ne sait pas calculer le retard des purges';
  END IF;

  -- (b) les garde-fous d'origine survivent au remplacement. Sans eux, une
  -- lecture impossible se relirait « OK », ce qui est le defaut d origine.
  IF v_src !~ 'v_backlog_read' OR v_src !~ 'v_runs_read' OR v_src !~ 'v_non2xx_read' THEN
    RAISE EXCEPTION 'un drapeau de lecture a disparu du remplacement';
  END IF;
  IF v_src !~ 'INDETERMINE' THEN
    RAISE EXCEPTION 'les branches INDETERMINE ont disparu : une lecture impossible se lirait OK';
  END IF;
  IF v_src !~ 'EN CLAIR' THEN
    RAISE EXCEPTION 'la detection de secret en clair (JUNO-31) a disparu du remplacement';
  END IF;
  IF v_src !~ 'EN ATTENTE' THEN
    RAISE EXCEPTION 'l etat EN ATTENTE a disparu : une tache replanifiee crierait ALERTE';
  END IF;
  -- Les deux orthographes d'en-tête, dont celle qui a échappé au contrôle
  -- pendant une journée.
  IF v_src !~ 'x-\[a-z-\]\+-secret"' THEN
    RAISE EXCEPTION 'la detection de la forme JSON de l en-tete a disparu';
  END IF;

  -- (c) elle rend toujours des lignes : un controle qui ne regarde rien est
  -- pire qu absent — il rassure.
  SELECT count(*) INTO v_rows FROM public.check_cron_edge_health();
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'aucune tache cron edge detectee : le controle serait vide de sens';
  END IF;

  -- (d) et elle mesure effectivement la tâche de reprise, si elle est planifiée.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'media-purge-resume') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.check_cron_edge_health() h
       WHERE h.jobname = 'media-purge-resume' AND h.backlog IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'media-purge-resume est planifiee mais son retard metier est illisible : la supervision se lirait OK sans rien mesurer';
    END IF;
  END IF;

  RAISE NOTICE 'Fonction de sante etendue : % tache(s), retard des purges mesurable.', v_rows;
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
--   SELECT jobname, secret_state, backlog, verdict FROM public.check_cron_edge_health();
--
-- `media-purge-resume` doit rendre un `backlog` NUMÉRIQUE — 0 à l'installation.
-- `NULL` signifierait que la branche de calcul n'a pas été atteinte, et le
-- verdict retomberait sur « aucun retard metier mesurable ».
--
-- RETOUR ARRIÈRE : réappliquer 20260909000002, qui restaure la version à trois
-- sources. La tâche de reprise redeviendrait alors non mesurée — état à ne pas
-- laisser durer.
