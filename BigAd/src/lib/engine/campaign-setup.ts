// campaign-setup.ts — Campaign Setup Builder.
//
// Turns the testing matrix into a launch-ready campaign spec: name,
// objective, conversion event, budget mode, ad sets, exclusions,
// placements, optimization event, UTM template, reporting columns, and
// a pre-launch checklist that mirrors the tracking-readiness checks.
//
// Voice and identifiers are generic — no platform-coined acronyms; no
// trademarked terms from any third-party source.

import type {
  AdSetSpec,
  AudienceAvatar,
  BudgetMode,
  CampaignArchitectureKind,
  CampaignCalendar,
  CampaignObjective,
  CampaignSetup,
  CampaignSpec,
  CreativeTestingMatrix,
  OfferRecommendation,
  PreLaunchChecklistItem,
  ProductInput,
  TrackingReadinessScore,
} from "@/types/strategy";

export interface CampaignSetupArgs {
  input: ProductInput;
  campaignCalendar: CampaignCalendar;
  trackingReadiness: TrackingReadinessScore;
  creativeTestingMatrix: CreativeTestingMatrix;
  audienceAvatars: AudienceAvatar[];
  offers: OfferRecommendation[];
}

const STANDARD_REPORTING_COLUMNS = [
  "Spend",
  "Impressions",
  "CTR",
  "CPC",
  "CPM",
  "CVR",
  "CPA",
  "ROAS",
  "hookRate",
  "holdRate",
];

const STANDARD_EXCLUSIONS_COLD = ["Existing customers", "Active trialists"];
const STANDARD_EXCLUSIONS_RETARGETING = ["Existing customers"];

const STANDARD_UTM =
  "utm_source={source}&utm_medium=paid&utm_campaign={campaignName}&utm_content={adId}";

export function buildCampaignSetup(args: CampaignSetupArgs): CampaignSetup {
  const {
    input,
    campaignCalendar,
    trackingReadiness,
    creativeTestingMatrix,
    audienceAvatars,
    offers,
  } = args;

  const productSlug = slugifyProduct(input.name ?? "PRODUCT");
  const country = pickCountry(input);
  const namingConvention = `${productSlug}-{FUNNEL}-${country}-{CONCEPT}-{VARIANT}`;

  // Decide architecture: launch+promo-3-tier → 3 campaigns; always-on → 1-2.
  const isLaunch = campaignCalendar.campaignType === "launch";
  const isSeasonal = campaignCalendar.campaignType === "seasonal";
  const hasPromoTier = campaignCalendar.windows.some(
    (w) => w.recommendedArchitecture.kind === "promo-3-tier"
  );
  const wantsThreeTier = (isLaunch || isSeasonal) && hasPromoTier;

  // Pick objective + conversion event from the business model.
  const objective = pickObjective(input);
  const isSubscription = input.businessModel === "subscription";
  const isFreemium = input.businessModel === "freemium";

  const coldConversionEvent =
    isSubscription || isFreemium ? "trial_start" : pickConversionEvent(input);
  const retargetConversionEvent =
    isSubscription || isFreemium ? "subscribe" : pickConversionEvent(input, true);

  const firstBatch = new Set(creativeTestingMatrix.recommendedFirstBatch);

  // Group first-batch cells by funnel stage.
  const prospectingCells = creativeTestingMatrix.testCells.filter(
    (c) => firstBatch.has(c.id) && c.funnelStage === "prospecting"
  );
  const engagementCells = creativeTestingMatrix.testCells.filter(
    (c) => firstBatch.has(c.id) && c.funnelStage === "engagement-retargeting"
  );
  const siteCells = creativeTestingMatrix.testCells.filter(
    (c) => firstBatch.has(c.id) && c.funnelStage === "site-retargeting"
  );

  const campaigns: CampaignSpec[] = [];

  // ---- Cold acquisition campaign (always present) ----------------------
  const coldArchitecture: CampaignArchitectureKind = wantsThreeTier
    ? "promo-3-tier"
    : "single-tier";

  const coldAds =
    prospectingCells.length > 0
      ? prospectingCells.map((c) => c.id)
      : creativeTestingMatrix.recommendedFirstBatch.slice(0, 3);

  campaigns.push({
    name: buildCampaignName(productSlug, "ACQ", country, prospectingCells[0]?.conceptId, coldAds[0]),
    objective,
    conversionEvent: coldConversionEvent,
    budgetMode: "ad-set-budget",
    audienceArchitecture: coldArchitecture,
    adSets: [
      buildColdAdSet({
        avatars: audienceAvatars,
        ads: coldAds,
        budgetSplit: wantsThreeTier ? "60%" : "100%",
        optimizationEvent: coldConversionEvent,
      }),
    ],
    utmTemplate: STANDARD_UTM,
    reportingColumns: STANDARD_REPORTING_COLUMNS.slice(),
  });

  // ---- Retargeting campaign(s) -----------------------------------------
  if (wantsThreeTier) {
    // Engaged-60d retargeting.
    const engagedAds =
      engagementCells.length > 0
        ? engagementCells.map((c) => c.id)
        : coldAds.slice(0, 2);
    campaigns.push({
      name: buildCampaignName(
        productSlug,
        "ENGAGE",
        country,
        engagementCells[0]?.conceptId ?? prospectingCells[0]?.conceptId,
        engagedAds[0]
      ),
      objective: "conversions",
      conversionEvent: retargetConversionEvent,
      budgetMode: "ad-set-budget",
      audienceArchitecture: "promo-3-tier",
      adSets: [
        {
          name: "Engaged 60d",
          audienceTier: "Engaged (last 60 days)",
          budgetSplit: "25%",
          inclusions: ["Engaged with brand in the last 60 days"],
          exclusions: STANDARD_EXCLUSIONS_RETARGETING.slice(),
          placements: ["Feed", "Reels", "Stories"],
          optimizationEvent: retargetConversionEvent,
          ads: engagedAds,
        },
      ],
      utmTemplate: STANDARD_UTM,
      reportingColumns: STANDARD_REPORTING_COLUMNS.slice(),
    });

    // Site-90d retargeting.
    const siteAds =
      siteCells.length > 0 ? siteCells.map((c) => c.id) : coldAds.slice(0, 2);
    campaigns.push({
      name: buildCampaignName(
        productSlug,
        "SITE",
        country,
        siteCells[0]?.conceptId ?? prospectingCells[0]?.conceptId,
        siteAds[0]
      ),
      objective: "conversions",
      conversionEvent: retargetConversionEvent,
      budgetMode: "ad-set-budget",
      audienceArchitecture: "promo-3-tier",
      adSets: [
        {
          name: "Site visitors 90d",
          audienceTier: "Site visitors (last 90 days)",
          budgetSplit: "15%",
          inclusions: ["Visited landing page in the last 90 days"],
          exclusions: STANDARD_EXCLUSIONS_RETARGETING.slice(),
          placements: ["Feed", "Reels", "Search"],
          optimizationEvent: retargetConversionEvent,
          ads: siteAds,
        },
      ],
      utmTemplate: STANDARD_UTM,
      reportingColumns: STANDARD_REPORTING_COLUMNS.slice(),
    });
  } else if (campaigns.length === 1 && audienceAvatars.length > 1) {
    // Always-on with multiple avatars → add a light retargeting campaign.
    const lightAds = coldAds.slice(0, 2);
    campaigns.push({
      name: buildCampaignName(productSlug, "ENGAGE", country, prospectingCells[0]?.conceptId, lightAds[0]),
      objective: "conversions",
      conversionEvent: retargetConversionEvent,
      budgetMode: "ad-set-budget",
      audienceArchitecture: "single-tier",
      adSets: [
        {
          name: "Engaged 60d (always-on)",
          audienceTier: "Engaged (last 60 days)",
          budgetSplit: "100%",
          inclusions: ["Engaged with brand in the last 60 days"],
          exclusions: STANDARD_EXCLUSIONS_RETARGETING.slice(),
          placements: ["Feed", "Reels"],
          optimizationEvent: retargetConversionEvent,
          ads: lightAds,
        },
      ],
      utmTemplate: STANDARD_UTM,
      reportingColumns: STANDARD_REPORTING_COLUMNS.slice(),
    });
  }

  // ---- Pre-launch checklist -------------------------------------------
  const preLaunchChecklist = buildPreLaunchChecklist({
    trackingReadiness,
    creativeTestingMatrix,
  });

  return {
    namingConvention,
    campaigns,
    preLaunchChecklist,
  };
}

// ---- Builders ----------------------------------------------------------

interface BuildColdAdSetArgs {
  avatars: AudienceAvatar[];
  ads: string[];
  budgetSplit: string;
  optimizationEvent: string;
}

function buildColdAdSet(args: BuildColdAdSetArgs): AdSetSpec {
  const { avatars, ads, budgetSplit, optimizationEvent } = args;
  const tierName =
    avatars.length > 0
      ? `Cold broad (${avatars[0].label})`
      : "Cold broad prospecting";
  return {
    name: tierName,
    audienceTier: tierName,
    budgetSplit,
    inclusions: avatars.slice(0, 2).map((a) => a.label),
    exclusions: STANDARD_EXCLUSIONS_COLD.slice(),
    placements: ["Feed", "Reels", "Stories"],
    optimizationEvent,
    ads: ads.slice(0, 4),
  };
}

function buildCampaignName(
  product: string,
  funnel: string,
  country: string,
  conceptId: string | undefined,
  variantId: string | undefined
): string {
  const concept = conceptId ? slugifyConcept(conceptId) : "CONCEPT";
  const variant = variantId ? slugifyConcept(variantId) : "V1";
  return `${product}-${funnel}-${country}-${concept}-${variant}`;
}

function slugifyProduct(name: string): string {
  return (name || "PRODUCT")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase() || "PRODUCT";
}

function slugifyConcept(s: string): string {
  return (s || "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function pickCountry(input: ProductInput): string {
  // Default to US; if any input field mentions an EU country, swap to EU.
  const blob = `${input.audience ?? ""} ${input.competitors ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (/(uk|britain|england|ireland)/i.test(blob)) return "UK";
  if (/(france|french|paris)/i.test(blob)) return "FR";
  if (/(germany|berlin)/i.test(blob)) return "DE";
  if (/(canada|toronto)/i.test(blob)) return "CA";
  return "US";
}

function pickObjective(input: ProductInput): CampaignObjective {
  if (input.businessModel === "ads") return "traffic";
  if (input.businessModel === "marketplace") return "conversions";
  if (input.businessModel === "subscription" || input.businessModel === "freemium") {
    return "conversions";
  }
  if (input.businessModel === "services") return "leads";
  return "conversions";
}

function pickConversionEvent(input: ProductInput, retarget = false): string {
  const goal = (input.goal || "").toLowerCase();
  if (goal.includes("purchase") || goal.includes("sale")) return "purchase";
  if (goal.includes("signup") || goal.includes("sign up")) return "signup";
  if (goal.includes("install") || goal.includes("download")) return "install";
  if (goal.includes("lead") || goal.includes("contact")) return "lead";
  if (retarget) return "purchase";
  return "purchase";
}

interface PreLaunchArgs {
  trackingReadiness: TrackingReadinessScore;
  creativeTestingMatrix: CreativeTestingMatrix;
}

function buildPreLaunchChecklist(args: PreLaunchArgs): PreLaunchChecklistItem[] {
  const items: PreLaunchChecklistItem[] = [];

  for (const c of args.trackingReadiness.checks) {
    items.push({
      label: c.label,
      status: c.status,
      source: `tracking-readiness:${c.kind}`,
    });
  }

  // Creative readiness — must have a first batch.
  if (args.creativeTestingMatrix.recommendedFirstBatch.length === 0) {
    items.push({
      label: "First test batch assembled",
      status: "blocker",
      source: "creative-testing-matrix:first-batch-empty",
    });
  } else {
    items.push({
      label: "First test batch assembled",
      status: "passed",
      source: "creative-testing-matrix:first-batch",
    });
  }

  for (const w of args.creativeTestingMatrix.testingWarnings) {
    items.push({
      label: w.kind === "missing-proof" ? "Proof readiness for first batch" : `Testing warning: ${w.kind}`,
      status: "warning",
      source: `creative-testing-matrix:${w.kind}`,
    });
  }

  return items;
}
