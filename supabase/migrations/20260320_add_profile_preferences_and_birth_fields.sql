-- Add profile fields required by mobile/web onboarding and preferences flows.
-- Safe to re-run on existing projects.

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

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
  ON public.profiles(onboarding_completed);
