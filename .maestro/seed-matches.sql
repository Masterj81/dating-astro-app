-- Seed E2E test state in Supabase staging.
--
-- Three accounts, three tiers, deterministic premium_usage:
--   e2e_user1@example.com    -> premium_plus (Cosmic). All features granted.
--   e2e_user2@example.com    -> premium (Celestial). Celestial granted, Cosmic denied.
--   e2e_free@example.com     -> free. All features denied (trial pre-consumed).
-- Plus: a deterministic match between e2e_user1 and e2e_user2 for chat flows.
--
-- Run in the Supabase SQL Editor (staging project). Idempotent.
--
-- Prereqs (one-time, via Authentication -> Users -> Add user, Auto Confirm = on):
--   e2e_user1@example.com
--   e2e_user2@example.com
--   e2e_free@example.com
--   e2e_deletable@example.com   (optional, only used by hardened flow 09)

-- ============================================================================
-- Step 1: patch notify_new_match() and send_match_email() trigger functions.
-- 20260206_fix_security_warnings pinned them to search_path='' but their
-- bodies still referenced unqualified `profiles`, so any INSERT into matches
-- raised "42P01: relation profiles does not exist". Patched permanently in
-- migration 20260423_fix_notify_new_match_search_path.sql; re-applied here so
-- this seed is self-contained and can run in any environment.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_new_match() RETURNS TRIGGER AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM public.profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM public.profiles WHERE id = NEW.user2_id;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user1_id, 'type', 'newMatches', 'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user2_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id, 'type', 'newMatches', 'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user1_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.send_match_email() RETURNS TRIGGER AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  compat INTEGER;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM public.profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM public.profiles WHERE id = NEW.user2_id;
  compat := COALESCE(NEW.compatibility_overall, 0);

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-email';
  ELSE
    edge_function_url := regexp_replace(edge_function_url, '/[^/]+$', '/send-email');
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user1_id, 'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user2_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id, 'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user1_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================================
-- Step 2: ensure profiles + subscriptions for the three tier accounts, and
-- prime premium_usage so each scenario is hit on first visit (no flaky
-- "first request grants 1 free trial" surprise).
--
-- Feature keys come from apps/mobile/services/premiumUsage.ts:
--   Premium (Celestial): synastry, likes, priority-messages,
--                        natal-chart, monthly-tarot
--   Premium Plus (Cosmic): daily-horoscope, monthly-horoscope, planetary-transits,
--                          retrograde-alerts, lucky-days, date-planner, weekly-tarot
-- ============================================================================
DO $$
DECLARE
  v_user1_id      uuid;
  v_user2_id      uuid;
  v_free_id       uuid;
  v_low           uuid;
  v_high          uuid;
  v_match_id      uuid;
  v_today         date := CURRENT_DATE;
  v_celestial     TEXT[] := ARRAY[
    'synastry','likes','priority-messages','natal-chart','monthly-tarot'
  ];
  v_cosmic        TEXT[] := ARRAY[
    'daily-horoscope','monthly-horoscope','planetary-transits',
    'retrograde-alerts','lucky-days','date-planner','weekly-tarot'
  ];
  v_all_features  TEXT[] := ARRAY[
    -- Mobile/client-side keys (PremiumGate, dashes) -----------------------
    'synastry','likes','priority-messages','natal-chart',
    'monthly-tarot','daily-horoscope','monthly-horoscope','planetary-transits',
    'retrograde-alerts','lucky-days','date-planner','weekly-tarot',
    -- Server-side keys (enforce_premium_feature RPC, underscores) ---------
    -- Important: natal-chart screen calls enforce_premium_feature with
    -- 'natal_chart' AS WELL AS the client gate. If we don't reset both,
    -- a fresh seed leaves the server quota at its previous count.
    'natal_chart','daily_horoscope','synastry','compatibility_details',
    'monthly_horoscope','tarot','date_planner','lucky_days',
    'retrograde_alerts','planetary_transits','priority_messages',
    'likes_you_see_who'
  ];
  v_feature       TEXT;
BEGIN
  SELECT id INTO v_user1_id FROM auth.users WHERE email = 'e2e_user1@example.com';
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'e2e_user2@example.com';
  SELECT id INTO v_free_id  FROM auth.users WHERE email = 'e2e_free@example.com';

  IF v_user1_id IS NULL THEN RAISE EXCEPTION 'e2e_user1@example.com missing from auth.users'; END IF;
  IF v_user2_id IS NULL THEN RAISE EXCEPTION 'e2e_user2@example.com missing from auth.users'; END IF;
  IF v_free_id  IS NULL THEN RAISE EXCEPTION 'e2e_free@example.com missing from auth.users'; END IF;

  -- ----- Profiles (must satisfy discoverable_profiles + clear soft-delete) -----
  INSERT INTO public.profiles (id, name, age, sun_sign, moon_sign, gender, is_active, onboarding_completed, is_premium, premium_until)
  VALUES (v_user1_id, 'E2E User 1', 28, 'Aries', 'Cancer', 'female', TRUE, TRUE, TRUE, NOW() + INTERVAL '1 year')
  ON CONFLICT (id) DO UPDATE SET
    is_active = TRUE, onboarding_completed = TRUE, is_premium = TRUE,
    premium_until = NOW() + INTERVAL '1 year',
    deletion_requested_at = NULL, deletion_scheduled_for = NULL,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    sun_sign = COALESCE(public.profiles.sun_sign, EXCLUDED.sun_sign),
    moon_sign = COALESCE(public.profiles.moon_sign, EXCLUDED.moon_sign),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    age = COALESCE(public.profiles.age, EXCLUDED.age);

  INSERT INTO public.profiles (id, name, age, sun_sign, moon_sign, gender, is_active, onboarding_completed, is_premium, premium_until)
  VALUES (v_user2_id, 'E2E User 2', 30, 'Leo', 'Pisces', 'male', TRUE, TRUE, TRUE, NOW() + INTERVAL '1 year')
  ON CONFLICT (id) DO UPDATE SET
    is_active = TRUE, onboarding_completed = TRUE, is_premium = TRUE,
    premium_until = NOW() + INTERVAL '1 year',
    deletion_requested_at = NULL, deletion_scheduled_for = NULL,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    sun_sign = COALESCE(public.profiles.sun_sign, EXCLUDED.sun_sign),
    moon_sign = COALESCE(public.profiles.moon_sign, EXCLUDED.moon_sign),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    age = COALESCE(public.profiles.age, EXCLUDED.age);

  INSERT INTO public.profiles (id, name, age, sun_sign, moon_sign, gender, is_active, onboarding_completed, is_premium)
  VALUES (v_free_id, 'E2E Free User', 26, 'Gemini', 'Virgo', 'non-binary', TRUE, TRUE, FALSE)
  ON CONFLICT (id) DO UPDATE SET
    is_active = TRUE, onboarding_completed = TRUE, is_premium = FALSE,
    premium_until = NULL,
    deletion_requested_at = NULL, deletion_scheduled_for = NULL,
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    sun_sign = COALESCE(public.profiles.sun_sign, EXCLUDED.sun_sign),
    moon_sign = COALESCE(public.profiles.moon_sign, EXCLUDED.moon_sign),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    age = COALESCE(public.profiles.age, EXCLUDED.age);

  -- ----- Subscriptions (drives get_user_tier RPC) -----
  -- user1 -> premium_plus (Cosmic, all features unlocked)
  INSERT INTO public.subscriptions (user_id, tier, status, expires_at, source)
  VALUES (v_user1_id, 'premium_plus', 'active', NOW() + INTERVAL '1 year', 'stripe')
  ON CONFLICT (user_id, source) DO UPDATE SET
    tier = 'premium_plus', status = 'active', expires_at = NOW() + INTERVAL '1 year';

  -- user2 -> premium (Celestial only, Cosmic features should hit paywall)
  INSERT INTO public.subscriptions (user_id, tier, status, expires_at, source)
  VALUES (v_user2_id, 'premium', 'active', NOW() + INTERVAL '1 year', 'stripe')
  ON CONFLICT (user_id, source) DO UPDATE SET
    tier = 'premium', status = 'active', expires_at = NOW() + INTERVAL '1 year';

  -- e2e_free -> remove any subscription so get_user_tier returns 'free'.
  DELETE FROM public.subscriptions WHERE user_id = v_free_id;

  -- ----- Match between user1 and user2 (used by flows 04 / 05) -----
  v_low  := LEAST(v_user1_id, v_user2_id);
  v_high := GREATEST(v_user1_id, v_user2_id);

  INSERT INTO public.matches (
    user1_id, user2_id,
    compatibility_overall, compatibility_emotional, compatibility_communication,
    compatibility_passion, compatibility_long_term, compatibility_values, compatibility_growth,
    status, matched_at, created_at
  )
  VALUES (
    v_low, v_high,
    87, 85, 88, 82, 84, 90, 86,
    'active', NOW(), NOW()
  )
  ON CONFLICT (user1_id, user2_id) DO UPDATE SET
    status = 'active', compatibility_overall = EXCLUDED.compatibility_overall
  RETURNING id INTO v_match_id;

  -- ----- premium_usage priming (deterministic paywall scenarios) -----
  -- Strategy: PremiumGate grants 1 free preview per feature per day to any
  -- user (including free). To make tests deterministic on first visit:
  --   - e2e_user1: clear all usage so trial is "fresh" (irrelevant since
  --     premium_plus skips the trial path entirely, but keeps the table tidy).
  --   - e2e_user2: pre-consume Cosmic features (so visiting daily-horoscope
  --     etc. as e2e_user2 hits the paywall on FIRST visit, no flaky retry).
  --     Leave Celestial features at 0 so e2e_user2 visits natal-chart, etc.
  --     and gets through the gate (canAccessFeature() returns true for
  --     premium tier on Celestial features).
  --   - e2e_free: pre-consume EVERY feature so the free user paywall test
  --     hits the denied state immediately, regardless of which screen we
  --     deep-link into.

  DELETE FROM public.premium_usage WHERE user_id = v_user1_id AND usage_date = v_today;

  -- user2: clear Celestial usage (granted) + force-consume Cosmic (denied).
  DELETE FROM public.premium_usage WHERE user_id = v_user2_id AND usage_date = v_today;
  FOREACH v_feature IN ARRAY v_cosmic LOOP
    INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count)
    VALUES (v_user2_id, v_feature, v_today, 1)
    ON CONFLICT (user_id, feature_key, usage_date) DO UPDATE SET view_count = 1;
  END LOOP;

  -- free: pre-consume every feature so the gate is denied on first visit.
  DELETE FROM public.premium_usage WHERE user_id = v_free_id AND usage_date = v_today;
  FOREACH v_feature IN ARRAY v_all_features LOOP
    INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count)
    VALUES (v_free_id, v_feature, v_today, 1)
    ON CONFLICT (user_id, feature_key, usage_date) DO UPDATE SET view_count = 1;
  END LOOP;

  RAISE NOTICE 'OK seed: match=% user1=% user2=% free=%',
    v_match_id, v_user1_id, v_user2_id, v_free_id;
END $$;

-- ============================================================================
-- Step 3: verify. Each user should report the expected tier and the right
-- number of premium_usage rows for today.
-- ============================================================================
SELECT u.email,
       COALESCE(s.tier, 'free') AS tier,
       s.status,
       p.is_active,
       p.onboarding_completed,
       (SELECT COUNT(*) FROM public.premium_usage pu
        WHERE pu.user_id = u.id AND pu.usage_date = CURRENT_DATE) AS premium_usage_rows_today
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.subscriptions s
  ON s.user_id = u.id AND s.source = 'stripe'
WHERE u.email IN (
  'e2e_user1@example.com',
  'e2e_user2@example.com',
  'e2e_free@example.com'
)
ORDER BY u.email;
