-- The ascendant cannot exist without an exact birth time. Enforce it in the
-- database, so no client version can ever assert otherwise again.
--
-- WHY A TRIGGER AND NOT JUST A CLEANUP
-- ------------------------------------
-- `apps/mobile/services/astrology.ts` used to substitute
-- `{ sign: 'Aries', degree: 0, longitude: 0 }` for the rising placement the
-- engine had correctly refused to compute. Onboarding invites skipping the
-- birth time, so every account that did was stored as `rising_sign = 'Aries'`
-- and told, on its first personalised screen, something false about itself —
-- eleven times out of twelve. Full story: docs/rising-sign-integrity-2026-08.md
--
-- The client is fixed as of Android versionCode 122 and on web. But a one-off
-- UPDATE would only be safe once no old build can still write, and "published
-- on Play" is not that moment: rollout takes days and readers update whenever
-- they feel like it. A reader still on 121 who re-runs onboarding would
-- silently re-poison their own row, and nothing would report it.
--
-- This trigger removes the race entirely. The invariant is enforced where the
-- data lives, so the cleanup below can run immediately and stay true.
--
-- WHY IT SANITISES INSTEAD OF REJECTING
-- -------------------------------------
-- A CHECK constraint would be simpler, but it would make the onboarding save
-- FAIL on old builds — an error alert at the exact moment a new reader is
-- being asked to trust the app, over a field they were told was optional.
-- Silently dropping a value that cannot be real is the honest repair: the
-- write succeeds, the reader keeps their chart, and the fabricated placement
-- never lands.
--
-- Sun, Moon and every planet are untouched. They do not depend on the birth
-- time and stay accurate without it.

begin;

-- =============================================================================
-- 1) The invariant
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enforce_rising_requires_birth_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.birth_time IS NULL THEN
    -- The column.
    NEW.rising_sign := NULL;

    -- And the same claim frozen inside the chart JSONB, which is what the
    -- synastry surfaces read. Leaving it would keep feeding a "first
    -- impressions" score computed from a placement nobody has.
    IF NEW.birth_chart IS NOT NULL
       AND jsonb_typeof(NEW.birth_chart) = 'object'
       AND NEW.birth_chart ? 'rising'
       AND NEW.birth_chart -> 'rising' <> 'null'::jsonb
    THEN
      NEW.birth_chart := jsonb_set(NEW.birth_chart, '{rising}', 'null'::jsonb);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_rising_requires_birth_time() IS
  'Nulls rising_sign and birth_chart->rising whenever birth_time is absent. The ascendant depends on the minute of birth; any value stored without one was invented. Sanitises rather than rejects so older app builds keep working instead of erroring during onboarding.';

DROP TRIGGER IF EXISTS trigger_enforce_rising_requires_birth_time ON public.profiles;

CREATE TRIGGER trigger_enforce_rising_requires_birth_time
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_rising_requires_birth_time();

-- =============================================================================
-- 2) Repair the rows already written
-- =============================================================================
-- Idempotent, and a no-op for every account that has a birth time. Safe to run
-- now precisely because the trigger above makes re-poisoning impossible.

-- Both statements live in a PL/pgSQL block for one reason: GET DIAGNOSTICS.
-- The number that matters to whoever applies this is how many accounts were
-- actually being told a false ascendant, and a plain top-level UPDATE cannot
-- report it.

DO $repair$
DECLARE
  v_column_repaired INTEGER;
  v_chart_repaired  INTEGER;
  v_no_birth_time   INTEGER;
  v_column_left     INTEGER;
  v_chart_left      INTEGER;
BEGIN
  UPDATE public.profiles
     SET rising_sign = NULL,
         updated_at  = NOW()
   WHERE birth_time IS NULL
     AND rising_sign IS NOT NULL;
  GET DIAGNOSTICS v_column_repaired = ROW_COUNT;

  UPDATE public.profiles
     SET birth_chart = jsonb_set(birth_chart, '{rising}', 'null'::jsonb),
         updated_at  = NOW()
   WHERE birth_time IS NULL
     AND birth_chart IS NOT NULL
     AND jsonb_typeof(birth_chart) = 'object'
     AND birth_chart ? 'rising'
     AND birth_chart -> 'rising' <> 'null'::jsonb;
  GET DIAGNOSTICS v_chart_repaired = ROW_COUNT;

  -- ---------------------------------------------------------------------
  -- Postcondition. Be honest about what this can and cannot catch.
  --
  -- It is NOT a guard against a half-applied migration: everything here runs
  -- in one transaction, so a failure rolls the whole thing back and there is
  -- no partial state to detect. Re-reading the same predicates the UPDATEs
  -- just used would normally be a tautology.
  --
  -- What it does catch is PREDICATE DRIFT. The cleanup above and the
  -- invariant below have to describe the same set forever. If a later edit
  -- narrows the cleanup — say someone scopes it to `rising_sign = 'Aries'`,
  -- forgetting the fallback could have been changed to another sign — the
  -- check still describes the invariant and the migration refuses to pass.
  -- That is a cheap guard on a rule that must not soften over time.
  -- ---------------------------------------------------------------------
  SELECT
    COUNT(*) FILTER (WHERE birth_time IS NULL AND rising_sign IS NOT NULL),
    COUNT(*) FILTER (WHERE birth_time IS NULL
                       AND birth_chart IS NOT NULL
                       AND jsonb_typeof(birth_chart) = 'object'
                       AND birth_chart ? 'rising'
                       AND birth_chart -> 'rising' <> 'null'::jsonb)
    INTO v_column_left, v_chart_left
    FROM public.profiles;

  IF v_column_left > 0 OR v_chart_left > 0 THEN
    RAISE EXCEPTION
      'rising-sign invariant still violated after cleanup: % row(s) keep rising_sign without a birth_time, % row(s) keep birth_chart->rising. The cleanup and the invariant have drifted apart. Migration aborted.',
      v_column_left, v_chart_left;
  END IF;

  SELECT COUNT(*) INTO v_no_birth_time
    FROM public.profiles
   WHERE birth_time IS NULL;

  -- The first number is the size of the bug: accounts that were being shown
  -- an ascendant computed from a birth time they never gave.
  RAISE NOTICE
    'Repaired % account(s) carrying a fabricated rising_sign, and % stored chart(s). % account(s) have no birth time in total; none of them claims an ascendant now.',
    v_column_repaired, v_chart_repaired, v_no_birth_time;
END;
$repair$;

-- =============================================================================
-- 3) Verify the trigger, inside the same transaction
-- =============================================================================

-- Confirm the trigger is installed AND enabled, rather than trusting that
-- CREATE TRIGGER above did what it said.
--
-- This is a catalog read, not a write probe. An earlier draft did the honest
-- thing behaviourally — UPDATE a real row with 'Aries' and check it came back
-- NULL — but that means a migration writing to a production account purely to
-- test itself, which bumps `updated_at` via trigger_profile_updated for no
-- product reason. The behavioural proof belongs in
-- supabase/tests/rising_requires_birth_time.test.sql, which uses its own
-- fixtures and ends in ROLLBACK.
--
-- (For the record: the cleanup UPDATEs above cannot send anything. Both
-- AFTER UPDATE triggers on profiles — trigger_send_welcome_email and
-- trigger_schedule_onboarding_emails — are guarded on onboarding_completed
-- transitioning FALSE→TRUE, and these statements never touch that column.)

DO $trigger_check$
DECLARE
  -- TEXT, not CHAR: tgenabled is the internal "char" type and TEXT takes it
  -- through a plain I/O conversion with no padding surprises.
  v_enabled TEXT;
BEGIN
  SELECT t.tgenabled
    INTO v_enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE n.nspname = 'public'
     AND c.relname = 'profiles'
     AND t.tgname = 'trigger_enforce_rising_requires_birth_time'
     AND p.proname = 'enforce_rising_requires_birth_time'
     AND NOT t.tgisinternal;

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION
      'trigger_enforce_rising_requires_birth_time is not attached to public.profiles. Migration aborted.';
  END IF;

  -- tgenabled has FOUR values, and only two of them fire in a normal session:
  --   'O' origin   — fires (the default)
  --   'A' always   — fires, including on a replica
  --   'D' disabled — never fires
  --   'R' replica  — fires ONLY in replica mode, i.e. never for our clients
  --
  -- Checking `= 'D'` alone would let 'R' through, and a replica-only trigger
  -- leaves the invariant completely unenforced while looking installed in
  -- every catalog listing. Assert the firing states instead of guessing at
  -- the broken ones.
  IF v_enabled NOT IN ('O', 'A') THEN
    RAISE EXCEPTION
      'trigger_enforce_rising_requires_birth_time is attached but will not fire (tgenabled = %). Migration aborted.',
      v_enabled;
  END IF;

  RAISE NOTICE 'Trigger installed and firing: no client version can store an ascendant without a birth time.';
END;
$trigger_check$;

commit;

-- =============================================================================
-- 4) Report, as a RESULT SET
-- =============================================================================
-- The RAISE NOTICEs above are the detailed story, but the Supabase SQL Editor
-- does not render notices — someone applying this by paste sees only
-- "Success, no rows returned" and learns nothing. A trailing SELECT is the
-- only channel that UI actually shows.
--
-- `violations_column` and `violations_chart` MUST both be 0. `repaired_now`
-- is the size of the bug: rows without a birth time whose updated_at matches
-- this migration's transaction timestamp, i.e. the accounts that were being
-- shown an ascendant nobody could have computed.
--
-- Harmless under `supabase db push`, which ignores result sets.

SELECT
  COUNT(*) FILTER (WHERE birth_time IS NULL AND rising_sign IS NOT NULL)
    AS violations_column,
  COUNT(*) FILTER (WHERE birth_time IS NULL
                     AND birth_chart IS NOT NULL
                     AND jsonb_typeof(birth_chart) = 'object'
                     AND birth_chart ? 'rising'
                     AND birth_chart -> 'rising' <> 'null'::jsonb)
    AS violations_chart,
  COUNT(*) FILTER (WHERE birth_time IS NULL AND updated_at >= NOW() - INTERVAL '1 minute')
    AS repaired_now,
  COUNT(*) FILTER (WHERE birth_time IS NULL)
    AS accounts_without_birth_time,
  COUNT(*) FILTER (WHERE birth_time IS NOT NULL AND rising_sign IS NOT NULL)
    AS real_ascendants_kept
FROM public.profiles;
