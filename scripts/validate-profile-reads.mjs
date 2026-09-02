#!/usr/bin/env node
// Guards the contract between the discoverable_profiles view and its readers.
//
// WHY THIS EXISTS
// ---------------
// On 23 May 2026 `connection_intentions` was added to `profiles` and to the
// three profile RPCs. The VIEW was forgotten. Two screens read the view
// directly and asked for the column, so from that day "open someone's profile"
// answered 400 (Postgres 42703) on web AND on mobile, while Discover, Synastry
// and the chat header kept working — they read a source that had the column,
// or did not ask for it. The feature looked shipped. It stayed broken for three
// months.
//
// Nothing could have caught it: the column list is a STRING in the client and a
// DDL statement in a migration, and no type, test or build step reads both. So
// this does.
//
// Two obligations:
//
//   1. Every column a client selects from the view must exist in the view.
//   2. Every column get_discoverable_profiles RETURNS must exist in the view.
//      The RPC and the view describe the same people to the same audience; a
//      column in one and not the other is the exact drift above, and it fails
//      only on whichever screen happens to read the other source.
//
// Usage: node scripts/validate-profile-reads.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;
let failures = 0;
const check = (label, ok, detail = '') => {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`        ${detail}`);
};

// --- the view, as the newest migration leaves it -----------------------------
// Only timestamped migrations count. `run_pending.sql` is an untimestamped
// convenience bundle for the SQL editor and never runs in order.
const MIG_DIR = path.join(ROOT, 'supabase/migrations');
const migrations = readdirSync(MIG_DIR)
  .filter((f) => /^\d{8,14}_.*\.sql$/.test(f))
  .sort();

function lastDefining(needle) {
  for (let i = migrations.length - 1; i >= 0; i -= 1) {
    const sql = readFileSync(path.join(MIG_DIR, migrations[i]), 'utf8');
    if (needle.test(sql)) return { file: migrations[i], sql };
  }
  return null;
}

/** Column names produced by a SELECT list: `x`, or `expr AS x`. */
function outputColumns(block) {
  const out = [];
  for (const raw of block.split('\n')) {
    const line = raw.replace(/--.*$/, '').trim().replace(/,$/, '');
    if (!line) continue;
    const aliased = line.match(/\bAS\s+([a-z_][a-z0-9_]*)$/i);
    if (aliased) {
      out.push(aliased[1]);
      continue;
    }
    if (/^[a-z_][a-z0-9_]*$/i.test(line)) out.push(line);
  }
  return out;
}

const view = lastDefining(/CREATE (?:OR REPLACE )?VIEW public\.discoverable_profiles/);
check('a timestamped migration defines discoverable_profiles', Boolean(view));
if (!view) {
  process.exitCode = 1;
  throw new Error('no view definition found');
}

const viewBody = view.sql.slice(
  view.sql.lastIndexOf('CREATE', view.sql.indexOf('VIEW public.discoverable_profiles')),
);
const selectList = viewBody.slice(
  viewBody.indexOf('SELECT') + 'SELECT'.length,
  viewBody.indexOf('FROM public.profiles'),
);
const viewColumns = new Set(outputColumns(selectList));
check(
  'the view exposes a plausible column set',
  viewColumns.size >= 20,
  `parsed ${viewColumns.size} from ${view.file}; the parser probably broke`,
);
console.log(`the view (${view.file}): ${viewColumns.size} columns`);

// --- obligation 1: every direct read asks only for columns that exist --------
const APP_DIRS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/components'];
const sources = [];
const walk = (dir) => {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (/\.(tsx|ts)$/.test(entry.name)) sources.push(rel);
  }
};
APP_DIRS.forEach(walk);

const READ = /discoverable_profiles[\s\S]{0,200}?\.select\(\s*(['"`])([\s\S]*?)\1/g;
let readers = 0;
for (const rel of sources) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  if (!src.includes('discoverable_profiles')) continue;
  for (const m of src.matchAll(READ)) {
    const list = m[2].trim();
    if (list === '*') continue;
    readers += 1;
    const asked = list.split(',').map((c) => c.trim()).filter(Boolean);
    const missing = asked.filter((c) => !viewColumns.has(c));
    check(
      `${rel} selects only columns the view has`,
      missing.length === 0,
      `absent from the view: ${missing.join(', ')} — PostgREST answers 400 (42703), and only on the screens that ask`,
    );
  }
}
check(
  'the direct readers were actually found',
  readers >= 3,
  `${readers} found; the select-list regex has drifted and this file is now asserting nothing`,
);
console.log(`direct readers: ${readers}`);

// --- obligation 2: the RPC and the view agree -------------------------------
const rpc = lastDefining(/CREATE OR REPLACE FUNCTION public\.get_discoverable_profiles/);
check('a migration defines get_discoverable_profiles', Boolean(rpc));
if (rpc) {
  const from = rpc.sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.get_discoverable_profiles');
  const table = rpc.sql.slice(from);
  const block = table.slice(
    table.indexOf('RETURNS TABLE (') + 'RETURNS TABLE ('.length,
    table.indexOf(')\nLANGUAGE'),
  );
  const rpcColumns = block
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''))
    .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));
  check(
    'the RPC signature parsed',
    rpcColumns.length >= 10,
    `${rpcColumns.length} columns parsed from ${rpc.file}`,
  );
  const drift = rpcColumns.filter((c) => !viewColumns.has(c));
  check(
    'every column the RPC returns also exists in the view',
    drift.length === 0,
    `in the RPC but not the view: ${drift.join(', ')} — a reader moving between the two sources gets a 400`,
  );
  console.log(`the RPC (${rpc.file}): ${rpcColumns.length} columns`);
}

// --- what this file deliberately does NOT fail on ---------------------------
// `run_pending.sql` is a hand-assembled "safe to re-run" bundle for the SQL
// editor, and it is stale: it DROPs this view and rebuilds it with the pre-MVP
// column list, so pasting it into a production console to catch up would delete
// relationship_intent, personal_values, looking_for_text, prompts,
// icebreaker_question and connection_intentions in one statement — breaking
// both Discover's MVP fields and the profile page.
//
// It is not asserted here because the repo has already ruled on this class of
// file: 20260514000003 calls those bundles "immutable deployment history. Only
// forward migrations count", and validate-premium-gating.mjs excludes this one
// by name. Failing CI on history would contradict that. The hazard is real
// though, and the remedy is a decision — delete the bundle or mark it
// do-not-run — not something a guard can make for you.

if (failures === 0) {
  console.log(`\nProfile reads look clean: ${checks} checks passed.`);
  process.exitCode = 0;
} else {
  console.error(`\n${failures} of ${checks} profile read guard(s) failed.`);
  process.exitCode = 1;
}
