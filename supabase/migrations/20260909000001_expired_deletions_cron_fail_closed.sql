-- =============================================================================
-- JUNO-29 — le cron de suppression définitive n'a jamais rien supprimé
-- =============================================================================
--
-- PÉRIMÈTRE : l'authentification et la remise en fonction de
-- `process-expired-deletions`, et rien d'autre. La supervision des appels edge
-- par pg_cron est un constat distinct, traité par 20260909000002.
--
-- MESURÉ LE 9 SEPTEMBRE 2026 (lecture seule, preuves dans
-- docs/runbooks/expired-deletions-cron-2026-09.md §1)
-- ---------------------------------------------------------------------------
--   tâche process-expired-deletions   0 3 * * *, active, vise la bonne fonction
--   secret dans la commande           VIDE
--   exécutions enregistrées           142, dont 142 « réussies »
--   comptes expirés non supprimés     8  ·  retard le plus ancien : 114 jours
--   objets qui deviendront orphelins  1 (un avatar) · 0 média de vérification
--   coffre Supabase                   disponible
--
-- CAUSE RACINE — le même défaut, écrit deux fois
-- ---------------------------------------------------------------------------
-- 20260419000004:46-49 puis 20260419000005 via `public._load_cron_secret` :
--
--     v_secret := COALESCE(current_setting('app.settings.…', TRUE), '');
--     …
--     EXCEPTION WHEN OTHERS THEN RAISE NOTICE '… — reschedule manually';
--
-- Le paramètre n'a jamais été posé, `current_setting(…, TRUE)` rend NULL,
-- COALESCE en fait '', et la commande a été FIGÉE avec un en-tête
-- `x-expired-deletions-secret` vide. `process-expired-deletions/index.ts:51-52`
-- la refuse — correctement — par un 401. `config.toml:411` déclare
-- `verify_jwt = false` pour cette fonction : le refus vient donc bien de son
-- propre contrôle de secret, pas de la passerelle.
--
-- Deux constructions fail-open dans le même bloc : un défaut qui vaut « pas de
-- secret », et un gestionnaire qui empêche l'échec d'être vu.
--
-- CE QUE CE FICHIER FAIT, ET CE QU'IL NE FAIT PAS
-- ---------------------------------------------------------------------------
--   * le secret est lu dans le COFFRE, À L'EXÉCUTION : `cron.job.command` ne
--     porte plus aucune valeur sensible, et une rotation ne demande plus de
--     replanifier ;
--   * aucun COALESCE vers la chaîne vide, aucun EXCEPTION WHEN OTHERS : un
--     secret absent fait ÉCHOUER cette migration ;
--   * la tâche est replanifiée **INACTIVE**. Elle ne supprimera rien tant que
--     la vérification contrôlée n'aura pas prouvé un 2xx. L'activation est une
--     étape manuelle, distincte, décrite en fin de fichier.
--
-- Elle ne supprime donc AUCUN compte par elle-même.
--
-- PRÉREQUIS — cette migration ÉCHOUERA sans lui
-- ---------------------------------------------------------------------------
-- Le secret doit être dans le coffre sous le nom **cron_expired_deletions_secret**
-- — le nom que 20260419000005 a établi — et valoir EXACTEMENT la variable
-- d'environnement EXPIRED_DELETIONS_SECRET de la fonction edge :
--
--     SELECT vault.create_secret('<valeur>', 'cron_expired_deletions_secret',
--                                'JUNO-29 — en-tete du cron de suppression');
--
-- Si la valeur d'origine est perdue, en poser une NOUVELLE des deux côtés :
--     supabase secrets set EXPIRED_DELETIONS_SECRET=<nouvelle>
--     SELECT vault.create_secret('<la meme>', 'cron_expired_deletions_secret', …);
-- Un secret déjà présent se met à jour par `vault.update_secret`, pas par un
-- second `create_secret` du même nom.
--
-- Ne JAMAIS écrire cette valeur dans une migration, un commit, un journal ou
-- l'historique du terminal.
--
-- IDEMPOTENT : unschedule + schedule + alter_job, rejouable sans effet de bord.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Le secret doit exister et être utilisable. Sinon : échec.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_len INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION
      'extension supabase_vault absente : sans elle, le secret retournerait en clair dans cron.job.command';
  END IF;

  -- Pas de COALESCE. Une absence doit remonter, pas se transformer en ''.
  SELECT length(v.decrypted_secret) INTO v_len
    FROM vault.decrypted_secrets v
   WHERE v.name = 'cron_expired_deletions_secret';

  IF v_len IS NULL THEN
    RAISE EXCEPTION
      'secret vault "cron_expired_deletions_secret" absent. Le poser AVANT (voir l en-tete). C est exactement ce que COALESCE(..., '''') avalait depuis avril.';
  END IF;
  IF v_len = 0 THEN
    RAISE EXCEPTION 'secret vault "cron_expired_deletions_secret" vide : la fonction repondrait 401, comme depuis avril';
  END IF;
  IF v_len < 16 THEN
    RAISE EXCEPTION 'secret vault "cron_expired_deletions_secret" trop court (< 16 caracteres)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Replanifier — en lisant le coffre à l'exécution, et INACTIVE
-- ---------------------------------------------------------------------------
--
-- Le secret n'est PAS interpolé : la commande porte une sous-requête sur
-- `vault.decrypted_secrets`, résolue à chaque passage.
--
-- pg_cron exécute la commande sous le rôle qui l'a planifiée ; le bloc 1 vient
-- de prouver, dans cette même session, que ce rôle lit le coffre.
--
-- L'en-tête `Authorization` n'est ajouté que si le coffre porte une clé de
-- service. Il était construit à partir d'un GUC vide, ce qui produisait
-- `Bearer ` — sans effet ici (`verify_jwt = false`) mais inutile et trompeur.
--
-- PAS de EXCEPTION WHEN OTHERS : si pg_cron ou pg_net manquent, échouer est
-- l'information utile.
DO $$
DECLARE
  v_url   TEXT;
  v_jobid BIGINT;
BEGIN
  -- `app.settings.supabase_url` n'est PAS pose sur ce projet — verifie le
  -- 9 sep 2026, en meme temps que le secret. Le repli est donc le chemin REEL,
  -- pas une precaution theorique : c'est l'URL que les onze migrations
  -- existantes utilisent deja.
  --
  -- Ce COALESCE-ci est legitime la ou celui du secret ne l'etait pas : son
  -- defaut est une valeur UTILISABLE, pas la chaine vide. La difference n'est
  -- pas le mot-cle, c'est ce vers quoi il retombe.
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/process-expired-deletions';

  -- Et on le verifie quand meme : un GUC pose plus tard avec une valeur
  -- malformee produirait une URL invalide, figee dans la commande cron.
  IF v_url !~ '^https://[a-z0-9.-]+/functions/v1/process-expired-deletions$' THEN
    RAISE EXCEPTION 'URL cible invalide : %', v_url;
  END IF;

  PERFORM cron.unschedule('process-expired-deletions')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-expired-deletions');

  SELECT cron.schedule(
    'process-expired-deletions',
    '0 3 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-expired-deletions-secret',
            (SELECT v.decrypted_secret FROM vault.decrypted_secrets v
              WHERE v.name = 'cron_expired_deletions_secret')
        ) || COALESCE(
          (SELECT jsonb_build_object('Authorization', 'Bearer ' || v.decrypted_secret)
             FROM vault.decrypted_secrets v WHERE v.name = 'service_role_key'),
          '{}'::jsonb
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_url
    )
  ) INTO v_jobid;

  -- INACTIVE. Rien ne sera supprime tant qu un humain n aura pas valide la
  -- verification controlee. Reactiver est une etape manuelle et separee.
  PERFORM cron.alter_job(v_jobid, active := false);
END
$$;

-- ---------------------------------------------------------------------------
-- Auto-vérification : les deux moitiés.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cmd    TEXT;
  v_active BOOLEAN;
  v_sched  TEXT;
BEGIN
  SELECT command, active, schedule INTO v_cmd, v_active, v_sched
    FROM cron.job WHERE jobname = 'process-expired-deletions';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'la tache n a pas ete planifiee';
  END IF;

  -- Elle lit le coffre à l'exécution…
  IF v_cmd !~ 'vault\.decrypted_secrets' THEN
    RAISE EXCEPTION 'la commande ne lit pas le coffre : le secret serait fige en clair';
  END IF;

  -- …et ne porte AUCUN en-tête de secret littéral, vide ou non. C'est le
  -- défaut d'origine, et c'est la seule assertion qui l'aurait attrapé.
  IF v_cmd ~ '''x-expired-deletions-secret''\s*,\s*''' THEN
    RAISE EXCEPTION 'la commande porte encore un en-tete litteral : defaut d origine reintroduit';
  END IF;

  IF v_cmd !~ 'functions/v1/process-expired-deletions' THEN
    RAISE EXCEPTION 'la commande ne vise pas la fonction attendue';
  END IF;

  -- Elle ne doit viser QUE cette fonction.
  IF (SELECT count(DISTINCT m[1]) FROM regexp_matches(v_cmd, 'functions/v1/([a-z-]+)', 'g') AS m) <> 1 THEN
    RAISE EXCEPTION 'la commande vise plusieurs fonctions edge';
  END IF;

  IF v_sched <> '0 3 * * *' THEN
    RAISE EXCEPTION 'l horaire attendu 0 3 * * * a change : %', v_sched;
  END IF;

  -- Et elle est bien DÉSARMÉE.
  IF v_active THEN
    RAISE EXCEPTION 'la tache est active : la verification controlee doit preceder la reactivation';
  END IF;

  RAISE NOTICE 'Commande corrigee, secret lu dans le coffre, tache INACTIVE — verification controlee requise.';
END
$$;

COMMIT;

-- =============================================================================
-- SUITE — VÉRIFICATION CONTRÔLÉE, PUIS RÉACTIVATION
-- =============================================================================
--
-- Cette migration prouve la CONFIGURATION. Elle ne peut pas prouver l'EFFET :
-- `net.http_post` est asynchrone, sa réponse arrive après la transaction. La
-- confusion entre les deux est exactement ce qui a coûté 142 nuits.
--
-- ATTENTION — l'étape 1 ci-dessous SUPPRIME DÉFINITIVEMENT 8 comptes. Mesuré :
-- un seul possède un objet de stockage (un avatar), aucune vidéo de
-- vérification n'est concernée. Cet avatar deviendra orphelin et devra être
-- comptabilisé dans le rattrapage historique de JUNO-09 — qui reste OUVERT.
--
-- 1. Déclencher UN passage, sous observation. Le bloc complet, avec ses gardes,
--    est dans docs/runbooks/expired-deletions-cron-2026-09.md §5 étape 4.
--
--    NE PAS écrire `url := current_setting('app.settings.supabase_url', TRUE)`
--    sans COALESCE : ce réglage n'est PAS posé sur ce projet (vérifié le 9 sep
--    2026), current_setting rend NULL, et net.http_post échoue sur la
--    contrainte NOT NULL de http_request_queue.url. C'est le même défaut que
--    celui que cette migration corrige, sous une troisième forme.
--
-- 2. Une minute plus tard, lire la RÉPONSE — c'est elle qui compte :
--
--      SELECT status_code, left(content, 200)
--        FROM net._http_response ORDER BY created DESC LIMIT 3;
--
--    Attendu : 200 et { "success": true, "deleted": 8, "failures": [] }.
--    Un 401 signifie que le secret du coffre diffère de la variable
--    d'environnement de la fonction edge — corriger, ne pas activer.
--
-- 3. Vérifier le résultat métier :
--
--      SELECT * FROM public.check_cron_edge_health();   -- 20260909000002
--
--    `backlog` doit être 0 pour process-expired-deletions.
--
-- 4. SEULEMENT ALORS, réactiver la tâche :
--
--      SELECT cron.alter_job(
--        (SELECT jobid FROM cron.job WHERE jobname = 'process-expired-deletions'),
--        active := true
--      );
--
-- 5. Relancer supabase/tests/diagnose_media_ownership.sql : un orphelin de plus
--    dans `avatars`, en attente du rattrapage JUNO-09.
--
-- RETOUR ARRIÈRE
-- ---------------------------------------------------------------------------
-- Avant l'étape 1 — rien n'a été supprimé. Désarmer suffit, et c'est déjà
-- l'état ; pour revenir strictement à l'existant :
--     -- réappliquer 20260419000005 (restaure la commande à secret vide)
--
-- Après l'étape 1 — les 8 suppressions sont IRRÉVERSIBLES. Le seul retour
-- arrière possible est d'arrêter les suivantes :
--     SELECT cron.alter_job(
--       (SELECT jobid FROM cron.job WHERE jobname = 'process-expired-deletions'),
--       active := false
--     );
--
-- Après l'étape 4 — même commande pour désarmer à nouveau. Aucune donnée
-- supprimée ne revient.
