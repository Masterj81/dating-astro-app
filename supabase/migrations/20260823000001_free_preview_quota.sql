-- Free preview quota — make the SERVER the source of truth for the
-- "1 free preview per day" promise shown on the paywall.
--
-- THE BUG THIS FIXES
-- ------------------
-- Two disconnected quota systems disagreed, and the user paid for it:
--
--   1. The mobile client (`PremiumGate` → `consumeTrial`) granted a free user
--      one preview per day and recorded it in `premium_usage` under the
--      hyphenated client key (e.g. 'natal-chart').
--   2. The screen then called `enforce_premium_feature('natal_chart')` — the
--      underscored policy key — which knew nothing about free previews and
--      returned 'insufficient_tier' for any free account.
--
-- Net effect: a free user BURNED their daily preview and still got the
-- paywall. The advertised free sample — the main conversion mechanism of the
-- paywall — never actually rendered on a server-gated feature.
--
-- THE FIX
-- -------
--   * `premium_feature_policy.free_preview_quota` — how many times per day a
--     NON-entitled account may use the feature. NULL/0 = no free preview
--     (this is the default, so every other feature keeps its exact current
--     behaviour).
--   * `enforce_premium_feature` now owns the whole decision: entitlement,
--     free preview, quota, and the atomic usage bump. It reports
--     'free_preview' / 'free_preview_exhausted' so the UI can show accurate
--     copy instead of guessing.
--   * `premium_usage.last_granted_at` + a short replay window so that a
--     re-mount, a token refresh, or a fast back-and-forth cannot burn a
--     second unit of a 1-per-day allowance.
--   * `premium_usage` is no longer directly writable by its owner. A quota
--     the user can reset is not a quota, and "the server is the source of
--     truth" is only true if the client cannot rewrite the ledger.
--
-- Scope: only `natal_chart` is given a free preview here. Extending it to
-- another feature is a one-line UPDATE on premium_feature_policy plus adding
-- the feature to SERVER_ENFORCED_FEATURES in apps/mobile/services/premiumUsage.ts.

begin;

-- =============================================================================
-- 1) Policy column: how many free previews per day for non-entitled accounts
-- =============================================================================
ALTER TABLE public.premium_feature_policy
  ADD COLUMN IF NOT EXISTS free_preview_quota INTEGER;

COMMENT ON COLUMN public.premium_feature_policy.free_preview_quota IS
  'Daily allowance for accounts BELOW required_tier. NULL or 0 = no free preview (default). 1 = the "1 free preview per day" paywall promise.';

-- The paywall copy ("1 free preview per day") is the product promise for the
-- natal chart. Everything else stays at NULL = unchanged behaviour.
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1,
       updated_at = NOW()
 WHERE feature_key = 'natal_chart';

-- =============================================================================
-- 2) Usage ledger: remember when the last grant was handed out
-- =============================================================================
-- Needed for the replay window below. Nullable: legacy rows simply have no
-- recorded grant and fall through to the normal bump path.
ALTER TABLE public.premium_usage
  ADD COLUMN IF NOT EXISTS last_granted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.premium_usage.last_granted_at IS
  'Timestamp of the last ALLOWED grant for this (user, feature, day). Used by enforce_premium_feature to replay a decision within a short window so a screen re-mount cannot consume a second unit. Restored on rollback when a call is denied.';

-- =============================================================================
-- 3) The decision function
-- =============================================================================
-- Return shape is unchanged (5 columns) so all existing callers keep working;
-- the new states are carried by `reason`:
--
--   allowed=TRUE  'ok'                     — entitled by tier
--   allowed=TRUE  'free_preview'           — NOT entitled, spending a free preview
--   allowed=FALSE 'insufficient_tier'      — NOT entitled, no free preview offered
--   allowed=FALSE 'free_preview_exhausted' — free previews used up for today
--   allowed=FALSE 'quota_exceeded'         — entitled but over the paid daily quota
--   allowed=FALSE 'unauthorized' | 'unknown_feature'
--
CREATE OR REPLACE FUNCTION public.enforce_premium_feature(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed       BOOLEAN,
  reason        TEXT,
  current_count INTEGER,
  required_tier TEXT,
  user_tier     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- A grant replayed inside this window does not consume another unit.
  -- Long enough to absorb a re-mount, a token refresh or a quick
  -- back-navigation; short enough that "1 per day" stays 1 per day.
  c_replay_window CONSTANT INTERVAL := INTERVAL '15 minutes';

  v_user_id         UUID;
  v_policy          RECORD;
  v_tier            TEXT;
  v_count           INTEGER;
  v_effective_quota INTEGER;
  v_is_free_preview BOOLEAN := FALSE;
  v_prev_count      INTEGER;
  v_prev_granted_at TIMESTAMPTZ;
  v_has_row         BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, 0, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM public.premium_feature_policy
   WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'unknown_feature'::TEXT, 0, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user_id);

  IF public.tier_at_least(v_tier, v_policy.required_tier) THEN
    -- Entitled: the paid daily quota applies (NULL = unlimited).
    v_effective_quota := v_policy.daily_quota;
  ELSIF COALESCE(v_policy.free_preview_quota, 0) > 0 THEN
    -- Not entitled, but this feature advertises a free daily preview.
    v_is_free_preview := TRUE;
    v_effective_quota := v_policy.free_preview_quota;
  ELSE
    RETURN QUERY SELECT FALSE, 'insufficient_tier'::TEXT, 0, v_policy.required_tier, v_tier;
    RETURN;
  END IF;

  -- Lock today's row (if any) so the read-modify-write below is serialised
  -- per (user, feature, day). A missing row is created atomically by the
  -- INSERT ... ON CONFLICT further down.
  SELECT view_count, last_granted_at
    INTO v_prev_count, v_prev_granted_at
    FROM public.premium_usage
   WHERE user_id = v_user_id
     AND feature_key = p_feature_key
     AND usage_date = CURRENT_DATE
   FOR UPDATE;
  v_has_row := FOUND;

  -- Replay window — free previews only.
  --
  -- A 1-per-day allowance is destroyed by an accidental second call, so a
  -- grant handed out moments ago is returned again without consuming
  -- anything. Entitled users are deliberately excluded: their quotas are
  -- large, double-counting is harmless there, and this keeps the change from
  -- altering any existing paid behaviour.
  IF v_is_free_preview
     AND v_has_row
     AND v_prev_granted_at IS NOT NULL
     AND v_prev_granted_at > NOW() - c_replay_window
     AND v_prev_count <= v_effective_quota
  THEN
    RETURN QUERY SELECT TRUE, 'free_preview'::TEXT, v_prev_count, v_policy.required_tier, v_tier;
    RETURN;
  END IF;

  -- Atomic usage bump.
  INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count, last_granted_at)
  VALUES (v_user_id, p_feature_key, CURRENT_DATE, 1, NOW())
  ON CONFLICT (user_id, feature_key, usage_date)
  DO UPDATE SET view_count      = public.premium_usage.view_count + 1,
                last_granted_at = NOW()
  RETURNING view_count INTO v_count;

  -- Quota check AFTER the bump (fail-closed).
  IF v_effective_quota IS NOT NULL AND v_count > v_effective_quota THEN
    -- Roll the row back to exactly what it was, including last_granted_at:
    -- a DENIED call must not refresh the replay window, or the next call
    -- would replay a grant the user is no longer entitled to.
    UPDATE public.premium_usage
       SET view_count      = v_count - 1,
           last_granted_at = v_prev_granted_at
     WHERE user_id = v_user_id
       AND feature_key = p_feature_key
       AND usage_date = CURRENT_DATE;

    RETURN QUERY SELECT
      FALSE,
      CASE WHEN v_is_free_preview THEN 'free_preview_exhausted' ELSE 'quota_exceeded' END,
      v_count - 1,
      v_policy.required_tier,
      v_tier;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    CASE WHEN v_is_free_preview THEN 'free_preview' ELSE 'ok' END,
    v_count,
    v_policy.required_tier,
    v_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_premium_feature(TEXT) TO authenticated;

COMMENT ON FUNCTION public.enforce_premium_feature IS
  'Single source of truth for premium feature access: entitlement, free daily preview, quota and atomic usage accounting. Callers MUST invoke this before rendering paid content. reason: ok | free_preview | insufficient_tier | free_preview_exhausted | quota_exceeded | unauthorized | unknown_feature.';

-- =============================================================================
-- 4) Read-only mirror — must agree with the function above
-- =============================================================================
-- Same rules, no side effects. `remaining` now counts whichever allowance
-- actually applies to the caller (paid quota or free preview).
CREATE OR REPLACE FUNCTION public.can_use_premium_feature(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed       BOOLEAN,
  reason        TEXT,
  required_tier TEXT,
  user_tier     TEXT,
  remaining     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         UUID;
  v_policy          RECORD;
  v_tier            TEXT;
  v_count           INTEGER;
  v_effective_quota INTEGER;
  v_is_free_preview BOOLEAN := FALSE;
  v_remaining       INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM public.premium_feature_policy
   WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'unknown_feature'::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user_id);

  IF public.tier_at_least(v_tier, v_policy.required_tier) THEN
    v_effective_quota := v_policy.daily_quota;
  ELSIF COALESCE(v_policy.free_preview_quota, 0) > 0 THEN
    v_is_free_preview := TRUE;
    v_effective_quota := v_policy.free_preview_quota;
  ELSE
    RETURN QUERY SELECT FALSE, 'insufficient_tier'::TEXT, v_policy.required_tier, v_tier, 0;
    RETURN;
  END IF;

  SELECT COALESCE(view_count, 0) INTO v_count
    FROM public.premium_usage
   WHERE user_id = v_user_id
     AND feature_key = p_feature_key
     AND usage_date = CURRENT_DATE;

  IF v_effective_quota IS NULL THEN
    v_remaining := 2147483647;  -- "unlimited"
  ELSE
    v_remaining := GREATEST(v_effective_quota - COALESCE(v_count, 0), 0);
  END IF;

  RETURN QUERY SELECT
    (v_effective_quota IS NULL OR COALESCE(v_count, 0) < v_effective_quota),
    CASE
      WHEN v_effective_quota IS NOT NULL AND COALESCE(v_count, 0) >= v_effective_quota THEN
        CASE WHEN v_is_free_preview THEN 'free_preview_exhausted' ELSE 'quota_exceeded' END
      WHEN v_is_free_preview THEN 'free_preview'
      ELSE 'ok'
    END::TEXT,
    v_policy.required_tier,
    v_tier,
    v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_use_premium_feature(TEXT) TO authenticated;

-- =============================================================================
-- 5) Close the ledger: the quota counter must not be user-writable
-- =============================================================================
-- Until now `premium_usage` carried `FOR ALL USING (auth.uid() = user_id)`,
-- so an authenticated user could UPDATE or DELETE their own usage rows and
-- reset any allowance at will. That is fatal for a server-authoritative free
-- preview, so writes are now reserved to the SECURITY DEFINER RPCs
-- (`enforce_premium_feature`, `increment_feature_usage`), which run as the
-- function owner and bypass RLS. Owners keep read access: the UI still shows
-- "x previews left".
DROP POLICY IF EXISTS "Users can manage own usage" ON public.premium_usage;
DROP POLICY IF EXISTS "Users can view own usage" ON public.premium_usage;

CREATE POLICY "Users can view own usage"
  ON public.premium_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS only constrains roles that hold the underlying table privilege, so the
-- write grants have to go too. service_role is untouched (webhooks, crons).
REVOKE INSERT, UPDATE, DELETE ON public.premium_usage FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.premium_usage FROM anon;

commit;
