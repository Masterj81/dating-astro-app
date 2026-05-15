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
