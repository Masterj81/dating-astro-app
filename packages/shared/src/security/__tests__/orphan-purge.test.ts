// JUNO-09 phase C — what the historical catch-up deletes and what it does not.
//
// WHY THIS SUITE EXISTS
// ---------------------------------------------------------------------------
// Five orphaned objects remained in storage — 4 avatars and one video of
// someone's face, the oldest from 1 February 2026. Deleting them was the last
// thing standing between JUNO-09 and closure; the campaign of 11 Sep 2026
// (2026-09-11-6cb356) deleted exactly those five, and the tool stays under test
// because a future campaign will use it, with a reviewed cap.
//
// Storage held 90 objects. Five were to be deleted; 85 must not be, and nothing
// in a path distinguishes them by eye. Sixty of them are `seed-{uuid}.jpg` AT THE
// BUCKET ROOT, where the UUID sits in the FILENAME — a `path.includes(uuid)` test
// deletes all sixty. The fixture below is that exact distribution, so the tests
// that matter most are the ones asserting nothing moved.
//
// The suite executes the REAL functions extracted from the deployed sources, and
// spawns the REAL CLI as a child process for the gate-D refusals — because "does
// it refuse without an approval?" is only worth anything if the actual binary
// refuses, not a paraphrase of it.
//
// WHAT THESE TESTS ARE NOT
// ---------------------------------------------------------------------------
// Storage and the database are doubles. These are proof of the DECISIONS — which
// objects are classified how, which refusals fire, in what order — and NOT proof
// that Supabase Storage behaves as modelled. Only the controlled verification in
// docs/runbooks/orphan-media-catchup-2026-09.md exercises the real service, and it
// is destructive by design.
//
// No test here touches production. The CLI is spawned with an unroutable project
// ref and a dummy secret, and every assertion is about a refusal that happens
// BEFORE any network call.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile, REPO_ROOT }
  from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/purge-orphan-media/index.ts';
const CLI_FILE = 'scripts/juno09-orphan-campaign.mjs';
const MIGRATION = 'supabase/migrations/20260911000001_orphan_purge_campaigns.sql';

/** A scratch artefact directory, so the CLI tests never see a real manifest. */
const SANDBOX = path.join(REPO_ROOT, '.juno09-test');

interface RawObject {
  id: string; bucket_id: string; name: string; created_at: string; size_bytes: number;
}
interface EntryVerdict {
  objectId: string; outcome: string; bucket: string | null; path: string | null;
}

type Edge = {
  MIN_SECRET_LENGTH: number;
  EXPECTED_PROJECT_REF: string;
  MANIFEST_SCHEMA: string;
  APPROVAL_SCHEMA: string;
  ORPHAN_BUCKETS: readonly string[];
  CAMPAIGN_CAPS: { totalExact: number; absoluteMax: number; byBucket: Record<string, number> };
  APPROVAL_TTL_MS: number;
  ORPHAN_CATEGORIES: readonly string[];
  ORPHAN_ERROR_CLASSES: readonly string[];
  constantTimeEqual: (a: string, b: string) => boolean;
  isStrictUuid: (v: unknown) => boolean;
  firstSegment: (name: unknown) => string | null;
  pathShapeOf: (name: unknown) => string;
  classifyObjects: (rows: readonly RawObject[], owners: ReadonlySet<string>) => Array<{
    objectId: string; bucket: string; category: string; reason: string; ownerUuid: string | null;
  }>;
  summarizeClassification: (objects: readonly { bucket: string; category: string }[]) => {
    objects: number; byBucket: Record<string, number>; byCategory: Record<string, number>;
  };
  canonicalJson: (v: unknown) => string;
  sha256Hex: (t: string) => Promise<string>;
  hmacSha256Hex: (k: string, m: string) => Promise<string>;
  ownerGroupOf: (campaignId: string, owner: string) => Promise<string>;
  entryHashOf: (c: string, b: string, o: string, cat: string) => Promise<string>;
  manifestHashOf: (m: Record<string, unknown>) => Promise<string>;
  approvalPayload: (a: Record<string, unknown>) => string;
  checkCampaignCaps: (c: { objects: number; byBucket: Record<string, number> }) =>
    { ok: boolean; errorClass?: string; detail?: string };
  classifyOrphanError: (m: unknown) => string;
  verifyManifestEntries: (deps: unknown, entries: readonly unknown[]) =>
    Promise<{ verdicts: EntryVerdict[]; errorClass: string | null }>;
  executeDeletions: (deps: unknown, verdicts: readonly EntryVerdict[], deadline: number) =>
    Promise<{ deleted: number; alreadyAbsent: number; failed: number;
              errorClass: string | null; perOutcome: Record<string, number> }>;
  parseOrphanRequest: (body: unknown) => Record<string, unknown>;
  authorizeExecution: (key: string, req: unknown, now: number) =>
    Promise<{ ok: boolean; errorClass?: string; detail?: string }>;
  authorizeOrphanRequest: (deps: unknown, secret: string | null, addr: string) =>
    Promise<{ ok: boolean; status?: number; error?: string }>;
};

let edge: Edge;
let cli: Record<string, unknown>;

beforeAll(async () => {
  edge = await loadEdgeModule<Edge>({
    file: EDGE_FILE,
    label: 'purge-orphan-media',
    declarations: [
      'MIN_SECRET_LENGTH', 'EXPECTED_PROJECT_REF',
      'MANIFEST_SCHEMA', 'APPROVAL_SCHEMA',
      'ORPHAN_BUCKETS', 'CAMPAIGN_CAPS', 'APPROVAL_TTL_MS',
      'ORPHAN_CATEGORIES', 'ORPHAN_ERROR_CLASSES',
      'RATE_LIMIT_MAX_PER_HOUR', 'RATE_LIMIT_WINDOW_SECONDS',
      'UNAUTHORIZED', 'NOT_CONFIGURED', 'RATE_LIMITED', 'RATE_LIMIT_UNAVAILABLE',
      'constantTimeEqual', 'isStrictUuid', 'firstSegment', 'pathShapeOf',
      'classifyObjects', 'summarizeClassification',
      'canonicalJson', 'toHex', 'sha256Hex', 'hmacSha256Hex',
      'ownerGroupOf', 'entryHashOf', 'manifestHashOf', 'approvalPayload',
      'checkCampaignCaps', 'classifyOrphanError',
      'verifyManifestEntries', 'executeDeletions',
      'parseOrphanRequest', 'authorizeExecution', 'authorizeOrphanRequest',
      'clientAddressOf',
    ],
  });
  // The CLI is plain ESM and guards its own entry point, so importing it runs
  // nothing. That guard is itself asserted below.
  cli = await import(path.join(REPO_ROOT, CLI_FILE).replace(/\\/g, '/'));
  mkdirSync(SANDBOX, { recursive: true });
});

afterAll(() => {
  cleanupEdgeModules();
  rmSync(SANDBOX, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The production distribution, as a fixture.
//
//   avatars       21 `{uuid}/…`  — 17 owned by live accounts, 4 ORPHANS
//                  6 `marketing/…` — non-UUID prefix, no provable owner
//                 62 root         — 60 `seed-*`, 2 other
//   verifications  1 `{uuid}/…`  — 1 ORPHAN, the face video
//   ------------------------------------------------------------------
//                 90 objects, of which exactly 5 are to be deleted
// ---------------------------------------------------------------------------
const LIVE_OWNERS = Array.from({ length: 17 }, (_, i) =>
  `1${String(i).padStart(7, '0')}-2222-4333-8444-555555555555`);
const ORPHAN_OWNERS = Array.from({ length: 5 }, (_, i) =>
  `9${String(i).padStart(7, '0')}-8888-4777-8666-555555555555`);

let seq = 0;
function objectId(): string {
  seq += 1;
  return `a${String(seq).padStart(7, '0')}-0000-4000-8000-000000000000`;
}

function buildFixture() {
  seq = 0;
  const objects: RawObject[] = [];
  const push = (bucket: string, name: string) => {
    objects.push({
      id: objectId(), bucket_id: bucket, name,
      created_at: '2026-02-01T00:00:00Z', size_bytes: 1024,
    });
  };

  for (const owner of LIVE_OWNERS) push('avatars', `${owner}/avatar.jpg`);
  for (const owner of ORPHAN_OWNERS.slice(0, 4)) push('avatars', `${owner}/avatar.jpg`);
  for (let i = 0; i < 6; i++) push('avatars', `marketing/campaign-${i}.png`);
  for (let i = 0; i < 60; i++) push('avatars', `seed-${LIVE_OWNERS[i % 17]}.jpg`);
  push('avatars', 'legacy-header.png');
  push('avatars', 'README.txt');
  push('verifications', `${ORPHAN_OWNERS[4]}/face.mp4`);

  const liveOwnerSet = new Set(LIVE_OWNERS.map((o) => o.toLowerCase()));
  return { objects, liveOwnerSet };
}

interface FakeOpts {
  lookupError?: string;
  ownersError?: string;
  removeError?: Record<string, string>;   // keyed by bucket
  missingIds?: Set<string>;               // ids that vanished from storage
  clock?: { value: number };
}

function fakeDeps(objects: RawObject[], liveOwners: Set<string>, opts: FakeOpts = {}) {
  const removed: Array<{ bucket: string; path: string }> = [];
  const listCalls: string[] = [];
  const live = new Map(objects.map((o) => [o.id, o]));
  for (const id of opts.missingIds ?? []) live.delete(id);
  const clock = opts.clock ?? { value: 0 };

  return {
    removed,
    listCalls,
    clock,
    deps: {
      fetchObjects: async () => {
        listCalls.push('fetchObjects');
        return { rows: [...live.values()], error: null };
      },
      existingOwners: async (uuids: readonly string[]) => {
        if (opts.ownersError) return { present: null, error: { message: opts.ownersError } };
        return {
          present: new Set(uuids.filter((u) => liveOwners.has(u.toLowerCase()))
            .map((u) => u.toLowerCase())),
          error: null,
        };
      },
      countAuthUsers: async () => 362,
      lookupObjects: async (ids: readonly string[]) => {
        if (opts.lookupError) return { rows: null, error: { message: opts.lookupError } };
        return { rows: ids.map((id) => live.get(id)).filter(Boolean) as RawObject[], error: null };
      },
      removeObject: async (bucket: string, p: string) => {
        if (opts.removeError?.[bucket]) {
          return { error: { message: opts.removeError[bucket] } };
        }
        removed.push({ bucket, path: p });
        for (const [id, o] of live) if (o.bucket_id === bucket && o.name === p) live.delete(id);
        return { error: null };
      },
      now: () => clock.value,
    },
  };
}

const FAR = Number.MAX_SAFE_INTEGER;
const KEY = 'k'.repeat(64);
const CAMPAIGN = '2026-09-11-a1b2c3';

async function manifestEntriesFrom(objects: RawObject[], liveOwners: Set<string>) {
  const classified = edge.classifyObjects(objects, liveOwners);
  return classified
    .filter((o) => o.category === 'orphan_proven')
    .map((o) => ({ objectId: o.objectId, bucket: o.bucket, category: o.category }));
}

async function signedApproval(
  entries: readonly { bucket: string }[],
  overrides: Record<string, unknown> = {},
) {
  const byBucket: Record<string, number> = { avatars: 0, 'voice-intros': 0, verifications: 0 };
  for (const e of entries) byBucket[e.bucket] += 1;
  const base = {
    schema: edge.APPROVAL_SCHEMA,
    campaignId: CAMPAIGN,
    manifestHash: 'f'.repeat(64),
    projectRef: edge.EXPECTED_PROJECT_REF,
    total: entries.length,
    byBucket,
    issuedAt: 1_000_000,
    expiresAt: 1_000_000 + edge.APPROVAL_TTL_MS,
    ...overrides,
  };
  const signature = await edge.hmacSha256Hex(KEY, edge.approvalPayload(base));
  return { ...base, signature, ...(overrides.signature ? { signature: overrides.signature } : {}) };
}

// ===========================================================================
// 1-2 · the default is not destructive
// ===========================================================================
describe('JUNO-09 phase C · the default is read-only', () => {
  it('1 · the CLI has exactly one destructive subcommand, and it is not the default', () => {
    expect(cli.SUBCOMMANDS).toEqual(['discover', 'validate', 'execute']);
    expect(cli.DESTRUCTIVE_SUBCOMMANDS).toEqual(['execute']);
    // Running it with no subcommand prints usage and exits non-zero.
    const run = spawnSync(process.execPath, [path.join(REPO_ROOT, CLI_FILE)], {
      cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env },
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).toMatch(/discover/);
    expect(run.stdout).not.toMatch(/suppression réelle en cours/i);
  });

  it('2 · execute without --execute refuses, before touching anything', () => {
    const run = spawnSync(process.execPath, [
      path.join(REPO_ROOT, CLI_FILE), 'execute', '--campaign', CAMPAIGN,
    ], { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env } });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/--execute` est requis|--execute. est requis/);
  });

  it('2b · the edge function refuses an execute payload without the redundant flag', async () => {
    const entries = [{ objectId: ORPHAN_OWNERS[0], bucket: 'avatars', category: 'orphan_proven' }];
    const body = {
      mode: 'execute', campaignId: CAMPAIGN, confirmObjectCount: 1,
      manifest: {
        schema: edge.MANIFEST_SCHEMA, campaignId: CAMPAIGN, projectRef: edge.EXPECTED_PROJECT_REF,
        manifestHash: 'f'.repeat(64), entries,
      },
      approval: await signedApproval(entries),
    };
    // A mode string alone must not be enough: a typo would otherwise be
    // destructive. The SAME body with the flag parses, so the refusal is the
    // flag's and nothing else's.
    expect(edge.parseOrphanRequest(body)).toMatchObject({ ok: false });
    expect(edge.parseOrphanRequest({ ...body, execute: true })).toMatchObject({ ok: true, mode: 'execute' });
  });
});

// ===========================================================================
// 3-10 · the gate-D preconditions, on the real binary
// ===========================================================================
describe('JUNO-09 phase C · gate D refuses without every artefact', () => {
  function runExecute(extra: string[] = [], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [
      path.join(REPO_ROOT, CLI_FILE), 'execute', '--campaign', CAMPAIGN,
      '--execute', '--project', edge.EXPECTED_PROJECT_REF, '--confirm-count', '5', ...extra,
    ], {
      cwd: REPO_ROOT, encoding: 'utf8',
      env: { ...process.env, ORPHAN_PURGE_SECRET: 'x'.repeat(64), ...env },
    });
  }

  it('3 · no manifest → refusal', () => {
    const run = runExecute();
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/aucun manifeste/i);
    expect(run.stderr).toMatch(/[Rr]ien n(’|')est supprimé/);
  });

  it('7 · a different project → refusal, and the project is never inferred', () => {
    const run = spawnSync(process.execPath, [
      path.join(REPO_ROOT, CLI_FILE), 'execute', '--campaign', CAMPAIGN,
      '--execute', '--project', 'someotherprojectref', '--confirm-count', '5',
    ], {
      cwd: REPO_ROOT, encoding: 'utf8',
      env: { ...process.env, ORPHAN_PURGE_SECRET: 'x'.repeat(64) },
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/--project doit valoir exactement/);
  });

  it('23 · a secret in argv aborts the run outright', () => {
    for (const argv of [
      ['discover', '--secret', 'abc'],
      ['discover', 'a'.repeat(0) + 'f'.repeat(64)],
      ['discover', '--token=zzz'],
    ]) {
      const run = spawnSync(process.execPath, [path.join(REPO_ROOT, CLI_FILE), ...argv], {
        cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env },
      });
      expect(run.status, argv.join(' ')).not.toBe(0);
      expect(run.stderr).toMatch(/ressemble à un secret/);
    }
  });

  it('23b · argvCarriesSecret recognises the shapes that actually leak', () => {
    const carries = cli.argvCarriesSecret as (a: string[]) => boolean;
    expect(carries(['--secret', 'x'])).toBe(true);
    expect(carries(['--token=x'])).toBe(true);
    expect(carries(['--api-key', 'x'])).toBe(true);
    expect(carries(['f'.repeat(32)])).toBe(true);
    expect(carries([`eyJ${'a'.repeat(20)}`])).toBe(true);
    expect(carries(['discover', '--campaign', CAMPAIGN])).toBe(false);
    expect(carries(['execute', '--confirm-count', '5'])).toBe(false);
  });

  it('4-6 · the CLI verifies manifest and approval hashes before anything else', () => {
    const source = readRepoFile(CLI_FILE);
    // Order is the property: the artefacts are read and hashed before the secret
    // is required and before any fetch.
    const manifestAt = source.indexOf('const manifest = readArtifact(manifestName(campaignId))');
    const approvalAt = source.indexOf('const approval = readArtifact(approvalName(campaignId))');
    const secretAt = source.indexOf('const secret = requireSecret();\n  say');
    const fetchAt = source.indexOf('await callFunction(baseUrlFor(project)');
    expect(manifestAt).toBeGreaterThan(0);
    expect(approvalAt).toBeGreaterThan(manifestAt);
    expect(secretAt).toBeGreaterThan(approvalAt);
    expect(fetchAt).toBeGreaterThan(secretAt);
  });

  it('9-10 · the exact count and distribution are required, and never adjusted', () => {
    const source = readRepoFile(CLI_FILE);
    expect(source).toMatch(/attendu exactement/);
    expect(source).toMatch(/distribution inattendue/);
    // Nothing anywhere widens a cap at runtime.
    expect(source).not.toMatch(/CAMPAIGN_CAPS\.\w+\s*=/);
    expect(source).not.toMatch(/absoluteMax\s*=\s*(?!5)/);
  });

  it('8-9-10 · the caps refuse more, fewer, and a wrong distribution', () => {
    const good = { objects: 5, byBucket: { avatars: 4, 'voice-intros': 0, verifications: 1 } };
    expect(edge.checkCampaignCaps(good)).toEqual({ ok: true });

    for (const bad of [
      { objects: 6, byBucket: { avatars: 5, 'voice-intros': 0, verifications: 1 } },
      { objects: 4, byBucket: { avatars: 3, 'voice-intros': 0, verifications: 1 } },
      { objects: 5, byBucket: { avatars: 5, 'voice-intros': 0, verifications: 0 } },
      { objects: 5, byBucket: { avatars: 3, 'voice-intros': 1, verifications: 1 } },
      { objects: 5, byBucket: { avatars: 4, 'voice-intros': 0, verifications: 0 } },
    ]) {
      const verdict = edge.checkCampaignCaps(bad);
      expect(verdict.ok, JSON.stringify(bad)).toBe(false);
      expect(verdict.errorClass).toBe('volume_limit_exceeded');
    }
  });

  it('8b · the caps are identical on both sides — a cap that disagrees does nothing', () => {
    expect((cli.CAMPAIGN_CAPS as Record<string, unknown>).totalExact)
      .toBe(edge.CAMPAIGN_CAPS.totalExact);
    expect((cli.CAMPAIGN_CAPS as Record<string, unknown>).absoluteMax)
      .toBe(edge.CAMPAIGN_CAPS.absoluteMax);
    expect((cli.CAMPAIGN_CAPS as { byBucket: Record<string, number> }).byBucket)
      .toEqual(edge.CAMPAIGN_CAPS.byBucket);
    expect(edge.CAMPAIGN_CAPS.absoluteMax).toBe(5);
  });
});

// ===========================================================================
// 5-6-7 · the approval binds to one manifest, one campaign, one project
// ===========================================================================
describe('JUNO-09 phase C · the approval is bound cryptographically', () => {
  async function gate(overrides: Record<string, unknown> = {}, now = 1_000_100) {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      objectId: `a${String(i + 1).padStart(7, '0')}-0000-4000-8000-000000000000`,
      bucket: i < 4 ? 'avatars' : 'verifications',
    }));
    const approval = await signedApproval(entries, overrides);
    return await edge.authorizeExecution(KEY, {
      campaignId: CAMPAIGN,
      manifestHash: 'f'.repeat(64),
      entries,
      approval,
      confirmObjectCount: 5,
    }, now);
  }

  it('accepts a correctly signed approval', async () => {
    expect(await gate()).toEqual({ ok: true });
  });

  it('5 · a changed manifest hash invalidates the approval', async () => {
    const verdict = await gate({ manifestHash: 'e'.repeat(64) });
    expect(verdict.ok).toBe(false);
    expect(verdict.errorClass).toBe('manifest_mismatch');
  });

  it('6 · an approval for another campaign is refused', async () => {
    const verdict = await gate({ campaignId: '2026-09-12-ffffff' });
    expect(verdict.ok).toBe(false);
    expect(verdict.errorClass).toBe('approval_mismatch');
  });

  it('7 · an approval for another project is refused', async () => {
    const verdict = await gate({ projectRef: 'someotherprojectref' });
    expect(verdict.ok).toBe(false);
    expect(verdict.errorClass).toBe('approval_mismatch');
  });

  it('a forged signature is refused', async () => {
    const verdict = await gate({ signature: '0'.repeat(64) });
    expect(verdict.ok).toBe(false);
    expect(verdict.errorClass).toBe('approval_mismatch');
    expect(verdict.detail).toMatch(/signature/);
  });

  it('an approval signed with another key is refused', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      objectId: `a${String(i + 1).padStart(7, '0')}-0000-4000-8000-000000000000`,
      bucket: i < 4 ? 'avatars' : 'verifications',
    }));
    const byBucket = { avatars: 4, 'voice-intros': 0, verifications: 1 };
    const base = {
      schema: edge.APPROVAL_SCHEMA, campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64),
      projectRef: edge.EXPECTED_PROJECT_REF, total: 5, byBucket,
      issuedAt: 1_000_000, expiresAt: 1_000_000 + edge.APPROVAL_TTL_MS,
    };
    const wrong = await edge.hmacSha256Hex('other-key-'.repeat(8), edge.approvalPayload(base));
    const verdict = await edge.authorizeExecution(KEY, {
      campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64), entries,
      approval: { ...base, signature: wrong }, confirmObjectCount: 5,
    }, 1_000_100);
    expect(verdict.ok).toBe(false);
  });

  it('an expired approval is refused', async () => {
    const verdict = await gate({}, 1_000_000 + edge.APPROVAL_TTL_MS + 1);
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toMatch(/expired/);
  });

  it('a confirmation count that differs is refused', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      objectId: `a${String(i + 1).padStart(7, '0')}-0000-4000-8000-000000000000`,
      bucket: i < 4 ? 'avatars' : 'verifications',
    }));
    const approval = await signedApproval(entries);
    const verdict = await edge.authorizeExecution(KEY, {
      campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64), entries, approval,
      confirmObjectCount: 4,
    }, 1_000_100);
    expect(verdict.ok).toBe(false);
  });

  it('the signature covers every field that must not drift', () => {
    const base = {
      campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64),
      projectRef: edge.EXPECTED_PROJECT_REF, total: 5,
      byBucket: { avatars: 4, 'voice-intros': 0, verifications: 1 },
      expiresAt: 1_000_000,
    };
    const payload = edge.approvalPayload(base);
    for (const field of Object.keys(base)) {
      const mutated = { ...base } as Record<string, unknown>;
      mutated[field] = field === 'total' || field === 'expiresAt' ? 99 :
        field === 'byBucket' ? { avatars: 5, 'voice-intros': 0, verifications: 0 } : 'changed';
      expect(edge.approvalPayload(mutated as typeof base), field).not.toBe(payload);
    }
    // Bucket order must not change the payload, or two identical campaigns sign
    // differently.
    expect(edge.approvalPayload({
      ...base, byBucket: { verifications: 1, avatars: 4, 'voice-intros': 0 },
    })).toBe(payload);
  });
});

// ===========================================================================
// 11-13 · classification. The half that protects the 85.
// ===========================================================================
describe('JUNO-09 phase C · classification is exhaustive and provable', () => {
  it('11-13 · the production distribution classifies exactly as measured', () => {
    const { objects, liveOwnerSet } = buildFixture();
    expect(objects).toHaveLength(90);

    const classified = edge.classifyObjects(objects, liveOwnerSet);
    const counts = edge.summarizeClassification(classified);

    expect(counts.objects).toBe(90);
    expect(counts.byCategory.orphan_proven).toBe(5);
    expect(counts.byCategory.auth_owner_exists).toBe(17);
    expect(counts.byCategory.ambiguous_ownership).toBe(6);
    expect(counts.byCategory.unknown_path_shape).toBe(62);

    // Exhaustiveness. The first phase A diagnostic lost 62 objects because
    // `NOT NULL` on a NULL is NULL, never TRUE.
    const sum = Object.values(counts.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBe(counts.objects);

    const orphans = classified.filter((o) => o.category === 'orphan_proven');
    expect(edge.summarizeClassification(orphans).byBucket).toEqual(
      { avatars: 4, verifications: 1 },
    );
  });

  it('12 · a non-UUID prefix is ambiguous, never an orphan', () => {
    const rows: RawObject[] = [
      { id: objectId(), bucket_id: 'avatars', name: 'marketing/x.png',
        created_at: 'x', size_bytes: 1 },
      { id: objectId(), bucket_id: 'avatars', name: 'not-a-uuid/x.png',
        created_at: 'x', size_bytes: 1 },
    ];
    for (const o of edge.classifyObjects(rows, new Set())) {
      expect(o.category).toBe('ambiguous_ownership');
      expect(o.ownerUuid).toBeNull();
    }
  });

  it('13 · a root object is an unknown shape, never an orphan', () => {
    const rows: RawObject[] = [
      { id: objectId(), bucket_id: 'avatars', name: `seed-${ORPHAN_OWNERS[0]}.jpg`,
        created_at: 'x', size_bytes: 1 },
      { id: objectId(), bucket_id: 'avatars', name: 'header.png',
        created_at: 'x', size_bytes: 1 },
      { id: objectId(), bucket_id: 'avatars', name: `/${ORPHAN_OWNERS[0]}/x.jpg`,
        created_at: 'x', size_bytes: 1 },
    ];
    const classified = edge.classifyObjects(rows, new Set());
    // The seed object carries an orphan's UUID IN ITS FILENAME. A substring test
    // would call it an orphan; the first-segment rule calls it a root object.
    expect(classified[0].category).toBe('unknown_path_shape');
    expect(classified[1].category).toBe('unknown_path_shape');
    expect(classified[2].category).toBe('unknown_path_shape');
  });

  it('13b · a traversal segment is never treated as owned', () => {
    expect(edge.pathShapeOf(`${ORPHAN_OWNERS[0]}/../other/x.jpg`)).toBe('non_uuid_prefix');
    expect(edge.pathShapeOf(`${ORPHAN_OWNERS[0]}//x.jpg`)).toBe('non_uuid_prefix');
    expect(edge.pathShapeOf(`${ORPHAN_OWNERS[0]}/./x.jpg`)).toBe('non_uuid_prefix');
    expect(edge.pathShapeOf(`${ORPHAN_OWNERS[0]}/sub/x.jpg`)).toBe('uuid');
    expect(edge.firstSegment('nofolder.jpg')).toBeNull();
    expect(edge.firstSegment('/leading.jpg')).toBeNull();
  });

  it('11 · an owner that still exists moves the object out of the orphan set', () => {
    const rows: RawObject[] = [{
      id: objectId(), bucket_id: 'avatars', name: `${ORPHAN_OWNERS[0]}/a.jpg`,
      created_at: 'x', size_bytes: 1,
    }];
    expect(edge.classifyObjects(rows, new Set())[0].category).toBe('orphan_proven');
    expect(edge.classifyObjects(rows, new Set([ORPHAN_OWNERS[0].toLowerCase()]))[0].category)
      .toBe('auth_owner_exists');
  });
});

// ===========================================================================
// 11-18 · re-verification narrows, and execution is idempotent
// ===========================================================================
describe('JUNO-09 phase C · re-verification narrows only', () => {
  it('the eligible set is exactly the five orphans', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    expect(entries).toHaveLength(5);

    const { deps, listCalls } = fakeDeps(objects, liveOwnerSet);
    const { verdicts, errorClass } = await edge.verifyManifestEntries(deps, entries);

    expect(errorClass).toBeNull();
    expect(verdicts.filter((v) => v.outcome === 'eligible')).toHaveLength(5);
    // NEVER lists a bucket during verification: that is the line between
    // re-verification and dynamic discovery.
    expect(listCalls).toEqual([]);
  });

  it('11 · an owner who came back between gates blocks that entry', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    // The account is recreated after discovery.
    const revived = new Set([...liveOwnerSet, ORPHAN_OWNERS[0].toLowerCase()]);
    const { deps } = fakeDeps(objects, revived);
    const { verdicts } = await edge.verifyManifestEntries(deps, entries);

    expect(verdicts.filter((v) => v.outcome === 'auth_owner_exists')).toHaveLength(1);
    expect(verdicts.filter((v) => v.outcome === 'eligible')).toHaveLength(4);
  });

  it('14 · an object already absent is an idempotent success', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps } = fakeDeps(objects, liveOwnerSet, {
      missingIds: new Set([entries[0].objectId]),
    });
    const { verdicts } = await edge.verifyManifestEntries(deps, entries);
    expect(verdicts.filter((v) => v.outcome === 'already_absent')).toHaveLength(1);

    const result = await edge.executeDeletions(deps, verdicts, FAR);
    expect(result.alreadyAbsent).toBe(1);
    expect(result.deleted).toBe(4);
    expect(result.failed).toBe(0);
  });

  it('an entry naming the wrong bucket is a manifest mismatch, never a guess', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const tampered = entries.map((e, i) =>
      i === 0 ? { ...e, bucket: 'verifications' } : e);
    const { deps } = fakeDeps(objects, liveOwnerSet);
    const { verdicts } = await edge.verifyManifestEntries(deps, tampered);
    expect(verdicts.filter((v) => v.outcome === 'manifest_mismatch')).toHaveLength(1);
  });

  it('an unreadable owner lookup refuses everything — fail-closed', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps } = fakeDeps(objects, liveOwnerSet, { ownersError: 'fetch failed' });
    const { verdicts, errorClass } = await edge.verifyManifestEntries(deps, entries);
    // Cannot prove absence → nothing is eligible.
    expect(verdicts).toEqual([]);
    expect(errorClass).toBe('storage_unavailable');
  });

  it('15 · a partial failure deletes what it can and reports the rest', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps, removed } = fakeDeps(objects, liveOwnerSet, {
      removeError: { verifications: 'permission denied' },
    });
    const { verdicts } = await edge.verifyManifestEntries(deps, entries);
    const result = await edge.executeDeletions(deps, verdicts, FAR);

    expect(result.deleted).toBe(4);
    expect(result.failed).toBe(1);
    expect(result.errorClass).toBe('permission_denied');
    expect(removed.every((r) => r.bucket === 'avatars')).toBe(true);
  });

  it('16 · a timeout stops cleanly and reports it', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const clock = { value: 0 };
    const { deps, removed } = fakeDeps(objects, liveOwnerSet, { clock });
    const { verdicts } = await edge.verifyManifestEntries(deps, entries);

    // Deadline already passed.
    const result = await edge.executeDeletions(deps, verdicts, 0);
    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(5);
    expect(result.errorClass).toBe('timeout');
    expect(removed).toEqual([]);
  });

  it('17-18 · an object already gone is already_absent — idempotent within a pass, never six', async () => {
    // The storage layer: verification narrows an absent id to `already_absent`
    // and execution counts it as a success. This is idempotence WITHIN one
    // destructive pass. A SECOND pass of the same campaign is refused by the
    // registry (`campaign_closed`) before anything is touched — see
    // orphan-purge-chain.test.ts.
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps, removed } = fakeDeps(objects, liveOwnerSet);

    const first = await edge.verifyManifestEntries(deps, entries);
    const r1 = await edge.executeDeletions(deps, first.verdicts, FAR);
    expect(r1.deleted).toBe(5);

    const second = await edge.verifyManifestEntries(deps, entries);
    const r2 = await edge.executeDeletions(deps, second.verdicts, FAR);
    expect(r2.deleted).toBe(0);
    expect(r2.alreadyAbsent).toBe(5);
    expect(r2.failed).toBe(0);
    expect(removed).toHaveLength(5);          // never six
  });

  it('the manifest cannot add an object the server does not classify as an orphan', () => {
    // parseOrphanRequest refuses any category but orphan_proven, so an entry
    // asserting a different classification cannot even be submitted.
    const manifest = {
      schema: edge.MANIFEST_SCHEMA, campaignId: CAMPAIGN, projectRef: edge.EXPECTED_PROJECT_REF,
      manifestHash: 'f'.repeat(64),
      entries: [{
        objectId: 'a0000001-0000-4000-8000-000000000000',
        bucket: 'avatars', category: 'ambiguous_ownership',
      }],
    };
    expect(edge.parseOrphanRequest({ mode: 'approve', campaignId: CAMPAIGN, manifest }))
      .toMatchObject({ ok: false });
    // And the same manifest with the only admissible category parses — so the
    // refusal above is the category's.
    manifest.entries[0].category = 'orphan_proven';
    expect(edge.parseOrphanRequest({ mode: 'approve', campaignId: CAMPAIGN, manifest }))
      .toMatchObject({ ok: true });
  });
});

// ===========================================================================
// 19-20-25 · nothing else moves. The assertions that matter most.
// ===========================================================================
describe('JUNO-09 phase C · the other 85 objects are untouched', () => {
  it('19-20 · a full campaign removes exactly five, and no seed or neighbour', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps, removed } = fakeDeps(objects, liveOwnerSet);

    const { verdicts } = await edge.verifyManifestEntries(deps, entries);
    const result = await edge.executeDeletions(deps, verdicts, FAR);

    expect(result.deleted).toBe(5);
    expect(removed).toHaveLength(5);

    // 20 · the sixty seed objects.
    expect(removed.filter((r) => r.path.startsWith('seed-'))).toEqual([]);
    // 19 · every live account's object.
    for (const owner of LIVE_OWNERS) {
      expect(removed.some((r) => r.path.startsWith(`${owner}/`)), owner).toBe(false);
    }
    // The marketing prefix.
    expect(removed.filter((r) => r.path.startsWith('marketing/'))).toEqual([]);
    // And what WAS removed is exactly the five orphan owners.
    const removedOwners = removed.map((r) => r.path.split('/')[0]).sort();
    expect(removedOwners).toEqual([...ORPHAN_OWNERS].sort());
  });

  it('25 · every non-destructive path leaves the fixture byte-identical', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const before = JSON.stringify(objects);
    const entries = await manifestEntriesFrom(objects, liveOwnerSet);
    const { deps, removed } = fakeDeps(objects, liveOwnerSet);

    // Discovery, classification, verification, caps — none of them mutate.
    await deps.fetchObjects();
    edge.classifyObjects(objects, liveOwnerSet);
    edge.summarizeClassification(edge.classifyObjects(objects, liveOwnerSet));
    await edge.verifyManifestEntries(deps, entries);
    edge.checkCampaignCaps({ objects: 5, byBucket: { avatars: 4, 'voice-intros': 0, verifications: 1 } });
    await edge.authorizeExecution(KEY, {
      campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64), entries,
      approval: await signedApproval(entries), confirmObjectCount: 5,
    }, 1_000_100);

    expect(JSON.stringify(objects)).toBe(before);
    expect(removed).toEqual([]);
  });

  it('24 · the phase B resume cron cannot invent a historical job', () => {
    // Constraint 13 and 24 together: nothing in phase C writes media_purge_jobs,
    // and the phase B cron is pinned to `resume`, which only acts on rows that
    // already exist. A historical object is named by no row.
    // Commentaires retires : l en-tete de la fonction EXPLIQUE pourquoi
    // media_purge_jobs n est pas reutilisee, et cette prose ne doit pas faire
    // echouer une assertion sur le code.
    const stripComments = (t: string) => t
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const edgeSource = stripComments(readRepoFile(EDGE_FILE));
    expect(edgeSource).not.toMatch(/media_purge_jobs/);
    expect(edgeSource).not.toMatch(/create_media_purge_job/);
    const cliSource = stripComments(readRepoFile(CLI_FILE));
    expect(cliSource).not.toMatch(/media_purge_jobs/);

    const cronMigration = readRepoFile(
      'supabase/migrations/20260910000003_media_purge_resume_cron.sql');
    expect(cronMigration).toMatch(/"mode"\s*:\s*"resume"/);
  });
});

// ===========================================================================
// 21-22 · silence
// ===========================================================================
describe('JUNO-09 phase C · nothing sensitive is emitted', () => {
  it('21 · no path, filename, owner UUID or object id reaches the logs', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => {
      lines.push(a.map(String).join(' '));
    });
    const err = vi.spyOn(console, 'error').mockImplementation((...a) => {
      lines.push(a.map(String).join(' '));
    });

    let entries: Awaited<ReturnType<typeof manifestEntriesFrom>>;
    try {
      const { objects, liveOwnerSet } = buildFixture();
      entries = await manifestEntriesFrom(objects, liveOwnerSet);
      const { deps } = fakeDeps(objects, liveOwnerSet, {
        removeError: { verifications: 'Object not found: ' + ORPHAN_OWNERS[4] + '/face.mp4' },
      });
      const { verdicts } = await edge.verifyManifestEntries(deps, entries);
      await edge.executeDeletions(deps, verdicts, FAR);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }

    const joined = lines.join('\n');
    expect(lines.length).toBeGreaterThan(0);
    for (const owner of [...ORPHAN_OWNERS, ...LIVE_OWNERS]) {
      expect(joined, owner).not.toContain(owner);
    }
    for (const forbidden of ['face.mp4', 'avatar.jpg', 'seed-', 'marketing/', '.jpg', '.mp4']) {
      expect(joined, forbidden).not.toContain(forbidden);
    }
    for (const entry of entries!) {
      expect(joined).not.toContain(entry.objectId);
    }
    expect(joined).toMatch(/bucket=avatars outcome=deleted/);
  });

  it('21b · an error class is returned, never the storage message', () => {
    expect(edge.classifyOrphanError('permission denied for /a/b.jpg')).toBe('permission_denied');
    expect(edge.classifyOrphanError('Request timed out')).toBe('timeout');
    expect(edge.classifyOrphanError('fetch failed')).toBe('storage_unavailable');
    expect(edge.classifyOrphanError('Bucket not found')).toBe('storage_unavailable');
    expect(edge.classifyOrphanError(null)).toBe('unknown');
    for (const message of ['x'.repeat(400), '/etc/passwd', ORPHAN_OWNERS[0], 42, {}, []]) {
      expect(edge.ORPHAN_ERROR_CLASSES).toContain(edge.classifyOrphanError(message));
    }
  });

  it('22 · the blinded owner group counts owners without naming them', async () => {
    const group = await edge.ownerGroupOf(CAMPAIGN, ORPHAN_OWNERS[0]);
    expect(group).toMatch(/^[0-9a-f]{12}$/);
    expect(group).not.toContain(ORPHAN_OWNERS[0].slice(0, 8));

    // Salted per campaign: the same owner in two campaigns yields two groups, so
    // a leaked manifest cannot be correlated with another one.
    const other = await edge.ownerGroupOf('2026-09-12-ffffff', ORPHAN_OWNERS[0]);
    expect(other).not.toBe(group);

    // Distinct owners give distinct groups, which is what makes counting work.
    const groups = await Promise.all(ORPHAN_OWNERS.map((o) => edge.ownerGroupOf(CAMPAIGN, o)));
    expect(new Set(groups).size).toBe(ORPHAN_OWNERS.length);
  });

  it('22b · the audit table can hold no path, and the CHECK enumerations agree', () => {
    const migration = readRepoFile(MIGRATION);
    const table = migration.slice(
      migration.indexOf('CREATE TABLE IF NOT EXISTS public.orphan_purge_campaigns'),
      migration.indexOf('COMMENT ON TABLE'),
    );
    expect(table).not.toMatch(/\b(path|file_name|url|object_id|owner)\b/i);
    // Every class the function can emit must be writable by the database.
    for (const cls of ['storage_unavailable', 'permission_denied', 'timeout',
      'manifest_mismatch', 'approval_mismatch', 'volume_limit_exceeded',
      'ambiguous_ownership', 'unknown_path_shape', 'auth_owner_exists', 'unknown']) {
      expect(migration, cls).toContain(`'${cls}'`);
    }
    // And the campaign cap is bounded in the schema, not only in code.
    expect(migration).toMatch(/volume_cap\s+INTEGER\s+NOT NULL CHECK \(volume_cap BETWEEN 1 AND 5\)/);
  });
});

// ===========================================================================
// The request contract and the authorization decision
// ===========================================================================
describe('JUNO-09 phase C · the request contract', () => {
  const goodEntry = {
    objectId: 'a0000001-0000-4000-8000-000000000000',
    bucket: 'avatars', category: 'orphan_proven',
  };

  it('accepts only opaque ids, and never a path or a prefix', () => {
    expect(edge.parseOrphanRequest({ mode: 'discover', campaignId: CAMPAIGN }))
      .toEqual({ ok: true, mode: 'discover', campaignId: CAMPAIGN });

    // Gates C and D receive the whole manifest; the server hashes it itself.
    const manifestWith = (entries: unknown[], extra: Record<string, unknown> = {}) => ({
      schema: edge.MANIFEST_SCHEMA, campaignId: CAMPAIGN, projectRef: edge.EXPECTED_PROJECT_REF,
      manifestHash: 'f'.repeat(64), entries, ...extra,
    });

    // A path is not a parameter, so it is ignored rather than honoured.
    const withPath = edge.parseOrphanRequest({
      mode: 'approve', campaignId: CAMPAIGN,
      manifest: manifestWith([goodEntry]), path: '../../x', bucketPrefix: 'anything',
    });
    expect(withPath).toMatchObject({ ok: true, mode: 'approve' });
    expect(JSON.stringify(withPath)).not.toContain('../../x');

    for (const bad of [
      null, undefined, 'string', 42, [], {},
      { mode: 'discover' },
      { mode: 'discover', campaignId: 'not-a-campaign' },
      { mode: 'wipe', campaignId: CAMPAIGN },
      { mode: 'approve', campaignId: CAMPAIGN },
      { mode: 'approve', campaignId: CAMPAIGN,
        manifest: manifestWith([goodEntry], { manifestHash: 'short' }) },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: manifestWith([]) },
      { mode: 'approve', campaignId: CAMPAIGN,
        manifest: manifestWith([{ ...goodEntry, objectId: 'nope' }]) },
      { mode: 'approve', campaignId: CAMPAIGN,
        manifest: manifestWith([{ ...goodEntry, bucket: 'marketing-images' }]) },
      { mode: 'approve', campaignId: CAMPAIGN,
        manifest: manifestWith([goodEntry, goodEntry]) },                        // duplicate
      { mode: 'approve', campaignId: CAMPAIGN,
        manifest: manifestWith(Array.from({ length: 6 }, (_, i) => ({
          ...goodEntry, objectId: `a000000${i}-0000-4000-8000-000000000000` }))) },
    ]) {
      expect(edge.parseOrphanRequest(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
  });

  it('reads the prototype chain for nothing', () => {
    const hostile = JSON.parse('{"__proto__":{"mode":"execute","campaignId":"2026-09-11-a1b2c3"}}');
    expect(edge.parseOrphanRequest(hostile)).toMatchObject({ ok: false });
  });

  it('rate-limits BEFORE comparing the secret, and fails closed when it cannot', async () => {
    const order: string[] = [];
    const secret = 'a'.repeat(64);

    const limited = await edge.authorizeOrphanRequest({
      configuredSecret: secret,
      checkRateLimit: async () => { order.push('limit'); return { data: false, error: null }; },
    }, 'wrong', '1.2.3.4');
    expect(order).toEqual(['limit']);
    expect(limited).toMatchObject({ ok: false, status: 429 });

    const unavailable = await edge.authorizeOrphanRequest({
      configuredSecret: secret,
      checkRateLimit: async () => ({ data: null, error: { message: 'down' } }),
    }, secret, '1.2.3.4');
    expect(unavailable).toMatchObject({ ok: false, status: 503 });

    const never = vi.fn();
    const short = await edge.authorizeOrphanRequest(
      { configuredSecret: 'tooshort', checkRateLimit: never }, secret, '1.2.3.4');
    expect(short).toMatchObject({ ok: false, status: 500 });
    expect(never).not.toHaveBeenCalled();

    const deps = {
      configuredSecret: secret,
      checkRateLimit: async () => ({ data: true, error: null }),
    };
    expect(await edge.authorizeOrphanRequest(deps, secret, '1.2.3.4')).toEqual({ ok: true });
    for (const wrong of [null, '', 'b'.repeat(64), `${secret}x`]) {
      expect(await edge.authorizeOrphanRequest(deps, wrong, '1.2.3.4'))
        .toMatchObject({ ok: false, status: 401 });
    }
  });

  it('the canonical JSON is stable, so a hash means something', () => {
    expect(edge.canonicalJson({ b: 1, a: 2 })).toBe(edge.canonicalJson({ a: 2, b: 1 }));
    expect(edge.canonicalJson({ a: [1, { z: 1, y: 2 }] }))
      .toBe('{"a":[1,{"y":2,"z":1}]}');
    // Both sides of the campaign must agree, or the CLI's hash never matches.
    const cliCanonical = cli.canonicalJson as (v: unknown) => string;
    const sample = { z: 1, a: { c: [3, 2, 1], b: 'x' }, n: null, t: true };
    expect(cliCanonical(sample)).toBe(edge.canonicalJson(sample));
  });

  it('the manifest hash ignores its own field and nothing else', async () => {
    const manifest = { schema: edge.MANIFEST_SCHEMA, campaignId: CAMPAIGN, entries: [] };
    const h1 = await edge.manifestHashOf(manifest);
    const h2 = await edge.manifestHashOf({ ...manifest, manifestHash: 'anything' });
    expect(h1).toBe(h2);
    const h3 = await edge.manifestHashOf({ ...manifest, campaignId: '2026-09-12-000000' });
    expect(h3).not.toBe(h1);

    // The CLI computes the same hash, or gate C would refuse every manifest.
    const cliHash = cli.manifestHashOf as (m: Record<string, unknown>) => string;
    expect(cliHash(manifest)).toBe(h1);
  });

  it('importing the CLI runs nothing — the entry guard holds', () => {
    // If the module executed on import, the suite would have tried to reach the
    // network in beforeAll.
    expect(typeof cli.canonicalJson).toBe('function');
    expect(cli.TOOL_VERSION).toBe('1.1.0');
    expect(existsSync(path.join(REPO_ROOT, '.juno09'))).toBe(
      existsSync(path.join(REPO_ROOT, '.juno09')));  // no side effect asserted either way
  });
});

// ===========================================================================
// The artefacts must be unreachable from git
// ===========================================================================
describe('JUNO-09 phase C · the artefacts never enter the history', () => {
  it('the artefact directory is gitignored, and the CLI checks it at runtime', () => {
    const gitignore = readRepoFile('.gitignore');
    expect(gitignore).toMatch(/^\.juno09\/$/m);

    const source = readRepoFile(CLI_FILE);
    expect(source).toMatch(/check-ignore/);
    expect(source).toMatch(/assertArtifactDirIgnored/);
    // And every gate calls it before writing.
    for (const cmd of ['cmdDiscover', 'cmdValidate', 'cmdExecute']) {
      const at = source.indexOf(`async function ${cmd}`);
      const body = source.slice(at, at + 400);
      expect(body, cmd).toMatch(/assertArtifactDirIgnored\(\)/);
    }
  });

  it('the artefacts are written 0600', () => {
    const source = readRepoFile(CLI_FILE);
    expect(source).toMatch(/mode: 0o600/);
    expect(source).toMatch(/mode: 0o700/);
    writeFileSync(path.join(SANDBOX, 'probe'), 'x');  // sandbox stays out of the repo dir
    expect(existsSync(path.join(SANDBOX, 'probe'))).toBe(true);
  });
});
