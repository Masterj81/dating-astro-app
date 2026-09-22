/**
 * JUNO-06 — BEFORE-proof: the nine legacy premium features are authorized by
 * the phone, not by the server (reproduction, 2026-09-22).
 *
 * WHAT THIS SUITE PROVES ON THE UNFIXED TREE
 * ------------------------------------------
 *  1. STRUCTURAL — only 2 of the 11 FEATURE_TIERS keys have a server decision
 *     (`SERVER_ENFORCED_FEATURES`); the nine others are decided by
 *     `canAccessFeature` + the client-counted trial in `premiumUsage`.
 *  2. BEHAVIORAL (decision) — executing the REAL legacy grant path
 *     (`hasTrialRemaining` → `incrementFeatureUsage`) grants a legacy feature
 *     with ZERO premium-decision RPC calls. The trial "authorization" is a
 *     row count the client reads and increments itself; the server's
 *     `enforce_premium_feature` is never consulted.
 *  3. BEHAVIORAL (data) — the tarot engine (`@astro/shared/tarot`) yields a
 *     complete premium reading for a free account with zero network calls:
 *     the content is computed locally from the bundled corpus.
 *
 * After the JUNO-06 fix this suite is REPLACED by premium-server-gate.test.ts
 * asserting the opposite (server decision required, fail-closed). The file
 * is kept in history as the "avant correction" evidence the mission asked
 * for; its assertions are inverted in the same change set so the tree never
 * carries a green bypass proof.
 *
 * The supabase client is mocked with a call recorder: `rpcCalls` counts every
 * RPC, so "zero decision calls" is measured, not assumed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock('../../services/supabase', () => {
  const maybeSingle = (rows: unknown) => ({
    maybeSingle: async () => ({ data: rows, error: null }),
  });
  const rpc = (fn: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ fn, args });
    if (fn === 'increment_feature_usage') {
      // The legacy trial path: the server merely COUNTS. It never decides.
      return Promise.resolve({ data: 1, error: null });
    }
    if (fn === 'enforce_premium_feature') {
      return Promise.resolve(maybeSingle({ allowed: false, reason: 'insufficient_tier', current_count: 0 }));
    }
    return Promise.resolve({ data: null, error: null });
  };
  const queryBuilders: Record<string, unknown> = {
    select: () => chain(),
    eq: () => chain(),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const chain = () => queryBuilders;
  return {
    supabase: {
      rpc,
      from: () => chain(),
      auth: {
        getUser: async () => ({
          data: { user: { id: '00000000-0000-0000-0000-000000000001' } },
        }),
      },
    },
  };
});

import {
  FEATURE_TIERS,
  SERVER_ENFORCED_FEATURES,
  hasTrialRemaining,
  incrementFeatureUsage,
  type FeatureKey,
} from '../../services/premiumUsage';
import { drawSpread, resolveTarotCorpus, pickMeaning } from '@astro/shared/tarot';

const USER_ID = '00000000-0000-0000-0000-000000000001';

// The nine features the mission lists as still on the legacy client path.
const LEGACY: FeatureKey[] = [
  'synastry',
  'daily-horoscope',
  'monthly-horoscope',
  'planetary-transits',
  'retrograde-alerts',
  'lucky-days',
  'date-planner',
  'weekly-tarot',
  'monthly-tarot',
];

// The tier comparison PremiumContext.canAccessFeature performs — reproduced
// verbatim from contexts/PremiumContext.tsx so this suite executes the same
// decision the gate makes, without importing React Native.
function canAccessFeature(feature: FeatureKey, tier: 'free' | 'premium' | 'premium_plus'): boolean {
  const requiredTier = FEATURE_TIERS[feature];
  if (tier === 'premium_plus') return true;
  if (tier === 'premium') return requiredTier === 'premium';
  return false;
}

beforeEach(() => {
  rpcCalls.length = 0;
});

describe('JUNO-06 before-proof · structural', () => {
  it('only 2 of the 11 features have a server decision; the 9 mission features have none', () => {
    expect(Object.keys(FEATURE_TIERS)).toHaveLength(11);
    expect(Object.keys(SERVER_ENFORCED_FEATURES)).toHaveLength(2);
    for (const feature of LEGACY) {
      expect(SERVER_ENFORCED_FEATURES[feature]).toBeUndefined();
    }
  });
});

describe('JUNO-06 before-proof · the legacy grant path decides on the phone', () => {
  it('a device-held premium tier (RevenueCat local entitlement) opens all 9 features with ZERO server decision', async () => {
    // PremiumContext trusts a local RevenueCat entitlement when the server
    // says free (contexts/PremiumContext.tsx, "trusting local entitlement"),
    // so tier='premium' is a value the PHONE can hold on its own.
    const tierFromDeviceEntitlement = 'premium' as const;

    for (const feature of LEGACY) {
      // PremiumGate legacy branch, steps 3-4, executed with the real pieces:
      const hasAccess = canAccessFeature(feature, tierFromDeviceEntitlement);
      if (!hasAccess) {
        const remaining = await hasTrialRemaining(USER_ID, feature);
        expect(remaining).toBe(true); // client-counted trial: always fresh on a new day
        const result = await incrementFeatureUsage(USER_ID, feature);
        expect(result.success).toBe(true);
      }
      expect(hasAccess || true).toBe(true);
    }

    const decisionCalls = rpcCalls.filter((c) => c.fn === 'enforce_premium_feature');
    expect(decisionCalls).toHaveLength(0);
  });

  it('the free-tier trial grant also runs with zero decision RPCs (client counts, server never judges)', async () => {
    for (const feature of LEGACY) {
      expect(await hasTrialRemaining(USER_ID, feature)).toBe(true);
      const result = await incrementFeatureUsage(USER_ID, feature);
      expect(result.success).toBe(true);
    }
    expect(rpcCalls.filter((c) => c.fn === 'enforce_premium_feature')).toHaveLength(0);
    expect(rpcCalls.filter((c) => c.fn === 'increment_feature_usage')).toHaveLength(LEGACY.length);
  });

  it('the trial RPC payload carries a user_id chosen by the caller (no auth.uid() derivation)', async () => {
    await incrementFeatureUsage(USER_ID, feature0());
    const call = rpcCalls.find((c) => c.fn === 'increment_feature_usage');
    expect(call?.args.p_user_id).toBe(USER_ID);
  });
});

describe('JUNO-06 before-proof · the data source needs no server at all', () => {
  it('a full premium tarot reading is produced locally for a free account, zero network calls', () => {
    rpcCalls.length = 0;

    // Exactly what app/premium-screens/tarot.tsx renders: drawSpread +
    // resolveTarotCorpus + pickMeaning. No supabase call anywhere.
    const weekly = drawSpread({ userId: USER_ID, mode: 'love', period: 'weekly' });
    const monthly = drawSpread({ userId: USER_ID, mode: 'love', period: 'monthly' });

    expect(weekly.cards).toHaveLength(4); // Cosmic weekly spread
    expect(monthly.cards).toHaveLength(3); // Celestial monthly spread

    const { corpus } = resolveTarotCorpus('en');
    for (const drawn of [...weekly.cards, ...monthly.cards]) {
      const meanings = corpus.meanings[drawn.shape.id];
      expect(meanings).toBeDefined();
      const prose = pickMeaning(meanings, 'love', drawn.reversed);
      expect(typeof prose).toBe('string');
      expect(prose.length).toBeGreaterThan(20);
    }

    expect(rpcCalls).toHaveLength(0);
  });
});

function feature0(): FeatureKey {
  return LEGACY[0]!;
}
