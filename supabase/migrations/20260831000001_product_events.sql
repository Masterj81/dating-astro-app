-- product_events — the smallest store that makes the funnel legible.
--
-- WHAT IS UNMEASURABLE TODAY
-- --------------------------
-- The funnel JUNO needs is:
--
--   signup → onboarding_completed → email_sent → email_clicked → app_open
--          → value_seen → returned_day1
--
-- Four of those already exist in the database (auth.users.created_at,
-- profiles.onboarding_completed, scheduled_emails.status, profiles.last_active).
-- `email_clicked` does not exist anywhere: the CTAs already carry
-- `?template=…&utm_source=lifecycle_email&utm_medium=email&utm_campaign=…`
-- (send-email/templates.ts appLink), the middleware preserves them through the
-- `/app` → `/{locale}/app` redirect, and then nothing reads them.
--
-- That single gap is what makes the current numbers unreadable. With 10 emails
-- sent and 0 returns, "nobody clicked" and "everybody clicked and bounced" are
-- the same row of data, and they call for opposite fixes — better subject
-- lines versus a better landing.
--
-- WHY A TABLE AND NOT AN SDK
-- --------------------------
-- Same reasoning as docs/retention-day2-audit-2026-08.md §8.4: no third-party
-- analytics, no extra privacy review, no PII leaving Supabase, and joins
-- against profiles / scheduled_emails / premium_usage stay in plain SQL.
--
-- WHAT IS DELIBERATELY NOT STORED
-- -------------------------------
-- No email address, no token, no unsubscribe HMAC, no user agent, no IP, no
-- referrer. The unsubscribe link carries a signed token and must never reach
-- this table — `record_product_event` accepts no free-form payload at all,
-- only a whitelisted event name, a whitelisted template, and short
-- attribution strings it truncates itself.

begin;

-- =============================================================================
-- 1) The table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_events (
  id          BIGSERIAL PRIMARY KEY,
  -- Nullable on purpose. A reader who clicks an email and bounces at the sign-in
  -- wall is exactly the case this table exists to distinguish from "never
  -- clicked", and they have no auth.uid() at that moment. ON DELETE SET NULL so
  -- account deletion keeps the aggregate honest without keeping the person.
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name  TEXT NOT NULL,
  -- Which lifecycle email, when the event came from one.
  template    TEXT,
  utm_source  TEXT,
  utm_campaign TEXT,
  -- Landing path, without query string (the RPC strips it).
  path        TEXT,
  -- 'web' | 'mobile'. Mobile does not write here yet — see §5 of
  -- docs/retention-measurement-2026-08.md.
  platform    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.product_events IS
  'Minimal product analytics. Written only through record_product_event (SECURITY DEFINER, whitelisted). Contains no PII: no email, no token, no IP, no user agent.';

CREATE INDEX IF NOT EXISTS idx_product_events_name_created
  ON public.product_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_user_created
  ON public.product_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_events_template
  ON public.product_events (template, created_at DESC)
  WHERE template IS NOT NULL;

-- =============================================================================
-- 2) RLS: nobody reads, nobody writes directly
-- =============================================================================
-- The table carries no policies at all, which under RLS means every request
-- through PostgREST is denied for anon and authenticated alike. Reads happen
-- in the SQL editor with the service role; writes happen through the RPC
-- below. Same posture as premium_usage after 20260823000001: a ledger its
-- own subjects can rewrite is not a ledger.
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.product_events FROM anon, authenticated;

-- =============================================================================
-- 3) The only write path
-- =============================================================================
-- Whitelists rather than sanitises: an unknown event name or template is
-- dropped silently rather than stored. That keeps the vocabulary closed, so a
-- typo in a client build cannot quietly create a parallel event stream that
-- nobody queries.
--
-- Returns void and never raises. A failed beacon is a missing data point; it
-- must never surface to a reader or break a page.

CREATE OR REPLACE FUNCTION public.record_product_event(
  p_event_name   TEXT,
  p_template     TEXT DEFAULT NULL,
  p_utm_source   TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_path         TEXT DEFAULT NULL,
  p_platform     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Closed vocabulary. Extend here AND in the client at the same time.
  c_events    CONSTANT TEXT[] := ARRAY['email_clicked'];
  c_templates CONSTANT TEXT[] := ARRAY[
    'welcome', 'onboarding_day1', 'onboarding_day3', 'onboarding_day5'
  ];
  c_platforms CONSTANT TEXT[] := ARRAY['web', 'mobile'];
BEGIN
  IF p_event_name IS NULL OR NOT (p_event_name = ANY (c_events)) THEN
    RETURN;
  END IF;

  -- An email_clicked with no recognised template tells us nothing and is the
  -- shape a spammer would send. Drop it.
  IF p_event_name = 'email_clicked'
     AND (p_template IS NULL OR NOT (p_template = ANY (c_templates)))
  THEN
    RETURN;
  END IF;

  INSERT INTO public.product_events
    (user_id, event_name, template, utm_source, utm_campaign, path, platform)
  VALUES (
    auth.uid(),
    p_event_name,
    p_template,
    LEFT(p_utm_source, 64),
    LEFT(p_utm_campaign, 64),
    -- Strip any query string defensively: the caller passes a pathname, but
    -- an unsubscribe token must never be able to arrive here by accident.
    LEFT(SPLIT_PART(COALESCE(p_path, ''), '?', 1), 200),
    CASE WHEN p_platform = ANY (c_platforms) THEN p_platform ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Append one product event. Whitelists the event name, template and platform; truncates attribution strings; strips any query string from the path so a signed token can never be stored. Silently ignores anything unrecognised. Callable by anon so an email click that bounces at the sign-in wall is still distinguishable from a click that never happened.';

-- anon is granted deliberately. Restricting to `authenticated` would make a
-- click that bounces before sign-in indistinguishable from no click at all —
-- which is precisely the ambiguity this table exists to remove. The whitelist
-- above bounds what an abusive caller can write to a handful of enum values
-- with no PII. If volume ever becomes a problem the mitigation is one line:
--   REVOKE EXECUTE ON FUNCTION public.record_product_event FROM anon;
GRANT EXECUTE ON FUNCTION public.record_product_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- Returns one row; `direct_select_blocked` must be true.
SELECT
  to_regclass('public.product_events')                        IS NOT NULL AS table_exists,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.product_events'::regclass)                        AS rls_enabled,
  (SELECT COUNT(*) = 0 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_events')         AS direct_select_blocked,
  has_function_privilege('anon',
    'public.record_product_event(text,text,text,text,text,text)', 'EXECUTE') AS anon_can_record;
