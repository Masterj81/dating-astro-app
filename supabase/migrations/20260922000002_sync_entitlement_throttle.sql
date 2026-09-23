-- =============================================================================
-- JUNO-06 blocage 2 — the sync-entitlement claim table (2026-09-23, revised).
-- NOT APPLIED: local remediation mission; production applies migrations
-- through its own reviewed process. This migration is part of PR #69 and has
-- never run against any environment; it replaces the earlier draft that put
-- `last_sync_at` ON public.subscriptions (withdrawn before merge).
--
-- `sync-entitlement` throttles itself to one attempt per account per 30 s,
-- and the throttle must be SERVER-SIDE, ATOMIC and PERSISTENT — including
-- for an authenticated user who has NO `subscriptions` row yet (a free
-- account: the webhook only creates rows on purchase events). A claim
-- implemented as a bare UPDATE cannot cover that user: it matches zero rows,
-- persists no state, and leaves an UNTHROTTLED retry window (a patched APK
-- could hammer RevenueCat through us indefinitely). A column on
-- `subscriptions` cannot be inserted alone either — that table's rows carry
-- tier/status semantics, and writing a row to record a throttle would either
-- violate its CHECKs or fake an entitlement.
--
-- Hence a dedicated table that owns ONE fact and nothing else:
--
--   entitlement_sync_claims (user_id PK, last_sync_at NOT NULL)
--
-- The edge claims its slot in two atomic arms (each a single statement,
-- row-locked by the PK):
--   arm 1  INSERT ... ON CONFLICT (user_id) DO NOTHING RETURNING user_id
--          — wins exactly when the user had no row (the first-ever sync
--          creates it, throttled from that instant);
--   arm 2  UPDATE ... SET last_sync_at = now()
--          WHERE user_id = $caller
--            AND (last_sync_at IS NULL OR last_sync_at < now() - 30 s)
--          RETURNING user_id
--          — wins when the window has elapsed; the predicate runs inside the
--          statement, so of two concurrent claims only one wins.
-- Zero rows from both arms ⇒ throttled (honest 429, at most 30 s to wait).
--
-- Consequences that are features, not gaps:
--   - a NEW user's first sync claims via arm 1 and proceeds — "never able to
--     sync" is impossible by construction;
--   - a RevenueCat FAILURE after a claim leaves the claim standing on
--     purpose: the technical write happened BEFORE the external call, moved
--     no tier/expiry/product data (this table holds none), and the reader
--     waits at most 30 s before an honest retry — documented in
--     docs/runbooks/premium-server-enforcement-2026-09.md §3;
--   - `public.subscriptions` is written ONLY by verified outcomes (the
--     downgrade UPDATE, the paid upsert) and by the existing webhook /
--     backfill writers — the claim never touches it.
--
-- Privileges: the table is server-side only (the edge's service role).
-- Supabase's default privileges would grant it to anon and authenticated
-- too — revoked below and ASSERTED (house rules 20260903000003 / the
-- 20260911000001 lesson: state the grants you refuse, then verify them).
-- RLS is enabled with no policy: service_role bypasses it, everyone else
-- sees nothing.
-- =============================================================================

begin;

CREATE TABLE IF NOT EXISTS public.entitlement_sync_claims (
  user_id      UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.entitlement_sync_claims IS
  'JUNO-06: sync-entitlement throttle claims, one row per account. Owned by the sync-entitlement edge function alone; holds no tier, expiry or product data. Arm 1 = INSERT ON CONFLICT DO NOTHING, arm 2 = conditional UPDATE inside the 30 s window.';

ALTER TABLE public.entitlement_sync_claims
  ENABLE ROW LEVEL SECURITY;

-- No policy on purpose: only the service role (the edge) may read or write,
-- and it bypasses RLS. anon/authenticated get nothing.

REVOKE ALL ON public.entitlement_sync_claims FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Self-verification (a migration that changes privileges must prove itself
-- before committing — 20260903000003 house rule).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  ) THEN
    RAISE EXCEPTION 'JUNO-06 claim table missing after CREATE — refuses to commit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public'
       AND table_name = 'entitlement_sync_claims'
       AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'JUNO-06 claim table must not be reachable by anon/authenticated — refusing to commit';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public'
       AND table_name = 'entitlement_sync_claims'
       AND grantee = 'service_role'
       AND privilege_type = 'ALL'
  ) THEN
    RAISE EXCEPTION 'JUNO-06 claim table must be fully usable by service_role (the edge''s key) — refusing to commit';
  END IF;

  -- The row-level lock the two arms rely on: the PK must exist and be the
  -- user_id (an arm keyed on anything else would not serialize per account).
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'entitlement_sync_claims'
       AND i.indisprimary
       AND i.indkey[0] = (
         SELECT attnum FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'entitlement_sync_claims'
            AND column_name = 'user_id'
       )
  ) THEN
    RAISE EXCEPTION 'JUNO-06 claim table PK must be (user_id) — the arms'' atomicity is keyed on it';
  END IF;
END;
$$;

commit;
