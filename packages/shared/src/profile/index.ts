// Profile MVP — public surface. Mobile and web both consume from here.
//
// Consumers can import via either:
//   import { PROMPTS, sanitizePromptResponses } from '@astro/shared';
//   import { PROMPTS, sanitizePromptResponses } from '@astro/shared/profile';
//
// The second form is preferred when the consuming file only needs profile
// catalog + sanitizers (more explicit, smaller cognitive surface).

export * from './types';
export * from './catalog';
export * from './sanitizers';
