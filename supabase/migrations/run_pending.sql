-- Combined pending migrations (safe to re-run)
-- Run this in Supabase SQL Editor

-- ========================================
-- 1. Fix security warnings (skip existing)
-- ========================================

-- Fix function search_path security
DO $$ BEGIN
  ALTER FUNCTION public.check_and_create_match SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.update_match_last_message SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.update_profile_timestamp SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.get_discoverable_profiles SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.increment_feature_usage SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.get_user_matches SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.check_rate_limit SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.enforce_swipe_rate_limit SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.enforce_message_rate_limit SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.enforce_block_rate_limit SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.enforce_report_rate_limit SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.cleanup_rate_limits SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.notify_new_match SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.send_welcome_email SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.notify_new_message SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  ALTER FUNCTION public.send_match_email SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Fix matches insert policy
DROP POLICY IF EXISTS "System can insert matches" ON public.matches;
CREATE POLICY "System can insert matches" ON public.matches
  FOR INSERT TO service_role WITH CHECK (true);

-- natal_charts policies (drop first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own natal charts" ON public.natal_charts;
DROP POLICY IF EXISTS "Users can insert own natal charts" ON public.natal_charts;
DROP POLICY IF EXISTS "Users can update own natal charts" ON public.natal_charts;
DROP POLICY IF EXISTS "Users can delete own natal charts" ON public.natal_charts;

CREATE POLICY "Users can view own natal charts" ON public.natal_charts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own natal charts" ON public.natal_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own natal charts" ON public.natal_charts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own natal charts" ON public.natal_charts
  FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- 2. New features (voice intros, verification)
-- ========================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voice_intro_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_voice_intro BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_video_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-intros', 'voice-intros', true, 5242880,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/m4a', 'audio/wav', 'audio/x-m4a'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verifications', 'verifications', false, 52428800,
  ARRAY['video/mp4', 'video/quicktime', 'video/x-m4v'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first)
DROP POLICY IF EXISTS "Public read voice intros" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Users update own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own voice intro" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own verification" ON storage.objects;
DROP POLICY IF EXISTS "Users view own verification" ON storage.objects;

CREATE POLICY "Public read voice intros" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice-intros');

CREATE POLICY "Users upload own voice intro" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own voice intro" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own voice intro" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users upload own verification" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users view own verification" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_is_verified ON profiles(is_verified) WHERE is_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_has_voice_intro ON profiles(has_voice_intro) WHERE has_voice_intro = TRUE;

-- ========================================
-- 3. Fix discoverable_profiles view
-- ========================================

DROP VIEW IF EXISTS public.discoverable_profiles;
CREATE VIEW public.discoverable_profiles
WITH (security_invoker = true)
AS
SELECT
  id, name, age, birth_date, sun_sign, moon_sign, rising_sign, bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender, current_city, birth_chart, interests, is_verified,
  has_voice_intro, voice_intro_url, last_active, created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

GRANT SELECT ON public.discoverable_profiles TO authenticated;

-- ========================================
-- 4. Web subscriptions table
-- ========================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'premium_plus')),
  status TEXT DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;

CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL USING (auth.role() = 'service_role');

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

GRANT EXECUTE ON FUNCTION get_user_tier(UUID) TO authenticated;

-- ========================================
-- 5. Discoverable profiles RPC function
-- ========================================

DROP FUNCTION IF EXISTS get_discoverable_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID, name TEXT, age INTEGER, sun_sign TEXT, moon_sign TEXT,
  rising_sign TEXT, bio TEXT, image_url TEXT, is_verified BOOLEAN,
  has_voice_intro BOOLEAN, voice_intro_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.age, p.sun_sign, p.moon_sign, p.rising_sign, p.bio,
    COALESCE(p.image_url, p.photos[1]) as image_url,
    COALESCE(p.is_verified, false) as is_verified,
    COALESCE(p.has_voice_intro, false) as has_voice_intro,
    p.voice_intro_url
  FROM profiles p
  WHERE p.id != p_user_id
    AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    AND p.onboarding_completed = true
    AND p.name IS NOT NULL AND p.name != ''
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;

-- Done!
SELECT 'All migrations completed successfully!' as status;
