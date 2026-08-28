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
  | 'monthly-tarot';

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
};

// Features whose access decision belongs to the server.
//
// Maps the client `FeatureKey` (hyphenated, used by routing and UI) to the
// canonical `premium_feature_policy.feature_key` (underscored). For these
// features `PremiumGate` calls `enforce_premium_feature` and renders exactly
// what the server decides — entitlement, free daily preview and quota all
// resolve in one atomic call.
//
// This is what fixes the free preview bug: the client used to grant and
// record a preview under 'natal-chart' while the server judged 'natal_chart'
// with no notion of previews, so a free user burned their allowance and got
// the paywall anyway.
//
// Features absent from this map keep the legacy client-side trial path. To
// migrate one, give it a `free_preview_quota` in `premium_feature_policy`
// (see migration 20260823000001) and add it here.
export const SERVER_ENFORCED_FEATURES: Partial<Record<FeatureKey, string>> = {
  'natal-chart': 'natal_chart',
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

// Check if a feature has been used today
export async function getFeatureUsageToday(
  userId: string,
  featureKey: FeatureKey
): Promise<number> {
  try {
    // Guard: RLS should enforce this, but verify on the client too
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) return 0;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const { data, error } = await supabase
      .from('premium_usage')
      .select('view_count')
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .eq('usage_date', today)
      .maybeSingle();

    if (error) {
      return 0;
    }

    return data?.view_count || 0;
  } catch (error) {
    return 0;
  }
}

// Increment feature usage (called when user views content)
export async function incrementFeatureUsage(
  userId: string,
  featureKey: FeatureKey
): Promise<{ success: boolean; viewCount: number }> {
  try {
    // Guard: the RPC is SECURITY DEFINER and accepts any user_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return { success: false, viewCount: 0 };
    }

    // The RPC is the only write path. Migration 20260823000001 revoked
    // INSERT/UPDATE/DELETE on `premium_usage` from `authenticated`, because a
    // quota the billed account can rewrite is not a quota. The previous
    // direct-upsert fallback would now fail silently, so it is gone.
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('increment_feature_usage', {
        p_user_id: userId,
        p_feature_key: featureKey,
      });

    if (rpcError || rpcData === null) {
      return { success: false, viewCount: 0 };
    }

    return { success: true, viewCount: rpcData };
  } catch (error) {
    return { success: false, viewCount: 0 };
  }
}

// Check if user has trial remaining (1 free view per feature per day)
export async function hasTrialRemaining(
  userId: string,
  featureKey: FeatureKey
): Promise<boolean> {
  const usageCount = await getFeatureUsageToday(userId, featureKey);
  return usageCount < 1; // 1 free view per day
}

// Get all usage for today (for debugging/analytics)
export async function getTodayUsage(
  userId: string
): Promise<Record<FeatureKey, number>> {
  try {
    // Guard: only allow querying own usage
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) return {} as Record<FeatureKey, number>;

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('premium_usage')
      .select('feature_key, view_count')
      .eq('user_id', userId)
      .eq('usage_date', today);

    if (error) {
      return {} as Record<FeatureKey, number>;
    }

    const usage: Record<string, number> = {};
    data?.forEach((row) => {
      usage[row.feature_key] = row.view_count;
    });

    return usage as Record<FeatureKey, number>;
  } catch (error) {
    return {} as Record<FeatureKey, number>;
  }
}
