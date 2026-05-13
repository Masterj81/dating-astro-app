// scripts/test-logic.ts
//
// A tiny zero-framework correctness check for the BigAd engine.
//
// Goal: prove that two materially different inputs produce materially
// different outputs in the sections that drive the customer-facing
// strategy (headlines, angles, positioning, landing hero) AND that the
// V2 quality engine (scoring, diagnosis, ranking, awareness variants,
// generic guard, export brief) all work end-to-end.
//
// Run: `npm run test:logic`. Exits 0 on success, 1 on failure.

import {
  BANNED_PHRASES,
  buildStrategy,
  detectGenericInText,
  diagnoseOffer,
  generateAwarenessVariants,
  generateExportBrief,
  rankAngles,
  scoreStrategy,
} from "../src/lib/engine";
import { ASTRO_DATING_EXAMPLE, NOTION_LIKE_EXAMPLE } from "../src/lib/example";
import type { ProductInput } from "../src/types/strategy";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function expectDifferent(name: string, a: unknown, b: unknown) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  record(name, ja !== jb, ja === jb ? `Both outputs were identical: ${ja.slice(0, 120)}…` : undefined);
}

function expectContains(name: string, haystack: string, needle: string) {
  const ok = haystack.toLowerCase().includes(needle.toLowerCase());
  record(name, ok, ok ? undefined : `Expected to find "${needle}" in: ${haystack.slice(0, 200)}…`);
}

function expectBetween(name: string, n: number, min: number, max: number) {
  const ok = n >= min && n <= max;
  record(name, ok, ok ? undefined : `Expected ${n} in [${min}, ${max}]`);
}

const a = buildStrategy(ASTRO_DATING_EXAMPLE);
const b = buildStrategy(NOTION_LIKE_EXAMPLE);

// ---- MVP behaviour (must not regress) ----

// 1. Headlines should differ.
expectDifferent("headlines differ between inputs", a.headlines, b.headlines);

// 2. Angles should differ.
expectDifferent("angles differ between inputs", a.angles, b.angles);

// 3. Positioning statement should differ.
expectDifferent("positioning differs between inputs", a.positioning.statement, b.positioning.statement);

// 4. Landing hero should differ.
expectDifferent("landing hero differs between inputs", a.landing.hero, b.landing.hero);

// 5. AstroDating output should NAME the things that make it AstroDating.
const astroBlob = JSON.stringify(a).toLowerCase();
expectContains("astrodating output mentions dating", astroBlob, "dating");
expectContains("astrodating output mentions astrology", astroBlob, "astrology");
expectContains("astrodating output mentions shallow swiping pain", astroBlob, "shallow swiping");
expectContains("astrodating output mentions voice intros differentiator", astroBlob, "voice intros");

// 6. Plotline output should name its own context.
const plotBlob = JSON.stringify(b).toLowerCase();
expectContains("plotline output mentions fiction writers", plotBlob, "fiction writers");
expectContains("plotline output mentions scene-graph differentiator", plotBlob, "scene-graph");

// 7. No section is empty.
record("strategy has 10 headlines", a.headlines.length === 10);
record("strategy has 5 angles", a.angles.length === 5);
record("strategy has 3 tiktok scripts", a.tiktokScripts.length === 3);
record("strategy has 3 facebook ads", a.facebookAds.length === 3);
record("strategy has 5 experiments", a.experiments.length === 5);

// ---- V2 quality engine ----

// scoreStrategy: returns 5 dimensions, each 0-100, overall 0-100, and
// dimension labels are stable.
const score = scoreStrategy(ASTRO_DATING_EXAMPLE);
record("scoreStrategy returns 5 dimensions", score.dimensions.length === 5);
expectBetween("scoreStrategy overall is 0-100", score.overall, 0, 100);
const dimKeys = score.dimensions.map((d) => d.key).sort();
record(
  "scoreStrategy covers clarity/differentiation/specificity/proofStrength/channelFit",
  JSON.stringify(dimKeys) ===
    JSON.stringify(
      ["channelFit", "clarity", "differentiation", "proofStrength", "specificity"]
    )
);
record(
  "every dimension has explanation + suggestion + 0-100 score",
  score.dimensions.every(
    (d) => d.explanation.length > 5 && d.suggestion.length > 5 && d.score >= 0 && d.score <= 100
  )
);
// Scores differ between two materially different products.
expectDifferent(
  "scoreStrategy returns different overall for different products",
  score.overall,
  scoreStrategy(NOTION_LIKE_EXAMPLE).overall
);

// diagnoseOffer: returns required fields and references the product
// (audience or differentiator or category) in the strongest promise.
const diag = diagnoseOffer(ASTRO_DATING_EXAMPLE);
record(
  "diagnoseOffer returns missingProof + biggestObjection",
  !!diag.missingProof && !!diag.biggestObjection
);
record(
  "diagnoseOffer returns a recommended proof asset",
  ["screenshots", "demo video", "customer quote", "case study", "before/after", "app store reviews", "founder story"].includes(
    diag.recommendedAsset
  )
);
expectContains(
  "diagnoseOffer strongest promise references the audience or pain",
  diag.strongestPromise.toLowerCase(),
  "shallow swiping"
);

// rankAngles: orders by score descending.
const ranked = rankAngles(a.angles);
record("rankAngles preserves length", ranked.length === a.angles.length);
let descending = true;
for (let i = 1; i < ranked.length; i++) {
  const prev = ranked[i - 1].score ?? 0;
  const curr = ranked[i].score ?? 0;
  if (curr > prev) {
    descending = false;
    break;
  }
}
record("rankAngles orders angles by score (desc)", descending);
record(
  "rankAngles top angle has a channel fit",
  !!ranked[0].channelFit
);

// generateAwarenessVariants: 5 stages, each with 3 outputs.
const variants = generateAwarenessVariants(ASTRO_DATING_EXAMPLE);
record("generateAwarenessVariants returns 5 stages", variants.length === 5);
record(
  "every awareness variant has headline + adHook + landingAngle",
  variants.every(
    (v) => v.headline.length > 5 && v.adHook.length > 5 && v.landingAngle.length > 5
  )
);
// The unaware-stage variant for AstroDating should reference dating/swiping.
const unaware = variants.find((v) => v.stage === "unaware");
record(
  "awareness variant for astro example references the actual product",
  !!unaware &&
    (unaware.headline.toLowerCase().includes("shallow swiping") ||
      unaware.landingAngle.toLowerCase().includes("dating") ||
      unaware.adHook.toLowerCase().includes("dating"))
);

// detectGenericCopy: flags every banned phrase the brief listed.
const sentinelPhrases = [
  "boost your business",
  "take it to the next level",
  "revolutionary",
  "game-changing",
  "unlock your potential",
  "seamless solution",
];
let allFlagged = true;
for (const p of sentinelPhrases) {
  const flags = detectGenericInText(`Our app is ${p} for everyone.`, ASTRO_DATING_EXAMPLE);
  if (flags.length === 0) {
    allFlagged = false;
    record(`detectGenericCopy flags "${p}"`, false, `No flag returned`);
  } else {
    record(`detectGenericCopy flags "${p}"`, true);
  }
}
record(
  "detectGenericCopy: banned phrase list covers >= 7 phrases",
  BANNED_PHRASES.length >= 7
);
record(
  "detectGenericCopy: suggestion is non-empty and references the product",
  detectGenericInText("revolutionary", ASTRO_DATING_EXAMPLE)[0].suggestion
    .toLowerCase()
    .includes("dating") ||
    detectGenericInText("revolutionary", ASTRO_DATING_EXAMPLE)[0].suggestion
      .toLowerCase()
      .includes("astrology") ||
    detectGenericInText("revolutionary", ASTRO_DATING_EXAMPLE)[0].suggestion
      .toLowerCase()
      .includes("shallow swiping") ||
    detectGenericInText("revolutionary", ASTRO_DATING_EXAMPLE)[0].suggestion
      .toLowerCase()
      .includes("voice intros")
);
// And BigAd's own output must not trip its own guard.
record(
  "buildStrategy output for astro example has zero generic flags",
  a.genericFlags.length === 0,
  a.genericFlags.length === 0
    ? undefined
    : `Found: ${a.genericFlags.map((f) => f.phrase).join(", ")}`
);
record(
  "buildStrategy output for plotline example has zero generic flags",
  b.genericFlags.length === 0,
  b.genericFlags.length === 0
    ? undefined
    : `Found: ${b.genericFlags.map((f) => f.phrase).join(", ")}`
);
// Just for use in messages below.
void allFlagged;

// generateExportBrief: contains every essential section header.
const brief = generateExportBrief(ASTRO_DATING_EXAMPLE, a);
expectContains("export brief contains product snapshot", brief, "## Product snapshot");
expectContains("export brief contains strategy quality score", brief, "## Strategy quality score");
expectContains("export brief contains positioning", brief, "## Positioning");
expectContains("export brief contains awareness diagnosis", brief, "## Awareness diagnosis");
expectContains("export brief contains offer diagnosis", brief, "## Offer diagnosis");
expectContains("export brief contains top angles", brief, "## Top angles (ranked by fit)");
expectContains("export brief contains headlines", brief, "## Headlines");
expectContains("export brief contains landing copy", brief, "## Landing copy");
expectContains("export brief contains store copy", brief, "## Store copy");
expectContains("export brief contains experiments", brief, "## Experiments");
expectContains("export brief mentions the astrodating differentiator", brief.toLowerCase(), "voice intros");

// AstroDating Strategy fields are present and well-shaped.
record("strategy has rankedAngles", Array.isArray(a.rankedAngles) && a.rankedAngles.length === 5);
record("strategy.exportBrief is non-trivial", a.exportBrief.length > 800);

// ---- Sanity: example-only strict checks ----

// Make sure the example payload still parses correctly.
const sample: ProductInput = ASTRO_DATING_EXAMPLE;
record("example payload is still valid", !!sample.differentiator);

// Report.
let failed = 0;
for (const c of checks) {
  const status = c.ok ? "PASS" : "FAIL";
  // Plain ascii, no decorative chars.
  console.log(`[${status}] ${c.name}`);
  if (!c.ok && c.detail) console.log(`        ${c.detail}`);
  if (!c.ok) failed++;
}

console.log("");
console.log(`Total: ${checks.length}  Passed: ${checks.length - failed}  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
