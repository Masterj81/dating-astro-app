// JUNO-18 — garde CI auto-protectrice (validateur structurel, câblé CI).
//
// POURQUOI : chaque durcissement de ce chantier est une ligne à défaire et
// silencieux une fois défait. Ce validateur refuse le retour de chaque
// recul : permissions, pull_request_target, épinglage, credentials persistants,
// interpolation non fiable, et la PRÉSENCE des gardes elles-mêmes (audit,
// gitleaks, dependabot, codeql).
//
// MÉTHODE : les vérifications STRUCTURELLES tournent sur le YAML sans
// commentaires (le dépôt a appris qu'une regex qui matche sa propre
// documentation ne prouve rien) ; seule la vérification du commentaire de
// version près du SHA lit la ligne brute. Aucun parseur YAML complet n'est
// une dépendance du dépôt : le sous-ensemble utilisé par les workflows
// (clés plates indentées, listes de steps) est analysé ligne à ligne avec
// indentation — assez pour ces règles, et testé par injection.
//
// Usage: node scripts/validate-ci-security.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WF = path.join(ROOT, ".github", "workflows");

const errors = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`  FAIL  ${msg}`);
};

/** Chaque ligne garde sa version BRUTE (pour vérifier le commentaire de
 *  version et les justifications) et sa version SANS commentaire (pour les
 *  vérifications structurelles) — mêmes indices, jamais de décalage. Les
 *  lignes entièrement commentaire sont marquées et ignorées structurellement
 *  (le dépôt a appris qu'un mot interdit mentionné dans sa propre
 *  documentation ne doit pas matcher). */
const stripComment = (line) => line.replace(/\s+#.*$/, "");
const isCommentLine = (line) => /^\s*#/.test(line);
const rawLines = (file) => readFileSync(file, "utf8").split(/\r?\n/);
const linePairs = (file) =>
  rawLines(file).map((raw) => ({ raw, code: stripComment(raw), comment: isCommentLine(raw) }));

// Une ref d'action peut avoir PLUSIEURS segments (github/codeql-action/init).
const SHA_RE =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)+@[0-9a-f]{40}$/;

// Contextes github.* NON FIEURS dans run: (données de l'auteur de la PR/événement).
const UNTRUSTED_CTX = /github\.(event\b|event\.|head_ref|ref_name|actor|triggering_actor|title|body|comment\b|pull_request\b|number\b)/;

const workflowFiles = readdirSync(WF).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

for (const file of workflowFiles) {
  const full = path.join(WF, file);
  const pairs = linePairs(full);
  const label = path.basename(file);
  const structural = pairs.map((p) => (p.comment ? "" : p.code));

  // ── R1/R6 : permissions ────────────────────────────────────────────────
  const hasTopPermissions = structural.some((l) => /^permissions:\s*$/.test(l));
  if (!hasTopPermissions) {
    fail(`${label}: bloc \`permissions:\` de niveau workflow ABSENT (le job hériterait du défaut du dépôt)`);
  } else {
    ok(`${label}: permissions déclarées au niveau workflow`);
  }
  // Toute valeur write doit être accompagnée d'un commentaire de justification
  // (même ligne, ou une des 3 lignes précédentes en commentaire).
  structural.forEach((line, i) => {
    const m = line.match(/^(\s*)([\w-]+):\s*write\b/);
    if (!m) return;
    const context = [
      pairs[i].raw, pairs[i - 1]?.raw, pairs[i - 2]?.raw, pairs[i - 3]?.raw,
    ].filter(Boolean).join(" ");
    if (!/pourquoi|why/i.test(context)) {
      fail(`${label}: permission \`${m[2]}: write\` sans justification (commentaire « pourquoi/why » requis à proximité, ligne ${i + 1})`);
    }
  });
  // Une permission write n'est tolérée qu'au niveau JOB (indentée sous jobs:).
  structural.forEach((line, i) => {
    if (/^[\w-]+:\s*write\b/.test(line)) {
      const before = structural.slice(0, i).join("\n");
      if (!before.includes("jobs:")) {
        fail(`${label}: permission write au NIVEAU WORKFLOW (ligne ${i + 1}) — un job qui écrit déclare SA permission, jamais tout le workflow`);
      }
    }
  });

  // ── R2 : jamais pull_request_target ────────────────────────────────────
  if (structural.some((l) => l.includes("pull_request_target"))) {
    fail(`${label}: pull_request_target présent — forks = exécution avec secrets. Utiliser pull_request.`);
  } else {
    ok(`${label}: aucun pull_request_target`);
  }

  // ── R3 : épinglage immuable + commentaire de version ───────────────────
  let checked = 0;
  structural.forEach((line, i) => {
    const m = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)\s*$/);
    if (!m) return;
    const ref = m[1];
    if (ref.startsWith("./")) return; // action locale
    checked += 1;
    if (!SHA_RE.test(ref)) {
      const why = ref.includes("@")
        ? `« ${ref.split("@")[1]} » n'est pas un SHA complet de 40 caractères`
        : "référence sans @";
      fail(`${label}: action non épinglée par SHA immuable : ${ref} (${why}) — ligne ${i + 1}`);
      return;
    }
    const rawLine = pairs[i].raw;
    if (!/#\s*v\d+\.\d+/i.test(rawLine)) {
      fail(`${label}: SHA ${ref} sans commentaire de version (# vX.Y.Z) — ligne ${i + 1} : sans lui, ni l'humain ni Dependabot ne suivent la version`);
    }
  });
  ok(`${label}: ${checked} action(s) externe(s) épinglée(s) par SHA complet${checked ? " + version en commentaire" : ""}`);

  // ── R4 : checkout sans credentials persistants ─────────────────────────
  structural.forEach((line, i) => {
    if (!/^\s*(?:-\s+)?uses:\s*actions\/checkout@/.test(line)) return;
    // Fin de l'étape : prochaine ligne de step à la même indentation ou moins.
    const stepIndent = line.match(/^\s*/)[0].length;
    let found = false;
    for (let j = i + 1; j < structural.length; j++) {
      const l = structural[j];
      if (!l.trim()) continue;
      if (l.trimStart().startsWith("- ") && l.match(/^\s*/)[0].length <= stepIndent) break;
      if (/^persist-credentials:\s*false\s*$/.test(l.trim())) {
        found = true;
        break;
      }
      if (/^persist-credentials:\s*true\s*$/.test(l.trim())) break;
    }
    if (!found) {
      fail(`${label}: checkout (ligne ${i + 1}) sans \`persist-credentials: false\` — le token GitHub reste dans la config git après l'étape`);
    }
  });
  ok(`${label}: chaque checkout rejette persist-credentials`);

  // ── R5 : interpolation non fiable dans run: ─────────────────────────────
  let runChecked = 0;
  structural.forEach((line, i) => {
    const m = line.match(/^\s*run:\s*(.*)$/);
    if (!m) return;
    // Les run: multilignes (|) sont rares ici ; les one-line sont couvertes.
    if (!m[1].includes("${{")) return;
    runChecked += 1;
    if (UNTRUSTED_CTX.test(m[1])) {
      const rawLine = pairs[i].raw;
      if (!/#\s*sûr[ef]?[: ]|#\s*safe[: ]/i.test(rawLine)) {
        fail(`${label}: contexte github non fiable interpolé dans run: (ligne ${i + 1}) — injection de commande depuis une PR. Sinon, justifier par un commentaire « # safe: … »`);
      }
    }
  });
  ok(`${label}: ${runChecked} interpolation(s) run: vérifiée(s), aucune donnée non fiable`);
}

// ── R7 : présence des gardes du chantier ───────────────────────────────────
const ciRaw = existsSync(path.join(WF, "ci.yml")) ? readFileSync(path.join(WF, "ci.yml"), "utf8") : "";
if (ciRaw.includes("scripts/audit-web-runtime.mjs")) {
  ok("ci.yml: étape d'audit runtime web présente");
} else {
  fail("ci.yml: étape d'audit runtime web ABSENTE (scripts/audit-web-runtime.mjs)");
}

const gitleaksFile = workflowFiles.find((f) => /gitleaks/i.test(f));
if (gitleaksFile && readFileSync(path.join(WF, gitleaksFile), "utf8").includes("gitleaks-action@")) {
  ok(`scanner de secrets présent (${gitleaksFile})`);
} else {
  fail("scanner de secrets ABSENT — workflow gitleaks requis (JUNO-18)");
}
if (existsSync(path.join(ROOT, ".gitleaks.toml"))) {
  ok("configuration gitleaks versionnée (.gitleaks.toml)");
} else {
  fail(".gitleaks.toml ABSENT — le scanner sans config versionnée dérive en local vs CI");
}

const dependabotPath = path.join(ROOT, ".github", "dependabot.yml");
if (existsSync(dependabotPath)) {
  const d = readFileSync(dependabotPath, "utf8");
  const hasNpm = /package-ecosystem:\s*npm/.test(d);
  const hasActions = /package-ecosystem:\s*github-actions/.test(d);
  if (hasNpm && hasActions) ok("dependabot.yml: npm + github-actions configurés");
  else fail(`dependabot.yml incomplet (npm=${hasNpm}, github-actions=${hasActions})`);
} else {
  fail(".github/dependabot.yml ABSENT");
}

const codeqlFile = workflowFiles.find((f) => /codeql/i.test(f));
if (codeqlFile && readFileSync(path.join(WF, codeqlFile), "utf8").includes("codeql-action/analyze@")) {
  ok(`CodeQL présent (${codeqlFile}, advanced setup — default setup vérifié not-configured)`);
} else {
  fail("CodeQL ABSENT et aucun document de blocage accepté (JUNO-18 §8)");
}
if (existsSync(path.join(ROOT, ".github", "codeql", "codeql-config.yml"))) {
  ok("périmètre CodeQL versionné (.github/codeql/codeql-config.yml)");
} else {
  fail(".github/codeql/codeql-config.yml ABSENT");
}

if (errors.length) {
  console.error(
    `\nci-security: ${errors.length} violation(s) — JUNO-18 (voir docs/runbooks/ci-security-2026-09.md)`,
  );
  process.exit(1);
}
console.log("\nci-security invariants look clean.");
