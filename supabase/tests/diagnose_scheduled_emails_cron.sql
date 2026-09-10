-- =============================================================================
-- JUNO-31 — état des tâches cron qui appellent send-scheduled-emails
-- =============================================================================
--
-- STRICTEMENT EN LECTURE. Aucun INSERT, UPDATE, DELETE, aucun net.http_post,
-- aucune écriture dans le coffre. À exécuter avant ET après
-- 20260910000001_scheduled_emails_cron_canonical.sql : la colonne « attendu
-- APRÈS » de chaque ligne dit ce qui doit avoir changé.
--
-- AUCUNE VALEUR DE SECRET NE SORT D'ICI. Le contrôle 6 rend une LONGUEUR, le
-- contrôle 7 un BOOLÉEN. Une valeur en clair détectée est signalée par sa
-- présence, jamais reproduite — c'est précisément l'erreur qu'a commise le
-- diagnostic du 9 septembre, en affichant la commande brute dans un terminal.
--
-- Ce fichier a un doublon partiel avec check_cron_edge_health() (20260909000002)
-- et c'est voulu : celui-là surveille les quatre tâches en continu, celui-ci
-- répond à une question ponctuelle et le fait sans dépendre d'une fonction qui
-- pourrait ne pas être déployée.

CREATE OR REPLACE FUNCTION pg_temp.juno_q(p_sql TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $juno$
DECLARE
  v_out TEXT;
BEGIN
  EXECUTE p_sql INTO v_out;
  RETURN COALESCE(v_out, 'aucun resultat');
EXCEPTION WHEN OTHERS THEN
  -- Cette fonction-ci est un afficheur, pas un garde : une source illisible
  -- doit se lire « INDISPONIBLE », jamais « OK ». C'est la raison du libellé.
  RETURN 'INDISPONIBLE (' || SQLSTATE || ') : ' || left(SQLERRM, 110);
END;
$juno$;


SELECT
  n       AS "n",
  objet   AS "objet",
  valeur  AS "valeur",
  attendu AS "attendu APRES la migration",
  lecture AS "comment lire"
FROM (
  WITH cible AS (
    SELECT jobid, jobname, schedule, active, command
      FROM cron.job
     WHERE command ~ 'functions/v1/send-scheduled-emails'
  ),
  etat AS (
    SELECT
      jobname, schedule, active, command,
      -- Les DEUX formes d'en-tête. La seconde a échappé au contrôle de
      -- 20260909000002 pendant une journée, et c'était celle de la tâche
      -- exposée : un détecteur aveugle à une écriture rassure à tort.
      COALESCE(
        (regexp_match(command, '''x-[a-z-]+-secret''\s*,\s*''([^'']*)'''))[1],
        (regexp_match(command, '"x-[a-z-]+-secret"\s*:\s*"([^"]*)"'))[1]
      ) AS litteral,
      command ~ 'vault\.decrypted_secrets' AS lit_le_coffre
    FROM cible
  )

  SELECT 0 AS n,
    'A QUOI SERT CETTE REQUETE' AS objet,
    'etat des taches cron visant send-scheduled-emails' AS valeur,
    '—' AS attendu,
    'Lecture seule. Aucune valeur de secret ne sort d ici : longueurs et booleens uniquement. Executer AVANT et APRES la migration 20260910000001.' AS lecture

  UNION ALL SELECT 1,
    'combien de taches visent cette fonction ?',
    (SELECT count(*)::text FROM cible),
    'exactement 1',
    'C EST LE CONSTAT JUNO-31. Deux taches coexistaient : process-scheduled-emails (*/5, secret en clair, 200) et send-scheduled-emails (*/15, secret vide, 401). La premiere n est dans AUCUNE migration.'

  UNION ALL SELECT 2,
    'lesquelles, et a quelle cadence',
    COALESCE((SELECT string_agg(
                jobname || ' [' || schedule || ']' ||
                CASE WHEN active THEN '' ELSE ' (inactive)' END,
                '  |  ' ORDER BY jobname) FROM etat), 'aucune'),
    'scheduled-emails-dispatch [*/5 * * * *]',
    'le nom canonique est NEUF : reprendre un nom historique rendrait l assertion « aucune tache legacy » indecidable sur le nom seul'

  UNION ALL SELECT 3,
    'taches historiques encore planifiees',
    COALESCE((SELECT string_agg(jobname, ', ' ORDER BY jobname) FROM cron.job
               WHERE jobname IN ('process-scheduled-emails', 'send-scheduled-emails')), 'aucune'),
    'aucune',
    'les deux doivent avoir disparu. Il ne doit rester qu un seul publieur, et ce doit etre celui qui lit le coffre.'

  UNION ALL SELECT 4,
    '*** UN SECRET EST-IL EN CLAIR DANS UNE COMMANDE ? ***',
    COALESCE((SELECT CASE
                -- Zero ligne d abord. Un agregat sur un ensemble vide rend UNE
                -- ligne dont bool_or vaut NULL : le CASE tomberait sur ELSE et
                -- se lirait « non » alors qu il n y avait rien a verifier, et le
                -- COALESCE ci-dessous ne se declencherait jamais. C est le
                -- fail-open que ce fichier est cense debusquer.
                WHEN count(*) = 0
                  THEN 'aucune tache visant cette fonction : sans objet'
                WHEN bool_or(litteral IS NOT NULL AND litteral <> '')
                  THEN '*** OUI — ' ||
                       count(*) FILTER (WHERE litteral IS NOT NULL AND litteral <> '')::text ||
                       ' tache(s), longueur ' ||
                       max(length(litteral)) FILTER (WHERE litteral IS NOT NULL AND litteral <> '')::text ||
                       ' car. — EXPOSITION CONFIRMEE ***'
                WHEN bool_or(litteral = '') THEN 'non, mais en-tete VIDE : c est JUNO-29, 401 garanti'
                ELSE 'non'
              END
              FROM etat), 'aucune tache : sans objet'),
    'non',
    'La valeur n est PAS reproduite : seule sa longueur sort. Une exposition confirmee impose une ROTATION, pas seulement un deplacement vers le coffre — la valeur a quitte son perimetre.'

  UNION ALL SELECT 5,
    'la commande lit-elle le coffre a l execution ?',
    COALESCE((SELECT string_agg(jobname || ' = ' ||
                CASE WHEN lit_le_coffre THEN 'oui' ELSE 'NON' END,
                '  |  ' ORDER BY jobname) FROM etat), 'aucune tache'),
    'scheduled-emails-dispatch = oui',
    'lire le coffre a chaque passage est ce qui permet une rotation sans replanifier — et ce qui garde cron.job.command propre'

  UNION ALL SELECT 6,
    'le secret du coffre : present ? longueur ?',
    pg_temp.juno_q($q$
      SELECT CASE count(*)
               WHEN 0 THEN 'ABSENT — la migration echouera, c est voulu'
               WHEN 1 THEN 'present, ' || max(length(decrypted_secret))::text || ' caracteres'
               ELSE '*** ' || count(*)::text || ' homonymes — valeur non deterministe ***'
             END
        FROM vault.decrypted_secrets
       WHERE name = 'cron_scheduled_emails_secret'
    $q$),
    'present, 64 caracteres',
    'nom impose par 20260824000001:29. Le plancher de la migration est 32 : une valeur de 16 caracteres est passee le 9 septembre sur le plancher precedent.'

  UNION ALL SELECT 7,
    'le garde d execution est-il en place ?',
    CASE WHEN to_regprocedure('public._assert_cron_secret(text)') IS NULL
         THEN 'NON — migration 20260910000001 non appliquee'
         ELSE 'oui' END,
    'oui',
    'sans lui, un secret retire du coffre donne un en-tete nul, un 401, et un pg_cron « succeeded » : les trois ingredients de JUNO-29 reunis'

  UNION ALL SELECT 8,
    'dernier passage enregistre',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT to_char(max(d.start_time), 'YYYY-MM-DD HH24:MI') || ' UTC — ' ||
                (SELECT d2.status FROM cron.job_run_details d2
                  WHERE d2.jobid = d.jobid ORDER BY d2.start_time DESC LIMIT 1)
           FROM cron.job_run_details d
          WHERE d.jobid IN (SELECT jobid FROM cron.job
                             WHERE jobname = 'scheduled-emails-dispatch')
          GROUP BY d.jobid),
        'aucun passage : tache replanifiee, premier passage a venir')
    $q$),
    'moins de 5 minutes, succeeded',
    'ATTENTION : « succeeded » signifie que net.http_post a MIS EN FILE la requete. Il ne lit JAMAIS le code de reponse. C est ce qui a rendu JUNO-29 invisible 142 nuits. La preuve est au controle 9.'

  UNION ALL SELECT 9,
    'REPONSES HTTP attribuables a cette fonction',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        (SELECT string_agg(etiquette || ' x' || nb::text, '  |  ' ORDER BY etiquette)
           FROM (
             SELECT CASE
                      WHEN content LIKE '%"processed"%'      THEN '2xx (processed)'
                      WHEN content LIKE '%"Unauthorized"%'   THEN '401 (Unauthorized)'
                      ELSE 'autre code ' || COALESCE(status_code::text, 'nul')
                    END AS etiquette,
                    count(*) AS nb
               FROM net._http_response
              WHERE content LIKE '%"processed"%'
                 OR content LIKE '%"Unauthorized"%'
              GROUP BY 1
           ) s),
        'aucune reponse dans la fenetre pg_net')
    $q$),
    '2xx (processed) uniquement',
    'ATTRIBUTION PAR LE CORPS, faute de mieux : pg_net ne conserve PAS l URL dans _http_response. « processed » n est rendu que par send-scheduled-emails. « Unauthorized » avec un U MAJUSCULE est partage avec send-daily-horoscope — voir le controle 10 pour le departage.'

  UNION ALL SELECT 10,
    'departage des 401 : sont-ils les notres ?',
    pg_temp.juno_q($q$
      SELECT COALESCE(
        'hors 12:00 UTC (donc pas l horoscope) : ' ||
        count(*) FILTER (WHERE to_char(created, 'HH24:MI') <> '12:00')::text ||
        '   ·   a 12:00 UTC (horoscope probable) : ' ||
        count(*) FILTER (WHERE to_char(created, 'HH24:MI') = '12:00')::text,
        'aucun 401')
        FROM net._http_response
       WHERE content LIKE '%"Unauthorized"%'
    $q$),
    '0 hors 12:00 UTC',
    'daily-horoscope-push passe une fois par jour a 12:00 UTC et porte un secret VIDE : ses 401 sont attendus et restent soumis a un arbitrage produit distinct. Tout 401 HORS de cette minute vient du courrier.'

  UNION ALL SELECT 11,
    'fenetre reellement couverte par net._http_response',
    pg_temp.juno_q($q$
      SELECT to_char(min(created), 'YYYY-MM-DD HH24:MI') || ' -> ' ||
             to_char(max(created), 'HH24:MI') || ' UTC  (' ||
             round(extract(epoch FROM max(created) - min(created)) / 3600.0, 1)::text || ' h)'
        FROM net._http_response
    $q$),
    'quelques heures',
    'pg_net PURGE cette table au bout de quelques heures. Une absence de 401 sur une fenetre de 6 h ne prouve rien sur la semaine : c est pourquoi le retard metier du controle 12 est le signal fiable.'

  UNION ALL SELECT 12,
    'RETARD METIER — courriels en attente depuis plus de 2 h',
    (SELECT count(*)::text FROM public.scheduled_emails
      WHERE status = 'pending' AND scheduled_for < now() - INTERVAL '2 hours'),
    '0',
    'LA preuve qui compte. Elle mesure le produit, pas la plomberie : un 401 permanent la fait monter, un « succeeded » ne la fait pas descendre. Aucun courriel n est perdu pendant une fenetre de 401 — le statut reste pending et le passage suivant les reprend.'

  UNION ALL SELECT 13,
    'courriels en attente, toutes echeances confondues',
    (SELECT count(*)::text FROM public.scheduled_emails WHERE status = 'pending'),
    'variable, sans importance',
    'contexte du controle 12 : un pending dont l echeance est dans le futur est normal'

  UNION ALL SELECT 14,
    'UN SECRET EN CLAIR AILLEURS DANS cron.job ?',
    (SELECT CASE WHEN count(*) = 0 THEN 'aucune'
                 ELSE '*** ' || count(*)::text || ' tache(s) : ' ||
                      string_agg(jobname, ', ' ORDER BY jobname) || ' ***' END
       FROM cron.job
      WHERE command ~ '''x-[a-z-]+-secret''\s*,\s*''[^'']+'''
         OR command ~ '"x-[a-z-]+-secret"\s*:\s*"[^"]+"'),
    'aucune',
    'balayage de TOUTES les taches, pas seulement du courrier. daily-horoscope-push porte un en-tete VIDE (JUNO-29), ce qui ne compte pas ici. Une tache nommee est une exposition a traiter.'

  UNION ALL SELECT 15,
    'UN JWT EN CLAIR DANS UNE COMMANDE ?',
    (SELECT CASE WHEN count(*) = 0 THEN 'aucun'
                 ELSE '*** ' || count(*)::text || ' tache(s) : ' ||
                      string_agg(jobname, ', ' ORDER BY jobname) || ' ***' END
       FROM cron.job WHERE command ~ 'eyJ[A-Za-z0-9_-]{10,}'),
    'aucun',
    'LATENT, mesure a false le 9 sep 2026. 20260413000003 et 20260419000004 interpolent app.settings.supabase_service_role_key par %L : le GUC est vide, elles ont donc ecrit une chaine vide. Les rejouer avec le GUC pose ecrirait la CLE DE SERVICE en clair ici.'
) d
ORDER BY n;
