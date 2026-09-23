-- =============================================================================
-- JUNO-06 blocage 2 — the sync-entitlement throttle column (2026-09-23).
-- NOT APPLIED: local remediation mission; production applies migrations
-- through its own reviewed process.
--
-- `sync-entitlement` throttles itself to one attempt per account per 30 s,
-- and the throttle must be SERVER-SIDE, ATOMIC and PERSISTENT (the
-- operator's push checklist) — not an in-memory Edge bucket, which a cold
-- isolate forgets and which two concurrent requests can both pass. The
-- function therefore CLAIMS its slot with a single conditional UPDATE:
--
--   UPDATE subscriptions SET last_sync_at = now()
--    WHERE user_id = $caller AND source = 'play_store'
--      AND (last_sync_at IS NULL OR last_sync_at < now() - interval '30 s');
--
-- The predicate is evaluated inside the statement, under the row lock: of
-- two concurrent calls only one claims. This column is that predicate's
-- state, and it is owned by sync-entitlement alone — the RevenueCat webhook
-- never reads or writes it (it keeps `updated_at` for its own lifecycle
-- events), so a webhook burst cannot reset the sync window and a sync
-- cannot confuse webhook monitoring.
--
-- Additive and privilege-neutral: a nullable timestamptz on
-- `public.subscriptions`. No grant changes, no backfill (NULL = "never
-- synced", which is exactly the first-claim semantics). The self-check
-- below asserts presence only.
-- =============================================================================

begin;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.last_sync_at IS
  'JUNO-06: last sync-entitlement claim; bumped atomically (conditional UPDATE) before each RevenueCat verification to throttle the endpoint server-side. Owned by the sync-entitlement edge function — the webhook does not write it.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'subscriptions'
       AND column_name = 'last_sync_at'
  ) THEN
    RAISE EXCEPTION 'JUNO-06 sync throttle column missing after ADD — refuses to commit';
  END IF;
END;
$$;

commit;
