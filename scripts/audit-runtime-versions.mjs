// JUNO-12 — inventaire de versions pour l'audit de dépendances.
// Deux volets, lecture seule, aucune mutation :
//   1. versions résolues dans le lockfile racine pour les packages
//      historiquement sensibles (next, next-intl, undici, sharp, ws…) ;
//   2. dernières versions publiées dans les plages compatibles (registre),
//      pour savoir jusqu'où une mise à jour en plage peut aller.
//
// Réévaluation : docs/runbooks/dependency-security-2026-09.md (JUNO-12).
// Usage : node scripts/audit-runtime-versions.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const watched = [
  "node_modules/next",
  "node_modules/next-intl",
  "node_modules/sharp",
  "node_modules/undici",
  "node_modules/ws",
  "node_modules/js-yaml",
  "node_modules/brace-expansion",
  "node_modules/postcss",
  "node_modules/next/node_modules/postcss",
  "node_modules/expo",
  "node_modules/@supabase/supabase-js",
  "node_modules/@anthropic-ai/sdk",
];
console.log("--- résolu dans le lockfile racine ---");
for (const p of watched) {
  const entry = lock.packages[p];
  console.log(`${p} = ${entry ? entry.version : "(absent)"}`);
}

// Toutes les copies d'un même package (déduplication à surveiller) :
const dupes = ["sharp", "undici", "ws", "js-yaml", "brace-expansion", "postcss"];
console.log("--- copies multiples ---");
for (const name of dupes) {
  for (const key of Object.keys(lock.packages)) {
    if (key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`)) {
      console.log(`${key} = ${lock.packages[key].version}`);
    }
  }
}

// Dernière version publiée dans chaque plage majeure suivie :
const ranges = [
  ["next", /^15\./],
  ["next-intl", /^4\./],
  ["ws", /^8\./],
  ["undici", /^6\./],
  ["js-yaml", /^4\./],
  ["brace-expansion", /^1\./],
  ["brace-expansion", /^2\./],
  ["brace-expansion", /^5\./],
  ["sharp", /^0\.35\./],
  ["@supabase/supabase-js", /^2\./],
];
console.log("--- dernières versions publiées dans la plage ---");
for (const [pkg, re] of ranges) {
  const out = execFileSync("npm.cmd", ["view", pkg, "versions", "--json"], {
    encoding: "utf8",
    shell: true,
  });
  const versions = JSON.parse(out).filter((v) => re.test(v) && !v.includes("-"));
  console.log(`${pkg} ${re} -> latest = ${versions[versions.length - 1]}`);
}
