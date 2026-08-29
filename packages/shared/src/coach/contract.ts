// Compile-time shape check for the Conversation Guide corpus.
//
// `content.ts` deliberately imports nothing so that
// `scripts/validate-coach-content.mjs` can load it through Node's native
// TypeScript stripping (which does not resolve module specifiers). That would
// normally cost the corpus its type safety — this file buys it back without
// adding an import to `content.ts`.
//
// A missing sign, a missing situation line, or a stray field fails
// `npm run typecheck` here rather than at runtime on a user's phone.

import { COACH_DISCLAIMER, COACH_SIGN_CONTENT, COACH_SITUATION_FRAMES } from './content';
import type {
  CoachCorpus,
  CoachSign,
  CoachSignEntry,
  CoachSituationFrame,
  CoachSituationKey,
} from './types';

const SIGNS: Record<CoachSign, CoachSignEntry> = COACH_SIGN_CONTENT;
const FRAMES: Record<CoachSituationKey, CoachSituationFrame> = COACH_SITUATION_FRAMES;

/** The corpus, re-exported under its checked shape. */
export const COACH_CORPUS: CoachCorpus = {
  signs: SIGNS,
  frames: FRAMES,
  disclaimer: COACH_DISCLAIMER,
};
