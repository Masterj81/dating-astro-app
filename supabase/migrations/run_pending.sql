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

DO $$ BEGIN
  ALTER FUNCTION public.send_report_email SET search_path = '';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Recreate functions that break under search_path = '' unless all relations are schema-qualified
CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ordered_user1 UUID;
  ordered_user2 UUID;
BEGIN
  IF NEW.action NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.swipes
    WHERE swiper_id = NEW.swiped_id
      AND swiped_id = NEW.swiper_id
      AND action IN ('like', 'super_like')
  ) THEN
    IF NEW.swiper_id < NEW.swiped_id THEN
      ordered_user1 := NEW.swiper_id;
      ordered_user2 := NEW.swiped_id;
    ELSE
      ordered_user1 := NEW.swiped_id;
      ordered_user2 := NEW.swiper_id;
    END IF;

    INSERT INTO public.matches (user1_id, user2_id)
    VALUES (ordered_user1, ordered_user2)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INTEGER,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.rate_limits%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, NOW(), 1)
    ON CONFLICT (user_id, action)
    DO UPDATE SET request_count = public.rate_limits.request_count + 1;
    RETURN TRUE;
  END IF;

  IF v_row.window_start + p_window < NOW() THEN
    UPDATE public.rate_limits
    SET window_start = NOW(), request_count = 1
    WHERE user_id = p_user_id
      AND action = p_action;
    RETURN TRUE;
  END IF;

  IF v_row.request_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id
    AND action = p_action;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_swipe_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.swiper_id, 'swipe', 100, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many swipes. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.sender_id, 'message', 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_block_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.blocker_id, 'block', 20, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many block actions. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.reporter_id, 'report', 10, INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reports. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_match_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.matches
  SET last_message_at = NEW.created_at
  WHERE id = NEW.match_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sender_name TEXT;
  recipient_id UUID;
  match_record public.matches%ROWTYPE;
  edge_function_url TEXT;
BEGIN
  SELECT name
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT *
  INTO match_record
  FROM public.matches
  WHERE id = NEW.match_id;

  IF match_record.user1_id = NEW.sender_id THEN
    recipient_id := match_record.user2_id;
  ELSE
    recipient_id := match_record.user1_id;
  END IF;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', recipient_id,
      'type', 'messages',
      'title', COALESCE(sender_name, 'Someone') || ' sent you a message',
      'body', LEFT(NEW.content, 100),
      'data', jsonb_build_object('matchId', NEW.match_id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_report_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  edge_function_url TEXT;
BEGIN
  edge_function_url := 'https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/send-report-email';

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object('reportId', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_report_email ON public.reports;
CREATE TRIGGER trigger_send_report_email
AFTER INSERT ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.send_report_email();

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

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_latitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS birth_longitude DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS birth_chart JSONB,
  ADD COLUMN IF NOT EXISTS looking_for TEXT[] DEFAULT ARRAY['male', 'female', 'non-binary', 'other']::TEXT[],
  ADD COLUMN IF NOT EXISTS min_age INTEGER DEFAULT 18,
  ADD COLUMN IF NOT EXISTS max_age INTEGER DEFAULT 99,
  ADD COLUMN IF NOT EXISTS max_distance INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS preferred_elements TEXT[] DEFAULT ARRAY['fire', 'earth', 'air', 'water']::TEXT[],
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed ON public.profiles(onboarding_completed);

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

CREATE TABLE IF NOT EXISTS public.promo_campaign_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_code TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('stripe', 'play_store')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'checkout_completed', 'consumed', 'failed')
  ),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  applied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, campaign_code, platform)
);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_redemptions_status
  ON public.promo_campaign_redemptions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_redemptions_user
  ON public.promo_campaign_redemptions(user_id, created_at DESC);

ALTER TABLE public.promo_campaign_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to promo campaign redemptions"
  ON public.promo_campaign_redemptions;

DROP POLICY IF EXISTS "Service role can manage promo campaign redemptions"
  ON public.promo_campaign_redemptions;

CREATE POLICY "Deny all direct access to promo campaign redemptions"
  ON public.promo_campaign_redemptions FOR ALL
  USING (false);

CREATE POLICY "Service role can manage promo campaign redemptions"
  ON public.promo_campaign_redemptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('stripe', 'play_store')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  reward_type TEXT NOT NULL CHECK (
    reward_type IN (
      'stripe_deferred_coupon',
      'stripe_checkout_coupon',
      'play_store_defer_billing',
      'play_store_subscription_option'
    )
  ),
  stripe_coupon_id TEXT,
  play_defer_duration_seconds INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_redemptions INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, platform, billing_cycle)
);

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_lookup
  ON public.promo_campaigns(code, platform, billing_cycle, active);

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to promo campaigns"
  ON public.promo_campaigns;

DROP POLICY IF EXISTS "Service role can manage promo campaigns"
  ON public.promo_campaigns;

CREATE POLICY "Deny all direct access to promo campaigns"
  ON public.promo_campaigns FOR ALL
  USING (false);

CREATE POLICY "Service role can manage promo campaigns"
  ON public.promo_campaigns FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO public.promo_campaigns (
  code,
  platform,
  billing_cycle,
  reward_type,
  stripe_coupon_id,
  play_defer_duration_seconds,
  active,
  metadata
)
VALUES
  ('PAY1GET3', 'stripe', 'monthly', 'stripe_deferred_coupon', 'PAY1GET3_INTERNAL', NULL, TRUE, jsonb_build_object('label', 'Pay 1 Month, Get 3 Free')),
  ('PAY1GET3', 'stripe', 'yearly', 'stripe_checkout_coupon', 'PAY1GET3_YEARLY', NULL, TRUE, jsonb_build_object('label', '25% Off First Year')),
  ('PAY1GET3', 'play_store', 'monthly', 'play_store_defer_billing', NULL, 7776000, TRUE, jsonb_build_object('label', 'Pay 1 Month, Get 3 Free')),
  ('PAY1GET3', 'play_store', 'yearly', 'play_store_subscription_option', NULL, NULL, TRUE, jsonb_build_object('label', '25% Off First Year', 'offers', jsonb_build_object('celestial_yearly', 'yearly-v2:pay1get3-celestial-yearly', 'cosmic_yearly', 'yearly-v2:pay1get3-cosmic-yearly')))
ON CONFLICT (code, platform, billing_cycle) DO UPDATE
SET
  reward_type = EXCLUDED.reward_type,
  stripe_coupon_id = EXCLUDED.stripe_coupon_id,
  play_defer_duration_seconds = EXCLUDED.play_defer_duration_seconds,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

CREATE OR REPLACE VIEW public.promo_campaign_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  c.code,
  c.platform,
  c.billing_cycle,
  c.reward_type,
  c.active,
  COUNT(r.*) AS total_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'pending') AS pending_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'checkout_completed') AS checkout_completed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'consumed') AS consumed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_redemptions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE r.status = 'consumed') / NULLIF(COUNT(r.*), 0),
    2
  ) AS consumed_rate_pct,
  MIN(r.created_at) AS first_redemption_at,
  MAX(r.created_at) AS latest_redemption_at
FROM public.promo_campaigns c
LEFT JOIN public.promo_campaign_redemptions r
  ON r.campaign_code = c.code
 AND r.platform = c.platform
GROUP BY
  c.code,
  c.platform,
  c.billing_cycle,
  c.reward_type,
  c.active;

CREATE OR REPLACE VIEW public.promo_campaign_kpi_daily
WITH (security_invoker = true)
AS
SELECT
  DATE_TRUNC('day', r.created_at)::date AS day,
  r.campaign_code,
  r.platform,
  COUNT(*) AS total_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'pending') AS pending_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'checkout_completed') AS checkout_completed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'consumed') AS consumed_redemptions,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_redemptions
FROM public.promo_campaign_redemptions r
GROUP BY
  DATE_TRUNC('day', r.created_at)::date,
  r.campaign_code,
  r.platform;

CREATE OR REPLACE VIEW public.subscription_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  source,
  tier,
  status,
  cancel_at_period_end,
  COUNT(*) AS total_subscriptions,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) AS not_expired_subscriptions,
  MIN(created_at) AS first_subscription_at,
  MAX(created_at) AS latest_subscription_at
FROM public.subscriptions
GROUP BY
  source,
  tier,
  status,
  cancel_at_period_end;

CREATE OR REPLACE VIEW public.promo_subscription_kpi_summary
WITH (security_invoker = true)
AS
SELECT
  r.campaign_code,
  r.platform,
  s.source AS subscription_source,
  s.tier,
  s.status AS subscription_status,
  COUNT(*) AS total_users
FROM public.promo_campaign_redemptions r
JOIN public.subscriptions s
  ON s.user_id = r.user_id
WHERE r.status = 'consumed'
GROUP BY
  r.campaign_code,
  r.platform,
  s.source,
  s.tier,
  s.status;

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

GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO authenticated;

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
  FROM public.profiles p
  WHERE p.id != p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
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
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.get_user_matches(UUID) TO authenticated;

-- Done!
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    gender,
    birth_date,
    age
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.raw_user_meta_data ->> 'gender',
    NULLIF(NEW.raw_user_meta_data ->> 'birth_date', '')::date,
    NULLIF(NEW.raw_user_meta_data ->> 'age', '')::integer
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    birth_date = COALESCE(public.profiles.birth_date, EXCLUDED.birth_date),
    age = COALESCE(public.profiles.age, EXCLUDED.age);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_profile_on_auth_signup ON auth.users;

CREATE TRIGGER trigger_create_profile_on_auth_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

INSERT INTO public.profiles (
  id,
  email,
  name,
  gender,
  birth_date,
  age
)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name'
  ),
  u.raw_user_meta_data ->> 'gender',
  NULLIF(u.raw_user_meta_data ->> 'birth_date', '')::date,
  NULLIF(u.raw_user_meta_data ->> 'age', '')::integer
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_adult_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  calculated_age INTEGER;
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    calculated_age := DATE_PART('year', AGE(CURRENT_DATE, NEW.birth_date::date));
    IF calculated_age < 18 THEN
      RAISE EXCEPTION 'Users must be at least 18 years old.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.age IS NOT NULL AND NEW.age < 18 THEN
    RAISE EXCEPTION 'Users must be at least 18 years old.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_adult_profile ON public.profiles;

CREATE TRIGGER trigger_enforce_adult_profile
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_adult_profile();

SELECT 'All migrations completed successfully!' as status;
