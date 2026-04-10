import { supabase } from './supabase';
import { debugLog } from '../utils/debug';

export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';
export type SubscriptionSource = 'stripe' | 'app_store' | 'play_store';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';

export interface EffectiveSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  expiresAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionState {
  tier: SubscriptionTier;
  subscription: EffectiveSubscription | null;
}

function isTier(value: unknown): value is SubscriptionTier {
  return value === 'free' || value === 'premium' || value === 'premium_plus';
}

function isSource(value: unknown): value is SubscriptionSource {
  return value === 'stripe' || value === 'app_store' || value === 'play_store';
}

function isStatus(value: unknown): value is SubscriptionStatus {
  return (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'expired'
  );
}

/**
 * Returns the effective subscription tier across all providers.
 *
 * Security note: the RPC `get_user_tier` is SECURITY DEFINER and accepts any
 * p_user_id.  We enforce on the client that you can only query your own tier.
 * A matching server-side guard (WHERE p_user_id = auth.uid()) should be added
 * to the SQL function for defence-in-depth — see SECURITY_TODO below.
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  try {
    // Guard: only allow querying current user's tier
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      debugLog('[SubscriptionService] getUserTier: userId does not match authenticated user');
      return 'free';
    }

    const { data, error } = await supabase.rpc('get_user_tier', {
      p_user_id: userId,
    });

    if (error) {
      debugLog('[SubscriptionService] get_user_tier error:', error);
      return 'free';
    }

    return isTier(data) ? data : 'free';
  } catch (err) {
    debugLog('[SubscriptionService] getUserTier exception:', err);
    return 'free';
  }
}

/**
 * Returns the best active subscription with metadata.
 */
export async function getEffectiveSubscription(
  userId: string
): Promise<EffectiveSubscription | null> {
  try {
    // Guard: only allow querying current user's subscription
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      debugLog('[SubscriptionService] getEffectiveSubscription: userId mismatch');
      return null;
    }

    const { data, error } = await supabase.rpc('get_effective_subscription', {
      p_user_id: userId,
    });

    if (error) {
      debugLog('[SubscriptionService] get_effective_subscription error:', error);
      return null;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!isTier(row?.tier) || !isSource(row?.source) || !isStatus(row?.status)) {
      debugLog('[SubscriptionService] Invalid effective subscription payload:', row);
      return null;
    }

    return {
      tier: row.tier,
      status: row.status,
      source: row.source,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    };
  } catch (err) {
    debugLog('[SubscriptionService] getEffectiveSubscription exception:', err);
    return null;
  }
}

/**
 * Convenience wrapper for app state usage.
 */
export async function getSubscriptionState(userId: string): Promise<SubscriptionState> {
  const subscription = await getEffectiveSubscription(userId);

  return {
    tier: subscription?.tier ?? 'free',
    subscription,
  };
}

/**
 * Optional: fetch all subscriptions across providers.
 * Useful for support/admin UI or advanced subscription management.
 */
export async function getAllSubscriptions(userId: string): Promise<EffectiveSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('source, tier, status, expires_at, cancel_at_period_end')
    .eq('user_id', userId);

  if (error || !data) {
    debugLog('[SubscriptionService] getAllSubscriptions error:', error);
    return [];
  }

  const rows = data
    .filter((row) => isTier(row.tier) && isSource(row.source) && isStatus(row.status))
    .map((row) => ({
      source: row.source as SubscriptionSource,
      tier: row.tier as SubscriptionTier,
      status: row.status as SubscriptionStatus,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    }));

  return rows.sort((a, b) => {
    const tierRank = (tier: SubscriptionTier) =>
      tier === 'premium_plus' ? 2 : tier === 'premium' ? 1 : 0;

    const tierDiff = tierRank(b.tier) - tierRank(a.tier);
    if (tierDiff !== 0) return tierDiff;

    const aTime = a.expiresAt ? a.expiresAt.getTime() : 0;
    const bTime = b.expiresAt ? b.expiresAt.getTime() : 0;
    return bTime - aTime;
  });
}
