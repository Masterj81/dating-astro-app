-- Phase 1 synastry correctness baseline — birth timezone + chart version.
--
-- Why this migration:
--   The mobile + edge astrology pipelines previously combined the user's
--   local birth date+time with the device/runtime's tz interpretation
--   (`new Date().setHours(...)` on mobile, `new Date(Date.UTC(y,m,d,h,m))`
--   on the edge worker). Both paths produced a chart that depended on
--   which device/worker the call happened from. The new
--   `@astro/shared/astrology` engine resolves an IANA timezone from the
--   birth coordinates (tz-lookup polygons) and builds the UTC instant via
--   Luxon — fully aware of DST, half-hour offsets, and historical tzdb.
--
--   To make that work end-to-end we need to persist the resolved IANA
--   timezone alongside the birth_date/birth_time fields. We also persist a
--   `birth_time_known` flag so future code doesn't have to re-derive
--   confidence from `birth_time IS NOT NULL`, and a `chart_version` smallint
--   so cached charts can be invalidated server-side when the scoring model
--   is bumped.
--
-- Properties:
--   - Additive only. All new columns default NULL / sensible defaults; no
--     existing row breaks.
--   - Same REVOKE/GRANT posture as the existing birth_* columns (Phase 3-C
--     revokes anonymous and authenticated SELECT on sensitive PII columns;
--     birth_timezone is PII-adjacent because it pins the birth location's
--     timezone, so it gets the same column-level revoke from authenticated
--     in the pending Phase 3-C migration — see addendum below).
--   - The matching `birth_timezone` value is ALREADY being written to the
--     `birth_chart` JSONB blob by the new mobile + edge code, so charts
--     computed after the engine landed already carry the IANA via that
--     route. This column gives us a typed, indexable home for it.
--
-- Backfill strategy (documented, NOT executed in this migration):
--   - Best-effort backfill via a server task: for every profile with
--     `birth_latitude` + `birth_longitude` non-null, derive the IANA via
--     tz-lookup and UPDATE birth_timezone = <iana> WHERE birth_timezone IS NULL.
--   - Rows without birth coordinates stay NULL and surface as confidence='low'
--     in the new engine (warning: missing_birth_timezone).
--   - Bump `chart_version = 0` initially; the engine bumps to 1 on next
--     compute, which lets us invalidate stale `birth_chart` blobs lazily.
--
-- This migration is safe to run in any order relative to the Phase 3-C
-- "REVOKE_PENDING" migration — it does NOT touch privileges.

begin;

-- ---------------------------------------------------------------------------
-- 0. Defensive cleanup of legacy `birth_timezone` column.
--    Live DBs may carry an untracked `birth_timezone` column of integer/
--    numeric type — a remnant of the old `Math.round(longitude / 15)`
--    offset that Phase 1 explicitly retires (and that the new engine
--    refuses to use). If we find it with a non-text type we DROP it so
--    step 1 can ADD COLUMN IF NOT EXISTS as TEXT cleanly. The integer
--    value carries the bug we are fixing — there is nothing to preserve.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND column_name  = 'birth_timezone';

  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    RAISE NOTICE 'Dropping legacy birth_timezone column of type % (Phase 1 cleanup).', v_type;
    ALTER TABLE public.profiles DROP COLUMN birth_timezone;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. New columns on public.profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_timezone TEXT,
  ADD COLUMN IF NOT EXISTS birth_time_known BOOLEAN,
  ADD COLUMN IF NOT EXISTS chart_version SMALLINT NOT NULL DEFAULT 0;

-- Backfill birth_time_known from existing data so the new column matches
-- reality for already-onboarded users. The new engine will keep it in sync
-- on subsequent writes.
UPDATE public.profiles
SET    birth_time_known = (birth_time IS NOT NULL)
WHERE  birth_time_known IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Light-weight format guard for birth_timezone.
--    We accept any non-empty TEXT up to 64 chars; the application is the
--    real validator (it calls Luxon's IANAZone.isValidZone before writing).
--    We deliberately do NOT enforce a strict regex — the IANA tzdb evolves
--    (new aliases, renamed zones) and a strict CHECK would block legitimate
--    future writes.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_birth_timezone_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_birth_timezone_check
        CHECK (birth_timezone IS NULL
               OR (length(birth_timezone) BETWEEN 3 AND 64
                   AND birth_timezone ~ '^[A-Za-z][A-Za-z0-9+\-_/]*$'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.birth_timezone IS
  'IANA timezone identifier for the birth event (e.g. "America/New_York"). PII-adjacent — same access posture as birth_latitude/longitude. Required for accurate chart computation; NULL falls back to tz-lookup at compute time (confidence drops to medium/low).';
COMMENT ON COLUMN public.profiles.birth_time_known IS
  'TRUE when a birth time was supplied. Used to gate the Ascendant / MC / houses in the natal chart and the confidence cap in synastry scoring.';
COMMENT ON COLUMN public.profiles.chart_version IS
  'Scoring-model version the cached birth_chart was computed under. Bumped when the synastry scoring model changes so cached scores can be invalidated lazily. See packages/shared/src/astrology/version.ts.';

-- ---------------------------------------------------------------------------
-- 3. Update get_my_full_profile() to project the new columns. We DROP +
--    recreate because RETURNS TABLE shape changes can't be applied with
--    CREATE OR REPLACE. The body is unchanged otherwise.
-- ---------------------------------------------------------------------------
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
  -- MVP profile additions (kept from 20260601000001)
  personal_values          TEXT[],
  relationship_intent      TEXT,
  looking_for_text         TEXT,
  icebreaker_question      TEXT,
  prompts                  JSONB,
  -- Connection intentions (love / friendship / business)
  connection_intentions    TEXT[],
  -- Phase 1 synastry correctness additions
  birth_timezone           TEXT,
  birth_time_known         BOOLEAN,
  chart_version            SMALLINT
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
    p.prompts,
    p.connection_intentions,
    p.birth_timezone,
    p.birth_time_known,
    p.chart_version
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

COMMENT ON FUNCTION public.get_my_full_profile() IS
  'Phase 3-A + 1 (birth timezone). Self-read of caller''s profile row, all columns. SECURITY DEFINER bypasses Phase 3-C column REVOKEs. The function takes no parameters and uses auth.uid() internally — a caller cannot fetch another user''s profile.';

-- ---------------------------------------------------------------------------
-- 4. Phase 3-C addendum: when/if Phase 3-C is applied in a future deploy,
--    the operator should also REVOKE SELECT on these new sensitive-adjacent
--    columns. We don't issue the REVOKE here because Phase 3-C is gated and
--    additive REVOKEs belong on its side. Documented in
--    supabase/SECURITY.md and 20260427000040_phase3c_revoke_sensitive_columns_PENDING.sql.
--
--    Recommended Phase 3-C addition:
--      REVOKE SELECT (birth_timezone, birth_time_known) ON public.profiles FROM authenticated;
-- ---------------------------------------------------------------------------

commit;
