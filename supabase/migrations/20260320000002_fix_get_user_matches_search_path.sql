DROP FUNCTION IF EXISTS public.get_user_matches(UUID);

CREATE OR REPLACE FUNCTION public.get_user_matches(p_user_id UUID)
RETURNS TABLE (
  match_id UUID,
  matched_user_id UUID,
  matched_user_name TEXT,
  matched_user_image TEXT,
  matched_user_sun_sign TEXT,
  compatibility_overall INTEGER,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id AS match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END AS matched_user_id,
    p.name AS matched_user_name,
    COALESCE(p.image_url, p.photos[1]) AS matched_user_image,
    p.sun_sign AS matched_user_sun_sign,
    m.compatibility_overall,
    (
      SELECT msg.content
      FROM public.messages msg
      WHERE msg.match_id = m.id
      ORDER BY msg.created_at DESC
      LIMIT 1
    ) AS last_message,
    m.last_message_at,
    COALESCE(m.matched_at, m.created_at) AS matched_at,
    (
      SELECT COUNT(*)
      FROM public.messages msg
      WHERE msg.match_id = m.id
        AND msg.sender_id != p_user_id
        AND msg.is_read = FALSE
    ) AS unread_count
  FROM public.matches m
  JOIN public.profiles p
    ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at, m.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_matches(UUID) TO authenticated;
