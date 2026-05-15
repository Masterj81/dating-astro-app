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
  computeBreakevenROAS,
  detectGenericInText,
  diagnoseOffer,
  generateAwarenessVariants,
  generateExportBrief,
  rankAngles,
  scoreStrategy,
  sumShotMidpoints,
} from "../src/lib/engine";
import { ASTRO_DATING_EXAMPLE, NOTION_LIKE_EXAMPLE } from "../src/lib/example";
import type {
  BriefSectionKind,
  CameraAngle,
  CampaignType,
  ProductInput,
  ShotDuration,
  ShotKind,
} from "../src/types/strategy";

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

// ---- V3: Offer Architect ----

record(
  "buildStrategy emits >= 3 offers for astro example",
  a.offers.length >= 3,
  `Got ${a.offers.length}`
);
record(
  "buildStrategy emits >= 3 offers for plotline example",
  b.offers.length >= 3,
  `Got ${b.offers.length}`
);

// Two different inputs must produce different offer sets (order or content).
expectDifferent(
  "offers differ between astro and plotline examples",
  a.offers,
  b.offers
);

// Every offer is well-shaped.
const offerShapeOk = a.offers.every(
  (o) =>
    typeof o.label === "string" && o.label.length > 0 &&
    typeof o.rationale === "string" && o.rationale.length > 0 &&
    ["low", "medium", "high"].includes(o.stickinessRisk) &&
    Array.isArray(o.awarenessFit) && o.awarenessFit.length > 0 &&
    (o.breakevenROAS === null || typeof o.breakevenROAS === "number")
);
record("every offer has label, rationale, stickinessRisk, awarenessFit, breakeven", offerShapeOk);

// Breakeven math.
const be0 = computeBreakevenROAS({ cogsPercent: 30, targetMarginPercent: 20, discountPercent: 0 });
const be10 = computeBreakevenROAS({ cogsPercent: 30, targetMarginPercent: 20, discountPercent: 10 });
const be20 = computeBreakevenROAS({ cogsPercent: 30, targetMarginPercent: 20, discountPercent: 20 });
record(
  "computeBreakevenROAS(30/20/0) = 2.0",
  be0 !== null && Math.abs(be0 - 2.0) < 1e-9,
  `Got ${be0}`
);
record(
  "computeBreakevenROAS(30/20/10) ~ 2.5",
  be10 !== null && Math.abs(be10 - 2.5) < 1e-9,
  `Got ${be10}`
);
record(
  "computeBreakevenROAS(30/20/20) ~ 3.3333",
  be20 !== null && Math.abs(be20 - 10 / 3) < 1e-9,
  `Got ${be20}`
);
record(
  "breakeven ROAS is monotonic in discount",
  be0 !== null && be10 !== null && be20 !== null && be0 < be10 && be10 < be20
);
record(
  "computeBreakevenROAS returns null when contribution non-positive",
  computeBreakevenROAS({ cogsPercent: 60, targetMarginPercent: 40, discountPercent: 10 }) === null
);
record(
  "computeBreakevenROAS returns null when inputs missing",
  computeBreakevenROAS({ discountPercent: 10 }) === null
);

// ---- V3: Campaign Calendar ----

record(
  "campaignCalendar has >= 5 windows for astro example",
  a.campaignCalendar.windows.length >= 5,
  `Got ${a.campaignCalendar.windows.length}`
);
record(
  "campaignCalendar has >= 5 windows for plotline example",
  b.campaignCalendar.windows.length >= 5,
  `Got ${b.campaignCalendar.windows.length}`
);

const windowShapeOk = a.campaignCalendar.windows.every(
  (w) =>
    typeof w.primaryKPI === "string" && w.primaryKPI.length > 0 &&
    typeof w.readinessGate === "string" && w.readinessGate.length > 0 &&
    typeof w.notes === "string" && w.notes.length > 0
);
record("every campaign window has KPI and readiness gate populated", windowShapeOk);

// At least one window forecasts a dip — the pattern always includes one.
record(
  "calendar includes at least one window with expectedDip = true",
  a.campaignCalendar.windows.some((w) => w.expectedDip) &&
    b.campaignCalendar.windows.some((w) => w.expectedDip)
);

// Switching campaignType must change the calendar shape.
const campaignTypes: CampaignType[] = ["launch", "seasonal", "always-on"];
const calendarsByType = campaignTypes.map((ct) =>
  buildStrategy({ ...ASTRO_DATING_EXAMPLE, campaignType: ct }).campaignCalendar
);
const launchCal = calendarsByType[0];
const seasonalCal = calendarsByType[1];
const alwaysOnCal = calendarsByType[2];
record(
  "launch vs seasonal calendars differ in first window kind or count",
  launchCal.windows[0].kind !== seasonalCal.windows[0].kind ||
    launchCal.windows.length !== seasonalCal.windows.length
);
record(
  "launch vs always-on calendars differ in first window kind or count",
  launchCal.windows[0].kind !== alwaysOnCal.windows[0].kind ||
    launchCal.windows.length !== alwaysOnCal.windows.length
);
record(
  "seasonal vs always-on calendars differ in first window kind or count",
  seasonalCal.windows[0].kind !== alwaysOnCal.windows[0].kind ||
    seasonalCal.windows.length !== alwaysOnCal.windows.length
);

// Determinism: same input twice produces identical offers and calendar.
const aTwice = buildStrategy(ASTRO_DATING_EXAMPLE);
record(
  "buildStrategy is deterministic for offers",
  JSON.stringify(aTwice.offers) === JSON.stringify(a.offers)
);
record(
  "buildStrategy is deterministic for campaignCalendar",
  JSON.stringify(aTwice.campaignCalendar) === JSON.stringify(a.campaignCalendar)
);

// Export brief picks up both new sections.
expectContains("export brief contains Offer Architecture", brief, "## Offer Architecture");
expectContains("export brief contains Campaign Calendar", brief, "## Campaign Calendar");

// ---- V4: Creator Briefs ----

const VALID_BRIEF_SECTION_ORDER: BriefSectionKind[] = [
  "hook",
  "problem",
  "solution-or-proof",
  "cta",
];

for (const [label, strat] of [
  ["astro", a],
  ["plotline", b],
] as const) {
  record(
    `${label}: creatorBriefs.length >= 2`,
    strat.creatorBriefs.length >= 2,
    `Got ${strat.creatorBriefs.length}`
  );
  const angleNames = strat.angles.map((g) => g.name);
  for (const brief of strat.creatorBriefs) {
    record(
      `${label}: brief ${brief.id} has 4 sections`,
      brief.sections.length === 4,
      `Got ${brief.sections.length}`
    );
    const kinds = brief.sections.map((s) => s.kind);
    record(
      `${label}: brief ${brief.id} section order is hook -> problem -> solution -> cta`,
      JSON.stringify(kinds) === JSON.stringify(VALID_BRIEF_SECTION_ORDER)
    );
    record(
      `${label}: brief ${brief.id} every section has non-empty label/beat and duration > 0`,
      brief.sections.every(
        (s) =>
          s.label.length > 0 &&
          s.beat.length > 0 &&
          typeof s.durationSeconds === "number" &&
          s.durationSeconds > 0
      )
    );
    record(
      `${label}: brief ${brief.id} forAngle is one of strategy.angles[].name`,
      angleNames.includes(brief.forAngle),
      `Brief angle "${brief.forAngle}" not in [${angleNames.join(", ")}]`
    );
    record(
      `${label}: brief ${brief.id} altHooks >= 2`,
      brief.altHooks.length >= 2,
      `Got ${brief.altHooks.length}`
    );
    record(
      `${label}: brief ${brief.id} deliverables >= 2`,
      brief.deliverables.length >= 2,
      `Got ${brief.deliverables.length}`
    );
  }
}

// Changing campaignType must change the deliverables array (proves
// campaignType wiring through into the brief).
const launchBriefs = buildStrategy({
  ...ASTRO_DATING_EXAMPLE,
  campaignType: "launch",
}).creatorBriefs;
const alwaysOnBriefs = buildStrategy({
  ...ASTRO_DATING_EXAMPLE,
  campaignType: "always-on",
}).creatorBriefs;
record(
  "campaignType launch vs always-on yields different deliverables for top brief",
  JSON.stringify(launchBriefs[0]?.deliverables) !==
    JSON.stringify(alwaysOnBriefs[0]?.deliverables)
);

// Two different examples produce different brief contents.
expectDifferent(
  "briefs differ between astro and plotline examples",
  a.creatorBriefs,
  b.creatorBriefs
);

// Determinism: same input twice produces identical briefs.
record(
  "buildStrategy is deterministic for creatorBriefs",
  JSON.stringify(aTwice.creatorBriefs) === JSON.stringify(a.creatorBriefs)
);

// ---- V4: Shot Lists ----

const VALID_SHOT_KINDS: ShotKind[] = [
  "talking-head",
  "product-shot",
  "b-roll",
  "screenshot",
  "ugc-selfie",
  "lifestyle",
];
const VALID_CAMERA_ANGLES: CameraAngle[] = [
  "eye-level",
  "high",
  "low",
  "over-shoulder",
  "pov",
];
const VALID_SHOT_DURATIONS: ShotDuration[] = [
  "1-2s",
  "2-4s",
  "4-6s",
  "6-10s",
  "10s+",
];

for (const [label, strat] of [
  ["astro", a],
  ["plotline", b],
] as const) {
  record(
    `${label}: shotLists.length === creatorBriefs.length`,
    strat.shotLists.length === strat.creatorBriefs.length,
    `Got ${strat.shotLists.length} vs ${strat.creatorBriefs.length}`
  );
  // IDs match 1:1, in order.
  const idsMatch = strat.shotLists.every(
    (list, i) => list.briefId === strat.creatorBriefs[i]?.id
  );
  record(`${label}: shotLists share IDs 1:1 with creatorBriefs`, idsMatch);

  for (let i = 0; i < strat.shotLists.length; i++) {
    const list = strat.shotLists[i];
    const brief = strat.creatorBriefs[i];
    record(
      `${label}: shot list ${list.briefId} has 4-8 items`,
      list.items.length >= 4 && list.items.length <= 8,
      `Got ${list.items.length}`
    );
    const midpointSum = sumShotMidpoints(list);
    record(
      `${label}: shot list ${list.briefId} midpoint sum within +-2s of brief duration`,
      Math.abs(midpointSum - brief.durationSeconds) <= 2,
      `Sum=${midpointSum}, briefDuration=${brief.durationSeconds}`
    );
    record(
      `${label}: shot list ${list.briefId} every shot has valid kind/angle/duration and non-empty framing/sound`,
      list.items.every(
        (it) =>
          VALID_SHOT_KINDS.includes(it.kind) &&
          VALID_CAMERA_ANGLES.includes(it.angle) &&
          VALID_SHOT_DURATIONS.includes(it.duration) &&
          typeof it.framing === "string" &&
          it.framing.length > 0 &&
          typeof it.sound === "string" &&
          it.sound.length > 0
      )
    );
    // Scene indexes are 1..N contiguous.
    const idxOk = list.items.every((it, j) => it.index === j + 1);
    record(`${label}: shot list ${list.briefId} indexes are 1..N contiguous`, idxOk);
  }
}

// Two different examples produce different shot list contents.
expectDifferent(
  "shotLists differ between astro and plotline examples",
  a.shotLists,
  b.shotLists
);

// Determinism: same input twice produces identical shot lists.
record(
  "buildStrategy is deterministic for shotLists",
  JSON.stringify(aTwice.shotLists) === JSON.stringify(a.shotLists)
);

// Export brief picks up both new sections.
expectContains("export brief contains Creator Briefs", brief, "## Creator Briefs");
expectContains("export brief contains Shot Lists", brief, "## Shot Lists");

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
