#!/usr/bin/env node
// validate:cron-secrets — JUNO-31's structural guards.
//
//   node scripts/validate-cron-secrets.mjs
//
// WHAT HAPPENED, AND WHY A STRUCTURAL GUARD IS THE ONLY ONE THAT HOLDS
// ---------------------------------------------------------------------------
// A cron job scheduled by hand carried the value of SCHEDULED_EMAILS_SECRET in
// cleartext inside `cron.job.command` — readable by any role that can read that
// table, and present in every database backup. It was invisible for two
// reasons, and both are the point of this file:
//
//   1. The job existed in NO migration, so reading the repository could not
//      find it. This validator therefore does not try to prove what production
//      contains; it proves that nothing in the repository can PUT a secret
//      there. The live state is answered by
//      supabase/tests/diagnose_scheduled_emails_cron.sql.
//
//   2. The supervision function shipped in 20260909000002 looked for the
//      header in the `jsonb_build_object('x-…-secret', '…')` form only. The
//      exposed job used the `'{"x-…-secret": "…"}'::jsonb` form, so the health
//      check reported "no secret header" on the one job that had a hardcoded
//      one. A detector blind to one spelling does not reassure less than an
//      absent detector — it reassures more, and wrongly. Every pattern below
//      is therefore written in BOTH forms.
//
// THE LATENT MECHANISM, PINNED RATHER THAN FIXED
// ---------------------------------------------------------------------------
// 20260419000005 and 20260824000001 build their cron command with
// `format(… 'x-…-secret', %L …, v_secret)`. `%L` MATERIALISES the value into
// `cron.job.command`. Neither exposed anything, because the vault was empty
// when they ran and they wrote an empty string instead — which is JUNO-29. But
// replaying either one after the rotation would write the NEW secret in
// cleartext and recreate JUNO-31 with a freshly rotated value.
//
// They are shipped, so they are not edited. They are pinned by name below, and
// any NEW occurrence of the pattern fails the build.
//
// Reads the repository only. No network, no database.
//
// OPTIONAL VALUE CHECK — off by default, and never prints a value
// ---------------------------------------------------------------------------
//   $env:JUNO31_EXPOSED_SECRET = '<the exposed value>'
//   node scripts/validate-cron-secrets.mjs
//
// Scans every tracked text file for that exact string and reports file:line
// only. Pass it through the environment, never as an argument: an argument
// lands in the shell history and in the process list. Leaving it unset is the
// normal mode; the structural checks below do not need it.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
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

/** SQL and JS comments blanked, so header prose cannot satisfy — or violate — a
 *  code assertion. Both migrations and validators discuss these patterns at
 *  length in their own comments. */
function codeOf(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '');
}

/** Tracked files AND new ones not yet committed — the tree as it will be
 *  committed. A scanner that reads only the index cannot see the file being
 *  written right now, which is precisely when a literal gets introduced.
 *  `--exclude-standard` keeps .gitignore'd files out, so a local .env is never
 *  read: this tool reports presence, never content. */
function trackedFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out.split('\0').filter(Boolean);
}

const tracked = trackedFiles();

// ---------------------------------------------------------------------------
// The two spellings of a secret header, each with a NON-EMPTY literal value.
// An empty one is JUNO-29 and is caught elsewhere; a non-empty one is JUNO-31.
// ---------------------------------------------------------------------------
const LITERAL_FORMS = [
  ["jsonb_build_object form", /'x-[a-z][a-z-]*-secret'\s*,\s*'[^']+'/g],
  ["JSON literal form", /"x-[a-z][a-z-]*-secret"\s*:\s*"[^"]+"/g],
];

// `%L` interpolation of credential material into a cron command. Two shapes,
// and the second is the graver one: `Authorization', 'Bearer ' || %L` is fed by
// `app.settings.supabase_service_role_key` in two of the pinned files, so a GUC
// set later would write the SERVICE ROLE key into cron.job.command.
//
// Measured in production on 9 Sep 2026: no live command carries a JWT-shaped
// literal, because those settings are empty and the migrations wrote ''. Latent,
// not live — and worth keeping latent.
const INTERPOLATED = [
  ['secret header', /'x-[a-z][a-z-]*-secret'\s*,\s*%L/g],
  ['Authorization bearer', /'Authorization'\s*,\s*'Bearer '\s*\|\|\s*%L/g],
];

// Every shipped migration that builds a cron command this way. The list was
// TWO when this file was first written; the validator found three more, and the
// validator was right. Pinning them is not endorsement — see the header.
const INTERPOLATION_EXCEPTIONS = new Set([
  'supabase/migrations/20260329000001_daily_horoscope_cron.sql',
  'supabase/migrations/20260413000003_publish_scheduled_posts_cron.sql',
  'supabase/migrations/20260419000004_account_soft_deletion.sql',
  'supabase/migrations/20260419000005_rotate_cron_secrets.sql',
  'supabase/migrations/20260824000001_restore_d1_return_loop.sql',
]);

/** The interpolation scan covers migrations only: that is the only place a cron
 *  command is actually built. Documentation reproduces the defective snippet on
 *  purpose — that is how the finding gets explained, not how it recurs. */
const MIGRATION_SQL = /^supabase\/migrations\/.*\.sql$/;

const SELF = 'scripts/validate-cron-secrets.mjs';
const TEXT_EXT = /\.(sql|ts|tsx|js|mjs|cjs|json|md|ya?ml|toml|env\.example)$/i;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const literalHits = [];
const interpolationHits = [];

for (const file of tracked) {
  if (file === SELF) continue;
  if (!TEXT_EXT.test(file)) continue;
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue; // staged deletion
  if (statSync(full).size > 2_000_000) continue;

  const code = codeOf(readFileSync(full, 'utf8'));

  for (const [label, pattern] of LITERAL_FORMS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(code)) !== null) {
      literalHits.push(`${file}:${lineOf(code, m.index)} — ${label}`);
    }
  }

  if (!MIGRATION_SQL.test(file)) continue;
  if (INTERPOLATION_EXCEPTIONS.has(file)) continue;
  for (const [label, pattern] of INTERPOLATED) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(code)) !== null) {
      interpolationHits.push(`${file}:${lineOf(code, m.index)} — ${label}`);
    }
  }
}

check(
  'No cron secret header written as a literal value, in either spelling',
  literalHits.length === 0,
  `${literalHits.join('\n    ')}\n` +
    '    Values are deliberately not printed. Treat any hit as live: rotate the\n' +
    '    value first, then remove it. Removing it from the working tree does not\n' +
    '    remove it from the git history.',
);

check(
  'No new %L interpolation of credential material into a cron command',
  interpolationHits.length === 0,
  `${interpolationHits.join('\n    ')}\n` +
    '    `%L` materialises the value into cron.job.command, which is JUNO-31.\n' +
    '    Read the vault inside the command instead — see\n' +
    '    supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql.\n' +
    '    The five pre-existing occurrences are pinned by name in this file; a new\n' +
    '    one is a regression, not an exception to add.',
);

// The pinned exceptions must keep existing, or the pin is silently pointless.
for (const file of INTERPOLATION_EXCEPTIONS) {
  check(
    `Pinned interpolation exception still present: ${path.basename(file)}`,
    existsSync(path.join(ROOT, file)),
    'The file was renamed or deleted. Re-point the exception, or drop it if the\n' +
      '    pattern is genuinely gone — but do not leave a pin naming nothing.',
  );
}

// ---------------------------------------------------------------------------
// The canonical migration. Each assertion is one line to undo, and silent.
// ---------------------------------------------------------------------------
const MIGRATION = 'supabase/migrations/20260910000001_scheduled_emails_cron_canonical.sql';

check(
  'JUNO-31 migration exists',
  existsSync(path.join(ROOT, MIGRATION)),
  `${MIGRATION} is missing.`,
);

if (existsSync(path.join(ROOT, MIGRATION))) {
  const raw = read(MIGRATION);
  const code = codeOf(raw);

  check(
    'Canonical job reads the vault at execution time',
    /vault\.decrypted_secrets/.test(code) && /cron_scheduled_emails_secret/.test(code),
    'The command must carry the secret NAME and read `vault.decrypted_secrets`.\n' +
      '    Without both, either the secret is materialised or the header is empty.',
  );

  check(
    'Canonical job carries the execution guard',
    /_assert_cron_secret\('cron_scheduled_emails_secret'\)/.test(code),
    'Without the guard, a secret removed from the vault yields a null header, a\n' +
      '    401, and a pg_cron `succeeded` — the three ingredients of JUNO-29.',
  );

  check(
    'Execution guard enforces the same 32-character floor as the prerequisite',
    /v_len\s+IS\s+NULL\s+OR\s+v_len\s*<\s*32/i.test(code),
    'The prerequisite block runs once, at install. The guard runs on every pass.\n' +
      '    A guard that only rejects NULL and \'\' would accept a short value posed by a\n' +
      '    later `vault.update_secret` — the migration refusing at install what the\n' +
      '    guard then waves through. Two divergent floors are not two checks; they are\n' +
      '    one check and one door.',
  );

  check(
    'Canonical schedule is every five minutes',
    /'\*\/5 \* \* \* \*'/.test(code),
    "Expected '*/5 * * * *' — the cadence of the job that actually delivers today.",
  );

  check(
    'Both historical jobs are unscheduled',
    /cron\.unschedule\('process-scheduled-emails'\)/.test(code) &&
      /cron\.unschedule\('send-scheduled-emails'\)/.test(code),
    'One publisher must remain. Leaving either historical job in place keeps the\n' +
      '    exposed command (*/5) or the 401 loop (*/15) running beside the new one.',
  );

  check(
    'Canonical job is left ACTIVE',
    !/alter_job\([^)]*active\s*:=\s*false/.test(code),
    'Unlike 20260909000001, this job must be armed on apply: a disarmed deletion\n' +
      '    job destroys nothing, a disarmed mail job stops delivery. Nothing is\n' +
      '    deleted here, so nothing justifies leaving the mail off.',
  );

  check(
    'No COALESCE of the secret towards an empty string',
    !/COALESCE\s*\(\s*[^)]*(secret|decrypted)[^)]*,\s*''\s*\)/i.test(code),
    "`COALESCE(secret, '')` is the JUNO-29 defect itself: an absent setting\n" +
      '    becomes a valid-looking empty header. The fault is never the keyword, it\n' +
      '    is what the keyword falls back to.',
  );

  check(
    'No EXCEPTION WHEN OTHERS turning a failure into a notice',
    !/EXCEPTION\s+WHEN\s+OTHERS/i.test(code),
    'A handler that downgrades a missing prerequisite to a NOTICE is what let\n' +
      '    20260419000005 "succeed" while scheduling a job that could never work.',
  );

  check(
    'Migration verifies itself before committing',
    (raw.match(/RAISE\s+EXCEPTION/gi) || []).length >= 12,
    'A privilege or scheduling migration must assert both halves — the defect is\n' +
      '    gone, and the product still has what it needs — before COMMIT.',
  );

  check(
    'Migration asserts exactly one job targets the edge function',
    /functions\/v1\/send-scheduled-emails'\s*\)?\s*;?[\s\S]{0,400}?v_targets\s*<>\s*1/.test(code) ||
      /v_targets\s*<>\s*1/.test(code),
    'The strong assertion is the count, not the names: the job that caused this\n' +
      '    finding was scheduled by hand under a third name.',
  );

  check(
    'Migration itself contains no literal secret header',
    !/'x-[a-z][a-z-]*-secret'\s*,\s*'[^']*'/.test(code),
    'Not even an empty one: an empty header is JUNO-29.',
  );
}

// ---------------------------------------------------------------------------
// The command the migration will actually store, reconstructed statically.
//
// The ten checks above read the migration's SOURCE. This one reads the string
// that `format()` will place in `cron.job.command`, and applies the migration's
// OWN runtime assertions to it — the same regexes, transcribed. It proves the
// self-verification block would pass, without touching a database.
//
// Worth the trouble because the source and the stored command are not the same
// text: the secret's absence from the source proves nothing if `%L` puts it
// back on the way in. That is the whole mechanism of JUNO-31.
// ---------------------------------------------------------------------------
if (existsSync(path.join(ROOT, MIGRATION))) {
  const raw = read(MIGRATION);
  const body = raw.match(/\$cron\$([\s\S]*?)\$cron\$/);

  check(
    'The cron command body is extractable',
    body !== null,
    'No $cron$…$cron$ block found. The checks below cannot run.',
  );

  if (body) {
    // `%L` is fed by v_url alone — asserted separately below.
    const stored = body[1].replace(
      /%L/g,
      "'https://qtihezzbuubnyvrjdkjd.supabase.co/functions/v1/send-scheduled-emails'",
    );

    check(
      'Exactly one %L in the cron command, and it is the URL',
      (body[1].match(/%L/g) || []).length === 1,
      'A second placeholder means a second value is materialised into\n' +
        '    cron.job.command. That is how the secret got there.',
    );

    check(
      'Stored command carries no literal secret header (jsonb form)',
      !/'x-[a-z][a-z-]*-secret'\s*,\s*'/.test(stored),
      "Mirrors the migration's own assertion `v_cmd ~ '''x-…-secret''\\s*,\\s*'''`.",
    );

    check(
      'Stored command carries no literal secret header (JSON form)',
      !/"x-[a-z][a-z-]*-secret"\s*:\s*"/.test(stored),
      'This is the spelling that escaped 20260909000002 for a day, and the one\n' +
        '    the exposed job used.',
    );

    check(
      'Stored command reads the vault by the expected name',
      /vault\.decrypted_secrets/.test(stored) && /cron_scheduled_emails_secret/.test(stored),
      'The stored command must carry the secret NAME and read the vault.',
    );

    check(
      'Stored command carries the execution guard',
      /_assert_cron_secret\('cron_scheduled_emails_secret'\)/.test(stored),
      'Without it, a vault secret removed later gives a null header and a 401 that\n' +
        '    pg_cron records as `succeeded`.',
    );

    check(
      'Stored command targets exactly one edge function',
      new Set([...stored.matchAll(/functions\/v1\/([a-z-]+)/g)].map((m) => m[1])).size === 1,
      'More than one target means the command does something the job name does not say.',
    );

    check(
      'Stored command sends no Authorization header',
      !/'Authorization'/.test(stored),
      'config.toml:409 sets verify_jwt = false for this function: the secret header\n' +
        '    IS the authentication. The historical jobs built `Bearer ` from an empty\n' +
        '    setting — useless, and misleading. A service key here would widen the\n' +
        "    request's power for nothing.",
    );
  }
}

// ---------------------------------------------------------------------------
// The header and env names must match what the edge function actually reads.
// A rename on one side alone produces a permanent, silent 401.
// ---------------------------------------------------------------------------
const EDGE = 'supabase/functions/send-scheduled-emails/index.ts';

check(
  'Edge function still reads the expected header and variable',
  existsSync(path.join(ROOT, EDGE)) &&
    /x-scheduled-emails-secret/.test(read(EDGE)) &&
    /SCHEDULED_EMAILS_SECRET/.test(read(EDGE)),
  `${EDGE} must read the header \`x-scheduled-emails-secret\` and the variable\n` +
    '    `SCHEDULED_EMAILS_SECRET`. If either was renamed, the cron header no longer\n' +
    '    matches and every pass answers 401 — with pg_cron still recording success.',
);

if (existsSync(path.join(ROOT, MIGRATION)) && existsSync(path.join(ROOT, EDGE))) {
  const header = codeOf(read(MIGRATION)).match(/'x-([a-z][a-z-]*)-secret'/);
  check(
    'Cron header name matches the edge function',
    header !== null && read(EDGE).includes(`x-${header[1]}-secret`),
    'The migration sends a header the function does not read. This is the failure\n' +
      '    mode with no symptom other than a 401 nobody looks at.',
  );
}

// ---------------------------------------------------------------------------
// Optional: the exposed value itself, supplied through the environment.
// ---------------------------------------------------------------------------
const candidate = process.env.JUNO31_EXPOSED_SECRET;
let valueChecked = false;

if (candidate && candidate.trim().length >= 8) {
  const needle = candidate.trim();
  const hits = [];
  for (const file of tracked) {
    if (!TEXT_EXT.test(file)) continue;
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    if (statSync(full).size > 2_000_000) continue;
    const text = readFileSync(full, 'utf8');
    const at = text.indexOf(needle);
    if (at !== -1) hits.push(`${file}:${lineOf(text, at)}`);
  }
  valueChecked = true;
  check(
    'The exposed value appears in no tracked file',
    hits.length === 0,
    `${hits.join('\n    ')}\n` +
      '    The value is deliberately not printed. It must be rotated regardless —\n' +
      '    it is already outside its perimeter — and removed from the working tree\n' +
      '    does not mean removed from the git history.',
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error('\nCron secret violations:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(`${failures.length} of ${checks.length} checks failed.\n`);
  process.exit(1);
}

console.log(`Cron secrets look clean: ${checks.length} checks passed.`);
console.log(
  '\nScope note: this reads the WORKING TREE of this repository.\n' +
    '  * It cannot see what production actually holds. The job that caused JUNO-31\n' +
    '    existed in no migration — run supabase/tests/diagnose_scheduled_emails_cron.sql\n' +
    '    against the database to answer that.\n' +
    '  * It cannot see a value committed and later removed — `git log -p -S…` and\n' +
    '    `gitleaks detect --no-git` answer that question.\n' +
    (valueChecked
      ? '  * The exposed value WAS checked against every tracked file this run.\n'
      : '  * No value was checked this run (JUNO31_EXPOSED_SECRET unset). That is the\n' +
        '    normal mode; the structural checks above do not depend on it.\n'),
);
