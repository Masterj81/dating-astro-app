-- Attribute an email click to its reader when identity arrives late.
--
-- THE GAP THIS CLOSES
-- -------------------
-- 20260831000001 records `email_clicked` on page load, with `auth.uid()`,
-- which is NULL when the reader is not signed in. That was deliberate: a click
-- that bounces at the sign-in wall must stay distinguishable from a click that
-- never happened.
--
-- But it is also the DOMINANT path. People open lifecycle email in a mail app,
-- which hands the link to a browser that frequently has no session. The real
-- sequence is:
--
--   land (no session) → row written with user_id NULL
--                     → reader signs in
--                     → identity now known, and nothing records it
--
-- So `product_events.user_id` would have been NULL for most real clicks, and
-- every query that joins clicks to profiles — "clicked → active", "clicked →
-- saw their chart", "clicked → returned on day 1" — would have come back
-- empty. The funnel would have looked measured while staying blind at exactly
-- the join that matters.
--
-- THE FIX
-- -------
-- The client mints one `client_event_id` per (template, browser session) and
-- sends it on every call. The first call inserts. A later call — fired when
-- `onAuthStateChange` reports a session — hits the same id and UPGRADES the
-- existing row in place instead of adding a second one.
--
-- One row per click, whose `user_id` fills in if and when identity shows up.
-- No double counting, and the anonymous case is still visible as a row that
-- simply never got upgraded.

begin;

-- =============================================================================
-- 1) The idempotency key
-- =============================================================================
ALTER TABLE public.product_events
  ADD COLUMN IF NOT EXISTS client_event_id UUID;

COMMENT ON COLUMN public.product_events.client_event_id IS
  'Client-minted id, one per (template, browser session). Lets a later call attribute an already-recorded anonymous click to the reader who then signed in, without inserting a second row. Random UUID, carries no identity of its own.';

-- Partial: rows written before this migration, and any future caller that does
-- not supply an id, keep working and simply cannot be upgraded.
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_events_client_event_id
  ON public.product_events (client_event_id)
  WHERE client_event_id IS NOT NULL;

-- =============================================================================
-- 2) The write path, now attribution-aware
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_product_event(
  p_event_name      TEXT,
  p_template        TEXT DEFAULT NULL,
  p_utm_source      TEXT DEFAULT NULL,
  p_utm_campaign    TEXT DEFAULT NULL,
  p_path            TEXT DEFAULT NULL,
  p_platform        TEXT DEFAULT NULL,
  p_client_event_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_events    CONSTANT TEXT[] := ARRAY['email_clicked'];
  c_templates CONSTANT TEXT[] := ARRAY[
    'welcome', 'onboarding_day1', 'onboarding_day3', 'onboarding_day5'
  ];
  c_platforms CONSTANT TEXT[] := ARRAY['web', 'mobile'];

  v_path     TEXT;
  v_platform TEXT;
BEGIN
  IF p_event_name IS NULL OR NOT (p_event_name = ANY (c_events)) THEN
    RETURN;
  END IF;

  IF p_event_name = 'email_clicked'
     AND (p_template IS NULL OR NOT (p_template = ANY (c_templates)))
  THEN
    RETURN;
  END IF;

  -- Strip any query string defensively: the caller passes a pathname, but an
  -- unsubscribe token must never be able to arrive here by accident.
  v_path     := LEFT(SPLIT_PART(COALESCE(p_path, ''), '?', 1), 200);
  v_platform := CASE WHEN p_platform = ANY (c_platforms) THEN p_platform ELSE NULL END;

  IF p_client_event_id IS NULL THEN
    -- No idempotency key: behave exactly as before this migration.
    INSERT INTO public.product_events
      (user_id, event_name, template, utm_source, utm_campaign, path, platform)
    VALUES (auth.uid(), p_event_name, p_template,
            LEFT(p_utm_source, 64), LEFT(p_utm_campaign, 64), v_path, v_platform);
    RETURN;
  END IF;

  INSERT INTO public.product_events
    (user_id, event_name, template, utm_source, utm_campaign, path, platform,
     client_event_id)
  VALUES (auth.uid(), p_event_name, p_template,
          LEFT(p_utm_source, 64), LEFT(p_utm_campaign, 64), v_path, v_platform,
          p_client_event_id)
  ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL
  DO UPDATE
    -- COALESCE, never overwrite. An already-attributed row keeps its reader:
    -- the second call can only fill a hole, never reassign a click from one
    -- account to another. `created_at` is left alone so the row keeps the
    -- moment of the CLICK, not the moment of the sign-in — which is what the
    -- "clicked → active" query compares against.
    SET user_id = COALESCE(public.product_events.user_id, EXCLUDED.user_id)
    WHERE public.product_events.user_id IS NULL
      AND EXCLUDED.user_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'Append one product event, or attribute an existing one. Whitelists event name, template and platform; truncates attribution strings; strips any query string from the path. With a client_event_id, a repeat call upgrades the row from anonymous to identified instead of inserting a duplicate — never reassigning an already-attributed click. Silently ignores anything unrecognised.';

GRANT EXECUTE ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO anon, authenticated;

-- The 6-argument signature from 20260831000001 is a DIFFERENT function to
-- Postgres, and leaving it callable would let a stale cached client keep
-- writing rows that can never be attributed. Drop it: the new signature has a
-- default for the added parameter, so every existing call site still resolves.
DROP FUNCTION IF EXISTS public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- Expect: one function, 7 arguments, anon may execute, unique index present.
SELECT
  COUNT(*)                                                    AS overloads,
  MAX(p.pronargs)                                             AS arg_count,
  bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))    AS anon_can_record,
  (SELECT COUNT(*) = 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_product_events_client_event_id')     AS idempotency_index
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'record_product_event';
