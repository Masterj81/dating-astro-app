import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import Purchases from 'react-native-purchases';
import { useAuth } from '../app/_layout';
import {
  FeatureKey,
  FEATURE_TIERS,
  hasTrialRemaining,
  incrementFeatureUsage,
  getFeatureUsageToday,
} from '../services/premiumUsage';
import { initializePurchases, isPurchasesConfigured } from '../services/purchases';

export type SubscriptionTier = 'free' | 'premium' | 'premium_plus';

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

// Use environment variable for testing premium features (never commit as true)
const FORCE_PREMIUM_FOR_TESTING = process.env.EXPO_PUBLIC_FORCE_PREMIUM === 'true';

export function PremiumProvider({ children }: PremiumProviderProps) {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>(FORCE_PREMIUM_FOR_TESTING ? 'premium_plus' : 'free');
  const [loading, setLoading] = useState(true);
  const [paywallState, setPaywallState] = useState<PaywallState>({
    visible: false,
    feature: null,
    recommendedTier: 'premium',
  });

  // Check subscription status from RevenueCat
  const checkSubscriptionTier = useCallback(async (userId?: string): Promise<SubscriptionTier> => {
    // Override for testing/screenshots
    if (FORCE_PREMIUM_FOR_TESTING) {
      return 'premium_plus';
    }

    try {
      // Ensure RevenueCat is initialized before checking
      if (!isPurchasesConfigured()) {
        if (userId) {
          await initializePurchases(userId);
        } else {
          // Can't check without initialization
          return 'free';
        }
      }

      const customerInfo = await Purchases.getCustomerInfo();

      // Check for premium_plus first (higher tier)
      if (customerInfo.entitlements.active['premium_plus'] !== undefined) {
        return 'premium_plus';
      }

      // Check for premium
      if (customerInfo.entitlements.active['premium'] !== undefined) {
        return 'premium';
      }

      return 'free';
    } catch (error) {
      console.log('Error checking subscription tier:', error);
      return 'free';
    }
  }, []);

  // Refresh subscription status
  const refreshSubscription = useCallback(async () => {
    setLoading(true);
    const currentTier = await checkSubscriptionTier(user?.id);
    setTier(currentTier);
    setLoading(false);
  }, [checkSubscriptionTier, user?.id]);

  // Check subscription on mount and when user changes
  useEffect(() => {
    if (user) {
      refreshSubscription();
    } else {
      setTier('free');
      setLoading(false);
    }
  }, [user, refreshSubscription]);

  // Listen for subscription changes (only when user is logged in and Purchases is configured)
  useEffect(() => {
    if (!user || !isPurchasesConfigured()) {
      return;
    }

    let listener: { remove: () => void } | undefined;

    try {
      listener = Purchases.addCustomerInfoUpdateListener((info) => {
        if (info.entitlements.active['premium_plus'] !== undefined) {
          setTier('premium_plus');
        } else if (info.entitlements.active['premium'] !== undefined) {
          setTier('premium');
        } else {
          setTier('free');
        }
      });
    } catch (error) {
      console.warn('Failed to add customer info listener:', error);
    }

    return () => {
      listener?.remove();
    };
  }, [user]);

  // Check if user can access a feature based on their tier
  const canAccessFeature = useCallback(
    (feature: FeatureKey): boolean => {
      const requiredTier = FEATURE_TIERS[feature];

      if (tier === 'premium_plus') {
        // Premium Plus can access everything
        return true;
      }

      if (tier === 'premium') {
        // Premium can only access premium tier features
        return requiredTier === 'premium';
      }

      // Free users cannot directly access premium features (but can use trial)
      return false;
    },
    [tier]
  );

  // Check if trial is available for a feature
  const checkTrialRemaining = useCallback(
    async (feature: FeatureKey): Promise<boolean> => {
      if (!user) return false;

      // If user has access through subscription, trial doesn't matter
      if (canAccessFeature(feature)) {
        return true; // Not technically "trial" but they have access
      }

      return hasTrialRemaining(user.id, feature);
    },
    [user, canAccessFeature]
  );

  // Consume a trial view
  const consumeTrial = useCallback(
    async (feature: FeatureKey): Promise<{ success: boolean; showPaywall: boolean }> => {
      if (!user) {
        return { success: false, showPaywall: true };
      }

      // If user has subscription access, no need to consume trial
      if (canAccessFeature(feature)) {
        return { success: true, showPaywall: false };
      }

      // Check current usage
      const currentUsage = await getFeatureUsageToday(user.id, feature);

      if (currentUsage >= 1) {
        // Trial already used today
        return { success: false, showPaywall: true };
      }

      // Increment usage (consuming the trial)
      const result = await incrementFeatureUsage(user.id, feature);

      if (result.success) {
        return { success: true, showPaywall: false };
      }

      return { success: false, showPaywall: true };
    },
    [user, canAccessFeature]
  );

  // Trigger the paywall modal
  const triggerPaywall = useCallback((feature: FeatureKey) => {
    const requiredTier = FEATURE_TIERS[feature];
    setPaywallState({
      visible: true,
      feature,
      recommendedTier: requiredTier,
    });
  }, []);

  // Dismiss the paywall modal
  const dismissPaywall = useCallback(() => {
    setPaywallState({
      visible: false,
      feature: null,
      recommendedTier: 'premium',
    });
  }, []);

  const value: PremiumContextType = {
    tier,
    loading,
    canAccessFeature,
    hasTrialRemaining: checkTrialRemaining,
    consumeTrial,
    triggerPaywall,
    dismissPaywall,
    refreshSubscription,
    paywallState,
  };

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}
