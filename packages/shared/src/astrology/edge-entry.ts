// Entry point for the generated Deno bundle. Nothing imports this from the
// app; `scripts/build-edge-astrology.mjs` bundles it into
// `supabase/functions/_shared/astrology-engine.generated.ts`.
//
// WHY IT EXISTS
// -------------
// Synastry used to be computed in the browser and in the app, from longitudes
// that `get-profile-chart` published at full float64 precision. Those
// longitudes were exactly invertible back to the target's birth instant and
// birth coordinates (docs/security-audit-2026-09-07.md, JUNO-01), so the
// computation had to move to the server — and moving it must not create a
// third copy of the scoring model, because a copy drifts and nothing says so.
//
// So the server runs THE SAME CODE, mechanically derived: esbuild bundles this
// file, `scripts/validate-edge-astrology.mjs` regenerates it in CI and fails on
// any difference. There is one scoring model, in one place, executed in two
// runtimes.
//
// WHAT MAY BE ADDED HERE
// ----------------------
// Only things that are pure arithmetic. The bundle must have ZERO npm
// dependencies — the validator asserts it — because Deno cannot resolve npm
// bare specifiers the way the bundler leaves them. That rules out anything
// reaching `astronomy-engine`, `luxon` or `tz-lookup`. The ephemeris stays in
// the edge functions' own inline copies, which `engine-contract.test.ts`
// already watches.

export { buildSynastryView, formatOrb, hydrateSynastrySide } from './synastry-view';
export { hydrateStoredChart } from './stored';
export { SCORING_MODEL_VERSION } from './version';
export type { SynastryView, SynastryFrameView, SynastryUiBand } from './synastry-view';
