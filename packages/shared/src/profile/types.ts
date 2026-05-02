// Profile MVP — type definitions. Pure types, no runtime, importable from
// both Metro (mobile) and Next.js (web).

export type PromptCategory = 'humor' | 'vulnerable' | 'astro' | 'fun' | 'values';

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
