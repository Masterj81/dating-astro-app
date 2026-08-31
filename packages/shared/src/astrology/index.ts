// @astro/shared/astrology — single source of truth for natal chart math,
// timezone correctness, aspect detection, and synastry scoring.
//
// Consumers:
//   import { computeNatalChart, computeSynastry } from '@astro/shared/astrology';
//
// Phase 1 ships astronomy-engine math (Sun/Moon ~1 arc-minute) + the
// timezone correctness layer that fixes the device-tz bug. Swiss Ephemeris
// is intentionally out of scope.

export * from './types';
export * from './time';
export * from './chart';
export * from './orbs';
export * from './aspects';
export * from './scoring';
export * from './synastry';
export * from './stored';
// Whether a stored rising sign may be shown at all. Needed because fixing the
// engine does not fix the rows the old Aries fallback already wrote.
export * from './rising';
// Whether houses may be shown at all. Stricter than `rising`: the ascendant
// needs the birth clock, the houses need the clock AND the birthplace.
export * from './houses';
export * from './exploration';
export * from './version';
