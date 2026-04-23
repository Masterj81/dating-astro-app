-- Seed a deterministic match between e2e_user1 and e2e_user2 so flows 04
-- (chat-send) and 05 (chat-offline) have a conversation to open.
--
-- Run in the Supabase SQL Editor (staging project). Idempotent.
--
-- Prereq: BOTH e2e_user1@example.com and e2e_user2@example.com must exist
-- in auth.users (Authentication -> Users -> Add user, Auto Confirm = on).
--
-- Step 1 patches a real bug in notify_new_match() (it referenced unqualified
-- `profiles` while running with search_path=''). Step 2 inserts the seed.

-- ============================================================================
-- Step 1: patch notify_new_match() to use schema-qualified identifiers so it
-- works under the locked-down search_path that 20260206_fix_security_warnings
-- pinned. Without this, ANY INSERT into matches raises 42P01.
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
      'userId', NEW.user1_id,
      'type', 'newMatches',
      'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user2_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id,
      'type', 'newMatches',
      'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user1_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Same bug in send_match_email() (also fires AFTER INSERT on matches).
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
      'userId', NEW.user1_id,
      'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user2_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id,
      'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user1_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================================
-- Step 2: seed the match between e2e_user1 and e2e_user2.
-- ============================================================================
DO $$
DECLARE
  v_user1_id uuid;
  v_user2_id uuid;
  v_low uuid;
  v_high uuid;
  v_match_id uuid;
BEGIN
  SELECT id INTO v_user1_id FROM auth.users WHERE email = 'e2e_user1@example.com';
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'e2e_user2@example.com';

  IF v_user1_id IS NULL THEN
    RAISE EXCEPTION 'e2e_user1@example.com missing from auth.users';
  END IF;
  IF v_user2_id IS NULL THEN
    RAISE EXCEPTION 'e2e_user2@example.com missing from auth.users';
  END IF;

  -- Both profiles must satisfy discoverable_profiles filter
  -- (is_active = TRUE, name IS NOT NULL, onboarding_completed = TRUE).
  -- Also CLEAR any leftover deletion markers -- if a prior flow 09 or manual
  -- delete tap left the profile in soft-delete state, login would fail or
  -- the pg_cron process-expired-deletions would eventually hard-delete the
  -- account.
  --
  -- Mark user1 as premium so flows 04 (chat send) and 05 (chat offline)
  -- bypass the messaging paywall.
  INSERT INTO public.profiles (id, name, age, sun_sign, moon_sign, gender, is_active, onboarding_completed, is_premium, premium_until)
  VALUES (v_user1_id, 'E2E User 1', 28, 'Aries', 'Cancer', 'female', TRUE, TRUE, TRUE, NOW() + INTERVAL '1 year')
  ON CONFLICT (id) DO UPDATE
    SET is_active = TRUE,
        onboarding_completed = TRUE,
        is_premium = TRUE,
        premium_until = NOW() + INTERVAL '1 year',
        deletion_requested_at = NULL,
        deletion_scheduled_for = NULL,
        name = COALESCE(public.profiles.name, EXCLUDED.name),
        sun_sign = COALESCE(public.profiles.sun_sign, EXCLUDED.sun_sign),
        moon_sign = COALESCE(public.profiles.moon_sign, EXCLUDED.moon_sign),
        gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
        age = COALESCE(public.profiles.age, EXCLUDED.age);

  INSERT INTO public.profiles (id, name, age, sun_sign, moon_sign, gender, is_active, onboarding_completed)
  VALUES (v_user2_id, 'E2E User 2', 30, 'Leo', 'Pisces', 'male', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE
    SET is_active = TRUE,
        onboarding_completed = TRUE,
        deletion_requested_at = NULL,
        deletion_scheduled_for = NULL,
        name = COALESCE(public.profiles.name, EXCLUDED.name),
        sun_sign = COALESCE(public.profiles.sun_sign, EXCLUDED.sun_sign),
        moon_sign = COALESCE(public.profiles.moon_sign, EXCLUDED.moon_sign),
        gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
        age = COALESCE(public.profiles.age, EXCLUDED.age);

  -- Mark e2e_user1 as premium in public.subscriptions. The mobile app reads
  -- the tier from get_user_tier() which queries subscriptions, NOT the
  -- profiles.is_premium column. Without this, free-tier RLS / paywalls block
  -- the chat send flow.
  -- Schema constraints (since 20260312_unified_subscriptions):
  --   - source IN ('stripe', 'app_store', 'play_store') NOT NULL
  --   - tier   IN ('premium', 'premium_plus')
  --   - UNIQUE (user_id, source)
  INSERT INTO public.subscriptions (user_id, tier, status, expires_at, source)
  VALUES (v_user1_id, 'premium', 'active', NOW() + INTERVAL '1 year', 'stripe')
  ON CONFLICT (user_id, source) DO UPDATE
    SET tier = 'premium',
        status = 'active',
        expires_at = NOW() + INTERVAL '1 year';

  -- The matches table requires user1_id < user2_id (CHECK ordered_users).
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
  ON CONFLICT (user1_id, user2_id) DO UPDATE
    SET status = 'active',
        compatibility_overall = EXCLUDED.compatibility_overall
  RETURNING id INTO v_match_id;

  RAISE NOTICE 'OK match id=% user1=% user2=%', v_match_id, v_user1_id, v_user2_id;
END $$;

-- ============================================================================
-- Step 3: verify -- one row should be returned with both emails.
-- ============================================================================
SELECT m.id          AS match_id,
       m.compatibility_overall,
       m.status,
       u1.email      AS user1_email,
       u2.email      AS user2_email
FROM public.matches m
JOIN auth.users u1 ON u1.id = m.user1_id
JOIN auth.users u2 ON u2.id = m.user2_id
WHERE (u1.email = 'e2e_user1@example.com' AND u2.email = 'e2e_user2@example.com')
   OR (u1.email = 'e2e_user2@example.com' AND u2.email = 'e2e_user1@example.com');
