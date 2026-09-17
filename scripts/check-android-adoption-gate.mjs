#!/usr/bin/env node
// =============================================================================
// Porte 2 — adoption Android : verdict mécanique depuis un export Play Console
// =============================================================================
//
// USAGE   node scripts/check-android-adoption-gate.mjs <export.csv> [--version-code 130] [--min-pct 95] [--days 7]
//
// LA RÈGLE (docs/runbooks/pwa-legacy-recovery-2026-09.md §6, Porte 2) :
// la bascule PUBLISH_LEGACY_DEGREES=false exige versionCode 130 (ou plus) sur
// ≥ 95 % des utilisateurs actifs QUOTIDIENS, pendant 7 JOURS CONSÉCUTIFS,
// preuve = export CSV Play Console daté (délai de données 24–48 h).
//
// CE QUE CE SCRIPT FAIT : parse l'export, agrège par (jour, version), calcule
// la part de la version cible par jour, cherche la meilleure fenêtre
// consécutive, et rend un verdict + la ligne prête à coller au runbook.
// CE QU'IL REFUSE : inventer, extrapoler, combler un trou — un jour absent
// du CSV casse la fenêtre ; des colonnes méconnaissables = échec explicite ;
// une fenêtre incomplète = NON CONFORME, jamais « presque ».
//
// FORMAT ATTENDU (Statistics → Active users → Daily, groupé par App version,
// export CSV) : colonnes Date + version d'app + utilisateurs, noms détectés
// souplement (FR/EN : Date, App version code, Utilisateurs quotidiens /
// Daily users / Active users…). BOM et séparateurs , / ; gérés.
//
// Exit 0 = CONFORME (fenêtre complète ≥ seuil). Exit 1 = NON CONFORME.
// Exit 2 = données inutilisables (colonnes introuvables, zéro jour parsé).
// =============================================================================

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const VERSION_CODE = String(opt('version-code', '130'));
const MIN_PCT = Number(opt('min-pct', '95'));
const DAYS = Number(opt('days', '7'));

if (!csvPath) {
  console.error('Usage: node scripts/check-android-adoption-gate.mjs <export.csv> [--version-code 130] [--min-pct 95] [--days 7]');
  process.exit(2);
}

// ── Parse CSV (guillemets, BOM, , ou ;) ──────────────────────────────────────
const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const sep = (raw.split('\n')[0].match(/;/g)?.length ?? 0) > (raw.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
const splitLine = (line) => {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === sep && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};
const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
if (lines.length < 2) { console.error('INUTILISABLE : moins de deux lignes.'); process.exit(2); }
const header = splitLine(lines[0]).map((h) => h.toLowerCase());

// ── Détection des colonnes (souple FR/EN, fail-closed) ──────────────────────
const findCol = (patterns, what) => {
  const i = header.findIndex((h) => patterns.some((p) => p.test(h)));
  if (i < 0) { console.error(`INUTILISABLE : colonne « ${what} » introuvable. En-têtes lus : ${header.join(' | ')}`); process.exit(2); }
  return i;
};
const dateCol = findCol([/^date/, /date$/], 'Date');
const versionCol = findCol([/version\s*code/, /app\s*version/, /^version/], 'Version d\'app (code)');
const usersCol = findCol([/user/, /utilisateur/, /install/], 'Utilisateurs actifs');

// ── Agrégation par (jour, version) ───────────────────────────────────────────
const parseUsers = (v) => {
  const n = Number(String(v).replace(/[,\s%]/g, '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
};
const days = new Map(); // 'YYYY-MM-DD' -> Map(version -> users)
let rows = 0;
for (const line of lines.slice(1)) {
  const cells = splitLine(line);
  const dateRaw = cells[dateCol] ?? '';
  const ver = (cells[versionCol] ?? '').trim();
  const users = parseUsers(cells[usersCol]);
  // Normaliser la date en YYYY-MM-DD (Play exporte parfois MM/DD/YYYY ou YYYY-MM-DD).
  const iso = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let key = null;
  if (iso) key = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (us) key = `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  if (!key || !ver || !Number.isFinite(users) || users < 0) continue; // ligne non-datée/invalide : ignorée SANS invention
  rows += 1;
  if (!days.has(key)) days.set(key, new Map());
  const byVer = days.get(key);
  byVer.set(ver, (byVer.get(ver) ?? 0) + users);
}
if (rows === 0) { console.error('INUTILISABLE : aucune ligne (date, version, utilisateurs) exploitable.'); process.exit(2); }

// ── Part de la version cible par jour ────────────────────────────────────────
// « versionCode 130 ou plus » : la cible est le code NUMÉRIQUE ≥ 130 ; une
// ligne « 2.1.1 (130) » est acceptée via extraction du code entre parenthèses
// ou du premier nombre ≥ 100. Tout le reste compte comme « autres versions ».
const targetUsers = (ver) => {
  const inParens = ver.match(/\((\d+)\)/);
  if (inParens) return Number(inParens[1]) >= Number(VERSION_CODE);
  const code = ver.match(/\d{2,4}/);
  return code ? Number(code[0]) >= Number(VERSION_CODE) : false;
};
const perDay = [...days.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, byVer]) => {
    let total = 0, target = 0;
    for (const [ver, users] of byVer) {
      total += users;
      if (targetUsers(ver)) target += users;
    }
    return { date, total, target, pct: total > 0 ? (100 * target) / total : null };
  });

console.log(`Export : ${csvPath}`);
console.log(`Cible : versionCode ≥ ${VERSION_CODE} · seuil ≥ ${MIN_PCT} % · ${DAYS} jours consécutifs\n`);
console.log('jour        | actifs | cible  | part');
for (const d of perDay) {
  console.log(`${d.date} | ${String(d.total).padStart(6)} | ${String(d.target).padStart(6)} | ${d.pct === null ? '  n/a' : d.pct.toFixed(1).padStart(5) + ' %'}`);
}

// ── Meilleure fenêtre consécutive de JOURS jours ─────────────────────────────
const consecutive = (a, b) => {
  const da = new Date(a + 'T00:00:00Z'), db = new Date(b + 'T00:00:00Z');
  return (db - da) / 86400000 === 1;
};
let best = null;
for (let i = 0; i + DAYS <= perDay.length; i++) {
  const window = perDay.slice(i, i + DAYS);
  const isConsecutive = window.every((d, j) => j === 0 || consecutive(window[j - 1].date, d.date));
  if (!isConsecutive) continue;
  const ok = window.every((d) => d.pct !== null && d.pct >= MIN_PCT);
  const minPct = Math.min(...window.map((d) => d.pct ?? -1));
  if (!best || (ok && !best.ok) || (ok === best.ok && minPct > best.minPct)) {
    best = { start: window[0].date, end: window[DAYS - 1].date, ok, minPct };
  }
}

if (!best) {
  console.log(`\nNON CONFORME : aucune fenêtre de ${DAYS} jours consécutifs complète dans l'export.`);
  console.log('La Porte 2 reste NON FAITE — ne pas dater, ne pas basculer.');
  process.exit(1);
}
if (!best.ok) {
  console.log(`\nNON CONFORME : meilleure fenêtre ${best.start} → ${best.end} tombe à ${best.minPct.toFixed(1)} % (min ${MIN_PCT} % requis).`);
  console.log('La Porte 2 reste NON FAITE — ne pas dater, ne pas basculer.');
  process.exit(1);
}
console.log(`\nCONFORME : fenêtre ${best.start} → ${best.end}, minimum observé ${best.minPct.toFixed(1)} % (≥ ${MIN_PCT} %).`);
console.log('\nLigne prête pour le runbook (à accompagner de la référence du CSV) :');
console.log(`- **Porte 2 — adoption Android ≥ 95 % pendant 7 jours consécutifs : FAITE le ${new Date().toISOString().slice(0, 10)}** (fenêtre ${best.start} → ${best.end}, minimum ${best.minPct.toFixed(1)} %, export Play Console « ${csvPath} »).`);
process.exit(0);
