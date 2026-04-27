-- Tighten user-facing RPCs: revoke anon and PUBLIC EXECUTE.
--
-- These RPCs already reject anon callers via auth.uid() guards (returning
-- 'unauthorized' or empty rows), but allowing anon to even *invoke* them
-- adds nothing and bloats the PostgREST surface. Authenticated callers
-- keep their grant.
--
-- tier_at_least(text, text) is SECURITY INVOKER and pure (no table access)
-- so it stays exposed to PUBLIC.

REVOKE EXECUTE ON FUNCTION public.get_effective_subscription(UUID)         FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referral_stats(UUID)                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_matches(UUID)                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_tier(UUID)                      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT)      FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_premium_feature(TEXT)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_use_premium_feature(TEXT)            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_push_token(UUID, TEXT)             FROM anon, PUBLIC;

-- claim_push_token_v2 / clear_push_token_v2 — discover the exact signatures
-- at runtime (mobile rollout used both TEXT and UUID variants over time).
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOR fn IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('claim_push_token_v2', 'clear_push_token_v2')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn);
  END LOOP;
END $$;
