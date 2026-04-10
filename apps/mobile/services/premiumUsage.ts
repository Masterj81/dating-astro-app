import { supabase } from './supabase';

// Feature keys for premium features
export type FeatureKey =
  // Premium tier features (Celestial)
  | 'synastry'
  | 'super-likes'
  | 'likes'
  | 'priority-messages'
  | 'natal-chart'
  // Premium Plus tier features (Cosmic)
  | 'daily-horoscope'
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
  'super-likes': 'premium',
  'likes': 'premium',
  'priority-messages': 'premium',
  'natal-chart': 'premium',
  // Premium Plus tier features (Cosmic)
  'daily-horoscope': 'premium_plus',
  'monthly-horoscope': 'premium_plus',
  'planetary-transits': 'premium_plus',
  'retrograde-alerts': 'premium_plus',
  'lucky-days': 'premium_plus',
  'date-planner': 'premium_plus',
  // Tarot
  'weekly-tarot': 'premium_plus',
  'monthly-tarot': 'premium',
};

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

    const today = new Date().toISOString().split('T')[0];

    // Try to use RPC function first (more efficient)
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('increment_feature_usage', {
        p_user_id: userId,
        p_feature_key: featureKey,
      });

    if (!rpcError && rpcData !== null) {
      return { success: true, viewCount: rpcData };
    }

    // Fallback to upsert if RPC not available
    const { data, error } = await supabase
      .from('premium_usage')
      .upsert(
        {
          user_id: userId,
          feature_key: featureKey,
          usage_date: today,
          view_count: 1,
        },
        {
          onConflict: 'user_id,feature_key,usage_date',
        }
      )
      .select('view_count')
      .single();

    if (error) {
      return { success: false, viewCount: 0 };
    }

    return { success: true, viewCount: data?.view_count || 1 };
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
