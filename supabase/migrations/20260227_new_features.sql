-- Migration for Voice Intros, Video Verification, and Date Planner features
-- Created: 2026-02-27

-- ========================================
-- Voice Intro columns on profiles
-- ========================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS voice_intro_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_voice_intro BOOLEAN DEFAULT FALSE;

-- ========================================
-- Video Verification columns on profiles
-- ========================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_video_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ========================================
-- Storage bucket for voice intros (public, 5MB max)
-- ========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-intros', 'voice-intros', true, 5242880,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/m4a', 'audio/wav', 'audio/x-m4a'])
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- Storage bucket for verifications (private, 50MB max)
-- ========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verifications', 'verifications', false, 52428800,
  ARRAY['video/mp4', 'video/quicktime', 'video/x-m4v'])
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- Storage policies for voice-intros bucket
-- ========================================

-- Public can read voice intros
CREATE POLICY "Public read voice intros" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice-intros');

-- Users can upload their own voice intro
CREATE POLICY "Users upload own voice intro" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own voice intro
CREATE POLICY "Users update own voice intro" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own voice intro
CREATE POLICY "Users delete own voice intro" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'voice-intros'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ========================================
-- Storage policies for verifications bucket (private)
-- ========================================

-- Users can upload their own verification video
CREATE POLICY "Users upload own verification" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own verification video
CREATE POLICY "Users view own verification" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'verifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ========================================
-- Update discoverable_profiles view to include new columns
-- ========================================
DROP VIEW IF EXISTS discoverable_profiles;
CREATE VIEW discoverable_profiles AS
SELECT
  id,
  name,
  age,
  birth_date,
  sun_sign,
  moon_sign,
  rising_sign,
  bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender,
  current_city,
  birth_chart,
  interests,
  is_verified,
  verified_at,
  has_voice_intro,
  voice_intro_url,
  last_active,
  created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- ========================================
-- Index for faster queries on verification status
-- ========================================
CREATE INDEX IF NOT EXISTS idx_profiles_is_verified ON profiles(is_verified) WHERE is_verified = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_has_voice_intro ON profiles(has_voice_intro) WHERE has_voice_intro = TRUE;
