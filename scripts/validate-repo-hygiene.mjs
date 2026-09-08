#!/usr/bin/env node
// validate:repo-hygiene — the second remediation wave's structural guards.
//
//   node scripts/validate-repo-hygiene.mjs
//
// WHAT IT GUARDS, AND WHY EACH ONE NEEDS A GUARD AT ALL
// ----------------------------------------------------
// Three findings from docs/security-audit-2026-09-07.md whose fixes share one
// property: each is a single line to undo, and none of them fails visibly when
// undone. A CI pipeline keeps passing without a `permissions:` block. A commit
// keeps working with an archive back in the routing folder. Lifecycle mail
// keeps sending with the service-role derivation restored — right up until the
// key is rotated, months later, and every unsubscribe link in every inbox dies
// at once.
//
//   JUNO-18  GITHUB_TOKEN must not inherit the repository default.
//   JUNO-20  No archive under a route folder (apps/*/app/).
//   JUNO-21  No signing key derived from SUPABASE_SERVICE_ROLE_KEY.
//   (+)      No credential material in a tracked file.
//
// The JUNO-21 checks overlap the vitest suite in
// packages/shared/src/security/__tests__/unsubscribe-token.test.ts on purpose.
// That suite proves the BEHAVIOUR against the real module; this one survives
// the deletion of that suite, which is the failure mode a determined "let's
// simplify the tests" pass produces.
//
// Reads the repository only. No network, no database, no secrets.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const checks = [];

function check(name, condition, detail) {
  checks.push(name);
  if (!condition) failures.push(`${name}\n    ${detail}`);
}

function read(relative) {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Comments blanked, so prose in a header cannot satisfy a code assertion. */
function codeOf(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Tracked files, from git rather than the filesystem. */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

const tracked = trackedFiles();

// ---------------------------------------------------------------------------
// JUNO-18 — GitHub Actions least privilege
// ---------------------------------------------------------------------------
//
// A YAML parser would be the obvious tool and is the wrong one: adding a
// dependency to a security validator widens the very surface it exists to
// narrow (JUNO-12 is about npm advisories). The workflow files here are flat
// and small, so the structure is read by indentation, which is also what makes
// "workflow level vs job level" checkable at all.

const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');
const workflows = existsSync(WORKFLOW_DIR)
  ? readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f))
  : [];

check(
  'JUNO-18: at least one workflow exists to guard',
  workflows.length > 0,
  'No .github/workflows/*.yml found — this validator would be vacuous.',
);

/** Write-capable scopes. `contents: read` and `: none` are fine anywhere. */
const WRITE_VALUE = /:\s*(write|write-all)\s*$/;

for (const file of workflows) {
  const relative = `.github/workflows/${file}`;
  const raw = read(relative);
  const lines = raw.split(/\r?\n/);

  // Top-level keys sit at column 0. A workflow-level `permissions:` is
  // therefore an unindented `permissions:`.
  const topLevelIdx = lines.findIndex((l) => /^permissions:\s*$/.test(l) || /^permissions:\s*\S/.test(l));

  check(
    `JUNO-18: ${relative} declares workflow-level permissions`,
    topLevelIdx >= 0,
    'Without a top-level `permissions:` block, GITHUB_TOKEN inherits the repository\n' +
      '    default, which on a repository created before Feb 2023 is read/write. Add:\n' +
      '\n      permissions:\n        contents: read\n',
  );

  if (topLevelIdx >= 0) {
    // Collect the block: the `permissions:` line plus every indented line
    // until the next top-level key.
    const block = [lines[topLevelIdx]];
    for (let i = topLevelIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || /^\s/.test(line)) {
        block.push(line);
        if (/^\S/.test(line)) break;
      } else break;
    }
    const writes = block.filter((l) => WRITE_VALUE.test(l) && !l.trim().startsWith('#'));
    check(
      `JUNO-18: ${relative} grants no write scope at workflow level`,
      writes.length === 0,
      `Write scopes found: ${writes.map((l) => l.trim()).join(', ')}\n` +
        '    A pipeline that only runs validators needs none of them.',
    );
  }

  // A job may legitimately need more — but it must say so. The justification
  // has to be a comment adjacent to the escalation, so the reviewer of the
  // diff that adds it is the one who has to write the reason.
  lines.forEach((line, i) => {
    if (!/^\s+/.test(line)) return;
    if (!WRITE_VALUE.test(line)) return;
    if (line.trim().startsWith('#')) return;
    const context = lines.slice(Math.max(0, i - 6), i).join('\n');
    check(
      `JUNO-18: ${relative}:${i + 1} escalation is justified in a comment`,
      /#/.test(context),
      `\`${line.trim()}\` widens GITHUB_TOKEN with no comment above it explaining why.`,
    );
  });

  // `pull_request_target` runs with the base repository's secrets against a
  // fork's code. It has legitimate uses; none of them are in a quality gate.
  check(
    `JUNO-18: ${relative} does not use pull_request_target`,
    !/^\s*pull_request_target\s*:/m.test(codeOf(raw)),
    'pull_request_target exposes repository secrets to code from a fork.',
  );
}

// ---------------------------------------------------------------------------
// JUNO-20 — no archives in a route folder
// ---------------------------------------------------------------------------
//
// Scoped to `apps/*/app/`. Archives elsewhere (store assets, build artefacts)
// are legitimate and deliberately not this rule's business. `.gitignore` alone
// is not enough: `git add -f` walks straight past it, which is presumably how
// the original one arrived.

const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz|gz|7z|rar|bz2|xz)$/i;
const ROUTE_ARCHIVE = tracked.filter(
  (f) => /^apps\/[^/]+\/app\//.test(f) && ARCHIVE_EXT.test(f),
);

check(
  'JUNO-20: no archive is tracked under apps/*/app/',
  ROUTE_ARCHIVE.length === 0,
  `Tracked archives in a routing folder: ${ROUTE_ARCHIVE.join(', ')}\n` +
    '    A code snapshot beside live routes invites a restore of a pre-hardening\n' +
    '    version. The git history is the backup. Remove with `git rm -- <path>`.',
);

check(
  'JUNO-20: .gitignore keeps route folders free of archives',
  /apps\/\*\/app\/\*\*\/\*\.zip/.test(read('.gitignore')),
  'The `apps/*/app/**/*.zip` rule is gone from .gitignore.',
);

// ---------------------------------------------------------------------------
// JUNO-21 — no signing key derived from the service-role key
// ---------------------------------------------------------------------------

const EDGE_DIR = 'supabase/functions';

/**
 * From the filesystem, not from `git ls-files`.
 *
 * The archive and credential checks below deliberately read the git index —
 * "is it committed" is the security question there. Here it is the opposite: a
 * brand-new edge function that reintroduces the derivation is exactly what this
 * must catch, and on the commit that introduces it the file is not yet tracked.
 * The first version of this validator used `tracked` for all three and reported
 * its own new module as missing.
 */
function walkTs(dir) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkTs(rel));
    else if (entry.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

const edgeSources = walkTs(EDGE_DIR);

check(
  'JUNO-21: edge sources are present to scan',
  edgeSources.length > 0,
  'No supabase/functions/**/*.ts tracked — this validator would be vacuous.',
);

for (const file of edgeSources) {
  const code = codeOf(read(file));

  check(
    `JUNO-21: ${file} does not derive a key with juno-unsubscribe-v1:`,
    !code.includes('juno-unsubscribe-v1:'),
    'The pre-fix derivation is back. Rotating the service-role key would then\n' +
      '    invalidate every unsubscribe link already in somebody\'s inbox — an RFC 8058\n' +
      '    failure with Gmail and Yahoo, and a CASL one in Québec.',
  );

  // Broader than the exact string: any assignment to a *_SECRET / *_KEY that
  // mentions SERVICE_ROLE, other than reading the admin client's own key.
  const offending = code.split('\n').filter((line) => {
    if (!/(SECRET|_KEY|secret|signingKey)\s*=/.test(line)) return false;
    if (!/SERVICE_ROLE/.test(line)) return false;
    // The admin Supabase client legitimately reads it; it signs nothing.
    return !/^\s*const\s+\w+\s*=\s*Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']\s*\)/.test(line);
  });
  check(
    `JUNO-21: ${file} derives no secret from SERVICE_ROLE`,
    offending.length === 0,
    `Offending line(s): ${offending.map((l) => l.trim()).join(' | ')}`,
  );
}

// The two functions must go through the shared module rather than growing a
// private copy of the algorithm back — two copies of an HMAC scheme drift the
// way the two tarot decks and the two ephemerides did.
const SHARED_TOKEN = `${EDGE_DIR}/_shared/unsubscribe-token.ts`;
check(
  'JUNO-21: the shared token module exists',
  existsSync(path.join(ROOT, SHARED_TOKEN)),
  `${SHARED_TOKEN} is missing; signing and verification would be duplicated again.`,
);

if (existsSync(path.join(ROOT, SHARED_TOKEN))) {
  const shared = codeOf(read(SHARED_TOKEN));
  check(
    'JUNO-21: the shared module never reads the service-role key',
    !shared.includes('SUPABASE_SERVICE_ROLE_KEY'),
    'The whole point of the module is that the signing key is independent.',
  );
  check(
    'JUNO-21: the shared module supports both generations',
    shared.includes('"legacy"') && shared.includes('TOKEN_VERSION'),
    'Legacy verification is gone: every link already sent becomes a 400.',
  );
  check(
    'JUNO-21: the current signing key is NOT read from the retired variable name',
    /CURRENT_SECRET_ENV\s*=\s*"UNSUBSCRIBE_TOKEN_SECRET_V2"/.test(shared) &&
      /RETIRED_SECRET_ENV\s*=\s*"UNSUBSCRIBE_TOKEN_SECRET"/.test(shared),
    'The zero-downtime transition depends on the new key living under a name the\n' +
      '    DEPLOYED function ignores. If the signing key moves back to\n' +
      '    UNSUBSCRIBE_TOKEN_SECRET, provisioning it breaks every old link minutes\n' +
      '    before the new code lands. See the module header.',
  );
}

for (const [file, must, mustNot] of [
  [`${EDGE_DIR}/send-email/index.ts`, 'signUnsubscribeToken', 'verifyUnsubscribeToken'],
  [`${EDGE_DIR}/unsubscribe/index.ts`, 'verifyUnsubscribeToken', 'signUnsubscribeToken'],
]) {
  if (!existsSync(path.join(ROOT, file))) continue;
  const code = codeOf(read(file));
  check(
    `JUNO-21: ${file} uses the shared ${must}`,
    code.includes(must),
    'It no longer goes through the shared module.',
  );
  check(
    `JUNO-21: ${file} does not also ${mustNot.startsWith('sign') ? 'sign' : 'verify'}`,
    !code.includes(mustNot),
    `Signing and verification are meant to live apart; this file now does both.`,
  );
  check(
    `JUNO-21: ${file} holds no private HMAC implementation`,
    !/crypto\.subtle/.test(code),
    'A second copy of the signing algorithm is how two implementations drift.',
  );
}

// ---------------------------------------------------------------------------
// Every RPC an edge function calls must be created by a migration
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS. On 8 Sep 2026 the wave-2 verification hit
// `ERROR: 42883: function "public.check_edge_rate_limit(text,integer,integer)"
// does not exist`. The function is created by
// 20260420000004_rate_limiting.sql — which lives in this repository and had
// evidently never been applied. Three deployed edge functions call it, and all
// three fail OPEN on an RPC error, so their rate limiting had been inert for
// months with no symptom other than a warning line in logs nobody reads.
//
// This check cannot see the live database — nothing in this repository can, and
// that is JUNO-15. What it CAN see is the weaker but still useful invariant: an
// RPC name that no migration anywhere creates is a guaranteed 42883, not a
// maybe. It would have caught a typo'd RPC name on the commit that introduced
// it, and it fails loudly when a function is called before its migration is
// written.
//
// Scope note, stated honestly: a migration existing in the repository does NOT
// mean it ran. `supabase/tests/diagnose_rate_limiting.sql` answers that, and
// only against the real database.

// `.rpc('x')` plus the two injectable wrappers get-profile-chart uses so its
// authorization decision can be executed under vitest — `rpcAsService('x')`
// and `rpcAsCaller('x')`. Matching only `.rpc(` silently skipped the three RPCs
// behind wave 1's most security-sensitive endpoint.
const RPC_CALL = /\brpc(?:AsService|AsCaller)?\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
const CREATES_FN = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;

const MIGRATION_DIR = 'supabase/migrations';
const declaredFunctions = new Set();
if (existsSync(path.join(ROOT, MIGRATION_DIR))) {
  for (const file of readdirSync(path.join(ROOT, MIGRATION_DIR))) {
    if (!file.endsWith('.sql')) continue;
    const sql = read(`${MIGRATION_DIR}/${file}`);
    for (const match of sql.matchAll(CREATES_FN)) declaredFunctions.add(match[1]);
  }
}

check(
  'migrations declare functions at all',
  declaredFunctions.size > 0,
  'No CREATE FUNCTION found in supabase/migrations — this check would be vacuous.',
);

const undeclaredRpcs = [];
for (const file of edgeSources) {
  const code = codeOf(read(file));
  for (const match of code.matchAll(RPC_CALL)) {
    const name = match[1];
    if (!declaredFunctions.has(name)) undeclaredRpcs.push(`${file} → ${name}()`);
  }
}

check(
  'every RPC an edge function calls is created by a migration',
  undeclaredRpcs.length === 0,
  `${undeclaredRpcs.join('\n    ')}\n` +
    '    A call to a function no migration creates raises 42883 at runtime. Where the\n' +
    '    caller fails open — as calculate-chart, claim-referral and claim-promo-code all\n' +
    '    do on their rate limiter — the control is simply absent, silently.',
);

// ---------------------------------------------------------------------------
// Credential material in tracked files
// ---------------------------------------------------------------------------
//
// Not a replacement for gitleaks — it scans the working tree, not the history,
// and it knows a handful of patterns. It exists because JUNO-04's analysis
// turned on exactly this question ("has the key ever been committed?") and the
// answer should be re-checked on every push rather than once, by hand, in
// September.
//
// Values are never printed. A hit reports the file, the line and the pattern.

// Every pattern must match the CREDENTIAL, never merely a mention of its
// shape. The distinction is not pedantic: the first version of this list
// flagged supabase/functions/revenuecat-webhook/index.ts, where
// `-----BEGIN PRIVATE KEY-----` appears inside `pemToArrayBuffer` as the header
// being STRIPPED from a key that arrives in an environment variable. A
// validator that cries wolf on correct code is a validator somebody switches
// off. So the PEM rule requires the header to be followed by actual base64
// material — which a parser's `.replace('…', '')` never is.
const SECRET_PATTERNS = [
  ['JWT (Supabase anon/service key shape)', /eyJhbGciOi[A-Za-z0-9_-]{20,}/],
  ['Stripe live secret key', /sk_live_[A-Za-z0-9]{16,}/],
  ['Stripe webhook signing secret', /whsec_[A-Za-z0-9]{16,}/],
  ['Resend API key', /\bre_[A-Za-z0-9]{24,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  [
    'PEM private key with key material',
    /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----(?:\\n|\s|["'`+,]){1,20}[A-Za-z0-9+/]{40,}/,
  ],
  ['RevenueCat secret key', /\b(?:appl|goog|amzn)_[A-Za-z0-9]{24,}/],
];

/** Text files only, and never the audit report, which names the patterns. */
const SKIP = new Set(['docs/security-audit-2026-09-07.md', 'scripts/validate-repo-hygiene.mjs']);
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|sql|sh|ps1|env|example|txt|html|css|xml|plist|gradle|properties)$/i;

// Matched against the whole file, not line by line: a PEM key spans lines, and
// splitting first is how a scanner misses the one credential shape that is
// never on a single line. The line number is recovered from the match offset.
const hits = [];
for (const file of tracked) {
  if (SKIP.has(file)) continue;
  if (!TEXT_EXT.test(file)) continue;
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;         // staged deletion
  if (statSync(full).size > 2_000_000) continue;
  const text = readFileSync(full, 'utf8');
  for (const [label, pattern] of SECRET_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split('\n').length;
    hits.push(`${file}:${line} — ${label}`);
  }
}

check(
  'No credential material in a tracked file',
  hits.length === 0,
  `${hits.join('\n    ')}\n` +
    '    Values are deliberately not printed. Treat any hit as live: rotate first,\n' +
    '    then remove. Removing it from the working tree does not remove it from the\n' +
    '    git history.',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error('\nRepository hygiene violations:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(`${failures.length} of ${checks.length} checks failed.\n`);
  process.exit(1);
}

console.log(`Repository hygiene looks clean: ${checks.length} checks passed.`);
console.log(
  '\nScope note: this reads the WORKING TREE. It cannot see a secret that was\n' +
  'committed and later removed — `git log -p -S<pattern>` and a real scanner\n' +
  '(gitleaks detect --no-git) answer that question. It also cannot see the\n' +
  'repository-level default GITHUB_TOKEN permission, only whether the workflow\n' +
  'overrides it; tightening the default in Settings → Actions is still worth doing.\n',
);
