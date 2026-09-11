#!/usr/bin/env node
// JUNO-09 phase C — the operator's side of the historical catch-up.
//
//   node scripts/juno09-orphan-campaign.mjs discover
//   node scripts/juno09-orphan-campaign.mjs validate --campaign <id>
//   node scripts/juno09-orphan-campaign.mjs execute  --campaign <id> --execute \
//        --project qtihezzbuubnyvrjdkjd --confirm-count 5
//
// FOUR GATES, AND NOTHING SHORTCUTS THEM
// ---------------------------------------------------------------------------
// `discover` and `validate` cannot delete: they do not have a code path that
// does. Only `execute` can, and only with every one of these at once —
//
//   --execute                     an explicit, unambiguous flag
//   --project <ref>               the project, typed out, not inferred
//   --confirm-count <n>           matching the manifest total exactly
//   a manifest whose hash is unchanged since discovery
//   an approval SIGNED BY THE SERVER over that exact hash
//   an interactive terminal, where the count is typed again
//
// — and the server then re-verifies every entry itself before deleting anything.
//
// WHY THE APPROVAL COMES FROM THE SERVER
// ---------------------------------------------------------------------------
// `ORPHAN_APPROVAL_KEY` lives only in the edge function's environment. The
// operator cannot sign an approval, so a manifest edited after validation is
// irrecoverably unapproved — no amount of local filesystem access fixes that.
// That is the difference between a hash chain and a signature.
//
// WHAT THIS TOOL NEVER PRINTS
// ---------------------------------------------------------------------------
// No storage path, no filename, no owner UUID, no object id, no signed URL, and
// no secret. Standard output carries counters and closed classes only. The object
// ids live in the manifest file, which is gitignored, written 0600, and destroyed
// after the campaign.
//
// THE SECRET NEVER TOUCHES ARGV
// ---------------------------------------------------------------------------
// `ORPHAN_PURGE_SECRET` is read from the environment. A secret in argv lands in
// the shell history and in the process list, where every other user of the
// machine can read it. This tool REFUSES TO RUN if it sees anything
// secret-shaped in its own arguments.

import { execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const TOOL_VERSION = '1.1.0';
export const MANIFEST_SCHEMA = 'juno09-orphan-manifest/2';
export const APPROVAL_SCHEMA = 'juno09-orphan-approval/1';
export const SECRET_ENV = 'ORPHAN_PURGE_SECRET';
export const SECRET_HEADER = 'x-orphan-purge-secret';
export const EXPECTED_PROJECT_REF = 'qtihezzbuubnyvrjdkjd';
export const FUNCTION_PATH = '/functions/v1/purge-orphan-media';

/** Artefacts directory. Gitignored, and this tool refuses to run if it is not. */
export const ARTIFACT_DIR = '.juno09';

/**
 * The first campaign's expected shape. Identical to the edge function's, and
 * `scripts/validate-orphan-purge.mjs` asserts the two never diverge — a cap that
 * disagrees with the server's is a cap that does nothing.
 */
export const CAMPAIGN_CAPS = {
  totalExact: 5,
  absoluteMax: 5,
  byBucket: { avatars: 4, 'voice-intros': 0, verifications: 1 },
};

export const SUBCOMMANDS = ['discover', 'validate', 'execute'];

/** Subcommands that may delete. Exactly one, and it is not the default. */
export const DESTRUCTIVE_SUBCOMMANDS = ['execute'];

// ---------------------------------------------------------------------------
// Determinism: the manifest hash is meaningless unless two runs over the same
// data produce byte-identical JSON.
// ---------------------------------------------------------------------------
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function manifestHashOf(manifest) {
  const copy = { ...manifest };
  delete copy.manifestHash;
  return sha256Hex(canonicalJson(copy));
}

// ---------------------------------------------------------------------------
// Argument handling. Minimal on purpose: fewer shapes, fewer ways to be wrong.
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const out = { _: [], flags: new Set(), opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { out._.push(token); continue; }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out.opts[name] = next; i += 1; }
    else out.flags.add(name);
  }
  return out;
}

/**
 * Refuse to run if anything in argv looks like a credential.
 *
 * Not paranoia: `--secret abc…` is the single most likely way this tool would
 * leak, because it is the convenient thing to type. The shell history and the
 * process list both keep it, and neither forgets.
 */
export function argvCarriesSecret(argv) {
  for (const token of argv) {
    if (/^--?(secret|token|key|password|pass|apikey|api-key)(=|$)/i.test(token)) return true;
    // A long hex or base64-ish run is a credential far more often than an option.
    if (/^[0-9a-f]{32,}$/i.test(token)) return true;
    if (/^eyJ[A-Za-z0-9_-]{10,}/.test(token)) return true;
  }
  return false;
}

function die(message, code = 1) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(code);
}

function say(message = '') { console.log(message); }

// ---------------------------------------------------------------------------
// Artefacts. Local, restricted, gitignored, and never committed.
// ---------------------------------------------------------------------------
function artifactDir() {
  const dir = path.join(ROOT, ARTIFACT_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * The directory MUST be ignored by git before anything is written into it.
 *
 * Checked at runtime rather than assumed, because the failure is silent and
 * permanent: a manifest committed once is in the history forever, and it names
 * every object that was about to be deleted.
 */
function assertArtifactDirIgnored() {
  try {
    const out = execFileSync('git', ['check-ignore', '-q', `${ARTIFACT_DIR}/probe`],
      { cwd: ROOT, stdio: 'ignore' });
    void out;
  } catch {
    die(
      `${ARTIFACT_DIR}/ is NOT ignored by git.\n` +
      '    Add it to .gitignore before running this tool. A manifest committed once\n' +
      '    stays in the history forever, and it names every object that was about\n' +
      '    to be deleted.',
    );
  }
}

function writeArtifact(name, value) {
  const file = path.join(artifactDir(), name);
  writeFileSync(file, `${canonicalJson(value)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
  return file;
}

/**
 * Read without creating anything.
 *
 * Deliberately NOT `artifactDir()`, which creates the directory: a read must have
 * no write side effect. Calling `execute` with no manifest used to leave an empty
 * `.juno09/` behind, which is harmless but wrong — and the kind of wrong that
 * teaches you to stop trusting "read-only".
 */
function readArtifact(name) {
  const file = path.join(ROOT, ARTIFACT_DIR, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function manifestName(campaignId) { return `manifest-${campaignId}.json`; }
export function approvalName(campaignId) { return `approval-${campaignId}.json`; }

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
async function callFunction(baseUrl, secret, body) {
  const response = await fetch(`${baseUrl}${FUNCTION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [SECRET_HEADER]: secret },
    body: JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { status: response.status, ok: response.ok, payload };
}

function requireSecret() {
  const secret = process.env[SECRET_ENV] ?? '';
  if (secret.length < 32) {
    die(
      `${SECRET_ENV} is absent or shorter than 32 characters.\n` +
      '    Set it in the environment for this shell only. Never pass it as an\n' +
      '    argument: argv lands in the shell history and the process list.',
    );
  }
  return secret;
}

function baseUrlFor(projectRef) {
  return `https://${projectRef}.supabase.co`;
}

export function newCampaignId(now = new Date(), randomHex = null) {
  const day = now.toISOString().slice(0, 10);
  const suffix = randomHex ?? [...crypto.getRandomValues(new Uint8Array(3))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${day}-${suffix}`;
}

/** Counters only. This function is the reason stdout never leaks an identifier. */
function printCounts(label, counts) {
  say(`  ${label}`);
  say(`    objets                : ${counts.objects}`);
  for (const [bucket, n] of Object.entries(counts.byBucket ?? {}).sort()) {
    say(`    ${bucket.padEnd(22)}: ${n}`);
  }
  for (const [category, n] of Object.entries(counts.byCategory ?? {}).sort()) {
    say(`    ${category.padEnd(22)}: ${n}`);
  }
}

// ---------------------------------------------------------------------------
// GATE A + B — discover, and write the manifest
// ---------------------------------------------------------------------------
async function cmdDiscover(args) {
  assertArtifactDirIgnored();
  const secret = requireSecret();
  const projectRef = args.opts.project ?? EXPECTED_PROJECT_REF;
  const campaignId = args.opts.campaign ?? newCampaignId();

  say('\n  JUNO-09 phase C — porte A : découverte en lecture seule');
  say(`  campagne : ${campaignId}`);
  say(`  projet   : ${projectRef}\n`);

  const { status, payload } = await callFunction(
    baseUrlFor(projectRef), secret, { mode: 'discover', campaignId },
  );
  if (status !== 200 || !payload?.ok) {
    if (payload?.allCounts) { printCounts('classification complète', payload.allCounts); say(''); }
    if (payload?.orphanCounts) { printCounts('orphelins prouvés', payload.orphanCounts); say(''); }
    die(`la découverte a été refusée (HTTP ${status}, classe ` +
        `${payload?.errorClass ?? 'inconnue'}${payload?.detail ? ` — ${payload.detail}` : ''}).\n` +
        '    Aucun manifeste n\'a été émis, rien n\'a été écrit. Ne pas adapter le plafond.');
  }

  printCounts('classification complète', payload.allCounts);
  say('');
  printCounts('orphelins prouvés', payload.orphanCounts);
  say('');

  // The exhaustiveness check the phase A diagnostic learned the hard way: the
  // four classes must sum to the total, or 62 objects vanish silently.
  const byCategory = payload.allCounts.byCategory ?? {};
  const sum = Object.values(byCategory).reduce((a, b) => a + b, 0);
  if (sum !== payload.allCounts.objects) {
    die(`classification NON exhaustive : ${sum} classés pour ` +
        `${payload.allCounts.objects} objets. Arrêt.`);
  }
  say('  classification exhaustive : oui\n');

  // The manifest is the SERVER's. It assembled it, hashed it, recorded the hash
  // in the registry and read it back before answering. This side writes it
  // verbatim, and only checks that what it received is what was recorded.
  //
  // The first version assembled the manifest HERE — generatedAt from this
  // clock, projectRef from the arguments — so the server never had a hash to
  // record, and gate C refused every campaign it had never seen. 11 Sep 2026.
  const manifest = payload.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    die('réponse sans manifeste. Rien n\'a été écrit.');
  }
  if (manifest.schema !== MANIFEST_SCHEMA) {
    die(`schéma de manifeste inattendu (${manifest.schema}). Rien n'a été écrit.`);
  }
  if (manifest.campaignId !== campaignId) die('le manifeste vise une autre campagne. Rien n\'a été écrit.');
  if (manifest.projectRef !== projectRef) {
    die(`le manifeste vise ${manifest.projectRef}, attendu ${projectRef}. Rien n'a été écrit.`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    die('manifeste sans entrée. Rien n\'a été écrit.');
  }

  // Recomputed here, with this side's canonical JSON: the two implementations
  // are proved to agree NOW, at discovery, not at gate C.
  const recomputed = manifestHashOf(manifest);
  if (!hashesEqual(recomputed, manifest.manifestHash ?? '')) {
    die('l\'empreinte du manifeste reçu ne se recalcule pas à l\'identique ici : les\n' +
        '    deux implémentations divergent. Rien n\'a été écrit.');
  }
  // And the registry holds it: the server read its own row back, and says so.
  const registry = payload.registry ?? {};
  if (registry.status !== 'discovered' || !hashesEqual(registry.manifestHash ?? '', recomputed)) {
    die('le registre ne porte pas cette découverte. Rien n\'a été écrit.');
  }

  const file = writeArtifact(manifestName(campaignId), manifest);

  say(`  manifeste écrit : ${path.relative(ROOT, file)}  (0600, gitignoré)`);
  say(`  empreinte       : ${manifest.manifestHash}`);
  say(`  registre        : ${registry.status}, empreinte identique, plafond ${registry.volumeCap}`);
  say(`  propriétaires distincts (aveugles) : ` +
      `${new Set(manifest.entries.map((e) => e.ownerGroup)).size}`);
  say('');

  say(`  plafonds satisfaits : ${CAMPAIGN_CAPS.totalExact} objets, ` +
      `avatars=${CAMPAIGN_CAPS.byBucket.avatars} ` +
      `voice-intros=${CAMPAIGN_CAPS.byBucket['voice-intros']} ` +
      `verifications=${CAMPAIGN_CAPS.byBucket.verifications}`);
  say('\n  Rien n\'a été supprimé. Porte suivante :');
  say(`    node scripts/juno09-orphan-campaign.mjs validate --campaign ${campaignId}\n`);
}

// ---------------------------------------------------------------------------
// GATE C — validate, and store the server's signed approval
// ---------------------------------------------------------------------------
async function cmdValidate(args) {
  assertArtifactDirIgnored();
  const secret = requireSecret();
  const campaignId = args.opts.campaign;
  if (!campaignId) die('--campaign <id> est requis.');

  const manifest = readArtifact(manifestName(campaignId));
  if (!manifest) die(`aucun manifeste pour la campagne ${campaignId}.`);

  say('\n  JUNO-09 phase C — porte C : validation\n');

  // The manifest must not have changed since it was written. This is the check
  // that makes "editing the manifest invalidates the authorization" true.
  const recomputed = manifestHashOf(manifest);
  if (!hashesEqual(recomputed, manifest.manifestHash ?? '')) {
    die('l\'empreinte du manifeste ne correspond plus à son contenu : il a été\n' +
        '    modifié après sa génération. Refaire la découverte.');
  }
  say(`  empreinte du manifeste vérifiée : ${recomputed}`);

  if (manifest.schema !== MANIFEST_SCHEMA) die('schéma de manifeste inattendu.');
  if (manifest.projectRef !== EXPECTED_PROJECT_REF) {
    die(`le manifeste vise ${manifest.projectRef}, attendu ${EXPECTED_PROJECT_REF}.`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    die('manifeste sans entrée.');
  }
  if (manifest.entries.length > CAMPAIGN_CAPS.absoluteMax) {
    die(`le manifeste porte ${manifest.entries.length} entrées, plafond ` +
        `${CAMPAIGN_CAPS.absoluteMax}. Arrêt.`);
  }

  // Every per-entry hash, recomputed. A single altered entry is caught here even
  // if the global hash were somehow made to match.
  for (const entry of manifest.entries) {
    const expected = sha256Hex(
      `${campaignId}|${entry.bucket}|${entry.objectId}|${entry.category}`);
    if (!hashesEqual(expected, entry.entryHash ?? '')) {
      die('une entrée du manifeste a une empreinte incorrecte. Refaire la découverte.');
    }
    if (entry.category !== 'orphan_proven') {
      die(`une entrée porte la catégorie "${entry.category}" : seules les ` +
          'orphelines prouvées peuvent être approuvées.');
    }
  }
  say(`  empreintes par entrée vérifiées : ${manifest.entries.length}/${manifest.entries.length}`);

  const byBucket = {};
  for (const bucket of Object.keys(CAMPAIGN_CAPS.byBucket)) byBucket[bucket] = 0;
  for (const entry of manifest.entries) byBucket[entry.bucket] += 1;
  for (const [bucket, expected] of Object.entries(CAMPAIGN_CAPS.byBucket)) {
    if (byBucket[bucket] !== expected) {
      die(`distribution inattendue : ${bucket}=${byBucket[bucket]}, attendu ${expected}. Arrêt.`);
    }
  }
  if (manifest.entries.length !== CAMPAIGN_CAPS.totalExact) {
    die(`${manifest.entries.length} objets, attendu exactement ` +
        `${CAMPAIGN_CAPS.totalExact}. Arrêt.`);
  }
  say(`  distribution conforme : ${JSON.stringify(byBucket)}`);

  // The WHOLE manifest, verbatim. The server hashes what it receives and
  // compares that to the hash the registry recorded at discovery — a claimed
  // hash beside a list of ids would bind the approval to nothing.
  const { status, payload } = await callFunction(baseUrlFor(manifest.projectRef), secret, {
    mode: 'approve',
    campaignId,
    manifest,
  });

  if (status !== 200 || !payload?.ok) {
    die(`le serveur a refusé la validation (HTTP ${status}, classe ` +
        `${payload?.errorClass ?? 'inconnue'}${payload?.detail ? ` — ${payload.detail}` : ''}).\n` +
        '    Aucune approbation n\'a été écrite, rien n\'a été supprimé.');
  }

  if (!payload.approval || payload.registry?.status !== 'approved') {
    die('réponse sans approbation enregistrée. Rien n\'a été écrit.');
  }
  if (!hashesEqual(payload.approval.manifestHash ?? '', manifest.manifestHash)) {
    die('l\'approbation reçue ne vise pas ce manifeste. Rien n\'a été écrit.');
  }

  const file = writeArtifact(approvalName(campaignId), payload.approval);
  const ttl = Math.round((payload.approval.expiresAt - Date.now()) / 60000);

  say(`\n  approbation SIGNÉE PAR LE SERVEUR : ${path.relative(ROOT, file)}`);
  say(`  registre : ${payload.registry.status}, empreinte identique`);
  say(`  valable ${ttl} minutes`);
  say('  la clé de signature ne quitte jamais la fonction edge : cette');
  say('  approbation ne peut pas être fabriquée depuis ce poste.\n');
  say('  Rien n\'a été supprimé. Porte suivante — IRRÉVERSIBLE :');
  say(`    node scripts/juno09-orphan-campaign.mjs execute --campaign ${campaignId} \\`);
  say(`      --execute --project ${manifest.projectRef} ` +
      `--confirm-count ${manifest.entries.length}\n`);
}

// ---------------------------------------------------------------------------
// GATE D — execute. Destructive, and it says so.
// ---------------------------------------------------------------------------
async function cmdExecute(args) {
  assertArtifactDirIgnored();

  // Every condition is checked BEFORE the secret is even read, so a missing flag
  // never gets as far as a request.
  if (!args.flags.has('execute')) {
    die('`--execute` est requis. Sans lui, cette sous-commande ne fait rien : le\n' +
        '    mode par défaut de cet outil est la découverte, et il n\'existe aucun\n' +
        '    chemin destructif sans ce drapeau.');
  }
  const campaignId = args.opts.campaign;
  if (!campaignId) die('--campaign <id> est requis.');

  const project = args.opts.project;
  if (project !== EXPECTED_PROJECT_REF) {
    die(`--project doit valoir exactement ${EXPECTED_PROJECT_REF} (reçu : ` +
        `${project ?? 'rien'}). Le projet ne s\'infère pas.`);
  }

  const manifest = readArtifact(manifestName(campaignId));
  if (!manifest) die(`aucun manifeste pour la campagne ${campaignId}. Rien n'est supprimé.`);
  const approval = readArtifact(approvalName(campaignId));
  if (!approval) {
    die(`aucune approbation pour la campagne ${campaignId}. La porte C doit\n` +
        '    précéder la porte D. Rien n\'est supprimé.');
  }

  const recomputed = manifestHashOf(manifest);
  if (!hashesEqual(recomputed, manifest.manifestHash ?? '')) {
    die('le manifeste a été modifié depuis sa génération. Rien n\'est supprimé.');
  }
  if (!hashesEqual(approval.manifestHash ?? '', manifest.manifestHash ?? '')) {
    die('l\'approbation ne vise pas ce manifeste. Rien n\'est supprimé.');
  }
  if (approval.campaignId !== campaignId) {
    die('l\'approbation vise une autre campagne. Rien n\'est supprimé.');
  }
  if (approval.schema !== APPROVAL_SCHEMA) die('schéma d\'approbation inattendu.');
  if (approval.projectRef !== project) {
    die('l\'approbation vise un autre projet. Rien n\'est supprimé.');
  }
  if (typeof approval.expiresAt !== 'number' || Date.now() >= approval.expiresAt) {
    die('l\'approbation a expiré. Refaire la porte C. Rien n\'est supprimé.');
  }

  const total = manifest.entries.length;
  if (total > CAMPAIGN_CAPS.absoluteMax) {
    die(`${total} objets dépasse le plafond absolu ${CAMPAIGN_CAPS.absoluteMax}.`);
  }
  if (total !== CAMPAIGN_CAPS.totalExact) {
    die(`${total} objets, attendu exactement ${CAMPAIGN_CAPS.totalExact}.`);
  }
  const confirmCount = Number(args.opts['confirm-count']);
  if (!Number.isInteger(confirmCount) || confirmCount !== total) {
    die(`--confirm-count doit valoir exactement ${total}.`);
  }

  // No TTY, no deletion. This is what makes it impossible for CI — or any
  // unattended run — to reach the destructive path at all.
  if (!process.stdin.isTTY) {
    die('aucun terminal interactif. La suppression réelle exige une confirmation\n' +
        '    tapée à la main, ce qui la rend inatteignable depuis la CI ou un script.');
  }

  say('\n  ⚠  JUNO-09 phase C — porte D : SUPPRESSION IRRÉVERSIBLE\n');
  say(`  campagne  : ${campaignId}`);
  say(`  projet    : ${project}`);
  say(`  manifeste : ${manifest.manifestHash}`);
  say(`  objets    : ${total}`);
  for (const [bucket, n] of Object.entries(
    manifest.entries.reduce((a, e) => ({ ...a, [e.bucket]: (a[e.bucket] ?? 0) + 1 }), {}),
  ).sort()) say(`    ${bucket.padEnd(22)}: ${n}`);
  say('\n  Un objet de Storage supprimé ne revient pas.');
  say('  Dont une vidéo de vérification, si la distribution le montre ci-dessus.\n');

  const typed = await new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  Taper le nombre exact d'objets à supprimer (${total}) pour confirmer : `,
      (answer) => { rl.close(); resolve(answer.trim()); });
  });
  if (typed !== String(total)) {
    die('confirmation incorrecte. Rien n\'a été supprimé.');
  }

  const secret = requireSecret();
  say('\n  exécution…\n');

  const { status, payload } = await callFunction(baseUrlFor(project), secret, {
    mode: 'execute',
    execute: true,
    campaignId,
    manifest,
    confirmObjectCount: total,
    approval,
  });

  if (status !== 200 || !payload?.ok) {
    die(`le serveur a refusé l'exécution (HTTP ${status}, classe ` +
        `${payload?.errorClass ?? 'inconnue'}${payload?.detail ? ` — ${payload.detail}` : ''}).\n` +
        '    Aucune suppression n\'a eu lieu.');
  }

  say('  résultat');
  say(`    deleted        : ${payload.deleted}`);
  say(`    already_absent : ${payload.alreadyAbsent}`);
  say(`    failed         : ${payload.failed}`);
  say(`    classe         : ${payload.errorClass ?? 'aucune'}`);
  say(`    enregistré     : ${payload.recorded ? 'oui' : 'NON — à consigner à la main'}`);
  say('');
  if (!payload.recorded) {
    say('  ⚠  Les suppressions ont eu lieu mais le registre ne les porte pas.');
    say('     Consigner ce résultat dans le dossier de preuves AVANT toute autre');
    say('     action. La campagne ne peut pas être rejouée : une seule passe.\n');
  }
  say('  Vérifier maintenant : supabase/tests/diagnose_orphan_purge.sql');
  say('  Puis détruire les artefacts, qui portent les identifiants d\'objets :');
  say(`    node scripts/juno09-orphan-campaign.mjs shred --campaign ${campaignId}\n`);
}

// ---------------------------------------------------------------------------
// Housekeeping — destroy the artefacts once they are no longer needed
// ---------------------------------------------------------------------------
function cmdShred(args) {
  const campaignId = args.opts.campaign;
  if (!campaignId) die('--campaign <id> est requis.');
  let removed = 0;
  for (const name of [manifestName(campaignId), approvalName(campaignId)]) {
    const file = path.join(artifactDir(), name);
    if (!existsSync(file)) continue;
    // Overwrite before unlinking. Not a secure erase on a journalling or
    // copy-on-write filesystem — said plainly rather than implied.
    const size = readFileSync(file).length;
    writeFileSync(file, '0'.repeat(size), { mode: 0o600 });
    rmSync(file, { force: true });
    removed += 1;
  }
  say(`\n  ${removed} artefact(s) détruit(s) pour la campagne ${campaignId}.`);
  say('  La trace qui subsiste est la ligne de orphan_purge_campaigns :');
  say('  compteurs et empreintes, aucun chemin, aucun identifiant d\'objet.');
  say('\n  Note : l\'écrasement n\'est PAS un effacement sûr sur un système de');
  say('  fichiers journalisé ou copy-on-write. Pour une garantie, chiffrer le');
  say('  volume.\n');
}

// ---------------------------------------------------------------------------
function usage() {
  say(`
  JUNO-09 phase C — rattrapage des médias orphelins historiques

    discover                       porte A+B — lecture seule, écrit le manifeste
    validate --campaign <id>       porte C   — le serveur re-vérifie et signe
    execute  --campaign <id> --execute --project <ref> --confirm-count <n>
                                   porte D   — IRRÉVERSIBLE
    shred    --campaign <id>       détruit les artefacts locaux

  Le secret se lit dans ${SECRET_ENV}. Jamais en argument.
  Aucune sous-commande sauf \`execute\` ne peut supprimer quoi que ce soit.
`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argvCarriesSecret(argv)) {
    die('un argument ressemble à un secret. Refus d\'exécution.\n' +
        `    Poser ${SECRET_ENV} dans l'environnement : argv est conservé par\n` +
        '    l\'historique du shell et visible dans la liste des processus.');
  }

  const args = parseArgs(argv);
  const sub = args._[0] ?? null;

  if (sub === null || args.flags.has('help')) { usage(); process.exit(sub === null ? 1 : 0); }
  if (!SUBCOMMANDS.includes(sub) && sub !== 'shred') {
    die(`sous-commande inconnue : ${sub}`);
  }

  if (sub === 'discover') await cmdDiscover(args);
  else if (sub === 'validate') await cmdValidate(args);
  else if (sub === 'execute') await cmdExecute(args);
  else if (sub === 'shred') cmdShred(args);
}

// `import.meta.main` is Deno; under Node the entry check is argv[1].
const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    // The message is deliberately not printed: it can carry a URL, and a URL
    // carries the project and sometimes an identifier.
    console.error(`\n  ✗ échec inattendu (${error?.name ?? 'Error'}). Rien n'a été supprimé.\n`);
    process.exit(1);
  });
}
