-- Schedule pg_cron job to call publish-scheduled-posts edge function every 5 minutes.
-- Without this, rows inserted into marketing_posts stay in 'scheduled' status forever
-- and never reach Blotato.

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

  v_secret := COALESCE(
    current_setting('app.settings.scheduled_posts_secret', TRUE),
    ''
  );

  v_service_role_key := COALESCE(
    current_setting('app.settings.supabase_service_role_key', TRUE),
    ''
  );

  -- Remove existing schedule if any
  PERFORM cron.unschedule('publish-scheduled-posts')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-posts'
  );

  -- Run every 5 minutes
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

  RAISE NOTICE 'Scheduled publish-scheduled-posts cron job every 5 minutes';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron or pg_net not available — schedule publish-scheduled-posts manually';
END;
$$;
