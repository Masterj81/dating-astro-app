// Conversation Guide — the selector.
//
// Pure, deterministic, side-effect free: same (sign, situation) in, same
// ordered sections out. No clock, no randomness, no network. That is what
// makes the screen trivially testable and what keeps a future daily rotation
// honest (a seed would have to be passed in, never read from Date.now()).
//
// It returns i18n keys for headings and English bodies for content. The screen
// never reaches into the corpus itself.

import { COACH_DISCLAIMER, COACH_SIGN_CONTENT, COACH_SITUATION_FRAMES } from './content';
import { getCoachSituation } from './situations';
import type {
  CoachCard,
  CoachSection,
  CoachSign,
  CoachSituationKey,
} from './types';

/** Section headings, in render order. Bodies come from the corpus. */
const SECTION_LABEL_KEYS: Record<CoachSection['id'], string> = {
  rhythm: 'conversationGuideSectionRhythm',
  works: 'conversationGuideSectionWorks',
  avoid: 'conversationGuideSectionAvoid',
  line: 'conversationGuideSectionLine',
  reflect: 'conversationGuideSectionReflect',
};

export interface CoachCardInput {
  sign: CoachSign;
  situation: CoachSituationKey;
}

/**
 * Build the card for one (sign, situation) pair.
 *
 * Deliberately knows nothing about tier, entitlement or previews: access is a
 * property of the SITUATION (see `situations.ts`), and spending a preview is
 * the screen's job. Keeping the two apart is what guarantees that merely
 * building a card can never consume an allowance.
 */
export function buildCoachCard({ sign, situation }: CoachCardInput): CoachCard {
  const entry = COACH_SIGN_CONTENT[sign];
  if (!entry) throw new Error(`Unknown Conversation Guide sign: ${sign}`);

  const frame = COACH_SITUATION_FRAMES[situation];
  if (!frame) throw new Error(`Unknown Conversation Guide situation: ${situation}`);

  const line = entry.lines[situation];
  if (!line) {
    throw new Error(
      `Conversation Guide corpus is missing the "${situation}" line for ${sign}.`,
    );
  }

  const bodies: Array<{ id: CoachSection['id']; body: string; copyable: boolean }> = [
    { id: 'rhythm', body: entry.rhythm, copyable: false },
    { id: 'works', body: entry.works, copyable: false },
    { id: 'avoid', body: entry.avoid, copyable: false },
    { id: 'line', body: line, copyable: true },
    { id: 'reflect', body: frame.reflect, copyable: false },
  ];

  const sections: CoachSection[] = bodies.map((s, index) => ({
    id: s.id,
    labelKey: SECTION_LABEL_KEYS[s.id],
    body: s.body,
    order: index + 1,
    copyable: s.copyable,
  }));

  return {
    sign,
    situation,
    access: getCoachSituation(situation).access,
    intent: frame.intent,
    sections,
    copyText: line,
    disclaimer: COACH_DISCLAIMER,
  };
}

/**
 * Every string the corpus can ever render, flattened.
 * Used by the content validator so a new field cannot slip past the lint by
 * simply not being enumerated anywhere.
 */
export function allCoachStrings(): Array<{ path: string; value: string }> {
  const out: Array<{ path: string; value: string }> = [
    { path: 'disclaimer', value: COACH_DISCLAIMER },
  ];

  for (const [situation, frame] of Object.entries(COACH_SITUATION_FRAMES)) {
    out.push({ path: `frames.${situation}.intent`, value: frame.intent });
    out.push({ path: `frames.${situation}.reflect`, value: frame.reflect });
  }

  for (const [sign, entry] of Object.entries(COACH_SIGN_CONTENT)) {
    out.push({ path: `signs.${sign}.rhythm`, value: entry.rhythm });
    out.push({ path: `signs.${sign}.works`, value: entry.works });
    out.push({ path: `signs.${sign}.avoid`, value: entry.avoid });
    for (const [situation, line] of Object.entries(entry.lines)) {
      out.push({ path: `signs.${sign}.lines.${situation}`, value: line });
    }
  }

  return out;
}
