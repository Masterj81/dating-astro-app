import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { debugLog } from '../utils/debug';
import {
  FeatureKey,
  FEATURE_TIERS,
} from '../services/premiumUsage';
import { getUserTier, SubscriptionTier } from '../services/subscriptionService';

let Purchases: typeof import('react-native-purchases').default | null = null;
let initializePurchases: ((userId?: string) => Promise<void>) | null = null;
let checkLocalEntitlement: (() => Promise<SubscriptionTier>) | null = null;

if (Platform.OS !== 'web') {
  Purchases = require('react-native-purchases').default;
  const purchasesModule = require('../services/purchases');
  initializePurchases = purchasesModule.initializePurchases;
  checkLocalEntitlement = purchasesModule.checkSubscriptionTier;
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

// SECURITY: this constant is ALWAYS `false` in production builds because
// `__DEV__ === false` short-circuits the conjunction. It can only be flipped
// to `true` by developers running a dev build with EXPO_PUBLIC_FORCE_PREMIUM
// explicitly set. Missing env var, wrong value, or a prod bundle all resolve
// to `false` at bundle time — no runtime flag and no config file can change it.
const FORCE_PREMIUM_FOR_TESTING: boolean =
  __DEV__ && process.env.EXPO_PUBLIC_FORCE_PREMIUM === 'true';

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
      debugLog('PremiumProvider: Auth ready, no user found — resetting');
      // P1-5: explicit teardown so stale premium state does not leak into
      // the next login on the same device.
      setTier('free');
      setLoading(false);
      listenerRef.current?.remove();
      listenerRef.current = null;
      return;
    }

    debugLog('PremiumProvider: Auth ready with user, initializing...');

    const userId = user.id;
    let cancelled = false;

    async function initAndListen() {
      setLoading(true);

      const initialTier = await checkSubscriptionTier(userId);
      if (cancelled) return;

      // If the server says `free` but RevenueCat has an active entitlement
      // locally, trust the device — the webhook may simply be lagging.
      // Server reconciliation runs in background via the listener below.
      let effectiveTier = initialTier;
      if (effectiveTier === 'free' && Platform.OS !== 'web' && checkLocalEntitlement) {
        try {
          const localTier = await checkLocalEntitlement();
          if (!cancelled && localTier !== 'free') {
            debugLog(
              `[Premium] Server returned free, RevenueCat says ${localTier}; trusting local entitlement.`
            );
            effectiveTier = localTier;
          }
        } catch {
          // Local lookup failed; keep the server value.
        }
      }
      if (cancelled) return;

      setTier(effectiveTier);
      setLoading(false);

      if (Platform.OS !== 'web' && initializePurchases && Purchases) {
        try {
          await initializePurchases(userId);
          if (cancelled) return;

          debugLog('[Premium] RevenueCat initialized, attaching listener');

          // Remove any previously attached listener before adding a new one
          listenerRef.current?.remove();
          listenerRef.current = null;

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

              // Optimistic: trust the local entitlement immediately so the
              // user never sees `free` after a confirmed purchase while the
              // server-side webhook propagates.
              if (expectedTier !== 'free') {
                setTier(expectedTier);
              }

              const confirmedTier = await checkSubscriptionTierWithRetry(userId, expectedTier);
              if (cancelled) return;
              setTier(confirmedTier);
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
      // JUNO-06 BOUNDARY: this is a UX helper, not a gate. PremiumGate calls
      // enforce_premium_feature for EVERY feature; `canAccessFeature` is only
      // consulted AFTER a server refusal, to decide whether the refusal is a
      // subscriber-transient state (webhook lag) worth smoothing over — and
      // smoothing requires a PAID tier the device verified. It can never
      // grant a free account a premium surface, and no screen may use it as
      // its authorization.
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
      triggerPaywall,
      dismissPaywall,
      refreshSubscription,
      paywallState,
    }),
    [tier, loading, canAccessFeature, triggerPaywall, dismissPaywall, refreshSubscription, paywallState]
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}
