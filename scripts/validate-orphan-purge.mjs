#!/usr/bin/env node
// validate:orphan-purge — JUNO-09 phase C's structural guards.
//
//   node scripts/validate-orphan-purge.mjs
//
// WHAT IS AT STAKE
// ---------------------------------------------------------------------------
// Five orphaned objects are to be deleted. Eighty-five are not, and nothing in a
// path distinguishes them by eye: sixty are `seed-{uuid}.jpg` AT THE BUCKET ROOT,
// where the UUID sits in the FILENAME. One careless predicate deletes all sixty.
//
// Every assertion below is one line to undo, and none fails visibly when undone.
// The tool still runs. The counters still print. What changes is which objects
// disappear, and by then it is over — a deleted storage object does not come back.
//
// WHAT IT REFUSES
// ---------------------------------------------------------------------------
//   * a destructive default
//   * a deletion without a manifest, or without a server-signed approval
//   * a cap that is absent, above five, or disagreeing between the two sides
//   * printing a path, a filename, an owner UUID or an object id
//   * persisting a free-form error message
//   * a secret in argv, or the service-role key used as an authorization secret
//   * dynamic discovery inside the destructive branch
//   * deleting anything the manifest does not name
//   * a weakening of phase B's guarantees
//
// Reads the repository only. No network, no database, and it cannot see
// production — `supabase/tests/diagnose_orphan_purge.sql` answers that.

import { existsSync, readFileSync } from 'node:fs';
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
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/** Comments blanked. Every file here discusses these patterns in its own prose. */
function codeOf(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '');
}

const EDGE = 'supabase/functions/purge-orphan-media/index.ts';
const CLI = 'scripts/juno09-orphan-campaign.mjs';
const MIGRATION = 'supabase/migrations/20260911000001_orphan_purge_campaigns.sql';
const DIAGNOSTIC = 'supabase/tests/diagnose_orphan_purge.sql';
const RUNBOOK = 'docs/runbooks/orphan-media-catchup-2026-09.md';
const DESIGN = 'docs/juno-09-phase-c-design-2026-09.md';
const CONFIG = 'supabase/config.toml';
const GITIGNORE = '.gitignore';

// Phase B, whose guarantees must not be weakened by this phase.
const PHASE_B_TABLE = 'supabase/migrations/20260910000002_media_purge_jobs.sql';
const PHASE_B_CRON = 'supabase/migrations/20260910000003_media_purge_resume_cron.sql';
const PHASE_B_FN = 'supabase/functions/purge-user-media/index.ts';
const PHASE_B_VALIDATOR = 'scripts/validate-media-purge.mjs';

// ---------------------------------------------------------------------------
// 0. Everything exists. A guard whose subject is missing proves nothing.
// ---------------------------------------------------------------------------
for (const file of [EDGE, CLI, MIGRATION, DIAGNOSTIC, RUNBOOK, DESIGN, CONFIG, GITIGNORE,
                    PHASE_B_TABLE, PHASE_B_CRON, PHASE_B_FN, PHASE_B_VALIDATOR]) {
  check(`Present: ${path.basename(file)}`, read(file) !== null, `${file} is missing.`);
}

const edgeSrc = read(EDGE) ?? '';
const cliSrc = read(CLI) ?? '';
const migrationSrc = read(MIGRATION) ?? '';
const edge = codeOf(edgeSrc);
const cli = codeOf(cliSrc);

// ---------------------------------------------------------------------------
// 1. The default is not destructive.
// ---------------------------------------------------------------------------
check(
  'The CLI declares exactly one destructive subcommand',
  /DESTRUCTIVE_SUBCOMMANDS\s*=\s*\[\s*'execute'\s*\]/.test(cli),
  'A tool whose destructive path is reachable by default is a tool that will be\n' +
    '    run destructively by accident.',
);

check(
  'Deletion requires an explicit --execute flag, checked first',
  (() => {
    const at = cli.indexOf('async function cmdExecute');
    if (at < 0) return false;
    const head = cli.slice(at, at + 500);
    return /flags\.has\('execute'\)/.test(head);
  })(),
  'The flag must be the first thing cmdExecute tests, so no other work — and no\n' +
    '    network call — happens without it.',
);

check(
  'The edge function demands a redundant execute:true alongside the mode',
  /raw\.execute\s*!==\s*true/.test(edge),
  'A mode string alone would make a typo destructive. The redundant flag means the\n' +
    '    destructive path cannot be reached by getting one field slightly wrong.',
);

check(
  'No npm alias exposes the destructive command',
  (() => {
    const pkg = JSON.parse(read('package.json') ?? '{}');
    return !Object.values(pkg.scripts ?? {}).some((s) => /juno09-orphan-campaign.*execute/.test(s));
  })(),
  'Typing the whole command is deliberate friction. `npm run` makes destructive\n' +
    '    things feel routine.',
);

// ---------------------------------------------------------------------------
// 2. No deletion without the manifest and the signed approval.
// ---------------------------------------------------------------------------
check(
  'The CLI reads the manifest and the approval before requiring the secret',
  (() => {
    const manifestAt = cli.indexOf('const manifest = readArtifact(manifestName(campaignId))');
    const approvalAt = cli.indexOf('const approval = readArtifact(approvalName(campaignId))');
    const secretAt = cli.indexOf('const secret = requireSecret();\n  say');
    const fetchAt = cli.indexOf('await callFunction(baseUrlFor(project)');
    return manifestAt > 0 && approvalAt > manifestAt &&
      secretAt > approvalAt && fetchAt > secretAt;
  })(),
  'Order is the property: both artefacts are verified before anything leaves the\n' +
    '    machine, so a missing one never reaches the network.',
);

check(
  'The manifest hash is recomputed and compared, in the CLI',
  /manifestHashOf\(manifest\)/.test(cli) && /hashesEqual\(/.test(cli),
  'Without recomputation, "editing the manifest invalidates the authorization" is\n' +
    '    a claim rather than a fact.',
);

check(
  'The approval must name this manifest, this campaign and this project',
  /approval\.manifestHash/.test(cli) && /approval\.campaignId !== campaignId/.test(cli) &&
    /approval\.projectRef !== project/.test(cli),
  'An approval copied from a previous run must not authorize this one.',
);

check(
  'The server verifies the approval signature, and the key is server-only',
  /hmacSha256Hex\(\s*approvalKey/.test(edge) &&
    /ORPHAN_APPROVAL_KEY_ENV\s*=\s*"ORPHAN_APPROVAL_KEY"/.test(edge) &&
    !/ORPHAN_APPROVAL_KEY/.test(cli),
  'The signing key must never appear on the operator side. If the operator can\n' +
    '    sign, gate C is decoration: a hand-edited manifest would just be re-approved.',
);

check(
  'The signature covers campaign, manifest, project, total, distribution and expiry',
  (() => {
    const at = edge.indexOf('export function approvalPayload');
    if (at < 0) return false;
    const body = edge.slice(at, at + 900);
    return ['APPROVAL_SCHEMA', 'a.campaignId', 'a.manifestHash', 'a.projectRef',
      'a.total', 'buckets', 'a.expiresAt'].every((f) => body.includes(f));
  })(),
  'Any field left out of the payload can be changed after approval without\n' +
    '    invalidating it.',
);

check(
  'An expired approval is refused',
  /nowMs\s*>=\s*a\.expiresAt/.test(edge),
  'Without an expiry a manifest can sleep for a week and still be executed, long\n' +
    '    after the state it describes has changed.',
);

check(
  'The database refuses an approval whose manifest hash it did not see at discovery',
  /empreinte du manifeste differente de celle enregistree a la decouverte/.test(migrationSrc),
  'A fourth independent check: even a coherently edited manifest AND approval are\n' +
    '    refused, because the registry remembers the original hash.',
);

// ---------------------------------------------------------------------------
// 3. The caps.
// ---------------------------------------------------------------------------
const CAP_SHAPE = /totalExact:\s*5[\s\S]{0,80}?absoluteMax:\s*5[\s\S]{0,140}?avatars:\s*4[\s\S]{0,60}?"?'?voice-intros"?'?:\s*0[\s\S]{0,60}?verifications:\s*1/;
for (const [label, src] of [['edge function', edge], ['CLI', cli]]) {
  check(
    `The first campaign's caps are 5 / 4-0-1 in the ${label}`,
    CAP_SHAPE.test(src),
    'Expected totalExact 5, absoluteMax 5, avatars 4, voice-intros 0,\n' +
      '    verifications 1. A cap above five for this campaign is a finding, not a\n' +
      '    configuration choice.',
  );
}

check(
  'Neither side raises a cap at runtime',
  !/CAMPAIGN_CAPS\.[A-Za-z]+\s*=[^=]/.test(edge) &&
    !/CAMPAIGN_CAPS\.[A-Za-z]+\s*=[^=]/.test(cli),
  'An automatic adjustment defeats the only cheap check that catches a\n' +
    '    classification bug: the count you already knew.',
);

check(
  'Fewer objects than expected also refuses',
  /objects !== CAMPAIGN_CAPS\.totalExact/.test(edge),
  'Four is not "safer" than six. It means the classification changed, and a\n' +
    '    changed classification invalidates the human review the manifest rests on.',
);

check(
  'The schema bounds the cap too, so raising it needs a migration',
  /volume_cap\s+INTEGER\s+NOT NULL CHECK \(volume_cap BETWEEN 1 AND 5\)/.test(migrationSrc),
  'A cap the code alone can raise is not a cap.',
);

// ---------------------------------------------------------------------------
// 4. Nothing sensitive is printed, returned or persisted.
// ---------------------------------------------------------------------------
const edgeLogLines = edge.split('\n').filter((l) => /console\.(log|error|warn)/.test(l));
const leakyEdge = edgeLogLines.filter((l) =>
  /\$\{\s*(path|name|objectId|ownerUuid|owner|verdict\.path|row\.name)\s*\}/.test(l) ||
  /error\.message/.test(l) || /SQLERRM/.test(l));
check(
  'The edge function logs no path, id, owner or error message',
  leakyEdge.length === 0,
  `${leakyEdge.map((l) => l.trim()).join('\n    ')}\n` +
    '    A storage error message contains the path that failed.',
);

const cliOut = cli.split('\n').filter((l) => /\b(say|console\.(log|error))\(/.test(l));
// `path` alone matched `path.relative()` — the Node module, printing a LOCAL
// FILE path the operator has to see. What is forbidden is a STORAGE path, an
// object id, or an owner UUID.
const leakyCli = cliOut.filter((l) =>
  /\$\{[^}]*\b(objectId|ownerUuid|verdict\.path|storagePath|e\.name)\b[^}]*\}/.test(l) ||
  /error\.message/.test(l));
check(
  'The CLI prints no object id, owner or path',
  leakyCli.length === 0,
  `${leakyCli.map((l) => l.trim()).join('\n    ')}\n` +
    '    Standard output carries counters and closed classes only. The ids live in\n' +
    '    the manifest file, which is gitignored and destroyed after the campaign.',
);

check(
  'The secret reader never touches argv',
  (() => {
    const at = cli.indexOf('function requireSecret');
    if (at < 0) return false;
    const body = cli.slice(at, at + 600);
    // `process.argv` only, not the bare word: the refusal MESSAGE says "argv
    // lands in the shell history", and prose must not fail a code check.
    if (/process\.argv/.test(body)) return false;
    // And argv is read only where a CLI must read it: the entry point.
    const argvSites = [...cli.matchAll(/process\.argv/g)].map((m) => m.index);
    const mainAt = cli.indexOf('async function main');
    return argvSites.length > 0 && argvSites.every((i) => i > mainAt);
  })(),
  'A secret assembled from argv defeats the whole point: argv lands in the shell\n' +
    '    history and the process list. The reader must see only the environment, and\n' +
    '    argv must be parsed once, at the entry point.',
);

check(
  'The CLI never prints the secret, and never reads it from an option',
  // Not `say(... secret ...)`: the usage text legitimately TELLS the operator
  // which variable to set. What is forbidden is interpolating the VALUE.
  !/\$\{\s*secret\s*\}/.test(cli) && !/opts\.secret/.test(cli) &&
    !/opts\['secret'\]/.test(cli) && /process\.env\[SECRET_ENV\]/.test(cli),
  'A secret in argv lands in the shell history and the process list, and neither\n' +
    '    forgets.',
);

check(
  'The CLI refuses to run if argv looks like it carries a credential',
  /function argvCarriesSecret/.test(cli) && /ressemble à un secret/.test(cliSrc),
  'The convenient thing to type is `--secret abc…`. Refusing is what stops it.',
);

check(
  'Errors are reduced to a closed class before they travel',
  (() => {
    if (!/function classifyOrphanError/.test(edge)) return false;
    // `.message` may appear ONLY as an argument to the classifier. Checking a
    // specific shape — `errorClass: error.message` — missed the assignment form
    // `errorClass = error.message`, which is the one a hurried refactor writes.
    // Blanking the legitimate uses and asserting none remain has no such gap.
    const withoutClassifier = edge.replace(/classifyOrphanError\([^)]*\)/g, 'CLS');
    return !/\.message\b/.test(withoutClassifier);
  })(),
  'A class, never a message, and `.message` may only be handed to\n' +
    '    classifyOrphanError. Anything else lets a storage path — which every such\n' +
    '    message contains — travel into a response, a log or the database.',
);

const CLASSES = ['deleted', 'already_absent', 'auth_owner_exists', 'ambiguous_ownership',
  'unknown_path_shape', 'storage_unavailable', 'permission_denied', 'timeout',
  'manifest_mismatch', 'approval_mismatch', 'volume_limit_exceeded', 'unknown'];
check(
  'Every emitted class is one the database accepts',
  CLASSES.every((c) => edge.includes(`"${c}"`)) &&
    CLASSES.filter((c) => c !== 'deleted' && c !== 'already_absent')
      .every((c) => migrationSrc.includes(`'${c}'`)),
  'A class the CHECK rejects turns every failure into two, and the second one is\n' +
    '    invisible.',
);

check(
  'The audit table can hold no path, id or owner',
  (() => {
    const at = migrationSrc.indexOf('CREATE TABLE IF NOT EXISTS public.orphan_purge_campaigns');
    const end = migrationSrc.indexOf('COMMENT ON TABLE');
    if (at < 0 || end < at) return false;
    const table = migrationSrc.slice(at, end);
    return !/\b(path|file_name|filename|url|object_id|owner|email)\b/i.test(table);
  })(),
  'A purge log that records what it deleted recreates the data it exists to\n' +
    '    erase, and keeps it after the account is gone.',
);

check(
  'The migration asserts that itself',
  /column_name ~\* '\(path\|file\|url\|object\|owner\|email\)'/.test(migrationSrc),
  'Someone will add a "helpful" debug column. The migration has to refuse, not\n' +
    '    this file alone.',
);

// The trace must be unerasable by the application credential. Supabase grants
// ALL to service_role on every new table by default, so a narrow GRANT is not a
// narrowing — it is additive. The first application on 11 Sep 2026 failed on the
// migration's own check for exactly this reason. Revoke first, then grant.
check(
  'The registry is revoked from service_role BEFORE the narrow grant',
  (() => {
    const stmts = codeOf(migrationSrc);
    const revoke = stmts.indexOf('REVOKE ALL ON public.orphan_purge_campaigns FROM service_role;');
    const grant = stmts.indexOf('GRANT SELECT, INSERT, UPDATE ON public.orphan_purge_campaigns TO service_role;');
    if (revoke < 0 || grant < 0 || grant < revoke) return false;
    // And no grant on this table to service_role carries an erasing verb.
    const grants = stmts.split('\n').filter((l) =>
      l.startsWith('GRANT ') && l.includes('ON public.orphan_purge_campaigns TO service_role'));
    return grants.length === 1 && !/DELETE|TRUNCATE/.test(grants[0]);
  })(),
  'Granting three privileges to a role that already holds ALL leaves it with ALL.\n' +
    '    Only a REVOKE removes DELETE, and it must come before the GRANT.',
);

// Nothing executes these two files locally — the migration compiles only when
// applied, the diagnostic only when run. A broken dollar quote therefore passes
// every other check here, and on 11 Sep 2026 one did: a patch written through
// String.prototype.replace, which reads `$$` in a replacement as one `$`,
// turned `DO $$` into `DO $`. Counting is a weak parser, but it is a parser.
for (const [label, src, tag] of [
  ['migration', migrationSrc, '$$'],
  ['diagnostic', read(DIAGNOSTIC), '$q$'],
]) {
  check(
    `Dollar quoting balances in the ${label}`,
    (() => {
      if (!src) return false;
      const opens = src.split(tag).length - 1;
      // A `DO` or `AS` followed by a lone `$` is the exact shape of the defect.
      const lone = src.split('\n').some((l) => /^\s*(DO|AS)\s+\$(?![$a-z])/.test(l));
      return opens % 2 === 0 && opens > 0 && !lone;
    })(),
    `An odd number of ${tag} delimiters, or a lone $ after DO/AS, is a file the SQL\n` +
      '    editor will refuse at line 1 of the block — after the earlier statements\n' +
      '    already ran inside the same transaction.',
  );
}

check(
  'The migration asserts that DELETE and TRUNCATE are both absent',
  (() => {
    const at = migrationSrc.indexOf("ARRAY['DELETE', 'TRUNCATE'");
    if (at < 0) return false;
    const tail = migrationSrc.slice(at, at + 400);
    return tail.includes("has_table_privilege('service_role', 'public.orphan_purge_campaigns', v_priv)")
      && tail.includes('RAISE EXCEPTION');
  })(),
  'DELETE erases a row; TRUNCATE erases every row. A check on one of the two is a\n' +
    '    check on one door out of two.',
);

// ---------------------------------------------------------------------------
// 4b. The gates chain through the registry — the blind spot of 11 Sep 2026.
//
// Each gate had been tested alone, against a double, and each was correct
// alone. Discovery assembled a manifest on the workstation and recorded
// nothing; approval then refused every campaign as unknown. These assert the
// chain: the server assembles and hashes the manifest, every gate writes the
// registry AND reads it back, and nothing destructive happens before that read.
// ---------------------------------------------------------------------------
const gateAAt = edge.indexOf('export async function gateDiscover');
const gateCAt = edge.indexOf('export async function gateApprove');
const gateDAt = edge.indexOf('export async function gateExecute');
const gateDEnd = edge.indexOf('export async function handleOrphanRequest');
const gateA = gateAAt > 0 && gateCAt > gateAAt ? edge.slice(gateAAt, gateCAt) : '';
const gateC = gateCAt > 0 && gateDAt > gateCAt ? edge.slice(gateCAt, gateDAt) : '';
const gateD = gateDAt > 0 && gateDEnd > gateDAt ? edge.slice(gateDAt, gateDEnd) : '';

check(
  'The three gates are named functions, in order, before the dispatcher',
  gateA.length > 0 && gateC.length > 0 && gateD.length > 0,
  'Logic that lives only inside the serve callback is logic the tests cannot reach.',
);

check(
  'The manifest is assembled and hashed on the server, and the CLI writes it verbatim',
  /generatedAt: new Date\(deps\.now\(\)\)\.toISOString\(\)/.test(gateA) &&
    /const manifestHash = await manifestHashOf\(manifest\)/.test(gateA) &&
    !/generatedAt: new Date\(\)\.toISOString\(\)/.test(codeOf(cli)) &&
    !/manifest\.manifestHash = manifestHashOf\(manifest\)/.test(codeOf(cli)) &&
    /const manifest = payload\.manifest;/.test(codeOf(cli)),
  'A manifest assembled on the workstation gives the server nothing to record —\n' +
    '    that was the defect. The CLI may verify what it receives, never compose it.',
);

check(
  'Discovery records the campaign, then reads it back, BEFORE issuing a manifest',
  (() => {
    const rec = gateA.indexOf('registry.recordDiscovery(');
    const back = gateA.indexOf('registry.readCampaign(');
    const issued = gateA.indexOf('status: 200');
    return rec > 0 && back > rec && issued > back;
  })(),
  'A manifest whose hash the registry never saw cannot be approved. Issuing one\n' +
    '    is exactly what stranded the first production run.',
);

check(
  'Discovery refuses when the registry write fails, the read-back fails, or disagrees',
  (() => {
    const rec = gateA.indexOf('registry.recordDiscovery(');
    if (rec < 0) return false;
    const tail = gateA.slice(rec);
    return /if \(recorded\.error\)[\s\S]{0,400}return refuse\(/.test(tail) &&
      /if \(back\.error \|\| back\.row === null\)[\s\S]{0,300}return refuse\(/.test(tail) &&
      /back\.row\.manifestHash !== manifestHash[\s\S]{0,400}return refuse\(/.test(tail);
  })(),
  'The absence of an error is not the presence of a row.',
);

check(
  'Discovery outside the caps issues no manifest and records nothing',
  (() => {
    const caps = gateA.indexOf('if (!caps.ok)');
    const rec = gateA.indexOf('registry.recordDiscovery(');
    return caps > 0 && rec > caps &&
      /if \(!caps\.ok\)[\s\S]{0,400}return refuse\(409, caps\.errorClass/.test(gateA);
  })(),
  'A manifest that can never be approved is only a temptation to adjust the cap.',
);

check(
  'Approval hashes the received manifest itself, then consults the registry, then signs',
  (() => {
    const re = gateC.indexOf('const recomputed = await manifestHashOf(parsed.manifest)');
    const read = gateC.indexOf('registry.readCampaign(');
    const sign = gateC.indexOf('hmacSha256Hex(approvalKey');
    return re > 0 && read > re && sign > read &&
      /known\.row === null[\s\S]{0,200}"campaign_unknown"/.test(gateC) &&
      /known\.row\.manifestHash !== recomputed[\s\S]{0,200}"manifest_mismatch"/.test(gateC);
  })(),
  'A claimed hash beside a list of ids binds the approval to nothing. The server\n' +
    '    can only vouch for what it hashed itself.',
);

check(
  'Approval reads the registry back after recording, and refuses on disagreement',
  (() => {
    const rec = gateC.indexOf('registry.recordApproval(');
    if (rec < 0) return false;
    const tail = gateC.slice(rec);
    const back = tail.indexOf('registry.readCampaign(');
    return back > 0 &&
      /back\.row\.status !== "approved" \|\| back\.row\.approvalHash !== approvalHash[\s\S]{0,200}return refuse\(/.test(tail);
  })(),
  'The signature is handed out only once the registry says "approved" with this hash.',
);

check(
  'Execution consults the registry BEFORE the first deletion',
  (() => {
    const read = gateD.indexOf('registry.readCampaign(');
    const del = gateD.indexOf('executeDeletions(');
    return read > 0 && del > read &&
      /known\.row === null[\s\S]{0,100}"campaign_unknown"/.test(gateD) &&
      /known\.row\.status === "executed"[\s\S]{0,400}"campaign_closed"/.test(gateD) &&
      /known\.row\.manifestHash !== recomputed[\s\S]{0,100}"manifest_mismatch"/.test(gateD) &&
      /known\.row\.approvalHash !== approvalHash[\s\S]{0,100}"approval_mismatch"/.test(gateD);
  })(),
  'It used to be consulted only when recording the result — after the objects\n' +
    '    were gone. A campaign the registry does not hold as approved deletes nothing.',
);

check(
  'Deno.serve only wires; every gate goes through handleOrphanRequest',
  (() => {
    const at = edge.indexOf('Deno.serve(');
    if (at < 0) return false;
    const serve = edge.slice(at);
    return serve.includes('handleOrphanRequest(parsed, deps, registry, approvalKey)') &&
      !/executeDeletions\(|verifyManifestEntries\(|hmacSha256Hex\(|recordDiscovery\(\{/.test(serve.replace(/recordDiscovery: async/g, ''));
  })(),
  'Logic inside the serve callback is logic the tests cannot reach.',
);

check(
  'Gates C and D receive the WHOLE manifest, and the parser refuses anything else',
  (() => {
    const p = edge.indexOf('export function parseOrphanRequest');
    const body = edge.slice(p, edge.indexOf('export async function authorizeExecution'));
    return /raw\.manifest as Record<string, unknown>/.test(body) &&
      /manifest\.schema !== MANIFEST_SCHEMA \|\| manifest\.campaignId !== campaignId/.test(body) &&
      /manifest\.projectRef !== EXPECTED_PROJECT_REF/.test(body) &&
      /for \(const item of manifest\.entries\)/.test(body) &&
      !/raw\.manifestHash/.test(body) && !/raw\.entries/.test(body);
  })(),
  'The server can only hash what it is given.',
);

check(
  'The CLI sends the whole manifest to gates C and D, never a hash beside a list',
  (() => {
    const c = codeOf(cli);
    return /mode: 'approve',\s*campaignId,\s*manifest,/.test(c) &&
      /mode: 'execute',[\s\S]{0,120}manifest,/.test(c) &&
      !/entries: manifest\.entries\.map/.test(c);
  })(),
  'Both sides must agree on what is hashed, or every campaign is refused.',
);

check(
  'The CLI accepts a manifest only when the registry says it holds it',
  (() => {
    const c = codeOf(cli);
    return /registry\.status !== 'discovered'/.test(c) &&
      /payload\.registry\?\.status !== 'approved'/.test(c) &&
      /hashesEqual\(registry\.manifestHash \?\? '', recomputed\)/.test(c);
  })(),
  'A discovery the registry does not hold produced the 409 of 11 Sep 2026.\n' +
    '    The CLI must refuse to write it, not discover the problem at gate C.',
);

check(
  'The test suite runs the chain, not only each link',
  (() => {
    const t = read('packages/shared/src/security/__tests__/orphan-purge-chain.test.ts') ?? '';
    return /the gates chain through the registry/.test(t) &&
      /campaign_unknown/.test(t) && /recordDiscovery/.test(t) &&
      /handleOrphanRequest\(/.test(t) && /campaign_closed/.test(t);
  })(),
  'A test per gate proved each gate. None proved the one before it had run.',
);

// ---------------------------------------------------------------------------
// 5. The service-role key is never an authorization secret.
// ---------------------------------------------------------------------------
check(
  'The CLI holds no service-role key',
  !/SERVICE_ROLE/i.test(cli),
  'JUNO-04 removed that key from the workstation. Re-introducing it for one\n' +
    '    campaign would be a regression of posture, not a convenience.',
);

check(
  'The service-role key is not used as the authorization secret',
  (() => {
    const at = edge.indexOf('export async function authorizeOrphanRequest');
    if (at < 0) return false;
    const body = edge.slice(at, at + 1400);
    return !/SERVICE_ROLE/i.test(body);
  })(),
  'The credential that authorizes a caller must be narrow. The service-role key\n' +
    '    bypasses RLS on every table.',
);

check(
  'The workstation credential is its own secret',
  /ORPHAN_SECRET_ENV\s*=\s*"ORPHAN_PURGE_SECRET"/.test(edge) &&
    /SECRET_ENV\s*=\s*'ORPHAN_PURGE_SECRET'/.test(cli),
  'Both sides must name the same variable, or the tool cannot authenticate and\n' +
    '    somebody will "fix" it with the service key.',
);

check(
  'The secret floor is 32 on both sides',
  /MIN_SECRET_LENGTH\s*=\s*32/.test(edge) && /secret\.length < 32/.test(cli),
  'A weak shared secret fails silently: everything works, and nothing reports\n' +
    '    that the credential is guessable.',
);

// ---------------------------------------------------------------------------
// 6. No dynamic discovery in the destructive branch, and nothing outside the
//    manifest is ever deleted.
// ---------------------------------------------------------------------------
// The destructive branch is a NAMED function, and every assertion below is
// scoped to that function's body — not to "everything after an anchor", which
// silently widened to the Deno.serve wiring the day the gates were extracted.
check(
  'The destructive branch is identifiable',
  gateDAt > 0 && gateDEnd > gateDAt &&
    edge.slice(gateDAt, gateDEnd).includes('const gate = await authorizeExecution'),
  'Gate D must be a distinct, named function that authorizes first, or the\n' +
    '    assertions below cannot be scoped.',
);

if (gateDAt > 0 && gateDEnd > gateDAt) {
  const destructive = edge.slice(gateDAt, gateDEnd);
  check(
    'The destructive branch performs no discovery',
    !/fetchObjects\s*\(/.test(destructive) && !/orphan_scan_objects/.test(destructive),
    'It must iterate over MANIFEST ENTRIES, never over a bucket. Re-verification\n' +
      '    may only REMOVE an entry — that is the line between re-verification and\n' +
      '    dynamic discovery.',
  );
  check(
    'The destructive branch deletes only what verification returned',
    /executeDeletions\(deps, verdicts,/.test(destructive) &&
      /verifyManifestEntries\(deps, parsed\.entries\)/.test(destructive),
    'The only producer of deletable paths is verifyManifestEntries, fed from the\n' +
      '    manifest. Any other source is an object the manifest never named.',
  );
}

check(
  'executeDeletions iterates verdicts and nothing else',
  (() => {
    const at = edge.indexOf('export async function executeDeletions');
    if (at < 0) return false;
    const body = edge.slice(at, edge.indexOf('export type OrphanRequest'));
    return /for \(const verdict of verdicts\)/.test(body) &&
      !/fetchObjects/.test(body) && !/lookupObjects/.test(body);
  })(),
  'A single extra source of paths inside the delete loop undoes the whole\n' +
    '    manifest discipline.',
);

check(
  'Ownership is re-proved immediately before each deletion',
  (() => {
    const at = edge.indexOf('export async function executeDeletions');
    const body = edge.slice(at, edge.indexOf('export type OrphanRequest'));
    const ownerAt = body.indexOf('const owner = firstSegment(path)');
    const removeAt = body.indexOf('await deps.removeObject(');
    return ownerAt > 0 && removeAt > ownerAt && /isStrictUuid\(owner\)/.test(body);
  })(),
  'Cheap, and it closes the gap a future refactor would open by pushing a path in\n' +
    '    from somewhere else.',
);

check(
  'Only orphan_proven entries can be submitted at all',
  /e\.category !== "orphan_proven"/.test(edge),
  'An entry asserting any other classification must be refused by the parser, so\n' +
    '    an ambiguous object cannot even be offered for deletion.',
);

check(
  'A UUID is matched anchored at both ends, never partially',
  /\^\[0-9a-f\]\{8\}-/.test(edge) && /\{12\}\$/.test(edge) &&
    !/\.includes\(\s*owner/.test(edge) && !/\.includes\(\s*ownerUuid/.test(edge),
  'Sixty `seed-{uuid}.jpg` objects sit at the bucket root. A substring test\n' +
    '    deletes every one of them.',
);

check(
  'Ownership is the first path SEGMENT, and a traversal segment disqualifies it',
  /firstSegment/.test(edge) && /p === "\.\."/.test(edge) && /p === "\."/.test(edge),
  'A `..` segment walks out of the owner folder, and an empty segment comes from a\n' +
    '    double slash.',
);

check(
  'The bucket allowlist is hard-coded on both sides and holds only user media',
  /ORPHAN_BUCKETS\s*=\s*\[\s*"avatars",\s*"voice-intros",\s*"verifications"\s*\]/.test(edge) &&
    !/marketing-images/.test(edge) && !/["']tarot["']/.test(edge),
  'A bucket list that can grow by configuration grows by accident.',
);

check(
  'The read RPC hard-codes the same allowlist and takes no bucket parameter',
  /CREATE OR REPLACE FUNCTION public\.orphan_scan_objects\(\)/.test(migrationSrc) &&
    /'avatars', 'voice-intros', 'verifications'/.test(migrationSrc),
  'A bucket passed in is a bucket that can be swapped.',
);

// ---------------------------------------------------------------------------
// 7. Interactive confirmation is required AND insufficient on its own.
// ---------------------------------------------------------------------------
check(
  'The destructive path refuses to run without a TTY',
  /process\.stdin\.isTTY/.test(cli),
  'This is what makes the destructive path unreachable from CI or any unattended\n' +
    '    script, whatever flags are set.',
);

check(
  'The operator types the exact count, in addition to passing it',
  /--confirm-count/.test(cli) && /typed !== String\(total\)/.test(cli) &&
    /confirmObjectCount/.test(edge),
  'The typed confirmation is an ADDITION to the artefacts, never a substitute:\n' +
    '    the server also requires the count in the payload.',
);

check(
  'The server refuses a confirmation count that differs from the manifest',
  /confirmObjectCount !== request\.entries\.length/.test(edge),
  'Otherwise the confirmation is theatre — the operator could type anything.',
);

// ---------------------------------------------------------------------------
// 8. The artefacts never enter the history.
// ---------------------------------------------------------------------------
check(
  'The artefact directory is gitignored',
  /^\.juno09\/$/m.test(read(GITIGNORE) ?? ''),
  'A manifest committed once stays in the history forever, and it names every\n' +
    '    object that was about to be deleted.',
);

check(
  'The CLI checks that at runtime, in every gate, before writing',
  (() => {
    if (!/git.*check-ignore|check-ignore/.test(cli)) return false;
    return ['cmdDiscover', 'cmdValidate', 'cmdExecute'].every((cmd) => {
      const at = cli.indexOf(`async function ${cmd}`);
      return at > 0 && /assertArtifactDirIgnored\(\)/.test(cli.slice(at, at + 400));
    });
  })(),
  'Checked rather than assumed, because the failure is silent and permanent.',
);

check(
  'The artefacts are written with restricted permissions',
  /mode: 0o600/.test(cli) && /mode: 0o700/.test(cli),
  'Best effort on Windows, and the runbook says so rather than implying more.',
);

check(
  'The manifest carries opaque ids, not paths',
  /objectId/.test(cli) && !/manifest[\s\S]{0,200}\bpath:/.test(cli),
  'The manifest holds storage.objects.id, which reveals neither the account nor\n' +
    '    the filename. Not writing the data beats encrypting it.',
);

// ---------------------------------------------------------------------------
// 9. Phase B is not weakened.
// ---------------------------------------------------------------------------
check(
  'Phase B still has no foreign key, and still asserts it',
  (() => {
    const src = read(PHASE_B_TABLE) ?? '';
    const at = src.indexOf('CREATE TABLE IF NOT EXISTS public.media_purge_jobs');
    const end = src.indexOf('COMMENT ON TABLE');
    return at > 0 && !/REFERENCES/i.test(src.slice(at, end)) && /c\.contype = 'f'/.test(src);
  })(),
  'The absence of the FK is what lets the row survive the cascade. Phase C must\n' +
    '    not have disturbed it.',
);

check(
  'Phase B\'s resume cron is still pinned to resume mode',
  /"mode"\s*:\s*"resume"/.test(read(PHASE_B_CRON) ?? ''),
  'Unpinned, the phase B cron could name an arbitrary account — including one of\n' +
    '    the five historical orphans this phase is supposed to handle deliberately.',
);

check(
  'Phase B\'s executors still gate on jobCreated',
  (() => {
    const cron = codeOf(read('supabase/functions/process-expired-deletions/index.ts') ?? '');
    const web = codeOf(read('apps/web/src/app/api/account/confirm-deletion/route.ts') ?? '');
    return /purge\.jobCreated/.test(cron) && /purge\.jobCreated/.test(web);
  })(),
  'Phase C must not have touched the fail-closed gate that stops a deletion when\n' +
    '    the durable job row could not be created.',
);

check(
  'Phase C writes nothing to media_purge_jobs',
  !/media_purge_jobs/.test(edge) && !/media_purge_jobs/.test(cli),
  'Constraint 13: media_purge_jobs is for accounts whose media ownership was known\n' +
    '    BEFORE deletion. Fabricating historical jobs would invent a provenance\n' +
    '    nobody has.',
);

check(
  'Phase B\'s own validator is still wired up',
  (() => {
    const pkg = JSON.parse(read('package.json') ?? '{}');
    return typeof pkg.scripts?.['validate:media-purge'] === 'string';
  })(),
  'This file checks that phase B was not weakened; validate:media-purge is what\n' +
    '    checks phase B itself. Deleting it would remove the real guard.',
);

// ---------------------------------------------------------------------------
// 10. The gateway, and the diagnostic.
// ---------------------------------------------------------------------------
check(
  'config.toml declares verify_jwt = false for the purge function',
  /\[functions\.purge-orphan-media\][\s\S]{0,80}verify_jwt\s*=\s*false/.test(read(CONFIG) ?? ''),
  'Declared in config, not passed as --no-verify-jwt: a later deploy from config\n' +
    '    would re-arm gateway verification and the tool would stop working weeks\n' +
    '    later, with no visible link to this change.',
);

check(
  'The function serves no CORS header',
  !/Access-Control-Allow-Origin/.test(edge) && !/_shared\/cors/.test(edge),
  'The only caller is a CLI. Emitting no allow-origin means no browser can read a\n' +
    '    response, whatever the origin.',
);

const diagnostic = (read(DIAGNOSTIC) ?? '').replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
for (const [label, pattern] of [
  ['DELETE', /\bDELETE\s+FROM\b/i], ['DROP', /\bDROP\s+(TABLE|SCHEMA|FUNCTION)\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i], ['UPDATE', /\bUPDATE\s+\w/i],
  ['INSERT', /\bINSERT\s+INTO\b/i], ['ALTER', /\bALTER\s+TABLE\b/i],
]) {
  check(
    `The diagnostic contains no ${label}`,
    !pattern.test(diagnostic),
    'Every diagnostic in this phase is strictly read-only. A destructive mode is a\n' +
      '    separate deliverable, and this is not it.',
  );
}

check(
  'The runbook states the historical counters that must not change',
  /avatars\s*=?\s*4/.test(read(RUNBOOK) ?? '') &&
    /verifications\s*=?\s*1/.test(read(RUNBOOK) ?? '') &&
    /60/.test(read(RUNBOOK) ?? ''),
  'The reference counters are what turn "it worked" into a checkable claim.',
);

// Until 11 Sep 2026 this asserted the opposite: that the design document did
// NOT declare JUNO-09 closed, because preparation is not closure. The campaign
// has run. The rule that survives is the one that mattered: closure may only be
// claimed together with the three measurements that justify it — zero orphans
// left, the sixty witnesses intact, the live accounts' media unchanged. A
// closure without them is an assertion, and this check refuses it.
check(
  'The design document claims closure only with its three proofs',
  (() => {
    const d = read(DESIGN) ?? '';
    if (!/JUNO-09 est FERMÉ/.test(d)) return false;
    return /orphelins `4\/0\/1` → `0\/0\/0`/.test(d) &&
      /`seed-\*` `60 → 60`/.test(d) &&
      /comptes vivants `17 → 17`/.test(d) &&
      /deleted=5 · already_absent=0 · failed=0/.test(d);
  })(),
  'A closure is a measurement, not a declaration: zero orphans, sixty witnesses,\n' +
    '    seventeen live-account media, and the 5/0/0 result must all be in the document\n' +
    '    that claims it.',
);

check(
  'No document says a campaign can be replayed',
  (() => {
    const files = [
      DESIGN,
      'docs/runbooks/orphan-media-catchup-2026-09.md',
      'docs/runbooks/JUNO-09-PHASE-C-EXECUTION.md',
    ];
    // The forbidden claim, in the two forms the first runbook used. The
    // negations ("ne pas rejouer", "jamais rejouer") are what replaced it.
    const claim = /(la )?même campagne se rejoue|peut être rejouée|rejouer la même commande(?! ;)|can be replayed/i;
    for (const file of files) {
      const t = (read(file) ?? '').split('\n')
        .filter((l) => !/ne (pas|jamais) rejouer|jamais rejou|c'était\s*$|c'était faux|Une version antérieure/i.test(l))
        .join('\n');
      if (claim.test(t)) return false;
    }
    return true;
  })(),
  'One campaign, one destructive pass. The registry closes it after the pass and\n' +
    '    refuses a second one as campaign_closed. A runbook that says otherwise sends\n' +
    '    an operator into a refusal — or, on older code, into an unrecorded deletion.',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures.length) {
  console.error('\nOrphan purge violations:\n');
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  console.error(`${failures.length} of ${checks.length} checks failed.\n`);
  process.exit(1);
}

console.log(`Orphan purge guards hold: ${checks.length} checks passed.`);
console.log(
  '\nScope note: this reads the repository.\n' +
  '  * It cannot see production. The five historical orphans were deleted on\n' +
  '    11 Sep 2026 (campaign 2026-09-11-6cb356, 5/0/0); the proof of that is the\n' +
  '    diagnostic, supabase/tests/diagnose_orphan_purge.sql, not this file.\n' +
  '  * The vitest suites use doubles for storage and the database. They prove the\n' +
  '    decisions and their chaining, not that Supabase Storage behaves as modelled.\n' +
  '  * A campaign gets one destructive pass. A future campaign needs a reviewed cap.\n',
);
