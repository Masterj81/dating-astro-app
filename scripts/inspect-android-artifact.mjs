#!/usr/bin/env node
// inspect-android-artifact — static proof that a built APK/AAB is the
// Android 131 JUNO-06 binary, BEFORE any submission decision.
//
//   node scripts/inspect-android-artifact.mjs <artifact.apk|artifact.aab> \
//        [--aapt <path-to-aapt>] [--json]
//
// The EXPECTATIONS (versionCode 131, package, markers) are canonical in
// apps/mobile/src/release/artifact-rules.mjs — imported here so the test
// suite and the CLI can never drift apart.
//
// Checks, in order:
//   0. the artifact exists (clear failure otherwise — exit 2);
//   1. SHA-256 + size of the file (the runbook records both);
//   2. versionCode == 131 and package == com.astrodatingapp.mobile, read
//      from `aapt dump badging` (aapt/aapt2 discovered on PATH, under
//      $ANDROID_HOME, or passed with --aapt; without aapt the check FAILS
//      with exit 3 — it is never silently skipped);
//   3. the bundle CALLS the two JUNO-06 edges (required markers present in
//      the shipped code — Hermes bundle / dex / assets);
//   4. the bundle carries NONE of the forbidden markers (corpus, engine,
//      server secret names);
//   5. with --json, a machine-readable verdict for the runbook.
//
// No secret is required or read: every check is static. The ZIP reader below
// is dependency-free (central directory + stored/deflate via node:zlib).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  checkReleaseIdentity,
  parseAaptBadging,
  readZipEntries,
  scanForMarkers,
} from '../apps/mobile/src/release/artifact-rules.mjs';

const SCANNABLE = /\.(hbc|dex|js|bundle|json|txt)$/i;

function findAapt(explicit) {
  if (explicit) return explicit;
  for (const c of ['aapt', 'aapt2']) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); return c; } catch { /* keep looking */ }
  }
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (androidHome && fs.existsSync(androidHome)) {
    const bt = path.join(androidHome, 'build-tools');
    if (fs.existsSync(bt)) {
      for (const v of fs.readdirSync(bt).sort().reverse()) {
        for (const c of ['aapt', 'aapt2']) {
          const p = path.join(bt, v, c) + (process.platform === 'win32' ? '.exe' : '');
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const aaptFlag = args.indexOf('--aapt');
  const aaptExplicit = aaptFlag >= 0 ? args[aaptFlag + 1] : null;
  const artifact = args.find((a) => !a.startsWith('--') && a !== aaptExplicit);

  const report = { artifact: artifact ?? null, checks: [], sha256: null, bytes: null };

  if (!artifact) {
    console.error('usage: inspect-android-artifact.mjs <artifact.apk|aab> [--aapt <path>] [--json]');
    process.exit(2);
  }
  if (!fs.existsSync(artifact)) {
    console.error(`ARRÊT: artifact not found: ${artifact}`);
    process.exit(2);
  }

  const buf = fs.readFileSync(artifact);
  report.bytes = buf.length;
  report.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  if (!json) {
    console.log(`artifact : ${artifact}`);
    console.log(`size     : ${report.bytes} bytes`);
    console.log(`sha256   : ${report.sha256}`);
  }
  report.checks.push(['exists', true]);

  // Identity via aapt — never silently skipped.
  const aapt = findAapt(aaptExplicit);
  if (!aapt) {
    console.error('ARRÊT: aapt/aapt2 not found (install Android SDK build-tools or pass --aapt). The versionCode check is mandatory, never skipped.');
    process.exit(3);
  }
  try {
    const badging = execFileSync(aapt, ['dump', 'badging', artifact], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const identity = parseAaptBadging(badging);
    checkReleaseIdentity(identity);
    report.identity = identity;
    if (!json) console.log(`identity : ${identity.package} versionCode=${identity.versionCode} versionName=${identity.versionName} — OK`);
    report.checks.push(['identity-131', true]);
  } catch (err) {
    console.error(`ARRÊT: ${err.message}`);
    process.exit(1);
  }

  // Bundle scan.
  let entries;
  try {
    entries = readZipEntries(buf);
  } catch (err) {
    console.error(`ARRÊT: cannot read the artifact as a ZIP: ${err.message}`);
    process.exit(1);
  }
  const scanned = entries.filter((e) => e.bytes && SCANNABLE.test(e.name));
  const text = Buffer.concat(scanned.map((e) => e.bytes)).toString('latin1');
  const { missing, found } = scanForMarkers(text);
  report.scannedEntries = scanned.length;

  if (missing.length > 0) {
    console.error(`ARRÊT: edge call(s) absent from the bundle: ${missing.join(', ')} — this binary does not use the JUNO-06 server paths.`);
    process.exit(1);
  }
  report.checks.push(['edge-calls-present', true]);
  if (!json) console.log(`edges    : sync-entitlement + premium-tarot-reading present in ${scanned.length} scanned entries — OK`);

  if (found.length > 0) {
    console.error(`ARRÊT: forbidden marker(s) in the bundle: ${found.join(', ')}`);
    process.exit(1);
  }
  report.checks.push(['no-forbidden-markers', true]);
  if (!json) console.log('markers  : no corpus / engine / server-secret marker — OK');

  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log('\nVERDICT: this artifact is the expected Android 131 JUNO-06 binary (static proof).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
