// JUNO-06 (reprise 2026-09-23) — validate that every premium feature's DATA
// reaches the client through (or behind) a server control, and that nothing
// regresses to a client-decided path or to security theater.
//
// The gating validator (validate-premium-gating.mjs) proves the DECISION
// contract (keys, tiers, quotas, reason codes) and the CLASS counts. This one
// proves the SOURCES against the operator's ruling: "un appel serveur
// préalable n'est pas une autorisation de sécurité lorsque le résultat
// premium peut encore être produit intégralement hors ligne."
//
//   D1  every FEATURE_TIERS feature is mapped in SERVER_ENFORCED_FEATURES
//       and classified in ENFORCEMENT_CLASSES (no orphan, no stale mapping);
//   D2  the legacy client-side authorization helpers are GONE from
//       premiumUsage.ts (hasTrialRemaining / incrementFeatureUsage /
//       getFeatureUsageToday / getTodayUsage as exports);
//   D3  PremiumContext cannot let the device tier authorize: no
//       consumeTrial/hasTrialRemaining in its API, the JUNO-06 boundary
//       comment stays, and NO code path adopts a local RevenueCat tier over
//       the server's answer (the reprise's blocage 2);
//   D4  PremiumGate carries no legacy branch, fails closed on unmapped keys,
//       and after a server refusal offers SYNC, never a grant (blocage 2);
//   D5  every premium DATA SOURCE in the mobile app that crosses the network
//       for a premium feature resolves through the server inventory below;
//   D6  the executable inventory matches ENFORCEMENT_CLASSES exactly, with
//       SEPARATE counts per class — never a single "N/N enforced" figure;
//   D7  a feature classed server_enforced_data has NO local producer in the
//       mobile bundle (the tarot corpus/engine rule — a patched APK must not
//       be able to produce the premium result);
//   D8  a feature classed public_content is never documented as protected
//       (no doc may claim server enforcement for a public-bytes feature).
//
// Exits 1 on violation. Wired as `validate:premium-data-sources`.

import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// Walk SOURCE only: node_modules and bundler caches (.expo) hold stale copies
// of edited screens, and a validator that reads a cache validates the past.
const walk = (dir, predicate, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name === "node_modules" || entry.name.startsWith("."))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
};

const issues = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  issues.push(msg);
  console.log(`  FAIL  ${msg}`);
};

// ── The honest, executable inventory ────────────────────────────────────────
// `class` must equal ENFORCEMENT_CLASSES in apps/mobile (D6 cross-checks).
// `bytes` says WHERE the premium result can be produced from — that sentence
// is what makes the class honest. `server` says what the server really owns.
const FEATURE_SOURCES = {
  "weekly-tarot": {
    class: "server_enforced_data",
    bytes: "edge premium-tarot-reading (shared engine bundled server-side, tarot.generated.ts); NOTHING in the APK",
    server: "enforce tarot_cosmic inside the edge — the only decision, and the only producer",
    localProducer: "@astro/shared/tarot",
  },
  "monthly-tarot": {
    class: "server_enforced_data",
    bytes: "edge premium-tarot-reading; NOTHING in the APK",
    server: "enforce tarot_monthly inside the edge — the only decision, and the only producer",
    localProducer: "@astro/shared/tarot",
  },
  "natal-chart": {
    class: "server_metered_ui",
    bytes: "own stored birth_chart (get_my_full_profile) + bundled astrology engine",
    server: "enforce natal_chart gates the surface; the compute ships in the binary",
  },
  "conversation-guide": {
    class: "server_metered_ui",
    bytes: "coach corpus bundled (~35 KB, @astro/shared/coach, English-only by design)",
    server: "enforce conversation_guide per locked-tap; the bytes ship in the binary",
  },
  "synastry": {
    class: "server_metered_ui",
    bytes: "server-published reading preferred (get-profile-chart) but BOTH engines bundled for the fallback",
    server: "edge get-profile-chart + synastry_preview_gate + claim_synastry_free_grant; enforce synastry on the entry screen",
  },
  "daily-horoscope": {
    class: "server_metered_ui",
    bytes: "local seeded labels from the reader's sun sign (a server corpus exists in send-daily-horoscope, unused by this screen)",
    server: "enforce daily_horoscope",
  },
  "monthly-horoscope": {
    class: "server_metered_ui",
    bytes: "local seeded labels from the reader's sun sign",
    server: "enforce monthly_horoscope",
  },
  "lucky-days": {
    class: "server_metered_ui",
    bytes: "WINDOWS const — hardcoded phase values, not computed at all",
    server: "enforce lucky_days",
  },
  "date-planner": {
    class: "server_metered_ui",
    bytes: "PROMPT_KEYS_BY_INTENTION / IDEA_KEYS local i18n arrays",
    server: "enforce date_planner (web already enforced)",
  },
  "planetary-transits": {
    class: "public_content",
    bytes: "static THEMES const (6 cards); V2 removed the ephemeris entirely",
    server: "enforce planetary_transits is presentation-level — documented, not a boundary",
  },
  "retrograde-alerts": {
    class: "public_content",
    bytes: "static const, same shape as transits",
    server: "enforce retrograde_alerts is presentation-level — documented, not a boundary",
  },
};

const premiumUsageSrc = read("apps/mobile/services/premiumUsage.ts");
const gateSrc = read("apps/mobile/components/PremiumGate.tsx");
const ctxSrc = read("apps/mobile/contexts/PremiumContext.tsx");
const mobileSources = walk(path.join(ROOT, "apps/mobile"), (f) => /\.(ts|tsx)$/.test(f)).map(
  (f) => ({ path: f, src: fs.readFileSync(f, "utf8") }),
);

// ── D1: map coverage equals the catalog ─────────────────────────────────────
// Comments do not count as code (canary-proven): a commented-out mapping or
// class would otherwise validate the past.
const stripComments = (src) =>
  src
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
const usageNoComments = stripComments(premiumUsageSrc);
const tierBlock = usageNoComments.match(
  /export const FEATURE_TIERS:\s*Record<FeatureKey,[^>]+>\s*=\s*\{([\s\S]*?)\n\};/
);
const mapBlock = usageNoComments.match(
  /SERVER_ENFORCED_FEATURES:\s*Record<FeatureKey,\s*string>\s*=\s*\{([\s\S]*?)\n\};/
);
const tierKeys = tierBlock ? [...tierBlock[1].matchAll(/'([\w-]+)'\s*:/g)].map((m) => m[1]) : [];
const mapKeys = mapBlock ? [...mapBlock[1].matchAll(/'([\w-]+)'\s*:\s*'([\w-]+)'/g)].map((m) => m[1]) : [];
const classified = Object.keys(FEATURE_SOURCES);
for (const key of tierKeys) {
  if (!mapKeys.includes(key)) fail(`D1: '${key}' has no server mapping — orphan feature`);
  else if (!classified.includes(key)) fail(`D1: '${key}' mapped but not classified in FEATURE_SOURCES`);
}
for (const key of mapKeys) {
  if (!tierKeys.includes(key)) fail(`D1: SERVER_ENFORCED_FEATURES maps '${key}' but FEATURE_TIERS does not list it — stale mapping`);
  else if (!classified.includes(key)) fail(`D1: '${key}' mapped but not classified in FEATURE_SOURCES`);
}
if (tierKeys.length === classified.length && mapKeys.length === classified.length) {
  ok(`D1: ${mapKeys.length}/${tierKeys.length} features mapped AND classified`);
}

// ── D2: legacy authorization helpers gone ──────────────────────────────────
const legacyExports = [
  "export async function hasTrialRemaining",
  "export async function incrementFeatureUsage",
  "export async function getFeatureUsageToday",
  "export async function getTodayUsage",
];
const resurrected = legacyExports.filter((sym) => premiumUsageSrc.includes(sym));
if (resurrected.length === 0) ok("D2: legacy client authorization helpers absent (path deleted)");
else fail(`D2: legacy helpers back in premiumUsage.ts: ${resurrected.join(", ")}`);

// ── D3: the device tier can never authorize (blocage 2) ────────────────────
if (/consumeTrial,/.test(ctxSrc) || /hasTrialRemaining:/.test(ctxSrc)) {
  fail("D3: PremiumContext still exposes a device authorization path (consumeTrial/hasTrialRemaining)");
} else {
  ok("D3: PremiumContext exposes no consumeTrial/hasTrialRemaining");
}
if (ctxSrc.includes("JUNO-06 BOUNDARY")) ok("D3b: the device-is-not-the-authority boundary is documented in PremiumContext");
else fail("D3b: the JUNO-06 BOUNDARY comment is gone from PremiumContext (the boundary must stay written)");
// The reprise's named regression: "server says free, RevenueCat says paid,
// trust the device." Any adoption of a local tier over the server's answer
// fails — the device may REQUEST a sync (syncEntitlement), never decide.
if (/effectiveTier\s*=\s*localTier/.test(ctxSrc)) {
  fail("D3c: PremiumContext adopts the local RevenueCat tier over the server's answer (effectiveTier = localTier)");
} else {
  ok("D3c: no local-tier adoption in PremiumContext (sync is requested, never decided)");
}
if (/setTier\(expectedTier\)/.test(ctxSrc)) {
  fail("D3d: PremiumContext optimistically sets the tier from a RevenueCat signal (setTier(expectedTier))");
} else {
  ok("D3d: the RC listener signals a sync, never a tier");
}

// ── D4: gate has no legacy branch, fails closed, offers sync after refusal ──
if (gateSrc.includes("Legacy client-side path")) fail("D4: legacy branch back in PremiumGate");
else ok("D4: PremiumGate has no legacy branch");
if (gateSrc.includes("'unknown_feature'")) ok("D4b: fail-closed on unmapped keys present");
else fail("D4b: the defensive unknown_feature branch is gone from PremiumGate");
// After a server refusal, the ONLY thing the phone may do is offer the sync.
if (/setDenialReason\('sync_available'\)/.test(gateSrc) && /await syncEntitlement\(\)/.test(gateSrc)) {
  ok("D4c: after a refusal the gate offers the server-verified sync (sync_available)");
} else {
  fail("D4c: the sync_available path is gone — after a refusal the gate must offer to synchronize, never grant");
}
// The exact pre-fix shape: a grant guarded by canAccessFeature after a
// refusal. 'granted' must never follow a canAccessFeature guard.
const reversal = gateSrc.match(/canAccessFeature\(feature\)\s*\)\s*\{[\s\S]{0,160}?setAccessState\('granted'\)/);
if (reversal) {
  fail("D4d: a canAccessFeature-guarded grant survives in PremiumGate — the phone outranking the server");
} else {
  ok("D4d: no canAccessFeature-guarded grant in PremiumGate");
}

// ── D5: premium screens reach the network only through the inventory ───────
const screensDir = path.join(ROOT, "apps/mobile/app/premium-screens");
const screens = walk(screensDir, (f) => f.endsWith(".tsx"));
const ALLOWED_TABLES = new Set(["profiles"]); // own row, RLS — the user's own sign/inputs
for (const screen of screens) {
  const src = fs.readFileSync(screen, "utf8");
  const froms = [...src.matchAll(/\.from\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
  const illegal = froms.filter((t) => !ALLOWED_TABLES.has(t));
  if (illegal.length > 0) {
    fail(`D5: ${path.relative(ROOT, screen)} reads ${illegal.join(", ")} directly — classify the source or route it through a server control`);
  }
}
ok(`D5: ${screens.length} premium screens — direct reads limited to ${[...ALLOWED_TABLES].join(", ")}`);

// ── D6: the inventory matches ENFORCEMENT_CLASSES, counts SEPARATE ─────────
const classBlock = usageNoComments.match(
  /export const ENFORCEMENT_CLASSES:\s*Record<FeatureKey,\s*EnforcementClass>\s*=\s*\{([\s\S]*?)\n\};/
);
const clientClasses = classBlock
  ? Object.fromEntries(
      [...classBlock[1].matchAll(/'([\w-]+)':\s*'(server_enforced_data|server_metered_ui|public_content)'/g)].map((m) => [m[1], m[2]]),
    )
  : null;
if (!clientClasses) {
  fail("D6: ENFORCEMENT_CLASSES not found/parsable in premiumUsage.ts");
} else {
  let drift = 0;
  for (const [feature, meta] of Object.entries(FEATURE_SOURCES)) {
    if (clientClasses[feature] !== meta.class) {
      fail(`D6: '${feature}' is '${meta.class}' here but '${clientClasses[feature] ?? "unclassified"}' in ENFORCEMENT_CLASSES`);
      drift += 1;
    }
  }
  for (const feature of Object.keys(clientClasses)) {
    if (!(feature in FEATURE_SOURCES)) {
      fail(`D6: ENFORCEMENT_CLASSES lists '${feature}' with no inventory entry here`);
      drift += 1;
    }
  }
  if (drift === 0) {
    const counts = { server_enforced_data: 0, server_metered_ui: 0, public_content: 0 };
    for (const meta of Object.values(FEATURE_SOURCES)) counts[meta.class] += 1;
    const total = Object.keys(FEATURE_SOURCES).length;
    ok(
      `D6: inventory aligned — SEPARATE counts: ` +
        `${counts.server_enforced_data}/${total} server-protected, ` +
        `${counts.server_metered_ui}/${total} server-metered but APK-circumventable, ` +
        `${counts.public_content}/${total} public content`,
    );
  }
}

// ── D7: server_enforced_data ⇒ no local producer in the mobile bundle ──────
// The canary this rule was born from: the tarot corpus/engine importing back
// into apps/mobile would resurrect the patched-APK reading. Only imports
// count — a comment mentioning the package is fine.
for (const [feature, meta] of Object.entries(FEATURE_SOURCES)) {
  if (meta.class !== "server_enforced_data" || !meta.localProducer) continue;
  const importRe = new RegExp(`from\\s+['"]${meta.localProducer.replace(/[/@]/g, "\\$&")}['"]`);
  const offenders = mobileSources.filter(({ src }) => importRe.test(src));
  if (offenders.length > 0) {
    fail(
      `D7: '${feature}' is server_enforced_data but the mobile bundle imports its producer — ` +
        offenders.map((o) => path.relative(ROOT, o.path)).join(", "),
    );
  } else {
    ok(`D7: '${feature}' has no producer import in apps/mobile (a patched APK gets nothing)`);
  }
}
// Tarot-specific structural proof, stated once more because it is the one
// move this remediation made: the screen renders a SERVER artifact, with a
// single decision (the edge's), never two.
const tarotScreen = mobileSources.find((f) => f.path.endsWith(path.join("premium-screens", "tarot.tsx")));
if (tarotScreen) {
  if (/functions\.invoke\(\s*'premium-tarot-reading'/.test(read("apps/mobile/services/serverTarot.ts")) && tarotScreen.src.includes("fetchTarotReading")) {
    ok("D7b: tarot screen consumes the edge reading (services/serverTarot)");
  } else {
    fail("D7b: the tarot screen no longer consumes the edge reading — the server artifact path is broken");
  }
  // Usage, not mention: the screen legitimately SAYS "not wrapped in
  // PremiumGate" in its rationale comment — only an import or JSX element
  // would be a real double decision.
  if (/import PremiumGate|<PremiumGate/.test(tarotScreen.src)) {
    fail("D7b: the tarot screen is wrapped in PremiumGate — double decision (the edge already enforces; the wrapper would spend a second preview)");
  } else {
    ok("D7b: tarot screen unwrapped — single enforce, in the edge");
  }
}

// ── D8: public_content is never claimed protected in writing ────────────────
// A doc claiming "server enforcement" for a public-bytes feature is security
// theater in writing; the honest docs say presentation-level. LINE-granular:
// only the lines that actually NAME the feature are judged — a section that
// discusses all eleven features would otherwise trip on vocabulary that
// describes a different row.
const runbook = read("docs/runbooks/premium-server-enforcement-2026-09.md");
for (const feature of ["planetary-transits", "retrograde-alerts"]) {
  const serverKey = feature.replace(/-/g, "_");
  const offender = runbook
    .split("\n")
    .filter((line) => line.includes(feature) || line.includes(serverKey))
    .filter((line) => /(server[ -]?enforced|extraction-proof|cannot be produced offline)/i.test(line));
  if (offender.length > 0) {
    fail(`D8: the runbook line for '${feature}' claims protection — its class is public_content: ${offender[0].trim().slice(0, 100)}`);
  }
}
ok("D8: no protection claim on public-content feature lines in the runbook");

if (issues.length) {
  console.error(`\npremium-data-sources: ${issues.length} violation(s) — JUNO-06 (see docs/runbooks/premium-server-enforcement-2026-09.md)`);
  process.exit(1);
}
console.log("\npremium-data-sources contract looks clean.");
