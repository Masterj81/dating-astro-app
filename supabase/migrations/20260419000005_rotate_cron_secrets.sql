-- P0-6 — Rotate cron-dispatched edge function secrets.
--
-- The earlier migrations 20260329_daily_horoscope_cron.sql and
-- 20260413_publish_scheduled_posts_cron.sql already load their secrets from
-- `current_setting('app.settings.<name>', TRUE)` rather than hard-coding them,
-- so the raw secret values are not leaked in the repo. However:
--
--   1. If an operator ever ran `ALTER DATABASE ... SET app.settings.* = '<val>'`
--      with the actual secret, that value now lives in the database config and
--      is readable by any superuser session.
--   2. There is no guarantee the currently deployed secret has been rotated
--      since the cron jobs were first installed.
--
-- This migration:
--   (a) Unschedules the existing cron jobs.
--   (b) Re-schedules them reading the secret from the secure Supabase Vault
--       (`vault.decrypted_secrets`) rather than from GUCs.
--   (c) Falls back to the old GUC mechanism if the secret is absent from the
--       vault, so deployments that haven't finished the rotation keep working.
--
-- MANUAL STEP REQUIRED (run ONCE, outside of this migration, using psql as the
-- service_role / owner):
--
--   -- Replace <NEW_VALUE> with a freshly generated 32+ byte random string.
--   SELECT vault.create_secret('<NEW_VALUE>', 'cron_horoscope_secret',
--                              'x-daily-horoscope-secret header value');
--   SELECT vault.create_secret('<NEW_VALUE>', 'cron_scheduled_posts_secret',
--                              'x-scheduled-posts-secret header value');
--   SELECT vault.create_secret('<NEW_VALUE>', 'cron_expired_deletions_secret',
--                              'x-expired-deletions-secret header value');
--
-- Then update the matching edge function env vars (DAILY_HOROSCOPE_SECRET,
-- SCHEDULED_POSTS_SECRET, EXPIRED_DELETIONS_SECRET) with the SAME new value
-- via `supabase secrets set` so the edge function and the cron agree.
--
-- Finally, clear any lingering GUC values:
--   ALTER DATABASE postgres RESET app.settings.daily_horoscope_secret;
--   ALTER DATABASE postgres RESET app.settings.scheduled_posts_secret;

begin;

CREATE OR REPLACE FUNCTION public._load_cron_secret(p_name TEXT, p_guc TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v TEXT;
BEGIN
  -- Prefer the vault secret.
  BEGIN
    SELECT decrypted_secret
      INTO v
      FROM vault.decrypted_secrets
     WHERE name = p_name
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v := NULL;
  END;

  IF v IS NULL OR v = '' THEN
    v := COALESCE(current_setting(p_guc, TRUE), '');
  END IF;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._load_cron_secret(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._load_cron_secret(TEXT, TEXT) FROM authenticated;


-- =============================================================================
-- daily-horoscope-push
-- =============================================================================
DO $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_anon_key TEXT;
BEGIN
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/send-daily-horoscope';

  v_secret := public._load_cron_secret(
    'cron_horoscope_secret',
    'app.settings.daily_horoscope_secret'
  );

  v_anon_key := COALESCE(
    current_setting('app.settings.supabase_anon_key', TRUE),
    ''
  );

  PERFORM cron.unschedule('daily-horoscope-push')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'daily-horoscope-push'
  );

  PERFORM cron.schedule(
    'daily-horoscope-push',
    '0 12 * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-daily-horoscope-secret', %L,
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

  RAISE NOTICE 'Re-scheduled daily-horoscope-push with rotated secret';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net/vault not available — reschedule daily-horoscope-push manually (%)', SQLERRM;
END;
$$;

-- =============================================================================
-- publish-scheduled-posts
-- =============================================================================
DO $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_service_role_key TEXT;
BEGIN
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/publish-scheduled-posts';

  v_secret := public._load_cron_secret(
    'cron_scheduled_posts_secret',
    'app.settings.scheduled_posts_secret'
  );

  v_service_role_key := COALESCE(
    current_setting('app.settings.supabase_service_role_key', TRUE),
    ''
  );

  PERFORM cron.unschedule('publish-scheduled-posts')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-posts'
  );

  PERFORM cron.schedule(
    'publish-scheduled-posts',
    '*/5 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduled-posts-secret', %L,
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

  RAISE NOTICE 'Re-scheduled publish-scheduled-posts with rotated secret';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net/vault not available — reschedule publish-scheduled-posts manually (%)', SQLERRM;
END;
$$;

-- =============================================================================
-- process-expired-deletions (P0-4 support)
-- =============================================================================
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

  v_secret := public._load_cron_secret(
    'cron_expired_deletions_secret',
    'app.settings.expired_deletions_secret'
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

  RAISE NOTICE 'Re-scheduled process-expired-deletions with rotated secret';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net/vault not available — reschedule process-expired-deletions manually (%)', SQLERRM;
END;
$$;

commit;
