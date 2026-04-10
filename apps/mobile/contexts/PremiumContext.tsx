import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { debugLog } from '../utils/debug';
import {
  FeatureKey,
  FEATURE_TIERS,
  hasTrialRemaining,
  incrementFeatureUsage,
  getFeatureUsageToday,
} from '../services/premiumUsage';
import { getUserTier, SubscriptionTier } from '../services/subscriptionService';

let Purchases: typeof import('react-native-purchases').default | null = null;
let initializePurchases: ((userId?: string) => Promise<void>) | null = null;

if (Platform.OS !== 'web') {
  Purchases = require('react-native-purchases').default;
  const purchasesModule = require('../services/purchases');
  initializePurchases = purchasesModule.initializePurchases;
}

export type { SubscriptionTier };

type PaywallState = {
  visible: boolean;
  feature: FeatureKey | null;
  recommendedTier: SubscriptionTier;
};

type PremiumContextType = {
  tier: SubscriptionTier;
  loading: boolean;
  canAccessFeature: (feature: FeatureKey) => boolean;
  hasTrialRemaining: (feature: FeatureKey) => Promise<boolean>;
  consumeTrial: (feature: FeatureKey) => Promise<{ success: boolean; showPaywall: boolean }>;
  triggerPaywall: (feature: FeatureKey) => void;
  dismissPaywall: () => void;
  refreshSubscription: () => Promise<void>;
  paywallState: PaywallState;
};

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export function usePremium() {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }
  return context;
}

type PremiumProviderProps = {
  children: ReactNode;
};

const FORCE_PREMIUM_FOR_TESTING = process.env.EXPO_PUBLIC_FORCE_PREMIUM === 'true';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PremiumProvider({ children }: PremiumProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>(
    FORCE_PREMIUM_FOR_TESTING ? 'premium_plus' : 'free'
  );
  const [loading, setLoading] = useState(Platform.OS !== 'web');
  const [paywallState, setPaywallState] = useState<PaywallState>({
    visible: false,
    feature: null,
    recommendedTier: 'premium',
  });

  const listenerRef = useRef<{ remove: () => void } | null>(null);

  const checkSubscriptionTier = useCallback(
    async (userId?: string): Promise<SubscriptionTier> => {
      if (FORCE_PREMIUM_FOR_TESTING) {
        return 'premium_plus';
      }

      if (!userId) {
        return 'free';
      }

      try {
        return await getUserTier(userId);
      } catch (error) {
        debugLog('Error checking subscription tier:', error);
        return 'free';
      }
    },
    []
  );

  const checkSubscriptionTierWithRetry = useCallback(
    async (userId: string, expectedTier?: SubscriptionTier): Promise<SubscriptionTier> => {
      const delays = [500, 1500, 3000];

      for (let i = 0; i <= delays.length; i++) {
        const currentTier = await checkSubscriptionTier(userId);

        if (!expectedTier || currentTier === expectedTier) {
          return currentTier;
        }

        if (i === delays.length) {
          debugLog(
            `[Premium] Retry exhausted. Expected ${expectedTier}, got ${currentTier}. Using Supabase value.`
          );
          return currentTier;
        }

        debugLog(`[Premium] Tier mismatch, retrying in ${delays[i]}ms...`);
        await sleep(delays[i]);
      }

      // Defensive fallback; loop should always return before this point.
      return 'free';
    },
    [checkSubscriptionTier]
  );

  const refreshSubscription = useCallback(async () => {
    if (!user?.id) {
      setTier('free');
      setLoading(false);
      return;
    }

    setLoading(true);
    const currentTier = await checkSubscriptionTier(user.id);
    setTier(currentTier);
    setLoading(false);
  }, [checkSubscriptionTier, user?.id]);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user) {
      debugLog('PremiumProvider: Auth ready, no user found');
      setTier('free');
      setLoading(false);
      return;
    }

    debugLog('PremiumProvider: Auth ready with user, initializing...');

    const userId = user.id;
    let cancelled = false;

    async function initAndListen() {
      setLoading(true);

      const initialTier = await checkSubscriptionTier(userId);
      if (cancelled) return;

      setTier(initialTier);
      setLoading(false);

      if (Platform.OS !== 'web' && initializePurchases && Purchases) {
        try {
          await initializePurchases(userId);
          if (cancelled) return;

          debugLog('[Premium] RevenueCat initialized, attaching listener');

          // RevenueCat returns EmitterSubscription, but types may be incomplete
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subscription = (Purchases as any).addCustomerInfoUpdateListener(
            async (info: any) => {
              if (cancelled) return;

              let expectedTier: SubscriptionTier = 'free';

              if (info.entitlements.active['premium_plus'] !== undefined) {
                expectedTier = 'premium_plus';
              } else if (info.entitlements.active['premium'] !== undefined) {
                expectedTier = 'premium';
              }

              debugLog(`[Premium] RevenueCat signal: expectedTier=${expectedTier}`);

              const confirmedTier = await checkSubscriptionTierWithRetry(userId, expectedTier);
              if (!cancelled) {
                setTier(confirmedTier);
              }
            }
          );
          listenerRef.current = subscription;
        } catch (err) {
          debugLog('RevenueCat init error:', err);
        }
      }
    }

    initAndListen().catch((err) => {
      debugLog('PremiumProvider initAndListen error:', err);
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, [user, authLoading, checkSubscriptionTier, checkSubscriptionTierWithRetry]);

  const canAccessFeature = useCallback(
    (feature: FeatureKey): boolean => {
      const requiredTier = FEATURE_TIERS[feature];

      if (tier === 'premium_plus') {
        return true;
      }

      if (tier === 'premium') {
        return requiredTier === 'premium';
      }

      return false;
    },
    [tier]
  );

  const checkTrialRemaining = useCallback(
    async (feature: FeatureKey): Promise<boolean> => {
      if (!user) return false;

      if (canAccessFeature(feature)) {
        return true;
      }

      return hasTrialRemaining(user.id, feature);
    },
    [user, canAccessFeature]
  );

  const consumeTrial = useCallback(
    async (feature: FeatureKey): Promise<{ success: boolean; showPaywall: boolean }> => {
      if (!user) {
        return { success: false, showPaywall: true };
      }

      if (canAccessFeature(feature)) {
        return { success: true, showPaywall: false };
      }

      const currentUsage = await getFeatureUsageToday(user.id, feature);

      if (currentUsage >= 1) {
        return { success: false, showPaywall: true };
      }

      const result = await incrementFeatureUsage(user.id, feature);

      if (result.success) {
        return { success: true, showPaywall: false };
      }

      return { success: false, showPaywall: true };
    },
    [user, canAccessFeature]
  );

  const triggerPaywall = useCallback((feature: FeatureKey) => {
    const requiredTier = FEATURE_TIERS[feature];
    setPaywallState({
      visible: true,
      feature,
      recommendedTier: requiredTier,
    });
  }, []);

  const dismissPaywall = useCallback(() => {
    setPaywallState({
      visible: false,
      feature: null,
      recommendedTier: 'premium',
    });
  }, []);

  const value = useMemo<PremiumContextType>(
    () => ({
      tier,
      loading,
      canAccessFeature,
      hasTrialRemaining: checkTrialRemaining,
      consumeTrial,
      triggerPaywall,
      dismissPaywall,
      refreshSubscription,
      paywallState,
    }),
    [tier, loading, canAccessFeature, checkTrialRemaining, consumeTrial, triggerPaywall, dismissPaywall, refreshSubscription, paywallState]
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
