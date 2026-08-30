// Conversation Guide — types.
//
// The selector is pure and UI-agnostic: it returns ordered sections carrying
// an i18n key for the HEADING (localised chrome) and an English body string
// from the static corpus. Mobile and, later, web render the same result.

/** Lowercase sign keys — the convention already used by ZodiacGlyph and the
 *  `SIGNS` list in scripts/validate-mobile-i18n-usage.mjs. */
export type CoachSign =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

/** P0 situations. Four only — see §5.2 of the feature plan for why these four. */
export type CoachSituationKey = 'start' | 'clarity' | 'repair' | 'boundary';

/**
 * `free`   — always readable, no quota, no server call. Exactly one situation
 *            carries this, and it is the habit surface.
 * `locked` — needs an entitlement or the server-granted daily free preview.
 */
export type CoachAccess = 'free' | 'locked';

export interface CoachSituation {
  key: CoachSituationKey;
  access: CoachAccess;
  /** 1-based render order in the situation picker. */
  order: number;
  /** i18n key for the localised label. */
  labelKey: string;
}

export type CoachSectionId = 'rhythm' | 'works' | 'avoid' | 'line' | 'reflect';

export interface CoachSection {
  id: CoachSectionId;
  /** i18n key for the section heading — localised. */
  labelKey: string;
  /** English body from the static corpus. P0 ships English only. */
  body: string;
  /** 1-based render order. */
  order: number;
  /** True for the one section the reader can copy and send. */
  copyable: boolean;
}

export interface CoachCard {
  sign: CoachSign;
  situation: CoachSituationKey;
  access: CoachAccess;
  /** What the reader is actually doing — rendered under the situation title. */
  intent: string;
  sections: CoachSection[];
  /** The sendable line, lifted out so the copy button never has to search. */
  copyText: string;
  /** Always present, never collapsible. */
  disclaimer: string;
}

/** Shape `content.ts` must satisfy. Asserted at compile time in `contract.ts`. */
export interface CoachSignEntry {
  rhythm: string;
  works: string;
  avoid: string;
  lines: Record<CoachSituationKey, string>;
}

export interface CoachSituationFrame {
  intent: string;
  reflect: string;
}

export interface CoachCorpus {
  signs: Record<CoachSign, CoachSignEntry>;
  frames: Record<CoachSituationKey, CoachSituationFrame>;
  disclaimer: string;
}
