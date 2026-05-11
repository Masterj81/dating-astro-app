-- Remove daily quota on natal_chart.
--
-- The natal chart is a static premium feature: same chart every page load.
-- The original seed in 20260419000006_premium_server_gating.sql set a
-- daily_quota of 5, which meant a Celestial or Cosmic subscriber could
-- hit "daily limit reached" simply by refreshing the page or navigating
-- back and forth between the natal chart and other tabs. That isn't the
-- desired behaviour — the gate should be tier-based, not consumption-
-- based.
--
-- Setting daily_quota to NULL keeps the tier check intact (`celestial`
-- or higher required) but skips the per-day usage cap. The
-- enforce_premium_feature RPC's quota branch (line 180 of the seed
-- migration) only fires when daily_quota IS NOT NULL, so NULL = unlimited
-- with no code change required on the RPC side or in the UI.
--
-- Future change of mind is easy: a follow-up migration can reinstate a
-- numeric quota. The quota_exceeded handling in NatalChartOverview and
-- the mobile natal-chart screen stays in place defensively.

begin;

UPDATE public.premium_feature_policy
   SET daily_quota = NULL,
       updated_at  = NOW()
 WHERE feature_key = 'natal_chart';

commit;
