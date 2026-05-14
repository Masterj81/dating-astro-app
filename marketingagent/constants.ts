/**
 * Shared constants for the marketing agent.
 *
 * Kept as a separate module (not inside lib.ts) so test files and dead-code
 * checks can import the data without pulling in filesystem helpers.
 *
 * Philosophy on word lists:
 *   - CORE_BANNED_WORDS is the canonical list used by generation prompts and
 *     by agent.ts's short-post scorer. Keeping it small avoids forcing the
 *     model to work around too many constraints at once.
 *   - VIRAL_EXTRA_BANNED_WORDS layers on top for long-form FB posts where we
 *     want a stricter voice (spartan, no hedging, no setup phrases).
 *   - EXTENDED_SLOP_WORDS is an even stricter superset used by evolve.ts and
 *     the .pi content-scorer extension for off-line quality auditing.
 */

export const CORE_BANNED_WORDS = [
  "delve", "tapestry", "unleash", "game-changer", "game changer",
  "revolutionary", "groundbreaking", "realm", "landscape", "paradigm",
  "synergy", "leverage", "elevate", "foster", "embark", "navigate",
  "robust", "seamless", "holistic", "cutting-edge", "in today's world",
  "it's worth noting", "in conclusion", "furthermore", "moreover",
  "comprehensive", "multifaceted", "pivotal", "transformative",
  "harness", "empower", "streamline", "cutting edge",
];

export const VIRAL_EXTRA_BANNED_WORDS = [
  "can", "may", "just", "very", "really", "literally", "actually", "certainly",
  "probably", "basically", "could", "maybe", "enlightening", "esteemed",
  "shed light", "craft", "crafting", "imagine", "unlock",
  "discover", "skyrocket", "abyss", "you're not alone", "in a world where",
  "revolutionize", "disruptive", "utilize", "utilizing", "dive deep",
  "illuminate", "unveil", "enrich", "intricate", "elucidate", "hence",
  "boost", "bustling", "opened up", "powerful", "inquiries", "ever-evolving",
  "remarkable", "stark", "testament", "in summary", "glimpse into",
];

export const EXTENDED_SLOP_WORDS = [
  ...CORE_BANNED_WORDS,
  "curate", "resonate", "align", "optimize", "ecosystem",
  "deep dive", "double down", "circle back", "move the needle",
  "at the end of the day", "it goes without saying",
];

export const BANNED_WORDS_VIRAL = [
  ...CORE_BANNED_WORDS,
  ...VIRAL_EXTRA_BANNED_WORDS,
];

export const TOPICS = [
  "Zodiac compatibility — which signs match and why",
  "Birth chart education — Sun vs Moon vs Rising, Venus in love",
  "Dating tips through an astrology lens",
  "Sign-specific humor and relatable content",
  "App features — compatibility scores, tarot, horoscopes",
  "Seasonal astrology — retrogrades, eclipses, sign seasons",
  "Zodiac truth — sign-specific personality traits, superpowers, and real struggles",
  "Sign love styles — how each sign loves, what they need in a partner, dating patterns",
  "Best cosmic matches — which signs work best together and why",
  "Tarot and card readings — daily pulls, love spreads, what the cards say about your love life",
  "Planetary placements and transits — Mercury retrograde survival, Venus in signs, Mars energy, moon phases and dating",
];

/** Canonical posting-window hours (local time). Kept as 11/12/19/20 to match
 *  the historical behaviour. Both the dashboard and schedule-server read from
 *  here so the two code paths can't drift. */
export const POSTING_WINDOW_HOURS = [11, 12, 19, 20] as const;

export const POSTS_FILE = "posts.json";
export const MEMORY_FILE = "memory.json";
export const SCHEDULE_FILE = "schedule.json";

export const BLOTATO_API_URL = "https://backend.blotato.com/v2/posts";
