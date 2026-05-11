-- Split tarot premium feature into two policy keys (Celestial + Cosmic).
--
-- BEFORE this migration:
--   The policy table held a single ('tarot', 'cosmic', 10) row. The product
--   actually exposes two tarot surfaces — a monthly 3-card reading for
--   Celestial subscribers and a weekly 4-card reading for Cosmic subscribers.
--   Calling enforce_premium_feature('tarot') for a Celestial user therefore
--   returned 'insufficient_tier' and would have broken their reading. The web
--   component (TarotReadingOverview.tsx) worked around this by skipping the
--   RPC for Celestial entirely (commit 883c800) — server-side gating only
--   applied to Cosmic. That bypass is what this migration retires.
--
-- AFTER this migration:
--   - 'tarot_monthly' → required_tier = 'celestial', daily_quota = NULL
--       Celestial subscribers see the same monthly reading on every page load;
--       a daily quota would punish navigation, so we leave it unlimited (same
--       reasoning as natal_chart in 20260511000001).
--   - 'tarot_cosmic'  → required_tier = 'cosmic',    daily_quota = 10
--       Mirrors the legacy 'tarot' policy values so Cosmic enforcement is
--       unchanged in practice.
--
-- The legacy 'tarot' row is kept (no DELETE) so any older client still
-- shipping that key fails closed at 'cosmic' tier rather than crashing on
-- 'unknown_feature'. New web code uses the split keys; mobile uses 'tarot'
-- only as a route name, not as an RPC key, so no mobile change is required.

begin;

INSERT INTO public.premium_feature_policy (feature_key, required_tier, daily_quota)
VALUES
  ('tarot_monthly', 'celestial', NULL),
  ('tarot_cosmic',  'cosmic',    10)
ON CONFLICT (feature_key) DO UPDATE
  SET required_tier = EXCLUDED.required_tier,
      daily_quota   = EXCLUDED.daily_quota,
      updated_at    = NOW();

-- Keep the legacy 'tarot' key as a defensive alias pinned to cosmic, so old
-- clients calling enforce_premium_feature('tarot') still get a coherent
-- 'insufficient_tier' / 'quota_exceeded' answer rather than 'unknown_feature'.
-- A future migration may DROP this row once no client references it.
UPDATE public.premium_feature_policy
   SET required_tier = 'cosmic',
       daily_quota   = 10,
       updated_at    = NOW()
 WHERE feature_key = 'tarot';

commit;
