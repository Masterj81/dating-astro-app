// scripts/test-logic.ts
//
// A tiny zero-framework correctness check for the BigAd engine.
//
// Goal: prove that two materially different inputs produce materially
// different outputs in the sections that drive the customer-facing
// strategy (headlines, angles, positioning, landing hero).
//
// Run: `npm run test:logic`. Exits 0 on success, 1 on failure.

import { buildStrategy } from "../src/lib/engine";
import { ASTRO_DATING_EXAMPLE, NOTION_LIKE_EXAMPLE } from "../src/lib/example";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function expectDifferent(name: string, a: unknown, b: unknown) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  record(name, ja !== jb, ja === jb ? `Both outputs were identical: ${ja.slice(0, 120)}…` : undefined);
}

function expectContains(name: string, haystack: string, needle: string) {
  const ok = haystack.toLowerCase().includes(needle.toLowerCase());
  record(name, ok, ok ? undefined : `Expected to find "${needle}" in: ${haystack.slice(0, 200)}…`);
}

const a = buildStrategy(ASTRO_DATING_EXAMPLE);
const b = buildStrategy(NOTION_LIKE_EXAMPLE);

// 1. Headlines should differ.
expectDifferent("headlines differ between inputs", a.headlines, b.headlines);

// 2. Angles should differ.
expectDifferent("angles differ between inputs", a.angles, b.angles);

// 3. Positioning statement should differ.
expectDifferent("positioning differs between inputs", a.positioning.statement, b.positioning.statement);

// 4. Landing hero should differ.
expectDifferent("landing hero differs between inputs", a.landing.hero, b.landing.hero);

// 5. AstroDating output should NAME the things that make it AstroDating.
const astroBlob = JSON.stringify(a).toLowerCase();
expectContains("astrodating output mentions dating", astroBlob, "dating");
expectContains("astrodating output mentions astrology", astroBlob, "astrology");
expectContains("astrodating output mentions shallow swiping pain", astroBlob, "shallow swiping");
expectContains("astrodating output mentions voice intros differentiator", astroBlob, "voice intros");

// 6. Plotline output should name its own context.
const plotBlob = JSON.stringify(b).toLowerCase();
expectContains("plotline output mentions fiction writers", plotBlob, "fiction writers");
expectContains("plotline output mentions scene-graph differentiator", plotBlob, "scene-graph");

// 7. No section is empty.
record("strategy has 10 headlines", a.headlines.length === 10);
record("strategy has 5 angles", a.angles.length === 5);
record("strategy has 3 tiktok scripts", a.tiktokScripts.length === 3);
record("strategy has 3 facebook ads", a.facebookAds.length === 3);
record("strategy has 5 experiments", a.experiments.length === 5);

// Report.
let failed = 0;
for (const c of checks) {
  const status = c.ok ? "PASS" : "FAIL";
  // Plain ascii, no decorative chars.
  console.log(`[${status}] ${c.name}`);
  if (!c.ok && c.detail) console.log(`        ${c.detail}`);
  if (!c.ok) failed++;
}

console.log("");
console.log(`Total: ${checks.length}  Passed: ${checks.length - failed}  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
