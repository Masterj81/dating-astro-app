// @astro/shared - Business logic, types, and utilities shared between mobile and web

// Export types
export * from './types';

// Profile MVP catalog + sanitizers (relationship intent, prompts, lifestyle
// tags, personal values, looking-for, icebreaker) — single source of truth
// for both mobile and web.
export * from './profile';

// Export API clients (to be migrated from apps/mobile/services)
// export * from './api';

// Export utilities (to be migrated from apps/mobile/utils)
// export * from './utils';

// Astrology engine lives at the explicit subpath to avoid ambiguous re-exports
// with the legacy top-level `Aspect` shape in src/types/index.ts:
//   import { computeNatalChart, computeSynastry } from '@astro/shared/astrology';
// (Don't re-export from here — the names collide intentionally; the astrology
// module owns the canonical Aspect/BirthChart types.)
