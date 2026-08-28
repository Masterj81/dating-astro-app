-- Behavioural tests for the free preview quota (migration 20260823000001).
--
-- HOW TO RUN
--   supabase start                       # or point at a branch/staging DB
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_preview_quota.test.sql
--
-- The whole run is wrapped in a transaction that ends with ROLLBACK, so it
-- leaves no rows behind and is safe to run against a database that already
-- has data. Every assertion RAISEs on failure, so `ON_ERROR_STOP=1` turns a
-- regression into a non-zero exit code.
--
-- Must be run as a role that can INSERT INTO auth.users (postgres /
-- service_role), because the scenarios need real users to hang usage off.

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  c_instance   CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_free       UUID := gen_random_uuid();
  v_paid       UUID := gen_random_uuid();
  r            RECORD;
  v_count      INTEGER;
BEGIN
  -- ---------------------------------------------------------------------
  -- Fixtures
  -- ---------------------------------------------------------------------
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at)
  VALUES
    (c_instance, v_free, 'authenticated', 'authenticated',
     'free.preview.test@example.invalid', '', NOW(), NOW(), NOW()),
    (c_instance, v_paid, 'authenticated', 'authenticated',
     'paid.preview.test@example.invalid', '', NOW(), NOW(), NOW());

  -- The paid user holds an active Celestial subscription.
  INSERT INTO public.subscriptions (user_id, tier, status, source, expires_at)
  VALUES (v_paid, 'premium', 'active', 'stripe', NOW() + INTERVAL '30 days');

  -- Guard: the migration under test must actually be applied.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'premium_feature_policy'
       AND column_name = 'free_preview_quota'
  ) THEN
    RAISE EXCEPTION 'FAIL setup: premium_feature_policy.free_preview_quota is missing — apply migration 20260823000001 first';
  END IF;

  IF (SELECT COALESCE(free_preview_quota, 0)
        FROM public.premium_feature_policy
       WHERE feature_key = 'natal_chart') <> 1 THEN
    RAISE EXCEPTION 'FAIL setup: natal_chart.free_preview_quota should be 1';
  END IF;

  -- ---------------------------------------------------------------------
  -- 1. Free account, first call of the day → preview granted
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free)::TEXT, TRUE);

  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed AND r.reason = 'free_preview' AND r.current_count = 1) THEN
    RAISE EXCEPTION 'FAIL 1: expected allowed/free_preview/1, got %/%/%',
      r.allowed, r.reason, r.current_count;
  END IF;
  IF r.user_tier <> 'free' THEN
    RAISE EXCEPTION 'FAIL 1: expected user_tier=free, got %', r.user_tier;
  END IF;
  RAISE NOTICE 'PASS 1 — free account gets its daily preview (reason=%)', r.reason;

  -- ---------------------------------------------------------------------
  -- 2. Immediate second call → replayed, NOT a second consumption
  --    (this is the screen re-mount / token refresh case)
  -- ---------------------------------------------------------------------
  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed AND r.reason = 'free_preview') THEN
    RAISE EXCEPTION 'FAIL 2: re-entry within the replay window must be allowed, got %/%',
      r.allowed, r.reason;
  END IF;

  SELECT view_count INTO v_count
    FROM public.premium_usage
   WHERE user_id = v_free AND feature_key = 'natal_chart' AND usage_date = CURRENT_DATE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 2: replay must not consume a second unit, view_count=%', v_count;
  END IF;
  RAISE NOTICE 'PASS 2 — re-mount replays the grant without burning a second preview';

  -- ---------------------------------------------------------------------
  -- 3. Same day, outside the replay window → preview exhausted
  -- ---------------------------------------------------------------------
  UPDATE public.premium_usage
     SET last_granted_at = NOW() - INTERVAL '1 hour'
   WHERE user_id = v_free AND feature_key = 'natal_chart' AND usage_date = CURRENT_DATE;

  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed = FALSE AND r.reason = 'free_preview_exhausted') THEN
    RAISE EXCEPTION 'FAIL 3: expected denied/free_preview_exhausted, got %/%',
      r.allowed, r.reason;
  END IF;

  SELECT view_count INTO v_count
    FROM public.premium_usage
   WHERE user_id = v_free AND feature_key = 'natal_chart' AND usage_date = CURRENT_DATE;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 3: denied call must roll the counter back to 1, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS 3 — second preview of the day is refused and the counter is rolled back';

  -- ---------------------------------------------------------------------
  -- 4. A denial must not refresh the replay window
  --    (regression guard: if the rollback forgot last_granted_at, the very
  --     next call would replay a grant the user no longer has)
  -- ---------------------------------------------------------------------
  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF r.allowed THEN
    RAISE EXCEPTION 'FAIL 4: a denied call refreshed the replay window and re-granted access';
  END IF;
  RAISE NOTICE 'PASS 4 — denial does not reopen the replay window';

  -- ---------------------------------------------------------------------
  -- 5. Entitled account → normal access, unchanged semantics
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_paid)::TEXT, TRUE);

  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed AND r.reason = 'ok') THEN
    RAISE EXCEPTION 'FAIL 5: paid account expected allowed/ok, got %/%', r.allowed, r.reason;
  END IF;
  IF r.user_tier NOT IN ('premium', 'celestial') THEN
    RAISE EXCEPTION 'FAIL 5: expected an entitled tier, got %', r.user_tier;
  END IF;

  -- natal_chart has no paid daily_quota, so repeat access stays allowed.
  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed AND r.reason = 'ok') THEN
    RAISE EXCEPTION 'FAIL 5: paid account must keep unlimited access, got %/%', r.allowed, r.reason;
  END IF;
  RAISE NOTICE 'PASS 5 — entitled account is unaffected by the free preview logic';

  -- ---------------------------------------------------------------------
  -- 6. A feature with no free preview still denies free accounts
  --    (proves the change is opt-in per feature)
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free)::TEXT, TRUE);

  SELECT * INTO r FROM public.enforce_premium_feature('date_planner');
  IF NOT (r.allowed = FALSE AND r.reason = 'insufficient_tier') THEN
    RAISE EXCEPTION 'FAIL 6: expected denied/insufficient_tier for date_planner, got %/%',
      r.allowed, r.reason;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.premium_usage
     WHERE user_id = v_free AND feature_key = 'date_planner' AND usage_date = CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'FAIL 6: a tier denial must not write a usage row';
  END IF;
  RAISE NOTICE 'PASS 6 — features without a free preview are unchanged';

  -- ---------------------------------------------------------------------
  -- 7. Unknown feature → clean error, no write
  -- ---------------------------------------------------------------------
  SELECT * INTO r FROM public.enforce_premium_feature('not_a_real_feature');
  IF NOT (r.allowed = FALSE AND r.reason = 'unknown_feature') THEN
    RAISE EXCEPTION 'FAIL 7: expected denied/unknown_feature, got %/%', r.allowed, r.reason;
  END IF;
  RAISE NOTICE 'PASS 7 — unknown feature is rejected cleanly';

  -- ---------------------------------------------------------------------
  -- 8. Unauthenticated caller → unauthorized
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', TRUE);

  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF NOT (r.allowed = FALSE AND r.reason = 'unauthorized') THEN
    RAISE EXCEPTION 'FAIL 8: expected denied/unauthorized, got %/%', r.allowed, r.reason;
  END IF;
  RAISE NOTICE 'PASS 8 — anonymous callers are rejected';

  -- ---------------------------------------------------------------------
  -- 9. can_use_premium_feature agrees with enforce_premium_feature
  -- ---------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free)::TEXT, TRUE);

  SELECT * INTO r FROM public.can_use_premium_feature('natal_chart');
  IF r.allowed THEN
    RAISE EXCEPTION 'FAIL 9: read-only mirror should report the preview as spent';
  END IF;
  IF r.reason <> 'free_preview_exhausted' THEN
    RAISE EXCEPTION 'FAIL 9: expected free_preview_exhausted, got %', r.reason;
  END IF;
  IF r.remaining <> 0 THEN
    RAISE EXCEPTION 'FAIL 9: expected remaining=0, got %', r.remaining;
  END IF;
  RAISE NOTICE 'PASS 9 — read-only mirror matches the enforcing function';

  RAISE NOTICE '--- all free preview quota assertions passed ---';
END;
$test$;

-- ---------------------------------------------------------------------------
-- 10. The usage ledger must not be writable by the account it bills.
--     Runs outside the DO block so the role switch is unambiguous.
-- ---------------------------------------------------------------------------
DO $rls$
DECLARE
  v_denied BOOLEAN := FALSE;
BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.premium_usage WHERE TRUE;
  EXCEPTION
    WHEN insufficient_privilege THEN v_denied := TRUE;
  END;
  EXECUTE 'RESET ROLE';

  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL 10: an authenticated user can still delete premium_usage rows — the free preview quota is resettable at will';
  END IF;
  RAISE NOTICE 'PASS 10 — premium_usage is read-only for authenticated accounts';
END;
$rls$;

ROLLBACK;
