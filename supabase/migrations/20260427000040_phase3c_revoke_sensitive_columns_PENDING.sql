-- =============================================================================
-- Phase 3-C: column-level REVOKE on public.profiles.
--
-- *** DO NOT APPLY UNTIL PHASE 3-B IS COMPLETE AND VALIDATED IN STAGING. ***
--
-- This migration is GATED by a deadman switch (see DO block below). It will
-- raise an exception unless the operator explicitly opts in by running:
--
--     SET LOCAL app.phase3c_ready = 'true';
--
-- in the same session, immediately before the migration. This prevents
-- accidental application by `supabase db push` or other automation while
-- Phase 3-B (app code migration) is still in progress.
--
-- Once Phase 3-B is fully deployed (mobile + web + edge functions) and
-- verified for at least 48h with no errors related to sensitive column
-- reads, run:
--
--     BEGIN;
--     SET LOCAL app.phase3c_ready = 'true';
--     -- run this migration's body
--     COMMIT;
--
-- Effect of this migration:
--   - REVOKE column-level SELECT on email, birth_date, birth_time,
--     birth_latitude, birth_longitude, birth_chart, push_token,
--     notification_preferences, referred_by FROM authenticated.
--   - After this, any client query like
--       supabase.from('profiles').select('email,birth_time,...')
--     fails with "permission denied for column ..." even for the caller's
--     own row. Self-reads MUST go through public.get_my_full_profile().
--     Other-user reads MUST go through the get-profile-chart edge function.
--   - UPDATE remains allowed via the existing FOR UPDATE policy
--     (auth.uid() = id) — account screens that write these columns keep
--     working.
--   - service_role and postgres keep all privileges.
--
-- Rollback: re-grant the revoked columns:
--     GRANT SELECT (email, birth_date, ...) ON public.profiles TO authenticated;
-- =============================================================================

DO $$
BEGIN
  IF current_setting('app.phase3c_ready', TRUE) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION
      'Phase 3-C is gated. Set: SET LOCAL app.phase3c_ready = ''true''; '
      'before running this migration. Confirm Phase 3-B is fully deployed first.'
      USING ERRCODE = '42501';
  END IF;
END $$;

-- ---- The actual REVOKEs ---------------------------------------------------

REVOKE SELECT (email)                    ON public.profiles FROM authenticated;
REVOKE SELECT (birth_date)               ON public.profiles FROM authenticated;
REVOKE SELECT (birth_time)               ON public.profiles FROM authenticated;
REVOKE SELECT (birth_latitude)           ON public.profiles FROM authenticated;
REVOKE SELECT (birth_longitude)          ON public.profiles FROM authenticated;
REVOKE SELECT (birth_chart)              ON public.profiles FROM authenticated;
REVOKE SELECT (push_token)               ON public.profiles FROM authenticated;
REVOKE SELECT (notification_preferences) ON public.profiles FROM authenticated;
REVOKE SELECT (referred_by)              ON public.profiles FROM authenticated;

-- Anon should already have no SELECT at all (migration B). Defensive REVOKE:
REVOKE SELECT (email, birth_date, birth_time, birth_latitude, birth_longitude,
               birth_chart, push_token, notification_preferences, referred_by)
  ON public.profiles FROM anon;

-- ---- Documentation comments -----------------------------------------------

COMMENT ON COLUMN public.profiles.email IS
  'PII. Authenticated SELECT revoked (Phase 3-C). Read via public.get_my_full_profile() for self.';
COMMENT ON COLUMN public.profiles.birth_date IS
  'PII. Authenticated SELECT revoked (Phase 3-C). Read via public.get_my_full_profile() for self; via get-profile-chart edge fn for others (chart only, raw date never returned).';
COMMENT ON COLUMN public.profiles.birth_time IS
  'PII. Authenticated SELECT revoked (Phase 3-C). Same access path as birth_date.';
COMMENT ON COLUMN public.profiles.birth_latitude IS
  'PII (location). Authenticated SELECT revoked (Phase 3-C). Same access path as birth_date.';
COMMENT ON COLUMN public.profiles.birth_longitude IS
  'PII (location). Authenticated SELECT revoked (Phase 3-C). Same access path as birth_date.';
COMMENT ON COLUMN public.profiles.birth_chart IS
  'Derived JSONB chart. Authenticated SELECT revoked (Phase 3-C). Self via get_my_full_profile; others get a sanitized chart via get-profile-chart edge fn.';
COMMENT ON COLUMN public.profiles.push_token IS
  'Device push token (legacy). Authenticated SELECT revoked (Phase 3-C). New code should use the push_tokens table via claim_push_token_v2.';
COMMENT ON COLUMN public.profiles.notification_preferences IS
  'PII. Authenticated SELECT revoked (Phase 3-C). Self-read via public.get_my_full_profile().';
COMMENT ON COLUMN public.profiles.referred_by IS
  'PII (social graph). Authenticated SELECT revoked (Phase 3-C). Self-read via public.get_my_full_profile() if needed.';
