// Static catalog for the MVP profile redesign.
//
// Each entry uses a stable `key` plus an i18n `labelKey` resolved by the
// LanguageContext at render time. Adding a new entry requires:
//   1. appending it here
//   2. adding the matching `labelKey` to every locale file
// (fr/en are the source of truth — the other 6 locales fall back to en.)
//
// The `key` values are persisted in Postgres (via TEXT[] columns or the
// JSONB `prompts` array). Renaming a key is a data migration — don't do it
// casually.

// ── Prompts ─────────────────────────────────────────────────────────────────
// 30 prompts grouped by theme. Users pick 3 in the MVP.
// Categories: humor / vulnerable / astro / fun / values

export type PromptCategory = 'humor' | 'vulnerable' | 'astro' | 'fun' | 'values';

export type PromptDef = {
  key: string;
  category: PromptCategory;
  labelKey: string;
};

// Order = display order in the picker. Each entry has its i18n labelKey.
export const PROMPT_CATEGORIES: readonly { id: PromptCategory; labelKey: string }[] = [
  { id: 'humor',      labelKey: 'prompt_cat_humor' },
  { id: 'vulnerable', labelKey: 'prompt_cat_vulnerable' },
  { id: 'astro',      labelKey: 'prompt_cat_astro' },
  { id: 'fun',        labelKey: 'prompt_cat_fun' },
  { id: 'values',     labelKey: 'prompt_cat_values' },
] as const;

export const PROMPTS: readonly PromptDef[] = [
  // Humor — light, self-aware
  { key: 'red_flag_assumed',     category: 'humor',      labelKey: 'prompt_red_flag_assumed' },
  { key: 'guilty_pleasure',      category: 'humor',      labelKey: 'prompt_guilty_pleasure' },
  { key: 'ridiculous_debate',    category: 'humor',      labelKey: 'prompt_ridiculous_debate' },
  { key: 'hill_to_die_on',       category: 'humor',      labelKey: 'prompt_hill_to_die_on' },
  { key: 'irrational_fear',      category: 'humor',      labelKey: 'prompt_irrational_fear' },
  { key: 'unpopular_opinion',    category: 'humor',      labelKey: 'prompt_unpopular_opinion' },

  // Vulnerable — softer, deeper
  { key: 'what_moves_me',        category: 'vulnerable', labelKey: 'prompt_what_moves_me' },
  { key: 'feel_seen_when',       category: 'vulnerable', labelKey: 'prompt_feel_seen_when' },
  { key: 'recharge_by',          category: 'vulnerable', labelKey: 'prompt_recharge_by' },
  { key: 'love_lang_action',     category: 'vulnerable', labelKey: 'prompt_love_lang_action' },
  { key: 'lesson_learned',       category: 'vulnerable', labelKey: 'prompt_lesson_learned' },
  { key: 'i_value_most',         category: 'vulnerable', labelKey: 'prompt_i_value_most' },

  // Astro — signature of the app
  { key: 'sign_spoke_loud',      category: 'astro',      labelKey: 'prompt_sign_spoke_loud' },
  { key: 'moon_says',            category: 'astro',      labelKey: 'prompt_moon_says' },
  { key: 'venus_in_love',        category: 'astro',      labelKey: 'prompt_venus_in_love' },
  { key: 'mars_when_angry',      category: 'astro',      labelKey: 'prompt_mars_when_angry' },
  { key: 'astro_cliche_true',    category: 'astro',      labelKey: 'prompt_astro_cliche_true' },
  { key: 'astro_cliche_false',   category: 'astro',      labelKey: 'prompt_astro_cliche_false' },

  // Fun — light prompts that spark conversation
  { key: 'perfect_sunday',       category: 'fun',        labelKey: 'prompt_perfect_sunday' },
  { key: 'last_song_loop',       category: 'fun',        labelKey: 'prompt_last_song_loop' },
  { key: 'rabbit_hole_topic',    category: 'fun',        labelKey: 'prompt_rabbit_hole_topic' },
  { key: 'three_things_kitchen', category: 'fun',        labelKey: 'prompt_three_things_kitchen' },
  { key: 'dream_dinner_guest',   category: 'fun',        labelKey: 'prompt_dream_dinner_guest' },
  { key: 'unreasonably_proud',   category: 'fun',        labelKey: 'prompt_unreasonably_proud' },

  // Values — what matters
  { key: 'non_negotiable',       category: 'values',     labelKey: 'prompt_non_negotiable' },
  { key: 'best_advice',          category: 'values',     labelKey: 'prompt_best_advice' },
  { key: 'currently_learning',   category: 'values',     labelKey: 'prompt_currently_learning' },
  { key: 'what_i_admire',        category: 'values',     labelKey: 'prompt_what_i_admire' },
  { key: 'making_world_better',  category: 'values',     labelKey: 'prompt_making_world_better' },
  { key: 'where_in_5y',          category: 'values',     labelKey: 'prompt_where_in_5y' },
] as const;

export const MAX_PROMPTS = 3;

// ── Personal values ─────────────────────────────────────────────────────────
// 12 pre-defined values. Users pick up to 5.

export type ValueDef = {
  key: string;
  labelKey: string;
  emoji: string;
};

export const PERSONAL_VALUES: readonly ValueDef[] = [
  { key: 'family',         labelKey: 'value_family',         emoji: '👨‍👩‍👧' },
  { key: 'independence',   labelKey: 'value_independence',   emoji: '🦋' },
  { key: 'growth',         labelKey: 'value_growth',         emoji: '🌱' },
  { key: 'creativity',     labelKey: 'value_creativity',     emoji: '🎨' },
  { key: 'spirituality',   labelKey: 'value_spirituality',   emoji: '✨' },
  { key: 'justice',        labelKey: 'value_justice',        emoji: '⚖️' },
  { key: 'adventure',      labelKey: 'value_adventure',      emoji: '🌍' },
  { key: 'stability',      labelKey: 'value_stability',      emoji: '🏡' },
  { key: 'humor',          labelKey: 'value_humor',          emoji: '😄' },
  { key: 'authenticity',   labelKey: 'value_authenticity',   emoji: '💎' },
  { key: 'kindness',       labelKey: 'value_kindness',       emoji: '🤝' },
  { key: 'ambition',       labelKey: 'value_ambition',       emoji: '🚀' },
] as const;

export const MAX_VALUES = 5;

// ── Lifestyle tags ──────────────────────────────────────────────────────────
// Stored in the existing `interests` TEXT[] column. Grouped by category for
// the UI but flattened on persist. Users pick up to 12 across all categories
// (the cap is enforced client-side).

export type LifestyleCategory = 'food' | 'sport' | 'music';

export type LifestyleTagDef = {
  key: string;
  category: LifestyleCategory;
  labelKey: string;
  emoji: string;
};

export const LIFESTYLE_TAGS: readonly LifestyleTagDef[] = [
  // Food (12)
  { key: 'food_pasta',       category: 'food',  labelKey: 'tag_food_pasta',       emoji: '🍝' },
  { key: 'food_sushi',       category: 'food',  labelKey: 'tag_food_sushi',       emoji: '🍣' },
  { key: 'food_brunch',      category: 'food',  labelKey: 'tag_food_brunch',      emoji: '🥞' },
  { key: 'food_streetfood',  category: 'food',  labelKey: 'tag_food_streetfood',  emoji: '🌮' },
  { key: 'food_healthy',     category: 'food',  labelKey: 'tag_food_healthy',     emoji: '🥗' },
  { key: 'food_meat',        category: 'food',  labelKey: 'tag_food_meat',        emoji: '🥩' },
  { key: 'food_veggie',      category: 'food',  labelKey: 'tag_food_veggie',      emoji: '🥦' },
  { key: 'food_spicy',       category: 'food',  labelKey: 'tag_food_spicy',       emoji: '🌶️' },
  { key: 'food_comfort',     category: 'food',  labelKey: 'tag_food_comfort',     emoji: '🍕' },
  { key: 'food_cheese',      category: 'food',  labelKey: 'tag_food_cheese',      emoji: '🧀' },
  { key: 'food_pastry',      category: 'food',  labelKey: 'tag_food_pastry',      emoji: '🥐' },
  { key: 'food_coffee',      category: 'food',  labelKey: 'tag_food_coffee',      emoji: '☕' },

  // Sport / activity (12)
  { key: 'sport_running',    category: 'sport', labelKey: 'tag_sport_running',    emoji: '🏃' },
  { key: 'sport_yoga',       category: 'sport', labelKey: 'tag_sport_yoga',       emoji: '🧘' },
  { key: 'sport_gym',        category: 'sport', labelKey: 'tag_sport_gym',        emoji: '🏋️' },
  { key: 'sport_hiking',     category: 'sport', labelKey: 'tag_sport_hiking',     emoji: '🥾' },
  { key: 'sport_football',   category: 'sport', labelKey: 'tag_sport_football',   emoji: '⚽' },
  { key: 'sport_dance',      category: 'sport', labelKey: 'tag_sport_dance',      emoji: '💃' },
  { key: 'sport_climbing',   category: 'sport', labelKey: 'tag_sport_climbing',   emoji: '🧗' },
  { key: 'sport_swimming',   category: 'sport', labelKey: 'tag_sport_swimming',   emoji: '🏊' },
  { key: 'sport_cycling',    category: 'sport', labelKey: 'tag_sport_cycling',    emoji: '🚴' },
  { key: 'sport_surf',       category: 'sport', labelKey: 'tag_sport_surf',       emoji: '🏄' },
  { key: 'sport_tennis',     category: 'sport', labelKey: 'tag_sport_tennis',     emoji: '🎾' },
  { key: 'sport_skiing',     category: 'sport', labelKey: 'tag_sport_skiing',     emoji: '⛷️' },

  // Music (12)
  { key: 'music_rap',        category: 'music', labelKey: 'tag_music_rap',        emoji: '🎤' },
  { key: 'music_pop',        category: 'music', labelKey: 'tag_music_pop',        emoji: '🎵' },
  { key: 'music_electro',    category: 'music', labelKey: 'tag_music_electro',    emoji: '🎧' },
  { key: 'music_classical',  category: 'music', labelKey: 'tag_music_classical',  emoji: '🎻' },
  { key: 'music_jazz',       category: 'music', labelKey: 'tag_music_jazz',       emoji: '🎷' },
  { key: 'music_indie',      category: 'music', labelKey: 'tag_music_indie',      emoji: '🎸' },
  { key: 'music_latino',     category: 'music', labelKey: 'tag_music_latino',     emoji: '💃' },
  { key: 'music_kpop',       category: 'music', labelKey: 'tag_music_kpop',       emoji: '🌟' },
  { key: 'music_metal',      category: 'music', labelKey: 'tag_music_metal',      emoji: '🤘' },
  { key: 'music_rnb',        category: 'music', labelKey: 'tag_music_rnb',        emoji: '🎶' },
  { key: 'music_rock',       category: 'music', labelKey: 'tag_music_rock',       emoji: '🥁' },
  { key: 'music_lofi',       category: 'music', labelKey: 'tag_music_lofi',       emoji: '🎼' },
] as const;

export const MAX_LIFESTYLE_TAGS = 12;

export const LIFESTYLE_CATEGORIES: readonly { id: LifestyleCategory; emoji: string; labelKey: string }[] = [
  { id: 'food',  emoji: '🍽️', labelKey: 'lifestyle_food'  },
  { id: 'sport', emoji: '🏃', labelKey: 'lifestyle_sport' },
  { id: 'music', emoji: '🎵', labelKey: 'lifestyle_music' },
] as const;

// ── Relationship intent ─────────────────────────────────────────────────────
// Required field for new saves. Vocabulary mirrored in DB CHECK constraint.

export type RelationshipIntent = 'serious' | 'exploring' | 'casual' | 'friends' | 'unsure';

export type IntentDef = {
  key: RelationshipIntent;
  emoji: string;
  labelKey: string;
  descriptionKey: string;
};

export const RELATIONSHIP_INTENTS: readonly IntentDef[] = [
  { key: 'serious',   emoji: '💍', labelKey: 'intent_serious',   descriptionKey: 'intent_serious_desc' },
  { key: 'exploring', emoji: '✨', labelKey: 'intent_exploring', descriptionKey: 'intent_exploring_desc' },
  { key: 'casual',    emoji: '🌙', labelKey: 'intent_casual',    descriptionKey: 'intent_casual_desc' },
  { key: 'friends',   emoji: '🤝', labelKey: 'intent_friends',   descriptionKey: 'intent_friends_desc' },
  { key: 'unsure',    emoji: '🤔', labelKey: 'intent_unsure',    descriptionKey: 'intent_unsure_desc' },
] as const;

// ── Field length caps (mirror DB CHECK constraints) ─────────────────────────

export const MAX_LOOKING_FOR_TEXT_LENGTH = 200;
export const MAX_ICEBREAKER_LENGTH = 80;
export const MAX_PROMPT_RESPONSE_LENGTH = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

export const findPrompt = (key: string): PromptDef | undefined =>
  PROMPTS.find(p => p.key === key);

export const findValue = (key: string): ValueDef | undefined =>
  PERSONAL_VALUES.find(v => v.key === key);

export const findLifestyleTag = (key: string): LifestyleTagDef | undefined =>
  LIFESTYLE_TAGS.find(t => t.key === key);

export const findIntent = (key: string | null | undefined): IntentDef | undefined =>
  RELATIONSHIP_INTENTS.find(i => i.key === key);

// Type guard for stored relationship_intent strings — pairs with the DB
// CHECK constraint vocabulary so callers can narrow `unknown` from a Supabase
// response to the strict union type without an unsafe cast.
export const isRelationshipIntent = (v: unknown): v is RelationshipIntent =>
  typeof v === 'string' && RELATIONSHIP_INTENTS.some(i => i.key === v);

// Stored shape of `prompts` JSONB column: array of {key, response}.
export type PromptResponse = {
  key: string;
  response: string;
};

// Defends both reads (DB → UI: drop unknown/duplicated keys, truncate over-long
// responses) and writes (UI → DB: ensure payload satisfies the
// profiles_prompts_shape_check CHECK constraint so a stale or buggy client
// can't trigger an opaque Postgres error on save).
export const sanitizePromptResponses = (raw: unknown): PromptResponse[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { key: unknown; response: unknown } =>
      !!item && typeof item === 'object' && 'key' in item && 'response' in item
    )
    .map(item => ({
      key: typeof item.key === 'string' ? item.key : '',
      response: typeof item.response === 'string'
        ? item.response.slice(0, MAX_PROMPT_RESPONSE_LENGTH)
        : '',
    }))
    .filter(item => item.key && findPrompt(item.key))
    .filter((item, idx, arr) => arr.findIndex(x => x.key === item.key) === idx)
    .slice(0, MAX_PROMPTS);
};

// Sibling sanitizers for the array-shaped fields. Same posture as
// sanitizePromptResponses: drop unknown keys, dedupe, cap to MAX_*.
export const sanitizePersonalValues = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string' && !!findValue(v))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, MAX_VALUES);
};

export const sanitizeLifestyleTags = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === 'string' && !!findLifestyleTag(v))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, MAX_LIFESTYLE_TAGS);
};
