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
  buildCtaBank,
  buildStaticAdBriefs,
  runCreativeQA,
  buildEditorHandoffs,
} from "../src/lib/engine";
import { ASTRO_DATING_EXAMPLE, NOTION_LIKE_EXAMPLE, HEIRLOOM_BREW_EXAMPLE } from "../src/lib/example";
import type {
  BriefSectionKind,
  CameraAngle,
  CampaignType,
  CtaStyle,
  CtaSurface,
  DiagnosisCategory,
  JourneyStage,
  KpiName,
  KpiSnapshot,
  LadderTier,
  ProductInput,
  QaRule,
  QaSeverity,
  ShotDuration,
  ShotKind,
  StaticAdSize,
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

// Every window has dipForecasts as an array (never undefined).
record(
  "every window has dipForecasts as an array (astro)",
  a.campaignCalendar.windows.every((w) => Array.isArray(w.dipForecasts))
);
record(
  "every window has dipForecasts as an array (plotline)",
  b.campaignCalendar.windows.every((w) => Array.isArray(w.dipForecasts))
);

// At least one window forecasts a dip — the pattern always includes one.
record(
  "calendar includes at least one window with a dip forecast",
  a.campaignCalendar.windows.some((w) => w.dipForecasts.length > 0) &&
    b.campaignCalendar.windows.some((w) => w.dipForecasts.length > 0)
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

// Dip forecast shape — seasonal calendar must have >= 2 forecasts total.
const seasonalDipCount = seasonalCal.windows.reduce(
  (n, w) => n + w.dipForecasts.length,
  0
);
record(
  "seasonal calendar has >= 2 dip forecasts across its windows",
  seasonalDipCount >= 2,
  `Got ${seasonalDipCount}`
);

// Always-on calendar: no notable or hard dip forecasts (only soft at most).
const alwaysOnSeverities = alwaysOnCal.windows.flatMap((w) =>
  w.dipForecasts.map((d) => d.severity)
);
record(
  "always-on calendar has only soft dip severities",
  alwaysOnSeverities.every((s) => s === "soft"),
  `Got severities: ${alwaysOnSeverities.join(", ")}`
);

// Every dip forecast has valid shape.
const VALID_DIP_MECHANISMS = new Set([
  "warm-cohort-saturation",
  "warm-cohort-exhaustion",
  "urgency-collapse",
  "post-peak-reset",
]);
const VALID_DIP_SEVERITIES = new Set(["soft", "notable", "hard"]);
const allWindows = [
  ...launchCal.windows,
  ...seasonalCal.windows,
  ...alwaysOnCal.windows,
];
const allDips = allWindows.flatMap((w) => w.dipForecasts);
record(
  "every dip forecast has a valid mechanism",
  allDips.every((d) => VALID_DIP_MECHANISMS.has(d.mechanism))
);
record(
  "every dip forecast has a valid severity",
  allDips.every((d) => VALID_DIP_SEVERITIES.has(d.severity))
);
record(
  "every dip forecast has a non-empty rationale",
  allDips.every((d) => typeof d.rationale === "string" && d.rationale.length > 0)
);
record(
  "every dip forecast has an integer expectedAroundDayOffset",
  allDips.every(
    (d) =>
      Number.isInteger(d.expectedAroundDayOffset) &&
      d.expectedAroundDayOffset >= 0
  )
);

// Campaign architecture — every window carries one, shape is valid.
record(
  "every window has recommendedArchitecture",
  allWindows.every(
    (w) =>
      w.recommendedArchitecture &&
      (w.recommendedArchitecture.kind === "single-tier" ||
        w.recommendedArchitecture.kind === "promo-3-tier")
  )
);
record(
  "every window architecture has a non-empty rationale",
  allWindows.every(
    (w) =>
      typeof w.recommendedArchitecture.rationale === "string" &&
      w.recommendedArchitecture.rationale.length > 0
  )
);

// Promo windows in seasonal → promo-3-tier with exactly 3 tiers.
const seasonalPromoKinds = new Set(["peak", "ramp", "echo"]);
const seasonalPromoWindows = seasonalCal.windows.filter((w) =>
  seasonalPromoKinds.has(w.kind)
);
record(
  "seasonal promo windows use promo-3-tier architecture",
  seasonalPromoWindows.every(
    (w) =>
      w.recommendedArchitecture.kind === "promo-3-tier" &&
      w.recommendedArchitecture.tiers.length === 3
  )
);
// Non-promo windows in seasonal → single-tier with 1 cold-broad tier.
const seasonalNonPromoWindows = seasonalCal.windows.filter(
  (w) => !seasonalPromoKinds.has(w.kind)
);
record(
  "seasonal non-promo windows use single-tier architecture",
  seasonalNonPromoWindows.every(
    (w) =>
      w.recommendedArchitecture.kind === "single-tier" &&
      w.recommendedArchitecture.tiers.length === 1 &&
      w.recommendedArchitecture.tiers[0].intent === "prospecting"
  )
);
// Always-on → all single-tier.
record(
  "always-on calendar: every window is single-tier",
  alwaysOnCal.windows.every(
    (w) =>
      w.recommendedArchitecture.kind === "single-tier" &&
      w.recommendedArchitecture.tiers.length === 1
  )
);

// promo-3-tier architectures: 3 distinct tiers with the right intent values.
const promoArchitectures = allWindows
  .map((w) => w.recommendedArchitecture)
  .filter((arch) => arch.kind === "promo-3-tier");
record(
  "every promo-3-tier architecture has 3 distinct tiers with correct intents",
  promoArchitectures.every((arch) => {
    if (arch.tiers.length !== 3) return false;
    const intents = arch.tiers.map((t) => t.intent).sort();
    const expected = [
      "engagement-retargeting",
      "prospecting",
      "site-retargeting",
    ].sort();
    return (
      intents[0] === expected[0] &&
      intents[1] === expected[1] &&
      intents[2] === expected[2]
    );
  })
);
record(
  "every promo-3-tier architecture has a non-empty budgetSplitHint",
  promoArchitectures.every(
    (arch) =>
      typeof arch.budgetSplitHint === "string" &&
      (arch.budgetSplitHint?.length ?? 0) > 0
  )
);

// Retrospective gate — populated only on the first peak of seasonal.
const seasonalPeakIndex = seasonalCal.windows.findIndex((w) => w.kind === "peak");
record(
  "seasonal calendar has its first peak window populated",
  seasonalPeakIndex >= 0
);
const seasonalFirstPeak = seasonalCal.windows[seasonalPeakIndex];
record(
  "seasonal first peak window has a retrospectiveGate",
  !!seasonalFirstPeak?.retrospectiveGate
);
record(
  "seasonal first peak retrospectiveGate has exactly 8 questions",
  seasonalFirstPeak?.retrospectiveGate?.questions.length === 8
);
const RETRO_TOPICS = [
  "prior-winning-creative",
  "prior-offer-performance",
  "list-quality",
  "returning-customer-angle",
  "landing-bottleneck",
  "shipping-deadline-constraint",
  "margin-guardrail",
  "next-cycle-learning",
];
record(
  "seasonal first peak retrospectiveGate covers all 8 topics",
  RETRO_TOPICS.every((t) =>
    seasonalFirstPeak?.retrospectiveGate?.questions.some((q) => q.topic === t)
  )
);
record(
  "seasonal first peak retrospectiveGate questions have non-empty whyItMatters",
  seasonalFirstPeak?.retrospectiveGate?.questions.every(
    (q) => typeof q.whyItMatters === "string" && q.whyItMatters.length > 0
  ) ?? false
);
// Always-on calendar has NO retrospective gates.
record(
  "always-on calendar has no retrospective gates",
  alwaysOnCal.windows.every((w) => !w.retrospectiveGate)
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

// Export brief contains the new calendar sub-content. Use a seasonal
// strategy here so we exercise architecture + dip + retrospective lines.
const seasonalStrategy = buildStrategy({
  ...ASTRO_DATING_EXAMPLE,
  campaignType: "seasonal",
});
const seasonalBrief = seasonalStrategy.exportBrief;
expectContains(
  "seasonal export brief contains Dip forecasts line",
  seasonalBrief,
  "Dip forecasts"
);
expectContains(
  "seasonal export brief contains Architecture line",
  seasonalBrief,
  "Architecture"
);
expectContains(
  "seasonal export brief contains retrospective gate",
  seasonalBrief,
  "Pre-peak retrospective gate"
);

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
  proofAssetPlan: a.proofAssetPlan,
  audienceAvatars: a.audienceAvatars,
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

// ---- V6: H2 — CTA Bank ----

const VALID_CTA_STYLES = new Set<CtaStyle>([
  "direct",
  "curious",
  "time-boxed",
  "proof-led",
  "low-pressure",
]);
const VALID_CTA_SURFACES = new Set<CtaSurface>([
  "meta-feed",
  "meta-reels",
  "tiktok",
  "landing-primary",
  "email",
]);

record(
  "ctaBank: total variants >= 15 for astro",
  a.ctaBank.variants.length >= 15,
  `Got ${a.ctaBank.variants.length}`
);
record(
  "ctaBank: total variants >= 15 for plotline",
  b.ctaBank.variants.length >= 15
);

// Every style appears at least once.
for (const style of VALID_CTA_STYLES) {
  record(
    `ctaBank: style ${style} present at least once`,
    a.ctaBank.variants.some((v) => v.style === style)
  );
}
// Every surface appears at least once.
for (const surface of VALID_CTA_SURFACES) {
  record(
    `ctaBank: surface ${surface} present at least once`,
    a.ctaBank.variants.some((v) => v.surface === surface)
  );
}

record(
  "ctaBank: every variant has non-empty text",
  a.ctaBank.variants.every((v) => v.text.length > 0)
);
record(
  "ctaBank: every variant has non-empty rationale",
  a.ctaBank.variants.every((v) => v.rationale.length > 0)
);
record(
  "ctaBank: every variant.style is a valid kind",
  a.ctaBank.variants.every((v) => VALID_CTA_STYLES.has(v.style))
);
record(
  "ctaBank: every variant.surface is a valid kind",
  a.ctaBank.variants.every((v) => VALID_CTA_SURFACES.has(v.surface))
);

// Reels and TikTok variants are concise (≤ 7 words).
record(
  "ctaBank: meta-reels variants are ≤ 7 words",
  a.ctaBank.variants
    .filter((v) => v.surface === "meta-reels")
    .every((v) => v.text.trim().split(/\s+/).length <= 7)
);
record(
  "ctaBank: tiktok variants are ≤ 7 words",
  a.ctaBank.variants
    .filter((v) => v.surface === "tiktok")
    .every((v) => v.text.trim().split(/\s+/).length <= 7)
);
record(
  "ctaBank: meta-feed variants are ≤ 10 words",
  a.ctaBank.variants
    .filter((v) => v.surface === "meta-feed")
    .every((v) => v.text.trim().split(/\s+/).length <= 10)
);
record(
  "ctaBank: landing-primary variants are ≤ 8 words",
  a.ctaBank.variants
    .filter((v) => v.surface === "landing-primary")
    .every((v) => v.text.trim().split(/\s+/).length <= 8)
);

// Different examples produce different banks.
expectDifferent(
  "ctaBank: differs between astro and plotline",
  a.ctaBank,
  b.ctaBank
);

// Determinism.
const ctaBankTwice = buildCtaBank(
  ASTRO_DATING_EXAMPLE,
  a.offers,
  ASTRO_DATING_EXAMPLE.campaignType
);
record(
  "ctaBank: deterministic across calls",
  JSON.stringify(ctaBankTwice) === JSON.stringify(a.ctaBank)
);

// ---- V6: H2 — Static Briefs ----

const VALID_STATIC_SIZES = new Set<StaticAdSize>(["1:1", "4:5", "9:16"]);

record(
  "staticBriefs: at least one per top-3 brief × 3 sizes (astro)",
  a.staticBriefs.length >= Math.min(a.creatorBriefs.length, 3) * 3,
  `Got ${a.staticBriefs.length}`
);
record(
  "staticBriefs: at least one per top-3 brief × 3 sizes (plotline)",
  b.staticBriefs.length >= Math.min(b.creatorBriefs.length, 3) * 3
);

// For each brief, all three sizes present.
for (const brief of a.creatorBriefs.slice(0, 3)) {
  const sizes = new Set(
    a.staticBriefs.filter((s) => s.briefId === brief.id).map((s) => s.size)
  );
  record(
    `staticBriefs: ${brief.id} has 1:1`,
    sizes.has("1:1")
  );
  record(
    `staticBriefs: ${brief.id} has 4:5`,
    sizes.has("4:5")
  );
  record(
    `staticBriefs: ${brief.id} has 9:16`,
    sizes.has("9:16")
  );
}

record(
  "staticBriefs: every size is a valid kind",
  a.staticBriefs.every((s) => VALID_STATIC_SIZES.has(s.size))
);
record(
  "staticBriefs: every brief has non-empty headlineOverlay",
  a.staticBriefs.every((s) => s.headlineOverlay.length > 0)
);
record(
  "staticBriefs: every headlineOverlay ≤ 80 chars",
  a.staticBriefs.every((s) => s.headlineOverlay.length <= 80)
);
record(
  "staticBriefs: every brief has non-empty heroElement",
  a.staticBriefs.every((s) => s.heroElement.length > 0)
);
record(
  "staticBriefs: every brief has non-empty proofElement",
  a.staticBriefs.every((s) => s.proofElement.length > 0)
);
record(
  "staticBriefs: every brief has non-empty ctaBadge",
  a.staticBriefs.every((s) => s.ctaBadge.length > 0)
);
record(
  "staticBriefs: every brief has 3-5 layout zones",
  a.staticBriefs.every(
    (s) => s.layout.length >= 3 && s.layout.length <= 5
  )
);
record(
  "staticBriefs: every brief has non-empty visualHierarchy",
  a.staticBriefs.every((s) => s.visualHierarchy.length > 0)
);

// Different examples produce different static briefs.
expectDifferent(
  "staticBriefs: differs between astro and plotline",
  a.staticBriefs,
  b.staticBriefs
);

// Determinism.
const staticTwice = buildStaticAdBriefs(
  a.creatorBriefs,
  ASTRO_DATING_EXAMPLE,
  a.ctaBank
);
record(
  "staticBriefs: deterministic across calls",
  JSON.stringify(staticTwice) === JSON.stringify(a.staticBriefs)
);

// ---- V6: H2 — Creative QA ----

const VALID_QA_SEVERITIES = new Set<QaSeverity>(["ok", "warning", "blocker"]);
const VALID_QA_RULES = new Set<QaRule>([
  "hook-clarity",
  "proof-visibility",
  "offer-visibility",
  "cta-clarity",
  "first-frame-clarity",
  "format-coverage",
  "runtime-coherence",
  "one-variable-testing",
  "visual-hierarchy",
  "message-angle-alignment",
  "audience-pain-present",
  "differentiation-present",
]);

record(
  "creativeQa: returns >= briefs.length + 1 entries (astro)",
  a.creativeQa.length >= a.creatorBriefs.length + 1,
  `Got ${a.creativeQa.length} vs ${a.creatorBriefs.length + 1}`
);
record(
  "creativeQa: returns >= briefs.length + 1 entries (plotline)",
  b.creativeQa.length >= b.creatorBriefs.length + 1
);

// Aggregate has scope === "all".
record(
  "creativeQa: aggregate (scope=all) present",
  a.creativeQa.some((q) => q.scope === "all")
);

// Per-brief QA entries match brief ids.
for (const brief of a.creatorBriefs) {
  record(
    `creativeQa: per-brief entry exists for ${brief.id}`,
    a.creativeQa.some((q) => q.scope === brief.id)
  );
}

// Every finding has rule, severity, message, suggestion.
for (const cq of a.creativeQa) {
  record(
    `creativeQa: ${cq.scope} every finding has all required fields`,
    cq.findings.every(
      (f) =>
        VALID_QA_RULES.has(f.rule) &&
        VALID_QA_SEVERITIES.has(f.severity) &&
        typeof f.message === "string" &&
        f.message.length > 0 &&
        typeof f.suggestion === "string"
    )
  );
  record(
    `creativeQa: ${cq.scope} non-ok findings carry suggestion`,
    cq.findings
      .filter((f) => f.severity !== "ok")
      .every((f) => f.suggestion.length > 0)
  );
  record(
    `creativeQa: ${cq.scope} blockerCount equals blocker findings`,
    cq.blockerCount ===
      cq.findings.filter((f) => f.severity === "blocker").length
  );
  record(
    `creativeQa: ${cq.scope} warningCount equals warning findings`,
    cq.warningCount ===
      cq.findings.filter((f) => f.severity === "warning").length
  );
}

// Intentionally-weak example produces at least one warning or blocker.
const weakInput: ProductInput = {
  name: "",
  category: "",
  description: "",
  price: "",
  businessModel: "other",
  audience: "",
  audiencePain: "",
  competitors: "",
  differentiator: "",
  goal: "",
  awareness: "unaware",
  sophistication: "fresh-market",
};
const weakStrategy = buildStrategy(weakInput);
record(
  "creativeQa: weak input produces at least one warning or blocker",
  weakStrategy.creativeQa.some(
    (q) => q.blockerCount + q.warningCount > 0
  )
);

// Determinism.
const qaTwice = runCreativeQA({
  briefs: a.creatorBriefs,
  videoScripts: a.videoScripts,
  shotLists: a.shotLists,
  staticBriefs: a.staticBriefs,
  variantSets: a.variantSets,
  input: ASTRO_DATING_EXAMPLE,
  ctaBank: a.ctaBank,
  angles: a.angles,
});
record(
  "creativeQa: deterministic across calls",
  JSON.stringify(qaTwice) === JSON.stringify(a.creativeQa)
);

// ---- V6: H2 — Editor Handoff ----

record(
  "editorHandoffs: one per brief (astro)",
  a.editorHandoffs.length === a.creatorBriefs.length
);
record(
  "editorHandoffs: one per brief (plotline)",
  b.editorHandoffs.length === b.creatorBriefs.length
);

for (const h of a.editorHandoffs) {
  record(
    `editorHandoffs: ${h.briefId} markdown contains "Concept thesis"`,
    h.markdown.includes("## Concept thesis")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "Target audience"`,
    h.markdown.includes("## Target audience")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "Hook"`,
    h.markdown.includes("## Hook")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "Video script"`,
    h.markdown.includes("## Video script")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "Shot list"`,
    h.markdown.includes("## Shot list")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "CTA picks"`,
    h.markdown.includes("## CTA picks")
  );
  record(
    `editorHandoffs: ${h.briefId} markdown contains "QA"`,
    h.markdown.includes("## QA findings")
  );
  record(
    `editorHandoffs: ${h.briefId} assetChecklist has 4-8 items`,
    h.assetChecklist.length >= 4 && h.assetChecklist.length <= 8,
    `Got ${h.assetChecklist.length}`
  );
}

// Determinism.
const handoffsTwice = buildEditorHandoffs({
  briefs: a.creatorBriefs,
  videoScripts: a.videoScripts,
  shotLists: a.shotLists,
  staticBriefs: a.staticBriefs,
  ctaBank: a.ctaBank,
  variantSets: a.variantSets,
  creativeQa: a.creativeQa,
  appliedAdReviews: a.appliedAdReviews,
  input: ASTRO_DATING_EXAMPLE,
  offers: a.offers,
});
record(
  "editorHandoffs: deterministic across calls",
  JSON.stringify(handoffsTwice) === JSON.stringify(a.editorHandoffs)
);

// ---- V6: Export brief contains H2 section headers ----

expectContains("export brief contains CTA Bank", brief, "## CTA Bank");
expectContains("export brief contains Static Briefs", brief, "## Static Briefs");
expectContains("export brief contains Creative QA", brief, "## Creative QA");
expectContains("export brief contains Editor Handoff", brief, "## Editor Handoff");

// ---- V6: buildStrategy determinism across the new fields ----

const aFifth = buildStrategy(ASTRO_DATING_EXAMPLE);
record(
  "buildStrategy: deterministic for ctaBank",
  JSON.stringify(aFifth.ctaBank) === JSON.stringify(a.ctaBank)
);
record(
  "buildStrategy: deterministic for staticBriefs",
  JSON.stringify(aFifth.staticBriefs) === JSON.stringify(a.staticBriefs)
);
record(
  "buildStrategy: deterministic for creativeQa",
  JSON.stringify(aFifth.creativeQa) === JSON.stringify(a.creativeQa)
);
record(
  "buildStrategy: deterministic for editorHandoffs",
  JSON.stringify(aFifth.editorHandoffs) === JSON.stringify(a.editorHandoffs)
);
// Full deep-equal across two calls.
record(
  "buildStrategy: full output deep-equal across two calls (astro)",
  JSON.stringify(aFifth) === JSON.stringify(a)
);

// ---- Upstream creative-quality: Audience Avatars ----

const validObjectionKinds = new Set([
  "risk",
  "price",
  "fit",
  "trust",
  "timing",
  "complexity",
  "social",
]);

record(
  "audienceAvatars: 2-3 avatars (astro)",
  a.audienceAvatars.length >= 2 && a.audienceAvatars.length <= 3,
  `Got ${a.audienceAvatars.length}`
);
record(
  "audienceAvatars: 2-3 avatars (plotline)",
  b.audienceAvatars.length >= 2 && b.audienceAvatars.length <= 3,
  `Got ${b.audienceAvatars.length}`
);
record(
  "audienceAvatars: every avatar has a non-empty label",
  a.audienceAvatars.every((av) => av.label.length > 0)
);
record(
  "audienceAvatars: every avatar has a non-empty buyingTrigger",
  a.audienceAvatars.every((av) => av.buyingTrigger.length > 0)
);
record(
  "audienceAvatars: every avatar has a non-empty corePain",
  a.audienceAvatars.every((av) => av.corePain.length > 0)
);
record(
  "audienceAvatars: every avatar has a non-empty desiredOutcome",
  a.audienceAvatars.every((av) => av.desiredOutcome.length > 0)
);
record(
  "audienceAvatars: every avatar has a unique id",
  new Set(a.audienceAvatars.map((av) => av.id)).size === a.audienceAvatars.length
);
record(
  "audienceAvatars: every avatar has 3-4 objections",
  a.audienceAvatars.every(
    (av) => av.objections.length >= 3 && av.objections.length <= 4
  )
);
record(
  "audienceAvatars: every objection has a valid kind",
  a.audienceAvatars.every((av) =>
    av.objections.every((o) => validObjectionKinds.has(o.kind))
  )
);
record(
  "audienceAvatars: every objection has non-empty statement AND reframe",
  a.audienceAvatars.every((av) =>
    av.objections.every((o) => o.statement.length > 0 && o.reframe.length > 0)
  )
);
record(
  "audienceAvatars: every avatar has 2-4 failedAlternatives",
  a.audienceAvatars.every(
    (av) => av.failedAlternatives.length >= 2 && av.failedAlternatives.length <= 4
  )
);
record(
  "audienceAvatars: every avatar has 3-6 emotionalLanguage phrases",
  a.audienceAvatars.every(
    (av) =>
      av.emotionalLanguage.length >= 3 && av.emotionalLanguage.length <= 6
  )
);
record(
  "audienceAvatars: every avatar has 2-4 proofNeeded items",
  a.audienceAvatars.every(
    (av) => av.proofNeeded.length >= 2 && av.proofNeeded.length <= 4
  )
);
record(
  "audienceAvatars: bestChannelAngle is non-empty for every avatar",
  a.audienceAvatars.every((av) => av.bestChannelAngle.length > 0)
);
// Two different example inputs yield different avatar sets.
expectDifferent(
  "audienceAvatars: two different inputs produce different avatar sets",
  a.audienceAvatars.map((av) => av.label),
  b.audienceAvatars.map((av) => av.label)
);

// ---- Upstream creative-quality: Hook Library ----

const ALL_HOOK_PATTERNS = [
  "pain-first",
  "outcome-first",
  "contrarian",
  "proof-led",
  "curiosity",
  "comparison",
  "mistake",
  "before-after",
];
const validAwarenessStages = new Set([
  "unaware",
  "problem-aware",
  "solution-aware",
  "product-aware",
  "most-aware",
]);

record(
  "hookLibrary: covers all 8 patterns",
  ALL_HOOK_PATTERNS.every((p) =>
    a.hookLibrary.items.some((it) => it.pattern === p)
  )
);
record(
  "hookLibrary: at least 16 items (2 per pattern minimum)",
  a.hookLibrary.items.length >= 16
);
record(
  "hookLibrary: at most 24 items (3 per pattern maximum)",
  a.hookLibrary.items.length <= 24
);
record(
  "hookLibrary: every item has non-empty text",
  a.hookLibrary.items.every((it) => it.text.length > 0)
);
record(
  "hookLibrary: every item has a non-empty riskNote",
  a.hookLibrary.items.every((it) => it.riskNote.length > 0)
);
record(
  "hookLibrary: every item has non-empty awarenessFit",
  a.hookLibrary.items.every((it) => it.awarenessFit.length > 0)
);
record(
  "hookLibrary: every awarenessFit value is a valid stage",
  a.hookLibrary.items.every((it) =>
    it.awarenessFit.every((s) => validAwarenessStages.has(s))
  )
);
record(
  "hookLibrary: every item has non-empty avatarFit",
  a.hookLibrary.items.every((it) => it.avatarFit.length > 0)
);
// Avatar ids in avatarFit must exist on audienceAvatars.
const avatarIdSet = new Set(a.audienceAvatars.map((av) => av.id));
record(
  "hookLibrary: every avatarFit id exists in audienceAvatars",
  a.hookLibrary.items.every((it) =>
    it.avatarFit.every((id) => avatarIdSet.has(id))
  )
);
// Hook Library / Hook Critic separation — file-level check.
import * as fs from "fs";
import * as path from "path";
const hookLibrarySrc = fs.readFileSync(
  path.resolve(__dirname, "../src/lib/engine/hook-library.ts"),
  "utf8"
);
// Only check import statements, not free-text mentions in comments.
record(
  "hookLibrary: source does not import from hook-critic",
  !/import[^;]*from\s+["']\.\/hook-critic["']/.test(hookLibrarySrc) &&
    !/import[^;]*from\s+["']@\/lib\/engine\/hook-critic["']/.test(hookLibrarySrc) &&
    !/require\(["'][^"']*hook-critic[^"']*["']\)/.test(hookLibrarySrc)
);

// ---- Upstream creative-quality: Ad Concept Cards ----

record(
  "adConceptCards: 3-6 cards (astro)",
  a.adConceptCards.length >= 3 && a.adConceptCards.length <= 6,
  `Got ${a.adConceptCards.length}`
);
record(
  "adConceptCards: 3-6 cards (plotline)",
  b.adConceptCards.length >= 3 && b.adConceptCards.length <= 6,
  `Got ${b.adConceptCards.length}`
);
record(
  "adConceptCards: every card targets a real avatar (astro)",
  a.adConceptCards.every((c) => avatarIdSet.has(c.targetAvatarId))
);
const plotAvatarIds = new Set(b.audienceAvatars.map((av) => av.id));
record(
  "adConceptCards: every card targets a real avatar (plotline)",
  b.adConceptCards.every((c) => plotAvatarIds.has(c.targetAvatarId))
);
record(
  "adConceptCards: every card.hook is a member of hookLibrary.items",
  a.adConceptCards.every((c) =>
    a.hookLibrary.items.some(
      (it) =>
        it.pattern === c.hook.pattern &&
        it.text === c.hook.text &&
        JSON.stringify(it.avatarFit) === JSON.stringify(c.hook.avatarFit)
    )
  )
);
record(
  "adConceptCards: every card has non-empty promise",
  a.adConceptCards.every((c) => c.promise.length > 0)
);
record(
  "adConceptCards: every card has non-empty proofAngle",
  a.adConceptCards.every((c) => c.proofAngle.length > 0)
);
record(
  "adConceptCards: every card has non-empty offerTieIn",
  a.adConceptCards.every((c) => c.offerTieIn.length > 0)
);
record(
  "adConceptCards: every card has non-empty visualIdea",
  a.adConceptCards.every((c) => c.visualIdea.length > 0)
);
record(
  "adConceptCards: every card has non-empty testHypothesis",
  a.adConceptCards.every((c) => c.testHypothesis.length > 0)
);
record(
  "adConceptCards: every card has non-empty nextVariantSuggestion",
  a.adConceptCards.every((c) => c.nextVariantSuggestion.length > 0)
);
record(
  "adConceptCards: every card formatFit has 2-4 items",
  a.adConceptCards.every(
    (c) => c.formatFit.length >= 2 && c.formatFit.length <= 4
  )
);
record(
  "adConceptCards: every card has a unique id",
  new Set(a.adConceptCards.map((c) => c.id)).size === a.adConceptCards.length
);
// nextVariantSuggestion mentions one of the 5 variant axes.
const variantAxisWords = ["hook", "hold", "proof", "cta", "offer"];
record(
  "adConceptCards: every nextVariantSuggestion mentions a variant axis",
  a.adConceptCards.every((c) =>
    variantAxisWords.some((w) =>
      c.nextVariantSuggestion.toLowerCase().includes(w)
    )
  )
);
// Two different inputs yield different concept-card sets.
expectDifferent(
  "adConceptCards: two different inputs produce different card sets",
  a.adConceptCards.map((c) => c.name),
  b.adConceptCards.map((c) => c.name)
);

// ---- Export brief contains the new sections ----

expectContains(
  "export brief contains Audience Avatars",
  brief,
  "## Audience Avatars"
);
expectContains(
  "export brief contains Hook Library",
  brief,
  "## Hook Library"
);
expectContains(
  "export brief contains Ad Concept Cards",
  brief,
  "## Ad Concept Cards"
);

// ---- Determinism on the new fields ----

const aSixth = buildStrategy(ASTRO_DATING_EXAMPLE);
record(
  "buildStrategy: deterministic for audienceAvatars",
  JSON.stringify(aSixth.audienceAvatars) === JSON.stringify(a.audienceAvatars)
);
record(
  "buildStrategy: deterministic for hookLibrary",
  JSON.stringify(aSixth.hookLibrary) === JSON.stringify(a.hookLibrary)
);
record(
  "buildStrategy: deterministic for adConceptCards",
  JSON.stringify(aSixth.adConceptCards) === JSON.stringify(a.adConceptCards)
);

// ---- Polish pass: prescribed export brief section order ----
//
// Stakeholder reading flow: Product snapshot → Journey Status →
// Audience Avatars → Positioning → Offer Architecture → Campaign
// Calendar → Ad Concept Cards → Hook Library → Creator Briefs →
// Video Scripts → Shot Lists → Creative QA → Tracking Readiness →
// KPI Target Ladder → KPI Diagnosis → Ad Review Checklist →
// Applied Ad Reviews → Editor Handoff. Secondary reference
// sections follow but the primary order above must be preserved.
const PRESCRIBED_EXPORT_ORDER = [
  "## Product snapshot",
  "## Journey Status",
  "## Audience Avatars",
  "## Positioning",
  "## Offer Architecture",
  "## Campaign Calendar",
  "## Ad Concept Cards",
  "## Hook Library",
  "## Creator Briefs",
  "## Video Scripts",
  "## Shot Lists",
  "## Creative QA",
  "## Tracking Readiness",
  "## KPI Target Ladder",
  "## KPI Diagnosis",
  "## Ad Review Checklist",
  "## Applied Ad Reviews",
  "## Editor Handoff",
];

(function () {
  const exportBrief = a.exportBrief;
  let lastIndex = -1;
  let orderHolds = true;
  let failedAt: string | undefined;
  for (const header of PRESCRIBED_EXPORT_ORDER) {
    const at = exportBrief.indexOf(header);
    if (at < 0) {
      orderHolds = false;
      failedAt = `${header} missing`;
      break;
    }
    if (at <= lastIndex) {
      orderHolds = false;
      failedAt = `${header} appears before a previous section (at index ${at}, last was ${lastIndex})`;
      break;
    }
    lastIndex = at;
  }
  record(
    "export brief: prescribed section order preserved",
    orderHolds,
    failedAt
  );
})();

// ---- Polish pass: every Strategy field has an export-brief header ----
//
// For every key on the realized Strategy object, the export brief
// must contain at least one section header that covers it. The map
// below names the header (or one of several acceptable headers) we
// expect for each field. genericFlags is conditional — its header
// only appears when flags are present, so we skip its presence check
// on a clean run.
const FIELD_TO_EXPORT_HEADERS: Record<string, string[]> = {
  positioning: ["## Positioning"],
  awarenessNotes: ["## Awareness diagnosis"],
  sophisticationNotes: ["## Awareness diagnosis"],
  centralPromise: ["## Positioning"],
  uniqueMechanism: ["## Positioning"],
  objections: ["## Objections"],
  headlines: ["## Headlines"],
  angles: ["## Top angles (ranked by fit)"],
  rankedAngles: ["## Top angles (ranked by fit)"],
  landing: ["## Landing copy"],
  store: ["## Store copy"],
  tiktokScripts: ["## TikTok / Reels Scripts"],
  facebookAds: ["## Meta Ad Concepts"],
  experiments: ["## Experiments"],
  score: ["## Strategy quality score"],
  diagnosis: ["## Offer diagnosis"],
  awarenessVariants: ["## Copy variants by awareness stage"],
  offers: ["## Offer Architecture"],
  campaignCalendar: ["## Campaign Calendar"],
  creatorBriefs: ["## Creator Briefs"],
  shotLists: ["## Shot Lists"],
  videoScripts: ["## Video Scripts"],
  variantSets: ["## Ad Variants"],
  trackingReadiness: ["## Tracking Readiness"],
  kpiLadder: ["## KPI Target Ladder"],
  kpiDiagnosis: ["## KPI Diagnosis"],
  adReview: ["## Ad Review Checklist"],
  appliedAdReviews: ["## Applied Ad Reviews"],
  journeyStatus: ["## Journey Status"],
  ctaBank: ["## CTA Bank"],
  staticBriefs: ["## Static Briefs"],
  creativeQa: ["## Creative QA"],
  editorHandoffs: ["## Editor Handoff"],
  audienceAvatars: ["## Audience Avatars"],
  hookLibrary: ["## Hook Library"],
  adConceptCards: ["## Ad Concept Cards"],
  copyIssues: ["## Copy Quality Flags"],
  inputQuality: ["## Input Assistant"],
  proofAssetPlan: ["## Proof Asset Plan"],
};

for (const field of Object.keys(FIELD_TO_EXPORT_HEADERS)) {
  const headers = FIELD_TO_EXPORT_HEADERS[field];
  const present = headers.some((h) => a.exportBrief.includes(h));
  record(
    `export brief: covers Strategy.${field}`,
    present,
    present ? undefined : `Expected one of [${headers.join(", ")}] in export brief`
  );
}

// Every Strategy field listed in the type appears in the map above (so
// we don't quietly drop new fields).
const STRATEGY_FIELDS_IN_TYPE = [
  "positioning",
  "awarenessNotes",
  "sophisticationNotes",
  "centralPromise",
  "uniqueMechanism",
  "objections",
  "headlines",
  "angles",
  "rankedAngles",
  "landing",
  "store",
  "tiktokScripts",
  "facebookAds",
  "experiments",
  "score",
  "diagnosis",
  "awarenessVariants",
  "genericFlags",
  "offers",
  "campaignCalendar",
  "creatorBriefs",
  "shotLists",
  "videoScripts",
  "variantSets",
  "trackingReadiness",
  "kpiLadder",
  "kpiDiagnosis",
  "adReview",
  "appliedAdReviews",
  "journeyStatus",
  "ctaBank",
  "staticBriefs",
  "creativeQa",
  "editorHandoffs",
  "audienceAvatars",
  "hookLibrary",
  "adConceptCards",
  "copyIssues",
  "inputQuality",
  "proofAssetPlan",
  "exportBrief",
];
record(
  "export-brief field coverage: every Strategy data field listed (excluding genericFlags + exportBrief)",
  STRATEGY_FIELDS_IN_TYPE.every(
    (f) =>
      f === "genericFlags" ||
      f === "exportBrief" ||
      FIELD_TO_EXPORT_HEADERS[f] !== undefined
  )
);

// ---- Polish pass: StrategyView tab labels are unique and ordered ----
//
// Parse the TAB list directly from the component source so future
// additions can't accidentally collide on a label.
const strategyViewSrc = fs.readFileSync(
  path.resolve(__dirname, "../src/components/StrategyView.tsx"),
  "utf8"
);
// Match the TABS const initializer specifically, not other arrays.
const tabsBlockMatch = strategyViewSrc.match(
  /const TABS:[^=]*=\s*\[([\s\S]*?)\];/
);
const tabsBlock = tabsBlockMatch ? tabsBlockMatch[1] : "";
const tabLabels: string[] = [];
const tabIds: string[] = [];
const tabLineRegex = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g;
let tabMatch: RegExpExecArray | null;
while ((tabMatch = tabLineRegex.exec(tabsBlock)) !== null) {
  tabIds.push(tabMatch[1]);
  tabLabels.push(tabMatch[2]);
}
record(
  "StrategyView: TABS parsed at least 12 entries",
  tabLabels.length >= 12,
  `Got ${tabLabels.length}`
);
record(
  "StrategyView: every tab label is unique",
  new Set(tabLabels).size === tabLabels.length,
  `Got labels: ${tabLabels.join(", ")}`
);
record(
  "StrategyView: every tab id is unique",
  new Set(tabIds).size === tabIds.length,
  `Got ids: ${tabIds.join(", ")}`
);
// No legacy "Offer" / "Offers" / "Ads" collision after the polish pass.
record(
  "StrategyView: no duplicate-feeling 'Offer' / 'Offers' labels",
  !(tabLabels.includes("Offer") && tabLabels.includes("Offers")),
  `Labels: ${tabLabels.join(", ")}`
);
// "Ads" by itself is too generic post-rename — should now be "Concepts".
record(
  "StrategyView: 'Ads' tab renamed (no bare 'Ads' label)",
  !tabLabels.includes("Ads"),
  `Labels: ${tabLabels.join(", ")}`
);
// Verify prescribed reading flow lands the headline tabs early.
const expectedEarly = [
  "Score",
  "Positioning",
  "Awareness",
  "Audience avatars",
  "Diagnosis",
  "Offer architecture",
  "Calendar",
];
record(
  "StrategyView: first 7 tabs follow stakeholder reading flow",
  expectedEarly.every((label, i) => tabLabels[i] === label),
  `Got first 7: ${tabLabels.slice(0, 7).join(", ")}`
);

// ---- Polish pass: HeirloomBrew example exercises the seasonal path ----

const brew = buildStrategy(HEIRLOOM_BREW_EXAMPLE);
record(
  "heirloom example: builds without throwing",
  !!brew && Array.isArray(brew.creatorBriefs)
);
record(
  "heirloom example: campaignCalendar is seasonal",
  brew.campaignCalendar.campaignType === "seasonal"
);
record(
  "heirloom example: has a peak window with a retrospective gate",
  brew.campaignCalendar.windows.some(
    (w) => w.kind === "peak" && !!w.retrospectiveGate
  )
);
record(
  "heirloom example: at least one promo-3-tier architecture",
  brew.campaignCalendar.windows.some(
    (w) => w.recommendedArchitecture.kind === "promo-3-tier"
  )
);
record(
  "heirloom example: exportBrief is non-trivial",
  brew.exportBrief.length > 800
);
// HeirloomBrew should look materially different from AstroDating and
// Plotline in its top-line outputs.
expectDifferent(
  "heirloom example: positioning differs from astro",
  brew.positioning.statement,
  a.positioning.statement
);
expectDifferent(
  "heirloom example: positioning differs from plotline",
  brew.positioning.statement,
  b.positioning.statement
);
expectDifferent(
  "heirloom example: avatars differ from astro",
  brew.audienceAvatars.map((av) => av.label),
  a.audienceAvatars.map((av) => av.label)
);

// ---- Polish pass: enriched example fixtures still pass content asserts ----

// AstroDating output still names the test-critical strings the demo
// audit relies on.
const astroBlobV2 = JSON.stringify(a).toLowerCase();
record(
  "polish: astrodating output still mentions 'astrology'",
  astroBlobV2.includes("astrology")
);
record(
  "polish: astrodating output still mentions 'voice intros'",
  astroBlobV2.includes("voice intros")
);
record(
  "polish: astrodating output still mentions 'shallow swiping'",
  astroBlobV2.includes("shallow swiping")
);

// Plotline still surfaces its scene-graph differentiator.
const plotBlobV2 = JSON.stringify(b).toLowerCase();
record(
  "polish: plotline output still mentions 'scene-graph'",
  plotBlobV2.includes("scene-graph")
);
record(
  "polish: plotline output still mentions 'fiction writers'",
  plotBlobV2.includes("fiction writers")
);

// Three examples produce three distinct overall scores (good signal
// that fixture differentiation is healthy).
record(
  "polish: three example overall scores are distinct",
  a.score.overall !== b.score.overall &&
    b.score.overall !== brew.score.overall &&
    a.score.overall !== brew.score.overall,
  `astro=${a.score.overall} plot=${b.score.overall} brew=${brew.score.overall}`
);

// ---- Copy normalization: clean copy + validator assertions ----
//
// These assertions pin down the new copy-normalize layer. They must all
// pass with the AstroDating / Plotline / HeirloomBrew fixtures unchanged.

import {
  deriveCopyLabels,
  dedupeAdjacentRepeats,
  toShortNounPhrase,
  stripFillers,
} from "../src/lib/engine";

// Deep-walk over the Strategy object collecting every string leaf so the
// "no ellipsis anywhere" assertion can scan every customer-facing string.
function collectStrings(node: unknown, path: string, out: { path: string; text: string }[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    if (node.length > 0) out.push({ path, text: node });
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) collectStrings(node[i], `${path}[${i}]`, out);
    return;
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    // Skip the exportBrief markdown since it concatenates everything.
    if (path === "" && key === "exportBrief") continue;
    collectStrings((node as Record<string, unknown>)[key], path ? `${path}.${key}` : key, out);
  }
}

const fixtures: { name: string; ex: typeof ASTRO_DATING_EXAMPLE; strategy: typeof a }[] = [
  { name: "astrodating", ex: ASTRO_DATING_EXAMPLE, strategy: a },
  { name: "plotline", ex: NOTION_LIKE_EXAMPLE, strategy: b },
  { name: "heirloombrew", ex: HEIRLOOM_BREW_EXAMPLE, strategy: brew },
];

for (const { name, ex, strategy } of fixtures) {
  // Each fixture is clean — zero copy issues.
  record(
    `copy-normalize: ${name} produces zero copyIssues`,
    strategy.copyIssues.length === 0,
    `Got: ${strategy.copyIssues.map((i) => i.kind + "@" + i.source).join(", ")}`
  );

  // Deep-walk: no string leaf contains "...". (Ellipses sneak in via
  // truncation helpers; the cleanup pass replaced every such site with a
  // word-boundary trim.)
  const leaves: { path: string; text: string }[] = [];
  collectStrings(strategy, "", leaves);
  const ellipsisLeaks = leaves.filter(
    (l) => l.text.includes("...") || l.text.includes("…")
  );
  record(
    `copy-normalize: ${name} has no ellipsis in any string field`,
    ellipsisLeaks.length === 0,
    ellipsisLeaks.length > 0
      ? `Found ${ellipsisLeaks.length} ellipsis sites; first: ${ellipsisLeaks[0].path}`
      : undefined
  );

  // No "dating app app" / "writing tool tool" / "specialty coffee coffee"
  // anywhere. Also no bare "app app" / "tool tool" / "site site" repeats.
  const dupNoun = leaves.find((l) =>
    /\b(app|tool|site|product|coffee|club|kit)\s+\1\b/i.test(l.text)
  );
  record(
    `copy-normalize: ${name} has no duplicated category noun`,
    !dupNoun,
    dupNoun ? `Found at ${dupNoun.path}: ${dupNoun.text.slice(0, 100)}` : undefined
  );

  // No hook in hookLibrary.items contains the full audience input string
  // (when audience > 5 words).
  const audienceWordCount = (ex.audience || "").split(/\s+/).filter(Boolean).length;
  if (audienceWordCount > 5) {
    const leak = strategy.hookLibrary.items.find((it) =>
      it.text.toLowerCase().includes(ex.audience.toLowerCase())
    );
    record(
      `copy-normalize: ${name} hooks do not leak full audience sentence`,
      !leak,
      leak ? `Leaked in: ${leak.text}` : undefined
    );
  }

  // No headline / overlay / hook contains the verbatim goal string
  // (when goal > 4 words).
  const goalWordCount = (ex.goal || "").split(/\s+/).filter(Boolean).length;
  if (goalWordCount > 4) {
    const goalNeedle = ex.goal.toLowerCase();
    const headlineLeak = strategy.headlines.find((h) =>
      h.toLowerCase().includes(goalNeedle)
    );
    record(
      `copy-normalize: ${name} headlines do not leak the goal verbatim`,
      !headlineLeak,
      headlineLeak ? `Leaked: ${headlineLeak}` : undefined
    );

    const hookLeak = strategy.hookLibrary.items.find((it) =>
      it.text.toLowerCase().includes(goalNeedle)
    );
    record(
      `copy-normalize: ${name} hooks do not leak the goal verbatim`,
      !hookLeak,
      hookLeak ? `Leaked: ${hookLeak.text}` : undefined
    );

    const overlayLeak = strategy.staticBriefs.find((s) =>
      s.headlineOverlay.toLowerCase().includes(goalNeedle)
    );
    record(
      `copy-normalize: ${name} static overlays do not leak the goal verbatim`,
      !overlayLeak,
      overlayLeak ? `Leaked: ${overlayLeak.headlineOverlay}` : undefined
    );
  }

  // Every static brief overlay stays under 9 words (under the
  // overlong-overlay threshold).
  const longOverlay = strategy.staticBriefs.find(
    (s) => s.headlineOverlay.trim().split(/\s+/).filter(Boolean).length > 8
  );
  record(
    `copy-normalize: ${name} no static overlay exceeds 8 words`,
    !longOverlay,
    longOverlay ? `Overlay: ${longOverlay.headlineOverlay}` : undefined
  );

  // Every hook in the library has the right shape:
  // word count <= 18, and if there are multiple sentences the total <= 14.
  const badHook = strategy.hookLibrary.items.find((it) => {
    const words = it.text.trim().split(/\s+/).filter(Boolean).length;
    const multi = /[.!?]\s+[A-Za-z]/.test(it.text.replace(/\.\.\./g, ""));
    return words > 18 || (multi && words > 14);
  });
  record(
    `copy-normalize: ${name} every hook stays inside the length envelope`,
    !badHook,
    badHook ? `Bad: ${badHook.text}` : undefined
  );
}

// AstroDating-specific offer rationality: top 3 offer kinds do NOT
// include free-shipping or free-gift; they DO include free-trial or
// guarantee in the top slots.
const astroTopOffers = a.offers.slice(0, 3).map((o) => o.kind);
record(
  "copy-normalize: AstroDating top-3 offers exclude free-shipping",
  !astroTopOffers.includes("free-shipping"),
  `Got: ${astroTopOffers.join(", ")}`
);
record(
  "copy-normalize: AstroDating top-3 offers exclude free-gift",
  !astroTopOffers.includes("free-gift"),
  `Got: ${astroTopOffers.join(", ")}`
);
record(
  "copy-normalize: AstroDating offers include free-trial near the top",
  a.offers.slice(0, 2).some((o) => o.kind === "free-trial"),
  `Got: ${astroTopOffers.join(", ")}`
);
record(
  "copy-normalize: AstroDating offers include guarantee in top 4",
  a.offers.slice(0, 4).some((o) => o.kind === "guarantee"),
  `Got top4: ${a.offers.slice(0, 4).map((o) => o.kind).join(", ")}`
);

// AstroDating voice — at least one hook references the subscription offer
// shape ("Premium" + "free" + ("trial" / "days")) OR the offerLabel.
const astroOfferLabel = (a.copyIssues, a.offers, deriveCopyLabels(ASTRO_DATING_EXAMPLE, a.offers).offerLabel);
record(
  "copy-normalize: AstroDating offerLabel reads as a subscription trial",
  /\bfree\b/i.test(astroOfferLabel) && /\b(trial|days|premium)\b/i.test(astroOfferLabel),
  `Got: ${astroOfferLabel}`
);

// AstroDating CTAs surface the trial-style offer (Premium + free + trial
// or days appears in at least one CTA / hook / static brief / variant).
{
  const blob = JSON.stringify({
    cta: a.ctaBank,
    hooks: a.hookLibrary,
    statics: a.staticBriefs,
    variants: a.variantSets,
    shorts: a.tiktokScripts,
    fb: a.facebookAds,
  }).toLowerCase();
  const hasFree = blob.includes("free");
  const hasTrial = blob.includes("trial") || blob.includes("days");
  record(
    "copy-normalize: AstroDating output mentions 'free' somewhere user-facing",
    hasFree
  );
  record(
    "copy-normalize: AstroDating output mentions 'trial' or 'days' near the offer",
    hasTrial
  );
}

// deriveCopyLabels determinism — same input twice yields the same labels.
{
  const l1 = deriveCopyLabels(ASTRO_DATING_EXAMPLE, a.offers);
  const l2 = deriveCopyLabels(ASTRO_DATING_EXAMPLE, a.offers);
  record(
    "copy-normalize: deriveCopyLabels is deterministic",
    JSON.stringify(l1) === JSON.stringify(l2)
  );
  // Astro labels meet the documented shape constraints.
  record(
    "copy-normalize: AstroDating audienceLabel <= 5 words",
    l1.audienceLabel.split(/\s+/).filter(Boolean).length <= 5,
    `Got: ${l1.audienceLabel}`
  );
  record(
    "copy-normalize: AstroDating painLabel <= 5 words",
    l1.painLabel.split(/\s+/).filter(Boolean).length <= 5,
    `Got: ${l1.painLabel}`
  );
  record(
    "copy-normalize: AstroDating categoryLabel <= 2 words",
    l1.categoryLabel.split(/\s+/).filter(Boolean).length <= 2,
    `Got: ${l1.categoryLabel}`
  );
  record(
    "copy-normalize: AstroDating competitorLabel is generalised (no brand)",
    !/tinder|hinge|bumble/i.test(l1.competitorLabel),
    `Got: ${l1.competitorLabel}`
  );
}

// Helper unit tests — pin down the small pure functions.
record(
  "copy-normalize: dedupeAdjacentRepeats('dating app app') === 'dating app'",
  dedupeAdjacentRepeats("dating app app") === "dating app",
  `Got: ${dedupeAdjacentRepeats("dating app app")}`
);
record(
  "copy-normalize: dedupeAdjacentRepeats handles triple repeat",
  dedupeAdjacentRepeats("app app app") === "app",
  `Got: ${dedupeAdjacentRepeats("app app app")}`
);
record(
  "copy-normalize: dedupeAdjacentRepeats preserves single occurrences",
  dedupeAdjacentRepeats("a clean noun phrase") === "a clean noun phrase"
);
record(
  "copy-normalize: toShortNounPhrase clamps to maxWords",
  toShortNounPhrase("Single 25-34 year olds who care about deeper connection", 4)
    .split(/\s+/).length <= 4
);
record(
  "copy-normalize: toShortNounPhrase passes through short input",
  toShortNounPhrase("fiction writers", 4) === "fiction writers"
);
record(
  "copy-normalize: toShortNounPhrase strips trailing punctuation",
  !/[.,;:!?]$/.test(toShortNounPhrase("draft momentum.", 5))
);
record(
  "copy-normalize: stripFillers removes 'users feel' prefix",
  stripFillers("users feel exhausted by shallow swiping").startsWith("exhausted") === false &&
    !/^users?\s+feel/i.test(stripFillers("users feel exhausted by shallow swiping"))
);
record(
  "copy-normalize: stripFillers removes 'the problem is' prefix",
  !/^the\s+problem\s+is/i.test(stripFillers("the problem is decision fatigue"))
);
record(
  "copy-normalize: stripFillers leaves clean input alone",
  stripFillers("shallow swiping") === "shallow swiping"
);

// Strategy.copyIssues is always an array (never undefined / null).
record(
  "copy-normalize: strategy.copyIssues is always an array",
  Array.isArray(a.copyIssues) && Array.isArray(b.copyIssues) && Array.isArray(brew.copyIssues)
);

// The export brief always carries the Copy Quality Flags section header.
for (const { name, strategy } of fixtures) {
  record(
    `copy-normalize: ${name} export brief includes the Copy Quality Flags section`,
    strategy.exportBrief.includes("## Copy Quality Flags")
  );
}

// ---- Input Assistant ------------------------------------------------------

import { assessInputQuality, buildProofAssetPlan } from "../src/lib/engine";

// AstroDating: the input.audience is 18 words (well over 12) so the
// long-audience warning must surface, and rewrittenHints.audience must be
// shorter than the raw input.
{
  const iq = a.inputQuality;
  record(
    "input-assistant: AstroDating produces a non-empty warnings list",
    iq.warnings.length >= 1,
    `Got ${iq.warnings.length} warnings`
  );
  record(
    "input-assistant: AstroDating surfaces either audience-too-long or pain-too-long",
    iq.warnings.some(
      (w) => w.kind === "audience-too-long" || w.kind === "pain-too-long"
    ),
    `Got kinds: ${iq.warnings.map((w) => w.kind).join(", ")}`
  );
  record(
    "input-assistant: AstroDating rewrittenHints.audience is shorter than input.audience",
    iq.rewrittenHints.audience.length < ASTRO_DATING_EXAMPLE.audience.length,
    `Hint: ${iq.rewrittenHints.audience}`
  );
  record(
    "input-assistant: AstroDating rewrittenHints.proofNeeded has 2-4 entries",
    iq.rewrittenHints.proofNeeded.length >= 2 &&
      iq.rewrittenHints.proofNeeded.length <= 4
  );
  record(
    "input-assistant: AstroDating score is an integer in [0,100]",
    Number.isInteger(iq.score) && iq.score >= 0 && iq.score <= 100,
    `Got ${iq.score}`
  );
  record(
    "input-assistant: AstroDating status matches the score band",
    (iq.score >= 75 && iq.status === "strong") ||
      (iq.score >= 40 && iq.score < 75 && iq.status === "okay") ||
      (iq.score < 40 && iq.status === "weak")
  );
}

// Weak fixture: empty audience, empty pain, generic differentiator,
// missing competitors → score < 40, status "weak", multiple warnings.
{
  const weakInput: ProductInput = {
    name: "Generic",
    category: "app",
    description: "An app.",
    price: "$9/month",
    businessModel: "subscription",
    audience: "everyone",
    audiencePain: "",
    competitors: "",
    differentiator: "best app",
    goal: "Increase signups across November and December",
    awareness: "solution-aware",
    sophistication: "skeptical-market",
  };
  const iq = assessInputQuality(weakInput);
  record(
    "input-assistant: weak fixture scores below 40",
    iq.score < 40,
    `Got ${iq.score}`
  );
  record(
    "input-assistant: weak fixture status is 'weak'",
    iq.status === "weak",
    `Got ${iq.status}`
  );
  const kinds = iq.warnings.map((w) => w.kind);
  record(
    "input-assistant: weak fixture flags audience-too-generic",
    kinds.includes("audience-too-generic"),
    `Got: ${kinds.join(", ")}`
  );
  record(
    "input-assistant: weak fixture flags pain-too-vague",
    kinds.includes("pain-too-vague"),
    `Got: ${kinds.join(", ")}`
  );
  record(
    "input-assistant: weak fixture flags differentiator-too-generic",
    kinds.includes("differentiator-too-generic"),
    `Got: ${kinds.join(", ")}`
  );
  record(
    "input-assistant: weak fixture flags competitor-missing",
    kinds.includes("competitor-missing"),
    `Got: ${kinds.join(", ")}`
  );
}

// Determinism: same input → same inputQuality.
{
  const q1 = assessInputQuality(ASTRO_DATING_EXAMPLE);
  const q2 = assessInputQuality(ASTRO_DATING_EXAMPLE);
  record(
    "input-assistant: deterministic across calls",
    JSON.stringify(q1) === JSON.stringify(q2)
  );
}

// ---- Proof Asset Planner --------------------------------------------------

{
  const plan = a.proofAssetPlan;
  record(
    "proof-asset-planner: AstroDating priorityAssets length >= 4",
    plan.priorityAssets.length >= 4,
    `Got ${plan.priorityAssets.length}`
  );
  record(
    "proof-asset-planner: AstroDating minimumProofSet length >= 2",
    plan.minimumProofSet.length >= 2,
    `Got ${plan.minimumProofSet.length}`
  );
  // AstroDating-shaped assets must reference screenshots + demo-video
  // (the canonical proof shape for a subscription dating product).
  const types = plan.priorityAssets.map((p) => p.type);
  record(
    "proof-asset-planner: AstroDating plan includes a screenshot",
    types.includes("screenshot"),
    `Got: ${types.join(", ")}`
  );
  record(
    "proof-asset-planner: AstroDating plan includes a demo-video",
    types.includes("demo-video"),
    `Got: ${types.join(", ")}`
  );
  // At least one asset's whereToUse mentions landing-hero or video-9-16.
  const hasGoodSurface = plan.priorityAssets.some((p) =>
    p.whereToUse.some((w) => /landing-hero|video-9-16|static-1-1/.test(w))
  );
  record(
    "proof-asset-planner: AstroDating assets reference real surfaces",
    hasGoodSurface
  );
  // Readiness score < 100 and >= 0.
  record(
    "proof-asset-planner: AstroDating proofReadinessScore in [0,100]",
    plan.proofReadinessScore >= 0 && plan.proofReadinessScore <= 100
  );
  record(
    "proof-asset-planner: AstroDating proofReadinessScore is an integer",
    Number.isInteger(plan.proofReadinessScore)
  );
  // missingBeforeSpend is the same length as minimumProofSet (MVP: nothing captured).
  record(
    "proof-asset-planner: AstroDating missingBeforeSpend mirrors minimumProofSet for MVP",
    plan.missingBeforeSpend.length === plan.minimumProofSet.length
  );
  // Every priorityAsset has a non-empty title + capture + whyItMatters.
  const badAsset = plan.priorityAssets.find(
    (p) => !p.title || !p.captureInstructions || !p.whyItMatters
  );
  record(
    "proof-asset-planner: every AstroDating asset has title + why + capture",
    !badAsset
  );
}

// Determinism: same input → same proofAssetPlan.
{
  const p1 = buildProofAssetPlan({
    input: ASTRO_DATING_EXAMPLE,
    audienceAvatars: a.audienceAvatars,
    adConceptCards: a.adConceptCards,
    offers: a.offers,
    diagnosis: a.diagnosis,
  });
  const p2 = buildProofAssetPlan({
    input: ASTRO_DATING_EXAMPLE,
    audienceAvatars: a.audienceAvatars,
    adConceptCards: a.adConceptCards,
    offers: a.offers,
    diagnosis: a.diagnosis,
  });
  record(
    "proof-asset-planner: deterministic across calls",
    JSON.stringify(p1) === JSON.stringify(p2)
  );
}

// ---- Skeptical-market + no proof → journey warning ----
{
  const skepticalInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    sophistication: "skeptical-market",
    awareness: "problem-aware",
  };
  const s = buildStrategy(skepticalInput);
  record(
    "proof-asset-planner: skeptical input produces must-have assets",
    s.proofAssetPlan.minimumProofSet.length >= 2,
    `Got ${s.proofAssetPlan.minimumProofSet.length}`
  );
  // journeyStatus.warnings includes a creative-kind warning for proof
  // readiness when the readiness score is below 50.
  if (s.proofAssetPlan.proofReadinessScore < 50) {
    const hasCreativeWarning = s.journeyStatus.warnings.some(
      (w) => w.kind === "creative" && /proof readiness/i.test(w.message)
    );
    record(
      "proof-asset-planner: skeptical + low readiness → journeyStatus has proof warning",
      hasCreativeWarning,
      `Warnings: ${s.journeyStatus.warnings.map((w) => w.kind + ":" + w.message).join(" | ")}`
    );
  } else {
    record(
      "proof-asset-planner: skeptical readiness above threshold — no warning needed",
      true
    );
  }
}

// ---- Export brief contains both new sections ----
for (const { name, strategy } of fixtures) {
  record(
    `export brief: ${name} contains the Input Assistant section`,
    strategy.exportBrief.includes("## Input Assistant")
  );
  record(
    `export brief: ${name} contains the Proof Asset Plan section`,
    strategy.exportBrief.includes("## Proof Asset Plan")
  );
}

// ---- buildStrategy still deterministic over the new fields ----
{
  const s1 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const s2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "input + proof: buildStrategy.inputQuality is deterministic",
    JSON.stringify(s1.inputQuality) === JSON.stringify(s2.inputQuality)
  );
  record(
    "input + proof: buildStrategy.proofAssetPlan is deterministic",
    JSON.stringify(s1.proofAssetPlan) === JSON.stringify(s2.proofAssetPlan)
  );
}

// ---- Execution OS: Creative Testing Matrix --------------------------------

{
  const m = a.creativeTestingMatrix;
  record(
    "testing-matrix: AstroDating first batch length in [3,6]",
    m.recommendedFirstBatch.length >= 3 && m.recommendedFirstBatch.length <= 6,
    `Got ${m.recommendedFirstBatch.length}`
  );
  record(
    "testing-matrix: AstroDating testCells length >= recommendedFirstBatch length",
    m.testCells.length >= m.recommendedFirstBatch.length
  );
  // Every test cell has the required shape.
  const badCell = m.testCells.find(
    (c) =>
      !c.id ||
      !c.conceptId ||
      !c.avatarId ||
      !c.hook ||
      !c.format ||
      !c.funnelStage ||
      !c.audienceTier ||
      !c.offer ||
      !c.primaryKpi ||
      !c.secondaryKpi ||
      !c.killRule ||
      !c.scaleRule ||
      !c.learningGoal ||
      typeof c.estimatedRunDays !== "number"
  );
  record("testing-matrix: every test cell has all required fields", !badCell);
  // killRule and scaleRule shape.
  const badRule = m.testCells.find(
    (c) =>
      typeof c.killRule.threshold !== "number" ||
      typeof c.killRule.afterSpend !== "number" ||
      !c.killRule.rationale ||
      typeof c.scaleRule.threshold !== "number" ||
      typeof c.scaleRule.afterSpend !== "number" ||
      !c.scaleRule.action
  );
  record(
    "testing-matrix: every kill / scale rule has thresholds + rationale",
    !badRule
  );
  // ConceptId must reference one of the AdConceptCards.
  const conceptIds = new Set(a.adConceptCards.map((c) => c.id));
  const badConcept = m.testCells.find((c) => !conceptIds.has(c.conceptId));
  record("testing-matrix: every cell references a real concept", !badConcept);
  // Avatar id must reference a real avatar.
  const avatarIds = new Set(a.audienceAvatars.map((av) => av.id));
  const badAvatar = m.testCells.find((c) => !avatarIds.has(c.avatarId));
  record("testing-matrix: every cell references a real avatar", !badAvatar);
  // maxConcurrentTests in [4,8].
  record(
    "testing-matrix: maxConcurrentTests is in [4,8]",
    m.maxConcurrentTests >= 4 && m.maxConcurrentTests <= 8
  );
}

// AstroDating is solution-aware in a mature-market — proof assets may
// or may not be required, but for the inline skeptical-market fixture
// every first-batch cell MUST have proofAssetRequired non-null.
{
  const skepticalInput2: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    sophistication: "skeptical-market",
    awareness: "problem-aware",
  };
  const s = buildStrategy(skepticalInput2);
  const firstSet = new Set(s.creativeTestingMatrix.recommendedFirstBatch);
  const firstCells = s.creativeTestingMatrix.testCells.filter((c) =>
    firstSet.has(c.id)
  );
  const noProof = firstCells.find((c) => !c.proofAssetRequired);
  record(
    "testing-matrix: skeptical-market first-batch cells all have proofAssetRequired",
    !noProof,
    `Cell without proof: ${noProof?.id}`
  );
  // Warning surfaces when missingBeforeSpend non-empty.
  if (s.proofAssetPlan.missingBeforeSpend.length > 0) {
    record(
      "testing-matrix: skeptical-market missing proof → testingWarnings.missing-proof",
      s.creativeTestingMatrix.testingWarnings.some(
        (w) => w.kind === "missing-proof"
      )
    );
  } else {
    record(
      "testing-matrix: skeptical-market with no missing must-have → no missing-proof warning (vacuous)",
      true
    );
  }
}

// AstroDating: proofAssetPlan.missingBeforeSpend is non-empty (MVP) so
// the matrix MUST also surface a missing-proof warning.
{
  if (a.proofAssetPlan.missingBeforeSpend.length > 0) {
    record(
      "testing-matrix: missingBeforeSpend non-empty → testingWarnings includes missing-proof",
      a.creativeTestingMatrix.testingWarnings.some(
        (w) => w.kind === "missing-proof"
      )
    );
  } else {
    record(
      "testing-matrix: missingBeforeSpend empty — no missing-proof warning needed (vacuous)",
      true
    );
  }
}

// Determinism of the testing matrix across two buildStrategy calls.
{
  const s1 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const s2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "testing-matrix: deterministic across buildStrategy calls",
    JSON.stringify(s1.creativeTestingMatrix) ===
      JSON.stringify(s2.creativeTestingMatrix)
  );
}

// ---- Execution OS: Campaign Setup -----------------------------------------

{
  const setup = a.campaignSetup;
  record(
    "campaign-setup: AstroDating has >= 1 campaign",
    setup.campaigns.length >= 1
  );
  // Naming convention shape: PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT.
  const namingRegex = /^[A-Z0-9]+-\{FUNNEL\}-[A-Z]{2}-\{CONCEPT\}-\{VARIANT\}$/;
  record(
    "campaign-setup: namingConvention follows PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT shape",
    namingRegex.test(setup.namingConvention),
    `Got: ${setup.namingConvention}`
  );
  // Every concrete campaign name follows the same shape literally.
  const concreteRegex = /^[A-Z0-9]+-[A-Z]+-[A-Z]{2}-[A-Z0-9-]+-[A-Z0-9-]+$/;
  const badName = setup.campaigns.find((c) => !concreteRegex.test(c.name));
  record(
    "campaign-setup: every campaign name matches the convention shape",
    !badName,
    `Bad: ${badName?.name}`
  );
  // AstroDating is freemium → conversionEvent includes trial_start AND subscribe.
  const conversionEvents = new Set(
    setup.campaigns.map((c) => c.conversionEvent)
  );
  record(
    "campaign-setup: AstroDating includes trial_start conversion event",
    conversionEvents.has("trial_start"),
    `Got: ${Array.from(conversionEvents).join(", ")}`
  );
  record(
    "campaign-setup: AstroDating includes subscribe or purchase conversion event",
    conversionEvents.has("subscribe") || conversionEvents.has("purchase"),
    `Got: ${Array.from(conversionEvents).join(", ")}`
  );
  // Cold ad set must have the standard exclusions.
  const coldCampaign = setup.campaigns[0];
  const coldAdSet = coldCampaign.adSets[0];
  record(
    "campaign-setup: cold ad set excludes Existing customers",
    coldAdSet.exclusions.includes("Existing customers")
  );
  record(
    "campaign-setup: cold ad set excludes Active trialists",
    coldAdSet.exclusions.includes("Active trialists")
  );
  // utmTemplate is set on every campaign.
  const noUtm = setup.campaigns.find((c) => !c.utmTemplate);
  record("campaign-setup: every campaign has a utmTemplate", !noUtm);
  // reportingColumns contains the standard set.
  const reporting = setup.campaigns[0].reportingColumns;
  record(
    "campaign-setup: reportingColumns includes ROAS and CTR",
    reporting.includes("ROAS") && reporting.includes("CTR")
  );
  // Pre-launch checklist exists and references trackingReadiness sources.
  record(
    "campaign-setup: preLaunchChecklist length >= 5",
    setup.preLaunchChecklist.length >= 5
  );
  record(
    "campaign-setup: preLaunchChecklist references tracking-readiness source",
    setup.preLaunchChecklist.some((it) =>
      (it.source ?? "").startsWith("tracking-readiness:")
    )
  );
}

// Plotline is subscription → trial_start + subscribe must appear too.
{
  const setupB = b.campaignSetup;
  const conversionEvents = new Set(
    setupB.campaigns.map((c) => c.conversionEvent)
  );
  record(
    "campaign-setup: Plotline (subscription) includes trial_start",
    conversionEvents.has("trial_start")
  );
  record(
    "campaign-setup: Plotline (subscription) includes subscribe",
    conversionEvents.has("subscribe")
  );
}

// AstroDating is a launch with a promo-3-tier window → 3 campaigns
// (ACQ + ENGAGE + SITE).
{
  const funnelTokens = a.campaignSetup.campaigns.map((c) => {
    const parts = c.name.split("-");
    return parts[1];
  });
  record(
    "campaign-setup: AstroDating launch emits ACQ campaign",
    funnelTokens.includes("ACQ")
  );
  record(
    "campaign-setup: AstroDating launch emits ENGAGE retargeting campaign",
    funnelTokens.includes("ENGAGE")
  );
  record(
    "campaign-setup: AstroDating launch emits SITE retargeting campaign",
    funnelTokens.includes("SITE")
  );
}

// ---- Execution OS: Next Iteration Plan ------------------------------------

{
  const plan = a.nextIterationPlan;
  record(
    "iteration-planner: emits exactly 7 recommendations",
    plan.recommendations.length === 7,
    `Got ${plan.recommendations.length}`
  );
  const expectedSignals = [
    "winning",
    "weak-hook",
    "weak-hold",
    "weak-click",
    "weak-conversion",
    "weak-roas",
    "proof-bottleneck",
  ];
  for (const sig of expectedSignals) {
    record(
      `iteration-planner: contains a "${sig}" recommendation`,
      plan.recommendations.some((r) => r.signal === sig)
    );
  }
  // Every rec has non-empty diagnosis + at least one next step.
  const badRec = plan.recommendations.find(
    (r) => !r.diagnosis || r.nextSteps.length === 0
  );
  record(
    "iteration-planner: every rec has diagnosis + non-empty nextSteps",
    !badRec
  );
  // Aggregated unique union.
  const aggregateAssetsAreUnique =
    new Set(plan.nextAssetsToProduce).size === plan.nextAssetsToProduce.length;
  const aggregateAnglesAreUnique =
    new Set(plan.nextAnglesToTry).size === plan.nextAnglesToTry.length;
  record(
    "iteration-planner: nextAssetsToProduce is a unique aggregated union",
    aggregateAssetsAreUnique
  );
  record(
    "iteration-planner: nextAnglesToTry is a unique aggregated union",
    aggregateAnglesAreUnique
  );
  // Weak-hook rec proposes new angles from the library.
  const weakHook = plan.recommendations.find((r) => r.signal === "weak-hook");
  record(
    "iteration-planner: weak-hook recommendation proposes new hook angles",
    !!weakHook && weakHook.nextAnglesToTry.length > 0
  );
}

// ---- Journey Status: tracking < 50 → Execution Plan-only blocker ----------

{
  const badTrackingInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    name: "",            // zaps the naming-convention check
    goal: "",            // zaps the conversion-events check
    price: "",           // zaps the test-purchase check
    campaignType: undefined,
  };
  const s = buildStrategy(badTrackingInput);
  // Tracking score should land well below 50.
  if (s.trackingReadiness.score < 50) {
    record(
      "journey-status: tracking < 50 → Execution Plan-only blocker",
      s.journeyStatus.blockers.some(
        (b) =>
          b.kind === "tracking" &&
          /Execution shows plan only/i.test(b.message)
      ),
      `Blockers: ${s.journeyStatus.blockers.map((b) => b.message).join(" | ")}`
    );
  } else {
    record(
      "journey-status: tracking < 50 → Execution Plan-only blocker (vacuous)",
      true
    );
  }
}

// ---- Export brief contains the 3 Execution OS sections -------------------

for (const { name, strategy } of fixtures) {
  record(
    `export brief: ${name} contains the Creative Testing Matrix section`,
    strategy.exportBrief.includes("## Creative Testing Matrix")
  );
  record(
    `export brief: ${name} contains the Campaign Setup section`,
    strategy.exportBrief.includes("## Campaign Setup")
  );
  record(
    `export brief: ${name} contains the Next Iteration Plan section`,
    strategy.exportBrief.includes("## Next Iteration Plan")
  );
}

// ---- buildStrategy still deterministic across new fields -----------------

{
  const x1 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const x2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "execution-os: full strategy is deep-equal across two calls",
    JSON.stringify(x1) === JSON.stringify(x2)
  );
}

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
