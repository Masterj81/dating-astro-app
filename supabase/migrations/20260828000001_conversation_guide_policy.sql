-- Conversation Guide — server-side gating policy.
--
-- WHAT THIS FEATURE IS
-- --------------------
-- A static, editorially written communication guide: pick a zodiac sign and a
-- situation (start a conversation, ask for clarity, repair a misunderstanding,
-- set a boundary) and get a short reflection card with one sentence you can
-- edit and send. Nothing is generated at runtime and no outcome is promised.
-- Product/technical plan: docs/conversation-coach-feature-plan-2026-08.md
--
-- WHY THE POLICY LOOKS LIKE THIS
-- ------------------------------
-- required_tier = 'celestial'
--   The locked situations are a Celestial benefit. Note the tier vocabulary:
--   this table speaks 'free' / 'celestial' / 'cosmic', while the client speaks
--   'free' / 'premium' / 'premium_plus'. `tier_at_least` bridges them.
--
-- free_preview_quota = 1
--   The paywall promise the app already makes ("1 free preview per day"), now
--   extended to this feature. It is also REQUIRED for correctness, not
--   optional: scripts/validate-premium-gating.mjs fails the build if a feature
--   listed in SERVER_ENFORCED_FEATURES has no free preview quota — routing a
--   feature through the server gate without one silently deletes the daily
--   sample that the client used to grant.
--
-- daily_quota = 100
--   Generous but bounded for entitled accounts, in line with
--   priority_messages (100) and daily_horoscope (50). The Conversation Guide
--   is meant to be opened repeatedly; a tight quota would punish exactly the
--   behaviour the feature exists to create.
--
-- WHAT THIS POLICY DOES **NOT** GATE
-- ---------------------------------
-- The free situation ("Start a conversation", 12 signs, unlimited) never
-- reaches this policy at all. The screen calls `enforce_premium_feature` only
-- on the first tap of a LOCKED situation — never at mount. That is deliberate:
-- deciding at mount would spend the reader's daily preview before they had
-- read anything, and would then hide the free situation for the rest of the
-- day. See apps/mobile/app/premium-screens/conversation-guide.tsx.
--
-- OPERATIONAL LEVER
-- -----------------
-- Widening the free preview for a campaign needs no app build (there is no OTA
-- on this project — every client change waits for a Play review):
--
--   UPDATE public.premium_feature_policy
--      SET free_preview_quota = 3, updated_at = NOW()
--    WHERE feature_key = 'conversation_guide';
--
-- Set it back to 1 to end the campaign.

begin;

INSERT INTO public.premium_feature_policy
  (feature_key, required_tier, daily_quota, free_preview_quota)
VALUES
  ('conversation_guide', 'celestial', 100, 1)
ON CONFLICT (feature_key) DO UPDATE
  SET required_tier      = EXCLUDED.required_tier,
      daily_quota        = EXCLUDED.daily_quota,
      free_preview_quota = EXCLUDED.free_preview_quota,
      updated_at         = NOW();

-- Stated again as a literal UPDATE, on purpose. `ON CONFLICT ... EXCLUDED`
-- carries the value at runtime but not in the text, and
-- scripts/validate-premium-gating.mjs reads migration TEXT to prove that every
-- server-enforced feature really was given a preview quota. Without this
-- statement the guard cannot see the quota and fails the build — which is the
-- guard working, not a false positive.
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1,
       updated_at         = NOW()
 WHERE feature_key = 'conversation_guide';

commit;
