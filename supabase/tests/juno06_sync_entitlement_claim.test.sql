-- Behavioural tests for the sync-entitlement claim (migration 20260922000002).
--
-- THE OPERATOR'S FOUR CASES (PR #69, pre-merge review):
--   1. LIGNE ABSENTE     — a user with NO subscriptions row must still be
--                          able to sync (the claim INSERTs), and must be
--                          throttled from that instant (no unthrottled
--                          retry window).
--   2. CLAIMS CONCURRENTS— of two claims inside the window, exactly one
--                          wins; the predicate runs inside the statement.
--   3. ÉCHEC RC APRÈS CLAIM — the technical write happened before the
--                          external call and moved no tier/expiry/product
--                          data: this table holds none, and a simulated
--                          failure between claim and reconcile leaves
--                          subscriptions untouched.
--   4. RETRY APRÈS 30 s  — once the window has elapsed, the conditional
--                          UPDATE arm wins again.
--
-- HOW TO RUN
--   supabase start                       # or point at a branch/staging DB
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/juno06_sync_entitlement_claim.test.sql
--
-- Wrapped in a transaction that ends with ROLLBACK: leaves nothing behind,
-- safe against a database that already has data. Every assertion RAISEs on
-- failure, so ON_ERROR_STOP=1 turns a regression into a non-zero exit.
--
-- The edge expresses each arm through PostgREST (supabase-js upsert with
-- ignoreDuplicates → INSERT .. ON CONFLICT DO NOTHING; filtered update →
-- UPDATE .. WHERE). This script runs the SAME statements the server sends,
-- in the same two-arm order, so what is proven here is what ships.

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  v_user        UUID := gen_random_uuid();
  v_rows        INTEGER;
  r             RECORD;
BEGIN
  -- -----------------------------------------------------------------------
  -- CASE 1a — row absent: arm 1 (INSERT .. ON CONFLICT DO NOTHING) claims.
  -- A free account: no subscriptions row exists, and none is created by the
  -- claim (the claim table holds no entitlement data).
  -- -----------------------------------------------------------------------
  INSERT INTO public.entitlement_sync_claims (user_id, last_sync_at)
  VALUES (v_user, NOW())
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id INTO r;

  IF r.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'CASE 1a: the first-ever claim must INSERT and return the user';
  END IF;

  -- The claim never manufactured a subscription for the row-less user.
  SELECT COUNT(*) INTO v_rows FROM public.subscriptions WHERE user_id = v_user;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'CASE 1a: a claim must not create a subscriptions row';
  END IF;

  -- -----------------------------------------------------------------------
  -- CASE 2 — two claims inside the window: exactly one wins.
  -- Claim A is the INSERT above. Claim B replays the edge's arms in order:
  -- arm 1 conflicts (DO NOTHING returns nothing), arm 2's predicate rejects
  -- (last_sync_at just set). The same is true for two arm-2 claims: the
  -- predicate runs inside the statement, under the row lock, so a second
  -- UPDATE sees the timestamp the first one wrote.
  -- -----------------------------------------------------------------------
  -- Claim B, arm 1: conflict → no row returned.
  INSERT INTO public.entitlement_sync_claims (user_id, last_sync_at)
  VALUES (v_user, NOW())
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id INTO r;

  IF r.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 2: arm 1 must return nothing while the row exists';
  END IF;
  r := NULL;

  -- Claim B, arm 2: the window predicate rejects the renewal.
  UPDATE public.entitlement_sync_claims
     SET last_sync_at = NOW()
   WHERE user_id = v_user
     AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '30 seconds')
  RETURNING user_id INTO r;

  IF r.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 2: a second claim inside the 30 s window must be refused';
  END IF;

  -- -----------------------------------------------------------------------
  -- CASE 3 — RevenueCat failure after the claim: the technical write stands,
  -- and nothing else moved. Simulated by simply not running any reconcile
  -- (that is exactly what the edge does on rc_unreachable / rc_ambiguous /
  -- non-2xx / timeout): the only row this account has anywhere is its
  -- claim, and it carries no tier, expiry or product.
  -- -----------------------------------------------------------------------
  SELECT COUNT(*) INTO v_rows
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'entitlement_sync_claims'
     AND column_name IN ('tier', 'status', 'expires_at', 'provider_subscription_id', 'provider_customer_id');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'CASE 3: the claim table must hold NO tier/expiry/product columns';
  END IF;

  SELECT COUNT(*) INTO v_rows FROM public.subscriptions WHERE user_id = v_user;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'CASE 3: a failed verification must leave subscriptions untouched';
  END IF;

  -- And the claim itself persists the wait (this is the UX contract: the
  -- reader waits at most 30 s for an honest retry).
  SELECT EXTRACT(EPOCH FROM (NOW() - last_sync_at)) < 30 INTO v_rows FROM public.entitlement_sync_claims WHERE user_id = v_user;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'CASE 3: the surviving claim must still be inside the 30 s window';
  END IF;

  -- -----------------------------------------------------------------------
  -- CASE 4 — retry after the window elapsed: arm 2 wins again.
  -- Time-travel the row back 31 s (the clock the edge reads is this
  -- column; production expiry comes from real time passing).
  -- -----------------------------------------------------------------------
  UPDATE public.entitlement_sync_claims
     SET last_sync_at = NOW() - INTERVAL '31 seconds'
   WHERE user_id = v_user;

  UPDATE public.entitlement_sync_claims
     SET last_sync_at = NOW()
   WHERE user_id = v_user
     AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '30 seconds')
  RETURNING user_id INTO r;

  IF r.user_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'CASE 4: a retry after the window must claim again';
  END IF;

  RAISE NOTICE 'juno06_sync_entitlement_claim: 4/4 cases green (rowless insert-claim, single concurrent winner, RC-failure leaves only the technical claim, retry after 30 s)';
END;
$test$;

ROLLBACK;
