-- =============================================================================
-- JUNO-30 — diagnostic de fermeture du push horoscope (AVANT / APRÈS / J+1)
-- =============================================================================
--
-- LECTURE SEULE UNIQUEMENT. Aucune écriture, aucun secret affiché.
--
-- Trois passes, aux moments qui donnent chacune une preuve différente :
--
--   Passe A — AVANT l'application de 20260914000001 :
--     état de la panne (tâche active, secret vide, 401 quotidien).
--   Passe B — APRÈS application :
--     la tâche est désarmée, le verdict est intentionnel, l'historique est
--     préservé SI le job existait avant (c'est ici que cette vérification
--     vit — pas dans la migration, qui doit rester rejouable sur base neuve).
--   Passe C — le lendemain, APRÈS le passage de 12:00 UTC :
--     aucun nouveau 401 depuis la passe B : la signature quotidienne de la
--     panne a disparu. C'est la preuve comportementale de fermeture.
--
-- Comment l'exécuter : éditeur SQL Supabase, ou psql via l'API/pooler.
-- Noter les résultats de chaque passe (copie de la sortie, datée).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tâches visant send-daily-horoscope — par le NOM ou par la CIBLE.
--    Une seconde tâche sous un autre nom est un état ambigu : la migration
--    refuse de s'appliquer dans cet état, et ce diagnostic doit le montrer.
-- ---------------------------------------------------------------------------
SELECT j.jobname,
       j.active,
       j.schedule,
       (j.command LIKE '%vault.decrypted_secrets%')               AS lit_le_coffre,
       COALESCE(
         (regexp_match(j.command, '''x-[a-z-]+-secret''\s*,\s*''([^'']*)'''))[1],
         (regexp_match(j.command, '"x-[a-z-]+-secret"\s*:\s*"([^"]*)"'))[1]
       ) IS NOT NULL                                              AS litteral_non_vide
  FROM cron.job j
 WHERE j.jobname = 'daily-horoscope-push'
    OR j.command LIKE '%functions/v1/send-daily-horoscope%'
 ORDER BY j.jobname;
-- Attendu passe A : 1 ligne, active = true, lit_le_coffre = false,
--                    litteral_non_vide = false (le littéral est VIDE).
-- Attendu passe B : 1 ligne, active = false (mêmes schedule/commande), ou
--                    0 ligne si la tâche a été désplanifiée autrement.

-- ---------------------------------------------------------------------------
-- 2. Verdicts de supervision pour les deux décisions.
-- ---------------------------------------------------------------------------
SELECT jobname, target, active, secret_state, verdict
  FROM public.check_cron_edge_health()
 WHERE jobname IN ('daily-horoscope-push', 'publish-scheduled-posts')
 ORDER BY jobname;
-- Attendu passe A : « CRITIQUE : secret vide, 401 garanti » /
--                    « CONFORME : aucun cron publieur ».
-- Attendu passe B : « DESACTIVEE (decision produit du 2026-09-14) » ou
--                    « CONFORME : desactivee et absente de cron.job » /
--                    « CONFORME : aucun cron publieur ».

-- ---------------------------------------------------------------------------
-- 3. Historique des 401 (fenêtre pg_net, courte — elle ne couvre que
--    quelques heures) : nombre et dernier 401. La passe B note le « dernier
--    401 » comme repère ; la passe C vérifie qu'aucun 401 n'apparaît après.
-- ---------------------------------------------------------------------------
SELECT count(*)                    AS total_401_dans_la_fenetre,
       max(created)::timestamp(0)  AS dernier_401
  FROM net._http_response
 WHERE status_code = 401;
-- Attendu passe A (si exécuté après 12:00 UTC) : ≥ 1, dernier_401 aujourdhui
--    à 12:00 UTC pile.
-- Attendu passe C : nouveau total nul AU-DELÀ du repère noté en passe B.

-- ---------------------------------------------------------------------------
-- 3. PASSAGE DE 12:00 UTC — PREUVE PRINCIPALE SUR L'IDENTITÉ DU CRON DÉSARMÉ.
--
--    Corrigé le 14 septembre (revue) : compter TOUS les 401 de pg_net
--    empêcherait à tort la fermeture — d'autres tâches y produisent des 401
--    (et des réponses sans statut) qui ne sont pas les siens. La preuve de
--    fermeture porte sur LES PASSAGES du job désarmé : pg_cron n'exécute pas
--    un job inactive, et son historique est la source qui lui est propre.
--    Le repère est le dernier_401 noté en passe B : 2026-09-14 12:00:00+00.
--
--    CORRECTION D'EXPLOITATION (15 septembre) : le repère tronqué à la seconde
--    fait compter le passage-repère LUI-MÊME (« 12:00:00.059869 » > « 12:00:00 »
--    par 59,869 ms) — un faux positif. Pour toute passe future, utiliser comme
--    repère l'horodatage EXACT en microsecondes du dernier passage, ou la
--    prochaine échéance planifiée — jamais un seuil générique « repère + 1 s »,
--    qui pourrait masquer une véritable exécution décalée d'une seconde.
--    Repère exact consigné : 2026-09-14 12:00:00.059869+00.
-- ---------------------------------------------------------------------------
SELECT
  j.jobid,
  j.jobname,
  j.active,
  count(r.*) FILTER (
    WHERE r.start_time > TIMESTAMPTZ '2026-09-14 12:00:00+00'
  ) AS passages_apres_repere,
  max(r.start_time) AS dernier_passage
FROM cron.job AS j
LEFT JOIN cron.job_run_details AS r
  ON r.jobid = j.jobid
WHERE
  j.jobname = 'daily-horoscope-push'
  OR j.command LIKE '%functions/v1/send-daily-horoscope%'
GROUP BY j.jobid, j.jobname, j.active;
-- Attendu passe C : active = false · passages_apres_repere = 0 ·
--                   dernier_passage = 2026-09-14 12:00:00+00.
-- Tout autre résultat = le désarmement n'a pas tenu, ou une seconde tâche
-- vise la fonction (la requête 1 la montrerait).

-- Indicateur SECONDAIRE seulement — un nouveau 401 global ne doit PAS être
-- attribué à daily-horoscope-push sans corrélation supplémentaire (pg_net ne
-- relie pas une réponse à la tâche émettrice) :
--   SELECT count(*)
--     FROM net._http_response
--    WHERE status_code = 401
--      AND created > TIMESTAMPTZ '2026-09-14 12:00:00+00';

-- ---------------------------------------------------------------------------
-- 4. Préservation de l'historique — uniquement SI le job existait avant la
--    migration. (Sur une base neuve ou une restauration sans le job, cette
--    requête rend zéro SANS qu'il y ait rien à préserver : c'est pour cela
--    qu'elle vit ici et pas dans la migration.)
-- ---------------------------------------------------------------------------
SELECT count(*)                   AS passages_histories_conserves,
       min(d.start_time)::timestamp(0) AS plus_ancien,
       max(d.start_time)::timestamp(0) AS plus_recent
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
 WHERE j.jobname = 'daily-horoscope-push';
-- Attendu passe B (job préexistant) : compte ≥ au total noté en passe A —
--    le désarmement n'a rien nettoyé. Les preuves historiques (142 nuits de
--    JUNO-29, les 401 d'avril à septembre) restent auditables.

-- ---------------------------------------------------------------------------
-- 5. Privilèges du registre des décisions (passe B, lecture seule).
-- ---------------------------------------------------------------------------
SELECT has_table_privilege('anon', 'public.cron_task_decisions', 'SELECT')          AS anon_lit,
       has_table_privilege('authenticated', 'public.cron_task_decisions', 'SELECT') AS auth_lit,
       has_table_privilege('service_role', 'public.cron_task_decisions', 'SELECT')  AS service_lit,
       has_table_privilege('service_role', 'public.cron_task_decisions', 'DELETE')  AS service_ecrit;
-- Attendu : false / false / true / false.
