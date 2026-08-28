// Bump SCORING_MODEL_VERSION whenever you change any of:
//   - aspect orbs / weights (BASE_ORBS + modifiers in ./orbs.ts)
//   - frame weight tables (FRAME_WEIGHTS in synastry.ts)
//   - score-band thresholds in scoring.ts
//   - confidence cap behavior
//
// Persisted alongside `profiles.chart_version` so cached scores can be
// invalidated server-side without forcing a full recompute on read.
//
// History:
//   v1 — initial shared engine. Fixed orbs: conj 8 / sextile 6 / square 7 /
//        trine 8 / opposition 8, no body-aware modifiers.
//   v2 — centralized orb policy (./orbs.ts): trine 8→7, sextile 6→5,
//        +1° luminary bonus, −2° outer-outer tightening. Outer planets
//        (Uranus/Neptune/Pluto) added to charts and exposed as
//        interpretive-only synastry aspects (contribution 0 — FRAME_WEIGHTS
//        untouched). Frame scores can shift by a few points where a trine
//        sat at orb 7–8, a sextile at 5–6, or a luminary aspect at orb 8–9.

export const SCORING_MODEL_VERSION = 2 as const;

export type ScoringModelVersion = typeof SCORING_MODEL_VERSION;
