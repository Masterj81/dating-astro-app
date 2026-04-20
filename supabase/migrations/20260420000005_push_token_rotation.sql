-- P1-6 — Push token single-ownership per device.
--
-- Without a dedicated device_id, the Expo push token is our only stable
-- identifier for a given device. When user A signs in on a device that was
-- previously signed into as user B, `profiles.push_token` for user B can
-- still hold the device's token — so a notification meant for A would also
-- be delivered to B's row (and therefore to the device the `send-notification`
-- edge function resolves for B).
--
-- This RPC, called right before saving a new push token, clears the token
-- on ANY OTHER profile that currently holds it. It runs as SECURITY DEFINER
-- so it can update other users' rows despite RLS. The caller must pass their
-- own auth.uid() — we enforce this via the `auth.uid() = p_user_id` guard
-- so a client cannot scrub an arbitrary user's token.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_push_token(
  p_user_id UUID,
  p_token   TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cleared INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'claim_push_token: unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RETURN 0;
  END IF;

  -- Expo push token format is enforced on the client but belt-and-suspenders:
  -- reject anything that isn't an Expo push token to prevent wildcards.
  IF p_token !~ '^Expo(?:nent)?PushToken\[.+\]$' THEN
    RAISE EXCEPTION 'claim_push_token: invalid token format' USING ERRCODE = '22000';
  END IF;

  UPDATE public.profiles
     SET push_token = NULL
   WHERE push_token = p_token
     AND id <> p_user_id;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- The caller writes their own row via RLS as usual — this RPC only scrubs
  -- conflicting rows. That keeps the surface area minimal.
  RETURN v_cleared;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_push_token(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_push_token(UUID, TEXT) TO authenticated;

COMMIT;
