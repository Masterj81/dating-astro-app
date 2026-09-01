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
// The single entry point the synastry screens use. Keeps mobile and web on
// the same engine, and makes an aspect score impossible to render without
// the aspects (discriminated union).
export * from './synastry-view';
export * from './stored';
// Whether a stored rising sign may be shown at all. Needed because fixing the
// engine does not fix the rows the old Aries fallback already wrote.
export * from './rising';
// Whether houses may be shown at all. Stricter than `rising`: the ascendant
// needs the birth clock, the houses need the clock AND the birthplace.
export * from './houses';
// Drawable coordinates for the chart wheel. Geometry only — the SVG (web)
// and View-based (mobile) renderers share it so the two wheels cannot place
// the same planet in different sectors.
export * from './wheel';
export * from './exploration';
export * from './version';
