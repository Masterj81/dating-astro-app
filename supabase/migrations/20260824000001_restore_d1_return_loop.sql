-- Restore the D+1 retention loop.
--
-- Context:
-- - onboarding completion already schedules onboarding_day1/day3/day5 rows in
--   scheduled_emails, but no pg_cron job dispatches them.
-- - daily-horoscope-push is scheduled, but new profiles default
--   notification_preferences.dailyHoroscope to false, so new users never enter
--   the daily return loop by default.
--
-- This migration schedules the email dispatcher and changes the default for
-- new profiles only. It intentionally does not backfill existing profiles'
-- notification preferences; changing an already-saved preference is a product
-- consent decision, not a schema fix.

begin;

DO $$
DECLARE
  v_url      TEXT;
  v_secret   TEXT;
  v_anon_key TEXT;
BEGIN
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/send-scheduled-emails';

  v_secret := public._load_cron_secret(
    'cron_scheduled_emails_secret',
    'app.settings.scheduled_emails_secret'
  );

  v_anon_key := COALESCE(
    current_setting('app.settings.supabase_anon_key', TRUE),
    ''
  );

  PERFORM cron.unschedule('send-scheduled-emails')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'send-scheduled-emails'
  );

  PERFORM cron.schedule(
    'send-scheduled-emails',
    '*/15 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduled-emails-secret', %L,
          'Authorization', 'Bearer ' || %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_url,
      v_secret,
      v_anon_key
    )
  );

  RAISE NOTICE 'Scheduled send-scheduled-emails every 15 minutes';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net/vault not available; schedule send-scheduled-emails manually (%)', SQLERRM;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN notification_preferences
  SET DEFAULT '{"newMatches": true, "messages": true, "likes": true, "superLikes": true, "dailyHoroscope": true, "promotions": false}'::jsonb;

commit;
