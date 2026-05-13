import type { ProductInput, Strategy } from "@/types/strategy";
import { analyzeAwareness } from "./awareness";
import { analyzeSophistication } from "./sophistication";
import {
  generateCentralPromise,
  generatePositioning,
  generateUniqueMechanism,
} from "./positioning";
import { generateAngles } from "./angles";
import { generateHeadlines } from "./headlines";
import { generateLandingCopy } from "./landing";
import { generateStoreCopy } from "./store";
import { generateFacebookAds, generateTiktokScripts } from "./shorts";
import { generateExperiments } from "./experiments";

// buildStrategy — deterministic local strategy generator. No API calls.
// Future: swap in an LLM adapter (see src/lib/llm.ts) per-section.

export function buildStrategy(input: ProductInput): Strategy {
  const positioning = generatePositioning(input);
  const awarenessNotes = analyzeAwareness(input);
  const sophisticationNotes = analyzeSophistication(input);
  const centralPromise = generateCentralPromise(input);
  const uniqueMechanism = generateUniqueMechanism(input);

  const objections = baseObjections(input);

  return {
    positioning,
    awarenessNotes,
    sophisticationNotes,
    centralPromise,
    uniqueMechanism,
    objections,
    headlines: generateHeadlines(input),
    angles: generateAngles(input),
    landing: generateLandingCopy(input),
    store: generateStoreCopy(input),
    tiktokScripts: generateTiktokScripts(input),
    facebookAds: generateFacebookAds(input),
    experiments: generateExperiments(input),
  };
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
export { generateAngles } from "./angles";
export { generateHeadlines } from "./headlines";
export { generateLandingCopy } from "./landing";
export { generateStoreCopy } from "./store";
export { generateTiktokScripts, generateFacebookAds } from "./shorts";
export { generateExperiments } from "./experiments";
