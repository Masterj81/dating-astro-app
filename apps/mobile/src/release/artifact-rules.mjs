// JUNO-06 PR E — the Android 131 artifact rules, pure and canonical.
//
// These are the EXPECTATIONS the release train pins (versionCode 131, the
// production package, the edge-call markers, the forbidden corpus/engine/
// secret-name markers) plus the pure parsers/enforcers. Both consumers
// import THIS module so the rules cannot drift:
//   * apps/mobile/src/__tests__/android-131-release.test.ts (vitest,
//     fixtures, no Android toolchain);
//   * scripts/inspect-android-artifact.mjs (the CLI run against the real
//     APK/AAB — runbook gate 8).
//
// No secret is defined or read here; everything is static and public.

import { inflateRawSync } from 'node:zlib';

export const EXPECTED_VERSION_CODE = 131;
export const EXPECTED_PACKAGE = 'com.astrodatingapp.mobile';

// Required: the string literals of the two edge invocations — they live in
// the shipped JS (Hermes string table) or dex of a healthy 131 binary.
export const REQUIRED_MARKERS = ['sync-entitlement', 'premium-tarot-reading'];

// Forbidden: corpus card ids (only the shared corpus contains them), a card
// name string, the engine/artifact entry names, and the server secret NAMES
// (a leaked value would also trip the scan — the names must not even be
// referenced). REVENUECAT_API_KEY is matched on word boundaries so the PUBLIC
// EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID SDK key does NOT trip it.
export const FORBIDDEN_MARKERS = [
  'major-00',
  'major-19',
  'The High Priestess',
  'generateReading',
  'tarot.generated',
  /\bSUPABASE_SERVICE_ROLE(?:_KEY)?\b/,
  /\bREVENUECAT_API_KEY\b/,
];

/** Pure: parse the `aapt dump badging` package line. */
export function parseAaptBadging(badgingText) {
  const first = (badgingText || '').split('\n').find((l) => l.startsWith('package:')) ?? '';
  const pkg = first.match(/name='([^']+)'/)?.[1] ?? null;
  const versionCode = first.match(/versionCode='(\d+)'/)?.[1] ?? null;
  const versionName = first.match(/versionName='([^']*)'/)?.[1] ?? null;
  return {
    package: pkg,
    versionCode: versionCode === null ? null : Number(versionCode),
    versionName,
  };
}

/** Pure: enforce the 131 identity. Throws a precise message on mismatch. */
export function checkReleaseIdentity({ package: pkg, versionCode, versionName }) {
  const problems = [];
  if (pkg !== EXPECTED_PACKAGE) problems.push(`package '${pkg}' != '${EXPECTED_PACKAGE}'`);
  if (versionCode !== EXPECTED_VERSION_CODE) {
    problems.push(`versionCode ${versionCode} != ${EXPECTED_VERSION_CODE} — ARRÊT (runbook gate 6)`);
  }
  if (problems.length > 0) throw new Error(problems.join(' ; '));
  return { ok: true, package: pkg, versionCode, versionName };
}

/** Pure: scan decoded bundle text against the marker rules. */
export function scanForMarkers(text) {
  const missing = REQUIRED_MARKERS.filter((m) => !text.includes(m));
  const found = [];
  for (const marker of FORBIDDEN_MARKERS) {
    const hit = typeof marker === 'string' ? text.includes(marker) : marker.test(text);
    if (hit) found.push(typeof marker === 'string' ? marker : marker.source);
  }
  return { missing, found };
}

/**
 * Minimal dependency-free ZIP reader (central directory; stored + deflate),
 * shared with scripts/inspect-android-artifact.mjs. Returns each entry's
 * name and decompressed bytes (entries over 64 MB are skipped defensively).
 */
export function readZipEntries(buf) {
  // Locate EOCD (no ZIP64 in APK/AAB produced by Gradle under 4 GB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP artifact (no end-of-central-directory)');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;

    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (compSize > 64 * 1024 * 1024) continue;
    const data = buf.slice(dataStart, dataStart + compSize);
    try {
      const bytes = method === 0 ? data : method === 8 ? inflateRawSync(data) : null;
      if (bytes) entries.push({ name, bytes });
    } catch {
      entries.push({ name, bytes: null });
    }
  }
  return entries;
}
