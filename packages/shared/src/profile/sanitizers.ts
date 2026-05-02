// Profile MVP — sanitizers and lookup helpers. Pure functions, no I/O.
// Both reads and writes go through these so a stale or buggy client cannot
// trip the DB CHECK constraints with an opaque Postgres error.

import {
  LIFESTYLE_TAGS,
  MAX_LIFESTYLE_TAGS,
  MAX_PROMPT_RESPONSE_LENGTH,
  MAX_PROMPTS,
  MAX_VALUES,
  PERSONAL_VALUES,
  PROMPTS,
  RELATIONSHIP_INTENTS,
} from './catalog';
import type {
  IntentDef,
  LifestyleTagDef,
  PromptDef,
  PromptResponse,
  RelationshipIntent,
  ValueDef,
} from './types';

// ── Lookup helpers ──────────────────────────────────────────────────────────

export const findPrompt = (key: string): PromptDef | undefined =>
  PROMPTS.find(p => p.key === key);

export const findValue = (key: string): ValueDef | undefined =>
  PERSONAL_VALUES.find(v => v.key === key);

export const findLifestyleTag = (key: string): LifestyleTagDef | undefined =>
  LIFESTYLE_TAGS.find(t => t.key === key);

export const findIntent = (key: string | null | undefined): IntentDef | undefined =>
  RELATIONSHIP_INTENTS.find(i => i.key === key);

// Type guard for stored relationship_intent strings — narrows `unknown` from
// a Supabase response to the strict union type without an unsafe cast.
export const isRelationshipIntent = (v: unknown): v is RelationshipIntent =>
  typeof v === 'string' && RELATIONSHIP_INTENTS.some(i => i.key === v);

// ── Sanitizers ──────────────────────────────────────────────────────────────

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
