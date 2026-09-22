// JUNO-05/JUNO-13 — structural guard for the web session + CSP contract
// (repo gate, CI-runnable).
//
// WHY: every property this chantier bought is one line to undo and silent
// when undone. This validator refuses the regressions:
//   R1 browser client uses @supabase/ssr createBrowserClient (never bare
//      supabase-js createClient — that one defaults to localStorage);
//   R2 no token-shaped localStorage OUTSIDE the legacy-cleanup function;
//   R3 cookie contract: Secure(prod)/SameSite=Lax/Path=//__Host-(prod);
//   R4 legacy cleanup exists, is called at client construction, and only
//      ever REMOVES keys (no read/copy of token values);
//   R5 middleware: server client + getUser (refresh) + per-request nonce
//      (crypto.randomUUID) + Report-Only on app paths, request CSP carried;
//   R6 app subtree is force-dynamic (the nonce gate decision), marketing
//      layouts are NOT;
//   R7 enforcement CSP keeps the full confinement set (Turnstile trio,
//      frame-ancestors 'none', worker-src 'self', object-src 'none',
//      base-uri 'self', form-action 'self') and gains COOP/CORP — source of
//      truth: src/lib/csp-static.ts (header for marketing via middleware,
//      document meta for /app);
//   R10 the /app layout renders CspEnforcementMeta — the enforced policy
//      never disappears from the subtree;
//   R11 NO response Content-Security-Policy may exist for /app (middleware
//      app branch, vercel.json, next.config) — any one folds into the
//      render's request on Vercel and kills the nonce (proven 2026-09-22);
//   R12 the meta policy is DERIVED from ENFORCEMENT_CSP minus
//      frame-ancestors (spec-ignored in meta; X-Frame-Options DENY covers);
//   R13 X-Frame-Options DENY stays in next.config (frame-ancestors' stand-in
//      for /app);
//   R8 the app nonce policy contains NO 'unsafe-inline' in script-src(e);
//   R9 no API route uses a server Supabase client without the origin guard
//      (no accidental cookie-auth mutation surface).
//
// Discriminant by construction — canaries run during development (see
// runbook): removing any guarded element fails this script.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

const errors = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`  FAIL  ${msg}`);
};

// ── R1/R2/R3/R4 — the browser client ───────────────────────────────────────
const browserLib = read("apps/web/src/lib/supabase-browser.ts");
if (/from "@supabase\/ssr"/.test(browserLib) && /createBrowserClient/.test(browserLib)) {
  ok("client navigateur = createBrowserClient (@supabase/ssr)");
} else {
  fail("supabase-browser.ts n'utilise pas createBrowserClient de @supabase/ssr");
}
if (/from "@supabase\/supabase-js"/.test(browserLib) && /createClient\(/.test(browserLib)) {
  fail("supabase-browser.ts réimporte createClient de supabase-js (retour localStorage)");
} else {
  ok("aucun createClient supabase-js nu dans le client navigateur");
}

const cookieBlock = browserLib.match(/buildCookieOptions\(\)[^{]*\{[\s\S]*?\n\}/)?.[0] ?? "";
if (/sameSite:\s*"lax"/.test(cookieBlock)) ok("cookie SameSite=Lax");
else fail("SameSite ≠ lax dans buildCookieOptions");
if (/path:\s*"\/"/.test(cookieBlock)) ok("cookie Path=/");
else fail("Path ≠ / dans buildCookieOptions");
if (/isProd \? "__Host-/.test(cookieBlock)) ok("préfixe __Host- en production");
else fail("préfixe __Host- absent de la branche production");
if (/secure:\s*isProd/.test(cookieBlock)) ok("Secure lié à la production (dev localhost exclu)");
else fail("Secure non conditionné par isProd");

// R2: localStorage mentions must live ONLY inside the cleanup function.
const cleanupStart = browserLib.indexOf("export function clearLegacySupabaseLocalStorage");
const cleanupEnd = cleanupStart >= 0 ? browserLib.indexOf("\n}", cleanupStart) : -1;
const before = cleanupStart >= 0 ? browserLib.slice(0, cleanupStart) : browserLib;
const after = cleanupEnd >= 0 ? browserLib.slice(cleanupEnd) : "";
const outside = before + after;
if (/localStorage\.(setItem|getItem)/.test(outside)) {
  fail("écriture/lecture localStorage HORS de la purge legacy (retour de stockage jetons)");
} else {
  ok("aucune lecture/écriture localStorage hors purge legacy");
}
if (cleanupStart >= 0 && /removeItem/.test(browserLib.slice(cleanupStart, cleanupEnd))) {
  ok("purge legacy : removeItem uniquement (aucune valeur de jeton copiée)");
} else {
  fail("purge legacy absente ou ne retire pas les clés");
}
if (/clearLegacySupabaseLocalStorage\(\);/.test(browserLib)) {
  ok("purge legacy appelée à la construction du client");
} else {
  fail("purge legacy non appelée à la construction");
}

// ── R5 — middleware ─────────────────────────────────────────────────────────
const middleware = read("apps/web/src/middleware.ts");
for (const [needle, label] of [
  [/createServerClient/, "client serveur @supabase/ssr (rafraîchissement)"],
  [/supabase\.auth\.getUser\(\)/, "getUser() (déclenche le refresh)"],
  [/crypto\.randomUUID\(\)/, "nonce crypto par requête"],
  [/Content-Security-Policy-Report-Only/, "header Report-Only (phase observation)"],
  [/requestHeaders\.set\("Content-Security-Policy"/, "CSP de requête porteuse du nonce"],
  [/isAppPath\(pathname\)/, "périmètre app via isAppPath"],
]) {
  needle.test(middleware) ? ok(`middleware: ${label}`) : fail(`middleware SANS ${label}`);
}
if (/request\.cookies\.set/.test(middleware) && /response\.cookies\.set/.test(middleware)) {
  ok("setAll écrit sur requête ET réponse (sans écraser les autres cookies)");
} else {
  fail("middleware: propagation cookies setAll incomplète");
}

// ── R6 — rendering split ────────────────────────────────────────────────────
const appLayout = "apps/web/src/app/[locale]/app/layout.tsx";
if (existsSync(path.join(ROOT, appLayout))) {
  const layout = read(appLayout);
  /dynamic\s*=\s*"force-dynamic"/.test(layout)
    ? ok("[locale]/app/layout.tsx force-dynamic (décision de la porte nonce)")
    : fail("app/layout.tsx sans force-dynamic — le nonce ne peut pas s'appliquer");
} else {
  fail("app/layout.tsx ABSENT — le sous-arbre /app resterait statique");
}
// R6b — CAUSE RACINE du défaut Vercel (bd61436) : generateStaticParams du
// layout [locale] prérend /app/** et Vercel sert ce prérendu SANS ré-exécuter
// le rendu → aucun nonce injecté (0/16 scripts). Portée vérifiée le 21 sept
// (31 routes du sous-arbre) : le layout `headers()` couvre TOUT /app/** sur
// un build propre ; page.tsx (double garde) et revalidate=0 sont exigés
// aussi — le périmètre Report-Only entier doit être dynamique.
const appLayoutContent = read(appLayout);
const layoutHasHeaders = /await headers\(\)/.test(appLayoutContent);
const layoutHasDynamic = /force-dynamic/.test(appLayoutContent);
if (layoutHasHeaders && layoutHasDynamic) {
  ok("[locale]/app/layout.tsx headers() + force-dynamic (couvre TOUT le sous-arbre)");
} else {
  fail(
    "[locale]/app/layout.tsx SANS headers() ET force-dynamic tous deux présents" +
      ` (headers:${layoutHasHeaders} dynamic:${layoutHasDynamic}) — Vercel servira des prérendus sans nonce sur une partie du sous-arbre`,
  );
}
const appPage = "apps/web/src/app/[locale]/app/page.tsx";
if (existsSync(path.join(ROOT, appPage))) {
  const page = read(appPage);
  const hasDyn = /export const dynamic\s*=\s*"force-dynamic"/.test(page);
  const hasRevalidate = /export const revalidate\s*=\s*0/.test(page);
  if (hasDyn && hasRevalidate) {
    ok("[locale]/app/page.tsx dynamic=force-dynamic + revalidate=0 (double garde, correctif bd61436)");
  } else {
    fail(
      "[locale]/app/page.tsx SANS dynamic=force-dynamic + revalidate=0 — risque de retour du prérendu sans nonce (défaut bd61436)",
    );
  }
} else {
  fail("[locale]/app/page.tsx introuvable");
}
const rootLayout = read("apps/web/src/app/[locale]/layout.tsx");
if (/force-dynamic|headers\(\)/.test(rootLayout)) {
  fail("[locale]/layout.tsx (racine, marketing inclus) est dynamique — régression du rendu statique globale");
} else {
  ok("layout racine (marketing) reste statique — pas de bascule globale en SSR");
}

// ── R7 — enforcement CSP (source: csp-static.ts) ─────────────────────────
const cspStatic = read("apps/web/src/lib/csp-static.ts");
for (const [re, label] of [
  [/frame-ancestors 'none'/, "frame-ancestors 'none'"],
  [/worker-src 'self'/, "worker-src 'self'"],
  [/object-src 'none'/, "object-src 'none'"],
  [/base-uri 'self'/, "base-uri 'self'"],
  [/form-action 'self'/, "form-action 'self'"],
  [/frame-src \$\{TURNSTILE_ORIGIN\}/, "frame-src Turnstile (seule origine)"],
  [/TURNSTILE_ORIGIN = "https:\/\/challenges\.cloudflare\.com"/, "constante Turnstile"],
]) {
  re.test(cspStatic) ? ok(`enforcement: ${label}`) : fail(`enforcement SANS ${label}`);
}
const nextConfig = read("apps/web/next.config.ts");
for (const [re, label] of [
  [/Cross-Origin-Opener-Policy', value: 'same-origin'/, "COOP same-origin"],
  [/Cross-Origin-Resource-Policy', value: 'same-origin'/, "CORP same-origin"],
]) {
  re.test(nextConfig) ? ok(`enforcement: ${label}`) : fail(`enforcement SANS ${label}`);
}
if (/Cross-Origin-Embedder-Policy/.test(nextConfig)) {
  fail("COEP activé sans preuve de compatibilité (Supabase/Turnstile/images) — devait rester différé");
} else {
  ok("COEP différé (conformément à la porte)");
}

// ── R8 — app nonce policy ───────────────────────────────────────────────────
const cspApp = read("apps/web/src/lib/csp-app.ts");
const scriptLines = cspApp
  .split(/\r?\n/)
  .filter((l) => /script-src(-elem)?\s/.test(l));
for (const line of scriptLines) {
  if (/unsafe-inline/.test(line)) {
    fail(`csp-app: 'unsafe-inline' dans une directive script (${line.trim().slice(0, 60)}…)`);
  }
}
if (scriptLines.length >= 2) ok("politique app: script-src et script-src-elem sans 'unsafe-inline'");
else fail("csp-app: directives script introuvables");

// ── R10 — la CSP appliquée ne disparaît d'AUCUNE surface HTML ──────────────
// 2026-09-22 (revue sécu) : la méta vit dans le layout RACINE — le seul
// boundary que tout document rendu traverse, Y COMPRIS le 404 intégré
// (mesuré : le 404 /app rendait 7 scripts inline sans aucune politique
// quand la méta vivait dans le layout /app). global-error.tsx la re-rend
// (il remplace le layout racine). Le layout /app ne la rend PAS : une
// seule occurrence par document.
const rootLayoutPath = "apps/web/src/app/layout.tsx";
const rootDocLayout = read(rootLayoutPath);
if (/import \{ CspEnforcementMeta \}/.test(rootDocLayout) && /<CspEnforcementMeta \/>/.test(rootDocLayout)) {
  ok("R10: layout RACINE rend CspEnforcementMeta (couvre 404 et tout HTML)");
} else {
  fail("R10: layout racine SANS CspEnforcementMeta — le 404 intégré et les erreurs hors boundary perdent toute CSP appliquée");
}
const appLayoutFull = read("apps/web/src/app/[locale]/app/layout.tsx");
if (/<CspEnforcementMeta/.test(appLayoutFull)) {
  fail("R10c: layout /app rend aussi la méta — doublon (exigence : une seule occurrence par document)");
} else {
  ok("R10c: layout /app sans doublon de méta (source unique = layout racine)");
}
const globalErrorPath = "apps/web/src/app/global-error.tsx";
if (existsSync(path.join(ROOT, globalErrorPath))) {
  const ge = read(globalErrorPath);
  if (/import \{ CspEnforcementMeta \}/.test(ge) && /<CspEnforcementMeta \/>/.test(ge)) {
    ok("R10d: global-error.tsx rend la méta (erreurs non attrapées couvertes après hydratation)");
  } else {
    fail("R10d: global-error.tsx existe mais sans CspEnforcementMeta");
  }
} else {
  fail("R10d: global-error.tsx ABSENT — les erreurs non attrapées rendent la page interne Next sans CSP");
}
const rootErrorPath = "apps/web/src/app/error.tsx";
const rootError = read(rootErrorPath);
if (/<html/.test(rootError)) {
  // Ce boundary remplace le document : la méta du layout racine n'y passe pas.
  if (/import \{ CspEnforcementMeta \}/.test(rootError) && /<CspEnforcementMeta \/>/.test(rootError)) {
    ok("R10e: error.tsx racine (rend son propre <html>) porte la méta");
  } else {
    fail("R10e: error.tsx racine rend son propre <html> SANS CspEnforcementMeta — sa surface perd toute CSP");
  }
}
const metaComponent = read("apps/web/src/components/CspEnforcementMeta.tsx");
if (/ENFORCEMENT_CSP_META/.test(metaComponent) && /httpEquiv=/.test(metaComponent)) {
  ok("R10b: composant méta httpEquiv alimenté par ENFORCEMENT_CSP_META");
} else {
  fail("R10b: CspEnforcementMeta n'utilise pas ENFORCEMENT_CSP_META via httpEquiv");
}

// ── R11 — AUCUNE CSP de réponse pour /app (le pliage Vercel tue le nonce) ──
const handleAppSlice = (() => {
  const s = middleware.indexOf("function handleAppRequest");
  const e = middleware.indexOf("\n}", s);
  return s >= 0 ? middleware.slice(s, e) : "";
})();
if (/headers\.set\(\s*["']Content-Security-Policy["']/.test(handleAppSlice)) {
  fail("R11: handleAppRequest pose une CSP de RÉPONSE — Vercel la plie dans la requête du rendu et le nonce meurt (preuves 9e66d14/37c9df5)");
} else {
  ok("R11: branche /app du middleware sans CSP de réponse (pliage Vercel évité)");
}
const vercelJson = read("vercel.json");
if (/Content-Security-Policy/i.test(vercelJson)) {
  fail("R11b: vercel.json défininit une CSP — les headers de route se plient aussi dans la requête (preuve 271fa1b)");
} else {
  ok("R11b: vercel.json sans CSP");
}
if (/['"]Content-Security-Policy['"]/.test(nextConfig) && !/intentionally omitted|ABSENT/.test(nextConfig)) {
  fail("R11c: next.config référencerait une CSP hors du commentaire d'omission volontaire");
} else {
  ok("R11c: next.config sans entrée CSP");
}

// ── R12 — méta DÉRIVÉE de l'enforcement, sans frame-ancestors ────────────────
if (/\.filter\(\(d\) => !d\.startsWith\("frame-ancestors"\)\)/.test(cspStatic)) {
  ok("R12: ENFORCEMENT_CSP_META dérivée par filtre frame-ancestors (pas de copie manuelle qui dérivera)");
} else {
  fail("R12: la dérivation frame-ancestors manque dans csp-static.ts");
}
const cspStaticNoComments = cspStatic.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (/'nonce-/.test(cspStaticNoComments)) {
  fail("R12b: un nonce dans les directives appliquées = phase 2 anticipée (interdit)");
} else {
  ok("R12b: aucun nonce dans les politiques appliquées (phase 1 respectée)");
}

// ── R13 — X-Frame-Options DENY couvre frame-ancestors pour /app ────────────
if (/X-Frame-Options', value: 'DENY'/.test(nextConfig)) {
  ok("R13: X-Frame-Options DENY conservé ( remplaçant frame-ancestors pour la méta /app)");
} else {
  fail("R13: X-Frame-Options DENY absent de next.config — /app perd toute protection au framing");
}

// ── R9 — API routes vs cookie-auth surface ──────────────────────────────────
const apiDir = path.join(ROOT, "apps/web/src/app/api");
const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(path.join(dir, entry.name));
    else if (entry.name === "route.ts") routes.push(path.join(dir, entry.name));
  }
})(apiDir);
let guarded = 0;
for (const route of routes) {
  const src = readFileSync(route, "utf8");
  if (/@supabase\/ssr|createServerClient/.test(src)) {
    guarded += 1;
    if (!/origin-guard|assertSameOriginRequest/.test(src)) {
      fail(`${route.replace(ROOT + path.sep, "")}: client serveur (cookie-auth) SANS garde Origin — importer assertSameOriginRequest`);
    }
  }
}
ok(`API: ${routes.length} routes, ${guarded} surface(s) cookie-auth — toutes gardées` +
   (guarded ? "" : " (aucune aujourd'hui: Bearer uniquement, conforme)"));

if (errors.length) {
  console.error(`\nweb-session-csp: ${errors.length} violation(s) — JUNO-05/JUNO-13 (voir docs/runbooks/web-session-csp-2026-09.md)`);
  process.exit(1);
}
console.log("\nweb-session-csp contract looks clean.");
