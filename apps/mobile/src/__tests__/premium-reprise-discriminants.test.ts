/**
 * JUNO-06 reprise (2026-09-23) — the operator's named discriminants.
 *
 * Every test here encodes one sentence from the reprise ruling and would
 * FAIL on the pre-fix tree (the local-entitlement smoothing):
 *
 *  1. FAKE ENTITLEMENT AFTER A REFUSAL STAYS INACCESSIBLE. The phone
 *     claiming a paid tier while the server refuses is a REQUEST to
 *     synchronize — never an authorization. The only sequence that yields
 *     access is: sync (server verifies with its own RevenueCat
 *     credentials) → re-ask enforce → server says yes.
 *  2. SIMULATED PATCH ON TAROT YIELDS NOTHING. The reading is a server
 *     artifact: premium_required / network failure / malformed payload all
 *     produce NO reading, and no mobile code path can compute one.
 *  3. THE APK CARRIES NO TAROT PRODUCER. Structural: no file under
 *     apps/mobile imports '@astro/shared/tarot' (engine + corpus absent
 *     from the binary — that is the whole fix for blocage 1).
 *  4. BUILD-130 CONTRACT. The keys, tiers and quotas the deployed Play
 *     build already sees stay exactly as they are.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── The supabase mock: rpc + functions.invoke, both scriptable per test ─────
type EnforceDecision = { allowed: boolean; reason: string; current_count?: number };
type InvokeOutcome =
  | { kind: 'tarot'; status: number; body: unknown }
  | { kind: 'sync'; body: unknown }
  | { kind: 'throw' };

let enforceQueue: EnforceDecision[] = [];
let invokeQueue: InvokeOutcome[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const invokeCalls: { name: string; body: unknown }[] = [];

vi.mock('../../services/supabase', () => {
  return {
    supabase: {
      rpc: (fn: string, args: Record<string, unknown> = {}) => {
        rpcCalls.push({ fn, args });
        const next = enforceQueue[0];
        const payload =
          fn === 'enforce_premium_feature' && next
            ? {
                data: {
                  allowed: next.allowed,
                  reason: next.reason,
                  current_count: next.current_count ?? 0,
                },
                error: null,
              }
            : { data: null, error: { message: 'unexpected rpc' } };
        return { maybeSingle: () => Promise.resolve(payload) };
      },
      functions: {
        invoke: (name: string, options?: { body?: unknown }) => {
          invokeCalls.push({ name, body: options?.body });
          const next = invokeQueue.shift();
          if (!next || next.kind === 'throw') {
            return Promise.reject(new Error('FunctionsError'));
          }
          if (next.kind === 'tarot' && next.status >= 400) {
            // Mirrors supabase-js: a non-2xx answer RESOLVES with
            // { data: null, error: FunctionsHttpError } — the raw Response
            // rides in `.context`, whose json() holds the edge's body.
            const err = new Error(`HttpError ${next.status}`) as Error & {
              context: { json: () => Promise<unknown> };
            };
            err.context = { json: async () => next.body };
            return Promise.resolve({ data: null, error: err });
          }
          return Promise.resolve({ data: next.kind === 'tarot' ? next.body : next.body, error: null });
        },
      },
      auth: {
        getUser: async () => ({
          data: { user: { id: '00000000-0000-0000-0000-000000000009' } },
        }),
      },
    },
  };
});

import {
  ENFORCEMENT_CLASSES,
  ENFORCEMENT_CLASS_COUNTS,
  SERVER_ENFORCED_FEATURES,
  enforcePremiumFeature,
  syncEntitlement,
} from '../../services/premiumUsage';
import { fetchTarotReading } from '../../services/serverTarot';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

beforeEach(() => {
  rpcCalls.length = 0;
  invokeCalls.length = 0;
  enforceQueue = [];
  invokeQueue = [];
});

// ---------------------------------------------------------------------------
// 1. The operator's named discriminant: a device-claimed entitlement can
//    never reverse a server refusal. Only sync-then-reask can change the
//    answer — because the SERVER changed it.
// ---------------------------------------------------------------------------
describe('discriminant · fake entitlement after a refusal', () => {
  it('a refusal stays a refusal: the phone has no code path that grants', async () => {
    // The device "claims" premium (this is what a patched APK would forge).
    // The module surface offers exactly two verbs; neither takes a tier,
    // and neither returns an authorization on its own.
    enforceQueue = [{ allowed: false, reason: 'insufficient_tier', current_count: 0 }];
    const decision = await enforcePremiumFeature('tarot_monthly');
    expect(decision.allowed).toBe(false);
    // And nothing in the module can flip it: the ONLY other verb is sync.
    expect(decision.reason).toBe('insufficient_tier');
  });

  it('sync-then-access: a FAILED sync changes nothing — the refusal stands', async () => {
    enforceQueue = [{ allowed: false, reason: 'insufficient_tier' }];
    invokeQueue = [{ kind: 'throw' }];

    const sync = await syncEntitlement();
    expect(sync.ok).toBe(false);

    // The client re-asks (exactly what PremiumGate's sync button does).
    const again = await enforcePremiumFeature('tarot_monthly');
    expect(again.allowed).toBe(false);
    expect(again.reason).toBe('insufficient_tier');
  });

  it('sync-then-access: a SUCCESSFUL sync is not a grant either — only the NEW enforce verdict is', async () => {
    // Step 1: server refuses.
    enforceQueue = [{ allowed: false, reason: 'insufficient_tier' }];
    const first = await enforcePremiumFeature('tarot_monthly');
    expect(first.allowed).toBe(false);

    // Step 2: the server verifies with its own credentials and reports a
    // tier. NOTE: the sync response is NOT an authorization — asserting it
    // carries no `allowed` field at all.
    invokeQueue = [{ kind: 'sync', body: { synced: true, tier: 'premium', reason: 'ok' } }];
    const sync = await syncEntitlement();
    expect(sync).toEqual({ ok: true, tier: 'premium' });
    expect('allowed' in sync).toBe(false);

    // Step 3: the server STILL refuses (the webhook has not landed).
    enforceQueue = [{ allowed: false, reason: 'insufficient_tier' }];
    const still = await enforcePremiumFeature('tarot_monthly');
    expect(still.allowed).toBe(false);

    // Step 4: only when the server itself says yes does access exist.
    enforceQueue = [{ allowed: true, reason: 'free_preview' }];
    const granted = await enforcePremiumFeature('tarot_monthly');
    expect(granted.allowed).toBe(true);
    expect(granted.isFreePreview).toBe(true);
  });

  it('a throttled sync is honest about it and grants nothing', async () => {
    invokeQueue = [
      { kind: 'sync', body: { synced: false, tier: 'free', reason: 'rate_limited' } },
    ];
    const sync = await syncEntitlement();
    expect(sync).toEqual({ ok: false, code: 'rate_limited' });
  });
});

// ---------------------------------------------------------------------------
// 2. Simulated patch on tarot: the screen's data source cannot produce a
//    reading out of thin air — every failure is a dead end, on purpose.
// ---------------------------------------------------------------------------
describe('discriminant · simulated patch yields no reading', () => {
  it('premium_required → no reading, code premium_required (not a fallback)', async () => {
    invokeQueue = [
      { kind: 'tarot', status: 402, body: { success: false, error: 'premium_required', reason: 'insufficient_tier' } },
    ];
    const result = await fetchTarotReading('monthly', 'love', 'en');
    expect(result).toEqual({ ok: false, code: 'premium_required' });
  });

  it('network/edge failure → no reading, no local compute', async () => {
    invokeQueue = [{ kind: 'throw' }];
    const result = await fetchTarotReading('weekly', 'love', 'en');
    expect(result).toEqual({ ok: false, code: 'network' });
  });

  it('a malformed payload is rejected — the client validates shape, never invents cards', async () => {
    invokeQueue = [
      {
        kind: 'tarot',
        status: 200,
        body: { success: true, reading: { period: 'weekly', cards: [{ nonsense: true }] } },
      },
    ];
    const result = await fetchTarotReading('weekly', 'love', 'en');
    expect(result).toEqual({ ok: false, code: 'server' });
  });

  it('the authorized result is returned verbatim — the client adds nothing', async () => {
    const reading = {
      mode: 'love',
      period: 'weekly' as const,
      locale: 'en',
      seed: '2026-W39',
      generatedAt: '2026-09-23T00:00:00.000Z',
      isFallback: false,
      cards: [
        {
          position: 'present',
          card: {
            id: 'major-00',
            imageFile: 'major-00.jpg',
            name: 'The Fool',
            reversed: false,
            meaning: 'A beginning.',
            isFallback: false,
          },
        },
      ],
    };
    invokeQueue = [
      { kind: 'tarot', status: 200, body: { success: true, viaFreePreview: true, reading } },
    ];
    const result = await fetchTarotReading('weekly', 'love', 'en');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reading).toEqual(reading);
      expect(result.viaFreePreview).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Structural: the APK carries no tarot producer, and the gate cannot
//    grant after a refusal.
// ---------------------------------------------------------------------------
describe('discriminant · the binary itself', () => {
  it('NO file under apps/mobile imports @astro/shared/tarot (engine + corpus out of the APK)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name.startsWith('.'))) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf8');
          if (/from\s+['"]@astro\/shared\/tarot['"]/.test(src)) offenders.push(full);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'apps', 'mobile'));
    expect(offenders).toEqual([]);
  });

  it('the gate cannot grant after a refusal: no canAccessFeature-guarded grant exists', () => {
    const gate = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/components/PremiumGate.tsx'),
      'utf8',
    );
    expect(gate).not.toMatch(/canAccessFeature\(feature\)\s*\)\s*\{[\s\S]{0,160}?setAccessState\('granted'\)/);
    // And the honest alternative is present.
    expect(gate).toMatch(/setDenialReason\('sync_available'\)/);
    expect(gate).toMatch(/await syncEntitlement\(\)/);
  });

  it('the tarot screen owns no producer symbols and no PremiumGate wrapper (single decision)', () => {
    const screen = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/mobile/app/premium-screens/tarot.tsx'),
      'utf8',
    );
    expect(screen).not.toMatch(/import PremiumGate|<PremiumGate/);
    expect(screen).not.toMatch(/generateReading|drawSpread|DECK\b/);
    expect(screen).toMatch(/fetchTarotReading/);
  });

  it('the classes are the honest inventory: 2 server-protected / 7 metered / 2 public', () => {
    const counts = { server_enforced_data: 0, server_metered_ui: 0, public_content: 0 };
    for (const cls of Object.values(ENFORCEMENT_CLASSES)) counts[cls] += 1;
    expect(counts).toEqual({ server_enforced_data: 2, server_metered_ui: 7, public_content: 2 });
    expect(ENFORCEMENT_CLASS_COUNTS).toEqual(counts);
    expect(Object.keys(ENFORCEMENT_CLASSES)).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// 4. The build-130 contract: the deployed Play build sees the same catalog.
// ---------------------------------------------------------------------------
describe('discriminant · build 130 sees its world unchanged', () => {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  const allSql = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
    .join('\n---\n');

  it('every policy key the client maps exists in the migrations (no dead gate)', () => {
    for (const serverKey of Object.values(SERVER_ENFORCED_FEATURES)) {
      expect(allSql, serverKey).toMatch(new RegExp(`'${serverKey}'`));
    }
  });

  it("the legacy 'tarot' alias row survives (old installed clients still call it)", () => {
    const juno06 = fs.readFileSync(
      path.join(migrationsDir, '20260922000001_juno06_server_enforced_features.sql'),
      'utf8',
    );
    // Kept as a row...
    expect(juno06).toMatch(/feature_key = 'tarot'/);
    // ...and absent from the delete list (which names exactly the three
    // dead seeds — scoping to THIS migration avoids matching unrelated
    // DELETEs elsewhere in the history).
    const del = juno06.match(/DELETE FROM public\.premium_feature_policy[\s\S]{0,400}?;/);
    expect(del).not.toBeNull();
    expect(del![0]).not.toMatch(/'tarot'/);
    expect(del![0]).toMatch(/'compatibility_details', 'priority_messages', 'likes_you_see_who'/);
  });

  it('the 8 preview quotas build 130 spends stay 1/day', () => {
    for (const key of [
      'daily_horoscope',
      'monthly_horoscope',
      'lucky_days',
      'planetary_transits',
      'retrograde_alerts',
      'date_planner',
      'tarot_monthly',
      'tarot_cosmic',
    ]) {
      // The literal per-key statement convention validate-premium-gating
      // reads: `SET free_preview_quota = 1, updated_at = NOW()\n WHERE
      // feature_key = '<key>'` — [^;]* spans the same statement only.
      const re = new RegExp(`SET free_preview_quota = 1[^;]*WHERE feature_key = '${key}'`, 's');
      expect(allSql, key).toMatch(re);
    }
  });

  it('the tarot split keys map as build 130 already knew them', () => {
    expect(SERVER_ENFORCED_FEATURES['weekly-tarot']).toBe('tarot_cosmic');
    expect(SERVER_ENFORCED_FEATURES['monthly-tarot']).toBe('tarot_monthly');
  });
});
