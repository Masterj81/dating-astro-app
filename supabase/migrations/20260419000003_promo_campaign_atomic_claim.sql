-- P0-3 — Atomic claim RPC for promo campaigns.
--
-- Previously, create-checkout-session read `max_redemptions` then upserted
-- into promo_campaign_redemptions in two separate statements — two concurrent
-- clients could each pass the check and both succeed, blowing past the cap.
--
-- This RPC wraps the count + insert inside a single transaction with a row
-- lock on the campaign row (`FOR UPDATE`), so concurrent claims serialize
-- and only `max_redemptions` of them succeed. The unique constraint on
-- (user_id, campaign_code, platform) handles the "already claimed" case.
--
-- Returns:
--   - ok: boolean — TRUE on success, FALSE otherwise
--   - reason: TEXT — null on success, one of
--               'already_consumed' | 'already_claimed'
--             | 'campaign_not_found' | 'campaign_inactive'
--             | 'campaign_limit_reached' | 'unauthorized'
--   - existing_status: TEXT — status of a pre-existing redemption row, if any
--
-- Called from:
--   - supabase/functions/create-checkout-session
--   - supabase/functions/claim-promo-code
--
-- Security: SECURITY DEFINER. Service_role (edge functions) bypasses the
-- auth.uid() check; authenticated callers must pass their own id.

begin;

CREATE OR REPLACE FUNCTION public.claim_promo_campaign_redemption(
  p_user_id UUID,
  p_campaign_code TEXT,
  p_platform TEXT,
  p_billing_cycle TEXT DEFAULT NULL,
  p_stripe_customer_id TEXT DEFAULT NULL,
  p_stripe_price_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  ok BOOLEAN,
  reason TEXT,
  existing_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_existing RECORD;
  v_count BIGINT;
BEGIN
  -- Guard: authenticated callers can only claim for themselves.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF p_platform NOT IN ('stripe', 'play_store') THEN
    RETURN QUERY SELECT FALSE, 'campaign_not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Lock the campaign row so concurrent claimants serialize on it.
  SELECT *
    INTO v_campaign
    FROM public.promo_campaigns
   WHERE code = p_campaign_code
     AND platform = p_platform
     AND (p_billing_cycle IS NULL OR billing_cycle = p_billing_cycle)
   ORDER BY billing_cycle
   LIMIT 1
   FOR UPDATE;

  IF v_campaign.code IS NULL THEN
    RETURN QUERY SELECT FALSE, 'campaign_not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF NOT v_campaign.active
     OR (v_campaign.starts_at IS NOT NULL AND v_campaign.starts_at > NOW())
     OR (v_campaign.ends_at   IS NOT NULL AND v_campaign.ends_at   < NOW())
  THEN
    RETURN QUERY SELECT FALSE, 'campaign_inactive'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Already claimed?
  SELECT status
    INTO v_existing
    FROM public.promo_campaign_redemptions
   WHERE user_id = p_user_id
     AND campaign_code = v_campaign.code
     AND platform = p_platform
   LIMIT 1;

  IF FOUND THEN
    IF v_existing.status = 'consumed' THEN
      RETURN QUERY SELECT FALSE, 'already_consumed'::TEXT, v_existing.status;
    ELSE
      RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, v_existing.status;
    END IF;
    RETURN;
  END IF;

  -- Enforce max_redemptions under the row lock to prevent races.
  IF v_campaign.max_redemptions IS NOT NULL THEN
    SELECT COUNT(*)
      INTO v_count
      FROM public.promo_campaign_redemptions
     WHERE campaign_code = v_campaign.code
       AND platform = p_platform;

    IF v_count >= v_campaign.max_redemptions THEN
      RETURN QUERY SELECT FALSE, 'campaign_limit_reached'::TEXT, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.promo_campaign_redemptions (
      user_id,
      campaign_code,
      platform,
      status,
      stripe_customer_id,
      stripe_price_id,
      metadata,
      updated_at
    ) VALUES (
      p_user_id,
      v_campaign.code,
      p_platform,
      'pending',
      p_stripe_customer_id,
      p_stripe_price_id,
      COALESCE(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'billing_cycle', v_campaign.billing_cycle,
          'reward_type', v_campaign.reward_type,
          'stripe_coupon_id', v_campaign.stripe_coupon_id
        ),
      NOW()
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, NULL::TEXT;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, NULL::TEXT, NULL::TEXT;
END;
$$;

-- Restrict to service_role (edge functions) — never callable directly by clients.
REVOKE EXECUTE ON FUNCTION public.claim_promo_campaign_redemption(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.claim_promo_campaign_redemption(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.claim_promo_campaign_redemption(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO service_role;

commit;
