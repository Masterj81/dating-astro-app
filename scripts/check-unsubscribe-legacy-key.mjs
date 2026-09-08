#!/usr/bin/env node
// Does this candidate secret actually verify a real, already-sent unsubscribe
// link? — JUNO-21, the question the runbook could not answer until now.
//
// THE GAP THIS CLOSES
// -------------------
// `supabase secrets list` tells you whether UNSUBSCRIBE_TOKEN_SECRET EXISTS.
// It does not tell you its value. So an operator who finds the name listed but
// cannot recover the value has, until now, had no way to know what to put in
// UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS — and guessing is worse than doing nothing:
// a wrong value breaks every link already in an inbox AND looks configured, so
// nobody goes back to check.
//
// A single unsubscribe link from any lifecycle email JUNO has ever sent settles
// it. The token carries its own proof: recompute the HMAC with the candidate
// and see whether it matches. Entirely offline — no database, no deploy, no
// production call.
//
// USAGE (PowerShell — values go through the ENVIRONMENT, never argv, so they do
// not land in ConsoleHost_history.txt):
//
//   Set-PSReadLineOption -HistorySaveStyle SaveNothing
//
//   $env:JUNO_UNSUB_TOKEN = Read-Host "paste the unsubscribe URL or token"
//
//   # then ONE of these, depending on what you are testing:
//   $env:JUNO_CANDIDATE_SECRET       = Read-Host "candidate UNSUBSCRIBE_TOKEN_SECRET"
//   $env:JUNO_CANDIDATE_SERVICE_ROLE = Read-Host "old service-role key"
//
//   node scripts/check-unsubscribe-legacy-key.mjs
//
//   Remove-Item Env:JUNO_UNSUB_TOKEN, Env:JUNO_CANDIDATE_SECRET, Env:JUNO_CANDIDATE_SERVICE_ROLE
//
// `JUNO_CANDIDATE_SERVICE_ROLE` is the convenience path: it builds
// `juno-unsubscribe-v1:<key>` for you, which is what the pre-fix code derived
// when UNSUBSCRIBE_TOKEN_SECRET was unset. Concatenating that by hand is where
// a stray newline silently produces a wrong answer.
//
// WHAT IT NEVER PRINTS: the secret, any part of it, its length, and the token's
// signature. Only a verdict, and the user id the token carries — which the
// operator supplied and already has.
//
// It verifies through the REAL module the deployed function uses
// (supabase/functions/_shared/unsubscribe-token.ts), so it cannot drift from
// what production will do. Native TypeScript type stripping makes that import
// work; Node >= 22.18, same requirement as validate-email-templates.mjs.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Node warns that the imported .ts has no "type" field to guide it. Adding
// `"type": "module"` to the root package.json to silence that would change how
// every .js file in the monorepo is parsed — a large change for a cosmetic
// one. Filter just this warning: the operator reading this output is deciding
// whether every unsubscribe link already sent will keep working, and noise
// above the verdict is a real cost.
// removeAllListeners FIRST: adding a listener does not replace Node's default
// one, it adds to it — the first version of this printed the warning twice.
// Matched on `code`, not `name`: Node reports this one as a plain `Warning`
// whose code is MODULE_TYPELESS_PACKAGE_JSON, so a name-based filter lets it
// straight through. And removeAllListeners must come FIRST — adding a listener
// does not replace Node's default one, it adds to it, which printed the
// warning twice.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(warning.stack ?? String(warning));
});

const ROOT = path.resolve(import.meta.dirname, '..');
const TOKEN_TS = path.join(
  ROOT, 'supabase', 'functions', '_shared', 'unsubscribe-token.ts',
);

const MIN_NODE = [22, 18];
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  console.error(
    `Node ${process.versions.node} cannot strip TypeScript types.\n` +
      `This script imports the real edge module so it cannot drift from what\n` +
      `production does. Needs Node >= ${MIN_NODE.join('.')}.`,
  );
  process.exit(2);
}

/** Accept a full unsubscribe URL or a bare token. */
function extractToken(raw) {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value).searchParams.get('token') ?? '';
  } catch {
    return '';
  }
}

const token = extractToken(process.env.JUNO_UNSUB_TOKEN);
if (!token) {
  console.error(
    'Set JUNO_UNSUB_TOKEN to an unsubscribe URL or token from a real lifecycle\n' +
      'email. Any email JUNO has sent carries one, in the footer link and in the\n' +
      'List-Unsubscribe header.',
  );
  process.exit(2);
}

const direct = (process.env.JUNO_CANDIDATE_SECRET ?? '').trim();
const serviceRole = (process.env.JUNO_CANDIDATE_SERVICE_ROLE ?? '').trim();

if (!direct && !serviceRole) {
  console.error(
    'Set JUNO_CANDIDATE_SECRET (a value you believe UNSUBSCRIBE_TOKEN_SECRET\n' +
      'held) or JUNO_CANDIDATE_SERVICE_ROLE (the old service-role key, from which\n' +
      'the pre-fix code derived `juno-unsubscribe-v1:<key>`). Either, or both.',
  );
  process.exit(2);
}

const mod = await import(pathToFileURL(TOKEN_TS).href);
const { verifyUnsubscribeToken } = mod;

/** Candidates to try, in the order an operator would think of them. */
const candidates = [];
if (direct) {
  candidates.push({
    label: 'JUNO_CANDIDATE_SECRET, used as-is',
    secret: direct,
    setAs: 'the value you supplied in JUNO_CANDIDATE_SECRET',
  });
}
if (serviceRole) {
  candidates.push({
    label: 'juno-unsubscribe-v1:<JUNO_CANDIDATE_SERVICE_ROLE>  (the pre-fix derivation)',
    secret: `juno-unsubscribe-v1:${serviceRole}`,
    setAs: 'the string `juno-unsubscribe-v1:` immediately followed by that key, no space, no newline',
  });
  // The same key without the prefix, in case a past operator set
  // UNSUBSCRIBE_TOKEN_SECRET to the raw service-role key by hand.
  candidates.push({
    label: 'JUNO_CANDIDATE_SERVICE_ROLE used raw, with no prefix',
    secret: serviceRole,
    setAs: 'that key on its own, with no `juno-unsubscribe-v1:` prefix',
  });
}

const shape = token.split('.').length === 3 && token.startsWith('v2.')
  ? 'v2 (current generation)'
  : token.split('.').length === 2
    ? 'legacy (pre-8 Sep 2026)'
    : 'unrecognised';

console.log(`Token shape: ${shape}`);
if (shape === 'unrecognised') {
  console.error(
    '\nThat is neither `<payload>.<sig>` nor `v2.<payload>.<sig>`. Check the value\n' +
      'was pasted whole and not URL-decoded twice.',
  );
  process.exit(1);
}
console.log(`Candidates to try: ${candidates.length}\n`);

let matched = null;
for (const candidate of candidates) {
  // The token's shape selects which slot the module will consult, so put the
  // candidate in BOTH. Only one is ever read.
  const keyring = { current: candidate.secret, previous: candidate.secret };
  const verified = await verifyUnsubscribeToken(token, keyring);
  const ok = verified !== null;
  console.log(`  ${ok ? 'MATCH   ' : 'no match'}  ${candidate.label}`);
  if (ok && !matched) matched = { ...candidate, verified };
}

console.log('');

if (!matched) {
  console.error(
    'None of the candidates verifies this token.\n' +
      '\n' +
      'DO NOT set UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS to any of them. A wrong value\n' +
      'breaks every link already in an inbox and, worse, looks configured — so\n' +
      'nobody goes back to check. Leaving it unset breaks the same links but is\n' +
      'at least honest, and the boot log says so.\n' +
      '\n' +
      'Next things to try:\n' +
      '  * a different old email — one sent before any key change;\n' +
      '  * the value with surrounding whitespace or a trailing newline removed;\n' +
      '  * an earlier service-role key, if the project has ever rotated one.\n' +
      '\n' +
      'If nothing verifies, the legacy links are unrecoverable. Deploy anyway and\n' +
      'record the decision: knowing they will 400 beats discovering it from a\n' +
      'reader who could not unsubscribe. See\n' +
      'docs/runbooks/unsubscribe-dual-key-2026-09.md §3.',
  );
  process.exit(1);
}

console.log(
  `This token verifies. Its generation: ${matched.verified.generation}.\n` +
    `It carries user id ${matched.verified.userId} and category ` +
    `"${matched.verified.category}".\n` +
    '\n' +
    (matched.verified.generation === 'legacy'
      ? 'Set UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS to ' + matched.setAs + '.\n' +
        'Every link already sent will keep working after the deploy.\n'
      : 'This is a CURRENT-generation token, so it tells you about\n' +
        'UNSUBSCRIBE_TOKEN_SECRET_V2, not about the legacy key. To settle\n' +
        '_PREVIOUS you need a link from an email sent BEFORE the migration.\n') +
    '\n' +
    'The value itself was never printed. Provision it the way the runbook shows:\n' +
    '`supabase secrets set --env-file`, not as a command-line argument.',
);
