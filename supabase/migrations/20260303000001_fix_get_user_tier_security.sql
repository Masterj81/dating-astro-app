-- Migration: Fix get_user_tier function search_path security warning
-- Now uses get_effective_subscription() to support multi-source subscriptions

CREATE OR REPLACE FUNCTION public.get_effective_subscription(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  source TEXT,
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.tier,
    s.status,
    s.source,
    s.expires_at,
    s.cancel_at_period_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY
    CASE s.tier
      WHEN 'premium_plus' THEN 2
      WHEN 'premium' THEN 1
      ELSE 0
    END DESC,
    s.expires_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_subscription(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.get_effective_subscription(p_user_id)),
    'free'
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO authenticated;
