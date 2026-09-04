-- =============================================================================
-- Watchdog — notice the day someone re-grants SELECT on public.profiles
-- =============================================================================
--
-- OPTIONAL, and separate from the P0 fix on purpose: a fix must be pasteable on
-- its own, fast, and free of new objects. This adds monitoring, which is a
-- different decision with a different blast radius.
--
-- WHY IT EXISTS
-- -------------
-- The 3 Sep incident was not that a privilege was wrong. It was that a
-- privilege changed outside version control, and nothing said so for a day. The
-- grant is not in any migration — every `GRANT ... TO authenticated` on a table
-- in this repo was enumerated and they all target `discoverable_profiles`. So
-- whatever created it can create it again, and `20260903000003` alone would not
-- tell us.
--
-- Code-side guards cannot cover this: `scripts/validate-*.mjs` read the repo,
-- and the repo is not where the change happened. The check has to live in the
-- database.
--
-- WHAT IT DOES
-- ------------
-- A function that answers one question — are the nine sensitive columns of
-- `public.profiles` readable by a client role? — and a daily pg_cron job that
-- records an alert row when the answer is yes. Nothing is emailed or paged: a
-- row in a table someone can query, and that a dashboard or a later cron can
-- pick up, is the honest scope for a project this size.
--
-- The function is SECURITY DEFINER because `information_schema` shows a caller
-- only the privileges its own roles are party to; the definer sees all of them.

begin;

CREATE TABLE IF NOT EXISTS public.security_posture_alerts (
  id           BIGSERIAL PRIMARY KEY,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_key    TEXT        NOT NULL,
  detail       JSONB       NOT NULL,
  resolved_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.security_posture_alerts IS
  'One row each time a scheduled posture check fails. Written by SECURITY DEFINER functions run from pg_cron; never by a client. Read it with service_role or from the SQL editor.';

ALTER TABLE public.security_posture_alerts ENABLE ROW LEVEL SECURITY;
-- No policies, and no grants: RLS with zero policies denies everyone except
-- table owner and service_role. Same shape as public.product_events.
REVOKE ALL ON public.security_posture_alerts FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_security_posture_alerts_open
  ON public.security_posture_alerts (check_key, detected_at DESC)
  WHERE resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- The check itself, callable by hand: SELECT * FROM public.check_profiles_pii_posture();
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_profiles_pii_posture()
RETURNS TABLE (ok BOOLEAN, detail JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sensitive CONSTANT TEXT[] := ARRAY[
    'email', 'birth_date', 'birth_time', 'birth_latitude', 'birth_longitude',
    'birth_chart', 'push_token', 'notification_preferences', 'referred_by'
  ];
  v_col   INTEGER;
  v_table INTEGER;
  v_who   JSONB;
BEGIN
  SELECT count(*),
         COALESCE(jsonb_agg(jsonb_build_object(
           'grantee', cp.grantee, 'column', cp.column_name)), '[]'::jsonb)
    INTO v_col, v_who
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public'
    AND cp.table_name   = 'profiles'
    AND cp.column_name  = ANY (v_sensitive)
    AND cp.grantee IN ('anon', 'authenticated')
    AND cp.privilege_type = 'SELECT';

  SELECT count(*) INTO v_table
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.table_name   = 'profiles'
    AND tp.grantee IN ('anon', 'authenticated')
    AND tp.privilege_type = 'SELECT';

  RETURN QUERY SELECT
    (v_col = 0 AND v_table = 0),
    jsonb_build_object(
      'column_level_select_grants', v_col,
      'table_level_select_grants',  v_table,
      'offenders',                  v_who,
      'note', 'a table-level GRANT SELECT re-covers every column and makes column revokes no-ops'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_profiles_pii_posture() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.check_profiles_pii_posture IS
  'Returns (ok, detail) for the profiles PII posture. Checks BOTH column_privileges and table_privileges: on 3 Sep 2026 a table-level grant made five columns readable while the column-level revokes reported success. Not granted to client roles — it is an operator tool.';

-- ---------------------------------------------------------------------------
-- Record a failure. Idempotent per day: one open alert at a time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_profiles_pii_posture()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ok     BOOLEAN;
  v_detail JSONB;
BEGIN
  SELECT c.ok, c.detail INTO v_ok, v_detail
  FROM public.check_profiles_pii_posture() c;

  IF v_ok THEN
    -- Posture is good: close anything still open.
    UPDATE public.security_posture_alerts
       SET resolved_at = NOW()
     WHERE check_key = 'profiles_pii_select'
       AND resolved_at IS NULL;
    RETURN;
  END IF;

  -- Broken: open one alert, do not spam a row per run.
  IF NOT EXISTS (
    SELECT 1 FROM public.security_posture_alerts
     WHERE check_key = 'profiles_pii_select' AND resolved_at IS NULL
  ) THEN
    INSERT INTO public.security_posture_alerts (check_key, detail)
    VALUES ('profiles_pii_select', v_detail);
  END IF;

  RAISE WARNING 'SECURITY: profiles PII columns are readable by a client role: %', v_detail;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_profiles_pii_posture() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily, at 03:17 UTC. pg_cron is already used here for the daily horoscope
-- (20260329000001), so the extension is present; the guard keeps this
-- migration runnable on an environment where it is not.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM extensions.cron.unschedule('profiles-pii-posture');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled yet, or pg_cron absent
END
$$;

DO $$
BEGIN
  PERFORM extensions.cron.schedule(
    'profiles-pii-posture',
    '17 3 * * *',
    $cron$SELECT public.record_profiles_pii_posture();$cron$
  );
  RAISE NOTICE 'Scheduled daily posture check at 03:17 UTC.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable — run SELECT public.record_profiles_pii_posture(); from an external scheduler instead.';
END
$$;

commit;

-- Read open alerts:
--   SELECT * FROM public.security_posture_alerts WHERE resolved_at IS NULL;
-- Check on demand:
--   SELECT * FROM public.check_profiles_pii_posture();
