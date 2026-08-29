// Conversation Guide — public surface.
//
// Imported by mobile as `@astro/shared/coach`. Web parity is P1; the module is
// deliberately platform-free so adding it costs a render layer, not a rewrite.
//
// Design contract, in one line: this module decides WHAT a card says. It never
// decides WHETHER the reader may see it — access is a property of the
// situation, and spending a free preview is the screen's job. Building a card
// can therefore never consume a quota, which is the whole point.
//
// Content provenance and voice rules: see the header of ./content.ts and
// §12.4 of docs/conversation-coach-feature-plan-2026-08.md.

export { COACH_DISCLAIMER, COACH_SIGN_CONTENT, COACH_SITUATION_FRAMES } from './content';
export { COACH_CORPUS } from './contract';
export {
  COACH_FREE_SITUATION,
  COACH_SIGNS,
  COACH_SITUATION_KEYS,
  COACH_SITUATIONS,
  getCoachSituation,
  isCoachSituationLocked,
  resolveCoachSign,
  resolveCoachSituation,
} from './situations';
export { allCoachStrings, buildCoachCard } from './select';
export type {
  CoachAccess,
  CoachCard,
  CoachCorpus,
  CoachSection,
  CoachSectionId,
  CoachSign,
  CoachSignEntry,
  CoachSituation,
  CoachSituationFrame,
  CoachSituationKey,
} from './types';
export type { CoachCardInput } from './select';
