-- B1 — Multi-device push tokens.
--
-- Replace the single-slot `profiles.push_token` column with a dedicated
-- `push_tokens` table keyed by (device_id). Each (device_id) maps to exactly
-- one user_id — when a different user signs in on the same device, the
-- claim RPC scrubs the previous row and writes the new one.
--
-- Why device_id and not just token?
--   Expo push tokens can rotate on the same device (OS reinstall, Expo SDK
--   upgrade, etc.). Using a client-generated device_id stored in SecureStore
--   keeps the "one-device-one-user" invariant stable across token rotation.
--
-- Legacy column `profiles.push_token` is LEFT IN PLACE as a one-cycle
-- fallback so send-notification can still reach users who haven't yet opened
-- the updated mobile app. A future migration (P3) will drop it once the
-- backfill is validated in prod.

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  token         TEXT NOT NULL,
  platform      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_tokens_device_id_key UNIQUE (device_id)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens (user_id);
CREATE INDEX IF NOT EXISTS push_tokens_token_idx   ON public.push_tokens (token);

COMMENT ON TABLE public.push_tokens IS
  'Multi-device Expo push tokens. One row per device_id; cross-user claim scrubs the previous owner.';
COMMENT ON COLUMN public.push_tokens.device_id IS
  'Stable client-generated UUID, stored in mobile SecureStore under key astrodating_device_id. Legacy-backfilled rows use prefix legacy:<user_id>.';
COMMENT ON COLUMN public.push_tokens.platform IS
  'ios | android | web — nullable for legacy-backfilled rows.';
COMMENT ON COLUMN public.push_tokens.last_seen_at IS
  'Updated by send-notification after a successful push. Useful for zombie-token cleanup crons.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Owner can SELECT their rows
DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens;
CREATE POLICY push_tokens_select_own
  ON public.push_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Owner can UPDATE their rows (e.g. refresh last_seen_at client-side if ever needed)
DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens;
CREATE POLICY push_tokens_update_own
  ON public.push_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owner can DELETE their rows (used by clearPushToken on logout)
DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_delete_own
  ON public.push_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- No direct INSERT policy for authenticated users — all writes flow through
-- claim_push_token_v2 (SECURITY DEFINER) so we can atomically scrub conflicts.

-- service_role full access (used by send-notification and other server jobs)
DROP POLICY IF EXISTS push_tokens_service_role_all ON public.push_tokens;
CREATE POLICY push_tokens_service_role_all
  ON public.push_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Backfill from legacy profiles.push_token
-- ---------------------------------------------------------------------------
-- We synthesize a device_id of the form `legacy:<user_id>` so the row is
-- unique and clearly marked. When the user next opens the updated mobile
-- app it will claim its real device_id and the legacy row can be pruned.
INSERT INTO public.push_tokens (user_id, device_id, token, platform)
SELECT id, 'legacy:' || id::text, push_token, NULL
  FROM public.profiles
 WHERE push_token IS NOT NULL
ON CONFLICT (device_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RPC: claim_push_token_v2
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_push_token_v2(
  p_device_id TEXT,
  p_token     TEXT,
  p_platform  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_scrubbed  INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_push_token_v2: unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RAISE EXCEPTION 'claim_push_token_v2: device_id required' USING ERRCODE = '22000';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'claim_push_token_v2: token required' USING ERRCODE = '22000';
  END IF;

  -- Belt-and-suspenders: the client already validates this, but we enforce
  -- server-side to prevent spoofed payloads from polluting the table.
  IF p_token !~ '^Expo(?:nent)?PushToken\[.+\]$' THEN
    RAISE EXCEPTION 'claim_push_token_v2: invalid token format' USING ERRCODE = '22000';
  END IF;

  -- Platform sanity: accept only the three values we expect, else store NULL.
  IF p_platform IS NOT NULL AND p_platform NOT IN ('ios', 'android', 'web') THEN
    p_platform := NULL;
  END IF;

  -- Cross-user scrub: if another user currently owns this device_id, remove
  -- their row outright. ON CONFLICT below would also flip user_id, but an
  -- explicit DELETE gives us an accurate scrubbed_count for audit/logging.
  DELETE FROM public.push_tokens
   WHERE device_id = p_device_id
     AND user_id <> v_uid;
  GET DIAGNOSTICS v_scrubbed = ROW_COUNT;

  -- Also scrub the legacy single-slot column on any OTHER profile that
  -- still holds this token. Mirrors claim_push_token (v1) behaviour so a
  -- stale profiles.push_token cannot cause send-notification to deliver to
  -- the wrong user via the legacy fallback path.
  UPDATE public.profiles
     SET push_token = NULL
   WHERE push_token = p_token
     AND id <> v_uid;

  INSERT INTO public.push_tokens (user_id, device_id, token, platform)
  VALUES (v_uid, p_device_id, p_token, p_platform)
  ON CONFLICT (device_id) DO UPDATE
     SET token        = EXCLUDED.token,
         platform     = COALESCE(EXCLUDED.platform, public.push_tokens.platform),
         updated_at   = NOW(),
         last_seen_at = NOW(),
         user_id      = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'device_id', p_device_id,
    'scrubbed_count', v_scrubbed
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_push_token_v2(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_push_token_v2(TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_push_token_v2(TEXT, TEXT, TEXT) IS
  'Upsert a push token for (auth.uid(), device_id) and scrub any other user who previously owned the same device_id. SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- RPC: clear_push_token_v2
-- ---------------------------------------------------------------------------
-- Used by the mobile app on logout. Deleting by device_id guarantees we
-- only remove THIS device's row, never another device of the same user.
-- A plain DELETE through RLS would also work, but going through a RPC lets
-- us log/guard consistently with claim_push_token_v2.

CREATE OR REPLACE FUNCTION public.clear_push_token_v2(
  p_device_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_deleted INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'clear_push_token_v2: unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.push_tokens
   WHERE device_id = p_device_id
     AND user_id   = v_uid;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_push_token_v2(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_push_token_v2(TEXT) TO authenticated;

COMMENT ON FUNCTION public.clear_push_token_v2(TEXT) IS
  'Delete the push_tokens row for (auth.uid(), device_id). Used by mobile logout.';

-- ---------------------------------------------------------------------------
-- Legacy column / RPC — kept for one cycle
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.profiles.push_token IS
  'DEPRECATED — use public.push_tokens. Kept as one-cycle fallback for send-notification. Will be dropped in a future migration.';

COMMENT ON FUNCTION public.claim_push_token(UUID, TEXT) IS
  'DEPRECATED: use claim_push_token_v2(device_id, token, platform). Kept for backward compatibility during mobile rollout.';

COMMIT;
