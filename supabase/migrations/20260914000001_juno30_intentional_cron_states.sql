-- =============================================================================
-- JUNO-30 — fermeture opérationnelle du résiduel : états cron intentionnels
-- =============================================================================
--
-- DÉCISIONS PRODUIT DU 14 SEPTEMBRE 2026 (docs/runbooks/juno-30-decisions-et-desarmement-2026-09.md)
-- ---------------------------------------------------------------------------
-- 1. daily-horoscope-push : TEMPORAIREMENT DÉSACTIVÉ.
--    Le cron actif portant un secret VIDE n'est pas un état désactivé
--    acceptable : c'est une panne permanente déguisée — un « succeeded »
--    pg_cron et un 401 réel chaque jour à 12:00 UTC (mesuré le 14 septembre :
--    le seul 401 de la fenêtre pg_net est à 12:00:00 pile). Cette migration
--    transforme cette panne en état INTENTIONNEL et OBSERVABLE : le job
--    reste dans cron.job, actif = false, et la supervision sait pourquoi.
--
--    NE JAMAIS poser DAILY_HOROSCOPE_SECRET uniquement pour faire disparaître
--    le 401 : le secret présent (20 avril) ne dit rien de la valeur que la
--    commande vide n'envoie pas, et « plus de 401 » ne signifie pas « le
--    produit fonctionne ». La réactivation est un chantier futur : jetons push
--    (1 seul jeton pour 289 profils actifs, aucun au format Expo — mesuré),
--    consentement explicite, filtre is_active, mode dry-run. Voir le runbook.
--
-- 2. publish-scheduled-posts : PUBLICATION MANUELLE UNIQUEMENT.
--    Aucun cron ne doit exister. La fonction reste pour le chantier cloud,
--    qui restera non activé tant que marketingagent n'est pas fusionné et que
--    l'invariant « un seul publieur » n'est pas conçu. Aucun BLOTATO_API_KEY
--    ne sera posé dans Supabase pour l'instant (vérifié absent le 14 sept.).
--
-- CE QUE CE FICHIER FAIT (et ne fait pas)
-- ---------------------------------------------------------------------------
--   * crée public.cron_task_decisions — le registre des décisions produit sur
--     les tâches cron, lisible par service_role seul (RLS active, aucun grant
--     client) : c'est ce qui rend l'intention OBSERVABLE dans la base, et pas
--     seulement dans la documentation ;
--   * y enregistre les deux décisions ci-dessus ;
--   * désactive daily-horoscope-push — UNIQUEMENT cette tâche — via
--     cron.alter_job(active => false) : le job, son planning, sa commande et
--     tout son historique cron.job_run_details sont conservés (preuves
--     historiques : on ne nettoie pas les journaux). Si le job est déjà
--     absent, la migration continue : « absente » est aussi un état conforme à
--     la décision, et la supervision le dira ;
--   * remplace check_cron_edge_health() pour DISTINGUER :
--       « désactivée par décision produit »   -> DÉSACTIVÉE (non alarmant)
--       « réactivée SANS secret Vault valide » -> CRITIQUE (échec visible)
--       « publieur cron malgré décision manuelle » -> ALERTE
--     La fonction garde sa signature exacte (mêmes colonnes) : les
--     consommateurs existants ne changent pas ;
--   * ne crée AUCUN secret, ne planifie RIEN, ne supprime RIEN.
--
-- POURQUOI LE VERDICT « secret vide » DEVAIT ÊTRE REPLACÉ
-- ---------------------------------------------------------------------------
-- Dans la version précédente, « CRITIQUE : secret vide » était évalué AVANT
-- l'état d'activité : un job désactivé mais portant encore le littéral vide
-- aurait continué à se lire CRITIQUE — une décision produit interprétée comme
-- une panne. L'ordre des verdicts devient : secret EN CLAIR (toujours
-- critique, même désactivé : la valeur serait dans chaque sauvegarde), puis
-- les états intentionnels, puis « secret vide » pour les jobs actifs sans
-- décision enregistrée, puis le reste à l'identique.
--
-- RETOUR ARRIÈRE — à lire avant d'y toucher
-- ---------------------------------------------------------------------------
-- Réarmer sans secret (reproduire l'état d'avant) :
--   SELECT cron.alter_job(j.jobid, NULL, NULL, NULL, NULL, TRUE)
--     FROM cron.job j WHERE j.jobname = 'daily-horoscope-push';
-- La supervision répondra alors « CRITIQUE : réactivée SANS secret Vault
-- valide » — un échec VISIBLE, pas un silence. C'est le comportement voulu.
-- La réactivation propre est décrite au runbook : valeur neuve posée des deux
-- côtés le même jour, replanification sur le pattern 20260910000001, retrait
-- de la ligne de décision dans la même migration.
--
-- Cette migration est PRÉPARÉE le 14 septembre 2026 et N'EST PAS APPLIQUÉE.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Le registre des décisions produit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_task_decisions (
  jobname    TEXT PRIMARY KEY,
  decision   TEXT NOT NULL CHECK (
    decision IN ('desactivee_par_decision_produit',
                 'publication_manuelle_seulement')
  ),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  runbook    TEXT NOT NULL
);

ALTER TABLE public.cron_task_decisions ENABLE ROW LEVEL SECURITY;

-- RLS active sans politique = aucun rôle client ne lit ni n'écrit. Les grants
-- par défaut de Supabase donnent trop à trop de rôles sur toute table neuve :
-- on révoque tout, puis on accorde le strict nécessaire (20260911000001).
REVOKE ALL ON TABLE public.cron_task_decisions FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cron_task_decisions TO service_role;

COMMENT ON TABLE public.cron_task_decisions IS
  'JUNO-30. Decisions produit sur les taches cron : ce qui est DESACTIVE exprimes se lit ici, pas dans la documentation seule. La supervision (check_cron_edge_health) joint ce registre pour distinguer une decision d une panne.';

INSERT INTO public.cron_task_decisions (jobname, decision, decided_at, runbook) VALUES
  ('daily-horoscope-push',
   'desactivee_par_decision_produit',
   TIMESTAMPTZ '2026-09-14 12:00:00+00',
   'docs/runbooks/juno-30-decisions-et-desarmement-2026-09.md'),
  ('publish-scheduled-posts',
   'publication_manuelle_seulement',
   TIMESTAMPTZ '2026-09-14 12:00:00+00',
   'docs/runbooks/juno-30-decisions-et-desarmement-2026-09.md')
ON CONFLICT (jobname) DO UPDATE
  SET decision = EXCLUDED.decision,
      decided_at = EXCLUDED.decided_at,
      runbook = EXCLUDED.runbook;

-- ---------------------------------------------------------------------------
-- 2. Désactivation explicite de daily-horoscope-push — et rien d'autre.
--    Trois états distingués, dont un qui refuse bruyamment AVANT mutation :
--      a. une tâche  -> désarmée ;
--      b. zéro tâche -> rien à faire (état conforme, la supervision le dira) ;
--      c. PLUSIEURS tâches portant le nom ou visant la fonction -> REFUS :
--         désarmer l'une et laisser l'autre active serait exactement la panne
--         qu'on décide de fermer, avec l'apparence d'une migration réussie.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_jobid cron.job.jobid%TYPE;
  v_ambigus INTEGER;
BEGIN
  -- Le garde AVANT toute mutation : nom OU cible, peu importe le nom sous
  -- lequel la seconde tâche se cache.
  SELECT count(*) INTO v_ambigus
    FROM cron.job j
   WHERE j.jobname = 'daily-horoscope-push'
      OR j.command LIKE '%functions/v1/send-daily-horoscope%';
  IF v_ambigus > 1 THEN
    RAISE EXCEPTION
      'etat ambigu : % tache(s) portent le nom ou visent send-daily-horoscope — arbitrer AVANT la migration, rien n a ete modifie',
      v_ambigus;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'daily-horoscope-push';

  IF v_jobid IS NULL THEN
    -- Déjà absente : conforme à la décision (la supervision le dira par
    -- « CONFORME : désactivée et absente de cron.job »). On ne replanifie pas.
    RAISE NOTICE 'daily-horoscope-push absente de cron.job : rien à désarmer.';
  ELSE
    -- active => false, et rien d'autre : planning, commande et historique
    -- sont laissés intacts. pg_cron ne déclenchera plus jamais la commande.
    PERFORM cron.alter_job(v_jobid, NULL, NULL, NULL, NULL, FALSE);
    RAISE NOTICE 'daily-horoscope-push désarmée (jobid %).', v_jobid;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Supervision : les états intentionnels se lisent comme tels.
--
-- Le corps repart de la dernière définition (20260910000004 — retard métier
-- purge-user-media inclus) et ajoute : la lecture du registre des décisions
-- (avec son drapeau « la lecture a-t-elle abouti ? », même règle que les
-- trois autres : une lecture impossible ne se lit jamais « OK »), deux
-- branches de verdict par job, et une passe finale pour les décisions dont la
-- tâche est absente de cron.job.
-- ---------------------------------------------------------------------------
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
  dec               RECORD;
  v_target          TEXT;
  v_literal         TEXT;
  v_vault           BOOLEAN;
  v_plain           BOOLEAN;
  v_secret          TEXT;
  v_last            TIMESTAMPTZ;
  v_state           TEXT;
  v_backlog         INTEGER;
  v_non2xx          INTEGER;
  v_dec             TEXT;
  v_dec_date        TEXT;
  v_verdict         TEXT;
  v_dup             BOOLEAN;
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
  v_decisions_read  BOOLEAN;
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

  -- Le registre des décisions produit. Illisible = aucun verdict « OK » :
  -- une décision qu'on ne peut pas lire ne peut pas non plus excuser une tâche.
  BEGIN
    PERFORM 1 FROM public.cron_task_decisions LIMIT 1;
    v_decisions_read := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_decisions_read := FALSE;
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
    -- '{"x-...-secret": "..."}'::jsonb ne l etait pas. Un detecteur aveugle a
    -- une forme d ecriture ne rassure pas moins qu un detecteur absent.
    v_literal := COALESCE(
      (regexp_match(r.cmd, '''x-[a-z-]+-secret''\s*,\s*''([^'']*)'''))[1],
      (regexp_match(r.cmd, '"x-[a-z-]+-secret"\s*:\s*"([^"]*)"'))[1]
    );

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

    -- La décision produit enregistrée pour CE job, si on a pu lire le registre.
    -- Appariement par NOM DE JOB **ou par FONCTION CIBLÉE** : la décision
    -- « publication manuelle uniquement » porte sur la fonction, pas sur un nom
    -- — un publieur cron recréé sous un autre nom doit être attrapé (régression
    -- R5, constatée le 14 septembre : l'appariement par seul nom le laissait
    -- filer vers « EN ATTENTE »). La décision au nom exact prime sur celle par
    -- cible lorsqu'elles coexistent.
    v_dec := NULL;
    v_dec_date := NULL;
    IF v_decisions_read THEN
      SELECT ctd.decision, to_char(ctd.decided_at, 'YYYY-MM-DD')
        INTO v_dec, v_dec_date
        FROM public.cron_task_decisions ctd
       WHERE ctd.jobname = r.name
          OR (v_target IS NOT NULL AND ctd.jobname = v_target)
       ORDER BY (ctd.jobname = r.name) DESC
       LIMIT 1;
    END IF;

    -- Une SECONDE tâche visant la même fonction — y compris sous un autre
    -- nom — est un état ambigu : la migration de désarmement refuse de
    -- s'exécuter dans cet état, et la surveillance le crie tant qu'il dure.
    v_dup := v_target IS NOT NULL AND EXISTS (
      SELECT 1 FROM cron.job j2
       WHERE j2.command ~ ('functions/v1/' || v_target)
         AND j2.jobid <> r.jobid
    );

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
      --
      -- NOUVEAUTÉ (2026-09-14) : les états intentionnels se lisent comme
      -- tels — mais un secret EN CLAIR reste critique même sur un job
      -- désactivé (la valeur vivrait dans chaque sauvegarde), et une
      -- réactivation sans secret Vault valide reste un échec visible.
      CASE
        WHEN NOT v_decisions_read
                                 THEN 'INDETERMINE : registre des decisions produit illisible'
        WHEN v_plain             THEN 'CRITIQUE : secret EN CLAIR dans cron.job.command'
                                      || ' — deplacer vers le coffre ET TOURNER la valeur'
        WHEN v_dup               THEN 'ALERTE : plusieurs taches visent '
                                      || COALESCE(v_target, '?')
                                      || ' — arbitrer, une seule doit exister'
        WHEN v_dec = 'desactivee_par_decision_produit' AND NOT r.act
                                 THEN 'DESACTIVEE (decision produit du ' || v_dec_date
                                      || ') — intentionnel, pas une panne'
        WHEN v_dec = 'desactivee_par_decision_produit' AND r.act
             AND v_secret <> 'coffre, lu a l execution'
                                 THEN 'CRITIQUE : reactivee SANS secret Vault valide'
                                      || ' — 401 garanti (decision produit du '
                                      || v_dec_date || ' contournee)'
        WHEN v_dec = 'desactivee_par_decision_produit' AND r.act
                                 THEN 'ALERTE : active avec secret du coffre mais toujours'
                                      || ' marquee desactivee par decision produit ('
                                      || v_dec_date || ') — trancher'
        WHEN v_dec = 'publication_manuelle_seulement' AND r.act
                                 THEN 'ALERTE : publieur cron present malgre la decision'
                                      || ' « publication manuelle uniquement » ('
                                      || v_dec_date || ')'
        WHEN v_dec = 'publication_manuelle_seulement'
                                 THEN 'DESARMEE (decision : publication manuelle uniquement)'
        WHEN v_secret = 'VIDE'   THEN 'CRITIQUE : secret vide, 401 garanti'
        WHEN NOT r.act           THEN 'DESARMEE'
        WHEN NOT v_runs_read     THEN 'INDETERMINE : historique pg_cron illisible'
        -- Une tache replanifiee n a PAS d historique : cron.unschedule +
        -- cron.schedule cree un NOUVEAU jobid, et cron.job_run_details ne suit
        -- pas l ancien. « jamais executee » avec un retard metier NUL et LU est
        -- donc l etat normal entre la replanification et le premier passage.
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

  -- Les décisions dont la tâche est ABSENTE de cron.job : c'est aussi un état
  -- conforme (daily-horoscope-push désplanifiée à la main, ou
  -- publish-scheduled-posts qui n'a jamais eu de publieur). Sans cette passe,
  -- l'absence se lirait « rien à signaler » — or une décision qui ne se voit
  -- nulle part n'existe pas.
  --
  -- La variable de boucle s'appelle « dec » et non « d » : en PL/pgSQL, une
  -- variable du même nom qu'un alias FROM (ici « d », utilisé pour
  -- cron.job_run_details dans la lecture d'historique) est substituée dans la
  -- requête et la casse. Constaté à la première application du 14 septembre :
  -- toutes les tâches passaient INDETERMINE — fail-visible, donc honnête,
  -- mais une perte de signal évitable.
  IF v_decisions_read THEN
    FOR dec IN
      SELECT ctd.jobname AS dname,
             ctd.decision AS ddec,
             to_char(ctd.decided_at, 'YYYY-MM-DD') AS ddate
        FROM public.cron_task_decisions ctd
       WHERE NOT EXISTS (
         SELECT 1 FROM cron.job j
          WHERE j.jobname = ctd.jobname
             OR j.command LIKE '%functions/v1/' || ctd.jobname || '%'
       )
       ORDER BY 1
    LOOP
      IF dec.ddec = 'desactivee_par_decision_produit' THEN
        v_verdict := 'CONFORME : desactivee et absente de cron.job'
                     || ' (decision produit du ' || dec.ddate || ')';
      ELSE
        v_verdict := 'CONFORME : aucun cron publieur'
                     || ' (decision produit du ' || dec.ddate || ')';
      END IF;

      -- Les NULL sont CASTES EXPLICITEMENT : RETURN QUERY est plus strict
      -- qu'un INSERT — un NULL nu dans une liste SELECT est typé text par le
      -- parseur, et text ne se laisse pas convertir implicitement vers
      -- boolean/timestamptz/integer. Constaté à l'application du 14 septembre :
      -- la transaction a avorté avant COMMIT, rien n'a été appliqué — le
      -- comportement de repli voulu, mais pour une raison évitable.
      RETURN QUERY SELECT
        dec.dname,
        '(aucune tache)',
        NULL::text,
        NULL::boolean,
        '-',
        NULL::timestamptz,
        NULL::text,
        NULL::integer,
        v_verdict;
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_cron_edge_health() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_cron_edge_health() TO service_role;

COMMENT ON FUNCTION public.check_cron_edge_health IS
  'JUNO-30 + JUNO-09. Sante des taches cron qui appellent une fonction edge. Juge sur le RESULTAT (retard metier, reponses non-2xx) et non sur la configuration, et distingue depuis 2026-09-14 les etats INTENTIONNELS (registre cron_task_decisions) des pannes : une tache desactivee par decision produit se lit DESACTIVEE, une tache reactivee sans secret Vault valide reste CRITIQUE.';

-- ---------------------------------------------------------------------------
-- Auto-vérification — la migration refuse de committer autrement.
--
-- REJOUABILITÉ : aucune exigence ci-dessous ne porte sur l'existence du job ou
-- de son historique. Une migration de schéma doit s'appliquer telle quelle sur
-- une base neuve, une restauration ou un environnement de test, où ni le job
-- ni cron.job_run_details n'existent. La PRÉSERVATION de l'historique relève
-- du diagnostic opérateur APRÈS application
-- (supabase/tests/diagnose_juno30_horoscope_closure.sql), uniquement lorsque
-- le job existait avant la migration.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows     INTEGER;
  v_active   BOOLEAN;
  v_verdict  TEXT;
BEGIN
  -- 1. Le registre existe, porte exactement les deux décisions, et personne
  --    d'autre que service_role ne peut le lire — ni l'écrire.
  IF to_regclass('public.cron_task_decisions') IS NULL THEN
    RAISE EXCEPTION 'le registre des decisions n existe pas';
  END IF;
  SELECT count(*) INTO v_rows FROM public.cron_task_decisions;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'registre des decisions : % lignes, 2 attendues', v_rows;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cron_task_decisions
                  WHERE jobname = 'daily-horoscope-push'
                    AND decision = 'desactivee_par_decision_produit') THEN
    RAISE EXCEPTION 'decision daily-horoscope-push absente du registre';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cron_task_decisions
                  WHERE jobname = 'publish-scheduled-posts'
                    AND decision = 'publication_manuelle_seulement') THEN
    RAISE EXCEPTION 'decision publish-scheduled-posts absente du registre';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.cron_task_decisions'::regclass) THEN
    RAISE EXCEPTION 'RLS inactive sur cron_task_decisions';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(ARRAY['anon', 'authenticated']) AS client_role,
           unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS priv
     WHERE has_table_privilege(client_role, 'public.cron_task_decisions', priv)
  ) THEN
    RAISE EXCEPTION 'un role client peut lire ou modifier cron_task_decisions';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.cron_task_decisions', 'SELECT') THEN
    RAISE EXCEPTION 'service_role ne peut pas lire cron_task_decisions';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS priv
     WHERE has_table_privilege('service_role', 'public.cron_task_decisions', priv)
  ) THEN
    RAISE EXCEPTION 'service_role peut ecrire dans cron_task_decisions : lecture seule attendue';
  END IF;

  -- 2. daily-horoscope-push : zéro ou une tâche — jamais active, et aucune
  --    seconde tâche visant la fonction sous un autre nom.
  SELECT count(*) INTO v_rows
    FROM cron.job j
   WHERE j.jobname = 'daily-horoscope-push'
      OR j.command LIKE '%functions/v1/send-daily-horoscope%';
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'etat ambigu : % tache(s) portent le nom ou visent send-daily-horoscope', v_rows;
  END IF;
  SELECT active INTO v_active FROM cron.job WHERE jobname = 'daily-horoscope-push';
  IF v_active IS NOT NULL AND v_active THEN
    RAISE EXCEPTION 'daily-horoscope-push est encore active';
  END IF;

  -- 3. La supervision reconnait l'état intentionnel — mesuré, pas supposé.
  --    Les DEUX formes conformes sont acceptées : la tâche désarmée
  --    (« DESACTIVEE ») sur une base où elle existait, ou absente
  --    (« CONFORME : désactivée et absente ») sur une base neuve.
  IF to_regprocedure('public.check_cron_edge_health()') IS NULL THEN
    RAISE EXCEPTION 'la fonction de sante n existe pas';
  END IF;
  IF has_function_privilege('anon', 'public.check_cron_edge_health()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.check_cron_edge_health()', 'EXECUTE')
     OR has_function_privilege('public', 'public.check_cron_edge_health()', 'EXECUTE') THEN
    RAISE EXCEPTION 'la fonction de sante est appelable par un role client';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.check_cron_edge_health()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role ne peut pas appeler la fonction de sante';
  END IF;

  SELECT count(*) INTO v_rows FROM public.check_cron_edge_health();
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'aucune ligne rendue par la supervision : elle ne surveille rien';
  END IF;

  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'daily-horoscope-push';
  IF v_verdict IS NULL
     OR (v_verdict NOT LIKE 'DESACTIVEE%'
         AND v_verdict NOT LIKE 'CONFORME : desactivee et absente%') THEN
    RAISE EXCEPTION 'la supervision ne reconnait pas la desactivation intentionnelle : « % »', v_verdict;
  END IF;

  SELECT verdict INTO v_verdict FROM public.check_cron_edge_health()
   WHERE jobname = 'publish-scheduled-posts';
  IF v_verdict IS NULL OR v_verdict NOT LIKE 'CONFORME : aucun cron publieur%' THEN
    RAISE EXCEPTION 'la supervision ne reconnait pas la decision publication manuelle : « % »', v_verdict;
  END IF;

  RAISE NOTICE 'JUNO-30 : etats intentionnels en place. % tache(s) surveillee(s).', v_rows;
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION (à exécuter pour l'exploitation, pas par ce fichier)
-- =============================================================================
--   SELECT * FROM public.check_cron_edge_health();
--
-- Attendu pour daily-horoscope-push : « DESACTIVEE (decision produit du
-- 2026-09-14) — intentionnel, pas une panne ».
-- Attendu pour publish-scheduled-posts : « CONFORME : aucun cron publieur
-- (decision produit du 2026-09-14) ».
--
-- Le lendemain, après 12:00 UTC : PLUS AUCUN 401 dans net._http_response à
-- 12:00 pile — c'était la signature quotidienne de la panne. Sa disparition
-- est la preuve comportementale du désarmement, complémentaire du verdict.
-- =============================================================================
