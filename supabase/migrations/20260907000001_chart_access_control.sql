-- =============================================================================
-- JUNO-02 — Who may read another person's chart, decided in one place
-- =============================================================================
--
-- THE PROBLEM
-- -----------
-- `get-profile-chart` authenticated its caller and stopped there. It checked
-- no subscription, no block, and no relationship: any valid JWT could name any
-- UUID and receive that person's natal reading, including UUIDs the caller
-- could never see in Discover and UUIDs belonging to people who had blocked
-- them. `get_synastry_candidate_profiles` filters blocks correctly but checks
-- no tier either. (docs/security-audit-2026-09-07.md, JUNO-02.)
--
-- Combined with JUNO-01 — the published chart was invertible back to the exact
-- birth instant and coordinates — that made the endpoint a bulk exporter of
-- the very columns Phase 3-C revokes.
--
-- WHY A FUNCTION RATHER THAN A CHECK INSIDE THE EDGE FUNCTION
-- ----------------------------------------------------------
-- The visibility rule already exists, in SQL, inside
-- `get_synastry_candidate_profiles` (20260513000001): self-exclusion, blocks in
-- both directions, active + onboarded + named, and bidirectional gender /
-- looking_for. Re-implementing it in TypeScript would create a second copy that
-- drifts — the picker would offer someone the reader could not open, or the
-- reader could open someone the picker never offers, and nothing would say so.
--
-- So the predicate moves into `public.profile_chart_visible(viewer, target)`,
-- which BOTH the RPC and the edge function now consult. One definition, one
-- place to change it.
--
-- THE ONE DELIBERATE WIDENING: EXISTING CONVERSATIONS
-- ---------------------------------------------------
-- Discovery preferences are mutable. Two people who matched and have been
-- talking for a month can fall out of each other's `looking_for` the moment
-- either edits their preferences — and the synastry screen is reachable from a
-- chat thread. Gating purely on discoverability would break the compatibility
-- view for established conversations, which is where the feature is most used.
-- So an existing `conversations` row is an independent, explicit authorisation,
-- exactly as the brief allows ("selon une relation explicitement autorisée").
-- A conversation is proof of prior mutual contact; it is created only by
-- `get_or_create_conversation`, and it is not something a stranger can conjure.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- -------------------------------
-- It does not touch RLS, does not grant anything new to `anon`, and does not
-- change what `get_synastry_candidate_profiles` returns for an entitled caller.
-- The only behavioural change for a paying account is that a target who is
-- neither discoverable nor in conversation is now refused — which was never a
-- reachable state through the UI.
--
-- IDEMPOTENT: CREATE OR REPLACE throughout, and the GRANT/REVOKE pairs are
-- restated rather than assumed.
--
-- NOT DEPLOYED BY THIS FILE. Nine migrations are unrecorded in the remote
-- history (docs/security-audit-2026-09-07.md, JUNO-15), so `supabase db push`
-- would replay data migrations. Apply statement by statement in the SQL editor,
-- then run the verification block at the bottom.

begin;

-- ---------------------------------------------------------------------------
-- 1) The predicate. One definition, two callers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profile_chart_visible(
  p_viewer_id UUID,
  p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viewer_gender      TEXT;
  v_viewer_looking_for TEXT[];
  v_default_looking_for CONSTANT TEXT[] := ARRAY['male','female','non-binary','other']::TEXT[];
  v_visible            BOOLEAN;
BEGIN
  IF p_viewer_id IS NULL OR p_target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Your own chart is your own data. The natal-chart surfaces carry their own
  -- `natal_chart` gate; this function is about OTHER people.
  IF p_viewer_id = p_target_id THEN
    RETURN TRUE;
  END IF;

  -- A block in EITHER direction ends the question before anything else is
  -- read. Checked first so a blocked pair cannot be distinguished from a
  -- non-existent profile by timing or by which branch ran.
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
     WHERE (b.blocker_id = p_viewer_id AND b.blocked_id = p_target_id)
        OR (b.blocker_id = p_target_id AND b.blocked_id = p_viewer_id)
  ) THEN
    RETURN FALSE;
  END IF;

  -- The target must be a real, live, finished profile. Same predicate as
  -- get_discoverable_profiles / get_synastry_candidate_profiles.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_target_id
       AND COALESCE(p.is_active, TRUE) = TRUE
       AND p.onboarding_completed = TRUE
       AND p.name IS NOT NULL
       AND p.name <> ''
  ) THEN
    RETURN FALSE;
  END IF;

  -- Path A — an existing conversation. Independent of current preferences,
  -- for the reason documented in the header.
  IF EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE (c.user_a = p_viewer_id AND c.user_b = p_target_id)
        OR (c.user_a = p_target_id AND c.user_b = p_viewer_id)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Path B — mutual discoverability, identical to the synastry picker.
  SELECT
    NULLIF(trim(p.gender), ''),
    CASE
      WHEN p.looking_for IS NULL OR cardinality(p.looking_for) = 0
        THEN v_default_looking_for
      ELSE p.looking_for
    END
  INTO v_viewer_gender, v_viewer_looking_for
  FROM public.profiles p
  WHERE p.id = p_viewer_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_target_id
       AND p.gender IS NOT NULL
       AND p.gender = ANY(v_viewer_looking_for)
       AND (
         v_viewer_gender IS NULL
         OR p.looking_for IS NULL
         OR cardinality(p.looking_for) = 0
         OR v_viewer_gender = ANY(p.looking_for)
       )
  ) INTO v_visible;

  RETURN COALESCE(v_visible, FALSE);
END;
$$;

COMMENT ON FUNCTION public.profile_chart_visible IS
  'May p_viewer_id read p_target_id''s astrological reading? Blocks in both directions, target active/onboarded/named, then EITHER an existing conversation OR mutual discoverability. Single source of truth shared by can_view_profile_chart (edge) and get_synastry_candidate_profiles (RPC) so the picker and the reader cannot drift. Added 2026-09-07 for JUNO-02.';

-- Internal helper: never client-callable. Clients go through the wrapper below,
-- which pins the viewer to auth.uid() instead of taking it as a parameter.
REVOKE EXECUTE ON FUNCTION public.profile_chart_visible(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) The client-facing wrapper. No viewer parameter, by design.
-- ---------------------------------------------------------------------------
-- `enforce_premium_feature` set the precedent on 2026-08-23: a function that
-- takes the user id as an argument is a function whose guard someone can forget
-- to write. The viewer here is `auth.uid()` and cannot be supplied.
CREATE OR REPLACE FUNCTION public.can_view_profile_chart(p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viewer UUID;
BEGIN
  v_viewer := auth.uid();
  -- service_role (auth.uid() IS NULL) gets no blanket yes here: this function
  -- exists to answer a question about a specific signed-in reader. A caller
  -- with no identity has no visibility.
  IF v_viewer IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.profile_chart_visible(v_viewer, p_target_id);
END;
$$;

COMMENT ON FUNCTION public.can_view_profile_chart IS
  'Client-facing visibility check for another profile''s chart. Viewer is auth.uid() and cannot be passed in. Returns FALSE for an unauthenticated caller, a blocked pair (either direction), an inactive/unfinished target, and a target who is neither in conversation with nor discoverable by the caller. Called by the get-profile-chart edge function with the CALLER''s JWT. Added 2026-09-07 for JUNO-02.';

REVOKE EXECUTE ON FUNCTION public.can_view_profile_chart(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_view_profile_chart(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) The synastry picker gets the premium check it never had.
-- ---------------------------------------------------------------------------
-- Same body as 20260513000001, with two changes and nothing else:
--   * a tier check, using the existing `synastry` policy row (celestial), via
--     `get_user_tier` — read-only, so it cannot consume a preview or a quota;
--   * the block/active/named/preference predicate delegated to
--     `profile_chart_visible`, so the picker and the reader answer the same
--     question. `p.id <> p_user_id` is now inside that function.
--
-- The swipe exclusion is still deliberately absent: synastry is a comparison
-- tool, not the Discover feed (see the original migration's header).
DROP FUNCTION IF EXISTS public.get_synastry_candidate_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_synastry_candidate_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  age                 INTEGER,
  sun_sign            TEXT,
  moon_sign           TEXT,
  rising_sign         TEXT,
  bio                 TEXT,
  image_url           TEXT,
  images              TEXT[],
  is_verified         BOOLEAN,
  relationship_intent TEXT,
  personal_values     TEXT[],
  interests           TEXT[],
  looking_for_text    TEXT,
  prompts             JSONB,
  icebreaker_question TEXT,
  last_active         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  -- Auth guard, unchanged: authenticated callers must act on their own id.
  -- service_role (auth.uid() IS NULL) keeps full access for crons/webhooks.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Premium gate (JUNO-02). Read-only: get_user_tier writes nothing and spends
  -- no free preview. Crons and service_role skip it.
  IF auth.uid() IS NOT NULL THEN
    v_tier := public.get_user_tier(p_user_id);
    IF NOT public.tier_at_least(
      v_tier,
      (SELECT pf.required_tier FROM public.premium_feature_policy pf
        WHERE pf.feature_key = 'synastry')
    ) THEN
      RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.age,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    COALESCE(p.image_url, p.photos[1]) AS image_url,
    p.images,
    COALESCE(p.is_verified, false) AS is_verified,
    p.relationship_intent,
    p.personal_values,
    p.interests,
    p.looking_for_text,
    p.prompts,
    p.icebreaker_question,
    p.last_active,
    p.created_at
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND public.profile_chart_visible(p_user_id, p.id)
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_synastry_candidate_profiles IS
  'Synastry candidate picker. Auth-guarded (caller must pass their own auth.uid()), premium-gated on the `synastry` policy row since 2026-09-07 (JUNO-02), and filtered by public.profile_chart_visible — the same predicate the get-profile-chart edge function consults, so the picker can never offer a profile the reader is refused. Does NOT exclude already-swiped profiles: synastry is a comparison tool, not the Discover feed.';

commit;

-- =============================================================================
-- AFTER APPLYING
-- =============================================================================
--
-- VERIFICATION. Do NOT retype the queries from a comment. Open the file below,
-- select all, paste, run. It is pure runnable SQL, read-only, and it covers
-- this migration and 20260907000002 together:
--
--     supabase/tests/verify_20260907_remediation.sql
--
-- Every row it returns must show ok = true, and the last row is a VERDICT.
--
-- The reason it is a file rather than a comment block: this section used to
-- carry the queries inline, prefixed with `--`. Stripping those prefixes to run
-- them also stripped them from the PROSE in between, and PostgreSQL answered
-- `ERROR: 42P01: relation "another" does not exist` — the word came out of an
-- English sentence. A check you cannot paste is a check that gets skipped.
--
-- BEHAVIOURAL CHECK. Query 3 of the same file, run after this migration. It
-- finds its own fixtures — a blocked pair, an existing conversation, an
-- inactive profile — and asserts what the predicate answers for each, in both
-- directions. Nothing to replace before running it.
--
-- It is a query rather than a template here for a reason worth keeping: this
-- section used to carry `public.profile_chart_visible('<viewer-uuid>', …)`, and
-- pasted as written it answered `ERROR: 22P02: invalid input syntax for type
-- uuid: "<viewer-uuid>"`. A check you must edit before running is a check you
-- run wrong.
--
-- The picker is the one thing the file cannot exercise: it returns rows for an
-- entitled account and raises `premium_required` for a free one, which needs a
-- caller identity. Exercise it through PostgREST as each, or with
-- `SET LOCAL request.jwt.claims`.
--
-- ROLLBACK, restoring the pre-2026-09-07 behaviour exactly:
--   1. re-run supabase/migrations/20260513000001_add_synastry_candidate_profiles_rpc.sql
--   2. DROP FUNCTION IF EXISTS public.can_view_profile_chart(UUID);
--   3. DROP FUNCTION IF EXISTS public.profile_chart_visible(UUID, UUID);
-- The edge function must be rolled back in the SAME window. It fails closed
-- without these, so leaving it deployed against a rolled-back database answers
-- 503 `visibility_unavailable` to everyone rather than serving anything.
