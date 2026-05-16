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
  critiqueHook,
  diagnoseKpi,
  buildKpiLadder,
  assessTrackingReadiness,
  buildAdReviewChecklist,
  applyAdReview,
  buildJourneyStatus,
  spinAdVariants,
  baseConceptFromBrief,
  generateVideoScripts,
} from "../src/lib/engine";
import { ASTRO_DATING_EXAMPLE, NOTION_LIKE_EXAMPLE } from "../src/lib/example";
import type {
  BriefSectionKind,
  CameraAngle,
  CampaignType,
  DiagnosisCategory,
  JourneyStage,
  KpiName,
  KpiSnapshot,
  LadderTier,
  ProductInput,
  ShotDuration,
  ShotKind,
  VariantAxis,
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

// ---- V5: Hook Critic ----

const VALID_FLAG_SEVERITIES = new Set(["low", "medium", "high"]);

const hc1 = critiqueHook(
  "Buy AstroDating today — it's the best dating app you'll ever try.",
  ASTRO_DATING_EXAMPLE
);
expectBetween("hook critic: score is 0-100", hc1.score, 0, 100);
record("hook critic: returns rewrite string", hc1.rewrite.length > 0);
record("hook critic: returns rationale string", hc1.rationale.length > 0);
record("hook critic: returns flags array", Array.isArray(hc1.flags));
record(
  "hook critic: bland or product-name-leading hook returns at least one flag",
  hc1.flags.length >= 1
);
record(
  "hook critic: every flag has a valid severity",
  hc1.flags.every((f) => VALID_FLAG_SEVERITIES.has(f.severity))
);
record(
  "hook critic: every flag has non-empty message and fix",
  hc1.flags.every((f) => f.message.length > 0 && f.fix.length > 0)
);

// Determinism.
const hc1Twice = critiqueHook(
  "Buy AstroDating today — it's the best dating app you'll ever try.",
  ASTRO_DATING_EXAMPLE
);
record(
  "hook critic: deterministic for identical inputs",
  JSON.stringify(hc1) === JSON.stringify(hc1Twice)
);

// Long draft → too-long flag.
const longDraft =
  "If you have been swiping for years and still feel like nothing real ever lands in the inbox, that very particular tired feeling is the part of dating that no one names out loud.";
const hcLong = critiqueHook(longDraft, ASTRO_DATING_EXAMPLE);
record(
  "hook critic: long draft yields too-long flag",
  hcLong.flags.some((f) => f.kind === "too-long")
);

// Empty draft does not throw.
const hcEmpty = critiqueHook("", ASTRO_DATING_EXAMPLE);
record("hook critic: empty draft returns object without throwing", typeof hcEmpty.score === "number");

// Strong draft → higher score than weak draft on same input.
const hcStrong = critiqueHook(
  "Tired of shallow swiping? Voice intros change the first reply.",
  ASTRO_DATING_EXAMPLE
);
record(
  "hook critic: stronger draft scores higher than weak one",
  hcStrong.score >= hc1.score
);

// ---- V5: Video Scripts ----

record(
  "videoScripts: one per brief (astro)",
  a.videoScripts.length === a.creatorBriefs.length
);
record(
  "videoScripts: one per brief (plotline)",
  b.videoScripts.length === b.creatorBriefs.length
);

for (const strat of [a, b]) {
  for (const script of strat.videoScripts) {
    const brief = strat.creatorBriefs.find((br) => br.id === script.briefId);
    if (!brief) {
      record(`videoScripts: ${script.briefId} brief lookup`, false);
      continue;
    }
    // Sum of line durations per section within ±1s of section duration.
    for (let i = 0; i < brief.sections.length; i++) {
      const sectionLines = script.lines.filter((l) => l.briefSectionIndex === i);
      record(
        `videoScripts: ${script.briefId} section ${i} has >= 1 line`,
        sectionLines.length >= 1
      );
      const sectionSum = sectionLines.reduce((acc, l) => acc + l.durationSeconds, 0);
      const target = brief.sections[i].durationSeconds;
      const within = Math.abs(sectionSum - target) <= 1;
      record(
        `videoScripts: ${script.briefId} section ${i} duration sum within +-1s`,
        within,
        within ? undefined : `sum=${sectionSum} target=${target}`
      );
    }
    const within = Math.abs(script.totalDurationSeconds - brief.durationSeconds) <= 2;
    record(
      `videoScripts: ${script.briefId} total duration within +-2s of brief`,
      within,
      within
        ? undefined
        : `total=${script.totalDurationSeconds} brief=${brief.durationSeconds}`
    );
  }
}

// Determinism: generated again equals first.
const scriptsTwice = generateVideoScripts(a.creatorBriefs, ASTRO_DATING_EXAMPLE);
record(
  "videoScripts: deterministic across calls",
  JSON.stringify(scriptsTwice) === JSON.stringify(a.videoScripts)
);

// Two materially different inputs produce different scripts.
expectDifferent(
  "videoScripts: differ between astro and plotline",
  a.videoScripts,
  b.videoScripts
);

// ---- V5: Variant Spinner ----

record(
  "variantSets: one per brief (astro)",
  a.variantSets.length === a.creatorBriefs.length
);
record(
  "variantSets: one per brief (plotline)",
  b.variantSets.length === b.creatorBriefs.length
);

const VALID_AXES: VariantAxis[] = ["hook", "hold", "proof", "cta", "offer"];

for (const strat of [a, b]) {
  for (const vset of strat.variantSets) {
    record(
      `variantSets: ${vset.baseConceptId} has exactly 5 variants`,
      vset.variants.length === 5
    );
    const axisSet = new Set(vset.variants.map((v) => v.changedAxis));
    record(
      `variantSets: ${vset.baseConceptId} covers all 5 axes`,
      VALID_AXES.every((ax) => axisSet.has(ax))
    );
    record(
      `variantSets: ${vset.baseConceptId} every variant has non-empty rationale`,
      vset.variants.every((v) => v.rationale.length > 0)
    );
  }
}

// Each variant changes exactly ONE axis (other 4 byte-identical to base).
const sampleBase = baseConceptFromBrief(
  a.creatorBriefs[0],
  ASTRO_DATING_EXAMPLE,
  a.offers
);
const sampleSet = spinAdVariants(sampleBase, ASTRO_DATING_EXAMPLE, a.offers);
for (const v of sampleSet.variants) {
  const fieldsToCheck: { axis: VariantAxis; baseVal: string; variantVal: string }[] = [
    { axis: "hook", baseVal: sampleBase.hook, variantVal: v.hook },
    { axis: "hold", baseVal: sampleBase.hold, variantVal: v.hold },
    { axis: "proof", baseVal: sampleBase.proof, variantVal: v.proof },
    { axis: "cta", baseVal: sampleBase.cta, variantVal: v.cta },
    { axis: "offer", baseVal: sampleBase.offer, variantVal: v.offer },
  ];
  // Exactly one mismatch, on the named axis.
  const mismatches = fieldsToCheck.filter((f) => f.baseVal !== f.variantVal);
  record(
    `variantSets: variant ${v.id} mutates exactly one axis`,
    mismatches.length === 1
  );
  record(
    `variantSets: variant ${v.id} mutated axis matches changedAxis`,
    mismatches.length === 1 && mismatches[0].axis === v.changedAxis
  );
}

// Determinism.
const sampleSetTwice = spinAdVariants(sampleBase, ASTRO_DATING_EXAMPLE, a.offers);
record(
  "variantSets: deterministic across calls",
  JSON.stringify(sampleSet) === JSON.stringify(sampleSetTwice)
);

// ---- V5: Tracking Readiness ----

const tr = a.trackingReadiness;
expectBetween("trackingReadiness: score 0-100", tr.score, 0, 100);
record(
  "trackingReadiness: status is one of three",
  tr.status === "ready" || tr.status === "almost" || tr.status === "not-ready"
);
record("trackingReadiness: blockers count >= 0", tr.blockers >= 0);
record("trackingReadiness: warnings count >= 0", tr.warnings >= 0);
record("trackingReadiness: at least 8 checks", tr.checks.length >= 8);
record(
  "trackingReadiness: every check has label and rationale",
  tr.checks.every((c) => c.label.length > 0 && c.rationale.length > 0)
);

// Determinism.
const trTwice = assessTrackingReadiness(ASTRO_DATING_EXAMPLE);
record(
  "trackingReadiness: deterministic across calls",
  JSON.stringify(trTwice) === JSON.stringify(tr)
);

// ---- V5: KPI Ladder ----

const ladder = a.kpiLadder;
record(
  "kpiLadder: tiers length === 3",
  ladder.tiers.length === 3
);
record(
  "kpiLadder: exactly 24 targets (8 KPIs × 3 tiers)",
  ladder.targets.length === 24,
  `Got ${ladder.targets.length}`
);

const expectedKpis: KpiName[] = ["ctr", "cpc", "cpm", "cpa", "cvr", "roas", "hookRate", "holdRate"];
const expectedTiers: LadderTier[] = ["starter", "healthy", "scaling"];
for (const k of expectedKpis) {
  for (const t of expectedTiers) {
    const target = ladder.targets.find((x) => x.kpi === k && x.tier === t);
    record(
      `kpiLadder: target present for ${k} × ${t}`,
      !!target
    );
    if (target) {
      if (target.direction === "higher-better") {
        record(
          `kpiLadder: ${k}/${t} higher-better has scaling >= breakeven`,
          target.scaling >= target.breakeven,
          `scaling=${target.scaling} breakeven=${target.breakeven}`
        );
      } else {
        record(
          `kpiLadder: ${k}/${t} lower-better has scaling <= breakeven`,
          target.scaling <= target.breakeven,
          `scaling=${target.scaling} breakeven=${target.breakeven}`
        );
      }
    }
  }
}

// Determinism.
const ladderTwice = buildKpiLadder(ASTRO_DATING_EXAMPLE);
record(
  "kpiLadder: deterministic across calls",
  JSON.stringify(ladderTwice) === JSON.stringify(ladder)
);

// ---- V5: KPI Diagnosis ----

const VALID_DIAG_CATS: DiagnosisCategory[] = [
  "creative",
  "landing-page",
  "offer",
  "audience",
  "tracking",
  "fatigue",
  "healthy",
];

record(
  "kpiDiagnosis: primaryCategory is a valid kind",
  VALID_DIAG_CATS.includes(a.kpiDiagnosis.primaryCategory)
);
record(
  "kpiDiagnosis: findings non-empty for default snapshot",
  a.kpiDiagnosis.findings.length > 0
);

// Healthy snapshot → primaryCategory === "healthy". Build one from the
// scaling tier so every value is in the "above-breakeven" envelope.
const scalingTargets = a.kpiLadder.targets.filter((t) => t.tier === "scaling");
const healthySnap: KpiSnapshot = {};
for (const t of scalingTargets) {
  const value = t.direction === "higher-better" ? t.scaling : t.scaling; // scaling tightens both directions
  // Use values that are inside healthy-tier envelope:
  const ht = a.kpiLadder.targets.find((x) => x.kpi === t.kpi && x.tier === "healthy");
  if (!ht) continue;
  if (ht.direction === "higher-better") {
    healthySnap[t.kpi] = ht.breakeven + (ht.scaling - ht.breakeven) / 2;
  } else {
    healthySnap[t.kpi] = ht.scaling + (ht.breakeven - ht.scaling) / 2;
  }
}
const healthyDiag = diagnoseKpi(healthySnap, a.kpiLadder, ASTRO_DATING_EXAMPLE);
record(
  "kpiDiagnosis: healthy snapshot returns primaryCategory 'healthy'",
  healthyDiag.primaryCategory === "healthy",
  `Got ${healthyDiag.primaryCategory}`
);

// Determinism.
const diagTwice = diagnoseKpi(a.kpiDiagnosis.snapshot, a.kpiLadder, ASTRO_DATING_EXAMPLE);
record(
  "kpiDiagnosis: deterministic across calls",
  JSON.stringify(diagTwice) === JSON.stringify(a.kpiDiagnosis)
);

// ---- V5: Ad Review Checklist ----

const review = a.adReview;
record("adReview: axes >= 12", review.axes.length >= 12, `Got ${review.axes.length}`);
record("adReview: totalWeight > 0", review.totalWeight > 0);
record(
  "adReview: every axis has non-empty label and question",
  review.axes.every((ax) => ax.label.length > 0 && ax.question.length > 0)
);
record(
  "adReview: every weight is 1, 2, or 3",
  review.axes.every((ax) => ax.weight === 1 || ax.weight === 2 || ax.weight === 3)
);

// Determinism.
const reviewTwice = buildAdReviewChecklist(ASTRO_DATING_EXAMPLE);
record(
  "adReview: deterministic across calls",
  JSON.stringify(reviewTwice) === JSON.stringify(review)
);

// ---- V5: Journey Status ----

const VALID_STAGES: JourneyStage[] = [
  "strategy-drafted",
  "creative-planned",
  "tracking-ready",
  "kpi-aligned",
  "review-passed",
  "ready-to-spend",
];

record(
  "journeyStatus: currentStage is a valid stage",
  VALID_STAGES.includes(a.journeyStatus.currentStage)
);
record(
  "journeyStatus: readyToSpend is boolean",
  typeof a.journeyStatus.readyToSpend === "boolean"
);
record(
  "journeyStatus: nextStep non-empty",
  a.journeyStatus.nextStep.length > 0
);

// Zero briefs → "strategy-drafted".
const emptyJourney = buildJourneyStatus({
  trackingReadiness: a.trackingReadiness,
  kpiLadder: a.kpiLadder,
  kpiDiagnosis: a.kpiDiagnosis,
  adReview: a.adReview,
  creatorBriefs: [],
  shotLists: [],
  videoScripts: [],
  variantSets: [],
});
record(
  "journeyStatus: zero briefs → 'strategy-drafted'",
  emptyJourney.currentStage === "strategy-drafted"
);

// All-green case — synthesise inputs that pass every gate.
const allGreenTracking = {
  ...a.trackingReadiness,
  score: 95,
  blockers: 0,
  warnings: 0,
  checks: a.trackingReadiness.checks.map((c) => ({ ...c, status: "passed" as const, fix: undefined })),
  status: "ready" as const,
};
const allGreenDiag = {
  ...a.kpiDiagnosis,
  primaryCategory: "healthy" as const,
  findings: [
    {
      category: "healthy" as const,
      signal: "all sampled KPIs within healthy bounds",
      inference: "sample is within healthy envelope",
      recommendedAction: "scale in 20% steps",
    },
  ],
};
const greenJourney = buildJourneyStatus({
  trackingReadiness: allGreenTracking,
  kpiLadder: a.kpiLadder,
  kpiDiagnosis: allGreenDiag,
  adReview: a.adReview,
  creatorBriefs: a.creatorBriefs,
  shotLists: a.shotLists,
  videoScripts: a.videoScripts,
  variantSets: a.variantSets,
});
record(
  "journeyStatus: all-green inputs → 'ready-to-spend'",
  greenJourney.currentStage === "ready-to-spend",
  `Got ${greenJourney.currentStage}`
);

// Determinism.
const jsTwice = buildJourneyStatus({
  trackingReadiness: a.trackingReadiness,
  kpiLadder: a.kpiLadder,
  kpiDiagnosis: a.kpiDiagnosis,
  adReview: a.adReview,
  creatorBriefs: a.creatorBriefs,
  shotLists: a.shotLists,
  videoScripts: a.videoScripts,
  variantSets: a.variantSets,
});
record(
  "journeyStatus: deterministic across calls",
  JSON.stringify(jsTwice) === JSON.stringify(a.journeyStatus)
);

// ---- V5: Export brief contains every new section header ----

expectContains("export brief contains Video Scripts", brief, "## Video Scripts");
expectContains("export brief contains Ad Variants", brief, "## Ad Variants");
expectContains("export brief contains Tracking Readiness", brief, "## Tracking Readiness");
expectContains("export brief contains KPI Target Ladder", brief, "## KPI Target Ladder");
expectContains("export brief contains KPI Diagnosis", brief, "## KPI Diagnosis");
expectContains("export brief contains Ad Review Checklist", brief, "## Ad Review Checklist");
expectContains("export brief contains Journey Status", brief, "## Journey Status");

// ---- V5: buildStrategy determinism over the entire return ----

const aThird = buildStrategy(ASTRO_DATING_EXAMPLE);
record(
  "buildStrategy: deterministic for videoScripts",
  JSON.stringify(aThird.videoScripts) === JSON.stringify(a.videoScripts)
);
record(
  "buildStrategy: deterministic for variantSets",
  JSON.stringify(aThird.variantSets) === JSON.stringify(a.variantSets)
);
record(
  "buildStrategy: deterministic for trackingReadiness",
  JSON.stringify(aThird.trackingReadiness) === JSON.stringify(a.trackingReadiness)
);
record(
  "buildStrategy: deterministic for kpiLadder",
  JSON.stringify(aThird.kpiLadder) === JSON.stringify(a.kpiLadder)
);
record(
  "buildStrategy: deterministic for kpiDiagnosis",
  JSON.stringify(aThird.kpiDiagnosis) === JSON.stringify(a.kpiDiagnosis)
);
record(
  "buildStrategy: deterministic for adReview",
  JSON.stringify(aThird.adReview) === JSON.stringify(a.adReview)
);
record(
  "buildStrategy: deterministic for journeyStatus",
  JSON.stringify(aThird.journeyStatus) === JSON.stringify(a.journeyStatus)
);

// ---- Refinement 2: structured JourneyBlocker payload ----

record(
  "journeyStatus.blockers is an array",
  Array.isArray(a.journeyStatus.blockers)
);
record(
  "journeyStatus.warnings is an array",
  Array.isArray(a.journeyStatus.warnings)
);
record(
  "journeyStatus: every blocker has kind, severity === 'blocker', non-empty message",
  a.journeyStatus.blockers.every(
    (b) =>
      typeof b.kind === "string" &&
      b.kind.length > 0 &&
      b.severity === "blocker" &&
      typeof b.message === "string" &&
      b.message.length > 0
  )
);
record(
  "journeyStatus: every warning has kind, severity === 'warning', non-empty message",
  a.journeyStatus.warnings.every(
    (w) =>
      typeof w.kind === "string" &&
      w.kind.length > 0 &&
      w.severity === "warning" &&
      typeof w.message === "string" &&
      w.message.length > 0
  )
);
const validBlockerKinds = new Set(["tracking", "kpi", "review", "creative", "scope"]);
record(
  "journeyStatus: every blocker.kind is a valid JourneyBlockerKind",
  a.journeyStatus.blockers.every((b) => validBlockerKinds.has(b.kind))
);
record(
  "journeyStatus: every warning.kind is a valid JourneyBlockerKind",
  a.journeyStatus.warnings.every((w) => validBlockerKinds.has(w.kind))
);
record(
  "journeyStatus: tracking-sourced warnings carry a sourceCheck",
  a.journeyStatus.warnings
    .filter((w) => w.kind === "tracking")
    .every((w) => typeof w.sourceCheck === "string" && w.sourceCheck.length > 0)
);
// Determinism on the structured payload — entire JourneyStatus including blockers/warnings.
record(
  "journeyStatus: structured payload is deterministic across runs",
  JSON.stringify(a.journeyStatus.blockers) ===
    JSON.stringify(aThird.journeyStatus.blockers) &&
    JSON.stringify(a.journeyStatus.warnings) ===
      JSON.stringify(aThird.journeyStatus.warnings)
);

// ---- Refinement 3: Applied Ad Review ----

const VALID_FINDING_VERDICTS = new Set([
  "passed",
  "partial",
  "missing",
  "unknown",
]);

record(
  "appliedAdReviews: one per brief (astro)",
  a.appliedAdReviews.length === a.creatorBriefs.length,
  `Got ${a.appliedAdReviews.length} vs ${a.creatorBriefs.length}`
);
record(
  "appliedAdReviews: one per brief (plotline)",
  b.appliedAdReviews.length === b.creatorBriefs.length
);

for (const review of a.appliedAdReviews) {
  record(
    `appliedAdReviews: ${review.targetId} findings length === checklist axes`,
    review.findings.length === a.adReview.axes.length
  );
  record(
    `appliedAdReviews: ${review.targetId} every finding has a valid verdict`,
    review.findings.every((f) => VALID_FINDING_VERDICTS.has(f.verdict))
  );
  // Every finding's weight matches the axis weight at the same kind in the checklist.
  const axisWeightByKind = new Map(
    a.adReview.axes.map((ax) => [ax.kind, ax.weight] as const)
  );
  record(
    `appliedAdReviews: ${review.targetId} finding.weight === axis.weight`,
    review.findings.every((f) => axisWeightByKind.get(f.axis) === f.weight)
  );
  // scoreContribution matches verdict→contribution rule.
  record(
    `appliedAdReviews: ${review.targetId} scoreContribution matches verdict rule`,
    review.findings.every((f) => {
      if (f.verdict === "passed") return f.scoreContribution === f.weight;
      if (f.verdict === "partial")
        return f.scoreContribution === Math.ceil(f.weight / 2);
      return f.scoreContribution === 0;
    })
  );
  record(
    `appliedAdReviews: ${review.targetId} totalScore <= maxScore`,
    review.totalScore <= review.maxScore
  );
  expectBetween(
    `appliedAdReviews: ${review.targetId} scorePercent in [0, 100]`,
    review.scorePercent,
    0,
    100
  );
  // Verdict threshold check: percent >= 80 → ready, [50..79] → almost, else not-ready.
  const expectedVerdict =
    review.scorePercent >= 80
      ? "ready"
      : review.scorePercent >= 50
      ? "almost"
      : "not-ready";
  record(
    `appliedAdReviews: ${review.targetId} verdict matches scorePercent threshold`,
    review.verdict === expectedVerdict,
    `percent=${review.scorePercent} verdict=${review.verdict} expected=${expectedVerdict}`
  );
  // Every fix is present when verdict !== "passed".
  record(
    `appliedAdReviews: ${review.targetId} non-passed findings carry a fix`,
    review.findings
      .filter((f) => f.verdict !== "passed")
      .every((f) => typeof f.fix === "string" && f.fix.length > 0)
  );
  // Every evidence is non-empty.
  record(
    `appliedAdReviews: ${review.targetId} every finding has non-empty evidence`,
    review.findings.every((f) => f.evidence.length > 0)
  );
}

// applyAdReview against a concept also produces a valid AppliedAdReview.
const sampleConcept = baseConceptFromBrief(
  a.creatorBriefs[0],
  ASTRO_DATING_EXAMPLE,
  a.offers
);
const conceptReview = applyAdReview(
  { kind: "concept", concept: sampleConcept },
  ASTRO_DATING_EXAMPLE,
  a.adReview
);
record(
  "applyAdReview(concept): findings length === axes",
  conceptReview.findings.length === a.adReview.axes.length
);
record(
  "applyAdReview(concept): targetKind === 'concept'",
  conceptReview.targetKind === "concept"
);
record(
  "applyAdReview(concept): scorePercent in [0, 100]",
  conceptReview.scorePercent >= 0 && conceptReview.scorePercent <= 100
);

// Determinism on the full applied review across runs.
const aFourth = buildStrategy(ASTRO_DATING_EXAMPLE);
record(
  "appliedAdReviews: deterministic across runs (full payload)",
  JSON.stringify(aFourth.appliedAdReviews) ===
    JSON.stringify(a.appliedAdReviews)
);
const conceptReviewTwice = applyAdReview(
  { kind: "concept", concept: sampleConcept },
  ASTRO_DATING_EXAMPLE,
  a.adReview
);
record(
  "applyAdReview(concept): deterministic across runs",
  JSON.stringify(conceptReviewTwice) === JSON.stringify(conceptReview)
);

// Export brief contains Applied Ad Reviews section.
expectContains(
  "export brief contains Applied Ad Reviews",
  brief,
  "## Applied Ad Reviews"
);

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
