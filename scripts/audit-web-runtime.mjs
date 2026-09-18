// JUNO-18 — audit runtime WEB, déterministe, à baseline bornée.
//
// POURQUOI ce script existe : la CI ne peut pas lancer `npm audit
// --audit-level=high` à la racine — la chaîne Expo SDK 54 (chantier majeur
// séparé, runbook dependency-security §6.2) ferait rouge chaque run sans
// information nouvelle. La surface PUBLIÉE et corrigée, c'est le web (next,
// next-intl, sharp… : JUNO-12 fermé). Ce script n'audite QUE @astro/web en
// runtime (--omit=dev), parse le JSON (jamais le texte), et applique une
// baseline VERSIONNÉE (scripts/audit-web-runtime-baseline.json) dont les
// exceptions ne peuvent ni s'élargir ni périmer en silence :
//
//   FAIL sur  tout advisory high/critical non listé            (nouveau)
//           tout advisory listé qui a disparu                  (entrée périmée → retirer)
//           toute différence de version sur un nœud accepté    (réévaluation obligatoire)
//           tout ensemble d'advisories différent sur un nœud   (élargissement/rétrécissement)
//           toute échéance (deadline) dépassée                 (escalation)
//
// L'identité d'une exception = package + nœud EXACT dans l'arbre + sévérité :
// accepter "postcss" n'accepte jamais qu'un postcss hoisté ailleurs.
//
// Usage: node scripts/audit-web-runtime.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = JSON.parse(
  readFileSync(path.join(ROOT, "scripts", "audit-web-runtime-baseline.json"), "utf8"),
);
const GATE = ["high", "critical"];

function runAudit() {
  // npm audit sort en non-zéro dès qu'UNE vulnérabilité existe (même
  // moderate) : c'est du reporting npm, pas le verdict — on récupère stdout
  // depuis l'erreur et on décide nous-mêmes. Commande en chaîne unique :
  // rien n'y est interpolé.
  let out;
  try {
    out = execFileSync(
      "npm audit --omit=dev --workspace=@astro/web --json",
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: true, cwd: ROOT },
    );
  } catch (err) {
    out = err.stdout ?? "";
    if (!out.includes('"metadata"')) throw err; // vraie panne réseau/parsing
  }
  const report = JSON.parse(out);
  if (!report?.metadata) throw new Error("sortie npm audit inattendue (pas de metadata)");
  return report;
}

function lockVersion(nodePath) {
  const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  return lock.packages[nodePath]?.version ?? "(absent du lockfile)";
}

const report = runAudit();
const offenders = Object.entries(report.vulnerabilities ?? {})
  .filter(([, v]) => GATE.includes(v.severity))
  .map(([name, v]) => {
    const ids = (v.via ?? [])
      .filter((x) => typeof x === "object" && x.url)
      .map((x) => (x.url.match(/GHSA-[a-z0-9-]+/i) ?? [])[0])
      .filter(Boolean)
      .sort();
    const node = (v.nodes ?? [])[0] ?? "(nœud inconnu)";
    return { name, severity: v.severity, node, ids, range: v.range };
  });

const errors = [];
const today = new Date().toISOString().slice(0, 10);
const accepted = new Set();

for (const o of offenders) {
  const entry = BASELINE.entries.find(
    (e) => e.package === o.name && e.severity === o.severity && e.node === o.node,
  );
  if (!entry) {
    errors.push(
      `NOUVEAU advisory high/critical non couvert par la baseline : ${o.name} [${o.severity}] au nœud ${o.node} (${o.range}) — ${o.ids.join(", ") || "advisories sans GHSA"}`,
    );
    continue;
  }
  const want = [...entry.advisories].sort();
  const sameIds =
    want.length === o.ids.length && want.every((id, i) => id === o.ids[i]);
  if (!sameIds) {
    const added = o.ids.filter((id) => !want.includes(id));
    const removed = want.filter((id) => !o.ids.includes(id));
    errors.push(
      `${o.name} (${o.node}) : ensemble d'advisories différent de la baseline — ${
        added.length ? `ajout(s) ${added.join(", ")}` : ""
      }${added.length && removed.length ? " ; " : ""}${
        removed.length ? `retrait(s) ${removed.join(", ")}` : ""
      }. Aucune dérive silencieuse : mettre la baseline à jour avec justification.`,
    );
  }
  const version = lockVersion(o.node);
  if (version !== entry.version) {
    errors.push(
      `${o.name} (${o.node}) : version installée ${version} ≠ baseline ${entry.version} — l'exception doit être réévaluée (bump de dépendance), pas reconduite.`,
    );
  }
  if (today > entry.deadline) {
    errors.push(
      `${o.name} (${o.node}) : échéance de la baseline dépassée (${entry.deadline}) — corriger ou re-justifier avec une nouvelle échéance.`,
    );
  }
  accepted.add(entry);
}

for (const entry of BASELINE.entries) {
  if (!accepted.has(entry)) {
    errors.push(
      `Entrée de baseline PÉRIMÉE : ${entry.package} (${entry.node}) — l'advisory n'apparaît plus dans l'audit web. Retirer l'entrée (le script refuse de porter des exceptions mortes).`,
    );
  }
}

const m = report.metadata.vulnerabilities;
console.log(
  `audit-web-runtime: total=${m.total} (low=${m.low} moderate=${m.moderate} high=${m.high} critical=${m.critical}) — porte=high/critical, baseline=${BASELINE.entries.length} entrée(s)`,
);

if (errors.length) {
  console.error(`\naudit-web-runtime: ${errors.length} problème(s) :`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

for (const entry of BASELINE.entries) {
  console.log(`  accepté: ${entry.package}@${entry.version} (${entry.node}) jusqu'au ${entry.deadline}`);
}
console.log("audit-web-runtime: web propre au sens de la baseline (aucun advisory high/critical non couvert).");
