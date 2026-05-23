// Profile MVP — type definitions. Pure types, no runtime, importable from
// both Metro (mobile) and Next.js (web).

export type PromptCategory =
  | 'humor'
  | 'vulnerable'
  | 'astro'
  | 'fun'
  | 'values'
  | 'friendship'
  | 'collaboration';

// Macro connection intentions — the kind of connection a user is open to.
// Persisted in the new `connection_intentions TEXT[]` column on profiles
// (migration 20260601000001). Vocabulary is mirrored by the DB CHECK
// constraint `profiles_connection_intentions_check`.
//
// 'love'       → romantic intent (the existing flavor, default)
// 'friendship' → meaningful friendship / social connection
// 'business'   → working chemistry / collaboration (we never call this
//                category "cofounder finder" or "business partner" —
//                public copy uses "Business" only as the intent name,
//                the insight copy uses "working chemistry")
export type ConnectionIntention = 'love' | 'friendship' | 'business';

export type PromptDef = {
  key: string;
  category: PromptCategory;
  labelKey: string;
};

export type ValueDef = {
  key: string;
  labelKey: string;
  emoji: string;
};

export type LifestyleCategory = 'food' | 'sport' | 'music';

export type LifestyleTagDef = {
  key: string;
  category: LifestyleCategory;
  labelKey: string;
  emoji: string;
};

export type RelationshipIntent = 'serious' | 'exploring' | 'casual' | 'friends' | 'unsure';

export type IntentDef = {
  key: RelationshipIntent;
  emoji: string;
  labelKey: string;
  descriptionKey: string;
};

// Stored shape of `prompts` JSONB column on profiles: array of {key, response}.
export type PromptResponse = {
  key: string;
  response: string;
};
