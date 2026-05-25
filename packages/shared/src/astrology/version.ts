// Bump SCORING_MODEL_VERSION whenever you change any of:
//   - aspect orbs / weights
//   - frame weight tables (FRAME_WEIGHTS in synastry.ts)
//   - score-band thresholds in scoring.ts
//   - confidence cap behavior
//
// Persisted alongside `profiles.chart_version` so cached scores can be
// invalidated server-side without forcing a full recompute on read.

export const SCORING_MODEL_VERSION = 1 as const;

export type ScoringModelVersion = typeof SCORING_MODEL_VERSION;
