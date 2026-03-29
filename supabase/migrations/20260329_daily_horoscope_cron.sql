-- Schedule daily horoscope push notifications at 12:00 UTC (8 AM EDT)
-- Uses pg_cron to call the send-daily-horoscope edge function

DO $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_anon_key TEXT;
BEGIN
  -- Build the edge function URL from the Supabase project URL
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://qtihezzbuubnyvrjdkjd.supabase.co'
  ) || '/functions/v1/send-daily-horoscope';

  v_secret := COALESCE(
    current_setting('app.settings.daily_horoscope_secret', TRUE),
    ''
  );

  v_anon_key := COALESCE(
    current_setting('app.settings.supabase_anon_key', TRUE),
    ''
  );

  -- Remove existing schedule if any
  PERFORM cron.unschedule('daily-horoscope-push')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'daily-horoscope-push'
  );

  -- Schedule daily at 12:00 UTC (8 AM EDT / 7 AM EST)
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

  RAISE NOTICE 'Scheduled daily-horoscope-push cron job at 12:00 UTC';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron or pg_net not available — schedule daily-horoscope-push manually';
END;
$$;
