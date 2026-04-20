-- P1-2 — Hard-idempotent webhook ingestion.
--
-- subscription_events already has a partial UNIQUE index on (source, provider_event_id)
-- WHERE provider_event_id IS NOT NULL (20260312_unified_subscriptions.sql:140-142).
-- The webhook handlers currently *upsert* that row, but they perform
-- side-effects (tier changes, coupon application, e-mails) BEFORE or
-- AROUND the write. When Stripe/RevenueCat retry the same event_id, we
-- therefore re-run all downstream effects.
--
-- This migration introduces `begin_webhook_event` which MUST be called first
-- in every webhook handler. If the INSERT succeeds the event is "accepted"
-- and the handler proceeds. If it fails on unique_violation, the event is a
-- duplicate and the handler returns 200 OK without touching anything else.
--
-- The RPC is SECURITY DEFINER + restricted to service_role. It runs inside
-- the caller's transaction so the event log and the downstream writes are
-- atomic from the webhook's perspective.

BEGIN;

-- 1. Guarantee the unique constraint exists. The historical partial unique
--    index on (source, provider_event_id) covers rows where provider_event_id
--    IS NOT NULL. We keep it (already present) and additionally require that
--    begin_webhook_event refuse calls with NULL provider_event_id so we never
--    silently bypass idempotence.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'subscription_events'
      AND indexname = 'idx_subscription_events_provider_event'
  ) THEN
    CREATE UNIQUE INDEX idx_subscription_events_provider_event
      ON public.subscription_events (source, provider_event_id)
      WHERE provider_event_id IS NOT NULL;
  END IF;
END $$;

-- 2. The RPC. Returns a single row (accepted, reason).
CREATE OR REPLACE FUNCTION public.begin_webhook_event(
  p_source             TEXT,
  p_provider_event_id  TEXT,
  p_event_type         TEXT,
  p_payload            JSONB,
  p_user_id            UUID DEFAULT NULL,
  p_tier               TEXT DEFAULT NULL
)
RETURNS TABLE (
  accepted BOOLEAN,
  reason   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only service_role should ever call this.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT;
    RETURN;
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('stripe', 'app_store', 'play_store') THEN
    RETURN QUERY SELECT FALSE, 'invalid_source'::TEXT;
    RETURN;
  END IF;

  IF p_provider_event_id IS NULL OR length(trim(p_provider_event_id)) = 0 THEN
    -- Refuse to accept events without a stable id — without an id we cannot
    -- guarantee idempotence, so the safer default is to reject.
    RETURN QUERY SELECT FALSE, 'missing_provider_event_id'::TEXT;
    RETURN;
  END IF;

  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN QUERY SELECT FALSE, 'missing_event_type'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.subscription_events (
      user_id,
      source,
      event_type,
      tier,
      provider_event_id,
      raw_payload
    ) VALUES (
      p_user_id,
      p_source,
      lower(p_event_type),
      p_tier,
      p_provider_event_id,
      COALESCE(p_payload, '{}'::jsonb)
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT FALSE, 'duplicate'::TEXT;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.begin_webhook_event(TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.begin_webhook_event(TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.begin_webhook_event(TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO service_role;

-- subscription_events.user_id has NOT NULL. For stripe events before the
-- supabase_user_id metadata is populated we still want to record the raw
-- event. Relax to nullable so idempotence can log the event even without a
-- user mapping — handlers MUST still skip side effects without a user id.
ALTER TABLE public.subscription_events
  ALTER COLUMN user_id DROP NOT NULL;

COMMIT;
