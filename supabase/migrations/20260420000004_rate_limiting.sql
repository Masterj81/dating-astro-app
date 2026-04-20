-- P1-4 — Durable server-side rate limiting for edge functions.
--
-- Replaces `calculate-chart`'s in-process Map keyed on X-Forwarded-For (easily
-- spoofable + lost on cold start). This migration provides:
--   - public.edge_rate_limits        → tumbling-window counter table
--   - public.check_edge_rate_limit()  → atomic counter increment, returns a
--                                       boolean allowed flag
--   - cleanup of old windows via the existing daily cleanup job
--
-- We intentionally pick tumbling windows rather than a sliding window: they
-- are trivially atomic via INSERT ... ON CONFLICT, cheap to store, and
-- accurate-enough for abuse prevention.

BEGIN;

-- We reuse the name `rate_limits` from 00000000000000_full_schema.sql for the
-- per-user in-table triggers (swipes/messages). Use a distinct table for
-- edge-function rate limits to avoid colliding with the existing schema.
CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key           TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_window_start
  ON public.edge_rate_limits (window_start);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to edge_rate_limits"
  ON public.edge_rate_limits;
CREATE POLICY "Deny all direct access to edge_rate_limits"
  ON public.edge_rate_limits FOR ALL USING (false);

CREATE OR REPLACE FUNCTION public.check_edge_rate_limit(
  p_key             TEXT,
  p_max             INTEGER,
  p_window_seconds  INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RETURN FALSE; -- defensive: refuse unkeyed requests
  END IF;
  IF p_max IS NULL OR p_max <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Tumbling window: bucket = floor(now / window) * window
  v_bucket := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.edge_rate_limits (key, window_start, count)
  VALUES (p_key, v_bucket, 1)
  ON CONFLICT (key, window_start) DO UPDATE
     SET count = public.edge_rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
-- Intentionally granted to authenticated callers too: the function simply
-- increments a counter on a caller-supplied key. Callers cannot bypass their
-- own rate limit, and can already trigger it by making real requests. This
-- lets lightly-privileged edge functions (e.g. calculate-chart) use a plain
-- JWT client rather than escalating to service_role for rate limiting alone.
GRANT  EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.check_edge_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Cleanup of stale rate-limit buckets. Kept >24h so we can investigate abuse.
CREATE OR REPLACE FUNCTION public.cleanup_edge_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.edge_rate_limits
   WHERE window_start < NOW() - INTERVAL '2 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  PERFORM cron.schedule(
    'cleanup-edge-rate-limits',
    '15 3 * * *',
    $cron$SELECT public.cleanup_edge_rate_limits();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable — schedule cleanup_edge_rate_limits() manually';
END $$;

COMMIT;
