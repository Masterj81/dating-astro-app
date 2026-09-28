/**
 * JUNO-06 PR E — release-suite for the Android 131 train.
 *
 * Two jobs:
 *   1. exercise the ARTIFACT INSPECTOR's pure functions on fixtures (no
 *      Android toolchain, no real binary, no secret) — the versionCode 131
 *      enforcement, the badging parser, the marker scan and its public-SDK-key
 *      boundary, and the real ZIP reader against a fixture built in-memory;
 *   2. pin the 131 EXPECTATIONS themselves (module constants), so a canary
 *      that relaxes them turns this suite red.
 *
 * The deterministic CI coverage of the 131 scenarios A-F (free 402, paid 200,
 * concurrency, sync cooldown, expired session, network/5xx) lives in
 * tarot-client.test.ts and sync-entitlement-client.test.ts — see
 * docs/runbooks/android-131-build-2026-09.md for the smoke-level mapping.
 */
import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import {
  EXPECTED_PACKAGE,
  EXPECTED_VERSION_CODE,
  FORBIDDEN_MARKERS,
  REQUIRED_MARKERS,
  checkReleaseIdentity,
  parseAaptBadging,
  readZipEntries,
  scanForMarkers,
} from '../release/artifact-rules.mjs';

// ---- 1. the 131 expectations are pinned ------------------------------------

describe('android-131 expectations', () => {
  it('the train pins versionCode 131 and the production package', () => {
    expect(EXPECTED_VERSION_CODE).toBe(131);
    expect(EXPECTED_PACKAGE).toBe('com.astrodatingapp.mobile');
  });

  it('the marker rules require BOTH edge calls and forbid corpus/engine/secret names', () => {
    expect(REQUIRED_MARKERS).toEqual(
      expect.arrayContaining(['sync-entitlement', 'premium-tarot-reading']),
    );
    const sources = FORBIDDEN_MARKERS.map((m) => (typeof m === 'string' ? m : m.source));
    expect(sources).toEqual(
      expect.arrayContaining(['major-00', 'generateReading', String.raw`\bSUPABASE_SERVICE_ROLE(?:_KEY)?\b`]),
    );
  });
});

// ---- 2. badging + identity enforcement --------------------------------------

describe('parseAaptBadging + checkReleaseIdentity', () => {
  const badging131 = [
    "package: name='com.astrodatingapp.mobile' versionCode='131' versionName='2.1.1' platformBuildVersionName='15'",
    'sdkVersion: 24',
  ].join('\n');

  it('parses package, versionCode and versionName', () => {
    expect(parseAaptBadging(badging131)).toEqual({
      package: 'com.astrodatingapp.mobile',
      versionCode: 131,
      versionName: '2.1.1',
    });
  });

  it('accepts exactly versionCode 131 for the production package', () => {
    expect(() =>
      checkReleaseIdentity(parseAaptBadging(badging131)),
    ).not.toThrow();
  });

  it('REJECTS versionCode 130 (the runbook stop rule)', () => {
    const badging130 = badging131.replace("versionCode='131'", "versionCode='130'");
    expect(() => checkReleaseIdentity(parseAaptBadging(badging130))).toThrow(/versionCode 130 != 131/);
  });

  it('REJECTS any other versionCode and any other package', () => {
    expect(() =>
      checkReleaseIdentity({ package: 'com.astrodatingapp.mobile', versionCode: 132, versionName: '2.1.1' }),
    ).toThrow(/versionCode 132 != 131/);
    expect(() =>
      checkReleaseIdentity({ package: 'com.evil.clone', versionCode: 131, versionName: '2.1.1' }),
    ).toThrow(/package 'com.evil.clone'/);
  });

  it('a malformed/absent badging line fails closed (null identity is rejected)', () => {
    expect(parseAaptBadging('')).toEqual({ package: null, versionCode: null, versionName: null });
    expect(() => checkReleaseIdentity(parseAaptBadging(''))).toThrow();
  });
});

// ---- 3. the bundle marker scan ----------------------------------------------

describe('scanForMarkers', () => {
  it('a healthy 131 bundle passes: both edge literals present, nothing forbidden', () => {
    const bundle = [
      'index.android.bundle',
      "invoke('sync-entitlement', { body: {} })",
      "invoke('premium-tarot-reading', { body: { period, mode, locale } })",
      'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID', // the PUBLIC SDK key — allowed
    ].join('\n');
    const result = scanForMarkers(bundle);
    expect(result.missing).toEqual([]);
    expect(result.found).toEqual([]);
  });

  it('a bundle missing an edge call is rejected', () => {
    const result = scanForMarkers("only invoke('sync-entitlement', {})");
    expect(result.missing).toContain('premium-tarot-reading');
  });

  it('the tarot corpus (card ids / card name) is rejected', () => {
    for (const corpus of ['major-00', "id: 'major-19'", 'The High Priestess']) {
      expect(scanForMarkers(corpus + ' sync-entitlement premium-tarot-reading').found.length).toBeGreaterThan(0);
    }
  });

  it('the local engine / generated corpus markers are rejected', () => {
    expect(scanForMarkers('generateReading(x) sync-entitlement premium-tarot-reading').found).toContain('generateReading');
    expect(scanForMarkers('tarot.generated sync-entitlement premium-tarot-reading').found).toContain('tarot.generated');
  });

  it('server secret NAMES are rejected — while the PUBLIC SDK key is NOT', () => {
    const withServerKey = 'SUPABASE_SERVICE_ROLE_KEY sync-entitlement premium-tarot-reading';
    expect(scanForMarkers(withServerKey).found.length).toBeGreaterThan(0);
    const withRcServer = 'REVENUECAT_API_KEY sync-entitlement premium-tarot-reading';
    expect(scanForMarkers(withRcServer).found.length).toBeGreaterThan(0);
    // Boundary: the public EXPO_PUBLIC_* SDK key must not trip the rule.
    const publicOnly = 'EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID sync-entitlement premium-tarot-reading';
    expect(scanForMarkers(publicOnly).found).toEqual([]);
  });
});

// ---- 4. the ZIP reader (in-memory fixture) ----------------------------------

describe('readZipEntries', () => {
  type FixtureEntry = { name: string; data: Buffer; method: number };

  /** Build a minimal ZIP (stored + deflated entries) in pure JS. */
  function buildZip(entries: FixtureEntry[]) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data, method } of entries) {
      const nameBuf = Buffer.from(name, 'utf8');
      const payload = method === 8 ? zlib.deflateRawSync(data) : data;
      const crc = 0; // not validated by the reader
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(method, 8);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(payload.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      locals.push(local, nameBuf, payload);

      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(method, 10);
      central.writeUInt32LE(crc, 16);
      central.writeUInt32LE(payload.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(nameBuf.length, 28);
      central.writeUInt32LE(offset, 42);
      centrals.push(central, nameBuf);
      offset += 30 + nameBuf.length + payload.length;
    }
    const centralDir = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(entries.length, 10); // total entries (what the reader uses)
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, eocd]);
  }

  it('reads stored and deflated entries back byte-identically (the scan input is real)', () => {
    const bundle = Buffer.from(
      "invoke('premium-tarot-reading')\ninvoke('sync-entitlement')\n",
      'utf8',
    );
    const zip = buildZip([
      { name: 'classes.dex', data: Buffer.from('dex placeholder'), method: 0 },
      { name: 'assets/index.android.bundle', data: bundle, method: 8 },
    ]);
    const entries: { name: string; bytes: Buffer | null }[] = readZipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(['classes.dex', 'assets/index.android.bundle']);
    const scanned = Buffer.concat(
      entries
        .filter((e): e is { name: string; bytes: Buffer } => e.bytes !== null)
        .map((e) => e.bytes),
    ).toString('utf8');
    expect(scanForMarkers(scanned).missing).toEqual([]);
  });

  it('a non-ZIP input is a hard, explicit error — never a silent pass', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all'))).toThrow(/not a ZIP/);
  });
});
