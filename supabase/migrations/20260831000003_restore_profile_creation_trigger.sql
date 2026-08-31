-- Restore the profile row that every signup is supposed to get.
--
-- WHAT WAS BROKEN
-- ---------------
-- 20260427000020 dropped `on_auth_user_created` (a Studio-authored drift
-- function) on the stated premise that `trigger_create_profile_on_auth_signup`
-- from 20260319_create_profiles_on_auth_signup.sql was already live in prod.
-- That migration carried an explicit PRE-FLIGHT CHECK saying the repo trigger
-- MUST be active first, "otherwise new signups would not get a profiles row".
--
-- The check was never run. On 2026-08-31 a catalog read returned NOTHING:
--
--   SELECT t.tgname FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE NOT t.tgisinternal AND n.nspname='auth' AND c.relname='users';
--   -- 0 rows
--
-- There is no trigger on auth.users at all. Since 27 April, a new account has
-- received a `profiles` row only if the reader reached the web setup form,
-- which creates one lazily (AccountSetupForm.tsx `ensureWebProfileExists`).
--
-- WHAT IT COST
-- ------------
-- 143 of 245 confirmed accounts have no profiles row. They are invisible to
-- `send-email` (which reads profiles.email), to every product query, and to
-- the retention instrumentation added this week. The loss is worst where the
-- setup form is hardest to reach: 94% of Apple sign-ins, 67% of Google, 30%
-- of email/password. That OAuth gap is a SEPARATE bug in the callback and is
-- NOT fixed here -- this migration only stops the row from going missing.
--
-- WHY THE TRIGGER IS NOT A VERBATIM RESTORE
-- -----------------------------------------
-- The 20260319 body has no exception handler, and profiles carries CHECK
-- constraints (gender, age). An AFTER INSERT trigger runs inside the signup
-- transaction, so any constraint violation there does not skip the profile --
-- it rolls back the whole signup. Restoring it as written would put every
-- future registration behind a constraint on metadata we do not control.
-- Here, gender is sanitised against the CHECK and the whole body is wrapped:
-- a failure costs one profile row and a WARNING in the logs, never a signup.

begin;

-- =============================================================================
-- 0) Pre-flight: prove the backfill below cannot send mail
-- =============================================================================
-- `trigger_schedule_onboarding_emails` is AFTER UPDATE and fires only on
-- onboarding_completed FALSE->TRUE, so INSERTing 143 dormant rows cannot arm
-- it. That is the current state, not a guarantee. Assert it, because being
-- wrong means mailing months-old accounts a "day 1" message.
DO $preflight$
DECLARE
  v_mailers INT;
  v_missing INT;
BEGIN
  SELECT COUNT(*) INTO v_mailers
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p      ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND c.relname = 'profiles'
     AND (t.tgtype & 4) <> 0            -- bit 2 of tgtype: fires on INSERT
     AND p.prosrc ILIKE '%scheduled_emails%';

  SELECT COUNT(*) INTO v_missing
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE p.id IS NULL;

  IF v_mailers > 0 THEN
    RAISE EXCEPTION
      'Aborted: % INSERT trigger(s) on public.profiles touch scheduled_emails. The backfill would mail % dormant account(s).',
      v_mailers, v_missing;
  END IF;

  RAISE NOTICE 'Pre-flight OK. % account(s) missing a profile row.', v_missing;
END
$preflight$;

-- =============================================================================
-- 1) The function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gender TEXT;
BEGIN
  -- profiles.gender carries a CHECK. Anything else becomes NULL rather than
  -- aborting the signup this trigger is attached to.
  v_gender := NEW.raw_user_meta_data ->> 'gender';
  IF v_gender IS NOT NULL
     AND v_gender NOT IN ('male','female','non-binary','other','prefer-not-to-say')
  THEN
    v_gender := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, name, gender)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    v_gender
  )
  ON CONFLICT (id) DO UPDATE
  SET email  = COALESCE(public.profiles.email,  EXCLUDED.email),
      name   = COALESCE(public.profiles.name,   EXCLUDED.name),
      gender = COALESCE(public.profiles.gender, EXCLUDED.gender);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A missing profile row is recoverable: the setup form creates one lazily,
  -- and this migration's backfill catches the rest. A failed signup is not.
  RAISE WARNING 'handle_new_auth_user_profile failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2) The trigger
-- =============================================================================
-- NOTE ON PERMISSIONS: creating a trigger on auth.users requires ownership of
-- that table. In hosted Supabase it is owned by supabase_auth_admin, and the
-- role the CLI applies migrations as may not qualify -- which is the most
-- likely reason 20260319 never took effect in prod. If this statement fails
-- with "must be owner of relation users", run this file from the Studio SQL
-- editor, which executes as postgres.
DROP TRIGGER IF EXISTS trigger_create_profile_on_auth_signup ON auth.users;

CREATE TRIGGER trigger_create_profile_on_auth_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

-- =============================================================================
-- 3) Backfill the accounts stranded since 27 April
-- =============================================================================
DO $backfill$
DECLARE
  v_created INT;
BEGIN
  INSERT INTO public.profiles (id, email, name, gender, created_at, updated_at)
  SELECT
    u.id,
    u.email,
    COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    ),
    CASE
      WHEN u.raw_user_meta_data ->> 'gender'
           IN ('male','female','non-binary','other','prefer-not-to-say')
      THEN u.raw_user_meta_data ->> 'gender'
    END,
    -- The signup date, NOT now(). Defaulting to now() would stamp 143 rows
    -- with today and destroy the monthly cohort analysis that found this bug.
    u.created_at,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RAISE NOTICE 'Backfilled % profile row(s).', v_created;
END
$backfill$;

-- =============================================================================
-- 4) Postconditions
-- =============================================================================
DO $verify$
DECLARE
  v_still_missing INT;
  v_trigger_state TEXT;
BEGIN
  SELECT COUNT(*) INTO v_still_missing
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE p.id IS NULL;

  IF v_still_missing > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % account(s) still have no profile.', v_still_missing;
  END IF;

  SELECT t.tgenabled::TEXT INTO v_trigger_state
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'auth' AND c.relname = 'users'
     AND t.tgname  = 'trigger_create_profile_on_auth_signup';

  IF v_trigger_state IS NULL THEN
    RAISE EXCEPTION 'Trigger trigger_create_profile_on_auth_signup was not created.';
  END IF;

  -- O = enabled, A = always. D (disabled) and R (replica only) do not fire in
  -- a normal session, which would leave the bug in place while looking fixed.
  IF v_trigger_state NOT IN ('O','A') THEN
    RAISE EXCEPTION 'Trigger exists but tgenabled = % (does not fire).', v_trigger_state;
  END IF;

  RAISE NOTICE 'OK. Trigger live (tgenabled=%), 0 accounts without a profile.', v_trigger_state;
END
$verify$;

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- The Studio SQL editor does not render NOTICEs, so restate the result as rows.
-- Expect: trigger_live = true, comptes_sans_profil = 0.
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname  = 'trigger_create_profile_on_auth_signup'
      AND t.tgenabled IN ('O','A')
  )                                                                  AS trigger_live,
  (SELECT COUNT(*) FROM auth.users u
     LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL)                                              AS comptes_sans_profil,
  (SELECT COUNT(*) FROM public.profiles)                             AS profils_total,
  (SELECT COUNT(*) FROM public.profiles WHERE onboarding_completed)  AS profils_onboardes;
