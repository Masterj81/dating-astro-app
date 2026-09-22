import { supabase } from './supabase';
import { rpcWithTimeout } from '../utils/rpcWithTimeout';

// Feature keys for premium features.
// Conversation-first product change: `likes` and `priority-messages`
// were removed — the web/app no longer surfaces a "who liked you" feed
// (no real backend signal) and messaging is free for all users.
//
// Daily Horoscope was moved from Premium Plus (Cosmic) → Premium
// (Celestial). It's a personal + daily astrology feature, not a
// high-end exclusive. Cosmic still has access by downward inclusion
// (see canAccessFeature in PremiumContext).
export type FeatureKey =
  // Premium tier features (Celestial)
  | 'synastry'
  | 'natal-chart'
  | 'daily-horoscope'
  // Premium Plus tier features (Cosmic)
  | 'monthly-horoscope'
  | 'planetary-transits'
  | 'retrograde-alerts'
  | 'lucky-days'
  | 'date-planner'
  // Tarot
  | 'weekly-tarot'
  | 'monthly-tarot'
  // Conversation Guide. Premium (Celestial) tier, but note the screen is NOT
  // wrapped in PremiumGate: its free situation is readable by anyone and the
  // locked ones spend the server's daily preview only on an explicit tap.
  // See apps/mobile/app/premium-screens/conversation-guide.tsx.
  | 'conversation-guide';

// Mapping of features to their required tier
export const FEATURE_TIERS: Record<FeatureKey, 'premium' | 'premium_plus'> = {
  // Premium tier features (Celestial)
  'synastry': 'premium',
  'natal-chart': 'premium',
  'daily-horoscope': 'premium',
  // Premium Plus tier features (Cosmic)
  'monthly-horoscope': 'premium_plus',
  'planetary-transits': 'premium_plus',
  'retrograde-alerts': 'premium_plus',
  'lucky-days': 'premium_plus',
  'date-planner': 'premium_plus',
  // Tarot
  'weekly-tarot': 'premium_plus',
  'monthly-tarot': 'premium',
  // Conversation Guide
  'conversation-guide': 'premium',
};

// Features whose access decision belongs to the server.
//
// Maps the client `FeatureKey` (hyphenated, used by routing and UI) to the
// canonical `premium_feature_policy.feature_key` (underscored). For these
// features `PremiumGate` calls `enforce_premium_feature` and renders exactly
// what the server decides — entitlement, free daily preview and quota all
// resolve in one atomic call.
//
// JUNO-06 (2026-09-22): the map is now EXHAUSTIVE — all 11 features resolve
// through the server. What makes each migration honest, per feature:
//
//   synastry            — the reading was already server-owned (edge
//                         get-profile-chart + synastry_preview_gate +
//                         claim_synastry_free_grant, JUNO-01/preview work);
//                         this row routes the ENTRY screen through the same
//                         authority. Its policy preview stays NULL on
//                         purpose: the free synastry preview is a per-TARGET
//                         contract that lives in synastry_free_grant, not in
//                         premium_usage (20260915000001, « POURQUOI UNE TABLE
//                         DÉDIÉE »).
//   daily/monthly_horoscope, lucky_days, date_planner — deterministic local
//                         labels computed from the user's own sun sign
//                         (category B): the compute stays client-side, the
//                         ACCESS became a short, verifiable server
//                         authorization (1 free preview/day preserved).
//   planetary_transits, retrograde_alerts — static bundled consts (category
//                         C): the gate protects ACCESS; the bytes are public
//                         inert facts and the runbook says so.
//   weekly/monthly-tarot — the bundled shared engine produces a full reading
//                         locally (proven by premium-bypass.test.ts); same
//                         category-B answer, keys tarot_cosmic/tarot_monthly
//                         from 20260511000002.
//
// The legacy client-side trial path (hasTrialRemaining +
// increment_feature_usage called as an AUTHORIZATION) is deleted: increment
// counts, it never decided. PremiumContext keeps a device tier for UX
// optimism on the SUBSCRIPTION state only — it can no longer open a gate.
//
// `conversation-guide` is server-enforced WITHOUT going through PremiumGate.
// Its screen calls `enforcePremiumFeature` itself, on the first tap of a
// locked situation — never at mount, because mounting must stay free (the
// screen's free situation is the habit surface and has to survive an exhausted
// preview). That also makes `premium_usage` the feature's only telemetry: the
// app ships no analytics SDK, so those rows are how opens, next-day return and
// preview→subscribe conversion get measured. See
// docs/conversation-coach-feature-plan-2026-08.md §11.2.
export const SERVER_ENFORCED_FEATURES: Record<FeatureKey, string> = {
  'natal-chart': 'natal_chart',
  'conversation-guide': 'conversation_guide',
  'synastry': 'synastry',
  'daily-horoscope': 'daily_horoscope',
  'monthly-horoscope': 'monthly_horoscope',
  'lucky-days': 'lucky_days',
  'date-planner': 'date_planner',
  'planetary-transits': 'planetary_transits',
  'retrograde-alerts': 'retrograde_alerts',
  'weekly-tarot': 'tarot_cosmic',
  'monthly-tarot': 'tarot_monthly',
};

// Reason codes returned by `enforce_premium_feature`, plus 'error' for a
// call that never reached the server.
export type PremiumGateReason =
  | 'ok'
  | 'free_preview'
  | 'insufficient_tier'
  | 'free_preview_exhausted'
  | 'quota_exceeded'
  | 'unauthorized'
  | 'unknown_feature'
  | 'error';

export type PremiumGateDecision = {
  allowed: boolean;
  reason: PremiumGateReason;
  currentCount: number;
  // True when access was granted by spending a free daily preview rather
  // than by an entitlement — the UI shows the "1 free preview per day"
  // banner in that case.
  isFreePreview: boolean;
};

// Ask the server whether this account may use a feature right now.
// The RPC is atomic: it decides AND records the usage, so a caller can never
// consume an allowance the server was about to refuse.
export async function enforcePremiumFeature(
  serverFeatureKey: string
): Promise<PremiumGateDecision> {
  try {
    const { data, error } = await rpcWithTimeout(() =>
      supabase
        .rpc('enforce_premium_feature', { p_feature_key: serverFeatureKey })
        .maybeSingle<{
          allowed: boolean;
          reason: string | null;
          current_count: number | null;
        }>()
    );

    if (error || !data) {
      return { allowed: false, reason: 'error', currentCount: 0, isFreePreview: false };
    }

    const reason = (data.reason ?? 'error') as PremiumGateReason;
    return {
      allowed: data.allowed === true,
      reason,
      currentCount: data.current_count ?? 0,
      isFreePreview: reason === 'free_preview',
    };
  } catch {
    return { allowed: false, reason: 'error', currentCount: 0, isFreePreview: false };
  }
}

// JUNO-06: the legacy client-side trial helpers are GONE on purpose.
//
// getFeatureUsageToday / incrementFeatureUsage / hasTrialRemaining /
// getTodayUsage implemented the client-counted trial: the client read its own
// usage row and incremented it as an AUTHORIZATION (premium-bypass.test.ts
// documents the before-proof). Their remaining legitimate uses:
//   * reading today's usage for UX counters -> can_use_premium_feature
//     returns `remaining` server-side; use that;
//   * telemetry -> premium_usage is written by enforce_premium_feature
//     itself; no client write path exists (20260823000001 revoked them).
// increment_feature_usage (the RPC) survives for the conversation-guide
// telemetry path and any server-side caller; no mobile code calls it as an
// authorization anymore.
