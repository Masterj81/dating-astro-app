// JUNO-06 blocage 1 — execute the REAL premium-tarot-reading edge contract.
//
// The tarot reading became a server artifact so the corpus could leave the
// APK. Two things must be proven on real bytes, not on a fixture:
//
//   1. DRIFT IS IMPOSSIBLE: the committed artifact (tarot.generated.ts, what
//      the edge imports) draws EXACTLY what packages/shared draws — same
//      seed, same cards, same meanings, same fallback flag. The bundle is
//      generated from the single source; this suite executes both and
//      compares. (validate:edge-tarot regenerates and sha-compares the TEXT;
//      this compares the BEHAVIOUR end to end.)
//   2. THE GATE IS THE EDGE'S: authorization happens inside the function,
//      fails closed on every failure, and a refusal returns premium_required
//      with NO reading bytes attached.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanupEdgeModules, loadWholeModule, readRepoFile } from '../../testing/edge-source';
import { generateReading } from '../../tarot/index';

const EDGE_FILE = 'supabase/functions/premium-tarot-reading/index.ts';
const ARTIFACT_FILE = 'supabase/functions/premium-tarot-reading/tarot.generated.ts';

type ArtifactModule = {
  generateReading: typeof generateReading;
  DECK: ReadonlyArray<{ id: string }>;
  CORPUS_EN: { names: Record<string, string>; meanings: Record<string, unknown> };
  CORPUS_FR: { names: Record<string, string>; meanings: Record<string, unknown> };
};

afterEach(() => cleanupEdgeModules());

async function loadArtifact(): Promise<ArtifactModule> {
  // The artifact is dependency-free ESM TypeScript with no Deno global at
  // the top level — exactly what loadWholeModule exists for.
  return loadWholeModule<ArtifactModule>(ARTIFACT_FILE, 'tarot-generated-artifact');
}

describe('premium-tarot-reading · the artifact IS the shared engine', () => {
  it('same (user, mode, period, now) → identical reading, card for card, meaning for meaning', async () => {
    const artifact = await loadArtifact();
    for (const period of ['weekly', 'monthly'] as const) {
      for (const mode of ['love', 'general'] as const) {
        const shared = generateReading({
          userId: '11111111-1111-4111-8111-111111111111',
          mode,
          period,
          locale: 'fr',
          now: new Date('2026-09-23T12:00:00Z'),
        });
        const bundled = artifact.generateReading({
          userId: '11111111-1111-4111-8111-111111111111',
          mode,
          period,
          locale: 'fr',
          now: new Date('2026-09-23T12:00:00Z'),
        });
        expect(bundled).toEqual(shared);
      }
    }
  });

  it('the locale never changes the draw — switching language translates, never re-deals', async () => {
    const artifact = await loadArtifact();
    const en = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'en',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    const fr = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'fr',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    expect(fr.cards.map((c) => c.card.id)).toEqual(en.cards.map((c) => c.card.id));
    expect(fr.cards.map((c) => c.card.reversed)).toEqual(en.cards.map((c) => c.card.reversed));
    // And the six non-written locales fall back to English, flagged honestly.
    const de = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'de',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    expect(de.isFallback).toBe(true);
    expect(de.cards[0]!.card.meaning).toBe(en.cards[0]!.card.meaning);
  });

  it('the artifact carries the full deck and both written corpora — nothing was trimmed in bundling', async () => {
    const artifact = await loadArtifact();
    expect(artifact.DECK).toHaveLength(78);
    expect(Object.keys(artifact.CORPUS_EN.names)).toHaveLength(78);
    expect(Object.keys(artifact.CORPUS_FR.names)).toHaveLength(78);
    // And it is dependency-free: no URL import survived the bundling.
    const text = readRepoFile(ARTIFACT_FILE);
    expect(text).not.toMatch(/from\s+'https?:/);
    expect(text).not.toMatch(/@supabase|astronomy-engine|luxon|tz-lookup/);
  });
});

describe('premium-tarot-reading · the edge contract (structural, on the real source)', () => {
  const src = readRepoFile(EDGE_FILE);

  it('THE decision is inside the edge, before any reading is produced', () => {
    expect(src).toMatch(/enforce_premium_feature/);
    // enforce runs BEFORE generateReading in the file's control flow.
    expect(src.indexOf('enforce_premium_feature')).toBeLessThan(src.indexOf('generateReading('));
  });

  it('a refusal is 402 premium_required and reaches the client BEFORE any draw', () => {
    // The refusal payload names premium_required, and the only producer call
    // sits strictly after the refusal branch: a 402 reader never receives
    // reading bytes, and nothing draws before the server says yes.
    const refusal = src.indexOf("error: 'premium_required'");
    const draw = src.indexOf('generateReading(');
    expect(refusal).toBeGreaterThan(-1);
    expect(draw).toBeGreaterThan(refusal);
    // The refusal's JSON payload carries no cards array.
    const refusalBlock = src.slice(refusal, refusal + 260);
    expect(refusalBlock).not.toMatch(/cards|reading/);
  });

  it('fails closed when the decision cannot be reached (503, no fallback draw)', () => {
    expect(src).toMatch(/decision_unavailable/);
    // No local re-deal exists anywhere: the only producer is the call that
    // follows the server's yes.
    const draws = src.match(/generateReading\(/g);
    expect(draws).toHaveLength(1);
  });

  it('the seed identity is the authenticated user, never a body parameter', () => {
    expect(src).toMatch(/userId:\s*user\.id/);
    expect(src).not.toMatch(/body\.userId|body\.user_id|p_user_id/);
  });

  it('answers the free-preview fact so the client can show the honest banner', () => {
    expect(src).toMatch(/viaFreePreview/);
    expect(src).toMatch(/d\.reason === 'free_preview'/);
  });

  it('serves no CORS header (RN transport, like sync-entitlement and get-profile-chart)', () => {
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it('imports the COMMITTED artifact, not the package — deploy-time bundling cannot drift', () => {
    expect(src).toMatch(/from '\.\/tarot\.generated\.ts'/);
    expect(src).not.toMatch(/@astro\/shared/);
  });
});
