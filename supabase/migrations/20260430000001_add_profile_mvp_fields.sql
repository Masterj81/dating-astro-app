-- Profile MVP: add personal_values, relationship_intent, looking_for_text,
-- icebreaker_question, prompts. Reuse existing `interests` column for
-- lifestyle tags (food/sport/music) — it was declared in the original schema
-- but never wired to any UI.
--
-- All new columns are nullable / have safe defaults — the migration is
-- non-breaking. RLS policies unchanged.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CHECK constraint guarded by
-- pg_constraint lookup, RPC dropped + recreated.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New columns on profiles
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_values     TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS relationship_intent TEXT,
  ADD COLUMN IF NOT EXISTS looking_for_text    TEXT,
  ADD COLUMN IF NOT EXISTS icebreaker_question TEXT,
  ADD COLUMN IF NOT EXISTS prompts             JSONB DEFAULT '[]'::jsonb;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Constrain relationship_intent vocabulary
--    Canonical values: 'serious','exploring','casual','friends','unsure'
--    NULL allowed during transition; client-side will require it for new
--    saves. We don't NOT NULL the column to avoid breaking existing rows.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_relationship_intent_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_relationship_intent_check
      CHECK (
        relationship_intent IS NULL
        OR relationship_intent IN ('serious','exploring','casual','friends','unsure')
      );
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Length / cardinality guards. Mirrors client-side caps so DB is the
--    source of truth and stale clients can't bypass them.
--
--    Caps must stay in sync with apps/mobile/data/profile-fields.ts:
--      MAX_LOOKING_FOR_TEXT_LENGTH = 200
--      MAX_ICEBREAKER_LENGTH       = 80
--      MAX_PROMPTS                 = 3
--      MAX_PROMPT_RESPONSE_LENGTH  = 200
--      MAX_VALUES                  = 5   (personal_values)
--      MAX_LIFESTYLE_TAGS          = 12  (interests)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_looking_for_text_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_looking_for_text_length_check
      CHECK (looking_for_text IS NULL OR length(looking_for_text) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_icebreaker_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_icebreaker_length_check
      CHECK (icebreaker_question IS NULL OR length(icebreaker_question) <= 80);
  END IF;

  -- personal_values: brand new column, no legacy data → plain CHECK is safe.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_personal_values_size_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_personal_values_size_check
      CHECK (personal_values IS NULL OR cardinality(personal_values) <= 5);
  END IF;

  -- interests: pre-existing column, never written from UI but seeds may have
  -- populated it. Use NOT VALID + VALIDATE to fail explicitly on legacy rows
  -- that exceed 12 entries instead of silently rejecting future writes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_interests_size_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_interests_size_check
      CHECK (interests IS NULL OR cardinality(interests) <= 12)
      NOT VALID;
    ALTER TABLE public.profiles
      VALIDATE CONSTRAINT profiles_interests_size_check;
  END IF;

  -- prompts JSONB shape:
  --   - top-level must be an array
  --   - max 3 entries (MAX_PROMPTS)
  --   - each entry: object with string `key` (≤64 char) and string
  --     `response` (≤200 char = MAX_PROMPT_RESPONSE_LENGTH)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_prompts_shape_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_prompts_shape_check
      CHECK (
        prompts IS NULL
        OR (
          jsonb_typeof(prompts) = 'array'
          AND jsonb_array_length(prompts) <= 3
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(prompts) AS elem
            WHERE jsonb_typeof(elem) <> 'object'
               OR jsonb_typeof(elem->'key') <> 'string'
               OR jsonb_typeof(elem->'response') <> 'string'
               OR length(elem->>'key') > 64
               OR length(elem->>'response') > 200
          )
        )
      );
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Update get_my_full_profile() to surface the new columns.
--
--    The RPC is the canonical self-read path (Phase 3-A) and mobile/web
--    clients rely on it. It must include every column the edit screen wants
--    to populate, otherwise the new fields would be invisible to the user.
--
--    We DROP + recreate because RETURNS TABLE columns can't be altered with
--    CREATE OR REPLACE.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_full_profile();

CREATE OR REPLACE FUNCTION public.get_my_full_profile()
RETURNS TABLE (
  id                       UUID,
  email                    TEXT,
  name                     TEXT,
  age                      INTEGER,
  birth_date               DATE,
  birth_time               TIME,
  birth_city               TEXT,
  birth_latitude           DECIMAL(9,6),
  birth_longitude          DECIMAL(9,6),
  birth_chart              JSONB,
  sun_sign                 TEXT,
  moon_sign                TEXT,
  rising_sign              TEXT,
  bio                      TEXT,
  gender                   TEXT,
  looking_for              TEXT[],
  interests                TEXT[],
  image_url                TEXT,
  images                   TEXT[],
  photos                   TEXT[],
  current_city             TEXT,
  current_latitude         DECIMAL(9,6),
  current_longitude        DECIMAL(9,6),
  min_age                  INTEGER,
  max_age                  INTEGER,
  max_distance             INTEGER,
  preferred_elements       TEXT[],
  is_premium               BOOLEAN,
  premium_until            TIMESTAMPTZ,
  is_active                BOOLEAN,
  is_verified              BOOLEAN,
  onboarding_completed     BOOLEAN,
  has_voice_intro          BOOLEAN,
  voice_intro_url          TEXT,
  verification_video_url   TEXT,
  verified_at              TIMESTAMPTZ,
  notification_preferences JSONB,
  push_token               TEXT,
  referral_code            TEXT,
  referred_by              UUID,
  last_active              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ,
  -- MVP profile additions
  personal_values          TEXT[],
  relationship_intent      TEXT,
  looking_for_text         TEXT,
  icebreaker_question      TEXT,
  prompts                  JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.name,
    p.age,
    p.birth_date,
    p.birth_time,
    p.birth_city,
    p.birth_latitude,
    p.birth_longitude,
    p.birth_chart,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    p.gender,
    p.looking_for,
    p.interests,
    p.image_url,
    p.images,
    p.photos,
    p.current_city,
    p.current_latitude,
    p.current_longitude,
    p.min_age,
    p.max_age,
    p.max_distance,
    p.preferred_elements,
    p.is_premium,
    p.premium_until,
    p.is_active,
    p.is_verified,
    p.onboarding_completed,
    p.has_voice_intro,
    p.voice_intro_url,
    p.verification_video_url,
    p.verified_at,
    p.notification_preferences,
    p.push_token,
    p.referral_code,
    p.referred_by,
    p.last_active,
    p.created_at,
    p.updated_at,
    p.personal_values,
    p.relationship_intent,
    p.looking_for_text,
    p.icebreaker_question,
    p.prompts
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

COMMENT ON FUNCTION public.get_my_full_profile() IS
  'Phase 3-A: self-read of caller''s profile row, all columns. SECURITY DEFINER bypasses Phase 3-C column REVOKEs. Updated 2026-04-30 to surface MVP profile fields: personal_values, relationship_intent, looking_for_text, icebreaker_question, prompts.';

commit;
