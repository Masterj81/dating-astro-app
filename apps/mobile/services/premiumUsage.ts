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
// features the gate (PremiumGate, or the screen itself where double-gating
// would spend a second decision) calls `enforce_premium_feature` and renders
// exactly what the server decides — entitlement, free daily preview and
// quota all resolve in one atomic call.
//
// JUNO-06, REVISED 2026-09-23 (operator reprise): the map is exhaustive —
// all 11 features resolve through the server — but "resolves through the
// server" is TWO different claims, and the honest split is recorded per
// feature in ENFORCEMENT_CLASSES below and in the policy table's
// enforcement_class column (20260922000001):
//
//   * server_enforced_data (2/11) — weekly/monthly-tarot: the reading is
//     drawn by the premium-tarot-reading edge from the shared engine; no
//     mobile file imports '@astro/shared/tarot' anymore. A patched APK has
//     nothing to produce the result with.
//   * server_metered_ui (7/11) — natal-chart, synastry,
//     conversation-guide, daily/monthly-horoscope, lucky-days, date-planner:
//     the server decides and records the spend, but the compute or corpus
//     ships in the binary (own birth_chart + bundled astrology engine;
//     synastry local fallback; the ~35 KB coach corpus; local seeded
//     horoscope labels; the WINDOWS const; local planner arrays). A patched
//     APK can produce these.
//   * public_content (2/11) — planetary-transits, retrograde-alerts:
//     static THEMES consts; the gate is presentation-level.
//
// The legacy client-side trial path (hasTrialRemaining +
// increment_feature_usage called as an AUTHORIZATION) is deleted: increment
// counts, it never decided. The local-entitlement smoothing is deleted too
// (2026-09-23): after a server refusal the phone may OFFER to synchronize
// (syncEntitlement → server verifies with its own RevenueCat credentials →
// re-ask enforce), never grant.
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

// ---------------------------------------------------------------------------
// JUNO-06 — the honest classes. These mirror
// premium_feature_policy.enforcement_class (migration 20260922000001) and are
// the vocabulary every validator and the runbook share:
//
//   server_enforced_data — the premium RESULT is produced by the server after
//     authorization; the engine/corpus is absent from this bundle. A patched
//     APK cannot produce the result AT ALL.
//   server_metered_ui    — the ACCESS decision is a real server decision
//     (entitlement + preview + quota, spent server-side), but the result
//     remains computable or bundled offline: a patched APK CAN produce it.
//     Honest metering, not extraction protection.
//   public_content       — static public bytes in every APK; the gate is
//     presentation-level and a patched client is indistinguishable from a
//     paying one.
//
// The honest headline follows from this map: 2/11 server-enforced,
// 7/11 metered-but-circumventable, 2/11 public. Never report "11/11
// server-enforced" while any engine or corpus remains in the bundle —
// validate-premium-data-sources fails the build on exactly that lie.
// ---------------------------------------------------------------------------
export type EnforcementClass =
  | 'server_enforced_data'
  | 'server_metered_ui'
  | 'public_content';

export const ENFORCEMENT_CLASSES: Record<FeatureKey, EnforcementClass> = {
  // The reading is drawn by the premium-tarot-reading edge; neither the
  // engine nor the corpus is imported anywhere under apps/mobile.
  'weekly-tarot': 'server_enforced_data',
  'monthly-tarot': 'server_enforced_data',
  // Real server metering (enforce in PremiumGate / the screen itself), but
  // the premium compute or corpus ships in the binary:
  'natal-chart': 'server_metered_ui',
  'synastry': 'server_metered_ui',
  'conversation-guide': 'server_metered_ui',
  'daily-horoscope': 'server_metered_ui',
  'monthly-horoscope': 'server_metered_ui',
  'lucky-days': 'server_metered_ui',
  'date-planner': 'server_metered_ui',
  // Static THEMES consts; V2 removed the ephemeris from both screens. The
  // gate stays for the honest majority; the class says it is not a boundary.
  'planetary-transits': 'public_content',
  'retrograde-alerts': 'public_content',
};

export const ENFORCEMENT_CLASS_COUNTS: Record<EnforcementClass, number> = {
  server_enforced_data: 2,
  server_metered_ui: 7,
  public_content: 2,
};

// Reason codes returned by `enforce_premium_feature`, plus client-side
// composites: 'error' for a call that never reached the server, and
// 'sync_available' for the JUNO-06 state below.
export type PremiumGateReason =
  | 'ok'
  | 'free_preview'
  | 'insufficient_tier'
  | 'free_preview_exhausted'
  | 'quota_exceeded'
  | 'unauthorized'
  | 'unknown_feature'
  | 'error'
  // Client-side composite (never returned by the server): the server refused
  // or was unreachable WHILE the device's RevenueCat entitlement claims a
  // paid tier. JUNO-06 ruling: in that state the phone may OFFER to
  // synchronize — never grant. The UI shows "confirm my subscription",
  // which asks the server to verify with its own credentials; only the
  // enforce call that follows a successful sync can grant.
  | 'sync_available';

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

// ---------------------------------------------------------------------------
// JUNO-06 — entitlement synchronization (the operator's 5-step flow).
//
//   1. the client ASKS the server to verify its entitlement;
//   2. the server verifies with ITS OWN RevenueCat credentials (the SDK key
//      on the device proves nothing and never leaves it);
//   3. the server writes the verified tier into `subscriptions` (bounded,
//      throttled, audited by the edge);
//   4. the client re-asks `enforce_premium_feature`;
//   5. only the NEW server verdict grants.
//
// This function is step 1. It never grants anything itself and its return
// value is never an authorization — it is the tier the SERVER verified,
// useful for display. The gate that follows is always enforce.
// ---------------------------------------------------------------------------

export type EntitlementSync =
  | { ok: true; tier: 'free' | 'premium' | 'premium_plus' }
  | {
      ok: false;
      code:
        | 'unauthenticated'
        | 'rate_limited'
        | 'revenuecat_unavailable'
        | 'config_error'
        | 'network'
        | 'server';
    };

export async function syncEntitlement(): Promise<EntitlementSync> {
  try {
    const { data, error } = await supabase.functions.invoke('sync-entitlement', {
      body: {},
    });

    if (error) {
      return { ok: false, code: 'network' };
    }

    const outcome = data as
      | { synced: boolean; tier?: string; reason?: string }
      | null;

    if (!outcome) {
      return { ok: false, code: 'server' };
    }

    if (outcome.synced) {
      const tier = outcome.tier;
      if (tier === 'premium' || tier === 'premium_plus' || tier === 'free') {
        return { ok: true, tier };
      }
      return { ok: false, code: 'server' };
    }

    switch (outcome.reason) {
      case 'unauthenticated':
        return { ok: false, code: 'unauthenticated' };
      case 'rate_limited':
        return { ok: false, code: 'rate_limited' };
      case 'revenuecat_unavailable':
        return { ok: false, code: 'revenuecat_unavailable' };
      case 'config_error':
        return { ok: false, code: 'config_error' };
      case 'state_unavailable':
        // The server could not claim/write the sync slot: fail-closed there,
        // fail-closed here. The server's last word stands.
        return { ok: false, code: 'server' };
      default:
        return { ok: false, code: 'server' };
    }
  } catch {
    return { ok: false, code: 'network' };
  }
}
