-- Behavioural tests for the rising-sign invariant
-- (migration 20260830000001_enforce_rising_requires_birth_time).
--
-- HOW TO RUN
--   supabase start                       # or point at a branch/staging DB
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rising_requires_birth_time.test.sql
--
-- The whole run is wrapped in a transaction that ends with ROLLBACK, so it
-- leaves no rows behind and is safe against a database that already has data.
-- Every assertion RAISEs on failure, so `ON_ERROR_STOP=1` turns a regression
-- into a non-zero exit code.
--
-- Must be run as a role that can INSERT INTO auth.users (postgres /
-- service_role), because profiles hang off real auth users.
--
-- WHAT IS BEING PROTECTED
-- The ascendant depends on the exact minute of birth. The old mobile facade
-- substituted `{ sign: 'Aries', degree: 0, longitude: 0 }` for the placement
-- the engine had refused to compute, so every account that skipped its birth
-- time was told it was Aries rising — false eleven times out of twelve.
-- The client is fixed, but old builds stay installed for weeks, so the
-- invariant is enforced in the database. See
-- docs/rising-sign-integrity-2026-08.md.

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  c_instance CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_no_time  UUID := gen_random_uuid();
  v_with_time UUID := gen_random_uuid();
  v_sign     TEXT;
  v_chart    JSONB;
BEGIN
  -- ---------------------------------------------------------------------
  -- Fixtures: one account without a birth time, one with.
  -- ---------------------------------------------------------------------
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at)
  VALUES
    (c_instance, v_no_time, 'authenticated', 'authenticated',
     'rising.notime.test@example.invalid', '', NOW(), NOW(), NOW()),
    (c_instance, v_with_time, 'authenticated', 'authenticated',
     'rising.withtime.test@example.invalid', '', NOW(), NOW(), NOW());

  -- ---------------------------------------------------------------------
  -- 1. INSERT with no birth time: the ascendant is dropped on the way in.
  --    This is the exact payload an app build older than Android 122 sends
  --    from onboarding.
  -- ---------------------------------------------------------------------
  INSERT INTO public.profiles (id, name, birth_date, birth_time, sun_sign, moon_sign, rising_sign)
  VALUES (v_no_time, 'No Time', '1990-08-05', NULL, 'Leo', 'Pisces', 'Aries');

  SELECT rising_sign INTO v_sign FROM public.profiles WHERE id = v_no_time;
  IF v_sign IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: INSERT stored rising_sign=% for an account with no birth_time', v_sign;
  END IF;
  RAISE NOTICE 'PASS 1 — INSERT drops a rising sign that has no birth time behind it';

  -- ---------------------------------------------------------------------
  -- 2. Sun and Moon survive. They do not depend on the birth time, and a
  --    reader without one must still get a usable chart.
  -- ---------------------------------------------------------------------
  SELECT sun_sign INTO v_sign FROM public.profiles WHERE id = v_no_time;
  IF v_sign IS DISTINCT FROM 'Leo' THEN
    RAISE EXCEPTION 'FAIL 2: sun_sign was altered (got %)', v_sign;
  END IF;
  SELECT moon_sign INTO v_sign FROM public.profiles WHERE id = v_no_time;
  IF v_sign IS DISTINCT FROM 'Pisces' THEN
    RAISE EXCEPTION 'FAIL 2: moon_sign was altered (got %)', v_sign;
  END IF;
  RAISE NOTICE 'PASS 2 — sun and moon are untouched';

  -- ---------------------------------------------------------------------
  -- 3. UPDATE with no birth time: same rule. This is the re-poisoning path
  --    that made a one-off cleanup unsafe before the trigger existed.
  -- ---------------------------------------------------------------------
  UPDATE public.profiles SET rising_sign = 'Aries' WHERE id = v_no_time;
  SELECT rising_sign INTO v_sign FROM public.profiles WHERE id = v_no_time;
  IF v_sign IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 3: an old client re-poisoned the row with rising_sign=%', v_sign;
  END IF;
  RAISE NOTICE 'PASS 3 — an old build cannot re-poison a row';

  -- ---------------------------------------------------------------------
  -- 4. The same claim frozen in the chart JSONB is nulled too. This is what
  --    the synastry surfaces read; leaving it would keep feeding a
  --    "first impressions" score built on a placement nobody has.
  -- ---------------------------------------------------------------------
  UPDATE public.profiles
     SET birth_chart = '{"sun": {"sign": "Leo"}, "rising": {"sign": "Aries"}, "confidence": "low"}'::jsonb
   WHERE id = v_no_time;

  SELECT birth_chart INTO v_chart FROM public.profiles WHERE id = v_no_time;
  IF v_chart -> 'rising' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 4: birth_chart->rising survived as %', v_chart -> 'rising';
  END IF;
  IF v_chart -> 'sun' -> 'sign' <> '"Leo"'::jsonb THEN
    RAISE EXCEPTION 'FAIL 4: the rest of the chart was damaged (%).', v_chart;
  END IF;
  RAISE NOTICE 'PASS 4 — birth_chart->rising is nulled, the rest of the chart is intact';

  -- ---------------------------------------------------------------------
  -- 5. A REAL ascendant is preserved. The invariant must not cost anything
  --    to the readers who did give their birth time.
  -- ---------------------------------------------------------------------
  INSERT INTO public.profiles (id, name, birth_date, birth_time, sun_sign, moon_sign, rising_sign, birth_chart)
  VALUES (v_with_time, 'With Time', '1990-08-05', '14:30', 'Leo', 'Pisces', 'Scorpio',
          '{"sun": {"sign": "Leo"}, "rising": {"sign": "Scorpio"}, "confidence": "high"}'::jsonb);

  SELECT rising_sign INTO v_sign FROM public.profiles WHERE id = v_with_time;
  IF v_sign IS DISTINCT FROM 'Scorpio' THEN
    RAISE EXCEPTION 'FAIL 5: a real ascendant was dropped (got %)', v_sign;
  END IF;

  SELECT birth_chart INTO v_chart FROM public.profiles WHERE id = v_with_time;
  IF v_chart -> 'rising' -> 'sign' <> '"Scorpio"'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5: a real chart ascendant was dropped (%).', v_chart -> 'rising';
  END IF;
  RAISE NOTICE 'PASS 5 — a real ascendant is preserved, column and chart';

  -- ---------------------------------------------------------------------
  -- 6. Removing the birth time later retracts the ascendant with it. An
  --    account that clears a wrong birth time must not keep the placement
  --    that time was the only evidence for.
  -- ---------------------------------------------------------------------
  UPDATE public.profiles SET birth_time = NULL WHERE id = v_with_time;

  SELECT rising_sign INTO v_sign FROM public.profiles WHERE id = v_with_time;
  IF v_sign IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6: rising_sign=% survived the birth_time being cleared', v_sign;
  END IF;

  SELECT birth_chart INTO v_chart FROM public.profiles WHERE id = v_with_time;
  IF v_chart -> 'rising' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 6: birth_chart->rising survived the birth_time being cleared';
  END IF;
  RAISE NOTICE 'PASS 6 — clearing the birth time retracts the ascendant';

  -- ---------------------------------------------------------------------
  -- 7. A chart with no `rising` key at all is left alone. Legacy v1 rows
  --    must not be rewritten just for passing through.
  -- ---------------------------------------------------------------------
  UPDATE public.profiles
     SET birth_chart = '{"sun": {"sign": "Leo"}, "chartVersion": 1}'::jsonb
   WHERE id = v_no_time;

  SELECT birth_chart INTO v_chart FROM public.profiles WHERE id = v_no_time;
  IF v_chart ? 'rising' THEN
    RAISE EXCEPTION 'FAIL 7: a rising key was invented on a chart that had none (%).', v_chart;
  END IF;
  RAISE NOTICE 'PASS 7 — a chart without a rising key is not rewritten';

  -- ---------------------------------------------------------------------
  -- 8. A non-object birth_chart does not crash the trigger. Defensive:
  --    the column is JSONB and nothing stops a scalar landing there.
  -- ---------------------------------------------------------------------
  BEGIN
    UPDATE public.profiles SET birth_chart = '"garbage"'::jsonb WHERE id = v_no_time;
    RAISE NOTICE 'PASS 8 — a scalar birth_chart is tolerated without error';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL 8: the trigger threw on a non-object birth_chart: %', SQLERRM;
  END;

  -- ---------------------------------------------------------------------
  -- 9. The global invariant holds across the whole table.
  -- ---------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.profiles
     WHERE birth_time IS NULL AND rising_sign IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 9: at least one row still claims an ascendant without a birth time';
  END IF;
  RAISE NOTICE 'PASS 9 — no row in the table claims an ascendant it cannot have';
END;
$test$;

ROLLBACK;
