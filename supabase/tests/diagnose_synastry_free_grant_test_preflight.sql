-- =============================================================================
-- Diagnostic PRÉALABLE au test comportemental de la synastrie offerte
-- — STRICTEMENT LECTURE SEULE
-- =============================================================================
--
-- HOW TO RUN (production d'abord, sortie à fournir à l'opérateur) :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/diagnose_synastry_free_grant_test_preflight.sql
--
-- CE FICHIER NE CONTIENT NI INSERT, NI UPDATE, NI DELETE, NI DDL, NI GRANT,
-- NI AUCUN APPEL QUI CONSOMME UN QUOTA. Il ne fait que LIRE les catalogues et
-- les lignes de politique. Chaque contrôle rend une ligne :
--   | contrôle | observé | attendu | verdict |
-- Tout écart est BLOQUANT — jamais « OK par défaut » : un contrôle dont la
-- lecture est impossible rend BLOQUANT, pas vide.
--
-- POURQUOI CE FICHIER EXISTE : le test comportemental a déjà rencontré deux
-- incompatibilités avec le schéma réel (trigger Auth→profiles ; CHECK
-- subscriptions_source_check). Chaque erreur coûtait un cycle. Ce diagnostic
-- exécute AVANT, en lecture seule, les treize vérifications que l'audit a
-- identifiées — l'échec éventuel se lit en une table, sans toucher la base.
-- =============================================================================

WITH synth AS (
  SELECT ARRAY[
    'aaaaaaa1-0000-4000-8000-000000000001','aaaaaaa1-0000-4000-8000-000000000002',
    'aaaaaaa1-0000-4000-8000-000000000003','aaaaaaa1-0000-4000-8000-000000000004',
    'aaaaaaa1-0000-4000-8000-000000000005','aaaaaaa1-0000-4000-8000-000000000006',
    'aaaaaaa2-0000-4000-8000-00000000000a','aaaaaaa2-0000-4000-8000-00000000000b',
    'aaaaaaa2-0000-4000-8000-00000000000c'
  ]::uuid[] AS ids
),
trigger_auth AS (
  SELECT count(*)::text AS n, 'trigger_create_profile_on_auth_signup → handle_new_auth_user_profile' AS f
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n2 ON n2.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n2.nspname = 'auth' AND c.relname = 'users'
     AND p.proname = 'handle_new_auth_user_profile'
),
source_check AS (
  SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
   WHERE conrelid = 'public.subscriptions'::regclass
     AND conname = 'subscriptions_source_check'
),
subs_checks AS (
  SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ') AS def
    FROM pg_constraint
   WHERE conrelid = 'public.subscriptions'::regclass AND contype = 'c'
),
prof_checks AS (
  SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ') AS def
    FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass AND contype = 'c'
),
ev_checks AS (
  SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ') AS def
    FROM pg_constraint
   WHERE conrelid = 'public.product_events'::regclass AND contype = 'c'
),
fn AS (
  SELECT
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_product_event')::text AS rpe_overloads,
    (SELECT max(p.pronargs) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_product_event')::text AS rpe_args,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='synastry_preview_gate') AS gate_args,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='synastry_preview_gate') AS gate_result,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='claim_synastry_free_grant') AS claim_args,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='claim_synastry_free_grant') AS claim_result,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_synastry_candidate_profiles') AS picker_args,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='get_user_tier') AS tier_args,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='tier_at_least') AS cmp_args,
    (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='profile_chart_visible') AS vis_args
),
cols AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='auth' AND table_name='users'
        AND column_name IN ('instance_id','id','aud','role','email',
                            'encrypted_password','email_confirmed_at',
                            'created_at','updated_at'))::text AS auth_cols,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('id','email','name','birth_date','gender',
                            'is_active','onboarding_completed'))::text AS prof_cols,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='subscriptions'
        AND column_name IN ('user_id','tier','status','source','expires_at',
                            'cancel_at_period_end'))::text AS subs_cols,
    (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name='birth_date') AS birth_date_type
),
policy AS (
  SELECT required_tier::text, free_preview_quota::text
    FROM public.premium_feature_policy
   WHERE feature_key = 'synastry'
),
grants_state AS (
  -- to_regclass (et JAMAIS '…'::regclass, qui ERREUR si l'objet manque) :
  -- une migration non appliquée doit se LIRE « BLOQUANT », pas faire planter
  -- le diagnostic.
  SELECT
    to_regclass('public.synastry_free_grant') IS NOT NULL AS table_exists,
    to_regclass('public.idx_synastry_free_grant_purge') IS NOT NULL AS purge_index,
    (SELECT indisprimary FROM pg_index
      WHERE indrelid = to_regclass('public.synastry_free_grant')
        AND indisprimary
      LIMIT 1) AS has_pk
),
residue AS (
  SELECT (
    (SELECT count(*) FROM auth.users u, synth s WHERE u.id = ANY (s.ids)) +
    (SELECT count(*) FROM public.profiles p, synth s WHERE p.id = ANY (s.ids)) +
    (SELECT count(*) FROM public.subscriptions x, synth s WHERE x.user_id = ANY (s.ids)) +
    (SELECT count(*) FROM public.synastry_free_grant g, synth s
       WHERE g.viewer_user_id = ANY (s.ids) OR g.target_user_id = ANY (s.ids)) +
    (SELECT count(*) FROM public.product_events e, synth s WHERE e.user_id = ANY (s.ids))
  )::text AS n
    FROM synth
),
tier_values AS (
  -- Les valeurs de tier que les fixtures insèrent doivent être LÉGALES dans
  -- la CHECK réelle de subscriptions (lecture du catalogue, pas du fichier).
  SELECT (position('''premium''' in pg_get_constraintdef(oid)) > 0
          AND position('''premium_plus''' in pg_get_constraintdef(oid)) > 0) AS ok
    FROM pg_constraint
   WHERE conrelid = 'public.subscriptions'::regclass
     AND conname = 'subscriptions_tier_check'
)
SELECT contrôle, observé, attendu, verdict FROM (
  SELECT '1. trigger Auth→profile' AS contrôle,
         (SELECT n || ' → ' || f FROM trigger_auth) AS observé,
         '1 → handle_new_auth_user_profile' AS attendu,
         CASE WHEN (SELECT n FROM trigger_auth) = '1' THEN 'OK' ELSE 'BLOQUANT' END AS verdict
  UNION ALL
  SELECT '2. subscriptions_source_check',
         (SELECT COALESCE(def, 'ABSENT') FROM source_check),
         'CHECK contient stripe, app_store, play_store',
         CASE WHEN (SELECT COALESCE(def,'') FROM source_check) LIKE '%stripe%'
               AND (SELECT COALESCE(def,'') FROM source_check) LIKE '%app_store%'
               AND (SELECT COALESCE(def,'') FROM source_check) LIKE '%play_store%'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '3a. CHECKs subscriptions (liste)',
         (SELECT COALESCE(def, 'AUCUNE') FROM subs_checks),
         'liste lisible (audit manuel)',
         CASE WHEN (SELECT def IS NOT NULL FROM subs_checks) THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '3b. CHECKs profiles (liste)',
         (SELECT COALESCE(def, 'AUCUNE') FROM prof_checks),
         'liste lisible (audit manuel)',
         CASE WHEN (SELECT def IS NOT NULL FROM prof_checks) THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '3c. CHECKs product_events (liste)',
         (SELECT COALESCE(def, 'AUCUNE') FROM ev_checks),
         'liste lisible (AUCUNE attendu : la table n''en porte pas)',
         CASE WHEN (SELECT def IS NULL FROM ev_checks) THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '4a. signature synastry_preview_gate',
         (SELECT COALESCE(gate_args,'ABSENT') || ' → ' || COALESCE(gate_result,'?') FROM fn),
         '() → TABLE(code text, required_tier text)',
         CASE WHEN (SELECT gate_args FROM fn) = ''
               AND (SELECT gate_result FROM fn) LIKE '%code%'
               AND (SELECT gate_result FROM fn) LIKE '%required_tier%'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '4b. signature claim_synastry_free_grant',
         (SELECT COALESCE(claim_args,'ABSENT') || ' → ' || COALESCE(claim_result,'?') FROM fn),
         'p_target_user_id uuid → TABLE(code text, next_available_utc timestamptz)',
         CASE WHEN (SELECT claim_args FROM fn) LIKE '%uuid%'
               AND (SELECT claim_result FROM fn) LIKE '%code%'
               AND (SELECT claim_result FROM fn) LIKE '%next_available_utc%'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '4c. signature get_synastry_candidate_profiles',
         (SELECT COALESCE(picker_args,'ABSENT') FROM fn),
         'p_user_id uuid, p_limit integer',
         CASE WHEN (SELECT picker_args FROM fn) LIKE '%uuid%'
               AND (SELECT picker_args FROM fn) LIKE '%integer%'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '4d. signatures get_user_tier / tier_at_least / profile_chart_visible',
         (SELECT concat_ws(' ; ', tier_args, cmp_args, vis_args) FROM fn),
         'uuid ; text, text ; uuid, uuid',
         CASE WHEN (SELECT tier_args FROM fn) LIKE '%uuid%'
               AND (SELECT cmp_args FROM fn) LIKE '%text%'
               AND (SELECT vis_args FROM fn) LIKE '%uuid%'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '5. colonnes nécessaires (auth 9, profiles 7, subscriptions 6, birth_date date)',
         (SELECT auth_cols || ' / ' || prof_cols || ' / ' || subs_cols || ' / ' || birth_date_type FROM cols),
         '9 / 7 / 6 / date',
         CASE WHEN (SELECT auth_cols FROM cols) = '9'
               AND (SELECT prof_cols FROM cols) = '7'
               AND (SELECT subs_cols FROM cols) = '6'
               AND (SELECT birth_date_type FROM cols) = 'date'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '6. politique synastry présente',
         (SELECT COALESCE(required_tier, 'ABSENTE') FROM policy),
         'une ligne, celestial',
         CASE WHEN (SELECT required_tier FROM policy) = 'celestial' THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '7. required_tier = celestial',
         (SELECT COALESCE(required_tier, 'ABSENTE') FROM policy),
         'celestial',
         CASE WHEN (SELECT required_tier FROM policy) = 'celestial' THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '8. free_preview_quota = 1',
         (SELECT COALESCE(free_preview_quota, 'NULL') FROM policy),
         '1',
         CASE WHEN (SELECT free_preview_quota FROM policy) = '1' THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '9. table grants + PK + index de purge',
         (SELECT CASE WHEN table_exists THEN 'table' ELSE 'ABSENTE' END
                 || CASE WHEN COALESCE(has_pk,false) THEN ' + PK' ELSE ' + SANS PK' END
                 || CASE WHEN purge_index THEN ' + index' ELSE ' + SANS index' END
            FROM grants_state),
         'table + PK + index',
         CASE WHEN (SELECT table_exists AND COALESCE(has_pk,false) AND purge_index FROM grants_state)
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '10. les neuf UUID synthétiques sont absents',
         (SELECT n || ' ligne(s)' FROM residue),
         '0 ligne',
         CASE WHEN (SELECT n FROM residue) = '0' THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '11. record_product_event : 1 signature, 7 args (aucune surcharge)',
         (SELECT rpe_overloads || ' signature(s), ' || rpe_args || ' arg(s)' FROM fn),
         '1 signature, 7 args',
         CASE WHEN (SELECT rpe_overloads FROM fn) = '1'
               AND (SELECT rpe_args FROM fn) = '7'
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '12. tiers des fixtures légaux (premium, premium_plus dans la CHECK)',
         CASE WHEN (SELECT COALESCE(ok, false) FROM tier_values)
              THEN 'premium et premium_plus autorisés' ELSE 'CHECK ABSENTE ou incomplète' END,
         'les deux autorisés',
         CASE WHEN (SELECT COALESCE(ok, false) FROM tier_values) THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '13a. trigger welcome/onboarding présent (impact : enqueues EN TRANSACTION, ROLLBACK les emporte)',
         (SELECT count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n2 ON n2.oid=c.relnamespace
          WHERE NOT t.tgisinternal AND n2.nspname='public'
            AND c.relname='profiles' AND p.proname='schedule_onboarding_emails'),
         '1 (les enqueues vivent et meurent avec la transaction du test)',
         CASE WHEN (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                     JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n2 ON n2.oid=c.relnamespace
                    WHERE NOT t.tgisinternal AND n2.nspname='public'
                      AND c.relname='profiles' AND p.proname='schedule_onboarding_emails') = 1
              THEN 'OK' ELSE 'BLOQUANT' END
  UNION ALL
  SELECT '13b. CHECK gender de profiles couvre female',
         (SELECT COALESCE(def,'ABSENTE') FROM prof_checks),
         'la liste des CHECK contient female',
         CASE WHEN (SELECT COALESCE(def,'') FROM prof_checks) LIKE '%female%' THEN 'OK' ELSE 'BLOQUANT' END
) AS diag
ORDER BY substring(contrôle from '^[0-9]+')::int;
