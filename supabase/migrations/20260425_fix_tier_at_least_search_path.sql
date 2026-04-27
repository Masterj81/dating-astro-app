-- Supabase linter 0011 (function_search_path_mutable) flags
-- `public.tier_at_least` because it was created without an explicit
-- `SET search_path`. The function is pure SQL over string comparisons (no
-- table reads, no user-defined function calls) so the real attack surface
-- is negligible, but we set an empty search_path to match the other two
-- functions in this module (`get_user_tier`, `enforce_premium_feature`) and
-- silence the warning.

CREATE OR REPLACE FUNCTION public.tier_at_least(p_actual TEXT, p_required TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_required IS NULL OR p_required = 'free' THEN TRUE
    WHEN p_required IN ('celestial', 'premium') THEN
      p_actual IN ('celestial', 'cosmic', 'premium', 'premium_plus')
    WHEN p_required IN ('cosmic', 'premium_plus') THEN
      p_actual IN ('cosmic', 'premium_plus')
    ELSE FALSE
  END;
$$;
