/*
 * Vérification de la première vague de remédiation — 7 septembre 2026
 * docs/security-audit-2026-09-07.md  (JUNO-01, JUNO-02, JUNO-03, JUNO-08, JUNO-11)
 *
 * COMMENT L'UTILISER
 *   Coller ce fichier ENTIER dans l'éditeur SQL Supabase et exécuter.
 *   Lecture seule : aucun INSERT, UPDATE, DELETE, GRANT ni REVOKE.
 *   Rejouable autant de fois que voulu.
 *
 * RÉSULTAT ATTENDU
 *   Une grille de lignes. La colonne `ok` doit valoir `true` PARTOUT.
 *   La dernière ligne, `VERDICT`, résume : elle vaut `true` seulement si
 *   toutes les autres le sont.
 *
 * POURQUOI CE FICHIER EXISTE
 *   Les blocs de vérification vivaient en commentaire dans les migrations.
 *   Retirer les `--` pour les exécuter emportait aussi la prose qui les
 *   accompagnait, et PostgreSQL répondait `ERROR: 42P01: relation "another"
 *   does not exist`. Un contrôle qu'on ne peut pas coller est un contrôle
 *   qu'on saute. Tout ce qui suit est du SQL exécutable, sans exception.
 *
 * AUCUN OBJET MANQUANT NE FAIT ÉCHOUER LA REQUÊTE
 *   Les privilèges sont interrogés via `to_regclass` / `pg_proc`, jamais via
 *   `has_function_privilege('nom(args)')` qui lève une exception quand la
 *   fonction n'existe pas encore. Une migration non appliquée se lit donc
 *   comme `ok = false`, pas comme une erreur.
 */

WITH
grants AS (
  SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated')
),
proc AS (
  SELECT p.oid,
         p.proname,
         p.prosecdef,
         p.proconfig,
         pg_get_function_arguments(p.oid) AS args,
         pg_get_functiondef(p.oid)        AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind IN ('f', 'p')
),
checks AS (

  /* ===================================================================
   * JUNO-08 — un message livré est immuable pour son expéditeur
   * migration 20260907000002_messages_immutable.sql
   * =================================================================== */

  SELECT 1 AS ord,
         'JUNO-08' AS finding,
         'messages : aucun privilege mutateur pour anon/authenticated' AS check_name,
         NOT EXISTS (
           SELECT 1 FROM grants
            WHERE table_name = 'messages'
              AND privilege_type IN ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
         ) AS ok,
         COALESCE((
           SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
             FROM grants
            WHERE table_name = 'messages'
              AND privilege_type IN ('UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
         ), 'aucun') AS detail

  UNION ALL SELECT 2, 'JUNO-08',
         'messages : authenticated garde SELECT + INSERT (le produit marche)',
         EXISTS (SELECT 1 FROM grants WHERE table_name='messages' AND grantee='authenticated' AND privilege_type='SELECT')
         AND EXISTS (SELECT 1 FROM grants WHERE table_name='messages' AND grantee='authenticated' AND privilege_type='INSERT'),
         COALESCE((
           SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
             FROM grants WHERE table_name='messages' AND grantee='authenticated'
         ), 'aucun')

  UNION ALL SELECT 3, 'JUNO-08',
         'messages : anon ne detient rien',
         NOT EXISTS (SELECT 1 FROM grants WHERE table_name='messages' AND grantee='anon'),
         COALESCE((
           SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
             FROM grants WHERE table_name='messages' AND grantee='anon'
         ), 'aucun')

  UNION ALL SELECT 4, 'JUNO-08',
         'messages : RLS activee (le REVOKE ne remplace pas la RLS)',
         COALESCE((SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.messages')), false),
         'service_role et le proprietaire contournent les grants ; seule la RLS filtre les lignes'

  UNION ALL SELECT 5, 'JUNO-08',
         'messages : les accuses de lecture passent par un SECURITY DEFINER',
         EXISTS (SELECT 1 FROM proc WHERE proname='mark_conversation_messages_read' AND prosecdef),
         'sans lui, retirer UPDATE casserait les accuses de lecture'

  UNION ALL SELECT 6, 'JUNO-08',
         'messages : authenticated peut executer mark_conversation_messages_read',
         COALESCE((
           SELECT bool_or(has_function_privilege('authenticated', oid, 'EXECUTE'))
             FROM proc WHERE proname = 'mark_conversation_messages_read'
         ), false),
         'chemin de remplacement de l UPDATE retire'

  UNION ALL SELECT 7, 'JUNO-08',
         'messages : le trigger last_message_at est en place',
         EXISTS (
           SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = to_regclass('public.messages')
              AND NOT t.tgisinternal
              AND t.tgname = 'trigger_update_conversation_last_message'
         ),
         'AFTER INSERT, SECURITY DEFINER : envoyer un message doit toujours remonter le fil'

  /* ===================================================================
   * JUNO-02 — autorisation serveur pour le theme d autrui
   * migration 20260907000001_chart_access_control.sql
   * =================================================================== */

  UNION ALL SELECT 10, 'JUNO-02',
         'profile_chart_visible existe',
         EXISTS (SELECT 1 FROM proc WHERE proname = 'profile_chart_visible'),
         'predicat partage entre l edge function et le picker synastrie'

  UNION ALL SELECT 11, 'JUNO-02',
         'profile_chart_visible n est PAS appelable par un client',
         -- L EXISTS en tete n est pas decoratif. Sans lui, `bool_or` sur zero
         -- ligne rend NULL, le COALESCE le ramene a false, et `NOT false` fait
         -- passer le controle PARCE QUE la fonction est absente. Un controle
         -- negatif doit exiger que l objet existe, sinon il se felicite du vide.
         EXISTS (SELECT 1 FROM proc WHERE proname = 'profile_chart_visible')
         AND NOT COALESCE((
           SELECT bool_or(has_function_privilege('authenticated', oid, 'EXECUTE')
                       OR has_function_privilege('anon', oid, 'EXECUTE'))
             FROM proc WHERE proname = 'profile_chart_visible'
         ), false),
         CASE WHEN NOT EXISTS (SELECT 1 FROM proc WHERE proname = 'profile_chart_visible')
              THEN 'FONCTION ABSENTE : migration 20260907000001 non appliquee'
              ELSE 'elle prend le viewer en parametre : exposee, elle repondrait sur autrui' END

  UNION ALL SELECT 12, 'JUNO-02',
         'can_view_profile_chart est appelable par authenticated',
         COALESCE((
           SELECT bool_or(has_function_privilege('authenticated', oid, 'EXECUTE'))
             FROM proc WHERE proname = 'can_view_profile_chart'
         ), false),
         'appelee par get-profile-chart avec le JWT DE L APPELANT'

  UNION ALL SELECT 13, 'JUNO-02',
         'can_view_profile_chart n est PAS appelable par anon',
         EXISTS (SELECT 1 FROM proc WHERE proname = 'can_view_profile_chart')
         AND NOT COALESCE((
           SELECT bool_or(has_function_privilege('anon', oid, 'EXECUTE'))
             FROM proc WHERE proname = 'can_view_profile_chart'
         ), false),
         CASE WHEN NOT EXISTS (SELECT 1 FROM proc WHERE proname = 'can_view_profile_chart')
              THEN 'FONCTION ABSENTE : migration 20260907000001 non appliquee'
              ELSE 'un appelant sans identite n a aucune visibilite' END

  UNION ALL SELECT 14, 'JUNO-02',
         'can_view_profile_chart ne prend PAS de parametre viewer',
         COALESCE((
           SELECT bool_and(args ILIKE '%p_target_id%' AND args NOT ILIKE '%viewer%' AND args NOT ILIKE '%user_id%')
             FROM proc WHERE proname = 'can_view_profile_chart'
         ), false),
         COALESCE((SELECT string_agg(args, ' | ') FROM proc WHERE proname='can_view_profile_chart'), 'fonction absente')

  UNION ALL SELECT 15, 'JUNO-02',
         'les deux nouvelles fonctions epinglent search_path',
         -- Les DEUX doivent exister. `bool_and` sur une seule ligne passerait
         -- pendant que l autre fonction manque.
         (SELECT count(*) FROM proc WHERE proname IN ('profile_chart_visible','can_view_profile_chart')) = 2
         AND COALESCE((
           SELECT bool_and(EXISTS (
                    SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS c
                     WHERE c LIKE 'search_path=%'))
             FROM proc
            WHERE proname IN ('profile_chart_visible','can_view_profile_chart')
         ), false),
         CASE WHEN (SELECT count(*) FROM proc
                     WHERE proname IN ('profile_chart_visible','can_view_profile_chart')) < 2
              THEN 'FONCTION(S) ABSENTE(S) : migration 20260907000001 non appliquee'
              ELSE 'lint 0011 : un definer sans search_path est detournable' END

  UNION ALL SELECT 16, 'JUNO-02',
         'le picker synastrie verifie l abonnement',
         COALESCE((
           SELECT bool_and(def ILIKE '%premium_feature_policy%' AND def ILIKE '%premium_required%')
             FROM proc WHERE proname = 'get_synastry_candidate_profiles'
         ), false),
         'il renvoie de la donnee premium et ne verifiait aucun tier'

  UNION ALL SELECT 17, 'JUNO-02',
         'le picker et le lecteur partagent UN predicat de visibilite',
         COALESCE((
           SELECT bool_and(def ILIKE '%profile_chart_visible%')
             FROM proc WHERE proname = 'get_synastry_candidate_profiles'
         ), false),
         'deux copies derivent : le picker propose un profil que le lecteur se voit refuser'

  UNION ALL SELECT 19, 'JUNO-02',
         'le garde du picker echoue ferme si la politique manque',
         -- 20260907000001 lisait `premium_feature_policy` en ARGUMENT de
         -- tier_at_least. Ligne absente -> NULL -> `p_required IS NULL THEN
         -- TRUE` -> garde ouvert, sans erreur ni trace. 20260907000003 passe
         -- par une variable et refuse explicitement.
         COALESCE((
           SELECT bool_and(def LIKE '%premium_policy_missing%')
             FROM proc WHERE proname = 'get_synastry_candidate_profiles'
         ), false),
         CASE WHEN NOT EXISTS (SELECT 1 FROM proc WHERE proname = 'get_synastry_candidate_profiles')
              THEN 'RPC ABSENTE'
              WHEN NOT COALESCE((SELECT bool_and(def LIKE '%premium_policy_missing%')
                                   FROM proc WHERE proname='get_synastry_candidate_profiles'), false)
              THEN 'FAIL-OPEN : appliquer 20260907000003_synastry_gate_fail_closed.sql'
              ELSE 'une politique absente est un refus, pas une permission' END

  UNION ALL SELECT 18, 'JUNO-02',
         'get_synastry_candidate_profiles reste interdite a anon',
         EXISTS (SELECT 1 FROM proc WHERE proname = 'get_synastry_candidate_profiles')
         AND NOT COALESCE((
           SELECT bool_or(has_function_privilege('anon', oid, 'EXECUTE'))
             FROM proc WHERE proname = 'get_synastry_candidate_profiles'
         ), false),
         CASE WHEN NOT EXISTS (SELECT 1 FROM proc WHERE proname = 'get_synastry_candidate_profiles')
              THEN 'RPC ABSENTE : le picker synastrie n existe plus du tout'
              ELSE 'posture inchangee par la migration' END

  /* ===================================================================
   * Surfaces en lecture seule — vague du 3 septembre, re-verifiees
   * =================================================================== */

  UNION ALL SELECT 20, '3 sep #4',
         'conversations : aucun privilege mutateur pour un role client',
         NOT EXISTS (
           SELECT 1 FROM grants
            WHERE table_name = 'conversations'
              AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
         ),
         COALESCE((
           SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
             FROM grants
            WHERE table_name='conversations'
              AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
         ), 'aucun')

  UNION ALL SELECT 21, '3 sep #5',
         'discoverable_profiles : SELECT uniquement',
         NOT EXISTS (
           SELECT 1 FROM grants
            WHERE table_name = 'discoverable_profiles'
              AND privilege_type <> 'SELECT'
         ),
         COALESCE((
           SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
             FROM grants WHERE table_name='discoverable_profiles' AND privilege_type <> 'SELECT'
         ), 'aucun')

  UNION ALL SELECT 22, '23 aout',
         'premium_usage : non reinscriptible par son sujet',
         NOT EXISTS (
           SELECT 1 FROM grants
            WHERE table_name = 'premium_usage'
              AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
         ),
         COALESCE((
           SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
             FROM grants WHERE table_name='premium_usage'
              AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
         ), 'aucun')

  UNION ALL SELECT 23, '3 sep #7',
         'TRUNCATE : aucun role client ne le detient, sur aucune table',
         NOT EXISTS (SELECT 1 FROM grants WHERE privilege_type = 'TRUNCATE'),
         COALESCE((
           SELECT string_agg(DISTINCT table_name, ', ' ORDER BY table_name)
             FROM grants WHERE privilege_type = 'TRUNCATE'
         ), 'aucune')

  /* ===================================================================
   * P0 du 3 septembre — les colonnes PII de profiles
   * =================================================================== */

  UNION ALL SELECT 30, '3 sep #1',
         'profiles : aucune colonne PII lisible par un role client',
         NOT EXISTS (
           SELECT 1 FROM information_schema.column_privileges cp
            WHERE cp.table_schema = 'public'
              AND cp.table_name   = 'profiles'
              AND cp.privilege_type = 'SELECT'
              AND cp.grantee IN ('anon','authenticated')
              AND cp.column_name IN ('email','birth_date','birth_time','birth_latitude',
                                     'birth_longitude','birth_chart','push_token',
                                     'notification_preferences','referred_by')
         ),
         COALESCE((
           SELECT string_agg(DISTINCT cp.column_name, ', ' ORDER BY cp.column_name)
             FROM information_schema.column_privileges cp
            WHERE cp.table_schema='public' AND cp.table_name='profiles'
              AND cp.privilege_type='SELECT' AND cp.grantee IN ('anon','authenticated')
              AND cp.column_name IN ('email','birth_date','birth_time','birth_latitude',
                                     'birth_longitude','birth_chart','push_token',
                                     'notification_preferences','referred_by')
         ), 'aucune')

  UNION ALL SELECT 31, '3 sep #1',
         'profiles : aucun GRANT SELECT au niveau TABLE',
         NOT EXISTS (SELECT 1 FROM grants WHERE table_name='profiles' AND privilege_type='SELECT'),
         COALESCE((
           SELECT string_agg(grantee, ', ' ORDER BY grantee)
             FROM grants WHERE table_name='profiles' AND privilege_type='SELECT'
         ), 'aucun')

  UNION ALL SELECT 32, '3 sep #1',
         'le watchdog de posture PII est installe',
         to_regclass('public.security_posture_alerts') IS NOT NULL,
         'migration 20260903000004 ; les alertes ouvertes se lisent avec la 2e requete, en bas de ce fichier'

  /* ===================================================================
   * Posture generale
   * =================================================================== */

  UNION ALL SELECT 40, 'general',
         'toute fonction SECURITY DEFINER de public epingle search_path',
         NOT EXISTS (
           SELECT 1 FROM proc
            WHERE prosecdef
              AND NOT EXISTS (
                SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS c
                 WHERE c LIKE 'search_path=%'
              )
         ),
         COALESCE((
           SELECT string_agg(proname, ', ' ORDER BY proname)
             FROM proc
            WHERE prosecdef
              AND NOT EXISTS (
                SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS c
                 WHERE c LIKE 'search_path=%'
              )
         ), 'aucune')

  UNION ALL SELECT 41, 'general',
         'RLS activee sur toutes les tables de public',
         NOT EXISTS (
           SELECT 1 FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
         ),
         COALESCE((
           SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
         ), 'aucune')

  /* ===================================================================
   * Etat des migrations — trie en tete de grille (ord negatif) pour que
   * la premiere chose lue soit « qu est-ce qui est applique ».
   * =================================================================== */

  UNION ALL SELECT -2, 'MIGRATION',
         '20260907000001_chart_access_control appliquee',
         (SELECT count(*) FROM proc
           WHERE proname IN ('profile_chart_visible','can_view_profile_chart')) = 2,
         CASE WHEN (SELECT count(*) FROM proc
                     WHERE proname IN ('profile_chart_visible','can_view_profile_chart')) = 2
              THEN 'les deux fonctions sont en place'
              ELSE 'A APPLIQUER. NE PAS DEPLOYER get-profile-chart avant : il echoue ferme sans can_view_profile_chart et repondrait 503 a tout le monde.' END

  UNION ALL SELECT -1, 'MIGRATION',
         '20260907000002_messages_immutable appliquee',
         NOT EXISTS (
           SELECT 1 FROM grants
            WHERE table_name = 'messages'
              AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
         ),
         'JUNO-08 : un message livre est immuable pour son expediteur'
)

SELECT ord, finding, check_name, ok, detail FROM checks
UNION ALL
SELECT 999,
       'VERDICT',
       CASE WHEN bool_and(ok) THEN 'TOUT EST VERT' ELSE 'AU MOINS UN CONTROLE A ECHOUE' END,
       bool_and(ok),
       count(*) FILTER (WHERE NOT ok)::text || ' echec(s) sur ' || count(*)::text || ' controles'
       || CASE
            WHEN bool_and(ok) THEN ''
            WHEN bool_and(ok) FILTER (WHERE finding <> 'JUNO-02' AND ord <> -2)
              THEN ' — tous dans JUNO-02 : appliquer 20260907000001_chart_access_control.sql, puis relancer'
            ELSE ' — lire la colonne detail ligne par ligne'
          END
  FROM checks
ORDER BY ord;


/*
 * Requête 2 — alertes de posture PII ouvertes.
 *
 * Séparée de la précédente parce qu'elle NOMME une table : si la migration
 * 20260903000004 n'a pas été appliquée, PostgreSQL refuse la requête au moment
 * de la planifier, et la requête 1 ne renderait plus sa grille. Deux
 * instructions, deux résultats, aucune dépendance entre elles.
 *
 * Attendu : zéro ligne. Une ligne signifie qu'un GRANT a rouvert les colonnes
 * PII de `profiles` — c'est exactement l'incident du 3 septembre 2026.
 */
SELECT id, detected_at, check_key, detail
  FROM public.security_posture_alerts
 WHERE resolved_at IS NULL
 ORDER BY detected_at DESC;


/*
 * Requête 3 — comportement réel de profile_chart_visible (JUNO-02).
 *
 * Les requêtes 1 et 2 vérifient la POSTURE : les objets existent, les
 * privilèges sont les bons. Celle-ci vérifie la DÉCISION : le prédicat
 * répond-il vraiment « non » à un couple bloqué, « oui » à une conversation
 * existante ?
 *
 * Elle trouve ses propres échantillons dans la base. Rien à remplacer : la
 * version précédente de ce contrôle vivait en commentaire avec des
 * placeholders `<viewer-uuid>`, et collée telle quelle elle répondait
 * `ERROR: 22P02: invalid input syntax for type uuid`. Un contrôle qu'il faut
 * éditer avant de le lancer est un contrôle qu'on lance mal.
 *
 * Lecture seule. À exécuter APRÈS la migration 20260907000001 : elle nomme
 * `public.profile_chart_visible`, donc sans elle PostgreSQL refuse la requête.
 *
 * Colonne `statut` :
 *   OK           le prédicat a répondu ce qu'il devait
 *   ECHEC        il a répondu autre chose — c'est un vrai défaut
 *   NON TESTABLE la base ne contient pas d'échantillon pour ce cas
 *                (aucun couple bloqué, aucune conversation…). Ce n'est pas
 *                un échec, c'est une absence de matière.
 */
WITH
un_profil AS (
  SELECT p.id
    FROM public.profiles p
   WHERE COALESCE(p.is_active, true) = true
     AND p.onboarding_completed = true
     AND p.name IS NOT NULL AND p.name <> ''
   ORDER BY p.created_at
   LIMIT 1
),
un_blocage AS (
  SELECT b.blocker_id, b.blocked_id
    FROM public.blocked_users b
    JOIN public.profiles pa ON pa.id = b.blocker_id
    JOIN public.profiles pb ON pb.id = b.blocked_id
   LIMIT 1
),
une_conversation AS (
  SELECT c.user_a, c.user_b
    FROM public.conversations c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = c.user_a AND b.blocked_id = c.user_b)
         OR (b.blocker_id = c.user_b AND b.blocked_id = c.user_a)
   )
   LIMIT 1
),
un_inactif AS (
  SELECT (SELECT id FROM un_profil) AS viewer, p.id AS target
    FROM public.profiles p
   WHERE COALESCE(p.is_active, true) = false
     AND p.id <> (SELECT id FROM un_profil)
   LIMIT 1
),
scenarios AS (
  SELECT 1 AS ord,
         'son propre theme' AS scenario,
         true AS attendu,
         (SELECT public.profile_chart_visible(id, id) FROM un_profil) AS obtenu,
         'c est sa donnee ; les ecrans premium en ont besoin comme cote gauche' AS pourquoi

  UNION ALL SELECT 2,
         'cible que le lecteur a bloquee',
         false,
         (SELECT public.profile_chart_visible(blocker_id, blocked_id) FROM un_blocage),
         'sens 1 : je ne vois pas le theme de qui j ai bloque'

  UNION ALL SELECT 3,
         'cible qui a bloque le lecteur',
         false,
         (SELECT public.profile_chart_visible(blocked_id, blocker_id) FROM un_blocage),
         'sens 2 : le controle des DEUX cotes, que l ancienne fonction ne faisait pas du tout'

  UNION ALL SELECT 4,
         'conversation existante, sens A vers B',
         true,
         (SELECT public.profile_chart_visible(user_a, user_b) FROM une_conversation),
         'une conversation autorise, meme si les preferences ont change depuis'

  UNION ALL SELECT 5,
         'conversation existante, sens B vers A',
         true,
         (SELECT public.profile_chart_visible(user_b, user_a) FROM une_conversation),
         'symetrique : les deux participants se voient'

  UNION ALL SELECT 6,
         'cible desactivee',
         false,
         (SELECT public.profile_chart_visible(viewer, target) FROM un_inactif),
         'un compte inactif ne rend rien, ni theme ni existence'
)
SELECT ord,
       scenario,
       attendu,
       obtenu,
       CASE
         WHEN obtenu IS NULL THEN 'NON TESTABLE'
         WHEN obtenu IS NOT DISTINCT FROM attendu THEN 'OK'
         ELSE 'ECHEC'
       END AS statut,
       CASE
         WHEN obtenu IS NULL THEN 'aucun echantillon en base pour ce cas'
         ELSE pourquoi
       END AS detail
  FROM scenarios
 ORDER BY ord;
