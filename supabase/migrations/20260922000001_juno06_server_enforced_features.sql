-- =============================================================================
-- JUNO-06 — Server-side enforcement of the nine remaining premium features
-- (2026-09-22). NOT APPLIED: local remediation mission; production applies
-- migrations through its own reviewed process.
--
-- BEFORE (reproduced by apps/mobile/src/__tests__/premium-bypass.test.ts):
--   9 of 11 features were authorized by the phone — a local RevenueCat
--   entitlement PremiumContext trusts over the server, plus a client-counted
--   trial (increment_feature_usage counts, it never decides).
--
-- AFTER: every feature key below resolves through enforce_premium_feature,
--   the single atomic server decision (entitlement + free preview + quota +
--   replay window, 20260823000001). The client maps its FeatureKey to these
--   keys in SERVER_ENFORCED_FEATURES and displays the verdict.
--
-- KEYS, TIERS, QUOTAS — and where each comes from
--   * synastry           celestial  quota NULL   — the reading itself is
--     already server-gated (get-profile-chart + synastry_preview_gate +
--     claim_synastry_free_grant, migrations 20260915000001/02 and
--     20260916000001). This row makes the MOBILE entry screen ask the server
--     too; free_preview_quota stays NULL because the synastry preview is a
--     different, per-target contract that must NOT live in premium_usage
--     (documented in 20260915000001 § POURQUOI UNE TABLE DÉDIÉE).
--   * daily_horoscope    celestial  preview 1/day — the mobile screen renders
--     deterministic local labels from the user's own sun sign (category B:
--     short, verifiable server authorization before the compute). 1/day is
--     the promise every other preview surface already makes.
--   * monthly_horoscope  cosmic     preview 1/day — same shape, Cosmic tier.
--   * lucky_days         cosmic     preview 1/day — same.
--   * date_planner       cosmic     preview 1/day — WEB ALREADY ENFORCES
--     'date_planner' (DatePlannerOverview.tsx); this row existed since
--     20260419000006 with quota 10 and no preview. The preview column makes
--     the mobile gate preserve the legacy free trial instead of removing it
--     (validate-premium-gating refuses a server-enforced feature with no
--     free_preview_quota — that guard is the product promise's guard).
--   * planetary_transits cosmic     preview 1/day — content is a static
--     bundled const (category C): the gate protects ACCESS honestly, not the
--     inert bytes; documented in the runbook.
--   * retrograde_alerts  cosmic     preview 1/day — same as transits.
--   * tarot_monthly      (exists since 20260511000002, celestial, no preview)
--     → gains preview 1/day.
--   * tarot_cosmic       (exists since 20260511000002, cosmic, quota 10)
--     → gains preview 1/day.
--
-- WHY 1/DAY EVERYWHERE: the legacy client path granted exactly one free view
-- per feature per day (PremiumContext.consumeTrial, `currentUsage >= 1`).
-- Server-enforcing these features without a preview quota would silently
-- DELETE the free trial — the exact regression class validate-premium-gating
-- was written to refuse.
--
-- CLEANUP: the 20260419000006 seeds that no code path references anymore
-- (removed features and never-enforced aliases) are deleted so the policy
-- table reads as the real catalog: compatibility_details, priority_messages,
-- super_likes was already deleted by 20260429000001, likes_you_see_who. The
-- legacy 'tarot' defensive alias is KEPT (old installed clients still call
-- it; deleting it would turn their gate into unknown_feature).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) The rows that do not exist yet
--    (INSERT for existence; the preview quota is stated again as literal
--    targeted UPDATEs in section 2 — validate-premium-gating reads migration
--    TEXT and attributes quotas from per-key UPDATE statements, the same
--    convention as 20260828000001. Grouped VALUES carry the value at runtime
--    but the text scan cannot attribute it per key.)
-- -----------------------------------------------------------------------------
INSERT INTO public.premium_feature_policy
  (feature_key, required_tier, daily_quota, free_preview_quota)
VALUES
  ('synastry',           'celestial', NULL, NULL),
  ('daily_horoscope',    'celestial', NULL, 1),
  ('monthly_horoscope',  'cosmic',    NULL, 1),
  ('lucky_days',         'cosmic',    NULL, 1),
  ('planetary_transits', 'cosmic',    NULL, 1),
  ('retrograde_alerts',  'cosmic',    NULL, 1)
ON CONFLICT (feature_key) DO UPDATE
  SET required_tier      = EXCLUDED.required_tier,
      daily_quota        = EXCLUDED.daily_quota,
      free_preview_quota = EXCLUDED.free_preview_quota,
      updated_at         = NOW();

-- -----------------------------------------------------------------------------
-- 2) Literal per-key quota statements (the validator's attribution contract)
-- -----------------------------------------------------------------------------
UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'daily_horoscope';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'monthly_horoscope';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'lucky_days';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'planetary_transits';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'retrograde_alerts';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'date_planner';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'tarot_monthly';

UPDATE public.premium_feature_policy
   SET free_preview_quota = 1, updated_at = NOW()
 WHERE feature_key = 'tarot_cosmic';

-- -----------------------------------------------------------------------------
-- 3) Dead seeds from 20260419000006 that no client path references
-- -----------------------------------------------------------------------------
DELETE FROM public.premium_feature_policy
 WHERE feature_key IN ('compatibility_details', 'priority_messages', 'likes_you_see_who');

-- -----------------------------------------------------------------------------
-- 4) Self-verification (a migration that changes privileges must prove itself
--    — same house rule as 20260903000003). Asserts the CATALOG this change
--    claims to produce, refusing to commit anything else.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_expected TEXT[] := ARRAY[
    'natal_chart', 'conversation_guide', 'synastry',
    'daily_horoscope', 'monthly_horoscope', 'lucky_days',
    'planetary_transits', 'retrograde_alerts',
    'date_planner', 'tarot_monthly', 'tarot_cosmic', 'tarot'
  ];
  v_missing TEXT;
  v_bad RECORD;
BEGIN
  SELECT ARRAY(SELECT f FROM unnest(v_expected) f) AS keys;

  SELECT f INTO v_missing
    FROM unnest(v_expected) AS f
   WHERE NOT EXISTS (
     SELECT 1 FROM public.premium_feature_policy p WHERE p.feature_key = f
   )
   LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'JUNO-06 self-check: policy row missing: %', v_missing;
  END IF;

  FOR v_bad IN
    SELECT feature_key, required_tier, free_preview_quota
      FROM public.premium_feature_policy
     WHERE feature_key IN ('daily_horoscope','monthly_horoscope','lucky_days',
                           'planetary_transits','retrograde_alerts',
                           'date_planner','tarot_monthly','tarot_cosmic')
  LOOP
    IF v_bad.free_preview_quota IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'JUNO-06 self-check: % must keep a 1/day free preview, got %',
        v_bad.feature_key, v_bad.free_preview_quota;
    END IF;
  END LOOP;

  FOR v_bad IN
    SELECT feature_key, required_tier
      FROM public.premium_feature_policy
     WHERE feature_key IN ('monthly_horoscope','lucky_days',
                           'planetary_transits','retrograde_alerts',
                           'date_planner','tarot_cosmic')
  LOOP
    IF v_bad.required_tier NOT IN ('cosmic', 'premium_plus') THEN
      RAISE EXCEPTION 'JUNO-06 self-check: % must stay cosmic, got %',
        v_bad.feature_key, v_bad.required_tier;
    END IF;
  END LOOP;

  FOR v_bad IN
    SELECT feature_key, free_preview_quota
      FROM public.premium_feature_policy
     WHERE feature_key = 'synastry'
  LOOP
    IF v_bad.free_preview_quota IS NOT NULL THEN
      RAISE EXCEPTION 'JUNO-06 self-check: synastry must keep NULL preview (per-target contract lives in synastry_free_grant)';
    END IF;
  END LOOP;
END;
$$;

commit;
