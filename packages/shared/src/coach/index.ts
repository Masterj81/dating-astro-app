// Conversation Guide — public surface.
//
// Imported by BOTH platforms as `@astro/shared/coach`:
//   mobile  apps/mobile/app/premium-screens/conversation-guide.tsx
//   web     apps/web/src/components/ConversationGuideOverview.tsx
// Being platform-free is what made the web port a render layer rather than a
// rewrite — the situation table, the free/locked split and the card builder
// are shared, so the two surfaces cannot disagree about which situation is
// free. Keep it that way: no React, no React Native, no storage, no network.
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
