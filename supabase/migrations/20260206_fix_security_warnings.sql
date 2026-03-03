-- Fix function search_path security warnings
-- Setting search_path to empty string prevents search path injection attacks

-- Fix check_and_create_match
ALTER FUNCTION public.check_and_create_match SET search_path = '';

-- Fix update_match_last_message
ALTER FUNCTION public.update_match_last_message SET search_path = '';

-- Fix update_profile_timestamp
ALTER FUNCTION public.update_profile_timestamp SET search_path = '';

-- Fix get_discoverable_profiles
ALTER FUNCTION public.get_discoverable_profiles SET search_path = '';

-- Fix increment_feature_usage
ALTER FUNCTION public.increment_feature_usage SET search_path = '';

-- Fix get_user_matches
ALTER FUNCTION public.get_user_matches SET search_path = '';

-- Fix check_rate_limit
ALTER FUNCTION public.check_rate_limit SET search_path = '';

-- Fix enforce_swipe_rate_limit
ALTER FUNCTION public.enforce_swipe_rate_limit SET search_path = '';

-- Fix enforce_message_rate_limit
ALTER FUNCTION public.enforce_message_rate_limit SET search_path = '';

-- Fix enforce_block_rate_limit
ALTER FUNCTION public.enforce_block_rate_limit SET search_path = '';

-- Fix enforce_report_rate_limit
ALTER FUNCTION public.enforce_report_rate_limit SET search_path = '';

-- Fix cleanup_rate_limits
ALTER FUNCTION public.cleanup_rate_limits SET search_path = '';

-- Fix notify_new_match
ALTER FUNCTION public.notify_new_match SET search_path = '';

-- Fix send_welcome_email
ALTER FUNCTION public.send_welcome_email SET search_path = '';

-- Fix notify_new_message
ALTER FUNCTION public.notify_new_message SET search_path = '';

-- Fix send_match_email
ALTER FUNCTION public.send_match_email SET search_path = '';

-- Fix RLS policy on matches table
-- The "System can insert matches" policy uses WITH CHECK (true) which is too permissive
-- We need to restrict it so only the check_and_create_match function can insert matches

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert matches" ON public.matches;

-- Create a more restrictive policy
-- Matches should only be created by the check_and_create_match function
-- which runs with SECURITY DEFINER, so we use a service role check
CREATE POLICY "System can insert matches" ON public.matches
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Fix RLS enabled but no policies on natal_charts table
-- Add appropriate policies for users to manage their own natal charts
CREATE POLICY "Users can view own natal charts" ON public.natal_charts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own natal charts" ON public.natal_charts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own natal charts" ON public.natal_charts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own natal charts" ON public.natal_charts
  FOR DELETE USING (auth.uid() = user_id);

-- Fix SECURITY DEFINER view warning
-- Recreate the view with SECURITY INVOKER to use the querying user's permissions
DROP VIEW IF EXISTS public.discoverable_profiles;
CREATE VIEW public.discoverable_profiles
WITH (security_invoker = true) AS
SELECT
  id, name, age, birth_date, sun_sign, moon_sign, rising_sign, bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender, current_city, birth_chart, interests, is_verified, last_active, created_at
FROM public.profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- Note: For "Leaked Password Protection Disabled" warning:
-- This must be enabled in the Supabase Dashboard:
-- Authentication > Providers > Email > Enable "Leaked password protection"
