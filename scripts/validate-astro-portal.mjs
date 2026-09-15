// Validate the Astro portal contract (mission 2026-09-15).
//
// WHY THIS EXISTS
// ---------------
// The portal is a NEW DOOR to two tiers that already had doors. Its risks
// are all drift-shaped, the kind types cannot catch:
//
//   1. The mobile bottom bar must not link straight to a TIER hub anymore —
//      that is the exact bug this mission fixes (a phone reader believing
//      the PWA only ships Cosmic).
//   2. The Astro tab must read as ACTIVE across the surfaces it opens —
//      its own route, both tier hubs, and the conversation guide — and that
//      state must ride aria-current, not color alone.
//   3. The portal must never CALL a premium RPC: opening a map must cost no
//      quota and grant nothing. If someone "improves" it into a gate, this
//      check fails.
//   4. The legacy hub routes must stay routes — the portal is additive,
//      not a replacement; a redirect added there would break deep links.
//   5. The eighteen portal strings must exist in all eight locales.
//
// Exits 1 on drift. Wired as `npm run validate:astro-portal`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const issues = [];
const check = (ok, label) => {
  if (ok) console.log(`  ok    ${label}`);
  else { console.error(`  FAIL  ${label}`); issues.push(label); }
};

console.log("Astro portal contract");

// ---------------------------------------------------------------------------
// 1. Navigation (AppShell)
// ---------------------------------------------------------------------------
const shell = read("apps/web/src/components/AppShell.tsx");

const bottomBlock = shell.match(/const bottomNav: NavLink\[\] = \[([\s\S]*?)\];\r?\n/);
check(!!bottomBlock, "bottomNav trouvé dans AppShell");
if (bottomBlock) {
  check(/href: "\/app\/astro"/.test(bottomBlock[1]), "onglet Astro présent dans la barre mobile");
  check(!/\/app\/premium\/(cosmic|celestial)"/.test(bottomBlock[1]), "aucun lien direct Céleste/Cosmique dans la barre mobile");
  const tabCount = (bottomBlock[1].match(/href: /g) || []).length;
  check(tabCount <= 5, `barre mobile : ${tabCount} onglets (max 5)`);
}

const mainBlock = shell.match(/const mainNav: NavLink\[\] = \[([\s\S]*?)\];\r?\n/);
check(!!mainBlock, "mainNav trouvé dans AppShell");
if (mainBlock) {
  check(/href: "\/app\/astro"/.test(mainBlock[1]), "entrée Astro présente dans la navigation bureau");
  const astroEntries = (mainBlock[1].match(/href: "\/app\/(premium\/cosmic|premium\/celestial|astro)"/g) || []).length;
  check(astroEntries === 1, `une seule entrée Astro/Céleste/Cosmique au premier niveau (${astroEntries})`);
}

// Active predicate: Astro must cover its route, both hubs and the guide.
// (\r?\n everywhere: the working tree is CRLF and a bare \n silently
// matches nothing — a validator that cannot parse the file reads as
// "nothing to complain about", which is worse than no validator.)
const astroActive = shell.match(/const astroActive = \(pathname: string\) =>\s*([\s\S]*?);\r?\n/);
check(!!astroActive, "prédicat astroActive présent");
if (astroActive) {
  for (const frag of ["/app/astro", "/app/premium/celestial", "/app/premium/cosmic", "/app/premium/conversation-guide"]) {
    check(astroActive[1].includes(frag), `astroActive couvre ${frag}`);
  }
}
check(/isActivePath: astroActive/.test(shell), "les entrées Astro utilisent isActivePath");
check(shell.includes('aria-current={active ? "page" : undefined}'), "aria-current piloté par l'état actif (les deux barres)");

// ---------------------------------------------------------------------------
// 2. Portal component — a map, never a gate
// ---------------------------------------------------------------------------
const portal = read("apps/web/src/components/AstroPortal.tsx");
check(!/enforce_premium_feature|can_use_premium_feature/.test(portal), "aucun appel premium (enforce/can_use) dans le portail");
check(!/serviceWorker/i.test(portal), "aucune référence service worker dans le portail");
check(portal.includes('"/app/premium/celestial"'), "carte Céleste → /app/premium/celestial");
check(portal.includes('"/app/premium/cosmic"'), "carte Cosmique → /app/premium/cosmic");
// Items neutres : les chaînes des hubs (« … disponible maintenant ») sont de
// fausses affirmations de disponibilité sur une carte verrouillée. Le portail
// doit utiliser ses propres clés astroItem_* sans aucune promesse.
check(!/celestialHubItem_|cosmicHubItem_/.test(portal), "items de cartes neutres (aucune clé de hub réutilisée)");
check(portal.includes("astroItemNatal"), "clés astroItem_* utilisées pour les listes");
check(portal.includes('"/app/plans"'), "CTT discret vers /app/plans");
check(portal.includes("astroCardCosmicIncludes"), "note d'inclusion descendante affichée (Cosmique ⊇ Céleste)");
const quicks = (portal.match(/<QuickLink/g) || []).length;
check(quicks === 3, `exactement trois raccourcis (${quicks})`);
check(portal.includes('"/app/premium/celestial/natal-chart"') && portal.includes('"/app/premium/celestial/synastry"') && portal.includes('"/app/premium/conversation-guide"'), "raccourcis : thème natal, synastrie, guide");

// ---------------------------------------------------------------------------
// 3. Routes — the portal is additive, the hubs are untouched doors
// ---------------------------------------------------------------------------
const route = (p) => fs.existsSync(path.join(ROOT, "apps/web/src/app/[locale]", p));
check(route("app/astro/page.tsx"), "route /app/astro présente");
check(route("app/premium/celestial/page.tsx"), "hub Céleste toujours une route (pas une redirection)");
check(route("app/premium/cosmic/page.tsx"), "hub Cosmique toujours une route (pas une redirection)");
for (const deep of [
  "app/premium/celestial/natal-chart/page.tsx",
  "app/premium/celestial/synastry/page.tsx",
  "app/premium/celestial/daily-horoscope/page.tsx",
  "app/premium/celestial/tarot/page.tsx",
  "app/premium/cosmic/monthly-horoscope/page.tsx",
  "app/premium/cosmic/planetary-transits/page.tsx",
  "app/premium/cosmic/lucky-days/page.tsx",
  "app/premium/cosmic/retrograde-alerts/page.tsx",
  "app/premium/cosmic/date-planner/page.tsx",
  "app/premium/cosmic/tarot/page.tsx",
  "app/premium/conversation-guide/page.tsx",
]) {
  check(route(deep), `route profonde préservée : ${deep.replace("/page.tsx", "").replace("app/", "/")}`);
}
// The hubs must not have gained a redirect to the portal. The WORD
// "redirect" appears in legitimate hub comments (legacy likes routes), so
// the check targets the portal URL itself and real redirect calls.
for (const hub of ["app/premium/celestial/page.tsx", "app/premium/cosmic/page.tsx"]) {
  const src = read(`apps/web/src/app/[locale]/${hub}`);
  check(!src.includes("/app/astro"), `${hub.replace("/page.tsx", "")} : aucune mention de /app/astro (aucune redirection)`);
  check(!/(permanentRedirect|redirect)\(/.test(src), `${hub.replace("/page.tsx", "")} : aucun appel de redirect()`);
}

// ---------------------------------------------------------------------------
// 4. Locales — the eighteen keys, in all eight languages
// ---------------------------------------------------------------------------
const ASTRO_KEYS = [
  "astroNav", "astroPortalSubtitle", "astroPortalCurrentPlan",
  "astroPortalPlanFree", "astroPortalPlanCelestial", "astroPortalPlanCosmic",
  "astroPortalPlansCta", "astroCardCelestialBody", "astroCardCosmicBody",
  "astroCardCosmicIncludes", "astroExploreCelestial", "astroDiscoverCelestial",
  "astroExploreCosmic", "astroDiscoverCosmic", "astroQuickTitle",
  "astroLockedRequiresCelestial", "astroQuickNatalFreeNote", "astroQuickGuideFreeNote",
  "astroItemNatal", "astroItemSynastry", "astroItemDaily", "astroItemGuide",
  "astroItemTarotMonthly", "astroItemMonthly", "astroItemTransits",
  "astroItemWindows", "astroItemRetrograde", "astroItemDateReflection",
  "astroItemTarotWeekly",
];
for (const loc of ["en", "fr", "de", "es", "pt", "ar", "ja", "zh"]) {
  const j = JSON.parse(read(`apps/web/messages/${loc}.json`));
  const missing = ASTRO_KEYS.filter((k) => !(k in (j.webApp ?? {})));
  check(missing.length === 0, `locale ${loc} : ${ASTRO_KEYS.length - missing.length}/${ASTRO_KEYS.length} clés astro`);
}

// ---------------------------------------------------------------------------
// 5. Vocabulary — the portal speaks reflection, never prediction
// ---------------------------------------------------------------------------
const fr = JSON.parse(read("apps/web/messages/fr.json"));
const forbidden = /destin|âme s[œo]ur|soulmate|garanti|compatibilité garantie/i;
const offenders = ASTRO_KEYS.filter((k) => forbidden.test(String(fr.webApp[k] ?? "")));
check(offenders.length === 0, `vocabulaire FR non prédictif (${offenders.length ? offenders.join(", ") : "conforme"})`);
// Aucun item de carte ne porte d'affirmation de disponibilité : sur une carte
// verrouillée, « disponible maintenant » est faux. La disponibilité vit dans
// le CTA et l'état de verrouillage.
const availability = ASTRO_KEYS.filter((k) => /disponible maintenant|available now/i.test(String(fr.webApp[k] ?? "")));
check(availability.length === 0, `aucune affirmation de disponibilité dans les items (${availability.length ? availability.join(", ") : "conforme"})`);

// ---------------------------------------------------------------------------
if (issues.length) {
  console.error(`\nAstro portal contract: ${issues.length} problème(s).`);
  process.exit(1);
}
console.log("\nAstro portal contract: everything agrees.");
