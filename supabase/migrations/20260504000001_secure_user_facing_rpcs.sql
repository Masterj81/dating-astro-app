-- Hardening pass for user-facing RPCs flagged by the Supabase database linter.
--
-- 1. Drop the legacy claim_push_token (v1). Mobile + web both moved to
--    claim_push_token_v2 in commit b23c567 — the v1 DDL was left orphaned.
-- 2. Guard get_user_matches: any signed-in user could pass an arbitrary
--    p_user_id and read another user's match list, including the other
--    user's name/photo/sun_sign and last_message preview. Add an
--    auth.uid() check.
-- 3. Guard get_referral_stats: same pattern — leaked any user's
--    referral_code + redemption counts. Add an auth.uid() check.
-- 4. Pin profiles_prompts_shape_valid search_path (lint 0011).
--
-- service_role keeps full access (auth.uid() IS NULL) for server-side
-- cron / webhook callers.

begin;

-- 1. Drop orphan v1 push token RPC
DROP FUNCTION IF EXISTS public.claim_push_token(uuid, text);

-- 2. Guard get_user_matches — only the caller's own matches
CREATE OR REPLACE FUNCTION public.get_user_matches(p_user_id uuid)
RETURNS TABLE (
  match_id uuid,
  matched_user_id uuid,
  matched_user_name text,
  matched_user_image text,
  matched_user_sun_sign text,
  compatibility_overall integer,
  last_message text,
  last_message_at timestamp with time zone,
  matched_at timestamp with time zone,
  unread_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END AS matched_user_id,
    p.name AS matched_user_name,
    COALESCE(p.image_url, p.photos[1]) AS matched_user_image,
    p.sun_sign AS matched_user_sun_sign,
    m.compatibility_overall,
    (SELECT msg.content FROM public.messages msg
       WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
    m.last_message_at,
    COALESCE(m.matched_at, m.created_at) AS matched_at,
    (SELECT COUNT(*) FROM public.messages msg
       WHERE msg.match_id = m.id AND msg.sender_id <> p_user_id AND msg.is_read = FALSE) AS unread_count
  FROM public.matches m
  JOIN public.profiles p
    ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at, m.created_at) DESC;
END;
$$;

-- 3. Guard get_referral_stats — only the caller's own referral data
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id uuid)
RETURNS TABLE (
  referral_code text,
  total_referrals bigint,
  rewarded_referrals bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.referral_code,
    (SELECT count(*) FROM public.referral_redemptions r WHERE r.referrer_id = p_user_id),
    (SELECT count(*) FROM public.referral_redemptions r
       WHERE r.referrer_id = p_user_id AND r.referrer_rewarded = TRUE)
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$;

-- 4. Pin search_path on the prompts shape validator (lint 0011)
ALTER FUNCTION public.profiles_prompts_shape_valid SET search_path = public, pg_catalog;

commit;
