import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { debugLog } from '../utils/debug';
import {
  FeatureKey,
  FEATURE_TIERS,
  syncEntitlement,
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

      // JUNO-06 ruling (2026-09-23): a local RevenueCat entitlement can no
      // longer outrank the server's answer — not even for the display tier.
      // When they disagree, the device ASKS the server to verify with its
      // own credentials (sync-entitlement edge: server-side RC lookup,
      // verified write into `subscriptions`) and adopts the tier the server
      // has then written. If that call cannot complete, the server's last
      // word stands; PremiumGate's "check my subscription" state offers the
      // same verification to the reader. The old branch set the tier from
      // `checkLocalEntitlement()` directly — the phone deciding — and it is
      // deliberately gone.
      let effectiveTier = initialTier;
      if (effectiveTier === 'free' && Platform.OS !== 'web' && checkLocalEntitlement) {
        try {
          const localTier = await checkLocalEntitlement();
          if (!cancelled && localTier !== 'free') {
            debugLog(
              `[Premium] Server says free, RevenueCat local says ${localTier}; asking the server to verify (sync-entitlement).`
            );
            const sync = await syncEntitlement();
            if (!cancelled && sync.ok) {
              effectiveTier = sync.tier; // the tier the SERVER verified and wrote
            }
            // Sync failed: keep the server's value. Never the local one.
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

              // JUNO-06 ruling: a RevenueCat signal is a REQUEST to
              // synchronize, not an authority. The previous code set the
              // tier optimistically from the signal ("never see free after
              // a confirmed purchase"); that optimism was the phone
              // outranking the server, and a subscriber is still never
              // stranded — the sync below asks the server to verify with
              // its OWN credentials, which is both fast (it does not wait
              // for the webhook) and authoritative.
              if (expectedTier !== 'free') {
                try {
                  const sync = await syncEntitlement();
                  if (cancelled) return;
                  if (sync.ok) {
                    setTier(sync.tier); // verified by the server, just now
                    return;
                  }
                  // Sync unreachable (offline / RevenueCat error): the
                  // server's last word stands. Fall through to the retry
                  // read below, which waits for the webhook to land —
                  // the honest reconciliation path.
                } catch {
                  // Same: fall through to the server read.
                }
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
      // JUNO-06 BOUNDARY (revised 2026-09-23): a UX helper, never a gate and
      // never a smoothing authority. After the purge it is not consulted
      // after server refusals at all — the gate renders the
      // "check my subscription" sync action instead of granting. What
      // remains here is display logic only: which tier badge a paywall
      // should recommend, hub ordering, cosmetic highlights. No screen may
      // treat this as an authorization; enforce_premium_feature (and, for
      // tarot, the premium-tarot-reading edge) are the only decisions.
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
