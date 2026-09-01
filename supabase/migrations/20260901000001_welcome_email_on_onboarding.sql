-- Send the welcome email that has never been sent.
--
-- WHAT WAS BROKEN
-- ---------------
-- `welcome` has existed in supabase/functions/send-email/templates.ts since
-- the lifecycle sequence shipped, it is in the whitelist of
-- `record_product_event`, it is asserted by validate-email-templates — and
-- **nothing in the repository has ever enqueued or sent it**. No trigger, no
-- call site. Every account that ever completed onboarding was welcomed by
-- silence, then heard from JUNO 24 hours later with a "day 1" email.
--
-- WHY THE QUEUE AND NOT A DIRECT SEND
-- -----------------------------------
-- `trigger_schedule_onboarding_emails` already turns the
-- `onboarding_completed` FALSE→TRUE transition into three rows in
-- `scheduled_emails`, which `send-scheduled-emails` drains through
-- `send-email`. Sending welcome from inside the trigger instead would mean an
-- HTTP call inside the transaction that completes onboarding: a Resend outage
-- would then roll back the user's onboarding. The queue is the existing
-- pattern and the safe one. `scheduled_for = NOW()` means "next cron run",
-- which is the soonest anything can go out anyway.
--
-- IDEMPOTENCE — WHY AN INDEX AND NOT A COLUMN
-- -------------------------------------------
-- A `profiles.welcome_email_sent_at` column would only be as reliable as the
-- code that remembers to write it. A partial UNIQUE index cannot be
-- circumvented: at most one welcome row per user can exist, whatever inserts
-- it, forever. The trigger pairs it with ON CONFLICT DO NOTHING, so a second
-- FALSE→TRUE transition — a profile edit that toggles the flag, a support
-- action, a replayed migration — is a no-op rather than a duplicate email.
--
-- This is the same shape as `ux_product_events_client_event_id`
-- (20260831000002): put the guarantee in the schema, not in the caller.
--
-- WHAT IS DELIBERATELY NOT DONE
-- -----------------------------
-- **No backfill.** The trigger fires on the transition only, so accounts that
-- completed onboarding before this migration will never receive a welcome.
-- That is the requested behaviour: mailing "Welcome to JUNO / your account is
-- verified and your birth chart is calculated" to someone who signed up in
-- June would read as a mistake, not a welcome. The opt-in backfill query is in
-- docs/suivi-supabase-2026-09.md and is not run here.
--
-- SUPPRESSION IS NOT THIS MIGRATION'S JOB, EXCEPT FOR is_active
-- ------------------------------------------------------------
-- The row is enqueued regardless of `notification_preferences`, and
-- `send-email` decides at send time. That ordering is deliberate: preferences
-- can change between onboarding and the next cron tick, and a reader who
-- re-subscribes in that window should still be welcomed. `send-email` marks a
-- suppressed send as `{ skipped: true }`, which `send-scheduled-emails` records
-- as `sent` — so a suppressed welcome is never retried.
--
-- `is_active` IS checked here, because a deactivated account should not even
-- have a row queued against it, and a second check at send time is added in
-- send-email/index.ts for the window in between.

begin;

-- =============================================================================
-- 1) The idempotency guarantee
-- =============================================================================
-- Partial: only `welcome` is once-per-lifetime. onboarding_day1/3/5 keep their
-- current semantics untouched — this migration must not change them, and a
-- broader unique index would also fail outright if any account somehow already
-- holds two rows for the same template.
--
-- Creation cannot fail on existing data: nothing has ever written a `welcome`
-- row. The pre-flight below proves that rather than assuming it.
DO $preflight$
DECLARE
  v_existing INT;
BEGIN
  SELECT COUNT(*) INTO v_existing
    FROM public.scheduled_emails
   WHERE template = 'welcome';

  IF v_existing > 0 THEN
    RAISE NOTICE 'Found % pre-existing welcome row(s); the unique index below will fail if any user holds two.', v_existing;
  ELSE
    RAISE NOTICE 'Pre-flight OK: no welcome row has ever been written.';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_scheduled_emails_welcome_once
  ON public.scheduled_emails (user_id)
  WHERE template = 'welcome';

COMMENT ON INDEX public.ux_scheduled_emails_welcome_once IS
  'At most one welcome email per account, ever. The guarantee lives in the schema so no caller can bypass it; schedule_onboarding_emails pairs it with ON CONFLICT DO NOTHING.';

-- =============================================================================
-- 2) The trigger function
-- =============================================================================
-- The three existing INSERTs are reproduced verbatim from
-- 20260329000002_onboarding_email_sequence.sql. Do not "tidy" them: their
-- offsets (24h / 72h / 120h) and their params are the shipped product.
CREATE OR REPLACE FUNCTION public.schedule_onboarding_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only fire when onboarding_completed transitions to TRUE
  IF NEW.onboarding_completed = TRUE
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = FALSE)
  THEN
    -- Welcome: immediately (i.e. on the next cron tick).
    --
    -- Skipped entirely for a deactivated account. ON CONFLICT DO NOTHING makes
    -- a repeat transition a no-op instead of a second email.
    IF COALESCE(NEW.is_active, TRUE) = TRUE THEN
      INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
      VALUES (NEW.id, 'welcome', '{}'::jsonb, NOW())
      ON CONFLICT (user_id) WHERE template = 'welcome' DO NOTHING;
    END IF;

    -- J+1: Natal chart email (24 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day1',
      jsonb_build_object('sunSign', COALESCE(NEW.sun_sign, '')),
      NOW() + INTERVAL '24 hours'
    );

    -- J+3: Compatibility email (72 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day3',
      '{}'::jsonb,
      NOW() + INTERVAL '72 hours'
    );

    -- J+5: Trial ending email (120 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day5',
      '{}'::jsonb,
      NOW() + INTERVAL '120 hours'
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.schedule_onboarding_emails() IS
  'Enqueues welcome (immediate) + onboarding_day1/3/5 when onboarding_completed goes FALSE->TRUE. Welcome is once per account for life (ux_scheduled_emails_welcome_once) and is skipped for is_active = false. Opt-out is NOT decided here: send-email applies notification_preferences at send time, so a reader who re-subscribes before the cron tick is still welcomed.';

-- The trigger itself is unchanged; recreate it so this migration is complete
-- on a database where it was somehow dropped.
DROP TRIGGER IF EXISTS trigger_schedule_onboarding_emails ON public.profiles;

CREATE TRIGGER trigger_schedule_onboarding_emails
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.schedule_onboarding_emails();

-- =============================================================================
-- 3) Postconditions
-- =============================================================================
DO $verify$
DECLARE
  v_index    INT;
  v_trigger  TEXT;
  v_welcome  BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO v_index
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname  = 'ux_scheduled_emails_welcome_once';

  IF v_index <> 1 THEN
    RAISE EXCEPTION 'The welcome idempotency index was not created.';
  END IF;

  SELECT t.tgenabled::TEXT INTO v_trigger
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public' AND c.relname = 'profiles'
     AND t.tgname  = 'trigger_schedule_onboarding_emails';

  IF v_trigger IS NULL THEN
    RAISE EXCEPTION 'trigger_schedule_onboarding_emails is missing.';
  END IF;

  -- O = enabled, A = always. D (disabled) and R (replica only) do not fire in
  -- a normal session, which would leave the feature dead while looking live.
  IF v_trigger NOT IN ('O','A') THEN
    RAISE EXCEPTION 'trigger_schedule_onboarding_emails exists but tgenabled = % (does not fire).', v_trigger;
  END IF;

  -- The function must actually mention welcome, or this migration silently
  -- reproduced the old three-email body.
  SELECT p.prosrc LIKE '%''welcome''%' INTO v_welcome
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'schedule_onboarding_emails';

  IF NOT COALESCE(v_welcome, FALSE) THEN
    RAISE EXCEPTION 'schedule_onboarding_emails does not enqueue welcome.';
  END IF;

  RAISE NOTICE 'OK. Welcome is enqueued on onboarding, once per account, is_active gated.';
END
$verify$;

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- The Studio SQL editor does not render NOTICEs, so restate the result as rows.
-- Expect: index_unique = true, trigger_actif = true, enqueue_welcome = true,
-- welcome_en_file = 0 (no backfill was performed).
SELECT
  (SELECT COUNT(*) = 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname  = 'ux_scheduled_emails_welcome_once')          AS index_unique,
  (SELECT COUNT(*) = 1 FROM pg_trigger t
     JOIN pg_class c     ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public' AND c.relname = 'profiles'
      AND t.tgname  = 'trigger_schedule_onboarding_emails'
      AND t.tgenabled IN ('O','A'))                                 AS trigger_actif,
  (SELECT p.prosrc LIKE '%''welcome''%' FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'schedule_onboarding_emails')
                                                                    AS enqueue_welcome,
  (SELECT COUNT(*) FROM public.scheduled_emails WHERE template = 'welcome')
                                                                    AS welcome_en_file;
