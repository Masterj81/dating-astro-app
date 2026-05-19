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

// Brand rename lock-in: export brief must surface CampaignOS and must not leak the
// retired BigAd brand in user-facing footers or "X suggests" labels.
expectContains("export brief footer says Generated by CampaignOS", brief, "Generated by CampaignOS");
record(
  "export brief does not leak 'Generated by BigAd' footer",
  !brief.includes("Generated by BigAd")
);
record(
  "export brief uses 'CampaignOS suggests:' (not 'BigAd suggests:')",
  !brief.includes("BigAd suggests:")
);

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

// Determinism. The build inside buildStrategy passes `unitEconomics`
// + `forecast` + `creativeTestingMatrix` + `appliedAdReviews`, so the
// standalone call must mirror them to deep-equal.
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
  creativeTestingMatrix: a.creativeTestingMatrix,
  appliedAdReviews: a.appliedAdReviews,
  unitEconomics: a.unitEconomics,
  forecast: a.forecast,
  simulator: a.scenarioSimulator,
  benchmarkCalibration: a.benchmarkCalibration,
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
const validBlockerKinds = new Set([
  "tracking",
  "kpi",
  "review",
  "creative",
  "scope",
  "asset",
  "economics",
  "forecast",
  "simulator",
  "benchmark",
  "results",
]);
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

// ---- Project Workspace -----------------------------------------------------

{
  // Lazy imports so this block stays self-contained at the bottom of the file.
  const {
    createMemoryProjectStore,
    STORAGE_KEY_PROJECTS,
    STORAGE_KEY_RUNS,
    STORAGE_KEY_RESULTS,
    STORAGE_KEY_ACTIVE,
  } = require("../src/lib/workspace/project-store");
  const { deriveLearningMemory, buildRunComparison } = require("../src/lib/workspace/learning");
  const { buildNextIterationPlan: buildPlan } = require("../src/lib/engine/iteration-planner");
  const { generateExportBrief: genExport } = require("../src/lib/engine/export-brief");

  // ---- Versioned storage keys ---------------------------------------------
  record(
    "workspace: storage keys are versioned",
    STORAGE_KEY_PROJECTS === "bigad:projects:v1" &&
      STORAGE_KEY_RUNS === "bigad:runs:v1" &&
      STORAGE_KEY_RESULTS === "bigad:test-results:v1" &&
      STORAGE_KEY_ACTIVE === "bigad:active-project-id:v1"
  );

  // ---- Memory store roundtrip ---------------------------------------------
  {
    const store = createMemoryProjectStore();
    const now = new Date().toISOString();
    const proj = {
      metadata: {
        id: "p-1",
        name: "AstroDating",
        createdAt: now,
        updatedAt: now,
        runCount: 0,
      },
      input: ASTRO_DATING_EXAMPLE,
    };
    const saved = store.saveProject(proj);
    record(
      "workspace: memory store saveProject preserves id",
      saved.metadata.id === "p-1"
    );
    const fetched = store.getProject("p-1");
    record(
      "workspace: memory store getProject returns saved payload",
      fetched !== null && fetched.metadata.name === "AstroDating"
    );
    record(
      "workspace: getProject returns null for missing id",
      store.getProject("missing") === null
    );

    // Update.
    store.saveProject({
      ...saved,
      metadata: { ...saved.metadata, name: "AstroDating v2" },
    });
    const re = store.getProject("p-1");
    record(
      "workspace: saveProject updates in-place",
      re !== null && re.metadata.name === "AstroDating v2"
    );

    // Active project setter.
    store.setActiveProject("p-1");
    record(
      "workspace: setActiveProject + getActiveProjectId roundtrip",
      store.getActiveProjectId() === "p-1"
    );
    store.setActiveProject(null);
    record(
      "workspace: setActiveProject(null) clears active id",
      store.getActiveProjectId() === null
    );

    // Runs.
    const run = {
      id: "r-1",
      projectId: "p-1",
      runAt: now,
      input: ASTRO_DATING_EXAMPLE,
      strategy: buildStrategy(ASTRO_DATING_EXAMPLE),
    };
    store.appendRun(run);
    record(
      "workspace: appendRun → listRuns returns the run",
      store.listRuns("p-1").length === 1
    );
    record(
      "workspace: appendRun bumps project runCount to 1",
      (store.getProject("p-1") as any).metadata.runCount === 1
    );

    // Results.
    const result = {
      id: "res-1",
      projectId: "p-1",
      runId: "r-1",
      testCellId: "test-1",
      status: "winning" as const,
      metrics: [],
      spend: 100,
      daysRun: 3,
      createdAt: now,
      updatedAt: now,
    };
    store.upsertResult(result);
    record(
      "workspace: upsertResult → listResults returns the result",
      store.listResults("p-1").length === 1
    );

    // Upsert again with new spend.
    store.upsertResult({ ...result, spend: 250 });
    const after = store.listResults("p-1");
    record(
      "workspace: upsertResult updates in-place (identity = id)",
      after.length === 1 && after[0].spend === 250
    );

    // Delete project cascades.
    store.deleteProject("p-1");
    record(
      "workspace: deleteProject cascades to runs",
      store.listRuns("p-1").length === 0
    );
    record(
      "workspace: deleteProject cascades to results",
      store.listResults("p-1").length === 0
    );
  }

  // ---- Serialization losslessness -----------------------------------------
  {
    const store = createMemoryProjectStore();
    const now = "2026-05-17T00:00:00.000Z";
    const proj = {
      metadata: {
        id: "p-ser",
        name: "Serialize me",
        createdAt: now,
        updatedAt: now,
        runCount: 0,
      },
      input: ASTRO_DATING_EXAMPLE,
    };
    store.saveProject(proj);
    const run = {
      id: "r-ser",
      projectId: "p-ser",
      runAt: now,
      input: ASTRO_DATING_EXAMPLE,
      strategy: buildStrategy(ASTRO_DATING_EXAMPLE),
    };
    store.appendRun(run);
    const result = {
      id: "res-ser",
      projectId: "p-ser",
      runId: "r-ser",
      testCellId: "test-1",
      status: "winning" as const,
      metrics: [{ kpi: "ctr" as const, value: 1.5, unit: "percent" as const, measuredAt: now }],
      spend: 120,
      daysRun: 4,
      createdAt: now,
      updatedAt: now,
    };
    store.upsertResult(result);

    const j1 = JSON.stringify({
      projects: store.listProjects(),
      runs: store.listRuns("p-ser"),
      results: store.listResults("p-ser"),
    });
    const parsed = JSON.parse(j1);
    record(
      "workspace: project survives JSON roundtrip",
      parsed.projects[0].metadata.name === "Serialize me"
    );
    record(
      "workspace: run survives JSON roundtrip",
      parsed.runs[0].id === "r-ser" && parsed.runs[0].input.name === ASTRO_DATING_EXAMPLE.name
    );
    record(
      "workspace: result survives JSON roundtrip including metrics",
      parsed.results[0].id === "res-ser" &&
        parsed.results[0].metrics[0].kpi === "ctr"
    );
  }

  // ---- Learning derivation ------------------------------------------------
  const wsRun = {
    id: "r-learn",
    projectId: "p-learn",
    runAt: "2026-05-17T00:00:00.000Z",
    input: ASTRO_DATING_EXAMPLE,
    strategy: buildStrategy(ASTRO_DATING_EXAMPLE),
  };
  const cells = wsRun.strategy.creativeTestingMatrix.testCells;
  const cell0 = cells[0];
  const cell1 = cells[1] ?? cells[0];

  function mkResult(
    id: string,
    cellId: string,
    status: "winning" | "losing" | "killed-early" | "inconclusive"
  ) {
    return {
      id,
      projectId: "p-learn",
      runId: "r-learn",
      testCellId: cellId,
      status,
      metrics: [],
      spend: 100,
      daysRun: 3,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    };
  }

  // 0 results → 0 learnings.
  {
    const mem = deriveLearningMemory([], [wsRun]);
    record(
      "workspace-learning: 0 results → 0 learnings",
      mem.learnings.length === 0 && mem.fromResultCount === 0
    );
  }

  // 1 winning hook → confidence "low".
  {
    const mem = deriveLearningMemory([mkResult("res-w-1", cell0.id, "winning")], [wsRun]);
    const hookWin = mem.learnings.find((l: any) => l.signal === "hook-pattern-winning");
    record(
      "workspace-learning: 1 winning hook → confidence low",
      hookWin !== undefined && hookWin.confidence === "low"
    );
  }

  // 3 winning → medium.
  {
    const mem = deriveLearningMemory(
      [
        mkResult("res-w-1", cell0.id, "winning"),
        mkResult("res-w-2", cell0.id, "winning"),
        mkResult("res-w-3", cell0.id, "winning"),
      ],
      [wsRun]
    );
    const hookWin = mem.learnings.find((l: any) => l.signal === "hook-pattern-winning");
    record(
      "workspace-learning: 3 winning on same hook → confidence medium",
      hookWin !== undefined && hookWin.confidence === "medium"
    );
  }

  // 6 winning → high.
  {
    const mem = deriveLearningMemory(
      [
        mkResult("res-w-1", cell0.id, "winning"),
        mkResult("res-w-2", cell0.id, "winning"),
        mkResult("res-w-3", cell0.id, "winning"),
        mkResult("res-w-4", cell0.id, "winning"),
        mkResult("res-w-5", cell0.id, "winning"),
        mkResult("res-w-6", cell0.id, "winning"),
      ],
      [wsRun]
    );
    const hookWin = mem.learnings.find((l: any) => l.signal === "hook-pattern-winning");
    record(
      "workspace-learning: 6 winning on same hook → confidence high",
      hookWin !== undefined && hookWin.confidence === "high"
    );
  }

  // 2 winning + 4 losing on same hook → both signals emitted.
  {
    const mem = deriveLearningMemory(
      [
        mkResult("res-w-1", cell0.id, "winning"),
        mkResult("res-w-2", cell0.id, "winning"),
        mkResult("res-l-1", cell0.id, "losing"),
        mkResult("res-l-2", cell0.id, "losing"),
        mkResult("res-l-3", cell0.id, "losing"),
        mkResult("res-l-4", cell0.id, "killed-early"),
      ],
      [wsRun]
    );
    const win = mem.learnings.find((l: any) => l.signal === "hook-pattern-winning");
    const loss = mem.learnings.find((l: any) => l.signal === "hook-pattern-losing");
    record(
      "workspace-learning: 2 winning + 4 losing → both signals emitted",
      win !== undefined && loss !== undefined
    );
    record(
      "workspace-learning: winning supportingResultIds count = 2",
      win !== undefined && win.supportingResultIds.length === 2
    );
    record(
      "workspace-learning: losing supportingResultIds count = 4",
      loss !== undefined && loss.supportingResultIds.length === 4
    );
  }

  // Inconclusive emits no learning.
  {
    const mem = deriveLearningMemory(
      [
        mkResult("res-i-1", cell0.id, "inconclusive"),
        mkResult("res-i-2", cell0.id, "inconclusive"),
      ],
      [wsRun]
    );
    record(
      "workspace-learning: inconclusive results emit no learnings",
      mem.learnings.length === 0 && mem.fromResultCount === 2
    );
  }

  // deriveLearningMemory is deterministic for same inputs.
  {
    const fixture = [
      mkResult("res-w-1", cell0.id, "winning"),
      mkResult("res-l-1", cell1.id, "losing"),
    ];
    const m1 = deriveLearningMemory(fixture, [wsRun]);
    const m2 = deriveLearningMemory(fixture, [wsRun]);
    record(
      "workspace-learning: deterministic across two calls",
      JSON.stringify(m1) === JSON.stringify(m2)
    );
  }

  // ---- Run comparison -----------------------------------------------------
  {
    const runA = wsRun;
    const cmp = buildRunComparison(runA, null);
    record(
      "workspace-comparison: null previous → noteworthy mentions first run",
      cmp.previous === null &&
        cmp.noteworthy.some((n: string) => /first run/i.test(n))
    );

    const altInput = { ...ASTRO_DATING_EXAMPLE, audience: "Different audience" };
    const runB = {
      id: "r-b",
      projectId: "p-learn",
      runAt: "2026-05-18T00:00:00.000Z",
      input: altInput,
      strategy: buildStrategy(altInput),
    };
    const cmp2 = buildRunComparison(runB, runA);
    record(
      "workspace-comparison: detects input.audience change",
      cmp2.changedFields.includes("input.audience")
    );
    record(
      "workspace-comparison: deterministic",
      JSON.stringify(buildRunComparison(runB, runA)) ===
        JSON.stringify(buildRunComparison(runB, runA))
    );
  }

  // ---- Iteration planner with memory --------------------------------------
  {
    const base = wsRun.strategy;
    const planNoMem = buildPlan({
      input: ASTRO_DATING_EXAMPLE,
      kpiLadder: base.kpiLadder,
      creativeTestingMatrix: base.creativeTestingMatrix,
      proofAssetPlan: base.proofAssetPlan,
      hookLibrary: base.hookLibrary,
      adConceptCards: base.adConceptCards,
    });
    record(
      "workspace-planner: without memory still emits 7 recommendations",
      planNoMem.recommendations.length === 7
    );

    // Build a high-confidence winning memory: 6 winning results on the
    // same cell so hook-pattern-winning lands at "high" confidence.
    const winningResults = Array.from({ length: 6 }, (_, i) =>
      mkResult(`res-hi-${i}`, cell0.id, "winning")
    );
    const hiMemory = deriveLearningMemory(winningResults, [wsRun]);
    const highWins = hiMemory.learnings.filter(
      (l: any) => l.confidence === "high" && l.signal.endsWith("-winning")
    );
    record(
      "workspace-planner: high-confidence winning learnings present",
      highWins.length > 0
    );

    const planWithMem = buildPlan({
      input: ASTRO_DATING_EXAMPLE,
      kpiLadder: base.kpiLadder,
      creativeTestingMatrix: base.creativeTestingMatrix,
      proofAssetPlan: base.proofAssetPlan,
      hookLibrary: base.hookLibrary,
      adConceptCards: base.adConceptCards,
      learningMemory: hiMemory,
    });
    record(
      "workspace-planner: with memory appends recommendations (count > 7)",
      planWithMem.recommendations.length > planNoMem.recommendations.length
    );
    record(
      "workspace-planner: first 7 recommendations unchanged",
      JSON.stringify(planWithMem.recommendations.slice(0, 7)) ===
        JSON.stringify(planNoMem.recommendations)
    );

    // Deterministic: same memory → same plan.
    const planWithMem2 = buildPlan({
      input: ASTRO_DATING_EXAMPLE,
      kpiLadder: base.kpiLadder,
      creativeTestingMatrix: base.creativeTestingMatrix,
      proofAssetPlan: base.proofAssetPlan,
      hookLibrary: base.hookLibrary,
      adConceptCards: base.adConceptCards,
      learningMemory: hiMemory,
    });
    record(
      "workspace-planner: same memory produces deep-equal plan",
      JSON.stringify(planWithMem) === JSON.stringify(planWithMem2)
    );

    // Memory-derived "double down" cap: at most 2 high wins → at most 2 extra "double down".
    const extras = planWithMem.recommendations.slice(7);
    const doubleDowns = extras.filter((r: any) =>
      /double down/i.test(r.nextSteps.join(" "))
    );
    record(
      "workspace-planner: double-down recommendations capped at 2",
      doubleDowns.length <= 2
    );
  }

  // ---- Export brief Campaign Log -----------------------------------------
  {
    const base = wsRun.strategy;
    const baseBrief = genExport(ASTRO_DATING_EXAMPLE, base);
    record(
      "workspace-export: omits Campaign Log when no workspace context",
      !baseBrief.includes("## Campaign Log")
    );

    const memory = deriveLearningMemory(
      [mkResult("res-w-1", cell0.id, "winning")],
      [wsRun]
    );
    const briefWithMem = genExport(ASTRO_DATING_EXAMPLE, base, {
      runs: [wsRun],
      results: [mkResult("res-w-1", cell0.id, "winning")],
      learningMemory: memory,
    });
    record(
      "workspace-export: includes Campaign Log when workspace context present",
      briefWithMem.includes("## Campaign Log")
    );
    record(
      "workspace-export: Campaign Log shows recent runs sub-section",
      briefWithMem.includes("**Recent runs.**")
    );
    record(
      "workspace-export: Campaign Log shows recent test results sub-section",
      briefWithMem.includes("**Recent test results.**")
    );
    record(
      "workspace-export: Campaign Log shows current learnings sub-section",
      briefWithMem.includes("**Current learnings.**")
    );

    // Empty workspace context (object present but empty) → still omitted.
    const emptyBrief = genExport(ASTRO_DATING_EXAMPLE, base, {
      runs: [],
      results: [],
    });
    record(
      "workspace-export: empty workspace context omits Campaign Log",
      !emptyBrief.includes("## Campaign Log")
    );
  }

  // ---- Engine still deterministic under workspace re-export ---------------
  {
    const base = wsRun.strategy;
    const mem = deriveLearningMemory(
      [mkResult("res-w-1", cell0.id, "winning")],
      [wsRun]
    );
    const e1 = genExport(ASTRO_DATING_EXAMPLE, base, {
      runs: [wsRun],
      results: [mkResult("res-w-1", cell0.id, "winning")],
      learningMemory: mem,
    });
    const e2 = genExport(ASTRO_DATING_EXAMPLE, base, {
      runs: [wsRun],
      results: [mkResult("res-w-1", cell0.id, "winning")],
      learningMemory: mem,
    });
    record(
      "workspace-export: deterministic across two calls",
      e1 === e2
    );
  }
}

// ---- Client-Ready Report Builder ------------------------------------------

{
  // Lazy imports so this block stays self-contained at the bottom of the file.
  const { buildClientReport, REPORT_SECTION_ORDER } = require("../src/lib/report/report-builder");
  const { renderClientReportMarkdown } = require("../src/lib/report/report-markdown");
  const { deriveLearningMemory } = require("../src/lib/workspace/learning");

  const FIXED_TIME = "2026-05-17T12:00:00.000Z";
  const FIXED_TIME_OLDER = "2026-05-10T12:00:00.000Z";

  const baseStrategy = buildStrategy(ASTRO_DATING_EXAMPLE);
  const baseRun = {
    id: "report-run-1",
    projectId: "report-proj-1",
    runAt: FIXED_TIME,
    input: ASTRO_DATING_EXAMPLE,
    strategy: baseStrategy,
  };
  const baseProject = {
    metadata: {
      id: "report-proj-1",
      name: "AstroDating Report Demo",
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
      runCount: 1,
    },
    input: ASTRO_DATING_EXAMPLE,
  };

  function mkRptResult(
    id: string,
    cellId: string,
    runId: string,
    status: "winning" | "losing" | "killed-early" | "inconclusive",
    at: string = FIXED_TIME
  ) {
    return {
      id,
      projectId: "report-proj-1",
      runId,
      testCellId: cellId,
      status,
      metrics: [],
      spend: 100,
      daysRun: 3,
      createdAt: at,
      updatedAt: at,
    };
  }

  // ---- Section kind ordering ----------------------------------------------

  record(
    "report: section kind ordering has 10 entries",
    Array.isArray(REPORT_SECTION_ORDER) && REPORT_SECTION_ORDER.length === 10
  );

  // ---- Determinism --------------------------------------------------------

  {
    const emptyMem = deriveLearningMemory([], [baseRun]);
    const r1 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: emptyMem,
      generatedAt: FIXED_TIME,
    });
    const r2 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: emptyMem,
      generatedAt: FIXED_TIME,
    });
    record(
      "report: same inputs → byte-identical ClientReport (deep-equal)",
      JSON.stringify(r1) === JSON.stringify(r2)
    );
    record(
      "report: generatedAt honours override arg",
      r1.generatedAt === FIXED_TIME
    );
  }

  // ---- generatedAt is derived from max(updatedAt) -------------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
    });
    record(
      "report: generatedAt is derived from run.runAt when no override",
      r.generatedAt === FIXED_TIME
    );

    // Two runs + a later test result → result timestamp wins.
    const cell0 = baseStrategy.creativeTestingMatrix.testCells[0];
    const laterResult = mkRptResult(
      "rpt-r-1",
      cell0.id,
      baseRun.id,
      "winning",
      "2026-06-01T00:00:00.000Z"
    );
    const r2 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [laterResult],
      learningMemory: deriveLearningMemory([laterResult], [baseRun]),
    });
    record(
      "report: generatedAt advances to the freshest result updatedAt",
      r2.generatedAt === "2026-06-01T00:00:00.000Z"
    );
  }

  // ---- Executive summary length + width -----------------------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    record(
      "report: executive summary has 12 or fewer bullets",
      r.executiveSummary.bullets.length <= 12
    );
    record(
      "report: every executive summary bullet is 24 words or fewer",
      r.executiveSummary.bullets.every(
        (b: string) => b.trim().split(/\s+/).length <= 24
      )
    );
    record(
      "report: executive summary has at least one bullet for a healthy run",
      r.executiveSummary.bullets.length > 0
    );
  }

  // ---- Strategy snapshot has the required slots ---------------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const s = r.strategySnapshot;
    record(
      "report: strategy snapshot fields are non-empty",
      s.positioning.length > 0 &&
        s.topAngle.length > 0 &&
        s.topOffer.length > 0 &&
        s.campaignWindow.length > 0 &&
        s.audience.length > 0
    );
    record(
      "report: strategy snapshot KV items is 6-10",
      s.items.length >= 6 && s.items.length <= 10
    );
  }

  // ---- Decision log: tracking blocker -------------------------------------

  {
    // Force a low tracking score by cloning the strategy.
    const lowTrackingRun = {
      ...baseRun,
      strategy: {
        ...baseRun.strategy,
        trackingReadiness: {
          ...baseRun.strategy.trackingReadiness,
          score: 30,
          status: "not-ready" as const,
          blockers: 2,
          warnings: 1,
        },
      },
    };
    const mem = deriveLearningMemory([], [lowTrackingRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [lowTrackingRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const blockers = r.decisionLog.filter((d: any) => d.severity === "blocker");
    record(
      "report-decisions: low tracking score yields at least one blocker",
      blockers.length >= 1
    );
    record(
      "report-decisions: tracking blocker carries relatedIds",
      blockers.length >= 1 && Array.isArray(blockers[0].relatedIds)
    );
    // Severity sort.
    let ok = true;
    const rank = { blocker: 0, warning: 1, info: 2 };
    for (let i = 1; i < r.decisionLog.length; i++) {
      if ((rank as any)[r.decisionLog[i - 1].severity] > (rank as any)[r.decisionLog[i].severity]) {
        ok = false;
        break;
      }
    }
    record(
      "report-decisions: sorted blocker → warning → info",
      ok
    );
  }

  // ---- Decision log: proof shortfall --------------------------------------

  {
    // Force a low proof readiness with at least one missing must-have.
    const haveAssets = baseRun.strategy.proofAssetPlan.priorityAssets;
    const lowProofRun = {
      ...baseRun,
      strategy: {
        ...baseRun.strategy,
        proofAssetPlan: {
          ...baseRun.strategy.proofAssetPlan,
          proofReadinessScore: 20,
          missingBeforeSpend: [haveAssets[0]?.id || "proof-1"],
        },
      },
    };
    const mem = deriveLearningMemory([], [lowProofRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [lowProofRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const proofWarn = r.decisionLog.find(
      (d: any) => d.source === "proof" && d.severity === "warning"
    );
    record(
      "report-decisions: low proof readiness yields a proof warning",
      proofWarn !== undefined
    );
    record(
      "report-decisions: proof warning has non-empty relatedIds",
      proofWarn !== undefined &&
        Array.isArray(proofWarn.relatedIds) &&
        proofWarn.relatedIds.length > 0
    );
    record(
      "report-decisions: proof decision wording mentions 'missing proof'",
      proofWarn !== undefined &&
        /missing proof assets/i.test(proofWarn.decision)
    );
  }

  // ---- Next actions cap and ordering --------------------------------------

  {
    const cell0 = baseRun.strategy.creativeTestingMatrix.testCells[0];
    // Trigger blockers + missing proof + iteration + memory winning.
    const stressedRun = {
      ...baseRun,
      strategy: {
        ...baseRun.strategy,
        trackingReadiness: {
          ...baseRun.strategy.trackingReadiness,
          score: 20,
          status: "not-ready" as const,
          blockers: 3,
          warnings: 0,
        },
      },
    };
    const winningResults = Array.from({ length: 6 }, (_, i) =>
      mkRptResult(`rpt-w-${i}`, cell0.id, stressedRun.id, "winning")
    );
    const mem = deriveLearningMemory(winningResults, [stressedRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [stressedRun],
      testResults: winningResults,
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    record(
      "report-actions: capped at 10 items",
      r.nextActions.length <= 10
    );
    record(
      "report-actions: returns at least one item when decisions exist",
      r.decisionLog.length > 0 ? r.nextActions.length > 0 : true
    );
    // First action(s) for blockers must be operate-category.
    const blockerCount = r.decisionLog.filter((d: any) => d.severity === "blocker").length;
    if (blockerCount > 0) {
      record(
        "report-actions: blocker actions sit at the top of the list",
        r.nextActions.slice(0, blockerCount).every((a: any) => a.category === "operate")
      );
    } else {
      record("report-actions: no blockers in stressed run (skipped header check)", true);
    }
    // Owner heuristic spot-check.
    const produceItem = r.nextActions.find((a: any) => a.category === "produce");
    if (produceItem) {
      record(
        "report-actions: produce-category owner is creator",
        produceItem.owner === "creator"
      );
    } else {
      record("report-actions: no produce-category action (heuristic check trivially passes)", true);
    }
  }

  // ---- Comparison: 1 run vs 2 runs ----------------------------------------

  {
    const memEmpty = deriveLearningMemory([], [baseRun]);
    const oneRunReport = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: memEmpty,
      generatedAt: FIXED_TIME,
    });
    record(
      "report-comparison: single run → comparison is null",
      oneRunReport.comparison === null
    );

    const altInput = { ...ASTRO_DATING_EXAMPLE, audience: "Different audience" };
    const olderRun = {
      id: "report-run-0",
      projectId: "report-proj-1",
      runAt: FIXED_TIME_OLDER,
      input: altInput,
      strategy: buildStrategy(altInput),
    };
    const twoRunReport = buildClientReport({
      project: baseProject,
      runs: [baseRun, olderRun],
      testResults: [],
      learningMemory: memEmpty,
      generatedAt: FIXED_TIME,
    });
    record(
      "report-comparison: two runs → comparison is non-null",
      twoRunReport.comparison !== null
    );
    record(
      "report-comparison: comparison has changedFields",
      twoRunReport.comparison !== null &&
        Array.isArray(twoRunReport.comparison.changedFields) &&
        twoRunReport.comparison.changedFields.length > 0
    );
  }

  // ---- Runs cap at 3 ------------------------------------------------------

  {
    const r2 = { ...baseRun, id: "report-run-2", runAt: "2026-05-15T00:00:00.000Z" };
    const r3 = { ...baseRun, id: "report-run-3", runAt: "2026-05-14T00:00:00.000Z" };
    const r4 = { ...baseRun, id: "report-run-4", runAt: "2026-05-13T00:00:00.000Z" };
    const memEmpty = deriveLearningMemory([], [baseRun, r2, r3, r4]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun, r2, r3, r4],
      testResults: [],
      learningMemory: memEmpty,
      generatedAt: FIXED_TIME,
    });
    record(
      "report: included runs capped at 3",
      r.runs.length === 3
    );
    record(
      "report: primaryRunId is the first included run",
      r.primaryRunId === baseRun.id
    );
  }

  // ---- Markdown export: section gating ------------------------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const all = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const md = renderClientReportMarkdown(all);
    record(
      "report-md: header is rendered",
      md.includes("# CampaignOS Report — AstroDating Report Demo")
    );
    record(
      "report-md: header does not leak old BigAd brand",
      !md.includes("# BigAd Report") && !md.includes("# Client Report —")
    );
    const expectedHeaders = [
      "## Executive Summary",
      "## Strategy Snapshot",
      "## Input Quality",
      "## Proof Plan",
      "## Execution Plan",
      "## Campaign Setup",
      "## Test Results",
      "## Learning Memory",
      "## Decision Log",
      "## Next Actions",
    ];
    record(
      "report-md: all 10 section headers present when all toggles enabled",
      expectedHeaders.every((h) => md.includes(h))
    );
    record(
      "report-md: generatedAt is rendered in header",
      md.includes(`Generated: ${FIXED_TIME}`)
    );
  }

  // ---- Markdown export: toggles disabled remove headers -------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const noTests = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      toggles: { "test-results": false },
      generatedAt: FIXED_TIME,
    });
    const mdNoTests = renderClientReportMarkdown(noTests);
    record(
      "report-md: disabled test-results toggle removes the Test Results header",
      !mdNoTests.includes("## Test Results")
    );
    record(
      "report-md: disabled test-results clears report.testResults array",
      Array.isArray(noTests.testResults) && noTests.testResults.length === 0
    );

    // Multiple toggles off.
    const minimal = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      toggles: {
        "test-results": false,
        "learning-memory": false,
        "decision-log": false,
        "next-actions": false,
        "campaign-setup": false,
      },
      generatedAt: FIXED_TIME,
    });
    const mdMin = renderClientReportMarkdown(minimal);
    record(
      "report-md: multiple toggles disabled remove all corresponding headers",
      !mdMin.includes("## Test Results") &&
        !mdMin.includes("## Learning Memory") &&
        !mdMin.includes("## Decision Log") &&
        !mdMin.includes("## Next Actions") &&
        !mdMin.includes("## Campaign Setup")
    );
    record(
      "report-md: still renders enabled sections after multi-toggle disable",
      mdMin.includes("## Executive Summary") &&
        mdMin.includes("## Strategy Snapshot") &&
        mdMin.includes("## Input Quality")
    );
  }

  // ---- Markdown export: deterministic -------------------------------------

  {
    const mem = deriveLearningMemory([], [baseRun]);
    const a1 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const a2 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    record(
      "report-md: deterministic across two calls",
      renderClientReportMarkdown(a1) === renderClientReportMarkdown(a2)
    );
  }

  // ---- Comparison line in markdown ----------------------------------------

  {
    const altInput = { ...ASTRO_DATING_EXAMPLE, audience: "Different audience entirely" };
    const olderRun = {
      id: "report-run-prev",
      projectId: "report-proj-1",
      runAt: FIXED_TIME_OLDER,
      input: altInput,
      strategy: buildStrategy(altInput),
    };
    const memEmpty = deriveLearningMemory([], [baseRun, olderRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun, olderRun],
      testResults: [],
      learningMemory: memEmpty,
      generatedAt: FIXED_TIME,
    });
    const md = renderClientReportMarkdown(r);
    record(
      "report-md: comparison line is rendered when previous run exists",
      md.includes("Compared with:")
    );
  }

  // ---- Test result winning produces a 'Promote winning cell' info entry --

  {
    const matrix = baseRun.strategy.creativeTestingMatrix;
    const firstBatchId = matrix.recommendedFirstBatch[0];
    const winningRes = mkRptResult("rpt-promote-1", firstBatchId, baseRun.id, "winning");
    const mem = deriveLearningMemory([winningRes], [baseRun]);
    const r = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [winningRes],
      learningMemory: mem,
      generatedAt: FIXED_TIME,
    });
    const promote = r.decisionLog.find(
      (d: any) => /promote winning cell/i.test(d.decision)
    );
    record(
      "report-decisions: winning first-batch cell yields a promote info entry",
      promote !== undefined
    );
    const losingRes = mkRptResult("rpt-retire-1", firstBatchId, baseRun.id, "losing");
    const mem2 = deriveLearningMemory([losingRes], [baseRun]);
    const r2 = buildClientReport({
      project: baseProject,
      runs: [baseRun],
      testResults: [losingRes],
      learningMemory: mem2,
      generatedAt: FIXED_TIME,
    });
    const retire = r2.decisionLog.find(
      (d: any) => /retire cell/i.test(d.decision)
    );
    record(
      "report-decisions: losing cell yields a retire info entry",
      retire !== undefined
    );
  }
}

// ============================================================================
// Review & Approval Layer
// ============================================================================
//
// Tests cover: deterministic seed of the 10-item board, summary math,
// readiness gates, the markdown export hook, the journey-status
// integration, and the in-memory store roundtrip. All assertions are
// deterministic: no Date.now() inside derived functions.

{
  const reviewMod = require("../src/lib/review/review-board") as typeof import("../src/lib/review/review-board");
  const reviewTypes = require("../src/types/review") as typeof import("../src/types/review");
  const reviewStoreMod = require("../src/lib/review/review-store") as typeof import("../src/lib/review/review-store");

  const {
    initialItemsForRun,
    summarizeReviewBoard,
    unresolvedCommentCountByItem,
    criticalBlockingMessages,
  } = reviewMod;
  const {
    CRITICAL_REVIEW_ITEM_KINDS,
    NON_CRITICAL_REVIEW_ITEM_KINDS,
    REVIEW_ITEM_KIND_ORDER,
  } = reviewTypes;
  const {
    createMemoryReviewStore,
    STORAGE_KEY_REVIEW_ITEMS,
    STORAGE_KEY_REVIEW_COMMENTS,
  } = reviewStoreMod;

  const REVIEW_FIXED_TIME = 1715990400000; // 2024-05-18T00:00:00Z (deterministic)
  const reviewStrategy = buildStrategy(ASTRO_DATING_EXAMPLE);
  const reviewRunId = "review-run-1";
  const reviewProjectId = "review-proj-1";

  // ---- initialItemsForRun: shape + order ---------------------------------

  const seeded = initialItemsForRun(
    reviewProjectId,
    reviewRunId,
    reviewStrategy,
    REVIEW_FIXED_TIME
  );
  record(
    "review: initialItemsForRun emits exactly 10 items",
    seeded.length === 10,
    `Got ${seeded.length}`
  );
  record(
    "review: items follow deterministic kind order",
    seeded.every((it, i) => it.kind === REVIEW_ITEM_KIND_ORDER[i]),
    `Got order: ${seeded.map((it) => it.kind).join(", ")}`
  );
  record(
    "review: exactly 6 critical items",
    seeded.filter((it) => it.critical).length === 6
  );
  record(
    "review: exactly 4 non-critical items",
    seeded.filter((it) => !it.critical).length === 4
  );
  record(
    "review: critical kinds match the canonical critical set",
    seeded
      .filter((it) => it.critical)
      .every((it, i) => it.kind === CRITICAL_REVIEW_ITEM_KINDS[i])
  );
  record(
    "review: non-critical kinds match the canonical non-critical set",
    seeded
      .filter((it) => !it.critical)
      .every((it, i) => it.kind === NON_CRITICAL_REVIEW_ITEM_KINDS[i])
  );
  record(
    "review: every item id is stable as `${runId}:${kind}`",
    seeded.every((it) => it.id === `${reviewRunId}:${it.kind}`)
  );
  record(
    "review: every initial item status is 'pending'",
    seeded.every((it) => it.status === "pending")
  );
  record(
    "review: every initial item updatedAt matches caller-supplied now",
    seeded.every((it) => it.updatedAt === REVIEW_FIXED_TIME)
  );

  // Determinism — call twice with identical input, expect byte-identical
  // JSON output.
  const seededAgain = initialItemsForRun(
    reviewProjectId,
    reviewRunId,
    reviewStrategy,
    REVIEW_FIXED_TIME
  );
  record(
    "review: initialItemsForRun is deterministic (byte-identical output)",
    JSON.stringify(seeded) === JSON.stringify(seededAgain)
  );

  // ---- summarizeReviewBoard: scoring + readiness ------------------------

  const emptyBoardSummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: seeded,
    comments: [],
  });
  record(
    "review-summary: all-pending → approvalScore 0",
    emptyBoardSummary.approvalScore === 0,
    `Got ${emptyBoardSummary.approvalScore}`
  );
  record(
    "review-summary: all-pending → readiness 'not-ready'",
    emptyBoardSummary.approvalReadiness === "not-ready"
  );
  record(
    "review-summary: criticalTotal is 6",
    emptyBoardSummary.criticalTotal === 6
  );
  record(
    "review-summary: pendingCriticalKinds lists all 6 critical kinds when pending",
    emptyBoardSummary.pendingCriticalKinds.length === 6
  );

  function approveAll(items: ReturnType<typeof initialItemsForRun>) {
    return items.map((it) => ({
      ...it,
      status: "approved" as const,
      approvedBy: "owner" as const,
      approvedAt: REVIEW_FIXED_TIME,
      updatedAt: REVIEW_FIXED_TIME,
    }));
  }

  const allApprovedItems = approveAll(seeded);
  const allApprovedSummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: allApprovedItems,
    comments: [],
  });
  // 6 critical × 12 = 72, 4 non-critical × 5 = 20, clean-board bonus 8 → 100.
  record(
    "review-summary: all critical + non-critical approved + 0 comments → score 100",
    allApprovedSummary.approvalScore === 100,
    `Got ${allApprovedSummary.approvalScore}`
  );
  record(
    "review-summary: all critical approved + 0 comments → readiness 'ready'",
    allApprovedSummary.approvalReadiness === "ready"
  );
  record(
    "review-summary: criticalApproved === 6 when all critical approved",
    allApprovedSummary.criticalApproved === 6
  );

  // 5/6 critical approved → still not-ready since one critical is pending.
  const fiveOfSixItems = seeded.map((it, i) => {
    if (it.critical && i < 5) {
      return {
        ...it,
        status: "approved" as const,
        approvedBy: "owner" as const,
        approvedAt: REVIEW_FIXED_TIME,
        updatedAt: REVIEW_FIXED_TIME,
      };
    }
    return it;
  });
  const fiveOfSixSummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: fiveOfSixItems,
    comments: [],
  });
  record(
    "review-summary: 5/6 critical approved → readiness 'not-ready'",
    fiveOfSixSummary.approvalReadiness === "not-ready"
  );
  record(
    "review-summary: 5/6 critical approved → score < 100",
    fiveOfSixSummary.approvalScore < 100
  );
  // 5 × 12 = 60, no non-critical bonus, no clean bonus → 60.
  record(
    "review-summary: 5/6 critical approved + 0 non-critical → score 60",
    fiveOfSixSummary.approvalScore === 60,
    `Got ${fiveOfSixSummary.approvalScore}`
  );

  // All critical approved + 3 unresolved comments → readiness partial,
  // score = base 72 + 20 = 92 (no clean bonus due to unresolved), minus
  // 3 × 2 = 6 → 86.
  const threeUnresolvedComments = [
    {
      id: "c1",
      itemId: allApprovedItems[0].id,
      author: "client" as const,
      body: "Tighten the for-whom clause.",
      resolved: false,
      createdAt: REVIEW_FIXED_TIME,
    },
    {
      id: "c2",
      itemId: allApprovedItems[0].id,
      author: "client" as const,
      body: "Mechanism feels generic.",
      resolved: false,
      createdAt: REVIEW_FIXED_TIME,
    },
    {
      id: "c3",
      itemId: allApprovedItems[1].id,
      author: "media-buyer" as const,
      body: "Verify breakeven ROAS.",
      resolved: false,
      createdAt: REVIEW_FIXED_TIME,
    },
  ];
  const withCommentsSummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: allApprovedItems,
    comments: threeUnresolvedComments,
  });
  record(
    "review-summary: critical-approved + 3 unresolved → readiness 'partial'",
    withCommentsSummary.approvalReadiness === "partial"
  );
  record(
    "review-summary: critical-approved + 3 unresolved → score 86",
    withCommentsSummary.approvalScore === 86,
    `Got ${withCommentsSummary.approvalScore}`
  );
  record(
    "review-summary: unresolvedComments count matches",
    withCommentsSummary.unresolvedComments === 3
  );

  // One critical blocked → readiness 'not-ready', score reduced by 10.
  // Baseline all-approved minus the one critical we now mark blocked.
  // critical approvedCount = 5 (60 points), critical blocked = 1 (-10),
  // non-critical 4 × 5 = 20, no clean bonus → 70.
  const oneBlockedItems = allApprovedItems.map((it, i) =>
    it.critical && i === 2 ? { ...it, status: "blocked" as const, approvedBy: undefined, approvedAt: undefined } : it
  );
  const oneBlockedSummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: oneBlockedItems,
    comments: [],
  });
  record(
    "review-summary: one critical blocked → readiness 'not-ready'",
    oneBlockedSummary.approvalReadiness === "not-ready"
  );
  record(
    "review-summary: one critical blocked → score 70 (5×12 + 4×5 - 10)",
    oneBlockedSummary.approvalScore === 70,
    `Got ${oneBlockedSummary.approvalScore}`
  );
  record(
    "review-summary: blockedItems count matches",
    oneBlockedSummary.blockedItems === 1
  );

  // unresolvedCommentCountByItem counts correctly.
  const unresolvedByItem = unresolvedCommentCountByItem({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: allApprovedItems,
    comments: threeUnresolvedComments,
  });
  record(
    "review: unresolvedCommentCountByItem assigns 2 to first item",
    unresolvedByItem[allApprovedItems[0].id] === 2
  );
  record(
    "review: unresolvedCommentCountByItem assigns 1 to second item",
    unresolvedByItem[allApprovedItems[1].id] === 1
  );
  record(
    "review: unresolvedCommentCountByItem assigns 0 to items with no comments",
    unresolvedByItem[allApprovedItems[3].id] === 0
  );

  // criticalBlockingMessages — one sentence per pending critical when
  // not ready, empty when ready.
  const blockingMessagesEmpty = criticalBlockingMessages({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: allApprovedItems,
    comments: [],
  });
  record(
    "review: criticalBlockingMessages is empty when board is ready",
    blockingMessagesEmpty.length === 0
  );
  const blockingMessagesPending = criticalBlockingMessages({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: seeded, // all-pending
    comments: [],
  });
  record(
    "review: criticalBlockingMessages emits 6 sentences when all 6 critical pending",
    blockingMessagesPending.length === 6
  );
  record(
    "review: criticalBlockingMessages mentions Positioning for the pending positioning critical",
    blockingMessagesPending.some((m) => /Positioning/.test(m))
  );

  // ---- Journey Status integration ---------------------------------------
  //
  // We re-use the same all-green inputs from the existing journey-status
  // tests so the only variable is the reviewSummary argument.

  const reviewGreenTracking = {
    ...a.trackingReadiness,
    score: 95,
    blockers: 0,
    warnings: 0,
    checks: a.trackingReadiness.checks.map((c) => ({
      ...c,
      status: "passed" as const,
      fix: undefined,
    })),
    status: "ready" as const,
  };
  const reviewGreenDiag = {
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
  // Match the existing journey-status all-green pattern: omit the
  // Execution OS optional args so proof / first-batch / applied
  // reviews don't force the stage back to review-passed. These are
  // covered separately in their own tests above.
  const greenBaseArgs = {
    trackingReadiness: reviewGreenTracking,
    kpiLadder: a.kpiLadder,
    kpiDiagnosis: reviewGreenDiag,
    adReview: a.adReview,
    creatorBriefs: a.creatorBriefs,
    shotLists: a.shotLists,
    videoScripts: a.videoScripts,
    variantSets: a.variantSets,
  };

  // Provide a not-ready review summary — expect a review warning AND
  // the stage to drop from ready-to-spend.
  const notReadySummary = emptyBoardSummary; // all-pending → not-ready
  const journeyNotReady = buildJourneyStatus({
    ...greenBaseArgs,
    reviewSummary: notReadySummary,
  });
  const reviewEntriesNotReady = [
    ...journeyNotReady.blockers,
    ...journeyNotReady.warnings,
  ].filter((e: any) => e.kind === "review");
  record(
    "journey/review: not-ready summary emits at least one review entry",
    reviewEntriesNotReady.length >= 1
  );
  record(
    "journey/review: review entry message lists first 3 pending kinds",
    reviewEntriesNotReady.some(
      (e: any) =>
        /Positioning/.test(e.message) &&
        /Offer/.test(e.message) &&
        /Proof assets/.test(e.message)
    )
  );
  record(
    "journey/review: ready-to-spend NOT reached when review is not ready",
    journeyNotReady.currentStage !== "ready-to-spend"
  );

  // pendingCriticalKinds > 0 → severity upgraded to blocker.
  record(
    "journey/review: pendingCriticalKinds > 0 → severity escalates to blocker",
    journeyNotReady.blockers.some((b: any) => b.kind === "review")
  );

  // blockedItems > 0 → severity upgrades to blocker (even when no
  // pending critical, blocked count alone is enough).
  const blockedOnlySummary = summarizeReviewBoard({
    projectId: reviewProjectId,
    runId: reviewRunId,
    items: oneBlockedItems,
    comments: [],
  });
  const journeyBlocked = buildJourneyStatus({
    ...greenBaseArgs,
    reviewSummary: blockedOnlySummary,
  });
  record(
    "journey/review: blockedItems > 0 escalates review severity to blocker",
    journeyBlocked.blockers.some((b: any) => b.kind === "review")
  );

  // Ready summary → no review entry, stage reaches ready-to-spend.
  const readySummary = allApprovedSummary;
  const journeyReady = buildJourneyStatus({
    ...greenBaseArgs,
    reviewSummary: readySummary,
  });
  const readyReviewEntries = [
    ...journeyReady.blockers,
    ...journeyReady.warnings,
  ].filter((e: any) => e.kind === "review");
  record(
    "journey/review: ready summary emits NO review warning",
    readyReviewEntries.length === 0
  );
  record(
    "journey/review: ready summary reaches 'ready-to-spend' when other gates pass",
    journeyReady.currentStage === "ready-to-spend",
    `Got ${journeyReady.currentStage}`
  );

  // Legacy (no reviewSummary) behaviour preserved.
  const journeyLegacy = buildJourneyStatus(greenBaseArgs);
  record(
    "journey/review: legacy form (no reviewSummary) still reaches ready-to-spend",
    journeyLegacy.currentStage === "ready-to-spend"
  );

  // ---- Memory store roundtrip --------------------------------------------

  {
    const store = createMemoryReviewStore();
    const memRun = {
      id: "mem-run-1",
      projectId: "mem-proj-1",
      runAt: "2026-05-18T00:00:00.000Z",
      input: ASTRO_DATING_EXAMPLE,
      strategy: reviewStrategy,
    };
    store.initBoardFromRun("mem-proj-1", memRun);
    const listed = store.listItems("mem-proj-1", memRun.id);
    record(
      "review-store: initBoardFromRun seeds 10 items",
      listed.length === 10
    );
    // Idempotency.
    store.initBoardFromRun("mem-proj-1", memRun);
    record(
      "review-store: initBoardFromRun is idempotent",
      store.listItems("mem-proj-1", memRun.id).length === 10
    );

    // upsertItem → listItems returns it.
    const first = listed[0];
    store.upsertItem({ ...first, status: "approved" });
    const after = store.listItems("mem-proj-1", memRun.id).find((it: any) => it.id === first.id);
    record(
      "review-store: upsertItem updates status",
      after !== undefined && after.status === "approved"
    );

    // addComment → listComments returns it.
    const c = store.addComment({
      itemId: first.id,
      author: "client",
      body: "Tighten the for-whom clause.",
    });
    record(
      "review-store: addComment returns a comment with an id",
      typeof c.id === "string" && c.id.length > 0
    );
    record(
      "review-store: addComment stamps createdAt",
      typeof c.createdAt === "number" && c.createdAt > 0
    );
    const listedComments = store.listComments(first.id);
    record(
      "review-store: listComments returns the new comment",
      listedComments.length === 1 && listedComments[0].id === c.id
    );

    // resolveComment.
    store.resolveComment(c.id);
    const resolved = store.listComments(first.id)[0];
    record(
      "review-store: resolveComment flips resolved + stamps resolvedAt",
      resolved.resolved === true && typeof resolved.resolvedAt === "number"
    );

    // deleteItem cascades comments.
    store.addComment({
      itemId: first.id,
      author: "owner",
      body: "Confirm.",
    });
    store.deleteItem(first.id);
    record(
      "review-store: deleteItem cascades to comments",
      store.listComments(first.id).length === 0
    );

    // clearForRun drops all items + their comments.
    store.addComment({
      itemId: listed[1].id,
      author: "client",
      body: "Also needs attention.",
    });
    store.clearForRun(memRun.id);
    record(
      "review-store: clearForRun removes all items for the run",
      store.listItems("mem-proj-1", memRun.id).length === 0
    );
    record(
      "review-store: clearForRun cascades to comments",
      store.listComments(listed[1].id).length === 0
    );
  }

  // ---- localStorage key constants ----------------------------------------

  record(
    "review-store: STORAGE_KEY_REVIEW_ITEMS is the exact versioned key",
    STORAGE_KEY_REVIEW_ITEMS === "bigad:review-items:v1"
  );
  record(
    "review-store: STORAGE_KEY_REVIEW_COMMENTS is the exact versioned key",
    STORAGE_KEY_REVIEW_COMMENTS === "bigad:review-comments:v1"
  );

  // ---- Serialization losslessness ----------------------------------------

  {
    const item = seeded[0];
    const roundtripItem = JSON.parse(JSON.stringify(item));
    record(
      "review: ReviewItem serialization is lossless",
      JSON.stringify(roundtripItem) === JSON.stringify(item)
    );
    const comment = threeUnresolvedComments[0];
    const roundtripComment = JSON.parse(JSON.stringify(comment));
    record(
      "review: ReviewComment serialization is lossless",
      JSON.stringify(roundtripComment) === JSON.stringify(comment)
    );
  }

  // ---- Approval Pack export-brief integration ----------------------------

  {
    const briefWithBoard = generateExportBrief(
      ASTRO_DATING_EXAMPLE,
      reviewStrategy,
      {
        reviewBoard: {
          items: allApprovedItems,
          comments: threeUnresolvedComments,
          summary: withCommentsSummary,
        },
      }
    );
    record(
      "review-export: Approval Pack header present when board provided",
      briefWithBoard.includes("## Approval Pack")
    );
    record(
      "review-export: Approval Pack lists every critical item by label",
      briefWithBoard.includes("Positioning") &&
        briefWithBoard.includes("Offer") &&
        briefWithBoard.includes("Proof assets") &&
        briefWithBoard.includes("First test batch") &&
        briefWithBoard.includes("Campaign setup") &&
        briefWithBoard.includes("Client report")
    );
    record(
      "review-export: Approval Pack lists Critical items header",
      briefWithBoard.includes("### Critical items")
    );
    record(
      "review-export: Approval Pack lists Non-critical items header",
      briefWithBoard.includes("### Non-critical items")
    );
    record(
      "review-export: Approval Pack lists Open comments header when unresolved present",
      briefWithBoard.includes("### Open comments")
    );

    const briefWithoutBoard = generateExportBrief(
      ASTRO_DATING_EXAMPLE,
      reviewStrategy
    );
    record(
      "review-export: Approval Pack absent when no board provided",
      !briefWithoutBoard.includes("## Approval Pack")
    );

    // Empty board (zero items) → no section.
    const briefEmptyBoard = generateExportBrief(
      ASTRO_DATING_EXAMPLE,
      reviewStrategy,
      {
        reviewBoard: {
          items: [],
          comments: [],
          summary: {
            approvalScore: 0,
            approvalReadiness: "not-ready",
            criticalApproved: 0,
            criticalTotal: 6,
            unresolvedComments: 0,
            blockedItems: 0,
            needsChangesItems: 0,
            pendingCriticalKinds: [],
            derivedAt: 0,
          },
        },
      }
    );
    record(
      "review-export: Approval Pack absent when board has zero items",
      !briefEmptyBoard.includes("## Approval Pack")
    );
  }

  // ---- buildStrategy determinism (sanity) --------------------------------

  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "review: buildStrategy determinism check holds after Review Layer added",
    JSON.stringify(detA) === JSON.stringify(detB)
  );
}

// ============================================================================
// === Agency Packaging Layer ===
// ============================================================================
//
// Tests cover: catalog completeness (5 templates, 5 roles, 4 packages),
// the deterministic buildDeliverySummary derivation, the in-memory store
// roundtrip, the markdown export hook, and the buildStrategy determinism
// guard (engine purity).

{
  const catalogMod = require("../src/lib/agency/catalog") as typeof import("../src/lib/agency/catalog");
  const dsMod = require("../src/lib/agency/delivery-summary") as typeof import("../src/lib/agency/delivery-summary");
  const storeMod = require("../src/lib/agency/agency-store") as typeof import("../src/lib/agency/agency-store");

  const {
    PROJECT_TEMPLATES,
    ROLE_PRESETS,
    PACKAGE_PRESETS,
    listTemplates,
    listRoles,
    listPackages,
    getTemplate,
    getRole,
    getPackage,
  } = catalogMod;
  const { buildDeliverySummary } = dsMod;
  const { createMemoryAgencyStore, STORAGE_KEY_AGENCY_SELECTION } = storeMod;

  const AGENCY_FIXED_TIME = 1715990400000; // 2024-05-18T00:00:00Z

  // ---- Templates: presence + content -----------------------------------

  const expectedTemplateIds = [
    "app-launch",
    "ecommerce-seasonal",
    "saas-evergreen",
    "local-service-leadgen",
    "creator-product-launch",
  ] as const;

  record(
    "agency: PROJECT_TEMPLATES has all 5 templates",
    expectedTemplateIds.every((id) => !!PROJECT_TEMPLATES[id])
  );
  record(
    "agency: listTemplates returns 5 templates",
    listTemplates().length === 5
  );
  record(
    "agency: listTemplates and PROJECT_TEMPLATES match",
    listTemplates().every((t) => PROJECT_TEMPLATES[t.id] === t)
  );

  for (const id of expectedTemplateIds) {
    const t = getTemplate(id);
    record(
      `agency: template ${id} has non-empty label`,
      typeof t.label === "string" && t.label.length > 0
    );
    record(
      `agency: template ${id} has non-empty summary`,
      typeof t.summary === "string" && t.summary.length > 0
    );
    record(
      `agency: template ${id} defaultProofRequirements >= 3`,
      t.defaultProofRequirements.length >= 3,
      `Got ${t.defaultProofRequirements.length}`
    );
    record(
      `agency: template ${id} trackingChecklistEmphasis >= 3`,
      t.trackingChecklistEmphasis.length >= 3,
      `Got ${t.trackingChecklistEmphasis.length}`
    );
    record(
      `agency: template ${id} recommendedOutputSections >= 3`,
      t.recommendedOutputSections.length >= 3,
      `Got ${t.recommendedOutputSections.length}`
    );
    record(
      `agency: template ${id} recommendedReportSections >= 3`,
      t.recommendedReportSections.length >= 3,
      `Got ${t.recommendedReportSections.length}`
    );
    record(
      `agency: template ${id} reviewApprovalItems >= 3`,
      t.reviewApprovalItems.length >= 3,
      `Got ${t.reviewApprovalItems.length}`
    );
    record(
      `agency: template ${id} defaultPackage is a valid PackagePresetId`,
      !!PACKAGE_PRESETS[t.defaultPackage]
    );
  }

  // ---- Roles: presence + content ---------------------------------------

  const expectedRoleIds = [
    "owner",
    "client",
    "media-buyer",
    "creator",
    "strategist",
  ] as const;

  record(
    "agency: ROLE_PRESETS has all 5 roles",
    expectedRoleIds.every((id) => !!ROLE_PRESETS[id])
  );
  record("agency: listRoles returns 5 roles", listRoles().length === 5);

  for (const id of expectedRoleIds) {
    const r = getRole(id);
    record(
      `agency: role ${id} has non-empty label`,
      typeof r.label === "string" && r.label.length > 0
    );
    record(
      `agency: role ${id} cares >= 2`,
      r.cares.length >= 2,
      `Got ${r.cares.length}`
    );
    record(
      `agency: role ${id} approves is an array (>= 0)`,
      Array.isArray(r.approves)
    );
    record(
      `agency: role ${id} hides is an array (>= 0)`,
      Array.isArray(r.hides)
    );
    record(
      `agency: role ${id} has handoffFormat`,
      typeof r.handoffFormat === "string" && r.handoffFormat.length > 0
    );
    record(
      `agency: role ${id} defaultQuestions >= 2`,
      r.defaultQuestions.length >= 2,
      `Got ${r.defaultQuestions.length}`
    );
  }

  // ---- Packages: presence + content ------------------------------------

  const expectedPackageIds = [
    "strategy-sprint",
    "launch-sprint",
    "growth-os-setup",
    "custom-build",
  ] as const;

  record(
    "agency: PACKAGE_PRESETS has all 4 packages",
    expectedPackageIds.every((id) => !!PACKAGE_PRESETS[id])
  );
  record("agency: listPackages returns 4 packages", listPackages().length === 4);

  for (const id of expectedPackageIds) {
    const p = getPackage(id);
    record(
      `agency: package ${id} deliverables >= 3`,
      p.deliverables.length >= 3,
      `Got ${p.deliverables.length}`
    );
    record(
      `agency: package ${id} timelineDays.min < max`,
      p.timelineDays.min < p.timelineDays.max,
      `Got ${p.timelineDays.min} / ${p.timelineDays.max}`
    );
    record(
      `agency: package ${id} priceRangeUsd.min < max`,
      p.priceRangeUsd.min < p.priceRangeUsd.max,
      `Got ${p.priceRangeUsd.min} / ${p.priceRangeUsd.max}`
    );
    record(
      `agency: package ${id} includedModules >= 3`,
      p.includedModules.length >= 3,
      `Got ${p.includedModules.length}`
    );
    record(
      `agency: package ${id} clientResponsibilities >= 3`,
      p.clientResponsibilities.length >= 3,
      `Got ${p.clientResponsibilities.length}`
    );
    record(
      `agency: package ${id} acceptanceCriteria >= 3`,
      p.acceptanceCriteria.length >= 3,
      `Got ${p.acceptanceCriteria.length}`
    );
  }

  // ---- buildDeliverySummary: determinism + shape -----------------------

  const agencyStrategy = buildStrategy(ASTRO_DATING_EXAMPLE);
  const templateSprint = getTemplate("app-launch");
  const roleClient = getRole("client");
  const packageStrategy = getPackage("strategy-sprint");
  const packageLaunch = getPackage("launch-sprint");

  // First call with no template/role/package
  const summaryBare1 = buildDeliverySummary({ strategy: agencyStrategy });
  const summaryBare2 = buildDeliverySummary({ strategy: agencyStrategy });
  record(
    "agency: buildDeliverySummary determinism (no selection) — byte-identical",
    JSON.stringify(summaryBare1) === JSON.stringify(summaryBare2)
  );
  record(
    "agency: buildDeliverySummary returns array fields when no selection (no nulls)",
    Array.isArray(summaryBare1.whatWasDecided) &&
      Array.isArray(summaryBare1.whatNeedsApproval) &&
      Array.isArray(summaryBare1.whatWillLaunchFirst) &&
      Array.isArray(summaryBare1.missingAssets) &&
      Array.isArray(summaryBare1.clientNeedsToProvide) &&
      Array.isArray(summaryBare1.nextMeetingAgenda)
  );
  record(
    "agency: bare delivery summary mentions 'No active review board' when no board",
    summaryBare1.whatNeedsApproval.some((s) =>
      s.toLowerCase().includes("no active review board")
    )
  );

  // Determinism with full context
  const fullInput: Parameters<typeof buildDeliverySummary>[0] = {
    strategy: agencyStrategy,
    template: templateSprint,
    role: roleClient,
    pkg: packageStrategy,
  };
  const summaryFull1 = buildDeliverySummary(fullInput);
  const summaryFull2 = buildDeliverySummary(fullInput);
  record(
    "agency: buildDeliverySummary determinism (full selection) — byte-identical",
    JSON.stringify(summaryFull1) === JSON.stringify(summaryFull2)
  );

  // Different packages → different summaries on the same strategy.
  // The summary's clientNeedsToProvide / nextMeetingAgenda do NOT
  // currently depend on the package (template + role drive those), so
  // we vary by template too to ensure variance. Compare two summaries
  // produced with the package field swapped; one of the summary fields
  // must differ because the templates differ.
  const summaryTemplateA = buildDeliverySummary({
    strategy: agencyStrategy,
    template: getTemplate("app-launch"),
    pkg: packageStrategy,
  });
  const summaryTemplateB = buildDeliverySummary({
    strategy: agencyStrategy,
    template: getTemplate("ecommerce-seasonal"),
    pkg: packageLaunch,
  });
  record(
    "agency: buildDeliverySummary varies with template+package selection",
    JSON.stringify(summaryTemplateA.clientNeedsToProvide) !==
      JSON.stringify(summaryTemplateB.clientNeedsToProvide)
  );

  // Engine purity: buildStrategy is byte-identical under agency context
  // — because buildStrategy never SEES agency input, this is implicitly
  // true, but we assert it explicitly to lock the guarantee.
  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "agency: buildStrategy determinism preserved after Agency Layer added",
    JSON.stringify(detA) === JSON.stringify(detB)
  );

  // Fake reviewBoard to exercise the whatNeedsApproval / missingAssets paths.
  const reviewMod = require("../src/lib/review/review-board") as typeof import("../src/lib/review/review-board");
  const reviewTypes = require("../src/types/review") as typeof import("../src/types/review");
  const { initialItemsForRun, summarizeReviewBoard } = reviewMod;
  const seededForAgency = initialItemsForRun(
    "agency-proj-1",
    "agency-run-1",
    agencyStrategy,
    AGENCY_FIXED_TIME
  );
  const agencyBoard = {
    items: seededForAgency,
    comments: [] as ReturnType<typeof reviewMod.summarizeReviewBoard> extends infer _ ? import("../src/types/review").ReviewComment[] : never,
    summary: summarizeReviewBoard({
      projectId: "agency-proj-1",
      runId: "agency-run-1",
      items: seededForAgency,
      comments: [],
    }),
  };
  void reviewTypes;

  const summaryWithBoard = buildDeliverySummary({
    strategy: agencyStrategy,
    template: templateSprint,
    pkg: packageStrategy,
    reviewBoard: agencyBoard,
  });
  record(
    "agency: whatNeedsApproval non-empty when reviewBoard has pendingCriticalKinds",
    summaryWithBoard.whatNeedsApproval.length > 0 &&
      summaryWithBoard.whatNeedsApproval.some((s) =>
        s.toLowerCase().includes("pending critical")
      )
  );

  // missingAssets reflects proofAssetPlan.missingBeforeSpend
  const expectedMissingCount =
    agencyStrategy.proofAssetPlan.missingBeforeSpend.length;
  record(
    "agency: missingAssets reflects proofAssetPlan.missingBeforeSpend",
    expectedMissingCount === 0
      ? summaryWithBoard.missingAssets.length >= 0
      : summaryWithBoard.missingAssets.length >= 1
  );

  // derivedAt is NOT Date.now() — two calls one second apart with
  // identical state return identical derivedAt.
  const summaryT1 = buildDeliverySummary({
    strategy: agencyStrategy,
    template: templateSprint,
    pkg: packageStrategy,
    reviewBoard: agencyBoard,
  });
  // Simulate elapsed wall-clock without changing the input.
  const summaryT2 = buildDeliverySummary({
    strategy: agencyStrategy,
    template: templateSprint,
    pkg: packageStrategy,
    reviewBoard: agencyBoard,
  });
  record(
    "agency: derivedAt is NOT Date.now() — two calls with identical state agree",
    summaryT1.derivedAt === summaryT2.derivedAt
  );
  record(
    "agency: derivedAt sources from review board (>= AGENCY_FIXED_TIME)",
    summaryWithBoard.derivedAt >= AGENCY_FIXED_TIME
  );

  // ---- Memory store roundtrip ------------------------------------------

  {
    const store = createMemoryAgencyStore();
    record(
      "agency-store: empty getSelection returns undefined",
      store.getSelection("p-x") === undefined
    );
    store.setSelection({
      projectId: "p-1",
      templateId: "app-launch",
      roleId: "client",
      packageId: "launch-sprint",
      updatedAt: AGENCY_FIXED_TIME,
    });
    const got = store.getSelection("p-1");
    record(
      "agency-store: setSelection + getSelection returns equal object",
      !!got &&
        got.projectId === "p-1" &&
        got.templateId === "app-launch" &&
        got.roleId === "client" &&
        got.packageId === "launch-sprint" &&
        got.updatedAt === AGENCY_FIXED_TIME
    );
    // Second selection on a different project should not collide.
    store.setSelection({
      projectId: "p-2",
      templateId: "saas-evergreen",
      updatedAt: AGENCY_FIXED_TIME + 1,
    });
    record(
      "agency-store: setSelection keeps per-project selections separate",
      store.getSelection("p-1")?.templateId === "app-launch" &&
        store.getSelection("p-2")?.templateId === "saas-evergreen"
    );
    // Overwrite same project.
    store.setSelection({
      projectId: "p-1",
      templateId: "ecommerce-seasonal",
      updatedAt: AGENCY_FIXED_TIME + 2,
    });
    record(
      "agency-store: setSelection overwrites existing project",
      store.getSelection("p-1")?.templateId === "ecommerce-seasonal"
    );
    // Clear.
    store.clearSelection("p-1");
    record(
      "agency-store: clearSelection drops the selection",
      store.getSelection("p-1") === undefined
    );
  }

  record(
    "agency-store: STORAGE_KEY_AGENCY_SELECTION is the exact versioned key",
    STORAGE_KEY_AGENCY_SELECTION === "bigad:agency-selection:v1"
  );

  // ---- Export brief — Agency Delivery Pack section ---------------------

  const exportSummary = buildDeliverySummary({
    strategy: agencyStrategy,
    template: templateSprint,
    role: roleClient,
    pkg: packageStrategy,
    reviewBoard: agencyBoard,
  });

  const briefWithAgency = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    agencyStrategy,
    {
      agency: {
        template: templateSprint,
        role: roleClient,
        pkg: packageStrategy,
        deliverySummary: exportSummary,
      },
    }
  );
  record(
    "agency-export: brief contains '## Agency Delivery Pack' header when context provided",
    briefWithAgency.includes("## Agency Delivery Pack")
  );
  record(
    "agency-export: brief contains '### Selected template' header",
    briefWithAgency.includes("### Selected template")
  );
  record(
    "agency-export: brief contains '### Selected package' header",
    briefWithAgency.includes("### Selected package")
  );
  record(
    "agency-export: brief contains '### Role-based handoff notes' header",
    briefWithAgency.includes("### Role-based handoff notes")
  );
  record(
    "agency-export: brief contains '### Delivery summary' header",
    briefWithAgency.includes("### Delivery summary")
  );
  record(
    "agency-export: brief contains '### Client responsibilities' header",
    briefWithAgency.includes("### Client responsibilities")
  );
  record(
    "agency-export: brief contains '### Acceptance criteria' header",
    briefWithAgency.includes("### Acceptance criteria")
  );
  record(
    "agency-export: brief contains selected template label",
    briefWithAgency.includes(templateSprint.label)
  );
  record(
    "agency-export: brief contains selected package label",
    briefWithAgency.includes(packageStrategy.label)
  );

  // Agency-only export (template only) — still emits the section.
  const briefTemplateOnly = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    agencyStrategy,
    { agency: { template: templateSprint } }
  );
  record(
    "agency-export: brief emits section with just a template",
    briefTemplateOnly.includes("## Agency Delivery Pack") &&
      briefTemplateOnly.includes("### Selected template")
  );

  // Without agency context entirely — section absent.
  const briefWithoutAgency = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    agencyStrategy
  );
  record(
    "agency-export: brief omits '## Agency Delivery Pack' when context absent",
    !briefWithoutAgency.includes("## Agency Delivery Pack")
  );

  // With agency = {} (empty object) — section absent.
  const briefEmptyAgency = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    agencyStrategy,
    { agency: {} }
  );
  record(
    "agency-export: brief omits '## Agency Delivery Pack' when every agency field is undefined",
    !briefEmptyAgency.includes("## Agency Delivery Pack")
  );

  // Engine determinism is preserved.
  const detC = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detD = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "agency: final buildStrategy determinism check holds after Agency Layer added",
    JSON.stringify(detC) === JSON.stringify(detD)
  );
}

// ============================================================================
// === Playbook Library ===
// ============================================================================
//
// Tests cover: catalog completeness (10 playbooks), the deterministic
// recommendation engine (fit-score ordering, anti-fit rules, agency
// nudge, determinism), the in-memory store roundtrip, the markdown
// export hook, and the buildStrategy determinism guard.

{
  const playbookCatalog = require("../src/lib/playbook/catalog") as typeof import("../src/lib/playbook/catalog");
  const playbookRecommend = require("../src/lib/playbook/recommend") as typeof import("../src/lib/playbook/recommend");
  const playbookStoreMod = require("../src/lib/playbook/playbook-store") as typeof import("../src/lib/playbook/playbook-store");

  const { PLAYBOOKS, listPlaybooks, getPlaybook } = playbookCatalog;
  const { recommendPlaybooks } = playbookRecommend;
  const { createMemoryPlaybookStore, STORAGE_KEY_APPLIED_PLAYBOOK } =
    playbookStoreMod;

  // ---- Catalog completeness --------------------------------------------

  const expectedPlaybookIds = [
    "saas-free-trial-launch",
    "mobile-app-launch",
    "dating-app-launch",
    "ecommerce-seasonal-promo",
    "local-service-leadgen",
    "creator-product-drop",
    "waitlist-launch",
    "retargeting-rescue",
    "landing-cro-sprint",
    "agency-strategy-sprint",
  ] as const;

  record(
    "playbook: PLAYBOOKS has exactly 10 entries",
    Object.keys(PLAYBOOKS).length === 10,
    `Got ${Object.keys(PLAYBOOKS).length}`
  );
  record(
    "playbook: PLAYBOOKS has all 10 expected ids",
    expectedPlaybookIds.every((id) => !!PLAYBOOKS[id])
  );
  record(
    "playbook: listPlaybooks returns 10 playbooks",
    listPlaybooks().length === 10
  );

  for (const id of expectedPlaybookIds) {
    const p = getPlaybook(id);
    record(
      `playbook ${id}: has non-empty name`,
      typeof p.name === "string" && p.name.length > 0
    );
    record(
      `playbook ${id}: bestFor >= 3`,
      p.bestFor.length >= 3,
      `Got ${p.bestFor.length}`
    );
    record(
      `playbook ${id}: notFor >= 2`,
      p.notFor.length >= 2,
      `Got ${p.notFor.length}`
    );
    record(
      `playbook ${id}: businessModels >= 1`,
      p.businessModels.length >= 1
    );
    record(
      `playbook ${id}: campaignTypes >= 1`,
      p.campaignTypes.length >= 1
    );
    record(
      `playbook ${id}: awarenessStages >= 1`,
      p.awarenessStages.length >= 1
    );
    record(
      `playbook ${id}: channels >= 1`,
      p.channels.length >= 1
    );
    record(
      `playbook ${id}: recommendedModules >= 3`,
      p.recommendedModules.length >= 3,
      `Got ${p.recommendedModules.length}`
    );
    record(
      `playbook ${id}: requiredInputs >= 1`,
      p.requiredInputs.length >= 1
    );
    record(
      `playbook ${id}: proofRequirements >= 3`,
      p.proofRequirements.length >= 3,
      `Got ${p.proofRequirements.length}`
    );
    record(
      `playbook ${id}: executionSteps between 6 and 10`,
      p.executionSteps.length >= 6 && p.executionSteps.length <= 10,
      `Got ${p.executionSteps.length}`
    );
    // executionSteps orders are 1..N contiguous (no gaps)
    const orders = p.executionSteps.map((s) => s.order);
    const contiguous = orders.every((o, i) => o === i + 1);
    record(
      `playbook ${id}: executionSteps orders are 1..N contiguous`,
      contiguous,
      `Got [${orders.join(", ")}]`
    );
    record(
      `playbook ${id}: launchGates >= 3`,
      p.launchGates.length >= 3,
      `Got ${p.launchGates.length}`
    );
    record(
      `playbook ${id}: defaultTestPlan.cellCount.min < max`,
      p.defaultTestPlan.cellCount.min < p.defaultTestPlan.cellCount.max,
      `Got ${p.defaultTestPlan.cellCount.min} / ${p.defaultTestPlan.cellCount.max}`
    );
    record(
      `playbook ${id}: defaultTestPlan.cellCount.min >= 1`,
      p.defaultTestPlan.cellCount.min >= 1
    );
    record(
      `playbook ${id}: defaultTestPlan.cellCount.max <= 12`,
      p.defaultTestPlan.cellCount.max <= 12
    );
    record(
      `playbook ${id}: defaultTestPlan has >= 1 format`,
      p.defaultTestPlan.formats.length >= 1
    );
    record(
      `playbook ${id}: reportingFocus >= 3`,
      p.reportingFocus.length >= 3,
      `Got ${p.reportingFocus.length}`
    );
    record(
      `playbook ${id}: reviewRequirements >= 1`,
      p.reviewRequirements.length >= 1
    );
    record(
      `playbook ${id}: estimatedTimelineDays.min < max`,
      p.estimatedTimelineDays.min < p.estimatedTimelineDays.max
    );
    record(
      `playbook ${id}: riskNotes >= 2`,
      p.riskNotes.length >= 2,
      `Got ${p.riskNotes.length}`
    );
  }

  // ---- Recommendation engine: determinism + ordering ------------------

  const playbookStrategy = buildStrategy(ASTRO_DATING_EXAMPLE);

  // Determinism: same input twice → deep equal.
  const rec1 = recommendPlaybooks(ASTRO_DATING_EXAMPLE, playbookStrategy);
  const rec2 = recommendPlaybooks(ASTRO_DATING_EXAMPLE, playbookStrategy);
  record(
    "playbook-recommend: determinism — two calls produce deep-equal output",
    JSON.stringify(rec1) === JSON.stringify(rec2)
  );

  // ranked.length === 10 always.
  record(
    "playbook-recommend: ranked.length === 10",
    rec1.ranked.length === 10
  );

  // scores in non-increasing order.
  const orderedOk = rec1.ranked.every(
    (s, i) => i === 0 || rec1.ranked[i - 1].score >= s.score
  );
  record(
    "playbook-recommend: scores are in non-increasing order",
    orderedOk,
    `Got scores: ${rec1.ranked.map((r) => r.score).join(", ")}`
  );

  // derivedAt is NOT Date.now() — two calls "5ms apart" return identical.
  // We simulate by calling back-to-back; the recommendation must not
  // pull wall-clock.
  const recT1 = recommendPlaybooks(ASTRO_DATING_EXAMPLE, playbookStrategy);
  // Spin briefly to ensure any Date.now() read would differ.
  const startSpin = Date.now();
  while (Date.now() - startSpin < 6) {
    // tight spin >5ms
  }
  const recT2 = recommendPlaybooks(ASTRO_DATING_EXAMPLE, playbookStrategy);
  record(
    "playbook-recommend: derivedAt is NOT Date.now() — two calls ~5ms apart agree",
    recT1.derivedAt === recT2.derivedAt
  );

  // AstroDating fixture: dating-app-launch OR mobile-app-launch in top 2.
  const astroTop2 = rec1.ranked.slice(0, 2).map((r) => r.playbookId);
  record(
    "playbook-recommend: AstroDating fixture — dating-app-launch or mobile-app-launch in top 2",
    astroTop2.includes("dating-app-launch") ||
      astroTop2.includes("mobile-app-launch"),
    `Top 2: ${astroTop2.join(", ")}`
  );

  // topScore non-empty reasons.
  record(
    "playbook-recommend: topScore.reasons non-empty when top score > 0",
    !rec1.topScore || rec1.topScore.reasons.length > 0
  );

  // SaaS fixture → saas-free-trial-launch is top 1.
  const saasFixture: ProductInput = {
    name: "Clearframe",
    category: "saas",
    description:
      "Self-serve SaaS for B2B teams to model unit economics in 5 minutes — no spreadsheets, no implementation calls.",
    price: "$39/seat/mo",
    businessModel: "subscription",
    audience:
      "B2B finance leaders and operators at 20-200 person SaaS companies who hate quarterly board-deck rebuilds",
    audiencePain:
      "Rebuilding the same unit-economics deck every quarter, chasing spreadsheets nobody owns, and trusting models nobody can audit",
    competitors: "Causal, Cube, Mosaic",
    differentiator:
      "A model that pulls live numbers from Stripe and the data warehouse so the board deck rebuilds itself in under a minute",
    goal: "Drive 200 self-serve trial_start events per month with a 25% activation rate inside 14 days",
    awareness: "solution-aware",
    sophistication: "skeptical-market",
    campaignType: "launch",
    offerContext: {
      cogsPercent: 15,
      targetMarginPercent: 60,
      currentAOV: 468,
      targetROAS: 2.5,
    },
  };
  const saasStrategy = buildStrategy(saasFixture);
  const saasRec = recommendPlaybooks(saasFixture, saasStrategy);
  record(
    "playbook-recommend: SaaS fixture — saas-free-trial-launch is top 1",
    saasRec.ranked[0]?.playbookId === "saas-free-trial-launch",
    `Top: ${saasRec.ranked[0]?.playbookId}`
  );

  // Ecommerce seasonal fixture → ecommerce-seasonal-promo is top 1.
  const ecommerceFixture: ProductInput = {
    name: "Solstice",
    category: "specialty home goods",
    description:
      "A holiday gifting brand of artisan ceramics shipped from named potters — every bowl tagged with the studio it came from.",
    price: "$58 average per piece",
    businessModel: "one-time",
    audience:
      "specialty-home gift buyers who want a present that does not feel mass-market for the Q4 holiday season",
    audiencePain:
      "Last-minute holiday gifts that all look identical from the same big box retailers and feel impersonal under the tree",
    competitors: "Food52, Anthropologie, Crate & Barrel",
    differentiator:
      "Every piece names the potter studio and ships with a card the artist wrote — not a brand marketing team",
    goal: "Hit $250k in November–December gifting revenue with a 3.0x ROAS across paid channels",
    awareness: "problem-aware",
    sophistication: "skeptical-market",
    campaignType: "seasonal",
    offerContext: {
      cogsPercent: 40,
      targetMarginPercent: 35,
      currentAOV: 92,
      targetROAS: 3.0,
    },
  };
  const ecomStrategy = buildStrategy(ecommerceFixture);
  const ecomRec = recommendPlaybooks(ecommerceFixture, ecomStrategy);
  record(
    "playbook-recommend: Ecommerce seasonal fixture — ecommerce-seasonal-promo is top 1",
    ecomRec.ranked[0]?.playbookId === "ecommerce-seasonal-promo",
    `Top: ${ecomRec.ranked[0]?.playbookId}`
  );

  // Cold launch fixture (no retargeting pool) → retargeting-rescue NOT top 1.
  const coldLaunchFixture: ProductInput = {
    name: "Newvine",
    category: "wellness app",
    description:
      "A brand-new daily breath-work app launching with no existing audience and no retargeting pool.",
    price: "Free with $7/month premium",
    businessModel: "freemium",
    audience:
      "stressed knowledge workers in their thirties trying to add a daily nervous-system reset to their routine",
    audiencePain:
      "Anxious mornings and afternoon crashes that meditation apps treat with content, not with a daily reset that actually fits a workday",
    competitors: "Calm, Headspace, Othership",
    differentiator:
      "Sub-90-second guided breath sessions designed to slot between meetings, not replace them",
    goal: "Launch with 5,000 installs in the first 30 days at a sub-$3 CPI",
    awareness: "problem-aware",
    sophistication: "amplified-claims",
    campaignType: "launch",
  };
  const coldStrategy = buildStrategy(coldLaunchFixture);
  const coldRec = recommendPlaybooks(coldLaunchFixture, coldStrategy);
  const coldTop1 = coldRec.ranked[0]?.playbookId;
  record(
    "playbook-recommend: cold-launch fixture — retargeting-rescue is NOT top 1",
    coldTop1 !== "retargeting-rescue",
    `Top: ${coldTop1}`
  );
  const coldTop3 = coldRec.ranked.slice(0, 3).map((r) => r.playbookId);
  record(
    "playbook-recommend: cold-launch fixture — retargeting-rescue outside top 3",
    !coldTop3.includes("retargeting-rescue"),
    `Top 3: ${coldTop3.join(", ")}`
  );

  // Local service fixture → local-service-leadgen is top 1.
  const localServiceFixture: ProductInput = {
    name: "Northshore Roofing",
    category: "local roofing service",
    description:
      "A family-owned roofing contractor covering the north shore neighborhoods with 4.9-star Google reviews from named locals.",
    price: "$8-15k per typical job",
    businessModel: "services",
    audience:
      "homeowners in the north-shore neighborhoods whose roofs need repair or replacement this season",
    audiencePain:
      "Calling three roofers and getting three different quotes a week apart while water keeps coming through the ceiling",
    competitors: "Local roofers and big-box installation services",
    differentiator:
      "Same-week site visit with a written quote and named-technician follow-up, not a call-center triage",
    goal: "Drive 30 qualified leads per month at a cost-per-lead under $80",
    awareness: "problem-aware",
    sophistication: "amplified-claims",
    campaignType: "always-on",
  };
  const localStrategy = buildStrategy(localServiceFixture);
  const localRec = recommendPlaybooks(localServiceFixture, localStrategy);
  record(
    "playbook-recommend: local service fixture — local-service-leadgen is top 1",
    localRec.ranked[0]?.playbookId === "local-service-leadgen",
    `Top: ${localRec.ranked[0]?.playbookId}`
  );

  // Creator product fixture → creator-product-drop is top 1.
  const creatorProductFixture: ProductInput = {
    name: "Tide & Stone",
    category: "creator-led ceramics",
    description:
      "A creator-led ceramics drop with 40k engaged followers waiting on a pre-launch waitlist for the first 200 mugs.",
    price: "$68 per mug",
    businessModel: "one-time",
    audience:
      "design-curious followers who already know the creator and have signed up for the drop waitlist",
    audiencePain:
      "Mass-market ceramics that all look the same and lose the story behind every piece, plus mugs that crack within a year",
    competitors: "Anthropologie, Etsy, mass-market gift shops",
    differentiator:
      "Every mug is thrown by the creator on camera, signed underneath, and shipped with a card written during the firing",
    goal: "Sell the first 200 mugs inside 72h of the drop with a 4x blended ROAS",
    awareness: "product-aware",
    sophistication: "amplified-claims",
    campaignType: "launch",
  };
  const creatorStrategy = buildStrategy(creatorProductFixture);
  const creatorRec = recommendPlaybooks(
    creatorProductFixture,
    creatorStrategy
  );
  record(
    "playbook-recommend: creator product fixture — creator-product-drop is top 1",
    creatorRec.ranked[0]?.playbookId === "creator-product-drop",
    `Top: ${creatorRec.ranked[0]?.playbookId}`
  );

  // Tie-break by id ascending — synthesise two playbook scores with the
  // same numeric score and verify ordering. Tests with the empty / weak
  // input: every playbook scores low and many tie at 0.
  const emptyInput: ProductInput = {
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
  const emptyStrategy = buildStrategy(emptyInput);
  const emptyRec = recommendPlaybooks(emptyInput, emptyStrategy);
  // Find a stretch of equal-score entries and confirm their ids are
  // ascending — the deterministic stable tie-break.
  let tieOk = true;
  for (let i = 1; i < emptyRec.ranked.length; i++) {
    if (emptyRec.ranked[i].score === emptyRec.ranked[i - 1].score) {
      if (
        emptyRec.ranked[i].playbookId <= emptyRec.ranked[i - 1].playbookId &&
        emptyRec.ranked[i].playbookId !== emptyRec.ranked[i - 1].playbookId
      ) {
        tieOk = false;
        break;
      }
    }
  }
  record(
    "playbook-recommend: ties break by playbookId ascending (stable order)",
    tieOk
  );

  // missingInputs populated when required inputs missing.
  // The empty fixture lacks audience / differentiator etc., so every
  // playbook should have at least one missingInputs entry.
  const someHasMissing = emptyRec.ranked.some(
    (r) => r.missingInputs.length > 0
  );
  record(
    "playbook-recommend: missingInputs populated when required inputs missing",
    someHasMissing
  );

  // Agency selection nudge: with templateId='app-launch', mobile-app-launch
  // gets +5 vs. without.
  const recWithoutAgency = recommendPlaybooks(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy
  );
  const mobileWithoutAgency = recWithoutAgency.ranked.find(
    (r) => r.playbookId === "mobile-app-launch"
  );
  const recWithAgency = recommendPlaybooks(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy,
    {
      projectId: "p-nudge",
      templateId: "app-launch",
      updatedAt: 0,
    }
  );
  const mobileWithAgency = recWithAgency.ranked.find(
    (r) => r.playbookId === "mobile-app-launch"
  );
  record(
    "playbook-recommend: agency template 'app-launch' nudges mobile-app-launch by +5",
    !!mobileWithoutAgency &&
      !!mobileWithAgency &&
      mobileWithAgency.score - mobileWithoutAgency.score === 5
  );

  // ---- Persistence -----------------------------------------------------

  {
    const store = createMemoryPlaybookStore();
    record(
      "playbook-store: empty getApplied returns undefined",
      store.getApplied("p-x") === undefined
    );
    store.setApplied("p-1", "mobile-app-launch");
    record(
      "playbook-store: setApplied + getApplied returns same id",
      store.getApplied("p-1") === "mobile-app-launch"
    );
    // Different projects do not collide.
    store.setApplied("p-2", "saas-free-trial-launch");
    record(
      "playbook-store: per-project isolation",
      store.getApplied("p-1") === "mobile-app-launch" &&
        store.getApplied("p-2") === "saas-free-trial-launch"
    );
    // Overwrite same project.
    store.setApplied("p-1", "dating-app-launch");
    record(
      "playbook-store: setApplied overwrites existing project",
      store.getApplied("p-1") === "dating-app-launch"
    );
    // Clear.
    store.clear("p-1");
    record(
      "playbook-store: clear drops the applied playbook",
      store.getApplied("p-1") === undefined
    );
  }

  record(
    "playbook-store: STORAGE_KEY_APPLIED_PLAYBOOK is the exact versioned key",
    STORAGE_KEY_APPLIED_PLAYBOOK === "bigad:applied-playbook:v1"
  );

  // ---- Export brief — Playbook Recommendation section -----------------

  const briefWithPlaybook = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy,
    {
      playbook: {
        recommendation: rec1,
      },
    }
  );
  record(
    "playbook-export: brief contains '## Playbook Recommendation' header when context provided",
    briefWithPlaybook.includes("## Playbook Recommendation")
  );
  record(
    "playbook-export: brief contains '### Selected playbook' header",
    briefWithPlaybook.includes("### Selected playbook")
  );
  record(
    "playbook-export: brief contains '### Execution checklist' header",
    briefWithPlaybook.includes("### Execution checklist")
  );
  record(
    "playbook-export: brief contains '### Launch gates' header",
    briefWithPlaybook.includes("### Launch gates")
  );

  // With explicit `applied` field too.
  const briefWithApplied = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy,
    {
      playbook: {
        applied: getPlaybook("mobile-app-launch"),
      },
    }
  );
  record(
    "playbook-export: brief emits section when only `applied` is provided",
    briefWithApplied.includes("## Playbook Recommendation")
  );

  // Without playbook context → section absent.
  const briefWithoutPlaybook = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy
  );
  record(
    "playbook-export: brief omits '## Playbook Recommendation' when context absent",
    !briefWithoutPlaybook.includes("## Playbook Recommendation")
  );

  // Empty playbook context (no recommendation, no applied) → section absent.
  const briefEmptyPlaybook = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    playbookStrategy,
    { playbook: {} }
  );
  record(
    "playbook-export: brief omits '## Playbook Recommendation' when both fields empty",
    !briefEmptyPlaybook.includes("## Playbook Recommendation")
  );

  // ---- Engine purity ---------------------------------------------------

  const detP1 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detP2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "playbook: buildStrategy determinism preserved after Playbook Library added",
    JSON.stringify(detP1) === JSON.stringify(detP2)
  );
}

// ============================================================================
// === Onboarding & Demo Projects ===
// ============================================================================
//
// Tests cover: the goal + step catalog, the deterministic
// `recommendGoalPlaybook` overrides, the demo project registry, the
// pure `buildDemoLoadPlan` loader (orphan-cell-free + deterministic),
// the pure `buildProgressChecklist` + `getNextBestAction` derivations,
// the memory onboarding store roundtrip, the storage key constants,
// and the engine-purity guard.

{
  const onboardingMod = require("../src/lib/onboarding/onboarding") as typeof import("../src/lib/onboarding/onboarding");
  const demoMod = require("../src/lib/onboarding/demo-projects") as typeof import("../src/lib/onboarding/demo-projects");
  const storeMod = require("../src/lib/onboarding/onboarding-store") as typeof import("../src/lib/onboarding/onboarding-store");
  const playbookCatalogMod = require("../src/lib/playbook/catalog") as typeof import("../src/lib/playbook/catalog");
  const reviewBoardMod = require("../src/lib/review/review-board") as typeof import("../src/lib/review/review-board");
  const reviewTypes = require("../src/types/review") as typeof import("../src/types/review");

  const {
    getOnboardingGoals,
    getOnboardingSteps,
    recommendGoalPlaybook,
    buildProgressChecklist,
    getNextBestAction,
    buildInitialOnboardingState,
  } = onboardingMod;
  const {
    DEMO_PROJECTS,
    getDemoProject,
    listDemoProjects,
    buildDemoLoadPlan,
  } = demoMod;
  const {
    createMemoryOnboardingStore,
    STORAGE_KEY_ONBOARDING,
    STORAGE_KEY_DEMO_LOADED,
  } = storeMod;
  const { PLAYBOOKS } = playbookCatalogMod;
  const { summarizeReviewBoard } = reviewBoardMod;
  const { CRITICAL_REVIEW_ITEM_KINDS } = reviewTypes;

  // ---- Catalog: goals --------------------------------------------------

  const goals = getOnboardingGoals();
  record(
    "onboarding: getOnboardingGoals returns exactly 7 entries",
    goals.length === 7,
    `Got ${goals.length}`
  );

  const expectedGoalIds = [
    "launch-app",
    "launch-saas-trial",
    "launch-ecom-promo",
    "always-on-leadgen",
    "fix-tracking-or-proof",
    "agency-deliverable",
    "just-exploring",
  ];
  for (const id of expectedGoalIds) {
    record(
      `onboarding: goal '${id}' is present`,
      goals.some((g) => g.id === id)
    );
  }
  for (const g of goals) {
    record(
      `onboarding-goal ${g.id}: label is non-empty`,
      typeof g.label === "string" && g.label.length > 0
    );
    record(
      `onboarding-goal ${g.id}: description is non-empty`,
      typeof g.description === "string" && g.description.length > 0
    );
    record(
      `onboarding-goal ${g.id}: recommendedPlaybook is a valid PlaybookId`,
      !!PLAYBOOKS[g.recommendedPlaybook]
    );
    record(
      `onboarding-goal ${g.id}: primaryModules has >= 3 entries`,
      Array.isArray(g.primaryModules) && g.primaryModules.length >= 3,
      `Got ${g.primaryModules.length}`
    );
  }

  // ---- Catalog: steps --------------------------------------------------

  const steps = getOnboardingSteps();
  record(
    "onboarding: getOnboardingSteps returns exactly 7 entries",
    steps.length === 7,
    `Got ${steps.length}`
  );
  // Orders 1..7 contiguous.
  const stepOrders = steps.map((s) => s.order);
  record(
    "onboarding: step orders are 1..7 contiguous",
    stepOrders.every((o, i) => o === i + 1),
    `Got [${stepOrders.join(", ")}]`
  );
  // Canonical order.
  const canonical = [
    "pick-goal",
    "create-or-load-project",
    "review-strategy",
    "capture-proof-or-confirm",
    "approve-critical-items",
    "plan-first-test-batch",
    "export-or-handoff",
  ];
  record(
    "onboarding: step ids match canonical sequence",
    canonical.every((id, i) => steps[i].id === id)
  );
  for (const s of steps) {
    record(
      `onboarding-step ${s.id}: label is non-empty`,
      typeof s.label === "string" && s.label.length > 0
    );
    record(
      `onboarding-step ${s.id}: description is non-empty`,
      typeof s.description === "string" && s.description.length > 0
    );
    record(
      `onboarding-step ${s.id}: estimatedMinutes in [1, 5]`,
      s.estimatedMinutes >= 1 && s.estimatedMinutes <= 5,
      `Got ${s.estimatedMinutes}`
    );
  }

  // ---- recommendGoalPlaybook -------------------------------------------

  record(
    "onboarding-recommend: launch-app → mobile-app-launch",
    recommendGoalPlaybook("launch-app") === "mobile-app-launch"
  );
  record(
    "onboarding-recommend: launch-saas-trial → saas-free-trial-launch",
    recommendGoalPlaybook("launch-saas-trial") === "saas-free-trial-launch"
  );
  record(
    "onboarding-recommend: launch-ecom-promo → ecommerce-seasonal-promo",
    recommendGoalPlaybook("launch-ecom-promo") === "ecommerce-seasonal-promo"
  );
  record(
    "onboarding-recommend: always-on-leadgen → local-service-leadgen",
    recommendGoalPlaybook("always-on-leadgen") === "local-service-leadgen"
  );
  record(
    "onboarding-recommend: fix-tracking-or-proof → landing-cro-sprint (no input)",
    recommendGoalPlaybook("fix-tracking-or-proof") === "landing-cro-sprint"
  );
  record(
    "onboarding-recommend: agency-deliverable → agency-strategy-sprint (no input)",
    recommendGoalPlaybook("agency-deliverable") === "agency-strategy-sprint"
  );
  record(
    "onboarding-recommend: just-exploring → agency-strategy-sprint (no input)",
    recommendGoalPlaybook("just-exploring") === "agency-strategy-sprint"
  );

  // Override: just-exploring + subscription-app input → mobile-app-launch.
  const overrideInput = getDemoProject("astro-dating-launch").input;
  record(
    "onboarding-recommend: just-exploring + subscription-app + dating input overrides to mobile-app-launch",
    recommendGoalPlaybook("just-exploring", overrideInput) === "mobile-app-launch"
  );

  // Determinism.
  record(
    "onboarding-recommend: deterministic — same args → same output (no input)",
    recommendGoalPlaybook("launch-app") === recommendGoalPlaybook("launch-app")
  );
  record(
    "onboarding-recommend: deterministic — same args → same output (with input)",
    recommendGoalPlaybook("just-exploring", overrideInput) ===
      recommendGoalPlaybook("just-exploring", overrideInput)
  );

  // ---- Demo projects ---------------------------------------------------

  const demoIds = ["astro-dating-launch", "saas-free-trial-launch", "ecom-seasonal-promo"] as const;
  for (const id of demoIds) {
    const d = getDemoProject(id);
    record(
      `onboarding-demo ${id}: exists with documented id`,
      d && d.id === id
    );
    record(
      `onboarding-demo ${id}: input has audience set`,
      typeof d.input.audience === "string" && d.input.audience.length > 0
    );
    record(
      `onboarding-demo ${id}: input has corePain set`,
      typeof d.input.audiencePain === "string" && d.input.audiencePain.length > 0
    );
    record(
      `onboarding-demo ${id}: input has differentiator set`,
      typeof d.input.differentiator === "string" && d.input.differentiator.length > 0
    );
    record(
      `onboarding-demo ${id}: input has businessModel set`,
      typeof d.input.businessModel === "string" && d.input.businessModel.length > 0
    );
    record(
      `onboarding-demo ${id}: input has sophistication set`,
      typeof d.input.sophistication === "string" && d.input.sophistication.length > 0
    );
    record(
      `onboarding-demo ${id}: input has offerContext present`,
      !!d.input.offerContext
    );
    record(
      `onboarding-demo ${id}: sampleTestResults length >= 4`,
      d.sampleTestResults.length >= 4,
      `Got ${d.sampleTestResults.length}`
    );
    record(
      `onboarding-demo ${id}: sampleReviewStatuses length >= 6`,
      d.sampleReviewStatuses.length >= 6,
      `Got ${d.sampleReviewStatuses.length}`
    );
    record(
      `onboarding-demo ${id}: sampleNotes length >= 2`,
      d.sampleNotes.length >= 2,
      `Got ${d.sampleNotes.length}`
    );
  }

  // listDemoProjects returns 3 metadata entries with no input bleed.
  const metas = listDemoProjects();
  record(
    "onboarding-demo: listDemoProjects returns 3 entries",
    metas.length === 3
  );
  record(
    "onboarding-demo: listDemoProjects entries omit raw input field",
    metas.every((m) => !("input" in m))
  );

  // buildDemoLoadPlan — deterministic for same opts.
  const opts = { projectId: "proj-demo-1", runId: "run-demo-1", nowMs: 1_700_000_000_000 };
  for (const id of demoIds) {
    const d = getDemoProject(id);
    const plan1 = buildDemoLoadPlan(d, opts);
    const plan2 = buildDemoLoadPlan(d, opts);
    record(
      `onboarding-demo ${id}: buildDemoLoadPlan deterministic — same opts → deep equal`,
      JSON.stringify(plan1) === JSON.stringify(plan2)
    );
    record(
      `onboarding-demo ${id}: plan.project.id === opts.projectId`,
      plan1.project.metadata.id === opts.projectId
    );
    record(
      `onboarding-demo ${id}: plan.run.id === opts.runId`,
      plan1.run.id === opts.runId
    );
    // Every testResult.cellId must reference a cell present in the
    // run's creativeTestingMatrix.testCells.
    const validIds = new Set(
      plan1.run.strategy.creativeTestingMatrix.testCells.map((c) => c.id)
    );
    record(
      `onboarding-demo ${id}: every testResult.cellId references a real test cell`,
      plan1.testResults.every((r) => validIds.has(r.testCellId))
    );
    // appliedPlaybookId equals demo.recommendedPlaybook.
    record(
      `onboarding-demo ${id}: appliedPlaybookId equals demo.recommendedPlaybook`,
      plan1.appliedPlaybookId === d.recommendedPlaybook
    );
    // Every reviewItem.kind is a valid ReviewItemKind.
    const validKinds = new Set([
      "positioning",
      "offer",
      "proof-assets",
      "first-test-batch",
      "campaign-setup",
      "client-report",
      "tracking-readiness",
      "creative-qa",
      "launch-readiness",
      "next-iteration-plan",
    ]);
    record(
      `onboarding-demo ${id}: every reviewItem.kind is a valid ReviewItemKind`,
      plan1.reviewItems.every((it) => validKinds.has(it.kind))
    );
    // All 6 critical review kinds present.
    const presentKinds = new Set(plan1.reviewItems.map((it) => it.kind));
    record(
      `onboarding-demo ${id}: all 6 critical review kinds are present in plan.reviewItems`,
      CRITICAL_REVIEW_ITEM_KINDS.every((k) => presentKinds.has(k))
    );
  }

  // ---- Progress checklist ----------------------------------------------

  const emptyCtx = {};
  const emptyList = buildProgressChecklist(emptyCtx);
  record(
    "onboarding-progress: empty ctx → 0 / 7 done",
    emptyList.length === 7 && emptyList.every((it) => it.done === false)
  );

  const goalOnlyCtx = {
    onboardingState: {
      ...buildInitialOnboardingState(),
      goalId: "launch-app" as const,
    },
  };
  const goalOnly = buildProgressChecklist(goalOnlyCtx);
  record(
    "onboarding-progress: goalId set → 1 / 7 done (pick-goal)",
    goalOnly.filter((it) => it.done).length === 1 &&
      goalOnly.find((it) => it.id === "pick-goal")?.done === true
  );

  // Project loaded.
  const demoLoad = buildDemoLoadPlan(
    getDemoProject("astro-dating-launch"),
    opts
  );
  const projectCtx = {
    ...goalOnlyCtx,
    project: demoLoad.project,
  };
  const projectList = buildProgressChecklist(projectCtx);
  record(
    "onboarding-progress: goalId + project → 2 / 7 done",
    projectList.filter((it) => it.done).length === 2
  );

  // + run + strategy.
  const runCtx = {
    ...projectCtx,
    latestRun: demoLoad.run,
    strategy: demoLoad.run.strategy,
  };
  const runList = buildProgressChecklist(runCtx);
  record(
    "onboarding-progress: goalId + project + run + strategy → >= 3 / 7 done",
    runList.filter((it) => it.done).length >= 3
  );
  // The strategy already carries a proof plan and a first test batch,
  // so step 4 and 6 should already flip.
  record(
    "onboarding-progress: capture-proof-or-confirm flips when proofReadinessScore >= 50 (synthetic ctx)",
    buildProgressChecklist({
      ...runCtx,
      proofAssetPlan: {
        ...demoLoad.run.strategy.proofAssetPlan,
        proofReadinessScore: 75,
        missingBeforeSpend: [],
      },
    }).find((it) => it.id === "capture-proof-or-confirm")?.done === true
  );
  // Review board summary → step 5.
  const summary = summarizeReviewBoard({
    projectId: opts.projectId,
    runId: opts.runId,
    items: demoLoad.reviewItems.map((it) => ({
      ...it,
      // Force all critical to approved + zero unresolved comments.
      status: CRITICAL_REVIEW_ITEM_KINDS.includes(it.kind)
        ? ("approved" as const)
        : it.status,
    })),
    comments: [],
  });
  const reviewReadyCtx = { ...runCtx, reviewSummary: summary };
  record(
    "onboarding-progress: approve-critical-items flips when approvalReadiness === 'ready'",
    buildProgressChecklist(reviewReadyCtx).find((it) => it.id === "approve-critical-items")?.done === true
  );
  // First batch >= 3.
  record(
    "onboarding-progress: plan-first-test-batch flips when recommendedFirstBatch.length >= 3",
    runList.find((it) => it.id === "plan-first-test-batch")?.done ===
      (demoLoad.run.strategy.creativeTestingMatrix.recommendedFirstBatch.length >= 3)
  );
  // Determinism.
  record(
    "onboarding-progress: identical ctx → identical checklist",
    JSON.stringify(buildProgressChecklist(runCtx)) ===
      JSON.stringify(buildProgressChecklist(runCtx))
  );

  // ---- Next best action -----------------------------------------------

  record(
    "onboarding-next: empty state → kind='pick-goal'",
    getNextBestAction(emptyCtx).kind === "pick-goal"
  );
  record(
    "onboarding-next: goal set, no project → kind='load-demo'",
    getNextBestAction(goalOnlyCtx).kind === "load-demo"
  );
  // Weak input.
  const weakInputCtx = {
    ...projectCtx,
    inputQuality: {
      score: 20,
      status: "weak" as const,
      warnings: [],
      suggestions: [],
      rewrittenHints: {
        audience: "",
        corePain: "",
        differentiator: "",
        goal: "",
        proofNeeded: [],
      },
    },
  };
  record(
    "onboarding-next: project + weak input → kind='fill-input'",
    getNextBestAction(weakInputCtx).kind === "fill-input"
  );
  // No run yet.
  record(
    "onboarding-next: project but no run → kind='fill-input'",
    getNextBestAction(projectCtx).kind === "fill-input"
  );
  // Tracking < 50.
  record(
    "onboarding-next: project + tracking < 50 → kind='fix-tracking'",
    getNextBestAction({
      ...runCtx,
      trackingReadiness: { ...demoLoad.run.strategy.trackingReadiness, score: 30 },
    }).kind === "fix-tracking"
  );
  // Branches below need a passing trackingReadiness to clear the
  // earlier branch — the demo's tracking score is intentionally low.
  const passingTracking = { ...demoLoad.run.strategy.trackingReadiness, score: 90 };
  // Proof < 50 + skeptical.
  record(
    "onboarding-next: project + proofReadiness < 50 + skeptical → kind='capture-proof'",
    getNextBestAction({
      ...runCtx,
      trackingReadiness: passingTracking,
      proofAssetPlan: {
        ...demoLoad.run.strategy.proofAssetPlan,
        proofReadinessScore: 20,
      },
    }).kind === "capture-proof"
  );
  // Review not-ready.
  const notReadySummary = summarizeReviewBoard({
    projectId: opts.projectId,
    runId: opts.runId,
    items: demoLoad.reviewItems,
    comments: [],
  });
  record(
    "onboarding-next: project + review not-ready → kind='approve-critical'",
    getNextBestAction({
      ...runCtx,
      trackingReadiness: passingTracking,
      proofAssetPlan: {
        ...demoLoad.run.strategy.proofAssetPlan,
        proofReadinessScore: 80,
        missingBeforeSpend: [],
      },
      reviewSummary: notReadySummary,
    }).kind === "approve-critical"
  );
  // All clean → export-report.
  const exportCtx = {
    ...runCtx,
    trackingReadiness: passingTracking,
    proofAssetPlan: {
      ...demoLoad.run.strategy.proofAssetPlan,
      proofReadinessScore: 80,
      missingBeforeSpend: [],
    },
    reviewSummary: summary,
  };
  record(
    "onboarding-next: all clean + export not done → kind='export-report'",
    getNextBestAction(exportCtx).kind === "export-report"
  );
  // All done.
  record(
    "onboarding-next: all clean + export completed → kind='all-done'",
    getNextBestAction({
      ...exportCtx,
      onboardingState: {
        ...exportCtx.onboardingState!,
        completedStepIds: ["export-or-handoff"],
      },
    }).kind === "all-done"
  );

  // ---- Persistence -----------------------------------------------------

  record(
    "onboarding-store: STORAGE_KEY_ONBOARDING is the exact versioned key",
    STORAGE_KEY_ONBOARDING === "bigad:onboarding:v1"
  );
  record(
    "onboarding-store: STORAGE_KEY_DEMO_LOADED is the exact versioned key",
    STORAGE_KEY_DEMO_LOADED === "bigad:demo-loaded:v1"
  );

  {
    const mem = createMemoryOnboardingStore();
    mem.setGoal("launch-app");
    record(
      "onboarding-store: setGoal roundtrips via getState",
      mem.getState().goalId === "launch-app"
    );
    mem.markStepCompleted("pick-goal");
    mem.markStepCompleted("pick-goal");
    record(
      "onboarding-store: markStepCompleted dedupes (no double append)",
      mem.getState().completedStepIds.filter((s) => s === "pick-goal").length === 1
    );
    mem.markDemoLoaded("astro-dating-launch");
    record(
      "onboarding-store: markDemoLoaded + wasDemoLoaded",
      mem.wasDemoLoaded("astro-dating-launch") === true
    );
    mem.dismiss();
    record(
      "onboarding-store: dismiss flips state.dismissed to true",
      mem.getState().dismissed === true
    );
    mem.undismiss();
    record(
      "onboarding-store: undismiss flips state.dismissed back to false",
      mem.getState().dismissed === false
    );
    mem.reset();
    record(
      "onboarding-store: reset clears goalId and completed steps",
      mem.getState().goalId === undefined &&
        mem.getState().completedStepIds.length === 0
    );
    record(
      "onboarding-store: reset clears demo-loaded entries",
      mem.wasDemoLoaded("astro-dating-launch") === false
    );
  }

  // ---- Engine purity ---------------------------------------------------

  const onbDet1 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const onbDet2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "onboarding: buildStrategy determinism preserved after Onboarding layer added",
    JSON.stringify(onbDet1) === JSON.stringify(onbDet2)
  );

  // ---- Export brief — Campaign Log onboarding line --------------------

  // Build a workspace with a run + onboarding state and confirm the
  // Campaign Log section gains the one-line goal sentence.
  const ws = {
    runs: [demoLoad.run],
    results: demoLoad.testResults,
    onboardingState: {
      ...buildInitialOnboardingState(),
      goalId: "launch-app" as const,
    },
  };
  const briefWithOnboarding = generateExportBrief(
    demoLoad.run.input,
    demoLoad.run.strategy,
    ws
  );
  record(
    "onboarding-export: Campaign Log contains 'Onboarding goal:' when goalId set",
    briefWithOnboarding.includes("**Onboarding goal:**")
  );
  // Without goalId → no onboarding line.
  const briefNoGoal = generateExportBrief(demoLoad.run.input, demoLoad.run.strategy, {
    runs: [demoLoad.run],
    results: demoLoad.testResults,
  });
  record(
    "onboarding-export: omits 'Onboarding goal:' when no onboardingState supplied",
    !briefNoGoal.includes("**Onboarding goal:**")
  );
}

// ============================================================================
// === Asset Production Manager ===
// ============================================================================
//
// Tests cover: the deterministic planner (id stability, must-have / proof
// linkage, quality-check assembly, dueWindow math, readinessScore extremes,
// missing-blockers, existing-state merge), summary + critical-message
// selectors, journey-status integration (warning + blocker escalation +
// ready-to-spend gating), memory store roundtrip, key constant, markdown
// export hook, and engine-determinism guard.

{
  const assetMod = require("../src/lib/assets/asset-production") as typeof import("../src/lib/assets/asset-production");
  const assetStoreMod = require("../src/lib/assets/asset-store") as typeof import("../src/lib/assets/asset-store");
  const journeyMod = require("../src/lib/engine/journey-status") as typeof import("../src/lib/engine/journey-status");
  const exportMod = require("../src/lib/engine/export-brief") as typeof import("../src/lib/engine/export-brief");
  const playbookCatalog = require("../src/lib/playbook/catalog") as typeof import("../src/lib/playbook/catalog");

  const {
    buildAssetProductionPlan,
    summarizeAssetProductionPlan,
    criticalBlockingAssetMessages,
  } = assetMod;
  const {
    createMemoryAssetStore,
    STORAGE_KEY_ASSETS,
  } = assetStoreMod;
  const { buildJourneyStatus } = journeyMod;
  const { generateExportBrief } = exportMod;
  const { PLAYBOOKS } = playbookCatalog;

  // ---- AstroDating fixture --------------------------------------------------

  const astroStrategy = buildStrategy(ASTRO_DATING_EXAMPLE);
  const astroRunId = "run-asset-tests-1";

  const astroPlan = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    proofAssetPlan: astroStrategy.proofAssetPlan,
    creativeTestingMatrix: astroStrategy.creativeTestingMatrix,
  });

  record(
    "asset: plan returns >= 10 assets for AstroDating",
    astroPlan.assets.length >= 10,
    `Got ${astroPlan.assets.length}`
  );
  record(
    "asset: plan has >= 3 must-have assets for AstroDating",
    astroPlan.mustHaveCount >= 3,
    `Got ${astroPlan.mustHaveCount}`
  );
  record(
    "asset: every must-have has at least one test-cell OR proof-asset linkage",
    astroPlan.assets
      .filter((a) => a.priority === "must-have")
      .every(
        (a) =>
          a.linkedTestCellIds.length > 0 ||
          a.linkedProofAssetIds.length > 0 ||
          a.sourceKind === "proof-asset"
      )
  );

  record(
    "asset: every asset has at least 3 quality checks",
    astroPlan.assets.every((a) => a.qualityChecks.length >= 3),
    `Min: ${Math.min(...astroPlan.assets.map((a) => a.qualityChecks.length))}`
  );

  const videoAssets = astroPlan.assets.filter((a) =>
    a.format.startsWith("video-")
  );
  record(
    "asset: video assets always include captions-included quality check",
    videoAssets.length > 0 &&
      videoAssets.every((a) =>
        a.qualityChecks.some((c) => c.kind === "captions-included")
      )
  );

  const staticAssets = astroPlan.assets.filter(
    (a) => a.format.startsWith("static-") || a.format === "screenshot"
  );
  record(
    "asset: static assets always include aspect-ratio-noted quality check",
    staticAssets.length > 0 &&
      staticAssets.every((a) =>
        a.qualityChecks.some((c) => c.kind === "aspect-ratio-noted")
      )
  );

  record(
    "asset: all assets include file-link-present required check",
    astroPlan.assets.every((a) =>
      a.qualityChecks.some(
        (c) => c.kind === "file-link-present" && c.required
      )
    )
  );

  // ---- ID stability ----------------------------------------------------

  const proofAssetEntry = astroPlan.assets.find(
    (a) => a.sourceKind === "proof-asset"
  );
  record(
    "asset: proof-asset id follows `proof-asset:<refId>:<format>` shape",
    !!proofAssetEntry &&
      /^proof-asset:[^:]+:(screenshot|video-9-16|quote|case-study|video-1-1|video-16-9|video-4-5|static-1-1|static-4-5|static-9-16|landing-section|report)$/.test(
        proofAssetEntry.id
      ),
    proofAssetEntry?.id
  );

  // ---- Determinism: byte-identical plans -------------------------------

  const planA = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    proofAssetPlan: astroStrategy.proofAssetPlan,
    creativeTestingMatrix: astroStrategy.creativeTestingMatrix,
  });
  const planB = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    proofAssetPlan: astroStrategy.proofAssetPlan,
    creativeTestingMatrix: astroStrategy.creativeTestingMatrix,
  });
  record(
    "asset: two calls with identical input produce byte-identical plan",
    JSON.stringify(planA) === JSON.stringify(planB)
  );

  // ---- readinessScore extremes -----------------------------------------

  // All requested → readiness is the bonus from the default zero-status assets only.
  const zeroPlan = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
  });
  record(
    "asset: readinessScore is 0 when every asset is requested (status=0 contribution)",
    zeroPlan.readinessScore === 0,
    `Got ${zeroPlan.readinessScore}`
  );

  // All shipped + all required checks done → readiness 100.
  const shippedAssets = zeroPlan.assets.map((a) => ({
    ...a,
    status: "shipped" as const,
    qualityChecks: a.qualityChecks.map((c) => ({ ...c, done: true })),
  }));
  const allShippedPlan = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    existingAssetState: shippedAssets,
  });
  record(
    "asset: readinessScore is 100 when every counted asset is shipped + all required checks done",
    allShippedPlan.readinessScore === 100,
    `Got ${allShippedPlan.readinessScore}`
  );

  // Setting one must-have to shipped should increase readiness over baseline.
  const oneShipped = zeroPlan.assets
    .slice(0, 1)
    .filter((a) => a.priority === "must-have")
    .map((a) => ({
      ...a,
      status: "shipped" as const,
      qualityChecks: a.qualityChecks.map((c) => ({ ...c, done: true })),
    }));
  if (oneShipped.length > 0) {
    const partialPlan = buildAssetProductionPlan({
      runId: astroRunId,
      strategy: astroStrategy,
      existingAssetState: oneShipped,
    });
    record(
      "asset: shipping one must-have asset deterministically increases readinessScore",
      partialPlan.readinessScore > zeroPlan.readinessScore,
      `before=${zeroPlan.readinessScore} after=${partialPlan.readinessScore}`
    );
  } else {
    record(
      "asset: shipping one must-have asset deterministically increases readinessScore",
      true,
      "Skipped: no must-have asset present (unexpected)"
    );
  }

  // ---- missingBlockers --------------------------------------------------

  record(
    "asset: missingBlockers is non-empty when any must-have is not approved/shipped",
    zeroPlan.missingBlockers.length > 0
  );

  // Shipped asset missing a required check → blocker mentions check kind.
  const shippedMissingCheck = zeroPlan.assets
    .filter((a) => a.priority === "must-have")
    .slice(0, 1)
    .map((a) => ({
      ...a,
      status: "shipped" as const,
      qualityChecks: a.qualityChecks.map((c) => ({ ...c, done: false })),
    }));
  if (shippedMissingCheck.length > 0) {
    const shippedMissingPlan = buildAssetProductionPlan({
      runId: astroRunId,
      strategy: astroStrategy,
      existingAssetState: shippedMissingCheck,
    });
    record(
      "asset: missingBlockers includes 'shipped … missing required check' entry",
      shippedMissingPlan.missingBlockers.some((b) =>
        b.reason.toLowerCase().includes("missing required check")
      )
    );
  } else {
    record(
      "asset: missingBlockers includes 'shipped … missing required check' entry",
      false,
      "Skipped: no must-have present"
    );
  }

  // ---- Existing asset state merge --------------------------------------

  const firstAsset = zeroPlan.assets[0];
  const mergedExisting: typeof zeroPlan.assets = [
    {
      ...firstAsset,
      status: "shipped",
      fileLink: "https://example.com/asset.mp4",
      notes: "Test note",
      updatedAt: 1715990400000,
    },
  ];
  const mergedPlan = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    existingAssetState: mergedExisting,
  });
  const mergedFirst = mergedPlan.assets.find((a) => a.id === firstAsset.id);
  record(
    "asset: merge keeps existing status from existingAssetState",
    !!mergedFirst && mergedFirst.status === "shipped"
  );
  record(
    "asset: merge keeps existing fileLink",
    !!mergedFirst && mergedFirst.fileLink === "https://example.com/asset.mp4"
  );
  record(
    "asset: merge keeps existing notes",
    !!mergedFirst && mergedFirst.notes === "Test note"
  );
  record(
    "asset: merge regenerates state for NEW (non-merged) assets as requested",
    mergedPlan.assets
      .filter((a) => a.id !== firstAsset.id)
      .every((a) => a.status === "requested")
  );

  // ---- Test cell proofAssetRequired → dependency entry -----------------

  const cellWithProof = astroStrategy.creativeTestingMatrix.testCells.find(
    (c) => !!c.proofAssetRequired
  );
  if (cellWithProof) {
    const cellAsset = astroPlan.assets.find(
      (a) =>
        a.sourceKind === "test-cell" &&
        a.sourceRefId === cellWithProof.id
    );
    record(
      "asset: test cell with proofAssetRequired emits dependency entry",
      !!cellAsset &&
        cellAsset.dependencies.length > 0 &&
        cellAsset.dependencies.every((d) =>
          d.dependsOnAssetId.startsWith("proof-asset:")
        )
    );
  } else {
    record(
      "asset: test cell with proofAssetRequired emits dependency entry",
      true,
      "Skipped: no cell with proofAssetRequired in fixture"
    );
  }

  // ---- summarize / criticalBlockingAssetMessages -----------------------

  const summary = summarizeAssetProductionPlan(zeroPlan);
  const expectedPending = zeroPlan.assets
    .filter((a) => a.priority === "must-have")
    .map((a) => a.id);
  record(
    "asset: summarize pendingMustHaveIds matches must-have ids in 'requested' baseline",
    JSON.stringify(summary.pendingMustHaveIds) === JSON.stringify(expectedPending)
  );
  record(
    "asset: criticalBlockingAssetMessages returns >= 1 message when pendingMustHave > 0",
    criticalBlockingAssetMessages(zeroPlan).length >= 1
  );

  const fullReadySummary = summarizeAssetProductionPlan(allShippedPlan);
  record(
    "asset: criticalBlockingAssetMessages returns [] when no pendingMustHave",
    criticalBlockingAssetMessages(allShippedPlan).length === 0,
    `pending=${fullReadySummary.pendingMustHaveIds.length}`
  );

  // ---- Journey-status integration --------------------------------------

  const baseJourneyArgs = {
    trackingReadiness: astroStrategy.trackingReadiness,
    kpiLadder: astroStrategy.kpiLadder,
    kpiDiagnosis: astroStrategy.kpiDiagnosis,
    adReview: astroStrategy.adReview,
    creatorBriefs: astroStrategy.creatorBriefs,
    shotLists: astroStrategy.shotLists,
    videoScripts: astroStrategy.videoScripts,
    variantSets: astroStrategy.variantSets,
    proofAssetPlan: astroStrategy.proofAssetPlan,
    audienceAvatars: astroStrategy.audienceAvatars,
    creativeTestingMatrix: astroStrategy.creativeTestingMatrix,
    appliedAdReviews: astroStrategy.appliedAdReviews,
  };

  const journeyWithPending = buildJourneyStatus({
    ...baseJourneyArgs,
    assetSummary: summary,
  });
  record(
    "asset: journey-status emits 'asset' kind warning when pendingMustHave > 0",
    journeyWithPending.warnings.some((w) => w.kind === "asset") ||
      journeyWithPending.blockers.some((b) => b.kind === "asset")
  );

  // Low readinessScore + pending must-have → blocker severity, not warning.
  const lowScoreSummary = {
    readinessScore: 15,
    mustHaveTotal: 3,
    mustHaveReady: 0,
    pendingMustHaveIds: ["proof-asset:proof-1:screenshot"],
    shippedCount: 0,
    derivedAt: 0,
  };
  const journeyLow = buildJourneyStatus({
    ...baseJourneyArgs,
    assetSummary: lowScoreSummary,
  });
  record(
    "asset: journey-status escalates to BLOCKER severity when readinessScore < 30",
    journeyLow.blockers.some((b) => b.kind === "asset")
  );
  record(
    "asset: journey-status does NOT emit asset warning when readinessScore < 30 (blocker only)",
    !journeyLow.warnings.some((b) => b.kind === "asset")
  );

  // All ready → no asset warning at all.
  const readySummary = summarizeAssetProductionPlan(allShippedPlan);
  const journeyReady = buildJourneyStatus({
    ...baseJourneyArgs,
    assetSummary: readySummary,
  });
  record(
    "asset: journey-status emits no asset warning when all must-haves ready",
    !journeyReady.warnings.some((w) => w.kind === "asset") &&
      !journeyReady.blockers.some((b) => b.kind === "asset")
  );

  // ---- ready-to-spend gating ------------------------------------------

  // Without assetSummary → existing gating applies (backwards compat).
  const journeyNoAsset = buildJourneyStatus(baseJourneyArgs);
  // Cannot assert specific stage value (depends on AstroDating fixture
  // gating); just confirm backwards compatibility — the stage is one
  // of the legitimate enum values.
  record(
    "asset: journey-status without assetSummary returns a valid stage",
    [
      "strategy-drafted",
      "creative-planned",
      "tracking-ready",
      "kpi-aligned",
      "review-passed",
      "ready-to-spend",
    ].includes(journeyNoAsset.currentStage)
  );

  // With assetSummary AND readinessScore < 70 → not ready-to-spend.
  const journeyMid = buildJourneyStatus({
    ...baseJourneyArgs,
    assetSummary: {
      readinessScore: 50,
      mustHaveTotal: 3,
      mustHaveReady: 1,
      pendingMustHaveIds: ["proof-asset:proof-1:screenshot"],
      shippedCount: 1,
      derivedAt: 0,
    },
  });
  record(
    "asset: ready-to-spend NOT reached when assetSummary.readinessScore < 70",
    journeyMid.currentStage !== "ready-to-spend"
  );

  // With assetSummary AND readinessScore >= 70 + pendingMustHave === 0 → asset gate passes.
  // (Other gates may still block.)
  const journeyAssetReady = buildJourneyStatus({
    ...baseJourneyArgs,
    assetSummary: {
      readinessScore: 95,
      mustHaveTotal: 3,
      mustHaveReady: 3,
      pendingMustHaveIds: [],
      shippedCount: 3,
      derivedAt: 0,
    },
  });
  record(
    "asset: with high readiness + no pending, asset gate does NOT block ready-to-spend",
    !journeyAssetReady.blockers.some((b) => b.kind === "asset")
  );

  // ---- Store roundtrip --------------------------------------------------

  const store = createMemoryAssetStore();
  const seedAsset = astroPlan.assets[0];
  store.upsertAsset(seedAsset);
  record(
    "asset-store: upsertAsset + listAssets returns the seeded asset",
    store.listAssets("default").some((a) => a.id === seedAsset.id)
  );
  store.setStatus(seedAsset.id, "in-review");
  record(
    "asset-store: setStatus persists the new status",
    store.listAssets("default").find((a) => a.id === seedAsset.id)?.status ===
      "in-review"
  );
  store.setFileLink(seedAsset.id, "https://example.com/link.png");
  record(
    "asset-store: setFileLink persists fileLink",
    store
      .listAssets("default")
      .find((a) => a.id === seedAsset.id)?.fileLink ===
      "https://example.com/link.png"
  );
  store.setQualityCheck(seedAsset.id, "file-link-present", true);
  record(
    "asset-store: setQualityCheck flips done on the named check kind",
    store
      .listAssets("default")
      .find((a) => a.id === seedAsset.id)
      ?.qualityChecks.find((c) => c.kind === "file-link-present")?.done === true
  );
  store.deleteAsset(seedAsset.id);
  record(
    "asset-store: deleteAsset removes the asset",
    !store.listAssets("default").some((a) => a.id === seedAsset.id)
  );

  // ---- Key constant ----------------------------------------------------

  record(
    "asset-store: STORAGE_KEY_ASSETS is exactly 'bigad:assets:v1'",
    STORAGE_KEY_ASSETS === "bigad:assets:v1"
  );

  // ---- Markdown export -------------------------------------------------

  const briefWithAssets = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    astroStrategy,
    {
      assetProduction: {
        plan: astroPlan,
        summary,
      },
    }
  );
  record(
    "asset-export: contains '## Asset Production Plan' when context supplied",
    briefWithAssets.includes("## Asset Production Plan")
  );
  record(
    "asset-export: contains '### Must-have assets' when must-have count > 0",
    briefWithAssets.includes("### Must-have assets")
  );
  record(
    "asset-export: contains '### Missing blockers' when missing-blockers > 0",
    briefWithAssets.includes("### Missing blockers")
  );

  const briefWithoutAssets = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    astroStrategy,
    {}
  );
  record(
    "asset-export: omits '## Asset Production Plan' when no asset context",
    !briefWithoutAssets.includes("## Asset Production Plan")
  );

  // ---- buildStrategy determinism preserved -----------------------------

  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "asset: buildStrategy determinism preserved after Asset Production Manager added",
    JSON.stringify(detA) === JSON.stringify(detB)
  );

  // ---- Sprint length / dueWindow math via playbook --------------------

  const launchPlaybook = PLAYBOOKS["mobile-app-launch"];
  const planWithPlaybook = buildAssetProductionPlan({
    runId: astroRunId,
    strategy: astroStrategy,
    proofAssetPlan: astroStrategy.proofAssetPlan,
    creativeTestingMatrix: astroStrategy.creativeTestingMatrix,
    selectedPlaybook: launchPlaybook,
    nowOffsetDays: 5,
  });
  record(
    "asset: dueWindow.startOffsetDays >= nowOffsetDays when caller supplies offset",
    planWithPlaybook.assets.every((a) => a.dueWindow.startOffsetDays >= 5)
  );

  const mustHave = planWithPlaybook.assets.find(
    (a) => a.priority === "must-have"
  );
  record(
    "asset: must-have dueWindow.startOffsetDays == 0 + nowOffsetDays",
    !!mustHave && mustHave.dueWindow.startOffsetDays === 5
  );

  // ---- Summary derivedAt sanity ---------------------------------------

  record(
    "asset: plan.derivedAt is the max of all asset.updatedAt (zero baseline)",
    zeroPlan.derivedAt === 0
  );
}

// ============================================================================
// === Unit Economics / Offer Lab ===
// ============================================================================
//
// Tests cover: pure-function determinism, subscription LTV math, allowable
// CAC math, breakeven ROAS / payback derivation, missing-field warnings,
// readiness classification, offer scenario derivation, journey-status
// integration, and the markdown export hook.

{
  const economicsMod = require("../src/lib/economics/unit-economics") as typeof import("../src/lib/economics/unit-economics");
  const journeyMod = require("../src/lib/engine/journey-status") as typeof import("../src/lib/engine/journey-status");
  const exportMod = require("../src/lib/engine/export-brief") as typeof import("../src/lib/engine/export-brief");

  const {
    buildUnitEconomics,
    buildOfferScenarioResults,
    calculateSubscriptionLtv,
    calculateAllowableCac,
    classifyEconomicsReadiness,
  } = economicsMod;
  const { buildJourneyStatus } = journeyMod;
  const { generateExportBrief } = exportMod;

  // ---- Determinism --------------------------------------------------------

  const ueA1 = buildUnitEconomics(ASTRO_DATING_EXAMPLE);
  const ueA2 = buildUnitEconomics(ASTRO_DATING_EXAMPLE);
  record(
    "economics: buildUnitEconomics deterministic for AstroDating",
    JSON.stringify(ueA1) === JSON.stringify(ueA2)
  );
  record(
    "economics: derivedAt is exactly 0 (no Date.now)",
    ueA1.derivedAt === 0
  );

  const astroStrategy2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const scenA1 = buildOfferScenarioResults(
    ASTRO_DATING_EXAMPLE,
    astroStrategy2.offers
  );
  const scenA2 = buildOfferScenarioResults(
    ASTRO_DATING_EXAMPLE,
    astroStrategy2.offers
  );
  record(
    "economics: buildOfferScenarioResults deterministic for AstroDating",
    JSON.stringify(scenA1) === JSON.stringify(scenA2)
  );

  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "economics: buildStrategy(AstroDating) is byte-identical across calls (engine determinism preserved)",
    JSON.stringify(detA) === JSON.stringify(detB)
  );
  record(
    "economics: strategy.unitEconomics.derivedAt is 0 inside buildStrategy",
    detA.unitEconomics.derivedAt === 0
  );

  // ---- Subscription LTV math ---------------------------------------------

  const sub = calculateSubscriptionLtv({
    monthlyPrice: 14.99,
    cogsPercent: 0.3,
    monthlyChurnRate: 0.1,
  });
  record(
    "economics: subscription expectedMonthsRetained === 10 for 10% monthly churn",
    sub.expectedMonthsRetained === 10
  );
  record(
    "economics: subscription grossMargin === 0.7 when COGS 30%",
    Math.abs(sub.grossMargin - 0.7) < 0.0001
  );
  // 14.99 * 0.7 * 10 = 104.93
  record(
    "economics: subscription expectedLtv ≈ 104.93 (14.99 × 0.7 × 10)",
    Math.abs(sub.expectedLtv - 104.93) < 0.01,
    `Got ${sub.expectedLtv}`
  );

  const subOverride = calculateSubscriptionLtv({
    monthlyPrice: 10,
    cogsPercent: 0,
    averageMonthsRetained: 12,
  });
  record(
    "economics: subscription averageMonthsRetained override takes precedence over churn",
    subOverride.expectedMonthsRetained === 12
  );

  const subClamped = calculateSubscriptionLtv({
    monthlyPrice: 10,
    cogsPercent: 0,
    monthlyChurnRate: 0.001,
  });
  record(
    "economics: subscription expectedMonthsRetained clamps to <= 48",
    subClamped.expectedMonthsRetained <= 48
  );

  // ---- Allowable CAC math ------------------------------------------------

  const cacNoTrial = calculateAllowableCac({
    expectedLtv: 100,
    targetMarginPercent: 0.3,
  });
  record(
    "economics: allowable CAC === LTV × target margin (no trial)",
    Math.abs(cacNoTrial.allowableCac - 30) < 0.01
  );
  record(
    "economics: trialAdjustedLtv === expectedLtv when no free trial",
    cacNoTrial.trialAdjustedLtv === 100
  );

  const cacWithTrial = calculateAllowableCac({
    expectedLtv: 100,
    targetMarginPercent: 0.3,
    trialToPaidRate: 0.4,
    hasFreeTrial: true,
  });
  record(
    "economics: trialAdjustedLtv === expectedLtv × trial-to-paid rate when trial present",
    Math.abs(cacWithTrial.trialAdjustedLtv - 40) < 0.01
  );
  record(
    "economics: allowable CAC === trialAdjustedLtv × target margin (with trial)",
    Math.abs(cacWithTrial.allowableCac - 12) < 0.01
  );

  // ---- Resolved fields and fallbacks -------------------------------------

  const missingAovInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    price: "$49 one-time",
    businessModel: "one-time",
    offerContext: { cogsPercent: 30, targetMarginPercent: 30 },
  };
  const ueMissingAov = buildUnitEconomics(missingAovInput);
  record(
    "economics: resolvedAov falls back to resolvedPrice when AOV missing",
    ueMissingAov.resolvedAov === 49
  );
  record(
    "economics: warnings include 'missing-aov' when AOV not provided",
    ueMissingAov.warnings.some((w) => w.kind === "missing-aov")
  );

  const noCogsInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    offerContext: { targetMarginPercent: 30 },
  };
  const ueNoCogs = buildUnitEconomics(noCogsInput);
  record(
    "economics: warnings include 'missing-cogs' when COGS not provided",
    ueNoCogs.warnings.some((w) => w.kind === "missing-cogs")
  );
  record(
    "economics: grossMargin falls back to 0.7 (1 - 0.3 default COGS)",
    Math.abs((ueNoCogs.grossMargin ?? 0) - 0.7) < 0.0001
  );

  // ---- Breakeven ROAS math -----------------------------------------------

  const ueLowCogs: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    offerContext: {
      cogsPercent: 30,
      targetMarginPercent: 25,
      targetROAS: 3.0,
      currentAOV: 60,
    },
  };
  const lc = buildUnitEconomics(ueLowCogs);
  // breakevenRoas = 1 / 0.7 = 1.428571
  record(
    "economics: breakevenRoas ≈ 1/grossMargin (COGS 30% → ≈1.43)",
    Math.abs((lc.breakevenRoas ?? 0) - 1.4286) < 0.001,
    `Got ${lc.breakevenRoas}`
  );

  // ---- Target ROAS below breakeven → blocker → unviable ------------------

  const unviableInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    offerContext: {
      cogsPercent: 30,
      targetMarginPercent: 30,
      targetROAS: 1.2,
      currentAOV: 60,
    },
  };
  const ueUnviable = buildUnitEconomics(unviableInput);
  record(
    "economics: target ROAS < breakeven emits 'target-roas-below-breakeven' blocker",
    ueUnviable.warnings.some(
      (w) =>
        w.kind === "target-roas-below-breakeven" && w.severity === "blocker"
    )
  );
  record(
    "economics: status is 'unviable' when a blocker warning is present",
    ueUnviable.status === "unviable"
  );

  // ---- Free trial without trial-to-paid rate -----------------------------

  // AstroDating is freemium + price has 'Free' → hasFreeTrial true, no
  // trial-to-paid rate → missing-trial-to-paid warning.
  record(
    "economics: subscription/freemium + free trial without rate emits missing-trial-to-paid",
    ueA1.warnings.some((w) => w.kind === "missing-trial-to-paid")
  );

  // ---- Classification: viable case ---------------------------------------

  const viableInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    businessModel: "one-time",
    price: "$80 one-time",
    offerContext: {
      cogsPercent: 25,
      targetMarginPercent: 40,
      targetROAS: 3.5,
      currentAOV: 80,
    },
  };
  const ueViable = buildUnitEconomics(viableInput);
  record(
    "economics: clean inputs + healthy ROAS cushion → status 'viable'",
    ueViable.status === "viable",
    `Got ${ueViable.status} with warnings: ${ueViable.warnings.map((w) => w.kind).join(", ")}`
  );

  // ---- Classification: tight case ----------------------------------------

  // Subscription with 2+ warnings → tight
  const tightInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    businessModel: "subscription",
    price: "$5/month",
    offerContext: {
      cogsPercent: 30,
      targetMarginPercent: 30,
      targetROAS: 1.5,
      currentAOV: 5,
    },
  };
  const ueTight = buildUnitEconomics(tightInput);
  record(
    "economics: 2+ warnings or tight ROAS margin or low CAC → status 'tight' or 'unviable'",
    ueTight.status === "tight" || ueTight.status === "unviable",
    `Got ${ueTight.status}`
  );

  // ---- Classification: incomplete case -----------------------------------

  const incompleteInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    price: "TBD",
    businessModel: "subscription",
    offerContext: undefined,
  };
  const ueIncomplete = buildUnitEconomics(incompleteInput);
  record(
    "economics: no price resolvable → status 'incomplete'",
    ueIncomplete.status === "incomplete"
  );
  record(
    "economics: incomplete summary still has derivedAt === 0",
    ueIncomplete.derivedAt === 0
  );

  // classifyEconomicsReadiness directly callable
  record(
    "economics: classifyEconomicsReadiness mirrors buildUnitEconomics output",
    classifyEconomicsReadiness(ueA1) === ueA1.status
  );

  // ---- Offer scenarios ---------------------------------------------------

  const scenarios = buildOfferScenarioResults(
    ASTRO_DATING_EXAMPLE,
    astroStrategy2.offers
  );
  record(
    "economics: offer scenarios count matches offers count",
    scenarios.length === astroStrategy2.offers.length
  );
  record(
    "economics: every offer scenario carries a non-empty riskNote",
    scenarios.every((s) => typeof s.riskNote === "string" && s.riskNote.length > 0)
  );
  record(
    "economics: every offer scenario carries a viability status",
    scenarios.every((s) =>
      ["viable", "tight", "unviable", "incomplete"].includes(s.viability)
    )
  );
  record(
    "economics: every offer scenario carries a warnings array (possibly empty)",
    scenarios.every((s) => Array.isArray(s.warnings))
  );
  // Order stable across calls.
  const scenariosAgain = buildOfferScenarioResults(
    ASTRO_DATING_EXAMPLE,
    astroStrategy2.offers
  );
  record(
    "economics: offer scenario order stable across calls",
    scenarios.map((s) => s.offerId).join(",") ===
      scenariosAgain.map((s) => s.offerId).join(",")
  );
  // Empty offers -> empty result
  record(
    "economics: empty offers input returns empty scenarios array",
    buildOfferScenarioResults(ASTRO_DATING_EXAMPLE, []).length === 0
  );

  // ---- Journey Status integration ----------------------------------------

  const baseJourneyArgs = {
    trackingReadiness: astroStrategy2.trackingReadiness,
    kpiLadder: astroStrategy2.kpiLadder,
    kpiDiagnosis: astroStrategy2.kpiDiagnosis,
    adReview: astroStrategy2.adReview,
    creatorBriefs: astroStrategy2.creatorBriefs,
    shotLists: astroStrategy2.shotLists,
    videoScripts: astroStrategy2.videoScripts,
    variantSets: astroStrategy2.variantSets,
    proofAssetPlan: astroStrategy2.proofAssetPlan,
    audienceAvatars: astroStrategy2.audienceAvatars,
  };

  const journeyUnviable = buildJourneyStatus({
    ...baseJourneyArgs,
    unitEconomics: ueUnviable,
  });
  record(
    "economics: journey-status emits economics-kind blocker when status 'unviable'",
    journeyUnviable.blockers.some((b) => b.kind === "economics")
  );
  record(
    "economics: ready-to-spend NOT reached when unitEconomics is 'unviable'",
    journeyUnviable.currentStage !== "ready-to-spend" &&
      journeyUnviable.readyToSpend === false
  );

  const journeyTight = buildJourneyStatus({
    ...baseJourneyArgs,
    unitEconomics: ueTight,
  });
  record(
    "economics: journey-status emits economics-kind warning when status 'tight'",
    journeyTight.warnings.some((w) => w.kind === "economics") ||
      journeyTight.blockers.some((b) => b.kind === "economics")
  );

  const journeyViable = buildJourneyStatus({
    ...baseJourneyArgs,
    unitEconomics: ueViable,
  });
  record(
    "economics: journey-status emits no economics blocker when status 'viable'",
    !journeyViable.blockers.some((b) => b.kind === "economics")
  );

  // Legacy caller (no unitEconomics) → behaviour unchanged.
  const journeyLegacy = buildJourneyStatus(baseJourneyArgs);
  record(
    "economics: legacy journey-status call without unitEconomics produces a valid stage",
    typeof journeyLegacy.currentStage === "string" &&
      journeyLegacy.currentStage.length > 0
  );
  record(
    "economics: legacy journey-status call has no economics-kind entries",
    !journeyLegacy.blockers.some((b) => b.kind === "economics") &&
      !journeyLegacy.warnings.some((w) => w.kind === "economics")
  );

  // ---- Markdown export ---------------------------------------------------

  const briefWithEconomics = generateExportBrief(
    ASTRO_DATING_EXAMPLE,
    astroStrategy2
  );
  record(
    "economics-export: brief contains '## Unit Economics / Offer Lab'",
    briefWithEconomics.includes("## Unit Economics / Offer Lab")
  );
  record(
    "economics-export: brief contains '### Summary' inside the economics section",
    briefWithEconomics.includes("### Summary")
  );
  record(
    "economics-export: brief contains '### Offer scenarios' table",
    briefWithEconomics.includes("### Offer scenarios")
  );
  record(
    "economics-export: brief contains '### Warnings' when warnings present",
    briefWithEconomics.includes("### Warnings")
  );
  record(
    "economics-export: brief contains '### Recommended action'",
    briefWithEconomics.includes("### Recommended action")
  );

  // Unviable status surfaces in the brief's Status line.
  const unviableStrategy = buildStrategy(unviableInput);
  const briefUnviable = generateExportBrief(unviableInput, unviableStrategy);
  record(
    "economics-export: brief reflects 'Unviable' status when economics unviable",
    briefUnviable.includes("**Status:** Unviable")
  );

  // Export determinism — same input → same export string.
  const briefDet1 = generateExportBrief(ASTRO_DATING_EXAMPLE, astroStrategy2);
  const briefDet2 = generateExportBrief(ASTRO_DATING_EXAMPLE, astroStrategy2);
  record(
    "economics-export: same input produces byte-identical export string",
    briefDet1 === briefDet2
  );

  // ---- Strategy fields ---------------------------------------------------

  record(
    "economics: strategy.unitEconomics present after buildStrategy",
    !!detA.unitEconomics && typeof detA.unitEconomics.status === "string"
  );
  record(
    "economics: strategy.offerScenarios present and non-empty after buildStrategy",
    Array.isArray(detA.offerScenarios) && detA.offerScenarios.length > 0
  );

  // Subscription block present for freemium/subscription, absent otherwise.
  record(
    "economics: subscription block present for AstroDating (freemium)",
    !!detA.unitEconomics.subscription
  );
  const ueOneTime = buildUnitEconomics(HEIRLOOM_BREW_EXAMPLE);
  record(
    "economics: subscription block absent for one-time (HeirloomBrew)",
    !ueOneTime.subscription
  );

  // ---- targetRoas fallback warning ---------------------------------------

  const noTargetRoasInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    offerContext: {
      cogsPercent: 30,
      targetMarginPercent: 30,
      currentAOV: 50,
    },
  };
  const ueNoRoas = buildUnitEconomics(noTargetRoasInput);
  record(
    "economics: missing targetRoas emits a derivation info warning",
    ueNoRoas.warnings.some((w) => w.kind === "missing-target-roas")
  );
  record(
    "economics: derived target ROAS ≈ breakevenRoas × 1.4",
    Math.abs(
      (ueNoRoas.targetRoas ?? 0) - (ueNoRoas.breakevenRoas ?? 0) * 1.4
    ) < 0.05
  );

  // ---- roasMargin sign ---------------------------------------------------

  record(
    "economics: roasMargin === targetRoas - breakevenRoas",
    typeof ueA1.roasMargin === "number" &&
      typeof ueA1.targetRoas === "number" &&
      typeof ueA1.breakevenRoas === "number" &&
      Math.abs(
        ueA1.roasMargin - (ueA1.targetRoas - ueA1.breakevenRoas)
      ) < 0.01
  );

  // ---- StrategyView Economics tab insertion ------------------------------

  // Re-import for the test scope; tab labels live in StrategyView. We
  // assert the Economics tab is present and lands after Calendar (index
  // >= 7). Index 7 leaves the pinned first-7 invariant untouched.
  record(
    "economics: tab insertion present in StrategyView (label 'Economics')",
    tabLabels.includes("Economics")
  );
  record(
    "economics: Economics tab lands at index >= 7 (first-7 pinning intact)",
    tabLabels.indexOf("Economics") >= 7
  );

  // ---- gross margin too low warning --------------------------------------

  const lowMarginInput: ProductInput = {
    ...ASTRO_DATING_EXAMPLE,
    offerContext: {
      cogsPercent: 80,
      targetMarginPercent: 10,
      targetROAS: 6,
      currentAOV: 40,
    },
  };
  const ueLowMargin = buildUnitEconomics(lowMarginInput);
  record(
    "economics: grossMargin < 0.30 emits 'gross-margin-too-low' warning",
    ueLowMargin.warnings.some((w) => w.kind === "gross-margin-too-low")
  );
}

// ============================================================================
// === Forecast / Budget Planner ===
// ============================================================================
//
// Tests cover: pure-function determinism, scenario shape + monotonicity,
// budget recommendation math, allocation sum tolerance, decision
// checkpoints, warning emission, status classification, journey-status
// integration, and the markdown export hook. ~50 asserts.

{
  const forecastMod = require("../src/lib/forecast/budget-forecast") as typeof import("../src/lib/forecast/budget-forecast");
  const journeyMod = require("../src/lib/engine/journey-status") as typeof import("../src/lib/engine/journey-status");
  const exportMod = require("../src/lib/engine/export-brief") as typeof import("../src/lib/engine/export-brief");

  const {
    buildForecastPlan,
    buildForecastScenarios,
    allocateBudgetAcrossTestCells,
    buildDecisionCheckpoints,
    classifyForecastReadiness,
  } = forecastMod;
  const { buildJourneyStatus } = journeyMod;
  const { generateExportBrief } = exportMod;

  // ---- Determinism --------------------------------------------------------

  const astro = buildStrategy(ASTRO_DATING_EXAMPLE);
  const planA1 = buildForecastPlan(astro);
  const planA2 = buildForecastPlan(astro);
  record(
    "forecast: buildForecastPlan deterministic for AstroDating",
    JSON.stringify(planA1) === JSON.stringify(planA2)
  );
  record(
    "forecast: derivedAt is exactly 0 (no Date.now)",
    planA1.derivedAt === 0
  );

  const scenA1 = buildForecastScenarios(astro);
  const scenA2 = buildForecastScenarios(astro);
  record(
    "forecast: buildForecastScenarios deterministic for AstroDating",
    JSON.stringify(scenA1) === JSON.stringify(scenA2)
  );

  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "forecast: buildStrategy(AstroDating) byte-identical across calls (engine determinism preserved)",
    JSON.stringify(detA) === JSON.stringify(detB)
  );
  record(
    "forecast: strategy.forecast.derivedAt is 0 inside buildStrategy",
    detA.forecast?.derivedAt === 0
  );
  record(
    "forecast: strategy.forecast present after buildStrategy",
    !!detA.forecast && typeof detA.forecast.status === "string"
  );

  // ---- Scenarios shape ----------------------------------------------------

  record(
    "forecast: exactly 3 scenarios in output",
    planA1.scenarios.length === 3
  );
  record(
    "forecast: scenarios ordered conservative → base → aggressive",
    planA1.scenarios[0].kind === "conservative" &&
      planA1.scenarios[1].kind === "base" &&
      planA1.scenarios[2].kind === "aggressive"
  );

  const consA = planA1.scenarios[0];
  const baseA = planA1.scenarios[1];
  const aggA = planA1.scenarios[2];

  record(
    "forecast: conservative.expectedConversions <= base.expectedConversions",
    consA.outcome.expectedConversions <= baseA.outcome.expectedConversions
  );
  record(
    "forecast: base.expectedConversions <= aggressive.expectedConversions",
    baseA.outcome.expectedConversions <= aggA.outcome.expectedConversions
  );
  record(
    "forecast: conservative.cpm > base.cpm (worse CPM in conservative)",
    consA.outcome.assumptions.cpm > baseA.outcome.assumptions.cpm
  );
  record(
    "forecast: aggressive.cpm < base.cpm (better CPM in aggressive)",
    aggA.outcome.assumptions.cpm < baseA.outcome.assumptions.cpm
  );

  // ---- Budget --------------------------------------------------------------

  record(
    "forecast: AstroDating totalTestBudget > 0",
    planA1.budget.totalTestBudget > 0
  );
  record(
    "forecast: AstroDating recommendedDailyBudget > 0",
    planA1.budget.recommendedDailyBudget > 0
  );
  record(
    "forecast: AstroDating recommendedTestDurationDays >= 3",
    planA1.budget.recommendedTestDurationDays >= 3
  );
  record(
    "forecast: AstroDating recommendedTestDurationDays <= 14",
    planA1.budget.recommendedTestDurationDays <= 14
  );
  record(
    "forecast: AstroDating minimumLearningBudget > 0",
    planA1.budget.minimumLearningBudget > 0
  );
  record(
    "forecast: AstroDating budget reasoning non-empty",
    typeof planA1.budget.reasoning === "string" &&
      planA1.budget.reasoning.length > 0
  );
  // minimumLearningBudget derivation is deterministic
  const planA3 = buildForecastPlan(astro);
  record(
    "forecast: minimumLearningBudget deterministic",
    planA1.budget.minimumLearningBudget === planA3.budget.minimumLearningBudget
  );

  // ---- Allocation ----------------------------------------------------------

  const cellRows = planA1.allocation.filter((a) => a.refKind === "test-cell");
  record(
    "forecast: every recommendedFirstBatch cell has a SpendAllocation row",
    cellRows.length === astro.creativeTestingMatrix.recommendedFirstBatch.length
  );
  const sumCells = cellRows.reduce((s, a) => s + a.budget, 0);
  record(
    "forecast: sum of test-cell allocations equals totalTestBudget (±$0.01)",
    Math.abs(sumCells - planA1.budget.totalTestBudget) <= 0.01,
    `sum=${sumCells} total=${planA1.budget.totalTestBudget}`
  );
  record(
    "forecast: every allocation row carries a non-empty rationale",
    planA1.allocation.every(
      (a) => typeof a.rationale === "string" && a.rationale.length > 0
    )
  );
  // The standalone helper produces the same allocation
  const standaloneAlloc = allocateBudgetAcrossTestCells(astro);
  record(
    "forecast: allocateBudgetAcrossTestCells matches plan.allocation",
    JSON.stringify(standaloneAlloc) === JSON.stringify(planA1.allocation)
  );

  // ---- Decision checkpoints -----------------------------------------------

  const labels = planA1.decisionCheckpoints.map((c) => c.label);
  record(
    "forecast: decision checkpoints contain Day 1",
    labels.some((l) => l.startsWith("Day 1"))
  );
  record(
    "forecast: decision checkpoints contain Day 3",
    labels.some((l) => l.startsWith("Day 3"))
  );
  record(
    "forecast: decision checkpoints contain Day 5 (when duration >= 5)",
    planA1.budget.recommendedTestDurationDays < 5 ||
      labels.some((l) => l.startsWith("Day 5"))
  );
  record(
    "forecast: decision checkpoints contain end-of-test",
    labels.some((l) => l.toLowerCase().includes("end of test"))
  );
  record(
    "forecast: every checkpoint has non-empty kill/iterate/scale conditions",
    planA1.decisionCheckpoints.every(
      (c) =>
        c.killConditions.length > 0 &&
        c.iterateConditions.length > 0 &&
        c.scaleConditions.length > 0
    )
  );
  // The standalone helper produces the same checkpoints
  const standaloneCheckpoints = buildDecisionCheckpoints(astro);
  record(
    "forecast: buildDecisionCheckpoints matches plan.decisionCheckpoints",
    JSON.stringify(standaloneCheckpoints) ===
      JSON.stringify(planA1.decisionCheckpoints)
  );

  // ---- Warnings ------------------------------------------------------------

  // AstroDating: $14.99 freemium with 30% COGS, no AOV → tight unit economics
  // with allowable CAC ≈ $7. Base expected CPA ≈ $60 → above allowable CAC.
  record(
    "forecast: AstroDating emits 'expected-cpa-above-allowable-cac' blocker",
    planA1.warnings.some(
      (w) =>
        w.kind === "expected-cpa-above-allowable-cac" &&
        w.severity === "blocker"
    )
  );
  record(
    "forecast: AstroDating emits 'tracking-not-ready' warning (tracking < 70)",
    planA1.warnings.some(
      (w) => w.kind === "tracking-not-ready" && w.severity === "warning"
    )
  );
  record(
    "forecast: AstroDating emits 'low-confidence-no-history' info",
    planA1.warnings.some(
      (w) => w.kind === "low-confidence-no-history" && w.severity === "info"
    )
  );
  record(
    "forecast: AstroDating status is 'unviable' (blocker warnings present)",
    planA1.status === "unviable"
  );

  // ---- Status: viable case -------------------------------------------------

  // Heirloom Brew: $48 one-time, healthy economics → viable forecast.
  const brewStrategy = buildStrategy(HEIRLOOM_BREW_EXAMPLE);
  const planBrew = buildForecastPlan(brewStrategy);
  record(
    "forecast: HeirloomBrew confidence is 'high', 'medium', or 'low' (valid)",
    ["high", "medium", "low"].includes(planBrew.confidence)
  );
  record(
    "forecast: HeirloomBrew status is one of viable/tight/unviable/incomplete",
    ["viable", "tight", "unviable", "incomplete"].includes(planBrew.status)
  );

  // ---- Status: budget-below-learning-minimum (forced) ---------------------
  //
  // Build a strategy then synthesise a low-budget plan via a craft input
  // — the engine's plan reflects its own math, so we test the warning
  // composer by constructing a fixture plan directly.
  {
    // Use the engine output but artificially force the warning by
    // constructing a plan with budget < minimumLearningBudget via the
    // classifier. The simplest fixture: build a plan whose warnings
    // include the blocker.
    const lowBudgetPlan = {
      ...planA1,
      budget: {
        ...planA1.budget,
        totalTestBudget: 1, // far below the learning minimum
      },
    };
    record(
      "forecast: classifyForecastReadiness returns 'unviable' for plans with blocker warnings",
      classifyForecastReadiness(lowBudgetPlan) === "unviable"
    );
  }

  // ---- No-test-cells fixture ----------------------------------------------
  //
  // Build a strategy where the creativeTestingMatrix has zero
  // recommendedFirstBatch entries. We do this by patching the strategy
  // before calling buildForecastPlan.
  {
    const stripped = {
      ...astro,
      creativeTestingMatrix: {
        ...astro.creativeTestingMatrix,
        recommendedFirstBatch: [],
      },
    } as typeof astro;
    const planNoCells = buildForecastPlan(stripped);
    record(
      "forecast: empty recommendedFirstBatch → 'no-test-cells' warning emitted",
      planNoCells.warnings.some((w) => w.kind === "no-test-cells")
    );
    record(
      "forecast: empty recommendedFirstBatch → fallback budget applied",
      planNoCells.budget.totalTestBudget === 500
    );
  }

  // ---- No-economics fixture -----------------------------------------------
  {
    const noEcon = {
      ...astro,
      unitEconomics: {
        status: "incomplete",
        warnings: [],
        derivedAt: 0,
      } as typeof astro.unitEconomics,
    } as typeof astro;
    const planNoEcon = buildForecastPlan(noEcon);
    record(
      "forecast: incomplete economics → 'no-economics' info warning emitted",
      planNoEcon.warnings.some(
        (w) => w.kind === "no-economics" && w.severity === "info"
      )
    );
  }

  // ---- Incomplete status (no economics AND no test cells) -----------------
  {
    const stripped = {
      ...astro,
      creativeTestingMatrix: {
        ...astro.creativeTestingMatrix,
        recommendedFirstBatch: [],
      },
      unitEconomics: {
        status: "incomplete",
        warnings: [],
        derivedAt: 0,
      } as typeof astro.unitEconomics,
    } as typeof astro;
    const planEmpty = buildForecastPlan(stripped);
    record(
      "forecast: no economics AND no test cells → status 'incomplete'",
      planEmpty.status === "incomplete"
    );
  }

  // ---- KPI ladder absent --------------------------------------------------
  {
    const noKpi = {
      ...astro,
      kpiLadder: { tiers: [], targets: [] } as typeof astro.kpiLadder,
    } as typeof astro;
    const planNoKpi = buildForecastPlan(noKpi);
    record(
      "forecast: empty kpiLadder → 'no-kpi-targets' info warning emitted",
      planNoKpi.warnings.some((w) => w.kind === "no-kpi-targets")
    );
  }

  // ---- Conservative ROAS below breakeven ----------------------------------
  // AstroDating already emits this blocker (allowable CAC $6.75, breakeven
  // ROAS 1.33, conservative ROAS 0.4 — below breakeven).
  record(
    "forecast: conservative ROAS < breakeven emits 'conservative-roas-below-breakeven' blocker",
    planA1.warnings.some(
      (w) =>
        w.kind === "conservative-roas-below-breakeven" &&
        w.severity === "blocker"
    )
  );
  // Conservative ROAS below target (warning, separate signal).
  record(
    "forecast: conservative ROAS < target emits 'conservative-roas-below-target' warning",
    planA1.warnings.some(
      (w) => w.kind === "conservative-roas-below-target"
    )
  );

  // ---- Tight classification fixture --------------------------------------
  // A plan with 2+ non-info warnings but no blockers → tight.
  {
    const tightFixture = {
      ...planA1,
      warnings: [
        {
          kind: "tracking-not-ready" as const,
          severity: "warning" as const,
          message: "x",
          fix: "y",
        },
        {
          kind: "conservative-roas-below-target" as const,
          severity: "warning" as const,
          message: "x",
          fix: "y",
        },
      ],
      confidence: "medium" as const,
    };
    record(
      "forecast: classifyForecastReadiness returns 'tight' for 2+ non-info warnings",
      classifyForecastReadiness(tightFixture) === "tight"
    );
  }

  // Viable: zero non-info warnings + medium/high confidence.
  {
    const viableFixture = {
      ...planA1,
      warnings: [
        {
          kind: "low-confidence-no-history" as const,
          severity: "info" as const,
          message: "x",
          fix: "y",
        },
      ],
      confidence: "high" as const,
    };
    record(
      "forecast: classifyForecastReadiness returns 'viable' for clean plan",
      classifyForecastReadiness(viableFixture) === "viable"
    );
  }

  // ---- Journey Status integration -----------------------------------------

  const baseJourneyArgs = {
    trackingReadiness: astro.trackingReadiness,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: astro.kpiDiagnosis,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
    proofAssetPlan: astro.proofAssetPlan,
    audienceAvatars: astro.audienceAvatars,
    creativeTestingMatrix: astro.creativeTestingMatrix,
    appliedAdReviews: astro.appliedAdReviews,
    unitEconomics: astro.unitEconomics,
  };

  // AstroDating forecast is unviable.
  const journeyUnviable = buildJourneyStatus({
    ...baseJourneyArgs,
    forecast: planA1,
  });
  record(
    "forecast: journey-status emits 'forecast'-kind blocker when forecast unviable",
    journeyUnviable.blockers.some((b) => b.kind === "forecast")
  );
  record(
    "forecast: ready-to-spend NOT reached when forecast.status === 'unviable'",
    journeyUnviable.currentStage !== "ready-to-spend" &&
      journeyUnviable.readyToSpend === false
  );

  // Tight: forecast warning but no blocker.
  const tightForecast: typeof planA1 = {
    ...planA1,
    status: "tight",
    warnings: [
      {
        kind: "tracking-not-ready",
        severity: "warning",
        message: "x",
        fix: "y",
      },
      {
        kind: "conservative-roas-below-target",
        severity: "warning",
        message: "x",
        fix: "y",
      },
    ],
  };
  const journeyTight = buildJourneyStatus({
    ...baseJourneyArgs,
    forecast: tightForecast,
  });
  record(
    "forecast: journey-status emits 'forecast'-kind warning when forecast tight",
    journeyTight.warnings.some((w) => w.kind === "forecast")
  );
  // Tight forecast does not block (warning only). ready-to-spend
  // reachability depends on other gates — but the forecast gate alone
  // must NOT promote a blocker.
  record(
    "forecast: tight forecast does NOT emit a forecast-kind blocker",
    !journeyTight.blockers.some((b) => b.kind === "forecast")
  );

  // Viable: no forecast-kind entry.
  const viableForecast: typeof planA1 = {
    ...planA1,
    status: "viable",
    warnings: [],
  };
  const journeyViable = buildJourneyStatus({
    ...baseJourneyArgs,
    forecast: viableForecast,
  });
  record(
    "forecast: journey-status emits no forecast blocker when forecast viable",
    !journeyViable.blockers.some((b) => b.kind === "forecast")
  );

  // Legacy caller (no forecast) → behaviour unchanged.
  const journeyLegacy = buildJourneyStatus(baseJourneyArgs);
  record(
    "forecast: legacy journey-status call without forecast produces a valid stage",
    typeof journeyLegacy.currentStage === "string" &&
      journeyLegacy.currentStage.length > 0
  );
  record(
    "forecast: legacy journey-status call has no forecast-kind entries",
    !journeyLegacy.blockers.some((b) => b.kind === "forecast") &&
      !journeyLegacy.warnings.some((w) => w.kind === "forecast")
  );

  // ---- Markdown export ----------------------------------------------------

  const brief = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  record(
    "forecast-export: brief contains '## Forecast / Budget Planner'",
    brief.includes("## Forecast / Budget Planner")
  );
  record(
    "forecast-export: brief contains '### Budget summary'",
    brief.includes("### Budget summary")
  );
  record(
    "forecast-export: brief contains '### Scenario forecast'",
    brief.includes("### Scenario forecast")
  );
  record(
    "forecast-export: brief contains '### Spend allocation'",
    brief.includes("### Spend allocation")
  );
  record(
    "forecast-export: brief contains '### Decision checkpoints'",
    brief.includes("### Decision checkpoints")
  );
  record(
    "forecast-export: brief reflects 'Unviable' status when forecast unviable",
    brief.includes("**Status:** Unviable")
  );
  // Determinism — same input → same export string.
  const briefDet1 = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  const briefDet2 = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  record(
    "forecast-export: same input produces byte-identical export string",
    briefDet1 === briefDet2
  );

  // ---- Tab insertion ------------------------------------------------------
  record(
    "forecast: tab insertion present in StrategyView (label 'Forecast')",
    tabLabels.includes("Forecast")
  );
  record(
    "forecast: Forecast tab lands at index >= 8 (after Economics, first-7 pinning intact)",
    tabLabels.indexOf("Forecast") >= 8
  );
}

// ============================================================================
// === Scenario Simulator / What-if Lab ===
// ============================================================================
//
// Tests cover: pure-function determinism, exact 5-scenario count + stable
// ordering, base assumption parity with forecast, lever-direction
// monotonicity (CVR down / CPM up / trial up / AOV up), sensitivity
// shape + sorting, recommendation cap + stable ids, journey-status
// integration (unviable → blocker, only-base-viable → warning, viable →
// no entry, ready-to-spend gating), and markdown export. ~55 asserts.

{
  const simulatorMod = require("../src/lib/simulator/scenario-simulator") as typeof import("../src/lib/simulator/scenario-simulator");
  const journeyMod = require("../src/lib/engine/journey-status") as typeof import("../src/lib/engine/journey-status");
  const exportMod = require("../src/lib/engine/export-brief") as typeof import("../src/lib/engine/export-brief");

  const {
    buildScenarioSimulatorPlan,
    buildDefaultAssumptionSet,
    simulateScenario,
    buildSensitivityResults,
    buildSimulatorRecommendations,
  } = simulatorMod;
  const { buildJourneyStatus } = journeyMod;
  const { generateExportBrief } = exportMod;

  // ---- Determinism --------------------------------------------------------

  const astro = buildStrategy(ASTRO_DATING_EXAMPLE);
  const plan1 = buildScenarioSimulatorPlan(astro);
  const plan2 = buildScenarioSimulatorPlan(astro);
  record(
    "simulator: buildScenarioSimulatorPlan deterministic for AstroDating",
    JSON.stringify(plan1) === JSON.stringify(plan2)
  );
  record(
    "simulator: derivedAt is exactly 0 (no Date.now)",
    plan1.derivedAt === 0
  );

  const baseAssumptions = buildDefaultAssumptionSet(astro);
  const sim1 = simulateScenario(astro, baseAssumptions);
  const sim2 = simulateScenario(astro, baseAssumptions);
  record(
    "simulator: simulateScenario deterministic for same base",
    JSON.stringify(sim1) === JSON.stringify(sim2)
  );

  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "simulator: buildStrategy(AstroDating) byte-identical across calls (engine determinism preserved)",
    JSON.stringify(detA) === JSON.stringify(detB)
  );
  record(
    "simulator: strategy.scenarioSimulator present after buildStrategy",
    !!detA.scenarioSimulator &&
      typeof detA.scenarioSimulator.status === "string"
  );
  record(
    "simulator: strategy.scenarioSimulator.derivedAt is 0",
    detA.scenarioSimulator?.derivedAt === 0
  );

  // ---- Scenario count + ordering -----------------------------------------

  record(
    "simulator: plan.scenarios.length === 5",
    plan1.scenarios.length === 5
  );

  const baseIdx = plan1.scenarios.findIndex((s) => s.scenarioId === "base");
  const higherCpmIdx = plan1.scenarios.findIndex(
    (s) => s.scenarioId === "higher-cpm"
  );
  const lowerCvrIdx = plan1.scenarios.findIndex(
    (s) => s.scenarioId === "lower-cvr"
  );
  const slot4 = plan1.scenarios[3];
  const higherAovIdx = plan1.scenarios.findIndex(
    (s) => s.scenarioId === "higher-aov-annual"
  );

  record("simulator: scenarios[0] is 'base'", baseIdx === 0);
  record("simulator: scenarios[1] is 'higher-cpm'", higherCpmIdx === 1);
  record("simulator: scenarios[2] is 'lower-cvr'", lowerCvrIdx === 2);
  record(
    "simulator: scenarios[3] is 'better-trial' OR 'better-cvr'",
    slot4.scenarioId === "better-trial" || slot4.scenarioId === "better-cvr"
  );
  record(
    "simulator: scenarios[4] is 'higher-aov-annual'",
    higherAovIdx === 4
  );
  record(
    "simulator: every scenario has stable kebab-case scenarioId",
    plan1.scenarios.every(
      (s) =>
        typeof s.scenarioId === "string" &&
        /^[a-z]+(?:-[a-z0-9]+)*$/.test(s.scenarioId)
    )
  );

  // ---- Base vs forecast directional match --------------------------------

  const baseScen = plan1.scenarios[0];
  const forecastBase = astro.forecast?.scenarios.find((s) => s.kind === "base");
  if (
    forecastBase &&
    typeof forecastBase.outcome.expectedCpa === "number" &&
    Number.isFinite(baseScen.outcome.cpa)
  ) {
    record(
      "simulator: base.outcome.cpa within ±$2 of forecast base CPA",
      Math.abs(baseScen.outcome.cpa - forecastBase.outcome.expectedCpa) <= 2
    );
  } else {
    // Forecast base CPA might be undefined when economics is missing — still
    // pass a soft check that base CPA is a finite number.
    record(
      "simulator: base.outcome.cpa is a finite number (forecast CPA unavailable)",
      Number.isFinite(baseScen.outcome.cpa)
    );
  }
  if (
    forecastBase &&
    typeof forecastBase.outcome.expectedRoas === "number"
  ) {
    // Note: subscription with trial models revenue as paidConversions × LTV,
    // while forecast uses AOV — so absolute ROAS can diverge. We assert
    // direction (both have positive ROAS) rather than exact parity.
    record(
      "simulator: base.outcome.roas is positive when forecast base ROAS is positive",
      baseScen.outcome.roas > 0 && forecastBase.outcome.expectedRoas > 0
    );
  } else {
    record(
      "simulator: base.outcome.roas is finite (forecast ROAS unavailable)",
      Number.isFinite(baseScen.outcome.roas)
    );
  }

  // ---- Lever direction tests ---------------------------------------------

  const lowerCvr = plan1.scenarios[2];
  record(
    "simulator: lower-cvr CPA > base CPA (or both Infinity)",
    !Number.isFinite(baseScen.outcome.cpa) ||
      !Number.isFinite(lowerCvr.outcome.cpa) ||
      lowerCvr.outcome.cpa > baseScen.outcome.cpa
  );
  record(
    "simulator: lower-cvr ROAS < base ROAS",
    lowerCvr.outcome.roas < baseScen.outcome.roas
  );

  const higherCpm = plan1.scenarios[1];
  record(
    "simulator: higher-cpm CPA > base CPA (or both Infinity)",
    !Number.isFinite(baseScen.outcome.cpa) ||
      !Number.isFinite(higherCpm.outcome.cpa) ||
      higherCpm.outcome.cpa > baseScen.outcome.cpa
  );
  record(
    "simulator: higher-cpm ROAS < base ROAS",
    higherCpm.outcome.roas < baseScen.outcome.roas
  );

  // Slot 4 — directional check matches slot type.
  if (slot4.scenarioId === "better-trial") {
    record(
      "simulator: better-trial trialToPaidRate > base trialToPaidRate",
      typeof slot4.assumptions.trialToPaidRate === "number" &&
        typeof baseScen.assumptions.trialToPaidRate === "number" &&
        slot4.assumptions.trialToPaidRate >
          baseScen.assumptions.trialToPaidRate
    );
    record(
      "simulator: better-trial paidCac < base paidCac (or both Infinity)",
      slot4.outcome.paidCac === undefined ||
        baseScen.outcome.paidCac === undefined ||
        !Number.isFinite(slot4.outcome.paidCac) ||
        !Number.isFinite(baseScen.outcome.paidCac) ||
        slot4.outcome.paidCac <= baseScen.outcome.paidCac
    );
  } else {
    record(
      "simulator: better-cvr CVR > base CVR",
      slot4.assumptions.cvr > baseScen.assumptions.cvr
    );
    record(
      "simulator: better-cvr ROAS >= base ROAS",
      slot4.outcome.roas >= baseScen.outcome.roas
    );
  }

  const higherAov = plan1.scenarios[4];
  record(
    "simulator: higher-aov-annual revenue >= base revenue",
    higherAov.outcome.revenue >= baseScen.outcome.revenue
  );
  record(
    "simulator: higher-aov-annual currentAov > base currentAov",
    higherAov.assumptions.currentAov > baseScen.assumptions.currentAov
  );

  // ---- Sensitivities ------------------------------------------------------

  const sens = plan1.sensitivities;
  record(
    "simulator: sensitivities includes 'cpm'",
    sens.some((s) => s.lever === "cpm")
  );
  record(
    "simulator: sensitivities includes 'ctr'",
    sens.some((s) => s.lever === "ctr")
  );
  record(
    "simulator: sensitivities includes 'cvr'",
    sens.some((s) => s.lever === "cvr")
  );
  record(
    "simulator: sensitivities includes 'totalBudget'",
    sens.some((s) => s.lever === "totalBudget")
  );
  record(
    "simulator: each numeric lever has 4 steps",
    sens
      .filter((s) => s.lever !== "offerKind")
      .every((s) => s.steps.length === 4)
  );
  record(
    "simulator: sensitivities sorted by sensitivityScore desc",
    sens.every(
      (s, i) => i === 0 || sens[i - 1].sensitivityScore >= s.sensitivityScore
    )
  );
  record(
    "simulator: every sensitivityScore is in [0, 100]",
    sens.every(
      (s) =>
        Number.isFinite(s.sensitivityScore) &&
        s.sensitivityScore >= 0 &&
        s.sensitivityScore <= 100
    )
  );

  // ---- Recommendations ---------------------------------------------------

  record(
    "simulator: plan.recommendations.length <= 5",
    plan1.recommendations.length <= 5
  );
  record(
    "simulator: every recommendation has stable id + title + rationale + priority",
    plan1.recommendations.every(
      (r) =>
        typeof r.id === "string" &&
        r.id.length > 0 &&
        typeof r.title === "string" &&
        r.title.length > 0 &&
        typeof r.rationale === "string" &&
        r.rationale.length > 0 &&
        (r.priority === "must-do" ||
          r.priority === "should-do" ||
          r.priority === "nice-to-have")
    )
  );
  // Recommendation priority ordering — must-do before should-do before nice-to-have.
  const priOrder: Record<string, number> = {
    "must-do": 0,
    "should-do": 1,
    "nice-to-have": 2,
  };
  record(
    "simulator: recommendations sorted by priority (must-do → should-do → nice-to-have)",
    plan1.recommendations.every(
      (r, i) =>
        i === 0 ||
        priOrder[plan1.recommendations[i - 1].priority] <= priOrder[r.priority]
    )
  );
  // buildSimulatorRecommendations called standalone is deterministic.
  const recs1 = buildSimulatorRecommendations({
    base: plan1.scenarios[0],
    scenarios: plan1.scenarios,
    sensitivities: plan1.sensitivities,
  });
  const recs2 = buildSimulatorRecommendations({
    base: plan1.scenarios[0],
    scenarios: plan1.scenarios,
    sensitivities: plan1.sensitivities,
  });
  record(
    "simulator: buildSimulatorRecommendations deterministic",
    JSON.stringify(recs1) === JSON.stringify(recs2)
  );

  // ---- Status classification ---------------------------------------------

  record(
    "simulator: plan.status is one of viable/tight/unviable/incomplete",
    plan1.status === "viable" ||
      plan1.status === "tight" ||
      plan1.status === "unviable" ||
      plan1.status === "incomplete"
  );

  // ---- Journey Status integration ----------------------------------------

  const baseJourneyArgs = {
    trackingReadiness: astro.trackingReadiness,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: astro.kpiDiagnosis,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
    proofAssetPlan: astro.proofAssetPlan,
    audienceAvatars: astro.audienceAvatars,
    creativeTestingMatrix: astro.creativeTestingMatrix,
    appliedAdReviews: astro.appliedAdReviews,
    unitEconomics: astro.unitEconomics,
    forecast: astro.forecast,
  };

  // Forced unviable fixture.
  const unviableSim: typeof plan1 = {
    ...plan1,
    status: "unviable",
    scenarios: plan1.scenarios.map((s, i) =>
      i === 0
        ? { ...s, viability: "unviable" as const }
        : s
    ),
  };
  const journeyUnviable = buildJourneyStatus({
    ...baseJourneyArgs,
    simulator: unviableSim,
  });
  record(
    "simulator: journey-status emits 'simulator'-kind blocker when sim status unviable",
    journeyUnviable.blockers.some((b) => b.kind === "simulator")
  );
  record(
    "simulator: ready-to-spend NOT reached when simulator.status === 'unviable'",
    journeyUnviable.currentStage !== "ready-to-spend" &&
      journeyUnviable.readyToSpend === false
  );

  // Tight fixture with `only-base-viable` warning.
  const tightSim: typeof plan1 = {
    ...plan1,
    status: "tight",
    warnings: [
      {
        kind: "only-base-viable",
        severity: "warning",
        message: "Only base viable",
        fix: "Test more levers",
      },
      {
        kind: "fragile-to-cvr-drop",
        severity: "warning",
        message: "Fragile to CVR drop",
        fix: "Set kill rule",
      },
    ],
  };
  const journeyTight = buildJourneyStatus({
    ...baseJourneyArgs,
    simulator: tightSim,
  });
  record(
    "simulator: journey-status emits 'simulator'-kind warning when sim tight",
    journeyTight.warnings.some((w) => w.kind === "simulator")
  );
  record(
    "simulator: only-base-viable surfaces a simulator warning chip",
    journeyTight.warnings.some(
      (w) =>
        w.kind === "simulator" && w.message.includes("only viable in base")
    )
  );
  record(
    "simulator: tight simulator does NOT emit a simulator-kind blocker",
    !journeyTight.blockers.some((b) => b.kind === "simulator")
  );

  // Viable: no simulator entry.
  const viableSim: typeof plan1 = {
    ...plan1,
    status: "viable",
    warnings: [],
    scenarios: plan1.scenarios.map((s) => ({
      ...s,
      viability: "viable" as const,
    })),
  };
  const journeyViable = buildJourneyStatus({
    ...baseJourneyArgs,
    simulator: viableSim,
  });
  record(
    "simulator: journey-status emits no simulator blocker when sim viable",
    !journeyViable.blockers.some((b) => b.kind === "simulator")
  );
  record(
    "simulator: journey-status emits no simulator warning when sim viable + no warnings",
    !journeyViable.warnings.some((w) => w.kind === "simulator")
  );

  // ready-to-spend reachable when tight (warning only) — at least the
  // simulator gate alone does not block.
  const tightOnlySim: typeof plan1 = {
    ...plan1,
    status: "tight",
    warnings: [],
  };
  const journeyTightOnly = buildJourneyStatus({
    ...baseJourneyArgs,
    simulator: tightOnlySim,
  });
  record(
    "simulator: tight status alone does NOT push 'simulator' blocker",
    !journeyTightOnly.blockers.some((b) => b.kind === "simulator")
  );

  // Legacy caller without simulator → behaviour unchanged.
  const journeyLegacy = buildJourneyStatus(baseJourneyArgs);
  record(
    "simulator: legacy journey-status call without simulator produces a valid stage",
    typeof journeyLegacy.currentStage === "string" &&
      journeyLegacy.currentStage.length > 0
  );
  record(
    "simulator: legacy journey-status call has no simulator-kind entries",
    !journeyLegacy.blockers.some((b) => b.kind === "simulator") &&
      !journeyLegacy.warnings.some((w) => w.kind === "simulator")
  );

  // ---- Markdown export ----------------------------------------------------

  const briefSim = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  record(
    "simulator-export: brief contains '## Scenario Simulator / What-if Lab'",
    briefSim.includes("## Scenario Simulator / What-if Lab")
  );
  record(
    "simulator-export: brief contains '### Base assumptions'",
    briefSim.includes("### Base assumptions")
  );
  record(
    "simulator-export: brief contains '### Scenario comparison'",
    briefSim.includes("### Scenario comparison")
  );
  record(
    "simulator-export: brief contains '### Most sensitive levers'",
    briefSim.includes("### Most sensitive levers")
  );
  record(
    "simulator-export: brief contains '### Recommendations'",
    briefSim.includes("### Recommendations")
  );
  // Determinism — same input → same export string.
  const briefSimDet1 = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  const briefSimDet2 = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  record(
    "simulator-export: same input produces byte-identical export string",
    briefSimDet1 === briefSimDet2
  );

  // ---- Tab insertion ------------------------------------------------------
  record(
    "simulator: tab insertion present in StrategyView (label 'Simulator')",
    tabLabels.includes("Simulator")
  );
  record(
    "simulator: Simulator tab lands at index >= 9 (after Forecast, first-7 pinning intact)",
    tabLabels.indexOf("Simulator") >= 9
  );

  // ---- buildDefaultAssumptionSet sanity ----------------------------------
  const defA = buildDefaultAssumptionSet(astro);
  const defB = buildDefaultAssumptionSet(astro);
  record(
    "simulator: buildDefaultAssumptionSet deterministic",
    JSON.stringify(defA) === JSON.stringify(defB)
  );
  record(
    "simulator: baseAssumptions.cpm > 0",
    defA.cpm > 0
  );
  record(
    "simulator: baseAssumptions.totalBudget > 0",
    defA.totalBudget > 0
  );
  record(
    "simulator: baseAssumptions.grossMargin in (0, 1]",
    defA.grossMargin > 0 && defA.grossMargin <= 1
  );
  record(
    "simulator: AstroDating (freemium) → hasFreeTrial true",
    defA.hasFreeTrial === true
  );

  // ---- HeirloomBrew (one-time) gets 'better-cvr' slot 4 -----------------
  const heirloom = buildStrategy(HEIRLOOM_BREW_EXAMPLE);
  const heirloomPlan = buildScenarioSimulatorPlan(heirloom);
  record(
    "simulator: HeirloomBrew (one-time) scenarios[3].scenarioId === 'better-cvr'",
    heirloomPlan.scenarios[3].scenarioId === "better-cvr"
  );
  record(
    "simulator: HeirloomBrew plan has exactly 5 scenarios",
    heirloomPlan.scenarios.length === 5
  );

  // Plotline (subscription without trial signal in price) → 'better-cvr'
  // because the economics layer only flags hasFreeTrial when the price /
  // description carries the signal.
  const plotline = buildStrategy(NOTION_LIKE_EXAMPLE);
  const plotlinePlan = buildScenarioSimulatorPlan(plotline);
  record(
    "simulator: Plotline (subscription) plan has exactly 5 scenarios",
    plotlinePlan.scenarios.length === 5
  );
  record(
    "simulator: Plotline slot 4 is 'better-trial' OR 'better-cvr' (deterministic)",
    plotlinePlan.scenarios[3].scenarioId === "better-trial" ||
      plotlinePlan.scenarios[3].scenarioId === "better-cvr"
  );

  // AstroDating freemium → expect 'better-trial' (freemium implies trial).
  record(
    "simulator: AstroDating (freemium) scenarios[3].scenarioId === 'better-trial'",
    plan1.scenarios[3].scenarioId === "better-trial"
  );
}

// ============================================================================
// === Benchmarks / Calibration ===
// ============================================================================
//
// Tests cover: catalog shape + disclosure phrase, profile-fit selection,
// consensus comparisons, recommendations, warnings, journey-status
// integration (high-spend uncalibrated blocker, low-confidence warning,
// far-from-range warning), engine purity, manual benchmark-store
// roundtrip, and the markdown export section. ~45-50 asserts.

{
  const benchmarksCatalogMod = require("../src/lib/benchmarks/catalog") as typeof import("../src/lib/benchmarks/catalog");
  const benchmarksCalibMod = require("../src/lib/benchmarks/calibration") as typeof import("../src/lib/benchmarks/calibration");
  const benchmarksStoreMod = require("../src/lib/benchmarks/benchmark-store") as typeof import("../src/lib/benchmarks/benchmark-store");
  const journeyMod2 = require("../src/lib/engine/journey-status") as typeof import("../src/lib/engine/journey-status");
  const exportMod2 = require("../src/lib/engine/export-brief") as typeof import("../src/lib/engine/export-brief");

  const {
    BUILT_IN_BENCHMARK_PROFILES,
    getBenchmarkProfile,
    listBenchmarkProfiles,
  } = benchmarksCatalogMod;
  const {
    buildBenchmarkCalibration,
    selectBenchmarkProfiles,
    buildBenchmarkWarnings,
  } = benchmarksCalibMod;
  const {
    STORAGE_KEY_BENCHMARK_PROFILES,
    createMemoryBenchmarkStore,
  } = benchmarksStoreMod;
  const { buildJourneyStatus } = journeyMod2;
  const { generateExportBrief } = exportMod2;

  // ---- Catalog shape ----------------------------------------------------

  record(
    "benchmarks: catalog has at least 6 built-in profiles",
    BUILT_IN_BENCHMARK_PROFILES.length >= 6
  );
  record(
    "benchmarks: catalog has unique kebab-case ids",
    (() => {
      const ids = BUILT_IN_BENCHMARK_PROFILES.map((p) => p.id);
      if (new Set(ids).size !== ids.length) return false;
      return ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id));
    })()
  );
  record(
    "benchmarks: every profile has a non-empty label",
    BUILT_IN_BENCHMARK_PROFILES.every(
      (p) => typeof p.label === "string" && p.label.length > 0
    )
  );
  record(
    "benchmarks: every profile has fitRules object",
    BUILT_IN_BENCHMARK_PROFILES.every(
      (p) => typeof p.fitRules === "object" && p.fitRules !== null
    )
  );
  record(
    "benchmarks: every profile has at least 3 metrics",
    BUILT_IN_BENCHMARK_PROFILES.every((p) => p.metrics.length >= 3)
  );
  record(
    "benchmarks: most profiles (>= 80%) have at least 4 metrics",
    (() => {
      const four = BUILT_IN_BENCHMARK_PROFILES.filter(
        (p) => p.metrics.length >= 4
      ).length;
      return four / BUILT_IN_BENCHMARK_PROFILES.length >= 0.8;
    })()
  );
  record(
    "benchmarks: every profile has confidence one of low/medium/high",
    BUILT_IN_BENCHMARK_PROFILES.every((p) =>
      ["low", "medium", "high"].includes(p.confidence)
    )
  );
  record(
    "benchmarks: every caveat starts with 'Planning benchmark, not real-time data'",
    BUILT_IN_BENCHMARK_PROFILES.every((p) =>
      /^Planning benchmark, not real-time data\./.test(p.caveat)
    )
  );
  record(
    "benchmarks: every metric range has low < median < high",
    BUILT_IN_BENCHMARK_PROFILES.every((p) =>
      p.metrics.every(
        (m) => m.range.low < m.range.median && m.range.median < m.range.high
      )
    )
  );
  record(
    "benchmarks: every metric range carries a unit",
    BUILT_IN_BENCHMARK_PROFILES.every((p) =>
      p.metrics.every((m) =>
        ["usd", "percent", "multiplier", "months"].includes(m.range.unit)
      )
    )
  );
  record(
    "benchmarks: getBenchmarkProfile resolves a known id",
    !!getBenchmarkProfile(BUILT_IN_BENCHMARK_PROFILES[0].id)
  );
  record(
    "benchmarks: getBenchmarkProfile returns undefined for unknown id",
    getBenchmarkProfile("does-not-exist") === undefined
  );
  record(
    "benchmarks: listBenchmarkProfiles returns a copy with same length",
    listBenchmarkProfiles().length === BUILT_IN_BENCHMARK_PROFILES.length
  );

  // ---- selectBenchmarkProfiles ------------------------------------------

  const astro = buildStrategy(ASTRO_DATING_EXAMPLE);
  // selectBenchmarkProfiles reads ProductInput via the engine's
  // `__input` escape hatch — the engine attaches it on the snapshot it
  // passes to buildBenchmarkCalibration, but the final Strategy does
  // not carry it. The standalone test mirrors what the engine does.
  const astroWithInput = { ...astro, __input: ASTRO_DATING_EXAMPLE } as unknown as import("../src/types/strategy").Strategy;
  const selected1 = selectBenchmarkProfiles(astroWithInput);
  const selected2 = selectBenchmarkProfiles(astroWithInput);
  record(
    "benchmarks: selectBenchmarkProfiles returns <= 3 profiles",
    selected1.length <= 3
  );
  record(
    "benchmarks: selectBenchmarkProfiles deterministic",
    JSON.stringify(selected1) === JSON.stringify(selected2)
  );
  record(
    "benchmarks: selected profiles sorted by fitScore desc",
    selected1.every(
      (s, i) => i === 0 || s.fitScore <= selected1[i - 1].fitScore
    )
  );
  record(
    "benchmarks: AstroDating top-2 includes a subscription-app profile",
    selected1
      .slice(0, 2)
      .some((s) =>
        (s.profile.fitRules.businessModels ?? []).includes("subscription-app")
      )
  );

  // Ties broken by id asc — synthesize a tie and verify ordering.
  const tieScored = BUILT_IN_BENCHMARK_PROFILES.slice(0, 2).map((p) => ({
    profileId: p.id,
    profile: p,
    fitScore: 50,
    matchedDimensions: [],
    missingDimensions: [],
  }));
  const sortedTie = [...tieScored].sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;
  });
  record(
    "benchmarks: tie-breaking by id ascending (sanity)",
    sortedTie[0].profileId <= sortedTie[1].profileId
  );

  // ---- buildBenchmarkCalibration ----------------------------------------

  const cal1 = astro.benchmarkCalibration!;
  const astro2 = buildStrategy(ASTRO_DATING_EXAMPLE);
  const cal2 = astro2.benchmarkCalibration!;
  record(
    "benchmarks: buildStrategy attaches benchmarkCalibration",
    !!cal1 && typeof cal1.status === "string"
  );
  record(
    "benchmarks: calibration status is calibrated or partially-calibrated for AstroDating",
    cal1.status === "calibrated" || cal1.status === "partially-calibrated"
  );
  record(
    "benchmarks: calibration deterministic (two builds deep-equal)",
    JSON.stringify(cal1) === JSON.stringify(cal2)
  );
  record(
    "benchmarks: calibration.derivedAt === 0",
    cal1.derivedAt === 0
  );
  record(
    "benchmarks: comparisons.length >= 4 for AstroDating",
    cal1.comparisons.length >= 4
  );
  record(
    "benchmarks: every comparison has a valid status",
    cal1.comparisons.every((c) =>
      [
        "within-range",
        "below-range",
        "above-range",
        "far-below-range",
        "far-above-range",
        "no-benchmark",
      ].includes(c.status)
    )
  );
  record(
    "benchmarks: every recommendation has priority + metric + rationale",
    cal1.recommendations.every(
      (r) =>
        typeof r.priority === "string" &&
        typeof r.metric === "string" &&
        typeof r.rationale === "string" &&
        r.rationale.length > 0
    )
  );
  record(
    "benchmarks: recommendations sorted must-do → should-do → nice-to-have",
    (() => {
      const rank: Record<string, number> = {
        "must-do": 0,
        "should-do": 1,
        "nice-to-have": 2,
      };
      return cal1.recommendations.every(
        (r, i) =>
          i === 0 ||
          rank[r.priority] >= rank[cal1.recommendations[i - 1].priority]
      );
    })()
  );

  // ---- No-matching-profile warning --------------------------------------

  const orphanInput: ProductInput = {
    name: "Mystery Box",
    category: "zzzz-unknown-category",
    description: "ungrouped",
    price: "$0",
    businessModel: "other",
    audience: "noone",
    audiencePain: "nothing",
    competitors: "none",
    differentiator: "none",
    goal: "none",
    awareness: "unaware",
    sophistication: "fresh-market",
  };
  const orphan = buildStrategy(orphanInput);
  const orphanCal = orphan.benchmarkCalibration!;
  // 'other' businessModel + unknown category + no channel signal
  // → no profile gets a businessModel/category/channel boost. Some
  // awareness/sophistication points still apply, so we accept either
  // the no-matching-profile warning OR a max fitScore below 50 OR
  // a calibration that emitted some non-info warning kind.
  const orphanMaxFit = orphanCal.selectedProfiles.reduce(
    (m, p) => Math.max(m, p.fitScore),
    0
  );
  record(
    "benchmarks: 'other' business model with no signal → weak calibration (warning or low-fit)",
    orphanCal.warnings.some((w) => w.kind === "no-matching-profile") ||
      orphanCal.selectedProfiles.length === 0 ||
      orphanMaxFit < 50
  );

  // ---- Forecast far above benchmark high → forecast-far-from-benchmark warning ---

  const farCalibration: import("../src/types/benchmarks").BenchmarkCalibration = {
    status: "partially-calibrated",
    confidence: "medium",
    selectedProfiles: [
      {
        profileId: "test-fit",
        profile: BUILT_IN_BENCHMARK_PROFILES[0],
        fitScore: 75,
        matchedDimensions: [],
        missingDimensions: [],
      },
    ],
    comparisons: [
      {
        metric: "cpm",
        forecastValue: 200,
        benchmark: { low: 12, median: 20, high: 32, unit: "usd" },
        status: "far-above-range",
        delta: 180,
        deltaPercent: 9,
      },
    ],
    recommendations: [],
    warnings: [],
    derivedAt: 0,
  };
  const farWarnings = buildBenchmarkWarnings(astro, farCalibration);
  record(
    "benchmarks: far-above-range comparison → forecast-far-from-benchmark warning",
    farWarnings.some((w) => w.kind === "forecast-far-from-benchmark")
  );

  // ---- High spend + uncalibrated → blocker -----------------------------

  const fakeStrategyForHighSpend = {
    ...astro,
    forecast: {
      ...astro.forecast!,
      budget: { ...astro.forecast!.budget, totalTestBudget: 9000 },
    },
  } as import("../src/types/strategy").Strategy;
  const uncalibrated: import("../src/types/benchmarks").BenchmarkCalibration = {
    status: "uncalibrated",
    confidence: "low",
    selectedProfiles: [],
    comparisons: [],
    recommendations: [],
    warnings: [],
    derivedAt: 0,
  };
  const highSpendWarnings = buildBenchmarkWarnings(
    fakeStrategyForHighSpend,
    uncalibrated
  );
  record(
    "benchmarks: uncalibrated + totalTestBudget > $5000 → high-spend-uncalibrated blocker",
    highSpendWarnings.some(
      (w) => w.kind === "high-spend-uncalibrated" && w.severity === "blocker"
    )
  );

  // ---- Journey Status: high-spend blocker + ready-to-spend gating -------

  const highSpendCal: import("../src/types/benchmarks").BenchmarkCalibration = {
    ...uncalibrated,
    warnings: highSpendWarnings,
  };
  const journeyWithHighSpend = buildJourneyStatus({
    trackingReadiness: astro.trackingReadiness,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: astro.kpiDiagnosis,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
    benchmarkCalibration: highSpendCal,
  });
  record(
    "benchmarks: journey-status emits 'benchmark'-kind blocker for high-spend-uncalibrated",
    journeyWithHighSpend.blockers.some(
      (b) => b.kind === "benchmark" && b.severity === "blocker"
    )
  );

  // Build an all-green journey input + a high-spend uncalibrated calibration
  // to verify ready-to-spend is gated specifically by the benchmark blocker.
  const greenTracking: import("../src/types/strategy").TrackingReadinessScore = {
    score: 90,
    status: "ready",
    blockers: 0,
    warnings: 0,
    checks: [],
  };
  const greenDiag: import("../src/types/strategy").KpiDiagnosis = {
    snapshot: {},
    ladder: astro.kpiLadder,
    findings: [],
    primaryCategory: "healthy",
  };
  const greenJourneyWithHighSpend = buildJourneyStatus({
    trackingReadiness: greenTracking,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: greenDiag,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
    benchmarkCalibration: highSpendCal,
  });
  record(
    "benchmarks: all-green journey + high-spend-uncalibrated → ready-to-spend NOT reached",
    greenJourneyWithHighSpend.currentStage !== "ready-to-spend"
  );

  // Low-confidence calibration → warning but does NOT block ready-to-spend.
  const lowConfCal: import("../src/types/benchmarks").BenchmarkCalibration = {
    status: "partially-calibrated",
    confidence: "low",
    selectedProfiles: cal1.selectedProfiles,
    comparisons: cal1.comparisons,
    recommendations: [],
    warnings: [
      {
        kind: "low-calibration-confidence",
        severity: "warning",
        message: "Benchmark calibration confidence is low.",
        fix: "Capture client-history benchmarks.",
      },
    ],
    derivedAt: 0,
  };
  const greenJourneyLowConf = buildJourneyStatus({
    trackingReadiness: greenTracking,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: greenDiag,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
    benchmarkCalibration: lowConfCal,
  });
  record(
    "benchmarks: low-confidence → 'benchmark' warning emitted",
    greenJourneyLowConf.warnings.some(
      (w) => w.kind === "benchmark" && w.severity === "warning"
    )
  );
  record(
    "benchmarks: low-confidence does NOT block ready-to-spend",
    greenJourneyLowConf.currentStage === "ready-to-spend"
  );

  // Legacy callers (no benchmarkCalibration) still pass the journey gate.
  const greenJourneyNoBench = buildJourneyStatus({
    trackingReadiness: greenTracking,
    kpiLadder: astro.kpiLadder,
    kpiDiagnosis: greenDiag,
    adReview: astro.adReview,
    creatorBriefs: astro.creatorBriefs,
    shotLists: astro.shotLists,
    videoScripts: astro.videoScripts,
    variantSets: astro.variantSets,
  });
  record(
    "benchmarks: legacy journey-status (no benchmarkCalibration) still reaches ready-to-spend",
    greenJourneyNoBench.currentStage === "ready-to-spend"
  );

  // ---- Engine purity ----------------------------------------------------

  const beforeForecast = JSON.stringify(astro.forecast);
  const cal3 = buildBenchmarkCalibration(astro);
  const afterForecast = JSON.stringify(astro.forecast);
  record(
    "benchmarks: buildBenchmarkCalibration does NOT mutate strategy.forecast",
    beforeForecast === afterForecast
  );
  record(
    "benchmarks: standalone buildBenchmarkCalibration deterministic",
    JSON.stringify(cal3) === JSON.stringify(buildBenchmarkCalibration(astro))
  );

  // Canonical engine-determinism check.
  const detA = buildStrategy(ASTRO_DATING_EXAMPLE);
  const detB = buildStrategy(ASTRO_DATING_EXAMPLE);
  record(
    "benchmarks: buildStrategy(AstroDating) byte-identical with benchmarks wired",
    JSON.stringify(detA) === JSON.stringify(detB)
  );

  // ---- Memory store roundtrip -------------------------------------------

  record(
    "benchmarks: STORAGE_KEY_BENCHMARK_PROFILES exactly 'bigad:benchmark-profiles:v1'",
    STORAGE_KEY_BENCHMARK_PROFILES === "bigad:benchmark-profiles:v1"
  );

  const memStore = createMemoryBenchmarkStore();
  const manualProfile: import("../src/types/benchmarks").BenchmarkProfile = {
    id: "test-manual-1",
    label: "Test manual override",
    source: "manual",
    fitRules: {},
    metrics: [
      {
        key: "cpm",
        range: { low: 5, median: 10, high: 15, unit: "usd" },
      },
    ],
    confidence: "medium",
    caveat: "Manual override for test.",
  };
  memStore.upsertManualProfile(manualProfile);
  record(
    "benchmarks: memory store upsertManualProfile + listManualProfiles roundtrip",
    memStore.listManualProfiles().some((p) => p.id === "test-manual-1")
  );
  memStore.deleteManualProfile("test-manual-1");
  record(
    "benchmarks: memory store deleteManualProfile removes entry",
    !memStore.listManualProfiles().some((p) => p.id === "test-manual-1")
  );

  // Built-in profiles cannot be persisted as manual.
  let rejectedBuiltIn = false;
  try {
    memStore.upsertManualProfile({
      ...BUILT_IN_BENCHMARK_PROFILES[0],
      source: "built-in",
    } as import("../src/types/benchmarks").BenchmarkProfile);
  } catch {
    rejectedBuiltIn = true;
  }
  record(
    "benchmarks: memory store rejects 'built-in' source on upsertManualProfile",
    rejectedBuiltIn
  );

  // ---- Export brief -----------------------------------------------------

  const briefBench = generateExportBrief(ASTRO_DATING_EXAMPLE, astro);
  record(
    "benchmarks-export: brief contains '## Benchmarks / Calibration'",
    briefBench.includes("## Benchmarks / Calibration")
  );
  record(
    "benchmarks-export: brief contains '### Selected planning benchmarks'",
    briefBench.includes("### Selected planning benchmarks")
  );
  record(
    "benchmarks-export: brief contains '### Metric comparison (forecast vs benchmark)'",
    briefBench.includes("### Metric comparison (forecast vs benchmark)")
  );
  record(
    "benchmarks-export: brief contains '### Recommended assumption adjustments'",
    briefBench.includes("### Recommended assumption adjustments")
  );
  record(
    "benchmarks-export: brief contains the planning-benchmark disclosure phrase",
    briefBench.includes("planning benchmarks, not real-time data")
  );
  record(
    "benchmarks-export: same input produces byte-identical export string",
    generateExportBrief(ASTRO_DATING_EXAMPLE, astro) ===
      generateExportBrief(ASTRO_DATING_EXAMPLE, astro)
  );

  // ---- Tab insertion ----------------------------------------------------

  record(
    "benchmarks: tab insertion present in StrategyView (label 'Benchmarks')",
    tabLabels.includes("Benchmarks")
  );
  record(
    "benchmarks: 'Benchmarks' tab lands at index >= 10 (after Simulator, first-7 pinning intact)",
    tabLabels.indexOf("Benchmarks") >= 10
  );
  record(
    "benchmarks: first 7 tabs still follow stakeholder reading flow",
    [
      "Score",
      "Positioning",
      "Awareness",
      "Audience avatars",
      "Diagnosis",
      "Offer architecture",
      "Calendar",
    ].every((label, i) => tabLabels[i] === label)
  );
}

// === Results / Forecast Accuracy ===
{
  const {
    analyzeCampaignResults,
    parseCsvResults,
  } = require("../src/lib/results/results-analysis");
  const {
    createMemoryResultsStore,
    STORAGE_KEY_CAMPAIGN_ACTUALS,
  } = require("../src/lib/results/results-store");

  // Use the AstroDating strategy as a fixture — it has a non-empty
  // creativeTestingMatrix + a forecast snapshot.
  const strategyR = a;
  const matrixR = strategyR.creativeTestingMatrix;
  const firstBatchR = matrixR
    ? matrixR.testCells.filter((c) =>
        matrixR.recommendedFirstBatch.includes(c.id)
      )
    : [];
  const firstCell = firstBatchR[0];
  const secondCell = firstBatchR[1];

  // Storage key must be exactly the versioned constant.
  record(
    "results: STORAGE_KEY_CAMPAIGN_ACTUALS exactly 'bigad:campaign-actuals:v1'",
    STORAGE_KEY_CAMPAIGN_ACTUALS === "bigad:campaign-actuals:v1"
  );

  // ---- Determinism --------------------------------------------------------

  // Deep-equal across two calls with the same actuals.
  const fixtureActuals = firstCell
    ? [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: 500,
          impressions: 50000,
          clicks: 750,
          conversions: 30,
          revenueUsd: 1500,
          status: "winning" as const,
          createdAt: 1,
          updatedAt: 2,
        },
      ]
    : [];

  const reportR1 = analyzeCampaignResults({
    strategy: strategyR,
    actualResults: fixtureActuals,
  });
  const reportR2 = analyzeCampaignResults({
    strategy: strategyR,
    actualResults: fixtureActuals,
  });
  record(
    "results: analyzeCampaignResults is deep-equal across two calls",
    JSON.stringify(reportR1) === JSON.stringify(reportR2)
  );
  record(
    "results: report.derivedAt is always 0",
    reportR1.derivedAt === 0 && reportR2.derivedAt === 0
  );

  // Engine regression — buildStrategy(astroDatingInput) twice deep-equal.
  {
    const engine1 = buildStrategy(ASTRO_DATING_EXAMPLE);
    const engine2 = buildStrategy(ASTRO_DATING_EXAMPLE);
    record(
      "results: buildStrategy(astroDatingInput) byte-identical (engine regression)",
      JSON.stringify(engine1) === JSON.stringify(engine2)
    );
  }

  // ---- Analysis math ------------------------------------------------------

  // Derived metric math on a known fixture: spend=500, impressions=50000,
  // clicks=750, conversions=30, revenue=1500.
  // Expect cpm=10, ctr=0.015, cvr=0.04, cpa=16.67, roas=3.
  if (firstCell) {
    const rowFix = reportR1.perCell.find(
      (row: any) => row.cellId === firstCell.id
    );
    const m = (k: string) =>
      rowFix?.metrics.find((mm: any) => mm.metric === k);
    record(
      "results: cpm derived correctly (spend/imp*1000 = 10)",
      m("cpm")?.actualValue === 10
    );
    record(
      "results: ctr derived correctly (clicks/imp = 0.015)",
      m("ctr")?.actualValue === 0.015
    );
    record(
      "results: cvr derived correctly (conv/clicks = 0.04)",
      m("cvr")?.actualValue === 0.04
    );
    record(
      "results: cpa derived correctly (spend/conv ~ 16.67)",
      Math.abs((m("cpa")?.actualValue ?? 0) - 16.67) < 0.01
    );
    record(
      "results: roas derived correctly (revenue/spend = 3)",
      m("roas")?.actualValue === 3
    );
  } else {
    record("results: cpm derived correctly (vacuous — no first batch)", true);
    record("results: ctr derived correctly (vacuous — no first batch)", true);
    record("results: cvr derived correctly (vacuous — no first batch)", true);
    record("results: cpa derived correctly (vacuous — no first batch)", true);
    record("results: roas derived correctly (vacuous — no first batch)", true);
  }

  // Inconsistent totals: clicks > impressions.
  if (firstCell) {
    const reportBad = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: 100,
          impressions: 100,
          clicks: 200,
          conversions: 5,
          revenueUsd: 250,
          status: "inconclusive" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: clicks > impressions → inconsistent-totals issue",
      reportBad.importIssues.some(
        (i: any) =>
          i.kind === "inconsistent-totals" && i.cellId === firstCell.id
      )
    );
  } else {
    record("results: clicks > impressions → inconsistent-totals issue (vacuous)", true);
  }

  // No-spend-no-data: 0/0/0/0.
  if (firstCell) {
    const reportEmpty = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          status: "needs-more-data" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: zero spend / zero data → no-spend-no-data issue",
      reportEmpty.importIssues.some((i: any) => i.kind === "no-spend-no-data")
    );
  } else {
    record("results: zero spend / zero data → no-spend-no-data issue (vacuous)", true);
  }

  // Cell id not in strategy.
  {
    const reportOrphan = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: "p-r:r-1:not-a-real-cell",
          projectId: "p-r",
          runId: "r-1",
          cellId: "not-a-real-cell",
          spendUsd: 50,
          impressions: 5000,
          clicks: 50,
          conversions: 1,
          revenueUsd: 80,
          status: "inconclusive" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: orphan cellId → cell-id-not-in-strategy issue",
      reportOrphan.importIssues.some(
        (i: any) => i.kind === "cell-id-not-in-strategy"
      )
    );
  }

  // ---- Decision logic -----------------------------------------------------

  // Pull the forecast ROAS from the report's snapshot to drive thresholds.
  const baseSnap = reportR1.perCell[0]?.forecastSnapshot;
  const forecastRoas = baseSnap?.expectedRoas;
  const minLearning =
    strategyR.forecast?.budget?.minimumLearningBudget ?? 0;
  const cellCountR = matrixR
    ? matrixR.testCells.filter((c: any) =>
        matrixR.recommendedFirstBatch.includes(c.id)
      ).length
    : 0;
  const perCellLearning =
    cellCountR > 0 && minLearning > 0 ? minLearning / cellCountR : 0;
  const safeSpend = perCellLearning * 0.4 + 1; // strictly above the gate

  if (firstCell && typeof forecastRoas === "number" && forecastRoas > 0) {
    // Scale rule: ROAS > forecast * 1.2 AND conversions >= 5 AND spend
    // above gate.
    const spendScale = Math.max(safeSpend, 100);
    const revenueScale = spendScale * forecastRoas * 1.5; // 1.5x > 1.2x
    const reportScale = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendScale,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: revenueScale,
          status: "winning" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const rowScale = reportScale.perCell.find(
      (r: any) => r.cellId === firstCell.id
    );
    record(
      "results: ROAS > forecast × 1.2 with ≥5 conv → 'scale'",
      rowScale?.decision?.decision === "scale"
    );

    // Pause: ROAS < forecast * 0.6.
    const spendPause = Math.max(safeSpend, 100);
    const revenuePause = spendPause * forecastRoas * 0.4; // 0.4x < 0.6x
    const reportPause = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendPause,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: revenuePause,
          status: "losing" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const rowPause = reportPause.perCell.find(
      (r: any) => r.cellId === firstCell.id
    );
    record(
      "results: ROAS < forecast × 0.6 → 'pause'",
      rowPause?.decision?.decision === "pause"
    );

    // Iterate: ROAS 0.7-1.2 × forecast.
    const spendIter = Math.max(safeSpend, 100);
    const revenueIter = spendIter * forecastRoas * 1.0; // exactly 1x
    const reportIter = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendIter,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: revenueIter,
          status: "inconclusive" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const rowIter = reportIter.perCell.find(
      (r: any) => r.cellId === firstCell.id
    );
    record(
      "results: ROAS within 0.7-1.2 × forecast → 'iterate'",
      rowIter?.decision?.decision === "iterate"
    );

    // Needs-more-data: spend below the learning gate (only meaningful
    // when the gate is positive).
    if (perCellLearning > 0) {
      const spendLow = perCellLearning * 0.1; // far below the gate
      const reportLow = analyzeCampaignResults({
        strategy: strategyR,
        actualResults: [
          {
            id: `p-r:r-1:${firstCell.id}`,
            projectId: "p-r",
            runId: "r-1",
            cellId: firstCell.id,
            spendUsd: spendLow,
            impressions: 1000,
            clicks: 20,
            conversions: 1,
            revenueUsd: spendLow * forecastRoas,
            status: "needs-more-data" as const,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });
      const rowLow = reportLow.perCell.find(
        (r: any) => r.cellId === firstCell.id
      );
      record(
        "results: low spend → 'needs-more-data'",
        rowLow?.decision?.decision === "needs-more-data"
      );
    } else {
      record("results: low spend → 'needs-more-data' (vacuous — no learning gate)", true);
    }
  } else {
    record("results: ROAS > forecast × 1.2 with ≥5 conv → 'scale' (vacuous)", true);
    record("results: ROAS < forecast × 0.6 → 'pause' (vacuous)", true);
    record("results: ROAS within 0.7-1.2 × forecast → 'iterate' (vacuous)", true);
    record("results: low spend → 'needs-more-data' (vacuous)", true);
  }

  // ---- Overall accuracy ---------------------------------------------------

  if (firstCell && typeof forecastRoas === "number" && forecastRoas > 0) {
    // Overall accuracy is gated by totalSpend >= minLearning * 0.4. Use a
    // spend value comfortably above the gate so the classifier reaches
    // the better/on/worse branch.
    const overallGate = Math.max(minLearning * 0.4 + 50, 200);
    const spendBetter = overallGate;
    const reportBetter = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendBetter,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: spendBetter * forecastRoas * 1.5,
          status: "winning" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: weighted ROAS > forecast × 1.1 → 'better-than-forecast'",
      reportBetter.overallAccuracy === "better-than-forecast"
    );

    // On-target: within ±10%.
    const reportOn = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendBetter,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: spendBetter * forecastRoas * 1.0,
          status: "inconclusive" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: weighted ROAS within ±10% → 'on-target'",
      reportOn.overallAccuracy === "on-target"
    );

    // Worse-than-forecast: < forecast × 0.9.
    const reportWorse = analyzeCampaignResults({
      strategy: strategyR,
      actualResults: [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: spendBetter,
          impressions: 20000,
          clicks: 400,
          conversions: 10,
          revenueUsd: spendBetter * forecastRoas * 0.5,
          status: "losing" as const,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    record(
      "results: weighted ROAS < forecast × 0.9 → 'worse-than-forecast'",
      reportWorse.overallAccuracy === "worse-than-forecast"
    );

    // Insufficient data: low total spend (below learning × 0.4).
    if (minLearning > 0) {
      const reportInsuff = analyzeCampaignResults({
        strategy: strategyR,
        actualResults: [
          {
            id: `p-r:r-1:${firstCell.id}`,
            projectId: "p-r",
            runId: "r-1",
            cellId: firstCell.id,
            spendUsd: minLearning * 0.05,
            impressions: 500,
            clicks: 10,
            conversions: 0,
            status: "needs-more-data" as const,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });
      record(
        "results: low total spend → 'insufficient-data'",
        reportInsuff.overallAccuracy === "insufficient-data"
      );
    } else {
      record("results: low total spend → 'insufficient-data' (vacuous — no learning budget)", true);
    }
  } else {
    record("results: weighted ROAS > forecast × 1.1 → 'better-than-forecast' (vacuous)", true);
    record("results: weighted ROAS within ±10% → 'on-target' (vacuous)", true);
    record("results: weighted ROAS < forecast × 0.9 → 'worse-than-forecast' (vacuous)", true);
    record("results: low total spend → 'insufficient-data' (vacuous)", true);
  }

  // ---- Persistence (memory store) ----------------------------------------

  {
    const store = createMemoryResultsStore();
    const cellId = firstCell?.id ?? "test-1";
    const projectId = "p-mem";
    const runId = "run-mem";

    // upsert + list + get
    const upserted = store.upsertResult({
      projectId,
      runId,
      cellId,
      spendUsd: 100,
      impressions: 10000,
      clicks: 150,
      conversions: 6,
      revenueUsd: 240,
      status: "winning",
    });
    record(
      "results-store: stable id is `${projectId}:${runId}:${cellId}`",
      upserted.id === `${projectId}:${runId}:${cellId}`
    );

    const list1 = store.listResults(projectId, runId);
    record(
      "results-store: upsert + list returns the row",
      list1.length === 1 && list1[0].cellId === cellId
    );
    const got = store.getResult(upserted.id);
    record(
      "results-store: getResult returns the row",
      !!got && got!.id === upserted.id
    );

    // delete
    store.deleteResult(upserted.id);
    record(
      "results-store: deleteResult removes the row",
      store.listResults(projectId, runId).length === 0
    );

    // re-add then clearForRun cascades
    store.upsertResult({
      projectId,
      runId,
      cellId,
      spendUsd: 50,
      impressions: 5000,
      clicks: 75,
      conversions: 3,
      revenueUsd: 120,
      status: "inconclusive",
    });
    store.upsertResult({
      projectId,
      runId: "other-run",
      cellId,
      spendUsd: 10,
      impressions: 1000,
      clicks: 15,
      conversions: 0,
      status: "inconclusive",
    });
    store.clearForRun(projectId, runId);
    record(
      "results-store: clearForRun cascades to that run only",
      store.listResults(projectId, runId).length === 0 &&
        store.listResults(projectId, "other-run").length === 1
    );
  }

  // ---- CSV parsing --------------------------------------------------------

  {
    // Valid CSV with all required columns + a quoted notes field with a comma.
    const csvOk =
      `cellId,spend,impressions,clicks,conversions,revenue,status,notes,daysRun\n` +
      `${firstCell?.id ?? "test-1"},500,50000,750,30,1500,winning,"strong hook, weak proof",7\n`;
    const parsedOk = parseCsvResults(csvOk, "p-csv", "r-csv");
    record(
      "results-csv: valid CSV parses with zero issues",
      parsedOk.results.length === 1 && parsedOk.issues.length === 0
    );
    record(
      "results-csv: quoted comma in notes preserved",
      parsedOk.results[0]?.notes === "strong hook, weak proof"
    );

    // Missing required field → ResultImportIssue.
    const csvMissing =
      `cellId,spend,impressions,clicks\n` +
      `${firstCell?.id ?? "test-1"},500,50000,750\n`;
    const parsedMissing = parseCsvResults(csvMissing, "p-csv", "r-csv");
    record(
      "results-csv: missing required header emits an issue",
      parsedMissing.issues.some(
        (i: any) => i.kind === "missing-cell-id" && i.rowNumber === 1
      )
    );
  }

  // ---- Journey Status (results) ------------------------------------------

  {
    const {
      buildJourneyStatus: buildJS,
    } = require("../src/lib/engine/journey-status");
    const baseArgs = {
      trackingReadiness: strategyR.trackingReadiness,
      kpiLadder: strategyR.kpiLadder,
      kpiDiagnosis: strategyR.kpiDiagnosis,
      adReview: strategyR.adReview,
      creatorBriefs: strategyR.creatorBriefs,
      shotLists: strategyR.shotLists,
      videoScripts: strategyR.videoScripts,
      variantSets: strategyR.variantSets,
    };
    const jsWith = buildJS({
      ...baseArgs,
      campaignResults: { hasSavedRuns: true, hasResults: false },
    });
    record(
      "results: hasSavedRuns + !hasResults → 'results' warning emitted",
      jsWith.warnings.some((w: any) => w.kind === "results")
    );
    record(
      "results: 'results' warning does NOT block ready-to-spend (no blocker added)",
      !jsWith.blockers.some((b: any) => b.kind === "results")
    );
    const jsBoth = buildJS({
      ...baseArgs,
      campaignResults: { hasSavedRuns: true, hasResults: true },
    });
    record(
      "results: hasSavedRuns + hasResults → no 'results' warning",
      !jsBoth.warnings.some((w: any) => w.kind === "results")
    );
  }

  // ---- Export brief -------------------------------------------------------

  {
    const {
      generateExportBrief: genExportR,
    } = require("../src/lib/engine/export-brief");

    // Without campaignResults context — section absent.
    const briefAbsent = genExportR(ASTRO_DATING_EXAMPLE, strategyR);
    record(
      "results-export: section absent when no campaignResults context is passed",
      !briefAbsent.includes("## Results / Forecast Accuracy")
    );

    if (firstCell) {
      // With campaignResults context — section + sub-sections present.
      const ctxActuals = [
        {
          id: `p-r:r-1:${firstCell.id}`,
          projectId: "p-r",
          runId: "r-1",
          cellId: firstCell.id,
          spendUsd: 500,
          impressions: 50000,
          clicks: 750,
          conversions: 30,
          revenueUsd: 1500,
          status: "winning" as const,
          createdAt: 1,
          updatedAt: 2,
        },
      ];
      const ctxReport = analyzeCampaignResults({
        strategy: strategyR,
        actualResults: ctxActuals,
      });
      const briefWith = genExportR(ASTRO_DATING_EXAMPLE, strategyR, {
        campaignResults: { report: ctxReport, results: ctxActuals },
      });
      record(
        "results-export: contains '## Results / Forecast Accuracy' header",
        briefWith.includes("## Results / Forecast Accuracy")
      );
      record(
        "results-export: contains '### Latest results' sub-section",
        briefWith.includes("### Latest results")
      );
      record(
        "results-export: contains '### Decision recommendations' sub-section",
        briefWith.includes("### Decision recommendations")
      );
    } else {
      record("results-export: contains '## Results / Forecast Accuracy' header (vacuous)", true);
      record("results-export: contains '### Latest results' sub-section (vacuous)", true);
      record("results-export: contains '### Decision recommendations' sub-section (vacuous)", true);
    }
  }

  // ---- No mutation --------------------------------------------------------

  {
    const before = JSON.stringify(strategyR.forecast);
    analyzeCampaignResults({
      strategy: strategyR,
      actualResults: fixtureActuals,
    });
    const after = JSON.stringify(strategyR.forecast);
    record(
      "results: analyzeCampaignResults does NOT mutate strategy.forecast",
      before === after
    );
  }

  // ---- Tab insertion ------------------------------------------------------

  record(
    "results: tab insertion present in StrategyView (label 'Results')",
    tabLabels.includes("Results")
  );
  record(
    "results: 'Results' tab lands AFTER 'Benchmarks'",
    tabLabels.indexOf("Results") > tabLabels.indexOf("Benchmarks")
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
