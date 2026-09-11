// JUNO-09 phase C — the gates, chained.
//
// Every gate had a test, and every gate passed it, alone. On 11 September 2026
// the first production run reached gate C with the registry empty: discovery had
// assembled the manifest on the workstation and recorded nothing, so approval was
// refused as `manifest_mismatch` for a campaign the database had never seen. The
// 49 tests beside this file had asserted each gate against a double, and none had
// asserted what the gate before it leaves behind.
//
// This suite runs the REAL gate functions — extracted from the deployed source —
// in sequence, against a registry double that enforces the migration's own
// refusals (`campagne inconnue`, `empreinte differente`, `non approuvee`, one pass
// per campaign). What it proves is the chain: what discovery records, what
// approval requires, what execution reads BEFORE it deletes.
//
// The fixture is the production distribution of September 2026: 90 objects, of
// which exactly five are to be deleted.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { cleanupEdgeModules, loadEdgeModule, readRepoFile, REPO_ROOT }
  from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/purge-orphan-media/index.ts';
const CLI_FILE = 'scripts/juno09-orphan-campaign.mjs';

interface RawObject {
  id: string; bucket_id: string; name: string; created_at: string; size_bytes: number;
}

type Body = Record<string, unknown>;
type Gate = { status: number; body: Body };

type Edge = {
  TOOL_VERSION: string;
  MANIFEST_SCHEMA: string;
  APPROVAL_SCHEMA: string;
  EXPECTED_PROJECT_REF: string;
  CAMPAIGN_CAPS: { totalExact: number; absoluteMax: number; byBucket: Record<string, number> };
  ORPHAN_ERROR_CLASSES: readonly string[];
  manifestHashOf: (m: Body) => Promise<string>;
  parseOrphanRequest: (body: unknown) => Body;
  handleOrphanRequest: (parsed: unknown, deps: unknown, registry: unknown, key: string) => Promise<Gate>;
  gateDiscover: (parsed: unknown, deps: unknown, registry: unknown) => Promise<Gate>;
};

let edge: Edge;
let cli: { manifestHashOf: (m: Body) => string; TOOL_VERSION: string; MANIFEST_SCHEMA: string };

beforeAll(async () => {
  edge = await loadEdgeModule<Edge>({
    file: EDGE_FILE,
    label: 'purge-orphan-media-chain',
    declarations: [
      'MIN_SECRET_LENGTH', 'EXPECTED_PROJECT_REF', 'TOOL_VERSION',
      'MANIFEST_SCHEMA', 'APPROVAL_SCHEMA',
      'ORPHAN_BUCKETS', 'CAMPAIGN_CAPS', 'APPROVAL_TTL_MS', 'EXECUTE_BUDGET_MS',
      'ORPHAN_CATEGORIES', 'ORPHAN_ERROR_CLASSES',
      'constantTimeEqual', 'isStrictUuid', 'firstSegment', 'pathShapeOf',
      'classifyObjects', 'summarizeClassification',
      'canonicalJson', 'toHex', 'sha256Hex', 'hmacSha256Hex',
      'ownerGroupOf', 'entryHashOf', 'manifestHashOf', 'approvalPayload',
      'checkCampaignCaps', 'classifyOrphanError',
      'verifyManifestEntries', 'executeDeletions',
      'parseOrphanRequest', 'authorizeExecution',
      'refuse', 'gateDiscover', 'gateApprove', 'gateExecute', 'handleOrphanRequest',
    ],
  });
  cli = await import(path.join(REPO_ROOT, CLI_FILE).replace(/\\/g, '/'));
});

afterAll(() => cleanupEdgeModules());

// ---------------------------------------------------------------------------
// The production distribution, as a fixture (same as orphan-purge.test.ts).
// ---------------------------------------------------------------------------
const LIVE_OWNERS = Array.from({ length: 17 }, (_, i) =>
  `1${String(i).padStart(7, '0')}-2222-4333-8444-555555555555`);
const ORPHAN_OWNERS = Array.from({ length: 5 }, (_, i) =>
  `9${String(i).padStart(7, '0')}-8888-4777-8666-555555555555`);

function buildFixture() {
  let seq = 0;
  const objects: RawObject[] = [];
  const push = (bucket: string, name: string) => {
    seq += 1;
    objects.push({
      id: `a${String(seq).padStart(7, '0')}-0000-4000-8000-000000000000`,
      bucket_id: bucket, name, created_at: '2026-02-01T00:00:00Z', size_bytes: 1024,
    });
  };
  for (const owner of LIVE_OWNERS) push('avatars', `${owner}/avatar.jpg`);
  for (const owner of ORPHAN_OWNERS.slice(0, 4)) push('avatars', `${owner}/avatar.jpg`);
  for (let i = 0; i < 6; i++) push('avatars', `marketing/campaign-${i}.png`);
  for (let i = 0; i < 60; i++) push('avatars', `seed-${LIVE_OWNERS[i % 17]}.jpg`);
  push('avatars', 'legacy-header.png');
  push('avatars', 'README.txt');
  push('verifications', `${ORPHAN_OWNERS[4]}/face.mp4`);
  return { objects, liveOwnerSet: new Set(LIVE_OWNERS.map((o) => o.toLowerCase())) };
}

function fakeDeps(objects: RawObject[], liveOwners: Set<string>, clock = { value: 0 }) {
  const removed: Array<{ bucket: string; path: string }> = [];
  const live = new Map(objects.map((o) => [o.id, o]));
  return {
    removed,
    clock,
    deps: {
      fetchObjects: async () => ({ rows: [...live.values()], error: null }),
      existingOwners: async (uuids: readonly string[]) => ({
        present: new Set(uuids.filter((u) => liveOwners.has(u.toLowerCase()))
          .map((u) => u.toLowerCase())),
        error: null,
      }),
      countAuthUsers: async () => 362,
      lookupObjects: async (ids: readonly string[]) => ({
        rows: ids.map((id) => live.get(id)).filter(Boolean) as RawObject[], error: null,
      }),
      removeObject: async (bucket: string, p: string) => {
        removed.push({ bucket, path: p });
        for (const [id, o] of live) if (o.bucket_id === bucket && o.name === p) live.delete(id);
        return { error: null };
      },
      now: () => clock.value,
    },
  };
}

// ---------------------------------------------------------------------------
// `orphan_purge_campaigns` and its three RPCs, with the migration's refusals.
// ---------------------------------------------------------------------------
interface RegRow {
  status: string; manifestHash: string; approvalHash: string | null; volumeCap: number;
  deleted: number; alreadyAbsent: number; failed: number;
}
interface RegOpts { failDiscovery?: boolean; failRead?: boolean; readBackHash?: string }

function fakeRegistry(opts: RegOpts = {}) {
  const rows = new Map<string, RegRow>();
  const calls: string[] = [];
  const err = (message: string) => ({ error: { message } });
  const registry = {
    recordDiscovery: async (r: {
      campaignId: string; manifestHash: string; volumeCap: number; counts: { objects: number };
    }) => {
      calls.push('recordDiscovery');
      if (opts.failDiscovery) return err('registry down');
      if (r.volumeCap < 1 || r.volumeCap > 5) return err('plafond de volume invalide');
      if (r.counts.objects > r.volumeCap) return err('la decouverte depasse le plafond declare');
      const existing = rows.get(r.campaignId);
      // ON CONFLICT … WHERE status <> 'executed': an executed row is never rewritten.
      if (existing?.status === 'executed') return { error: null };
      rows.set(r.campaignId, {
        status: 'discovered', approvalHash: null, deleted: 0, alreadyAbsent: 0, failed: 0,
        ...(existing ?? {}),
        manifestHash: r.manifestHash, volumeCap: r.volumeCap,
      });
      return { error: null };
    },
    readCampaign: async (id: string) => {
      calls.push('readCampaign');
      if (opts.failRead) return { row: null, error: { message: 'registry down' } };
      const row = rows.get(id);
      if (!row) return { row: null, error: null };
      return {
        row: {
          status: row.status,
          manifestHash: opts.readBackHash ?? row.manifestHash,
          approvalHash: row.approvalHash,
          volumeCap: row.volumeCap,
        },
        error: null,
      };
    },
    recordApproval: async (r: { campaignId: string; manifestHash: string; approvalHash: string }) => {
      calls.push('recordApproval');
      const row = rows.get(r.campaignId);
      if (!row) return err('campagne inconnue : la decouverte doit preceder l approbation');
      if (row.status === 'executed') return err('campagne deja executee');
      if (row.manifestHash !== r.manifestHash) {
        return err('empreinte du manifeste differente de celle enregistree a la decouverte');
      }
      row.approvalHash = r.approvalHash;
      row.status = 'approved';
      return { error: null };
    },
    recordExecution: async (r: {
      campaignId: string; manifestHash: string; approvalHash: string;
      deleted: number; alreadyAbsent: number; failed: number;
    }) => {
      calls.push('recordExecution');
      const row = rows.get(r.campaignId);
      if (!row) return err('campagne inconnue');
      if (row.status !== 'approved') return err(`campagne non approuvee (statut : ${row.status})`);
      if (row.manifestHash !== r.manifestHash) return err('empreinte du manifeste differente');
      if (row.approvalHash !== r.approvalHash) return err('empreinte d approbation differente');
      if (r.deleted + r.alreadyAbsent + r.failed > row.volumeCap) {
        return err('le resultat depasse le plafond');
      }
      Object.assign(row, {
        status: 'executed', deleted: r.deleted, alreadyAbsent: r.alreadyAbsent, failed: r.failed,
      });
      return { error: null };
    },
  };
  return { rows, calls, registry };
}

const KEY = 'k'.repeat(64);
const CAMPAIGN = '2026-09-11-a1b2c3';

type Fx = ReturnType<typeof fakeDeps>;
type Reg = ReturnType<typeof fakeRegistry>;

const discover = (fx: Fx, reg: Reg, deps: unknown = fx.deps) =>
  edge.handleOrphanRequest(
    edge.parseOrphanRequest({ mode: 'discover', campaignId: CAMPAIGN }), deps, reg.registry, KEY);

const approve = (fx: Fx, reg: Reg, manifest: unknown) =>
  edge.handleOrphanRequest(
    edge.parseOrphanRequest({ mode: 'approve', campaignId: CAMPAIGN, manifest }),
    fx.deps, reg.registry, KEY);

const execute = (fx: Fx, reg: Reg, manifest: Body, approval: unknown) =>
  edge.handleOrphanRequest(
    edge.parseOrphanRequest({
      mode: 'execute', execute: true, campaignId: CAMPAIGN, manifest, approval,
      confirmObjectCount: (manifest.entries as unknown[]).length,
    }),
    fx.deps, reg.registry, KEY);

describe('JUNO-09 phase C · the gates chain through the registry', () => {
  it('discovery records the campaign and proves it by reading it back — the 11 Sep defect', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet);
    const reg = fakeRegistry();

    const res = await discover(fx, reg);
    expect(res.status).toBe(200);
    const manifest = res.body.manifest as Body;

    // The registry holds it. This is the line that fails on the code of 11 Sep.
    expect(reg.rows.get(CAMPAIGN)).toMatchObject({
      status: 'discovered', manifestHash: manifest.manifestHash,
    });
    expect(reg.calls).toEqual(['recordDiscovery', 'readCampaign']);
    expect(res.body.registry).toMatchObject({
      status: 'discovered', manifestHash: manifest.manifestHash, volumeCap: 5,
    });

    // The server assembled it and hashed it; both sides recompute the same hash.
    expect(manifest).toMatchObject({
      schema: edge.MANIFEST_SCHEMA,
      campaignId: CAMPAIGN,
      projectRef: edge.EXPECTED_PROJECT_REF,
      toolVersion: edge.TOOL_VERSION,
      volumeCap: 5,
      authUsersAtDiscovery: 362,
      totals: { objects: 5, byBucket: { avatars: 4, verifications: 1 } },
    });
    expect(await edge.manifestHashOf(manifest)).toBe(manifest.manifestHash);
    expect(cli.manifestHashOf(manifest)).toBe(manifest.manifestHash);
    expect((manifest.entries as unknown[]).length).toBe(5);
    expect(fx.removed).toEqual([]);
  });

  it('a manifest the registry never saw is refused at gate C as campaign_unknown, unsigned', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet);
    // Discovered against ONE registry, approved against ANOTHER: well-formed,
    // correctly hashed, unknown to the database asked to approve it — which is
    // exactly what a manifest assembled on the workstation looks like.
    const disc = await discover(fx, fakeRegistry());
    const reg = fakeRegistry();

    const res = await approve(fx, reg, disc.body.manifest);
    expect(res.status).toBe(409);
    expect(res.body.errorClass).toBe('campaign_unknown');
    expect(res.body.approval).toBeUndefined();
    expect(reg.calls).toEqual(['readCampaign']);
  });

  it('discover → approve → execute deletes exactly the five and closes the campaign', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet, { value: 1_000_000 });
    const reg = fakeRegistry();

    const disc = await discover(fx, reg);
    const manifest = disc.body.manifest as Body;

    const app = await approve(fx, reg, manifest);
    expect(app.status).toBe(200);
    expect(reg.rows.get(CAMPAIGN)).toMatchObject({
      status: 'approved', approvalHash: app.body.approvalHash,
    });
    expect(app.body.registry).toMatchObject({ status: 'approved' });
    expect(fx.removed).toEqual([]);

    fx.clock.value += 1;
    const exe = await execute(fx, reg, manifest, app.body.approval);
    expect(exe.status).toBe(200);
    expect(exe.body).toMatchObject({ deleted: 5, alreadyAbsent: 0, failed: 0, recorded: true });
    expect(reg.rows.get(CAMPAIGN)).toMatchObject({ status: 'executed', deleted: 5, failed: 0 });
    expect(reg.calls).toEqual([
      'recordDiscovery', 'readCampaign',                 // A: write, read back
      'readCampaign', 'recordApproval', 'readCampaign',  // C: read, write, read back
      'readCampaign', 'recordExecution',                 // D: read BEFORE deleting
    ]);

    // Exactly the five orphans. Nothing owned by a live account, nothing seeded.
    expect(fx.removed).toHaveLength(5);
    for (const { path: p } of fx.removed) {
      expect(ORPHAN_OWNERS.some((o) => p.startsWith(`${o}/`)), p).toBe(true);
    }
  });

  it('a manifest altered after discovery is refused at gate C, hash patched up or not', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet);
    const reg = fakeRegistry();
    const disc = await discover(fx, reg);
    const manifest = disc.body.manifest as Body;

    // 1. Edited, hash left alone: the server's own recomputation disagrees.
    const edited = JSON.parse(JSON.stringify(manifest));
    edited.entries[0].sizeBytes = 1;
    const r1 = await approve(fx, reg, edited);
    expect(r1.status).toBe(409);
    expect(r1.body.errorClass).toBe('manifest_mismatch');

    // 2. Edited AND re-hashed with the CLI's own function: the registry disagrees.
    edited.manifestHash = cli.manifestHashOf(edited);
    const r2 = await approve(fx, reg, edited);
    expect(r2.status).toBe(409);
    expect(r2.body.errorClass).toBe('manifest_mismatch');

    expect(reg.calls).not.toContain('recordApproval');
    expect(reg.rows.get(CAMPAIGN)?.status).toBe('discovered');
  });

  it('execution consults the registry BEFORE deleting, and refuses what it does not hold as approved', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet, { value: 1_000_000 });
    const reg = fakeRegistry();
    const disc = await discover(fx, reg);
    const manifest = disc.body.manifest as Body;
    const app = await approve(fx, reg, manifest);
    const approval = app.body.approval;
    const row = reg.rows.get(CAMPAIGN);
    if (!row) throw new Error('fixture: no row after approval');

    // The signature is valid. The registry does not agree. Nothing is deleted.
    row.status = 'discovered';
    const r1 = await execute(fx, reg, manifest, approval);
    expect(r1.status).toBe(409);
    expect(r1.body.errorClass).toBe('approval_mismatch');
    expect(fx.removed).toEqual([]);

    row.status = 'approved';
    row.approvalHash = 'e'.repeat(64);
    const r2 = await execute(fx, reg, manifest, approval);
    expect(r2.body.errorClass).toBe('approval_mismatch');
    expect(fx.removed).toEqual([]);

    // One pass per campaign: an executed campaign is closed, before any deletion.
    row.approvalHash = app.body.approvalHash as string;
    row.status = 'executed';
    const r3 = await execute(fx, reg, manifest, approval);
    expect(r3.body.errorClass).toBe('campaign_closed');
    expect(fx.removed).toEqual([]);
    expect(reg.calls.filter((c) => c === 'recordExecution')).toEqual([]);

    // And, restored, it goes through — so the refusals above were the registry's.
    row.status = 'approved';
    const r4 = await execute(fx, reg, manifest, approval);
    expect(r4.status).toBe(200);
    expect(fx.removed).toHaveLength(5);
  });

  it('a discovery the registry cannot hold issues no manifest', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const cases: Array<[string, Reg, Body | null, number, string]> = [
      ['write fails', fakeRegistry({ failDiscovery: true }), null, 503, 'registry_unavailable'],
      ['read-back fails', fakeRegistry({ failRead: true }), null, 503, 'registry_unavailable'],
      ['read-back disagrees', fakeRegistry({ readBackHash: 'e'.repeat(64) }), null, 409, 'registry_mismatch'],
      ['account total unavailable', fakeRegistry(),
        { countAuthUsers: async () => null }, 503, 'registry_unavailable'],
    ];
    for (const [label, reg, override, status, cls] of cases) {
      const fx = fakeDeps(objects, liveOwnerSet);
      const res = await discover(fx, reg, { ...fx.deps, ...(override ?? {}) });
      expect(res.status, label).toBe(status);
      expect(res.body.errorClass, label).toBe(cls);
      expect(res.body.manifest, label).toBeUndefined();
      expect(edge.ORPHAN_ERROR_CLASSES, label).toContain(cls);
      expect(fx.removed).toEqual([]);
    }
  });

  it('a discovery outside the caps issues no manifest and records nothing', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    // A sixth orphan: same shape as the four, owner absent from auth.users.
    objects.push({
      id: 'a0000fff-0000-4000-8000-000000000000', bucket_id: 'avatars',
      name: '90000009-8888-4777-8666-555555555555/avatar.jpg',
      created_at: '2026-02-01T00:00:00Z', size_bytes: 1024,
    });
    const fx = fakeDeps(objects, liveOwnerSet);
    const reg = fakeRegistry();
    const res = await discover(fx, reg);
    expect(res.status).toBe(409);
    expect(res.body.errorClass).toBe('volume_limit_exceeded');
    expect(res.body.manifest).toBeUndefined();
    expect(res.body.orphanCounts).toMatchObject({ objects: 6 });
    expect(reg.calls).toEqual([]);
    expect(reg.rows.size).toBe(0);
  });

  it('re-using a campaign id that is already approved is refused at discovery, not silently reset', async () => {
    const { objects, liveOwnerSet } = buildFixture();
    const fx = fakeDeps(objects, liveOwnerSet, { value: 1_000_000 });
    const reg = fakeRegistry();
    const disc = await discover(fx, reg);
    await approve(fx, reg, disc.body.manifest);

    // The upsert keeps `approved`; the read-back sees it and refuses to hand out
    // a manifest for a campaign in that state. A new id is the answer.
    const again = await discover(fx, reg);
    expect(again.status).toBe(409);
    expect(again.body.errorClass).toBe('registry_mismatch');
    expect(again.body.manifest).toBeUndefined();
  });

  it('the parser refuses the old shape — a hash beside a list — and a manifest for another campaign', () => {
    const entry = {
      objectId: 'a0000001-0000-4000-8000-000000000000', bucket: 'avatars', category: 'orphan_proven',
    };
    const good = {
      schema: edge.MANIFEST_SCHEMA, campaignId: CAMPAIGN, projectRef: edge.EXPECTED_PROJECT_REF,
      manifestHash: 'f'.repeat(64), entries: [entry],
    };
    expect(edge.parseOrphanRequest({ mode: 'approve', campaignId: CAMPAIGN, manifest: good }))
      .toMatchObject({ ok: true, manifestHash: 'f'.repeat(64) });

    for (const bad of [
      // The shape of 11 Sep: a claimed hash beside a list of ids.
      { mode: 'approve', campaignId: CAMPAIGN, manifestHash: 'f'.repeat(64), entries: [entry] },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: { ...good, campaignId: '2026-09-12-000000' } },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: { ...good, projectRef: 'someotherprojectref' } },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: { ...good, schema: 'juno09-orphan-manifest/1' } },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: [good] },
      { mode: 'approve', campaignId: CAMPAIGN, manifest: null },
    ]) {
      expect(edge.parseOrphanRequest(bad), JSON.stringify(bad).slice(0, 80))
        .toMatchObject({ ok: false });
    }
  });

  it('the manifest schema is v2 on both sides, so the manifest of 11 Sep is refused everywhere', () => {
    expect(edge.MANIFEST_SCHEMA).toBe('juno09-orphan-manifest/2');
    expect(cli.MANIFEST_SCHEMA).toBe(edge.MANIFEST_SCHEMA);
    expect(cli.TOOL_VERSION).toBe(edge.TOOL_VERSION);
  });

  it('Deno.serve only wires — the gates are testable because they are not inside it', () => {
    const src = readRepoFile(EDGE_FILE);
    const serve = src.slice(src.indexOf('Deno.serve('));
    expect(serve).toContain('handleOrphanRequest(parsed, deps, registry, approvalKey)');
    for (const forbidden of ['executeDeletions(', 'verifyManifestEntries(', 'hmacSha256Hex(']) {
      expect(serve, forbidden).not.toContain(forbidden);
    }
  });
});
