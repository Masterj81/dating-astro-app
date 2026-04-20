-- P0-4 — Soft-deletion window for user accounts.
--
-- Instead of hard-deleting the auth.users row the moment a user taps
-- "Delete account", we mark the profile with a `deletion_requested_at` and
-- `deletion_scheduled_for` (NOW() + 7 days). A daily pg_cron job later
-- hard-deletes accounts whose grace window has expired. During the window
-- the user can cancel via an email link (cancel-account-deletion).
--
-- This protects against:
--   - Accidental taps / stolen phones (the user has 7 days to recover).
--   - Account-takeover attackers racing to destroy evidence.

begin;

-- 1) Columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_scheduled_for
  ON public.profiles (deletion_scheduled_for)
  WHERE deletion_scheduled_for IS NOT NULL;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  'Timestamp when the user requested account deletion. NULL means no pending deletion.';
COMMENT ON COLUMN public.profiles.deletion_scheduled_for IS
  'Timestamp at which the account becomes eligible for hard deletion (7 days after the request).';

-- 2) Cron job: hard-delete accounts whose grace window has expired.
--    We dispatch the work to an edge function (process-expired-deletions)
--    so the service_role key stays out of the database config. If the edge
--    function is not deployed yet, this cron simply no-ops on failure.
--
--    The cron expression is "0 3 * * *" (03:00 UTC daily).
DO $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_service_role_key TEXT;
BEGIN
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/process-expired-deletions';

  v_secret := COALESCE(
    current_setting('app.settings.expired_deletions_secret', TRUE),
    ''
  );

  v_service_role_key := COALESCE(
    current_setting('app.settings.supabase_service_role_key', TRUE),
    ''
  );

  PERFORM cron.unschedule('process-expired-deletions')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-expired-deletions'
  );

  PERFORM cron.schedule(
    'process-expired-deletions',
    '0 3 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-expired-deletions-secret', %L,
          'Authorization', 'Bearer ' || %L
        ),
        body := '{}'::jsonb
      );
      $cron$,
      v_url,
      v_secret,
      v_service_role_key
    )
  );

  RAISE NOTICE 'Scheduled process-expired-deletions daily at 03:00 UTC';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron or pg_net not available — schedule process-expired-deletions manually';
END;
$$;

commit;
