// Validate the PWA kill-switch contract (mission 17 sept 2026 — JUNO-16).
//
// WHY THIS EXISTS
// ---------------
// Le plan PWA (docs/product/PWA-IMPROVEMENT-PLAN-2026-09.md §3/10.4) garde
// ouvert JUNO-16 : « une PWA installée avant le dernier déploiement récupère-
// t-elle la version courante ? ». La preuve comportementale vit dans
// scripts/pwa-legacy-recovery.mjs (Playwright, exécutée : 15/15). Ce
// validateur garde les INVARIANTS STRUCTURELS qui rendent cette preuve
// durable — chacun est une ligne à défaire et silencieux une fois défait :
//
//   1. le kill-switch fait exactement son office (skipWaiting, purge TOTALE
//      des caches, unregister, reload des clients, fetch pass-through sans
//      respondWith — jamais de cache) ;
//   2. l'app N'ENREGISTRE AUCUN service worker (c'est le design : le
//      kill-switch n'est repris que par l'update check des anciennes
//      registrations — une inscription côté app recréerait la boucle) ;
//   3. vercel.json sert le worker ET le manifeste en no-cache/must-revalidate
//      (la spec protège le script SW ; RIEN ne protège le manifeste) ;
//   4. le manifeste est celui de JUNO (id/start_url/scope, maskable séparé,
//      aucun résidu AstroDating) ;
//   5. PUBLISH_LEGACY_DEGREES ne peut pas être basculé à false sans les deux
//      preuves datées dans le runbook PWA (porte 1 : A→B prouvé ; porte 2 :
//      adoption Android ≥ 95 % × 7 jours) ;
//   6. le harnais comportemental existe, lit le kill-switch RÉEL du dépôt et
//      couvre session/multi-onglets/offline/résidus.
//
// Exits 1 on drift. Wired as `npm run validate:pwa-kill-switch`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const issues = [];
const check = (ok, label) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) issues.push(label);
};

console.log("PWA kill-switch contract");

// ── 1. Le kill-switch ────────────────────────────────────────────────────────
const SW = "apps/web/public/service-worker.js";
check(exists(SW), "apps/web/public/service-worker.js présent");
if (exists(SW)) {
  const sw = read(SW);
  check(sw.includes("skipWaiting"), "kill-switch : skipWaiting (reprise immédiate)");
  check(/caches\.keys\(\)[\s\S]*caches\.delete\(name\)/.test(sw), "kill-switch : purge de TOUS les caches");
  check(sw.includes("registration.unregister"), "kill-switch : auto-désenregistrement");
  check(/clients\.matchAll[\s\S]*client\.navigate\(client\.url\)/.test(sw), "kill-switch : reload forcé des clients");
  // Pass-through : le fetch handler existe mais ne répond JAMAIS lui-même.
  const fetchAt = sw.indexOf('addEventListener("fetch"');
  const fetchBlock = sw.slice(fetchAt, sw.indexOf("});", fetchAt));
  check(fetchAt > 0 && !fetchBlock.includes("respondWith"), "kill-switch : fetch pass-through, aucun respondWith");
  check(!/caches\.(open|put|match|add)/.test(sw.replace(/caches\.keys|caches\.delete/g, "")), "kill-switch : aucune écriture/lecture de cache");
  check(!sw.includes("cache.addAll"), "kill-switch : aucun addAll fragile");
}

// ── 2. L'app n'enregistre AUCUN service worker ──────────────────────────────
let registrations = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) {
      const src = fs.readFileSync(full, "utf8");
      if (/navigator\.serviceWorker|serviceWorker\.register/.test(src)) registrations.push(full);
    }
  }
}
walk(path.join(ROOT, "apps/web/src"));
check(registrations.length === 0, `apps/web/src n'enregistre aucun SW (${registrations.length} occurrence(s)${registrations.length ? " : " + registrations.join(", ") : ""})`);

// ── 3. En-têtes Vercel : worker et manifeste jamais périmés ─────────────────
if (exists("vercel.json")) {
  const vercel = JSON.parse(read("vercel.json"));
  const headers = vercel.headers ?? [];
  const swHeader = headers.find((h) => h.source === "/service-worker.js");
  const mfHeader = headers.find((h) => h.source === "/manifest.json");
  check(!!swHeader && swHeader.headers.some((x) => /max-age=0/.test(x.value) && /must-revalidate/.test(x.value)),
    "vercel.json : /service-worker.js servi en max-age=0, must-revalidate");
  check(!!mfHeader && mfHeader.headers.some((x) => /max-age=0/.test(x.value) && /must-revalidate/.test(x.value)),
    "vercel.json : /manifest.json servi en max-age=0, must-revalidate");
} else {
  check(false, "vercel.json absent");
}

// ── 4. Le manifeste est JUNO, sans résidu AstroDating ───────────────────────
const MF = "apps/web/public/manifest.json";
check(exists(MF), "manifest.json présent");
if (exists(MF)) {
  const mf = read(MF);
  const json = JSON.parse(mf);
  check(json.id === "/", "manifeste : id / (identité stable de l'installation)");
  check(json.start_url === "/app/", "manifeste : start_url /app/");
  check(json.scope === "/", "manifeste : scope /");
  check(!/astrodating/i.test(mf), "manifeste : aucun résidu AstroDating");
  const maskable = (json.icons ?? []).filter((i) => (i.purpose ?? "").includes("maskable"));
  check(maskable.length >= 2 && maskable.every((i) => /maskable/.test(i.src)),
    "manifeste : icônes maskable dédiées (asset séparé)");
}

// ── 5. PUBLISH_LEGACY_DEGREES ne bascule pas sans ses deux preuves ──────────
const EDGE = "supabase/functions/get-profile-chart/index.ts";
const RUNBOOK = "docs/runbooks/pwa-legacy-recovery-2026-09.md";
if (exists(EDGE)) {
  const edge = read(EDGE);
  const m = edge.match(/PUBLISH_LEGACY_DEGREES\s*=\s*(true|false)/);
  check(!!m, "PUBLISH_LEGACY_DEGREES trouvé dans l'edge");
  if (m) {
    const runbook = exists(RUNBOOK) ? read(RUNBOOK) : "";
    check(runbook.includes("Porte 1") && runbook.includes("Porte 2"),
      "runbook PWA : les deux portes de bascule documentées");
    if (m[1] === "false") {
      // Bascule effective : exiger les DEUX preuves datées. Le marqueur est
      // « FAITE le AAAA-MM-JJ » — « NON FAITE » ne peut pas faux-vertir.
      const porte1 = /Porte 1[^\n]*FAITE le \d{4}-\d{2}-\d{2}/.test(runbook);
      const porte2 = /Porte 2[^\n]*FAITE le \d{4}-\d{2}-\d{2}/.test(runbook);
      check(porte1 && porte2, "PUBLISH_LEGACY_DEGREES=false : portes 1 ET 2 prouvées et datées au runbook");
    } else {
      check(true, "PUBLISH_LEGACY_DEGREES=true (mode compatibilité maintenu — bascule aux portes uniquement)");
    }
  }
} else {
  check(false, `edge introuvable : ${EDGE}`);
}

// ── 6. Le harnais comportemental existe et couvre le contrat ────────────────
const HARNESS = "scripts/pwa-legacy-recovery.mjs";
check(exists(HARNESS), "harnais comportemental présent (scripts/pwa-legacy-recovery.mjs)");
if (exists(HARNESS)) {
  const h = read(HARNESS);
  check(h.includes("apps/web/public/service-worker.js"), "harnais : teste le kill-switch RÉEL du dépôt (lu au runtime)");
  check(h.includes("astrodating-v1"), "harnais : simule le VRAI ancien SW (cache astrodating-v1)");
  check(/setOffline\(true\)/.test(h) && /setOffline\(false\)/.test(h), "harnais : couvre hors ligne puis retour en ligne");
  check(h.includes("juno-session-synthetic"), "harnais : prouve la conservation de session");
  check(/tab1/.test(h) && /tab2/.test(h), "harnais : couvre le multi-onglets");
  check(/getRegistrations\(\)\)?\.length/.test(h) && /caches\.keys\(\)\)?\.length/.test(h), "harnais : exige zéro registration et zéro cache résiduels");
}

if (issues.length) {
  console.error(`\nPWA kill-switch contract: ${issues.length} problème(s).`);
  process.exit(1);
}
console.log("\nPWA kill-switch contract: everything agrees.");
