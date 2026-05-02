-- Add the occupation column to public.profiles.
--
-- The mobile profile editor (apps/mobile/app/profile/edit.tsx) has had an
-- "Occupation" input wired up for some time — translated in 8 locales,
-- counted toward profile completeness, mentioned in the privacy policy —
-- but the column was never added to the schema. Saves PATCH'ing the column
-- 400'd with PGRST204 ("Column not found in schema cache"), surfacing as
-- a generic "Something went wrong" alert.
--
-- 100-char cap mirrors the other free-text profile fields (looking_for_text
-- is 200 but occupation is shorter by convention). Validated by both client
-- (.trim()) and DB so a malicious client can't store 1MB.
--
-- Idempotent.

begin;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS occupation TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_occupation_length;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_occupation_length
  CHECK (occupation IS NULL OR length(occupation) <= 100);

COMMENT ON COLUMN public.profiles.occupation IS
  'Free-text job/profession field shown on profile edit. Capped at 100 chars.';

commit;
