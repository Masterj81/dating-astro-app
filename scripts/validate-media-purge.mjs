#!/usr/bin/env node
// validate:media-purge — JUNO-09's structural guards.
//
//   node scripts/validate-media-purge.mjs
//
// WHAT THIS GUARDS, AND WHY EACH ONE NEEDS A GUARD
// ---------------------------------------------------------------------------
// Deleting an account used to mean `auth.admin.deleteUser()` and nothing else.
// The FK cascade removes `profiles` and everything hanging off it; it removes no
// storage object, because `storage.objects` has no foreign key to `auth.users`.
// Five objects survive today from accounts that no longer exist — the oldest
// from 1 February 2026, and one of them is a video of someone's face.
//
// Every assertion below is one line to undo, and none of them fails visibly when
// undone. An account still deletes. The reader still gets their confirmation
// email. The only thing that changes is that a file stays behind, and nothing
// says so.
//
// FOUR PROPERTIES, AND THE ORDER OF THE FIRST TWO IS THE WHOLE DESIGN
// ---------------------------------------------------------------------------
//   1. ONE implementation. The web route is Node, the cron is Deno; two copies
//      of a deletion routine drift, and this repository has watched that happen
//      twice — two ephemerides, two tarot decks, both already divergent when
//      found. So both executors call the same edge function, and that is checked
//      here rather than hoped for.
//
//   2. The job row is created BEFORE the account is deleted, and a failure to
//      create it STOPS the deletion. The row has no foreign key to `auth.users`,
//      so it survives the cascade — it is the only thing that can drive a resume
//      once the account is gone. Deleting without it strands the media with no
//      record that it exists.
//
//   3. Ownership is PROVED, never matched. `scripts/seed-profile-photos.js`
//      writes `seed-{uuid}.jpg` at the bucket root: 60 such objects sit in
//      `avatars` today, and a `path.includes(uuid)` test would delete them.
//
//   4. Nothing sensitive is logged or stored. A storage error message contains
//      the path that failed.
//
// Reads the repository only. No network, no database. The live state is answered
// by supabase/tests/diagnose_media_purge_jobs.sql.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

/** Comments blanked. Every file here discusses these patterns in its own prose. */
function codeOf(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '');
}

const PURGE_FN = 'supabase/functions/purge-user-media/index.ts';
const CRON_FN = 'supabase/functions/process-expired-deletions/index.ts';
const WEB_ROUTE = 'apps/web/src/app/api/account/confirm-deletion/route.ts';
// Les helpers ne peuvent PAS vivre dans la route : un `route.ts` de l App Router
// n exporte que ses gestionnaires HTTP, et le typecheck echoue sinon. Le garde
// s assert donc sur la route, l appel sur le module.
const WEB_LIB = 'apps/web/src/lib/media-purge.ts';
const GRACE_FN = 'supabase/functions/delete-account/index.ts';
const CANCEL_FN = 'supabase/functions/cancel-account-deletion/index.ts';
const TABLE_MIGRATION = 'supabase/migrations/20260910000002_media_purge_jobs.sql';
const CRON_MIGRATION = 'supabase/migrations/20260910000003_media_purge_resume_cron.sql';
const DETECTOR = 'supabase/tests/diagnose_media_ownership.sql';
const CONFIG = 'supabase/config.toml';

// ---------------------------------------------------------------------------
// 0. Everything exists. A guard whose subject is missing proves nothing.
// ---------------------------------------------------------------------------
for (const file of [PURGE_FN, CRON_FN, WEB_ROUTE, WEB_LIB, GRACE_FN, CANCEL_FN,
                    TABLE_MIGRATION, CRON_MIGRATION, DETECTOR, CONFIG]) {
  check(`Present: ${path.basename(file)}`, read(file) !== null, `${file} is missing.`);
}

const purgeSrc = read(PURGE_FN) ?? '';
const cronSrc = read(CRON_FN) ?? '';
const webSrc = read(WEB_ROUTE) ?? '';
const tableSrc = read(TABLE_MIGRATION) ?? '';
const cronMigSrc = read(CRON_MIGRATION) ?? '';

const purgeCode = codeOf(purgeSrc);
const cronCode = codeOf(cronSrc);
const webLibSrc = read(WEB_LIB) ?? '';
const webCode = codeOf(webSrc);
const webLibCode = codeOf(webLibSrc);
/** Route + module : c est l ensemble qui doit joindre la purge centralisee. */
const webAll = `${webCode}
${webLibCode}`;

// ---------------------------------------------------------------------------
// 1. One implementation, reached by both executors.
// ---------------------------------------------------------------------------
const FUNCTION_PATH = '/functions/v1/purge-user-media';

for (const [label, code] of [['cron executor', cronCode], ['web route', webAll]]) {
  check(
    `${label} calls the central purge`,
    code.includes(FUNCTION_PATH) && /requestMediaPurge\s*\(/.test(code),
    `It must reach ${FUNCTION_PATH}. Reimplementing the purge here is how the two\n` +
      '    ephemerides and the two tarot decks in this repository drifted apart.',
  );
}

check(
  'Both executors name the same function path',
  (cronCode.match(/["'`]\/functions\/v1\/[a-z-]+["'`]/g) ?? []).includes(`"${FUNCTION_PATH}"`) &&
    (webLibCode.match(/["'`]\/functions\/v1\/[a-z-]+["'`]/g) ?? []).includes(`"${FUNCTION_PATH}"`),
  'A divergent path would silently give one executor a purge and the other nothing.',
);

check(
  'The route delegates rather than reimplementing',
  !/["'`]\/functions\/v1\//.test(webCode) && /@\/lib\/media-purge/.test(webCode),
  'The route must import the helper, not carry its own copy of the call. Two\n' +
    '    copies of the same request drift, and the one nobody reads drifts first.',
);

// ---------------------------------------------------------------------------
// 2. The gate: job row first, and a failure stops the deletion.
// ---------------------------------------------------------------------------
for (const [label, code] of [['cron executor', cronCode], ['web route', webCode]]) {
  const purgeAt = code.search(/await\s+requestMediaPurge\s*\(/);
  const deleteAt = code.search(/deleteUser\s*\(/);

  check(
    `${label}: the purge is requested BEFORE the account is deleted`,
    purgeAt >= 0 && deleteAt >= 0 && purgeAt < deleteAt,
    'The job row must exist before the irreversible act. It has no FK to\n' +
      '    auth.users precisely so it survives the cascade; created afterwards it\n' +
      '    could not be created at all, and the media would be stranded unrecorded.',
  );

  // Scoped to the span BETWEEN the purge call and the deletion, deliberately.
  //
  // A file-wide search passed while the gate was gone: `requestMediaPurge` itself
  // contains `payload.jobCreated !== true` for its own reason, so replacing the
  // guard with `if (false)` left the check green. A guard that can be satisfied
  // by an unrelated line elsewhere in the file is not a guard.
  const gate = purgeAt >= 0 && deleteAt > purgeAt ? code.slice(purgeAt, deleteAt) : '';
  check(
    `${label}: a missing job row stops the deletion`,
    /jobCreated/.test(gate) && /\b(continue|return)\b/.test(gate),
    'Between requesting the purge and deleting the account there must be a branch\n' +
      '    that reads jobCreated and leaves. Without it the account is deleted and the\n' +
      '    media is stranded with nothing recording that it exists — the finding itself.',
  );

  check(
    `${label}: an INCOMPLETE purge does not stop the deletion`,
    !/if\s*\(\s*!\s*purge\.done\s*\)\s*{[^}]*return/.test(code),
    'The reader asked for their account to be deleted. Refusing because object\n' +
      '    storage is unwell would be a worse failure than the one being fixed —\n' +
      '    and the resume cron exists exactly so that it need not block.',
  );
}

check(
  'The purge function refuses to report a job it did not create',
  /jobCreated:\s*false/.test(purgeCode) && /job_not_created/.test(purgeCode),
  'The response must let the caller distinguish "job recorded" from "purge\n' +
    '    finished". Collapsing the two makes the gate meaningless.',
);

// ---------------------------------------------------------------------------
// 3. Ownership is proved, never matched.
// ---------------------------------------------------------------------------
check(
  'The purge validates the UUID anchored at both ends',
  /\^\[0-9a-f\]\{8\}-/.test(purgeCode) && /\{12\}\$/.test(purgeCode),
  'Without ^ and $, "../../etc/passwd/00000000-0000-0000-0000-000000000000"\n' +
    '    matches, and that value then builds a storage prefix.',
);

check(
  'The purge rebuilds and revalidates each path rather than trusting the prefix',
  /buildOwnedPath/.test(purgeCode) &&
    /segments\[0\]\?\.toLowerCase\(\)\s*!==\s*userId\.toLowerCase\(\)/.test(purgeCode),
  'Ownership is the FIRST PATH SEGMENT equalling the uuid in full, checked on\n' +
    '    the reconstructed path — not assumed from the prefix that was passed in.',
);

check(
  'The purge refuses traversal segments',
  /===\s*["']\.\.["']/.test(purgeCode) && /===\s*["']\.["']/.test(purgeCode),
  'A `..` segment walks out of the user folder.',
);

// The counterexample that makes partial matching fatal here.
const PARTIAL_MATCH = [
  [/\.includes\(\s*userId\s*\)/, 'path.includes(userId)'],
  [/\.indexOf\(\s*userId\s*\)/, 'path.indexOf(userId)'],
  [/new RegExp\([^)]*userId/, 'a RegExp built from userId'],
  [/LIKE\s*'%'\s*\|\|/i, "SQL LIKE '%' || uuid"],
];
for (const [pattern, label] of PARTIAL_MATCH) {
  check(
    `The purge does not match a UUID partially (${label})`,
    !pattern.test(purgeCode),
    'scripts/seed-profile-photos.js writes `seed-{uuid}.jpg` AT THE BUCKET ROOT.\n' +
      '    There are 60 such objects in `avatars` today, and a partial match would\n' +
      '    delete every one of them.',
  );
}

check(
  'The bucket allowlist is hard-coded and holds only user media',
  /PURGE_BUCKETS\s*=\s*\[\s*["']avatars["'],\s*["']voice-intros["'],\s*["']verifications["']\s*\]/
    .test(purgeCode),
  'A bucket list that can grow by configuration is a bucket list that can grow\n' +
    '    by accident. `marketing-images` and `tarot` hold no user media.',
);

check(
  'The database allowlist matches the function allowlist',
  /'avatars',\s*'voice-intros',\s*'verifications'/.test(tableSrc),
  'The CHECK on per_category and the function must accept the same three\n' +
    '    buckets, or a legitimate result is refused on write.',
);

// ---------------------------------------------------------------------------
// 4. No second implementation grows anywhere else.
// ---------------------------------------------------------------------------
const REMOVE_EXCEPTIONS = new Set([
  // A reader deleting their OWN voice intro from the profile screen. User
  // action on a live account, not an account-deletion purge.
  'apps/mobile/services/voiceIntroService.ts',

  // JUNO-09 phase C — the historical catch-up (11 Sep 2026). A SECOND storage
  // deleter, and pinning it here is not a weakening of this check: the file is
  // named, so a THIRD one still fails.
  //
  // Why it is legitimate rather than the drift this check exists to prevent:
  // phase B deletes the media of an account being deleted NOW, driven by a
  // `media_purge_jobs` row created before the deletion. Phase C deletes objects
  // whose accounts vanished months ago, for which no such row exists and none
  // can honestly be fabricated (constraint 13). They are different operations on
  // different inputs, and merging them would mean inventing a provenance.
  //
  // What bounds it is a separate guard: `scripts/validate-orphan-purge.mjs`
  // (90 checks on 11 Sep 2026) requires a manifest, a server-signed approval, a cap of five,
  // and re-verification per entry — and asserts that phase B's own guarantees
  // are untouched.
  'supabase/functions/purge-orphan-media/index.ts',
]);

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.expo', '.turbo']);

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const sources = [...walk('apps'), ...walk('supabase/functions'), ...walk('packages')];
const strayRemovals = [];
for (const file of sources) {
  if (file === PURGE_FN) continue;
  if (REMOVE_EXCEPTIONS.has(file)) continue;
  if (file.includes('__tests__')) continue;
  const code = codeOf(read(file) ?? '');
  if (/storage[\s\S]{0,120}?\.remove\s*\(/.test(code)) strayRemovals.push(file);
}

check(
  'No storage removal outside the central purge',
  strayRemovals.length === 0,
  `${strayRemovals.join('\n    ')}\n` +
    '    A second deletion routine drifts from the first. The one pinned exception\n' +
    '    is a reader deleting their own voice intro from a live account.',
);

for (const file of REMOVE_EXCEPTIONS) {
  check(
    `Pinned removal exception still present: ${path.basename(file)}`,
    read(file) !== null,
    'The file was renamed or deleted. Re-point the exception, or drop it — but do\n' +
      '    not leave a pin naming nothing.',
  );
}

// ---------------------------------------------------------------------------
// 5. Constraints 6 and 7: the grace window and the cancellation never purge.
// ---------------------------------------------------------------------------
for (const [label, file] of [
  ['delete-account (grace window)', GRACE_FN],
  ['cancel-account-deletion', CANCEL_FN],
]) {
  const code = codeOf(read(file) ?? '');
  check(
    `${label} purges nothing`,
    !code.includes('purge-user-media') && !/\.remove\s*\(/.test(code) &&
      !/deleteUser\s*\(/.test(code),
    'During the grace window the reader can still change their mind, and\n' +
      '    cancelling must leave every file exactly where it was. A purge here would\n' +
      '    destroy data the reader has not agreed to lose.',
  );
}

// ---------------------------------------------------------------------------
// 6. Nothing sensitive is logged or stored.
// ---------------------------------------------------------------------------
const logLines = purgeCode.split('\n').filter((line) => /console\.(log|error|warn)/.test(line));
const leaky = logLines.filter((line) =>
  /\$\{\s*(path|filePath|fullPath|entry\.name|name)\s*\}/.test(line) ||
  /\$\{\s*[a-zA-Z]*[Uu]serId\s*\}/.test(line) ||
  /error\.message/.test(line));

check(
  'The purge logs no path, filename or user id',
  leaky.length === 0,
  `${leaky.map((l) => l.trim()).join('\n    ')}\n` +
    '    A storage error message contains the path that failed. Bucket names and\n' +
    '    counters are the whole useful payload.',
);

check(
  'Storage errors are reduced to a class before they travel',
  /function classifyStorageError/.test(purgeCode) &&
    /errorClass\s*=\s*errorClass\s*\?\?\s*classifyStorageError/.test(purgeCode),
  'The message must be discarded at the boundary, not carried and trimmed later.',
);

const CLASSES = [
  'storage_unavailable', 'permission_denied', 'bucket_missing',
  'ambiguous_ownership', 'rate_limited', 'timeout', 'unknown',
];
check(
  'The error classes are identical in the function and the CHECK constraint',
  CLASSES.every((c) => purgeCode.includes(`"${c}"`)) &&
    CLASSES.every((c) => tableSrc.includes(`'${c}'`)),
  'A class the database refuses turns every failing purge into two failures —\n' +
    '    and the second one is invisible.',
);

// ---------------------------------------------------------------------------
// 7. The durable state can hold no path, structurally.
// ---------------------------------------------------------------------------
const tableBlock = tableSrc.slice(
  tableSrc.indexOf('CREATE TABLE IF NOT EXISTS public.media_purge_jobs'),
  tableSrc.indexOf('COMMENT ON TABLE'),
);

check(
  'The job table carries no foreign key',
  tableBlock.length > 0 && !/REFERENCES/i.test(tableBlock),
  'A foreign key to auth.users would delete the row by cascade at the exact\n' +
    '    moment it becomes useful. THE ABSENCE OF THE FK IS THE FEATURE.',
);

check(
  'The migration asserts the absence of the foreign key itself',
  /c\.contype\s*=\s*'f'/.test(tableSrc) && /cle\(s\) etrangere/.test(tableSrc),
  'Someone will eventually add it "to keep things tidy". The migration has to\n' +
    '    refuse, not this file alone.',
);

check(
  'The job table carries no column that could hold a path',
  tableBlock.length > 0 &&
    !/^\s+(\w*path\w*|\w*file\w*|\w*url\w*|\w*object_name\w*)\s+TEXT/im.test(tableBlock),
  'A purge log that records the paths it deleted recreates the data it exists\n' +
    '    to erase — and keeps it for 90 days after the account is gone.',
);

check(
  'The per_category shape is constrained so a string cannot be stored',
  /_media_purge_shape_ok/.test(tableSrc) &&
    /jsonb_typeof\(v\.val\) NOT IN \('number', 'boolean'\)/.test(tableSrc),
  'Without this the jsonb column accepts any value, and a path lands in it the\n' +
    '    first time someone adds a "helpful" debug field.',
);

check(
  'The retention keeps completed jobs no longer than 90 days',
  /purge_completed_media_purge_jobs/.test(cronMigSrc) &&
    /p_retention_days INTEGER DEFAULT 90/.test(cronMigSrc) &&
    /purge_completed_media_purge_jobs\(90\)/.test(cronMigSrc),
  'The rows hold the UUIDs of deleted accounts. Keeping them forever preserves\n' +
    '    a list the deletion was supposed to erase.',
);

check(
  'The retention cannot touch an unfinished job',
  /status\s*=\s*'completed'/.test(cronMigSrc) &&
    /prosrc\s*!~\s*'status\\s\*=\\s\*''completed'''/.test(cronMigSrc),
  'A job pending for 90 days is a defect to see, not a row to tidy away.',
);

// ---------------------------------------------------------------------------
// 8. The resume cron cannot reach an account no job names.
// ---------------------------------------------------------------------------
check(
  'The resume cron is pinned to resume mode',
  /"mode"\s*:\s*"resume"/.test(cronMigSrc),
  'Pinned to resume, the cron can only act on jobs already recorded. Without the\n' +
    '    pin its body could name an arbitrary account — including one of the five\n' +
    '    historical orphans, which this phase must not touch.',
);

check(
  'The migration asserts that pin',
  /n est pas en mode reprise/.test(cronMigSrc),
  'The pin has to be enforced where the command is written, not only here.',
);

check(
  'The resume branch acts only on claimed job rows',
  /claim_media_purge_jobs/.test(purgeCode) &&
    !/from\(\s*["']profiles["']\s*\)/.test(purgeCode),
  'The purge function must never select accounts itself. Reading `profiles` would\n' +
    '    let a resume pass invent its own work.',
);

// ---------------------------------------------------------------------------
// 9. Authorization, and the gateway.
// ---------------------------------------------------------------------------
check(
  'The purge function has no CORS header',
  !/Access-Control-Allow-Origin/.test(purgeCode) && !/_shared\/cors/.test(purgeCode),
  'The only callers are two servers. Emitting no allow-origin means no browser\n' +
    '    can read a response, whatever the origin — stricter than any allowlist.',
);

check(
  'The rate limit runs BEFORE the secret comparison',
  (() => {
    const body = purgeCode.slice(purgeCode.indexOf('function authorizePurgeRequest'));
    const limitAt = body.search(/checkRateLimit\s*\(/);
    const compareAt = body.search(/constantTimeEqual\s*\(/);
    return limitAt >= 0 && compareAt >= 0 && limitAt < compareAt;
  })(),
  'A limiter placed after the credential check cannot bound an attempt to GUESS\n' +
    '    the credential, because a failed guess never reaches it.',
);

check(
  'An unavailable rate limiter refuses',
  /if\s*\(error\)\s*return\s*\{\s*ok:\s*false,\s*\.\.\.RATE_LIMIT_UNAVAILABLE/.test(purgeCode),
  'Fail-closed. JUNO-29 logged its own failure and carried on for 142 nights.',
);

check(
  'The secret floor is 32 and matches the cron guard',
  /MIN_SECRET_LENGTH\s*=\s*32/.test(purgeCode),
  'A weak shared secret fails silently here: the function works perfectly, and\n' +
    '    nothing reports that the credential is guessable.',
);

const configSrc = read(CONFIG) ?? '';
check(
  'config.toml declares verify_jwt = false for the purge function',
  /\[functions\.purge-user-media\][\s\S]{0,80}verify_jwt\s*=\s*false/.test(configSrc),
  'Declared in config, not passed as --no-verify-jwt: a later deploy from config\n' +
    '    would re-arm gateway verification and the function would stop answering its\n' +
    '    only callers, weeks later, with no visible link to this change.',
);

// ---------------------------------------------------------------------------
// 10. The detector stays read-only.
// ---------------------------------------------------------------------------
const detectorCode = (read(DETECTOR) ?? '')
  .replace(/--.*$/gm, '')
  .replace(/'[^']*'/g, "''");

for (const [label, pattern] of [
  ['DELETE', /\bDELETE\s+FROM\b/i],
  ['DROP', /\bDROP\s+(TABLE|SCHEMA|FUNCTION)\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['UPDATE', /\bUPDATE\s+\w/i],
  ['INSERT', /\bINSERT\s+INTO\b/i],
  ['ALTER', /\bALTER\s+TABLE\b/i],
]) {
  check(
    `The orphan detector contains no ${label}`,
    !pattern.test(detectorCode),
    'The historical detector is strictly read-only by default. A destructive mode,\n' +
      '    if ever wanted, is a separate deliverable with --dry-run by default, an\n' +
      '    immutable manifest, a volume cap and human validation.',
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error('\nMedia purge violations:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(`${failures.length} of ${checks.length} checks failed.\n`);
  process.exit(1);
}

console.log(`Media purge guards hold: ${checks.length} checks passed.`);
console.log(
  '\nScope note: this reads the repository. It proves the DECISIONS are wired the\n' +
  '  way the design says, not that Supabase Storage behaves as modelled — the\n' +
  '  vitest suite uses a double, and only the controlled verification in\n' +
  '  docs/runbooks/media-purge-2026-09.md §6 exercises the real service.\n' +
  '  It also cannot see production. The five historical orphans were deleted by\n' +
  '  the phase C campaign on 11 Sep 2026 (2026-09-11-6cb356, 5/0/0); JUNO-09 is\n' +
  '  closed. The proof is the diagnostic, not this file.\n',
);
