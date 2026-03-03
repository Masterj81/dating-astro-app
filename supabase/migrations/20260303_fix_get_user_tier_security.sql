-- Migration: Fix get_user_tier function search_path security warning
-- Sets search_path to empty and uses fully qualified table names

CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tier TEXT;
BEGIN
  SELECT tier INTO v_tier FROM public.subscriptions
  WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW())
    AND status IN ('active', 'trialing');
  RETURN COALESCE(v_tier, 'free');
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_tier(UUID) TO authenticated;
