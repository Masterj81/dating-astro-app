-- =============================================================================
-- P0 — Finish Phase 3-C: five PII columns are still readable by every account
-- =============================================================================
--
-- CONFIRMED 3 Sep 2026 by querying information_schema.column_privileges on the
-- live database. Phase 3-C
-- (20260427000040_phase3c_revoke_sensitive_columns_PENDING.sql) is recorded as
-- applied in the migration history, but it landed PARTIALLY. Four of its nine
-- columns are revoked; five are not:
--
--     REVOKED  birth_date, birth_chart, notification_preferences, referred_by
--     LIVE     email, birth_time, birth_latitude, birth_longitude, push_token
--
-- That split is what makes the diagnosis certain rather than theoretical: a
-- gated migration that never ran would have left all nine, and one that ran
-- cleanly would have left none.
--
-- WHY THIS IS A P0
-- ----------------
-- The row-level policy on profiles is, verbatim
-- (00000000000000_full_schema.sql:376):
--
--     CREATE POLICY "Users can view active profiles" ON profiles
--       FOR SELECT USING (is_active = true AND onboarding_completed = true);
--
-- Every active row is visible to every signed-in account. Column privileges are
-- therefore the ONLY thing standing between a free account and:
--
--     GET /rest/v1/profiles?select=id,name,email,birth_time,birth_latitude,birth_longitude,push_token
--
-- which returns the entire user base. No UI is involved and none is needed: a
-- valid JWT is enough, and every account has one.
--
-- The birth coordinates are the worst of it. A birth latitude/longitude is
-- location data, and for most people it is the town — often the hospital — their
-- family lived in. It is more identifying than the email beside it. If the Play
-- Console Data Safety declaration says location is not shared with other users,
-- that declaration is currently false.
--
-- `push_token` is a second, quieter problem: Expo push tokens are bearer
-- credentials. Anyone holding one can send a notification to that device
-- through Expo's public API without authenticating as anyone.
--
-- WHY THIS IS SAFE TO RUN
-- -----------------------
-- Only SELECT is revoked. INSERT and UPDATE stay, because onboarding writes
-- birth_time and the coordinates, the account forms write email, and
-- notifications.ts writes push_token — all of them self-writes already bounded
-- by the `auth.uid() = id` UPDATE policy.
--
-- Reads are unaffected because nothing reads these columns as `authenticated`.
-- All twenty client-side `.select()` calls on `profiles` were enumerated on
-- 3 Sep 2026 and not one requests any of the five:
--
--     id, age · id, name, age, photos, sun_sign · sun_sign · id,
--     onboarding_completed · referral_code · is_verified, verified_at ·
--     voice_intro_url · min_age, max_age, max_distance, looking_for,
--     preferred_elements · id, name, photos · ...
--
-- Self-reads of the sensitive fields already go through
-- `public.get_my_full_profile()` (SECURITY DEFINER), which runs as the definer
-- and is unaffected by a grant to `authenticated`. Other users' natal data
-- already goes through the `get-profile-chart` edge function, which reads with
-- service_role and returns a sanitized chart.
--
-- The proof that this shape is already survivable: `birth_date` and
-- `birth_chart` are ALREADY revoked, and Discover, the public profile and the
-- chat header all work today.
--
-- NOT DEPLOYED BY THIS FILE. Nine migrations are unrecorded in the remote
-- history, so `supabase db push` would re-run data migrations and enqueue
-- emails. Paste this into the SQL editor. See docs/security-audit-2026-09.md.

begin;

REVOKE SELECT (email)           ON public.profiles FROM authenticated;
REVOKE SELECT (birth_time)      ON public.profiles FROM authenticated;
REVOKE SELECT (birth_latitude)  ON public.profiles FROM authenticated;
REVOKE SELECT (birth_longitude) ON public.profiles FROM authenticated;
REVOKE SELECT (push_token)      ON public.profiles FROM authenticated;

-- anon holds only REFERENCES on these (inert), but Phase 3-C named it and the
-- statement is idempotent, so the posture stays stated rather than assumed.
REVOKE SELECT (email, birth_time, birth_latitude, birth_longitude, push_token)
  ON public.profiles FROM anon;

COMMENT ON COLUMN public.profiles.email IS
  'PII. Authenticated SELECT revoked (Phase 3-C completed 2026-09-03). Self-read via public.get_my_full_profile().';
COMMENT ON COLUMN public.profiles.birth_time IS
  'PII. Authenticated SELECT revoked 2026-09-03. Self-read via get_my_full_profile(); other users see only a sanitized chart from the get-profile-chart edge function.';
COMMENT ON COLUMN public.profiles.birth_latitude IS
  'PII (location — usually the family town). Authenticated SELECT revoked 2026-09-03. Same access path as birth_time.';
COMMENT ON COLUMN public.profiles.birth_longitude IS
  'PII (location — usually the family town). Authenticated SELECT revoked 2026-09-03. Same access path as birth_time.';
COMMENT ON COLUMN public.profiles.push_token IS
  'Bearer credential: anyone holding it can push to the device through Expo. Authenticated SELECT revoked 2026-09-03; written by the owner, read only by service_role senders.';

commit;

-- Verification and regression checks are NOT commented out below, because a
-- check you have to un-comment is a check that gets skipped. They live in
-- docs/security-audit-2026-09.md (§Vérifications) as one block you paste whole
-- into the SQL editor and read the output of — it prints a verdict line rather
-- than a table you have to interpret.
--
-- Regression surface to exercise afterwards, in this order:
--   1. onboarding saves a birth time and a city
--   2. the account screen shows YOUR OWN email  (goes through get_my_full_profile)
--   3. Discover lists profiles
--   4. a natal chart renders for yourself, then for someone else
--   5. push notifications register on a fresh install
-- If (2) breaks, something reads profiles.email as `authenticated` that the
-- 3 Sep enumeration of all twenty client selects missed — and that call site is
-- the real finding, not this migration.
