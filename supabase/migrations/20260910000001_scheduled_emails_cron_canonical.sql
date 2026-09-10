-- =============================================================================
-- JUNO-31 — le secret du cron de courrier était écrit en clair dans cron.job
-- =============================================================================
--
-- PÉRIMÈTRE : les tâches cron qui appellent `send-scheduled-emails`, et rien
-- d'autre. `daily-horoscope-push` porte un défaut voisin et reste soumise à un
-- arbitrage produit distinct : la réparer enverrait une notification poussée à
-- tous les comptes au passage suivant. Elle n'est pas touchée ici.
--
-- MESURÉ LE 9 SEPTEMBRE 2026 (lecture seule)
-- ---------------------------------------------------------------------------
--   DEUX tâches visaient la même fonction edge :
--
--     process-scheduled-emails   */5  · 200 · secret EN CLAIR dans la commande
--     send-scheduled-emails      */15 · 401 · secret VIDE dans la commande
--
--   La première n'est créée par AUCUNE migration : elle a été planifiée à la
--   main. C'est elle qui fait réellement partir le courrier de cycle de vie, et
--   c'est elle qui portait la valeur de SCHEDULED_EMAILS_SECRET en clair.
--   La seconde est celle que le dépôt décrit (20260824000001:43) et elle répond
--   401 quatre fois par heure depuis qu'elle existe.
--
--   La dérive était donc DU BON CÔTÉ : rejouer les migrations pour « remettre
--   d'aplomb » aurait gardé la cassée et retiré celle qui fonctionne.
--
-- NATURE DU CONSTAT — à ne pas surqualifier
-- ---------------------------------------------------------------------------
-- EXPOSITION CONFIRMÉE d'un secret applicatif, pas un privilège excessif et
-- pas une compromission de la clé `service_role`. La valeur se trouvait dans
-- `cron.job.command`, donc dans chaque sauvegarde de la base et lisible par
-- tout rôle capable de lire cette table ; elle s'est également affichée dans un
-- terminal le 9 septembre 2026 pendant le diagnostic.
--
-- PORTÉE DU SECRET : il autorise à DÉCLENCHER `send-scheduled-emails`. Un tiers
-- qui le détiendrait pourrait forcer l'envoi anticipé de courriels déjà en
-- file. Il ne permet ni d'en fabriquer, ni de lire un profil, ni de contourner
-- RLS. Sérieux, non critique — et suffisant pour justifier une rotation, parce
-- que la valeur a quitté son périmètre.
--
-- CE QUE CE FICHIER FAIT
-- ---------------------------------------------------------------------------
--   * une SEULE tâche subsiste, `scheduled-emails-dispatch`, toutes les
--     5 minutes — la cadence de celle qui fonctionne aujourd'hui ;
--   * le secret est lu dans le COFFRE À CHAQUE PASSAGE : `cron.job.command` ne
--     porte que son NOM, jamais sa valeur, et une rotation ne demande plus de
--     replanifier ;
--   * un garde `public._assert_cron_secret` précède l'appel : un secret absent
--     fait ÉCHOUER le passage, visible dans `cron.job_run_details.status`, au
--     lieu d'envoyer un en-tête nul et de récolter un 401 silencieux ;
--   * les deux tâches historiques sont supprimées ;
--   * aucun COALESCE vers la chaîne vide, aucun EXCEPTION WHEN OTHERS : un
--     prérequis manquant fait échouer cette migration.
--
-- Elle est ACTIVE dès l'application, à l'inverse de 20260909000001. La raison
-- est asymétrique : une tâche de suppression désarmée ne détruit rien, tandis
-- qu'une tâche de courrier désarmée arrête la livraison. Rien n'est supprimé
-- ici, donc rien ne justifie de laisser le courrier en panne.
--
-- SI CE FICHIER ÉCHOUE — ce que la transaction restaure, et ce qu'elle ne
-- restaure pas
-- ---------------------------------------------------------------------------
-- `cron.job` est une table ordinaire : un échec d'assertion annule la
-- transaction et les deux tâches historiques sont replacées telles quelles.
--
-- Cela restaure la TOPOLOGIE, pas la LIVRAISON. À ce point de la procédure, la
-- nouvelle valeur est déjà posée dans les secrets de la fonction edge (étape 3
-- du runbook), alors que la tâche historique envoie l'ANCIENNE — celle qui est
-- exposée. Elle répond donc 401 à chaque passage, et le courrier reste en
-- attente.
--
-- « Tout est intact » serait faux. Corriger et rejouer immédiatement est la
-- seule suite ; ne jamais reposer l'ancienne valeur pour « faire repartir » la
-- tâche historique.
--
-- PRÉREQUIS — cette migration ÉCHOUERA sans lui
-- ---------------------------------------------------------------------------
-- Le secret doit être dans le coffre sous le nom **cron_scheduled_emails_secret**
-- — le nom que 20260824000001:29 ATTEND — et valoir EXACTEMENT la variable
-- d'environnement SCHEDULED_EMAILS_SECRET de la fonction edge.
--
-- Attendre un nom n'est pas le créer : vérifié le 10 septembre 2026, ce secret
-- **n'existe pas** dans le coffre. Seuls y figurent les trois que
-- 20260419000005 a réellement créés. C'est d'ailleurs pourquoi 20260824000001 a
-- figé une chaîne vide dans sa commande, et pourquoi la tâche */15 répond 401
-- depuis qu'elle existe. Il faut donc `vault.create_secret`, pas
-- `vault.update_secret`.
--
-- La procédure ordonnée, avec la génération de la valeur sans jamais
-- l'afficher, est dans docs/runbooks/scheduled-emails-cron-2026-09.md.
--
-- NE JAMAIS reposer l'ancienne valeur : elle est exposée. La rotation est le
-- seul chemin, et elle va vers l'avant.
--
-- LE PIÈGE À CONNAÎTRE AVANT DE REJOUER QUOI QUE CE SOIT
-- ---------------------------------------------------------------------------
-- 20260824000001:52 et 20260419000005 construisent leur commande ainsi :
--
--     'x-…-secret', %L        avec  v_secret := public._load_cron_secret(…)
--
-- `%L` MATÉRIALISE la valeur dans `cron.job.command`. Ces deux migrations n'ont
-- rien exposé parce que le coffre était vide au moment où elles ont tourné —
-- elles ont écrit une chaîne vide, ce qui est JUNO-29. Mais **les rejouer une
-- fois le coffre garni écrirait la NOUVELLE valeur en clair**, et recréerait
-- JUNO-31 avec le secret fraîchement tourné.
--
-- Elles sont livrées : on ne les modifie pas. `npm run validate:cron-secrets`
-- les épingle nommément comme exceptions connues et échoue sur toute NOUVELLE
-- occurrence du motif.
--
-- IDEMPOTENT : CREATE OR REPLACE + unschedule gardé par EXISTS + schedule.
-- Rejouable sans effet de bord.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Prérequis. Chacun fait échouer la migration s'il manque.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
  v_len   INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION
      'extension supabase_vault absente : sans elle le secret retournerait en clair dans cron.job.command, c est exactement JUNO-31';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'extension pg_cron absente : la tache ne peut pas etre planifiee';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'extension pg_net absente : la commande ne pourrait pas emettre de requete';
  END IF;

  -- Les fonctions requises, pas seulement les extensions : une extension
  -- installee dans un schema inattendu laisserait la commande cron echouer a
  -- chaque passage, silencieusement.
  IF to_regprocedure('cron.schedule(text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'cron.schedule(text, text, text) introuvable';
  END IF;
  IF to_regprocedure('cron.unschedule(text)') IS NULL THEN
    RAISE EXCEPTION 'cron.unschedule(text) introuvable';
  END IF;
  -- Par le NOM, pas par la signature : celle de pg_net a changé entre versions
  -- (le nombre et l'ordre des paramètres par défaut), et une assertion trop
  -- stricte bloquerait la migration sur un projet parfaitement sain. La
  -- commande appelle la fonction en arguments nommés, donc seule sa présence
  -- est décidable ici.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'net' AND p.proname = 'http_post'
  ) THEN
    RAISE EXCEPTION 'net.http_post introuvable dans le schema net';
  END IF;

  -- EXACTEMENT un secret sous ce nom. Deux lignes homonymes rendraient la
  -- sous-requete de la commande non deterministe.
  SELECT count(*) INTO v_count
    FROM vault.decrypted_secrets v
   WHERE v.name = 'cron_scheduled_emails_secret';

  IF v_count = 0 THEN
    RAISE EXCEPTION
      'secret vault "cron_scheduled_emails_secret" absent. Le poser AVANT (voir le runbook). Pas de repli : c est precisement ce que COALESCE(..., '''') avalait.';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION
      'plusieurs secrets vault nommes "cron_scheduled_emails_secret" (%) : la commande cron lirait une valeur non deterministe', v_count;
  END IF;

  -- Pas de COALESCE. Une absence doit remonter, pas devenir ''.
  SELECT length(v.decrypted_secret) INTO v_len
    FROM vault.decrypted_secrets v
   WHERE v.name = 'cron_scheduled_emails_secret';

  IF v_len IS NULL OR v_len = 0 THEN
    RAISE EXCEPTION 'secret vault "cron_scheduled_emails_secret" vide : la fonction repondrait 401 a chaque passage';
  END IF;

  -- Plancher a 32. Celui de 20260909000001 etait a 16, et une valeur de
  -- 16 caracteres est effectivement passee le 9 septembre. Un secret partage
  -- qui vit dans une variable d environnement se genere a 64 hexadecimaux ;
  -- 32 laisse de la marge sans rien accepter de faible.
  IF v_len < 32 THEN
    RAISE EXCEPTION
      'secret vault "cron_scheduled_emails_secret" trop court (< 32 caracteres) : generer 64 hexadecimaux, voir le runbook';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Le garde d'exécution.
-- ---------------------------------------------------------------------------
--
-- Sans lui, un secret retiré du coffre après coup donnerait un en-tête JSON
-- `null`, un 401 côté fonction, et un `succeeded` côté pg_cron — les trois
-- ingrédients de JUNO-29, réunis à nouveau. Avec lui, le passage ÉCHOUE, et
-- `cron.job_run_details.status = 'failed'` est un signal qu'un humain peut voir.
--
-- Il ne RETOURNE PAS le secret : il lève, ou ne fait rien. Un lecteur qui
-- parviendrait à l'appeler n'apprend que la présence, jamais la valeur — et
-- les rôles clients n'y ont pas accès.
CREATE OR REPLACE FUNCTION public._assert_cron_secret(p_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_len INTEGER;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RAISE EXCEPTION 'nom de secret vault manquant';
  END IF;

  SELECT length(v.decrypted_secret) INTO v_len
    FROM vault.decrypted_secrets v
   WHERE v.name = p_name;

  -- LE MÊME plancher que le prérequis du bloc 1, et pour une raison précise :
  -- le bloc 1 ne s'exécute qu'à l'installation. Sans ce `< 32` ici, un
  -- `vault.update_secret` posant une valeur courte après coup serait accepté à
  -- chaque passage — la migration refuserait à l'installation ce que le garde
  -- laisserait ensuite passer. Deux planchers divergents ne sont pas deux
  -- contrôles, c'est un contrôle et une porte.
  IF v_len IS NULL OR v_len < 32 THEN
    RAISE EXCEPTION
      'secret vault "%" absent, vide ou trop court : passage interrompu',
      p_name;
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public._assert_cron_secret(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._assert_cron_secret(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public._assert_cron_secret(TEXT) FROM authenticated;

COMMENT ON FUNCTION public._assert_cron_secret IS
  'JUNO-31. Leve si un secret vault est absent ou vide. Ne retourne jamais sa valeur. Appelee en tete de commande cron pour qu un secret manquant produise un passage FAILED plutot qu un 401 silencieux compte comme succeeded.';

-- ---------------------------------------------------------------------------
-- 3. Une seule tâche, lisant le coffre à l'exécution.
-- ---------------------------------------------------------------------------
--
-- Le nom `scheduled-emails-dispatch` est NEUF, délibérément. Reprendre l'un des
-- deux noms historiques rendrait l'assertion « aucune tâche legacy ne subsiste »
-- indécidable sur le nom seul.
--
-- AUCUN en-tête `Authorization`. `config.toml:409` déclare `verify_jwt = false`
-- pour cette fonction, et la tâche qui fonctionne aujourd'hui n'en envoie
-- aucun : l'en-tête de secret EST l'authentification. Les deux tâches
-- historiques en portaient un, construit sur un GUC vide, ce qui produisait
-- `Bearer ` — sans effet, et trompeur. Y mettre une clé de service élargirait
-- le pouvoir de la requête sans rien apporter.
--
-- PAS de EXCEPTION WHEN OTHERS : si quelque chose manque, échouer est
-- l'information utile.
DO $$
DECLARE
  v_url TEXT;
BEGIN
  -- `app.settings.supabase_url` n'est PAS posé sur ce projet — vérifié le
  -- 9 septembre 2026. Le repli est donc le chemin RÉEL, pas une précaution
  -- théorique. Ce COALESCE-ci est légitime là où celui du secret ne l'était
  -- pas : son défaut est une valeur UTILISABLE, pas la chaîne vide. La faute
  -- n'est jamais le mot-clé, c'est ce vers quoi il retombe.
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/send-scheduled-emails';

  IF v_url !~ '^https://[a-z0-9.-]+/functions/v1/send-scheduled-emails$' THEN
    RAISE EXCEPTION 'URL cible invalide : %', v_url;
  END IF;

  -- Les deux tâches historiques, puis la canonique elle-même pour que le
  -- fichier soit rejouable.
  PERFORM cron.unschedule('process-scheduled-emails')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-emails');

  PERFORM cron.unschedule('send-scheduled-emails')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-scheduled-emails');

  PERFORM cron.unschedule('scheduled-emails-dispatch')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-emails-dispatch');

  PERFORM cron.schedule(
    'scheduled-emails-dispatch',
    '*/5 * * * *',
    format(
      $cron$
      SELECT public._assert_cron_secret('cron_scheduled_emails_secret');
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduled-emails-secret',
            (SELECT v.decrypted_secret FROM vault.decrypted_secrets v
              WHERE v.name = 'cron_scheduled_emails_secret')
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_url
    )
  );
END
$$;

-- ---------------------------------------------------------------------------
-- Auto-vérification. Chaque point de la commande, et l'absence des anciennes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cmd     TEXT;
  v_active  BOOLEAN;
  v_sched   TEXT;
  v_targets INTEGER;
  v_legacy  TEXT;
BEGIN
  SELECT command, active, schedule INTO v_cmd, v_active, v_sched
    FROM cron.job WHERE jobname = 'scheduled-emails-dispatch';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'la tache canonique n a pas ete planifiee';
  END IF;

  -- (a) une seule tâche, et active.
  IF NOT v_active THEN
    RAISE EXCEPTION 'la tache canonique est inactive : le courrier de cycle de vie ne partirait plus';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'scheduled-emails-dispatch') <> 1 THEN
    RAISE EXCEPTION 'plusieurs taches portent le nom canonique';
  END IF;

  -- (b) le calendrier.
  IF v_sched <> '*/5 * * * *' THEN
    RAISE EXCEPTION 'calendrier attendu */5 * * * *, obtenu : %', v_sched;
  END IF;

  -- (c) la bonne URL, la bonne fonction, et UNE SEULE.
  IF v_cmd !~ 'https://[a-z0-9.-]+/functions/v1/send-scheduled-emails' THEN
    RAISE EXCEPTION 'la commande ne vise pas l URL attendue';
  END IF;
  IF (SELECT count(DISTINCT m[1])
        FROM regexp_matches(v_cmd, 'functions/v1/([a-z-]+)', 'g') AS m) <> 1 THEN
    RAISE EXCEPTION 'la commande vise plusieurs fonctions edge';
  END IF;

  -- (d) AUCUN secret littéral, dans NI L'UNE NI L'AUTRE des deux formes.
  -- La seconde est celle qui a échappé au contrôle de 20260909000002 pendant
  -- une journée : c'était la forme employée par la tâche exposée.
  IF v_cmd ~ '''x-[a-z-]+-secret''\s*,\s*''' THEN
    RAISE EXCEPTION 'la commande porte un en-tete de secret litteral (forme jsonb_build_object) : JUNO-31 reintroduit';
  END IF;
  IF v_cmd ~ '"x-[a-z-]+-secret"\s*:\s*"' THEN
    RAISE EXCEPTION 'la commande porte un en-tete de secret litteral (forme JSON) : JUNO-31 reintroduit';
  END IF;

  -- (e) la référence exacte au coffre, par son nom.
  IF v_cmd !~ 'vault\.decrypted_secrets' THEN
    RAISE EXCEPTION 'la commande ne lit pas le coffre a l execution';
  END IF;
  IF v_cmd !~ 'cron_scheduled_emails_secret' THEN
    RAISE EXCEPTION 'la commande ne reference pas le secret vault attendu';
  END IF;
  IF v_cmd !~ '_assert_cron_secret\(''cron_scheduled_emails_secret''\)' THEN
    RAISE EXCEPTION 'le garde d execution est absent de la commande';
  END IF;

  -- (f) aucune tâche legacy, ni par le nom, ni par la cible. La seconde
  -- assertion est la forte : elle attrape une troisième tâche planifiée à la
  -- main, qui est exactement l'origine de ce constat.
  SELECT string_agg(jobname, ', ') INTO v_legacy
    FROM cron.job
   WHERE jobname IN ('process-scheduled-emails', 'send-scheduled-emails');
  IF v_legacy IS NOT NULL THEN
    RAISE EXCEPTION 'tache(s) historique(s) encore planifiee(s) : %', v_legacy;
  END IF;

  SELECT count(*) INTO v_targets
    FROM cron.job
   WHERE command ~ 'functions/v1/send-scheduled-emails';
  IF v_targets <> 1 THEN
    RAISE EXCEPTION
      '% tache(s) visent send-scheduled-emails ; il doit y en avoir exactement une', v_targets;
  END IF;

  -- (g) le garde existe, et aucun rôle client ne peut l'appeler.
  IF to_regprocedure('public._assert_cron_secret(text)') IS NULL THEN
    RAISE EXCEPTION 'public._assert_cron_secret est absente';
  END IF;
  IF has_function_privilege('anon', 'public._assert_cron_secret(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._assert_cron_secret(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'le garde est appelable par un role client';
  END IF;

  RAISE NOTICE 'Tache canonique scheduled-emails-dispatch en place : */5, secret lu dans le coffre, aucune tache historique.';
END
$$;

COMMIT;

-- =============================================================================
-- APRÈS APPLICATION — ce que cette migration NE prouve pas
-- =============================================================================
--
-- Elle prouve la CONFIGURATION. Elle ne peut pas prouver l'EFFET :
-- `net.http_post` est asynchrone, sa réponse arrive après la transaction, et
-- `cron.job_run_details.status = 'succeeded'` signifie seulement que la requête
-- a été MISE EN FILE. C'est cette confusion qui a coûté 142 nuits sur JUNO-29.
--
-- La preuve de l'effet se lit en trois temps, et le diagnostic
-- supabase/tests/diagnose_scheduled_emails_cron.sql les rend en une requête :
--
--   1. une réponse 2xx après l'application  -> l'authentification fonctionne
--   2. `backlog = 0`                        -> le courrier en file part
--   3. aucun littéral dans cron.job.command -> le constat est fermé
--
-- ATTENTION À L'ORDRE, SINON UNE FENÊTRE DE 401
-- ---------------------------------------------------------------------------
-- La nouvelle valeur doit être posée dans le coffre ET dans les secrets de la
-- fonction edge. Entre les deux, la tâche répond 401 à chaque passage, soit au
-- plus 5 minutes de 401 par écart. Aucun courriel n'est perdu : `status`
-- reste `pending` et le passage suivant les reprend. La procédure ordonnée est
-- dans docs/runbooks/scheduled-emails-cron-2026-09.md.
--
-- RETOUR ARRIÈRE — il n'existe PAS de « retour à l'état précédent »
-- ---------------------------------------------------------------------------
-- L'état précédent contenait un secret exposé. Le restaurer serait remettre en
-- service une valeur qui a quitté son périmètre. Le retour arrière est donc
-- partiel et il va vers l'avant :
--
--   * suspendre la livraison, sans réintroduire quoi que ce soit :
--       SELECT cron.alter_job(
--         (SELECT jobid FROM cron.job WHERE jobname = 'scheduled-emails-dispatch'),
--         active := false);
--
--   * déclencher un passage à la main, avec les mêmes gardes : voir le runbook.
--
--   * NE JAMAIS réappliquer 20260824000001 ni 20260419000005 : leur `%L`
--     matérialiserait la nouvelle valeur dans cron.job.command.
--
--   * NE JAMAIS reposer l'ancienne valeur, dans le coffre comme dans les
--     secrets de la fonction edge.
