-- P1-3 — Atomic referral claim, no check-then-insert race.
--
-- Previously `claim-referral/index.ts` did:
--   SELECT referee-existing?
--   SELECT referrer by code
--   INSERT referral_redemptions
-- Two concurrent calls (retry, double-click, bot) could both pass the
-- existence checks and hit the INSERT, with only the unique-violation on
-- (referee_id) eventually blocking the second. Meanwhile the first might
-- already have granted a reward that could then be granted twice if the
-- flow is not strictly guarded.
--
-- This RPC performs the whole operation under a row-level lock on the
-- referrer profile and returns:
--   - ok            = TRUE on successful claim (exactly once per referee)
--   - ok            = FALSE on any failure (with a machine-readable reason)
--   - redemption_id = the id of the freshly-created row (or the pre-existing
--                     row if the referee had already claimed)
--
-- Callers (edge function) MUST grant rewards ONLY when ok=TRUE, i.e. when
-- this call actually inserted the redemption. A later retry will return
-- ok=FALSE/reason='already_claimed' and the edge function will not re-grant.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_referral_atomic(
  p_referee_id     UUID,
  p_referrer_code  TEXT
)
RETURNS TABLE (
  ok            BOOLEAN,
  reason        TEXT,
  referrer_id   UUID,
  redemption_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer       RECORD;
  v_existing_id    UUID;
  v_new_id         UUID;
  v_normalized     TEXT := upper(trim(p_referrer_code));
BEGIN
  -- Guard: authenticated callers can only claim for themselves.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_referee_id THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_normalized IS NULL OR length(v_normalized) < 6 OR length(v_normalized) > 12 THEN
    RETURN QUERY SELECT FALSE, 'invalid_code'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Lock the referrer row so concurrent claims on the same code serialize.
  SELECT id, referral_code
    INTO v_referrer
    FROM public.profiles
   WHERE referral_code = v_normalized
   LIMIT 1
   FOR UPDATE;

  IF v_referrer.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'referrer_not_found'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_referrer.id = p_referee_id THEN
    RETURN QUERY SELECT FALSE, 'self_referral'::TEXT, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Already used a referral?
  SELECT id INTO v_existing_id
    FROM public.referral_redemptions
   WHERE referee_id = p_referee_id
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, v_referrer.id, v_existing_id;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.referral_redemptions (
      referrer_id, referee_id, referral_code, reward_type
    ) VALUES (
      v_referrer.id, p_referee_id, v_normalized, 'free_month'
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another transaction slipped through between our SELECT and INSERT.
    SELECT id INTO v_existing_id
      FROM public.referral_redemptions
     WHERE referee_id = p_referee_id
     LIMIT 1;
    RETURN QUERY SELECT FALSE, 'already_claimed'::TEXT, v_referrer.id, v_existing_id;
    RETURN;
  END;

  -- Tag the referee profile for analytics.
  UPDATE public.profiles
     SET referred_by = v_referrer.id
   WHERE id = p_referee_id
     AND referred_by IS NULL;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_referrer.id, v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_referral_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_referral_atomic(UUID, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_referral_atomic(UUID, TEXT) TO service_role;

COMMIT;
