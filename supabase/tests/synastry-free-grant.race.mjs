#!/usr/bin/env node
// =============================================================================
// Synastrie offerte — COURSE RÉELLE à deux connexions PostgreSQL
// =============================================================================
//
// USAGE — variables d'environnement UNIQUEMENT, jamais argv : une chaîne de
//        connexion passée en argument serait visible dans la liste des
//        processus, l'historique du shell et les logs CI.
//
//   JUNO_STAGING_DATABASE_URL=postgresql://… \
//   JUNO_STAGING_PROJECT_REF=<ref-du-staging> \
//   JUNO_ALLOW_STAGING_RACE_TEST=yes \
//   node supabase/tests/synastry-free-grant.race.mjs
//
// PRÉREQUIS : Node >= 18, psql sur le PATH, rôle propriétaire/postgres, et
// les migrations 20260915000001/2 appliquées sur la base visée.
//
// STAGING SEULEMENT. Ce harnais CRÉE PUIS SUPPRIME des utilisateurs : il
// refuse de fonctionner si la chaîne ressemble à la production
// (qtihezzbuubnyvrjdkjd), exige la confirmation explicite
// JUNO_ALLOW_STAGING_RACE_TEST=yes et une identité de projet attendue. Il ne
// doit JAMAIS servir de première preuve déployée en production — la garantie
// concurrente y reste structurelle (PK + ON CONFLICT DO NOTHING) tant qu'un
// staging n'a pas exécuté ce harnais.
//
// POURQUOI UN ORCHESTRATEUR (revue 3, blocage 2)
// ----------------------------------------------
// Un fichier SQL commenté n'est pas un test automatisé, et les verrous
// advisory mal employés ne synchronisent rien : deux workers attendant des
// clés différentes ne se rejoignent jamais, et libérer une clé que personne
// n'attend ne déclenche rien. Ici, la barrière est le PIPE : chaque worker
// psql est un processus vivant bloqué en lecture sur son stdin après avoir
// signalé READY ; l'orchestrateur confirme les DEUX ready (phase BARRIER_
// ARMED), puis écrit l'appel de claim aux DEUX stdin dans la même tick —
// libération réelle, simultanée, de la même barrière.
//
// CE QUI EST COURU
// ----------------
// Deux transactions concurrentes, même lecteur U1 (session auth.uid() réelle
// via set_config), cible A pour le worker 1 et cible B pour le worker 2.
// Le gagnant insère et TIENT le verrou d'index unique ; le perdant BLOQUE
// dessus (c'est la vraie course, pas une simulation). L'orchestrateur
// commite le premier résultat autorisé lu ; alors seulement le perdant
// débloque et doit rendre free_preview_used_other_target.
//
// VERDICT : exactement un allowed_free_new, un free_preview_used_other_target,
// une seule ligne (viewer, jour UTC). Nettoyage BORNÉ aux UUID synthétiques
// ci-dessous, puis preuve qu'aucune fixture ne subsiste.
// =============================================================================

import { spawn, spawnSync } from 'node:child_process';

// ── 1. UUID synthétiques CONSTANTS et clairement identifiés ─────────────────
// Préfixe d17a… : n'existe nulle part ailleurs ; le nettoyage ne touche QUE
// ces identités. Ne jamais les réutiliser pour autre chose.
const SYNTH = Object.freeze({
  viewer: 'd17a5ace-0000-4000-8000-00000000f001',
  targetA: 'd17a5ace-0000-4000-8000-00000000f00a',
  targetB: 'd17a5ace-0000-4000-8000-00000000f00b',
});
const SYNTH_IDS = Object.values(SYNTH); // pour le nettoyage borné
const EMAILS = SYNTH_IDS.map((id) => `synrace.${id.slice(0, 8)}@juno.invalid`);

const DB_URL = process.env.JUNO_STAGING_DATABASE_URL;
const EXPECTED_REF = process.env.JUNO_STAGING_PROJECT_REF;
const ALLOW = process.env.JUNO_ALLOW_STAGING_RACE_TEST;
const PRODUCTION_REF = 'qtihezzbuubnyvrjdkjd'; // refus absolu, jamais une cible

if (!DB_URL || !EXPECTED_REF || ALLOW !== 'yes') {
  console.error(
    'Ce harnais exige trois variables : JUNO_STAGING_DATABASE_URL, ' +
    'JUNO_STAGING_PROJECT_REF et JUNO_ALLOW_STAGING_RACE_TEST=yes.\n' +
    'Staging uniquement — il crée puis supprime des utilisateurs.',
  );
  process.exit(2);
}

// Identité de la base visée, extraite de la chaîne SANS l'imprimer : labels
// d'hôte + éventuel « postgres.<ref> » (poolers). Le ref attendu doit s'y
// trouver ; le ref de production doit s'y trouver SOUS AUCUN prétexte.
const refCandidates = new Set();
try {
  const u = new URL(DB_URL);
  for (const label of u.hostname.split('.')) refCandidates.add(label);
  const userMatch = decodeURIComponent(u.username ?? '').match(/^postgres\.([^.]+)/);
  if (userMatch) refCandidates.add(userMatch[1]);
} catch {
  // format inhabituel : la vérification d'identité échouera ci-dessous — échec fermé.
}
if (refCandidates.has(PRODUCTION_REF)) {
  console.error('REFUS : la chaîne vise le projet de PRODUCTION. Ce test est staging-only.');
  process.exit(2);
}
if (!refCandidates.has(EXPECTED_REF)) {
  console.error(
    'REFUS : l’identité de la base ne correspond pas à JUNO_STAGING_PROJECT_REF ' +
    `(attendu «${EXPECTED_REF}», non trouvé dans l’hôte/le nom d’utilisateur). Chaîne non affichée.`,
  );
  process.exit(2);
}

/** La chaîne de connexion ne doit jamais apparaître dans un log ni une erreur. */
const redact = (s) => String(s).split(DB_URL).join('[redacted]');

const PSQL_BASE = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', DB_URL];

const claimsFor = (userId) =>
  `SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);`;

/**
 * Échec : enregistre et JETTE — jamais process.exit ici. L'orchestrateur
 * principal attrape, et le finally garantit ROLLBACK + nettoyage + vérif des
 * résidus AVANT la sortie (revue 4 : un exit prématurait laissait fixtures,
 * workers et transactions en vie).
 */
const fail = (msg) => {
  throw new Error(msg);
};

/** psql one-shot SELECT (orchestrateur) : stdout trimé, échec bruyant. */
function psql(sql) {
  const r = spawnSync('psql', [...PSQL_BASE, '-c', sql], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(redact(r.stderr || r.stdout));
    fail(`psql a échoué : ${sql.slice(0, 80)}…`);
  }
  return (r.stdout ?? '').trim();
}

/**
 * Un script multi-statements en UNE invocation : chaque psql() est sa propre
 * connexion, donc un BEGIN envoyé seul ne s’étend jamais à l’appel suivant.
 * Les phases transactionnelles (fixtures, nettoyage) passent ici — une seule
 * connexion, une vraie transaction, un seul COMMIT. PSQL_BASE contient déjà
 * la chaîne : ne PAS la répéter.
 */
function psqlScript(sql, what) {
  const r = spawnSync('psql', [...PSQL_BASE], {
    input: sql,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(redact(r.stderr || r.stdout));
    fail(`psql a échoué (${what})`);
  }
  return (r.stdout ?? '').trim();
}

/** Un worker = un processus psql vivant, piloté par stdin. */
function spawnWorker(label) {
  const child = spawn('psql', PSQL_BASE, { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    for (const line of d.split('\n')) if (line.trim() !== '') lines.push(line.trim());
  });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('exit', (code) => {
    if (code !== 0 && !child.__endedOk) {
      console.error(`worker ${label} mort (exit ${code}) : ${stderr}`);
    }
  });
  const send = (sql) => child.stdin.write(sql.endsWith('\n') ? sql : `${sql}\n`);
  /** Attend qu'une ligne satisfaisant test(line) arrive, avec délai. */
  const waitFor = (test, what, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = setInterval(() => {
        const at = lines.findIndex(test);
        if (at >= 0) {
          clearInterval(tick);
          resolve(lines[at]);
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(tick);
          reject(new Error(`worker ${label} : timeout en attendant ${what}`));
        } else if (stderr.includes('ERROR')) {
          clearInterval(tick);
          reject(new Error(`worker ${label} : ${stderr.trim().slice(0, 300)}`));
        }
      }, 15);
    });
  return { child, send, waitFor, label };
}

// ── Nettoyage et preuves, TOUJOURS exécutés (même après échec) ─────────────
const workers = []; // déclaré avant runRace pour le finally

// OWNERSHIP DU NETTOYAGE (incident prévenu n°7) : le harnais ne doit JAMAIS
// supprimer des lignes qu’il n’a pas créées. Ce drapeau ne passe à true
// qu’après le retour RÉUSSI de la transaction de fixtures (celle qui porte
// son propre COMMIT) — si le précontrôle détecte une collision préexistante,
// la transaction échoue, le drapeau reste false, et le finally ne supprime
// ABSOLUMENT rien de ce qui existait avant lui.
let fixturesCommitted = false;

const SYNTH_ID_LIST = `'${SYNTH_IDS.join("','")}'`;

// Nettoyage COMPLET et BORNÉ aux trois UUID, dans un ordre compatible avec
// les FK (grants sans FK d’abord, auth.users — source des cascades — en
// dernier). Les grants sont purgés côté viewer ET côté target.
const CLEANUP_SQL = `BEGIN;
DELETE FROM public.synastry_free_grant
 WHERE viewer_user_id IN (${SYNTH_ID_LIST})
    OR target_user_id IN (${SYNTH_ID_LIST});
DELETE FROM public.product_events WHERE user_id IN (${SYNTH_ID_LIST});
DELETE FROM public.subscriptions WHERE user_id IN (${SYNTH_ID_LIST});
DELETE FROM public.profiles WHERE id IN (${SYNTH_ID_LIST});
DELETE FROM auth.users WHERE id IN (${SYNTH_ID_LIST});
COMMIT;`;

// Preuve de résidu : les MÊMES cinq surfaces, les MÊMES trois UUID.
const RESIDUE_SQL = `SELECT
    (SELECT COUNT(*) FROM auth.users WHERE id IN (${SYNTH_ID_LIST})) +
    (SELECT COUNT(*) FROM public.profiles WHERE id IN (${SYNTH_ID_LIST})) +
    (SELECT COUNT(*) FROM public.subscriptions WHERE user_id IN (${SYNTH_ID_LIST})) +
    (SELECT COUNT(*) FROM public.synastry_free_grant
      WHERE viewer_user_id IN (${SYNTH_ID_LIST}) OR target_user_id IN (${SYNTH_ID_LIST})) +
    (SELECT COUNT(*) FROM public.product_events WHERE user_id IN (${SYNTH_ID_LIST}))`;

/**
 * Arrêt des workers, borné et idempotent : ROLLBACK si le stdin est encore
 * ouvert (ferme toute transaction vivante), fermeture du stdin, attente de
 * sortie (3 s), kill en dernier recours (encore 2 s). Ré-exécuter ne fait rien.
 */
async function teardownWorkers() {
  for (const w of workers) {
    const c = w.child;
    if (c.exitCode !== null) continue; // déjà sorti — idempotence
    try {
      if (c.stdin.writable) c.stdin.write('ROLLBACK;\n');
    } catch { /* stdin déjà mort : le processus suivra */ }
    try { c.stdin.end(); } catch { /* idem */ }
    await new Promise((resolve) => {
      const hardTimer = setTimeout(() => {
        try { c.kill(); } catch { /* déjà mort */ }
        setTimeout(resolve, 2000);
      }, 3000);
      c.on('exit', () => { clearTimeout(hardTimer); resolve(); });
    });
    c.__endedOk = true;
  }
}

// ── Course principale : chaque échec JETTE, jamais de sortie directe ────────
async function runRace() {
  // Fixtures — TROIS identités (viewer, cible A, cible B), par le trigger
  // Auth (incident prévenu n°7 : INSERT direct dans profiles = collision
  // pkey + profils incomplets). Une seule transaction : précontrôle PUIS
  // insertions PUIS mise à jour des profils créés par le trigger, COMMIT.
  // Aucun ON CONFLICT : une collision préexistante doit ÉCHOUER, pas se
  // masquer — c’est ce qui protège le nettoyage (fixturesCommitted).
  console.log('[fixtures] préparation (précontrôle, trigger Auth, une transaction)…');
  psqlScript(`BEGIN;
DO $fixtures$
DECLARE
  v_collisions BIGINT;
  v_updated    INTEGER;
BEGIN
  -- Précontrôle : les trois UUID absents des cinq surfaces, AVANT toute
  -- mutation (grats inspectés côté viewer ET côté target).
  SELECT
      (SELECT COUNT(*) FROM auth.users u WHERE u.id IN ('${SYNTH_IDS.join("','")}'))
    + (SELECT COUNT(*) FROM public.profiles p WHERE p.id IN ('${SYNTH_IDS.join("','")}'))
    + (SELECT COUNT(*) FROM public.subscriptions s WHERE s.user_id IN ('${SYNTH_IDS.join("','")}'))
    + (SELECT COUNT(*) FROM public.synastry_free_grant g
        WHERE g.viewer_user_id IN ('${SYNTH_IDS.join("','")}')
           OR g.target_user_id IN ('${SYNTH_IDS.join("','")}'))
    + (SELECT COUNT(*) FROM public.product_events e WHERE e.user_id IN ('${SYNTH_IDS.join("','")}'))
    INTO v_collisions;
  IF v_collisions <> 0 THEN
    RAISE EXCEPTION 'collision préexistante : % ligne(s) portent déjà les UUID synthétiques — refus avant toute mutation', v_collisions;
  END IF;

  -- Les trois comptes Auth : le trigger crée les trois profils.
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', '${SYNTH.viewer}',
     'authenticated', 'authenticated', '${EMAILS[0]}', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', '${SYNTH.targetA}',
     'authenticated', 'authenticated', '${EMAILS[1]}', '', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000000', '${SYNTH.targetB}',
     'authenticated', 'authenticated', '${EMAILS[2]}', '', NOW(), NOW(), NOW());

  -- AUCUN INSERT direct dans profiles : on MET À JOUR les profils du
  -- trigger, avec tout ce que profile_chart_visible exige.
  UPDATE public.profiles p
     SET email = v.email,
         name  = v.name,
         birth_date = v.birth_date,
         gender = v.gender,
         is_active = v.is_active,
         onboarding_completed = TRUE
    FROM (VALUES
      ('${SYNTH.viewer}'::uuid,  '${EMAILS[0]}', 'SynRace Viewer',   '1994-04-04'::date, 'female', true),
      ('${SYNTH.targetA}'::uuid, '${EMAILS[1]}', 'SynRace Cible A',  '1993-03-03'::date, 'female', true),
      ('${SYNTH.targetB}'::uuid, '${EMAILS[2]}', 'SynRace Cible B',  '1992-02-02'::date, 'female', true)
    ) AS v(id, email, name, birth_date, gender, is_active)
   WHERE p.id = v.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 3 THEN
    RAISE EXCEPTION 'fixtures : % profil(s) mis à jour — attendu exactement 3 (trigger + UPDATE)', v_updated;
  END IF;
END
$fixtures$;
COMMIT;`, 'fixtures');
  // Uniquement maintenant — la transaction de fixtures (et son COMMIT) est
  // revenue sans erreur : ce harnais possède ce qu’il a créé, et rien d’autre.
  fixturesCommitted = true;
  {
    const policy = psql("SELECT COALESCE(free_preview_quota::text,'NULL') FROM public.premium_feature_policy WHERE feature_key='synastry';");
    if (policy !== '1') {
      fail(`politique synastry free_preview_quota = ${policy} (attendu 1) — la base n'est pas dans l'état de la course.`);
    }
  }
  console.log('[fixtures] commitées (3 comptes, 3 profils) ; politique quota=1 confirmée.');

  // 3-5. Workers, ready, barrière, libération réelle.
  console.log('[course] démarrage des deux workers…');
  const wA = spawnWorker('A');
  const wB = spawnWorker('B');
  workers.push(wA, wB);

  for (const w of [wA, wB]) {
    w.send('BEGIN;');
    w.send(claimsFor(SYNTH.viewer));
    w.send(`SELECT 'WORKER_${w.label}_READY';`);
  }
  await wA.waitFor((l) => l === 'WORKER_A_READY', 'READY A');
  await wB.waitFor((l) => l === 'WORKER_B_READY', 'READY B');
  console.log('[barrière] les deux workers sont READY et bloqués sur leur stdin.');

  // Phase de confirmation : les deux passent BARRIER_ARMED, puis se re-bloquent.
  for (const w of [wA, wB]) w.send(`SELECT 'WORKER_${w.label}_ARMED';`);
  await wA.waitFor((l) => l === 'WORKER_A_ARMED', 'ARMED A');
  await wB.waitFor((l) => l === 'WORKER_B_ARMED', 'ARMED B');
  console.log('[barrière] armée — libération dans la même tick.');

  // 6. Deux claims vers DEUX cibles, envoyés simultanément.
  wA.send(`SELECT code FROM public.claim_synastry_free_grant('${SYNTH.targetA}');`);
  wB.send(`SELECT code FROM public.claim_synastry_free_grant('${SYNTH.targetB}');`);

  const CODES = ['allowed_free_new', 'allowed_free_existing', 'free_preview_used_other_target',
                 'allowed_paid', 'target_ineligible', 'preview_disabled',
                 'policy_unavailable', 'unauthorized'];
  const readCode = (w, timeoutMs = 20000) =>
    w.waitFor((l) => CODES.includes(l), 'code du claim', timeoutMs);

  // Le gagnant est CELUI QUI RÉPOND LE PREMIER — pas A par convention. Le
  // perdant reste bloqué sur le verrou d'index tant que le gagnant n'a pas
  // committé : c’est la course réelle.
  const codeP = { A: null, B: null };
  const aP = readCode(wA).then((c) => { codeP.A = c; });
  const bP = readCode(wB).then((c) => { codeP.B = c; });

  const winner = await new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = setInterval(() => {
      if (codeP.A !== null) { clearInterval(tick); resolve('A'); }
      else if (codeP.B !== null) { clearInterval(tick); resolve('B'); }
      else if (Date.now() - started > 20000) {
        clearInterval(tick); reject(new Error('aucun worker n’a répondu en 20 s'));
      }
    }, 15);
  });

  const loser = winner === 'A' ? 'B' : 'A';
  const wWin = winner === 'A' ? wA : wB;
  const wLose = winner === 'A' ? wB : wA;
  const winCode = codeP[winner];

  if (winCode !== 'allowed_free_new') {
    await (winner === 'A' ? bP : aP).catch(() => {});
    fail(`worker ${winner} a répondu ${winCode} (attendu allowed_free_new) — état de base inattendu.`);
  }

  // 7. Le premier résultat autorisé est committé.
  wWin.child.__endedOk = true;
  wWin.send('COMMIT;');
  console.log(`[7] worker ${winner} → ${winCode} ; COMMIT envoyé (libère le verrou d'index).`);

  // 8. Le second doit alors rendre free_preview_used_other_target.
  await (winner === 'A' ? bP : aP);
  wLose.child.__endedOk = true;
  wLose.send('COMMIT;');
  const loseCode = codeP[loser];
  console.log(`[8] worker ${loser} → ${loseCode} (après déblocage).`);

  if (loseCode !== 'free_preview_used_other_target') {
    fail(`le perdant a répondu ${loseCode} (attendu free_preview_used_other_target) : deux grants le même jour !`);
  }

  // 9. Contrôle final : exactement une ligne viewer/jour.
  const winTarget = winner === 'A' ? SYNTH.targetA : SYNTH.targetB;
  const row = psql(`SELECT target_user_id::text || ' ' || COUNT(*)
                    FROM public.synastry_free_grant
                   WHERE viewer_user_id = '${SYNTH.viewer}'
                     AND usage_date_utc = (NOW() AT TIME ZONE 'utc')::date
                   GROUP BY target_user_id;`);
  const [target, count] = row.split(' ');
  if (count !== '1' || target !== winTarget) {
    fail(`contrôle final : (${target}, ${count}) — attendu (${winTarget}, 1).`);
  }
  console.log(`[9] exactement une ligne viewer/jour, vers la cible du gagnant (${winner}) — OK`);

  console.log(`\n[course] un allowed_free_new (${winner}), un free_preview_used_other_target (${loser}),`);
  console.log('[course] une seule ligne viewer/jour — verdict atteint, nettoyage ci-dessous.');
}

// ── Orchestration : try / catch / finally — le nettoyage est INVITABLE ──────
let failure = null;
try {
  await runRace();
} catch (e) {
  failure = e;
}

const incidents = [];
try {
  await teardownWorkers();
} catch (e) {
  incidents.push(`workers non arrêtés : ${e.message}`);
}

// Nettoyage UNIQUEMENT si ce harnais a commité ses fixtures : une collision
// préexistante (ou un échec avant COMMIT) ne doit jamais déclencher un
// DELETE sur des lignes que cette exécution n’a pas créées.
let residue = null;
if (fixturesCommitted) {
  try {
    psqlScript(CLEANUP_SQL, 'nettoyage borné aux UUID synthétiques (possédés)');
  } catch (e) {
    incidents.push(`nettoyage échoué : ${e.message}`);
  }
  try {
    residue = psql(RESIDUE_SQL);
  } catch (e) {
    incidents.push(`résidu illisible : ${e.message}`);
  }
  if (residue !== null && residue !== '0') {
    incidents.push(`résidu synthétique = ${residue} (attendu 0)`);
  }
} else if (failure && /collision préexistante/i.test(failure.message)) {
  console.error(
    '[NETTOYAGE NON EXÉCUTÉ] collision préexistante détectée : ' +
    'les UUID synthétiques existaient AVANT ce test — aucune de ces lignes ' +
    'n’a été supprimée (elles ne sont pas à nous).',
  );
}

if (failure) {
  console.error(`\nRACE FAIL — ${failure.message}`);
}
for (const inc of incidents) {
  console.error(`[INCIDENT CRITIQUE DE NETTOYAGE] ${inc}`);
}
if (!failure && fixturesCommitted && incidents.length === 0 && residue === '0') {
  console.log('[11] zéro fixture synthétique résiduelle — OK');
  console.log('\nRACE PASS — la PK a arbitré sous concurrence réelle, base laissée propre.');
}
process.exitCode = (failure || incidents.length > 0) ? 1 : 0;
