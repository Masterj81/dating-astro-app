#!/usr/bin/env node
// validate:rls-contract — the database invariants this repository is allowed to
// assert without a database.
//
//   node scripts/validate-rls-contract.mjs
//
// WHAT IT IS FOR, AND WHAT IT HONESTLY IS NOT
// -------------------------------------------
// The 3 Sep 2026 incident is the reason this file is careful about its own
// claims: a `GRANT SELECT` appeared on `public.profiles` OUTSIDE version
// control and neutralised five column revokes, and every code-side guard was
// blind to it because the guards read the repo and the repo is not where the
// change happened.
//
// So this validator asserts what the REPOSITORY promises — that the migration
// which closes a finding exists, is well formed, and is not quietly undone by a
// later one — and it prints, rather than assumes, the SQL that settles the
// live state. `docs/security-audit-2026-09-07.md` §8 carries the same queries.
//
// Recommended by the 3 Sep audit (§13.1) and written here for the first wave.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

const failures = [];
const checks = [];

function check(name, condition, detail) {
  checks.push(name);
  if (!condition) failures.push(`${name}\n    ${detail}`);
}

/** Every migration, oldest first, as { name, sql }. */
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && f !== 'run_pending.sql')
  .sort()
  .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS, name), 'utf8') }));

const all = files.map((f) => f.sql).join('\n');

/** Statements only — a REVOKE quoted in a comment is not a REVOKE. */
function statementsOf(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}
const statements = files.map((f) => ({ name: f.name, sql: statementsOf(f.sql) }));
const allStatements = statements.map((f) => f.sql).join('\n');

// ---------------------------------------------------------------------------
// 1. Tables the clients only ever READ must not hold mutating privileges.
// ---------------------------------------------------------------------------
// Each entry is a table, the verbs that must be revoked, and the finding that
// asked for it. `messages` keeps INSERT (sending) and `conversations` keeps
// nothing — rows there are made by a SECURITY DEFINER function.
const READ_ONLY_SURFACES = [
  { table: 'public.messages', verbs: ['UPDATE', 'DELETE', 'TRUNCATE'], finding: 'JUNO-08' },
  { table: 'public.conversations', verbs: ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'], finding: '3 Sep #4' },
  { table: 'public.discoverable_profiles', verbs: ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'], finding: '3 Sep #5' },
  { table: 'public.premium_usage', verbs: ['INSERT', 'UPDATE', 'DELETE'], finding: '23 Aug quota ledger' },
];

for (const surface of READ_ONLY_SURFACES) {
  const short = surface.table.replace(/^public\./, '');
  for (const verb of surface.verbs) {
    // A REVOKE naming the table and the verb, for a client role.
    const pattern = new RegExp(
      `REVOKE[^;]*\\b${verb}\\b[^;]*ON\\s+(?:public\\.)?${short}\\b[^;]*FROM[^;]*\\b(authenticated|anon)\\b`,
      'is',
    );
    check(
      `${surface.table}: ${verb} revoked from client roles (${surface.finding})`,
      pattern.test(allStatements),
      `No migration revokes ${verb} on ${surface.table}. Supabase grants ALL on the public schema by default, so an absent REVOKE means the privilege is held.`,
    );
  }
  // And nothing may grant it back afterwards.
  const regrant = new RegExp(
    `GRANT[^;]*\\b(UPDATE|DELETE|TRUNCATE)\\b[^;]*ON\\s+(?:public\\.)?${short}\\b[^;]*TO[^;]*\\b(authenticated|anon)\\b`,
    'is',
  );
  check(
    `${surface.table}: nothing grants a mutating privilege back`,
    !regrant.test(allStatements),
    `A later migration grants UPDATE/DELETE/TRUNCATE on ${surface.table} to a client role.`,
  );
}

// ---------------------------------------------------------------------------
// 2. A policy without WITH CHECK is how both of these findings happened.
// ---------------------------------------------------------------------------
// `FOR UPDATE USING (...)` with no `WITH CHECK` makes PostgreSQL reuse USING,
// so the row after the write only has to keep the caller as owner — every other
// column is free.
//
// Evaluated on the LAST definition of each (table, policy name), replaying
// DROP POLICY and CREATE POLICY in file order, for the same reason the function
// scan does: several policies were created without WITH CHECK in the initial
// schema and RE-CREATED correctly later (the storage ones in 20260419000001).
// Judging every historical version would report defects that no longer exist,
// and a validator that cries wolf gets muted.
const ACCEPTED_UNCHECKED_UPDATE_POLICIES = new Map([
  // Unreachable: the privilege behind each is revoked (section 1 proves it).
  // Left in place so the intent stays readable — the same editorial choice
  // 20260903000001 made for `conversations`.
  ['public.messages :: Users can update own messages',
   'privilege revoked by 20260907000002 (JUNO-08); policy kept as documentation'],
  ['public.conversations :: Participants can update conversations',
   'privilege revoked by 20260903000001 (3 Sep #4); policy kept as documentation'],
  // Benign by construction: USING reused as WITH CHECK forces `auth.uid() = id`
  // on the NEW row, so the owner cannot hand their row to anyone. Every other
  // column on your own profile is meant to be writable — that is the feature.
  ['public.profiles :: Users can update own profile',
   'USING pins the row to auth.uid(); editing your own profile is the point'],
  ['public.natal_charts :: Users can update own natal charts',
   'same shape: USING pins the row to its owner'],
]);

const policyState = new Map();
for (const file of statements) {
  const events = [];
  let m;
  const createRe = /CREATE POLICY\s+"([^"]+)"\s+ON\s+([\w.]+)([\s\S]*?);/gi;
  const dropRe = /DROP POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+([\w.]+)/gi;
  while ((m = createRe.exec(file.sql))) {
    events.push({ t: 'create', name: m[1], table: m[2], body: m[3], i: m.index });
  }
  while ((m = dropRe.exec(file.sql))) {
    events.push({ t: 'drop', name: m[1], table: m[2], i: m.index });
  }
  events.sort((a, b) => a.i - b.i);
  for (const e of events) {
    const table = e.table.includes('.') ? e.table : `public.${e.table}`;
    const key = `${table} :: ${e.name}`;
    if (e.t === 'drop') { policyState.delete(key); continue; }
    if (!/FOR\s+UPDATE/i.test(e.body)) { policyState.delete(key); continue; }
    policyState.set(key, { file: file.name, withCheck: /WITH\s+CHECK/i.test(e.body) });
  }
}

// A policy on a table that no longer exists cannot fire. `matches` was dropped
// in 20260514000003 (phase E of the conversations migration).
const DROPPED_TABLES = new Set(['public.matches']);

for (const [key, state] of policyState) {
  if (state.withCheck) continue;
  const table = key.split(' :: ')[0];
  if (DROPPED_TABLES.has(table)) continue;
  check(
    `UPDATE policy "${key}" declares WITH CHECK`,
    ACCEPTED_UNCHECKED_UPDATE_POLICIES.has(key),
    `Last defined in ${state.file}. A FOR UPDATE policy with no WITH CHECK reuses USING, so every column the policy does not mention is writable. Add WITH CHECK, or revoke the privilege and record the reason in ACCEPTED_UNCHECKED_UPDATE_POLICIES.`,
  );
}

// ---------------------------------------------------------------------------
// 3. Every SECURITY DEFINER function pins its search_path.
// ---------------------------------------------------------------------------
// Replayed in file order so that a CREATE OR REPLACE which drops an earlier
// `ALTER FUNCTION ... SET search_path` is caught: replacing a function discards
// its SET clauses.
const live = new Map();
for (const file of statements) {
  const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(/gi;
  const alterRe = /ALTER\s+FUNCTION\s+([\w.]+)[^;]*SET\s+search_path[^;]*;/gi;
  const dropRe = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([\w.]+)/gi;
  const events = [];
  let m;
  while ((m = createRe.exec(file.sql))) events.push({ t: 'create', name: m[1], i: m.index });
  while ((m = alterRe.exec(file.sql))) events.push({ t: 'alter', name: m[1], i: m.index });
  while ((m = dropRe.exec(file.sql))) events.push({ t: 'drop', name: m[1], i: m.index });
  events.sort((a, b) => a.i - b.i);
  const createIdx = events.filter((e) => e.t === 'create').map((e) => e.i);

  for (const event of events) {
    const key = event.name.toLowerCase().replace(/^public\./, '');
    if (event.t === 'drop') { live.delete(key); continue; }
    if (event.t === 'alter') { const cur = live.get(key); if (cur) cur.sp = true; continue; }
    const next = createIdx.find((i) => i > event.i);
    const body = file.sql.slice(event.i, next === undefined ? file.sql.length : next);
    const header = body.split(/\$\$|\$function\$|\$body\$/)[0];
    live.set(key, {
      file: file.name,
      secdef: /SECURITY\s+DEFINER/i.test(header),
      sp: /SET\s+search_path/i.test(header),
    });
  }
}
const unpinned = [...live.entries()].filter(([, v]) => v.secdef && !v.sp);
check(
  'every live SECURITY DEFINER function pins search_path',
  unpinned.length === 0,
  `Unpinned: ${unpinned.map(([n, v]) => `${n} (${v.file})`).join(', ')}. A definer function without SET search_path can be redirected by a caller-controlled schema.`,
);

// ---------------------------------------------------------------------------
// 4. The JUNO-02 access-control functions exist and are exposed correctly.
// ---------------------------------------------------------------------------
check(
  'public.profile_chart_visible exists',
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.profile_chart_visible/i.test(allStatements),
  'The shared visibility predicate is missing; the edge function fails closed without it.',
);
check(
  'public.profile_chart_visible is NOT executable by client roles',
  /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.profile_chart_visible[^;]*FROM[^;]*authenticated/i.test(allStatements),
  'The internal predicate takes a viewer id as a parameter. Exposed to authenticated, it would answer questions about other people.',
);
check(
  'public.can_view_profile_chart is executable by authenticated, not anon',
  /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.can_view_profile_chart[^;]*TO[^;]*authenticated/i.test(allStatements)
    && /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.can_view_profile_chart[^;]*FROM[^;]*anon/i.test(allStatements),
  'The client-facing wrapper must be callable by a signed-in reader and by nobody else.',
);
check(
  'can_view_profile_chart takes no viewer parameter',
  /FUNCTION\s+public\.can_view_profile_chart\(\s*p_target_id\s+UUID\s*\)/i.test(allStatements),
  'The viewer must come from auth.uid(). A viewer parameter is a guard someone can forget to write — the reason enforce_premium_feature has no user id either.',
);
check(
  'get_synastry_candidate_profiles checks the tier',
  /premium_required/i.test(allStatements)
    && /get_synastry_candidate_profiles[\s\S]*?premium_feature_policy/i.test(allStatements),
  'The synastry picker returns premium data and must verify the subscription (JUNO-02).',
);
check(
  'the picker and the reader share one visibility predicate',
  /get_synastry_candidate_profiles[\s\S]*?profile_chart_visible/i.test(allStatements),
  'Two copies of "who may I see" drift: the picker offers someone the reader is then refused, and nothing says so.',
);

// ---------------------------------------------------------------------------
// 5. From this wave on, a privilege migration must verify itself.
// ---------------------------------------------------------------------------
// The lesson of 20260903000002: PostgreSQL emits `WARNING: no privileges could
// be revoked for column ...` and COMMITS. A migration that looks like it worked
// is worse than one that fails.
//
// The floor is the date this rule was written. Applying it retroactively would
// fail the build on migrations that are already in production and cannot be
// edited — `supabase/migrations` is append-only by contract — which would make
// the check unfixable and therefore ignorable. 20260903000003 already works
// this way; it is the model the rule generalises.
const SELF_VERIFICATION_REQUIRED_FROM = '20260907';

for (const file of files) {
  const version = file.name.slice(0, 8);
  if (version < SELF_VERIFICATION_REQUIRED_FROM) continue;
  const sql = statementsOf(file.sql);
  if (!/\b(REVOKE|GRANT)\b/i.test(sql)) continue;
  check(
    `${file.name}: verifies its own effect before committing`,
    /RAISE\s+EXCEPTION/i.test(sql),
    'A privilege migration must assert its end state inside the transaction and RAISE if it did not take. See 20260903000003 for the pattern.',
  );
}

// ---------------------------------------------------------------------------
// 6. Migrations are append-only: a shipped file must not gain new statements.
// ---------------------------------------------------------------------------
// Checked structurally rather than by content hash (which would need a manifest
// nobody updates): every migration this wave added carries a version at or
// after the floor, and the older files are not expected to change. What CAN be
// verified here is that the two new files are ordered after everything else, so
// they cannot be replayed before the state they assume.
const NEW_THIS_WAVE = files
  .map((f) => f.name)
  .filter((n) => n.slice(0, 8) >= SELF_VERIFICATION_REQUIRED_FROM);
const latestOlder = files
  .map((f) => f.name)
  .filter((n) => n.slice(0, 8) < SELF_VERIFICATION_REQUIRED_FROM)
  .sort()
  .pop();
for (const name of NEW_THIS_WAVE) {
  check(
    `${name}: ordered after every previously shipped migration`,
    latestOlder === undefined || name > latestOlder,
    `${name} sorts before ${latestOlder}, so a fresh database would apply it too early.`,
  );
}

// ---------------------------------------------------------------------------
// 7. A migration's self-verification must not fire on its OWN new code.
// ---------------------------------------------------------------------------
// Section 5 requires every privilege migration to assert its end state and
// RAISE if it did not take. That rule created a second failure mode, and
// 20260907000003 hit it on the first run:
//
//     IF v_def LIKE '%tier_at_least(%SELECT%' THEN RAISE EXCEPTION …
//
// SQL `LIKE` wildcards span newlines, so the `%` between `tier_at_least(` and
// `SELECT` reached all the way down to the function's own `RETURN QUERY
// SELECT`. The pattern matched the CORRECT version, the DO block raised, and
// the migration rolled itself back on a false alarm. A guard that cries wolf
// gets deleted, so it is worth catching mechanically.
//
// This replays each assertion against the very function body the same file
// defines, and fails if one of them would RAISE. It cannot check assertions
// about the live database (privileges, other objects) — only the ones that
// inspect `pg_get_functiondef`, which is where the trap lives.
{
  /** SQL LIKE → JS RegExp. `%` spans anything, `_` is one character. */
  const likeToRegExp = (pattern) =>
    new RegExp(
      pattern
        .replace(/'{2}/g, "'")
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/%/g, '[\\s\\S]*')
        .replace(/_/g, '.'),
    );

  for (const file of files) {
    if (!file.sql.includes('pg_get_functiondef')) continue;

    // Which function does the DO block inspect?
    const inspected = file.sql.match(/p\.proname\s*=\s*'([\w]+)'/);
    if (!inspected) continue;
    const name = inspected[1];

    // That function's definition, in this same file.
    const createAt = file.sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    if (createAt < 0) continue;
    const bodyEnd = file.sql.indexOf('$$;', createAt);
    if (bodyEnd < 0) continue;
    const body = file.sql.slice(createAt, bodyEnd + 3);

    // Every assertion of the form `IF v_def <op> '<pattern>' THEN`.
    const assertion =
      /IF\s+(\w+)\s+(NOT\s+LIKE|LIKE|!~\*?|~\*?)\s+'((?:[^']|'')*)'\s+THEN/gi;
    let m;
    let seen = 0;
    while ((m = assertion.exec(file.sql)) !== null) {
      const [, variable, rawOp, pattern] = m;
      if (variable.toLowerCase() !== 'v_def') continue;
      seen += 1;
      const op = rawOp.replace(/\s+/g, ' ').toUpperCase();

      let matches;
      try {
        matches = op === 'LIKE' || op === 'NOT LIKE'
          ? likeToRegExp(pattern).test(body)
          : new RegExp(pattern.replace(/'{2}/g, "'")).test(body);
      } catch (error) {
        check(
          `${file.name}: self-verification pattern is a valid expression`,
          false,
          `${op} '${pattern}' — ${error.message}`,
        );
        continue;
      }

      // The condition under which the DO block RAISEs.
      const wouldRaise =
        op === 'NOT LIKE' || op === '!~' || op === '!~*'
          ? !matches
          : matches;

      check(
        `${file.name}: assertion \`v_def ${op} '${pattern.slice(0, 46)}${pattern.length > 46 ? '…' : ''}'\` accepts its own function`,
        !wouldRaise,
        `Replayed against the ${name} body this file defines, this assertion RAISEs — the migration would roll itself back on correct code. ` +
        (op === 'LIKE' || op === 'NOT LIKE'
          ? 'Remember that LIKE wildcards span newlines: `%a(%b%` reaches past the whole function body. Use a regex with a bounded class such as `[^)]*`.'
          : 'Check the regex against both the old and the new body.'),
      );
    }

    check(
      `${file.name}: its self-verification actually asserts something`,
      seen > 0,
      'The file reads pg_get_functiondef but makes no v_def assertion.',
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error('\nRLS contract violations:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(
    `${failures.length} of ${checks.length} checks failed.\n`,
  );
  process.exit(1);
}

console.log(`RLS contract looks clean: ${checks.length} checks passed.`);
console.log(
  '\nThis validator reads the REPOSITORY. It cannot see a privilege changed by hand in the\n' +
  'SQL editor — which is exactly what happened on 3 Sep 2026. Settle the live state with the\n' +
  'block in docs/security-audit-2026-09-07.md §8, or:\n' +
  '\n' +
  "  SELECT grantee, privilege_type FROM information_schema.role_table_grants\n" +
  "   WHERE table_schema='public' AND table_name IN ('messages','conversations','premium_usage')\n" +
  "     AND grantee IN ('anon','authenticated') ORDER BY table_name, grantee, privilege_type;\n" +
  '  SELECT * FROM public.check_profiles_pii_posture();\n',
);
