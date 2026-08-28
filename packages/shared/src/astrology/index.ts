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
export * from './exploration';
export * from './version';
