import type { ProductInput, Strategy } from "@/types/strategy";
import { analyzeAwareness } from "./awareness";
import { analyzeSophistication } from "./sophistication";
import {
  generateCentralPromise,
  generatePositioning,
  generateUniqueMechanism,
} from "./positioning";
import { generateAngles, rankAngles } from "./angles";
import { generateHeadlines } from "./headlines";
import { generateLandingCopy } from "./landing";
import { generateStoreCopy } from "./store";
import { generateFacebookAds, generateTiktokScripts } from "./shorts";
import { generateExperiments } from "./experiments";
import { scoreStrategy } from "./score";
import { diagnoseOffer } from "./diagnosis";
import { generateAwarenessVariants } from "./awareness-variants";
import { detectGenericCopy } from "./generic-guard";
import { recommendOffers } from "./offers";
import { buildCalendar } from "./calendar";
import { generateCreatorBriefs } from "./briefs";
import { generateShotLists } from "./shotlist";
import { generateVideoScripts } from "./scripts-line";
import { generateVariantSets } from "./variants";
import { assessTrackingReadiness } from "./tracking-readiness";
import { buildKpiLadder } from "./kpi-ladder";
import { diagnoseKpi, defaultSnapshotFromInput } from "./kpi-diagnosis";
import { buildAdReviewChecklist, applyAdReview } from "./ad-review";
import { buildJourneyStatus } from "./journey-status";
import { buildCtaBank } from "./cta-bank";
import { buildStaticAdBriefs } from "./static-brief";
import { runCreativeQA } from "./creative-qa";
import { buildEditorHandoffs } from "./editor-handoff";
import { buildAudienceAvatars } from "./audience-avatar";
import { buildHookLibrary } from "./hook-library";
import { buildAdConceptCards } from "./ad-concept-cards";
import { generateExportBrief } from "./export-brief";

// buildStrategy — deterministic local strategy generator. No API calls.
// Future: swap in an LLM adapter (see src/lib/llm.ts) per-section.

export function buildStrategy(input: ProductInput): Strategy {
  const positioning = generatePositioning(input);
  const awarenessNotes = analyzeAwareness(input);
  const sophisticationNotes = analyzeSophistication(input);
  const centralPromise = generateCentralPromise(input);
  const uniqueMechanism = generateUniqueMechanism(input);

  const objections = baseObjections(input);

  const angles = generateAngles(input);
  const rankedAngles = rankAngles(angles);

  // Offer Architect runs before the Calendar so windows can reference
  // a coherent offer kind from the recommendation set.
  const offers = recommendOffers(input);
  const campaignCalendar = buildCalendar(input);

  // Creator Briefs derive from the ranked angles + offer recommendations,
  // so they run after both. Shot Lists then mirror the briefs 1:1.
  const angleNames = rankedAngles.map((a) => a.name);
  const creatorBriefs = generateCreatorBriefs(input, angleNames, offers);
  const shotLists = generateShotLists(creatorBriefs, input);

  // V5 — Execution H1: line-level scripts and per-brief variant sets.
  const videoScripts = generateVideoScripts(creatorBriefs, input);
  const variantSets = generateVariantSets(creatorBriefs, input, offers);

  // V5 — Ops/Data H1: readiness, KPI ladder, synthetic diagnosis, review.
  const trackingReadiness = assessTrackingReadiness(input);
  const kpiLadder = buildKpiLadder(input);
  const defaultSnapshot = defaultSnapshotFromInput(input, kpiLadder);
  const kpiDiagnosis = diagnoseKpi(defaultSnapshot, kpiLadder, input);
  const adReview = buildAdReviewChecklist(input);

  // Applied reviews — one per brief, evaluating the checklist against the
  // realized brief and (when present) its matched video script.
  const appliedAdReviews = creatorBriefs.map((brief) => {
    const matchedScript = videoScripts.find((s) => s.briefId === brief.id);
    return applyAdReview(
      { kind: "brief", brief, videoScript: matchedScript },
      input,
      adReview
    );
  });

  // Journey status is computed last because it synthesises everything above.
  const journeyStatus = buildJourneyStatus({
    trackingReadiness,
    kpiLadder,
    kpiDiagnosis,
    adReview,
    creatorBriefs,
    shotLists,
    videoScripts,
    variantSets,
  });

  // V6 — H2 execution modules. Order matters: CTA bank first, static
  // briefs pull from the CTA bank, QA reads both, handoffs read all of
  // the above plus the applied reviews.
  const ctaBank = buildCtaBank(input, offers, input.campaignType);
  const staticBriefs = buildStaticAdBriefs(creatorBriefs, input, ctaBank);
  const creativeQa = runCreativeQA({
    briefs: creatorBriefs,
    videoScripts,
    shotLists,
    staticBriefs,
    variantSets,
    input,
    ctaBank,
    angles,
  });
  const editorHandoffs = buildEditorHandoffs({
    briefs: creatorBriefs,
    videoScripts,
    shotLists,
    staticBriefs,
    ctaBank,
    variantSets,
    creativeQa,
    appliedAdReviews,
    input,
    offers,
  });

  // Upstream creative-quality modules — avatars feed the hook library,
  // which feeds the concept cards. Ordered after every other module so
  // each can read from offers, briefs, and ranked angles.
  const audienceAvatars = buildAudienceAvatars(input);
  const hookLibrary = buildHookLibrary(input, audienceAvatars, angleNames);
  const adConceptCards = buildAdConceptCards({
    input,
    avatars: audienceAvatars,
    hookLibrary,
    offers,
    rankedAngles: angleNames,
    creatorBriefs,
  });

  const partial: Omit<Strategy, "genericFlags" | "exportBrief"> = {
    positioning,
    awarenessNotes,
    sophisticationNotes,
    centralPromise,
    uniqueMechanism,
    objections,
    headlines: generateHeadlines(input),
    angles,
    rankedAngles,
    landing: generateLandingCopy(input),
    store: generateStoreCopy(input),
    tiktokScripts: generateTiktokScripts(input),
    facebookAds: generateFacebookAds(input),
    experiments: generateExperiments(input),
    score: scoreStrategy(input),
    diagnosis: diagnoseOffer(input),
    awarenessVariants: generateAwarenessVariants(input),
    offers,
    campaignCalendar,
    creatorBriefs,
    shotLists,
    videoScripts,
    variantSets,
    trackingReadiness,
    kpiLadder,
    kpiDiagnosis,
    adReview,
    appliedAdReviews,
    journeyStatus,
    ctaBank,
    staticBriefs,
    creativeQa,
    editorHandoffs,
    audienceAvatars,
    hookLibrary,
    adConceptCards,
  };

  // Generic-copy guard runs against the strategy we just produced. If
  // any banned phrase is present in our own templates, the user sees
  // the flag immediately — which keeps us honest as we expand.
  const genericFlags = detectGenericCopy(partial as Strategy, input);

  const strategy: Strategy = {
    ...partial,
    genericFlags,
    // Export brief is built last so it can reference every section,
    // including the generic-copy flags.
    exportBrief: "",
  };
  strategy.exportBrief = generateExportBrief(input, strategy);

  return strategy;
}

function baseObjections(input: ProductInput) {
  const name = input.name || "this";
  const category = input.category || "the category";
  const differentiator = input.differentiator || "our mechanism";
  return [
    {
      objection: `"How is this different from every other ${category} tool?"`,
      reply: `Most ${category} tools optimize the surface. ${name} replaces that with ${differentiator}, which is where the real shift happens.`,
    },
    {
      objection: `"I don't have time to learn another product."`,
      reply: `${name} is one screen of setup. You can decide if it fits in 5 minutes, not 5 hours.`,
    },
    {
      objection: `"What if it doesn't work for me?"`,
      reply: `Try ${name} for free. If ${differentiator} doesn't change how ${category} feels in the first week, you keep nothing locked in.`,
    },
    {
      objection: `"Is this a fad?"`,
      reply: `The mechanism — ${differentiator} — is not a trend. It's the part of ${category} other products skipped because it was harder to build.`,
    },
  ];
}

export { analyzeAwareness, analyzeSophistication };
export {
  generatePositioning,
  generateCentralPromise,
  generateUniqueMechanism,
} from "./positioning";
export { generateAngles, rankAngles, scoreAngle } from "./angles";
export { generateHeadlines } from "./headlines";
export { generateLandingCopy } from "./landing";
export { generateStoreCopy } from "./store";
export { generateTiktokScripts, generateFacebookAds } from "./shorts";
export { generateExperiments } from "./experiments";
export { scoreStrategy, scoreLabel } from "./score";
export { diagnoseOffer } from "./diagnosis";
export { generateAwarenessVariants } from "./awareness-variants";
export {
  detectGenericCopy,
  detectGenericInText,
  BANNED_PHRASES,
} from "./generic-guard";
export { recommendOffers } from "./offers";
export { computeBreakevenROAS } from "./breakeven";
export { buildCalendar, windowKindLabel } from "./calendar";
export { generateCreatorBriefs } from "./briefs";
export {
  generateShotLists,
  sumShotMidpoints,
  SHOT_DURATION_MIDPOINT,
} from "./shotlist";
export { generateExportBrief } from "./export-brief";
export { critiqueHook } from "./hook-critic";
export { generateVideoScripts } from "./scripts-line";
export {
  generateVariantSets,
  spinAdVariants,
  baseConceptFromBrief,
} from "./variants";
export { assessTrackingReadiness } from "./tracking-readiness";
export { buildKpiLadder } from "./kpi-ladder";
export { diagnoseKpi, defaultSnapshotFromInput } from "./kpi-diagnosis";
export { buildAdReviewChecklist, applyAdReview } from "./ad-review";
export { buildJourneyStatus } from "./journey-status";
export { buildCtaBank } from "./cta-bank";
export { buildStaticAdBriefs } from "./static-brief";
export { runCreativeQA } from "./creative-qa";
export { buildEditorHandoffs } from "./editor-handoff";
export { buildAudienceAvatars } from "./audience-avatar";
export { buildHookLibrary } from "./hook-library";
export { buildAdConceptCards } from "./ad-concept-cards";
