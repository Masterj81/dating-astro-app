// Every edge function still parses.
//
// WHY THIS IS NOT REDUNDANT WITH `npm run typecheck`
// --------------------------------------------------
// Turborepo typechecks three workspaces. `supabase/functions` is in none of
// them — the code is Deno, its imports are URLs, and `tsc` would fail on the
// first `https://esm.sh/...` line. So the deployed edge sources are the one
// part of this repository that no compiler looks at, and the failure mode is
// discovering a syntax error from a production 500 after
// `supabase functions deploy`.
//
// Deno is not installed on the developer machine this suite runs on, so this
// parses each file as TypeScript with esbuild — the same parser the rest of the
// security suites use to execute extracted declarations. It catches what the
// gap actually produces (an unbalanced brace, a stray keyword after an edit)
// rather than pretending to be a full Deno type-check.
//
// Added with the first remediation wave, 7 Sep 2026, after that wave touched
// seven of these files.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../../testing/edge-source';

const FUNCTIONS_DIR = path.join(REPO_ROOT, 'supabase/functions');

/** Every .ts file under supabase/functions, including `_shared`. */
function edgeSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) out.push(full);
    }
  };
  walk(FUNCTIONS_DIR);
  return out.sort();
}

const SOURCES = edgeSources();

describe('edge function sources', () => {
  it('finds every function, so a new one cannot skip this suite', () => {
    // A sanity floor rather than an exact count: an added function should not
    // fail the build, but an EMPTY list (a bad path, a renamed directory) must.
    expect(SOURCES.length).toBeGreaterThanOrEqual(20);
    expect(SOURCES.some((f) => f.endsWith(path.join('get-profile-chart', 'index.ts')))).toBe(true);
    expect(SOURCES.some((f) => f.endsWith(path.join('_shared', 'cors.ts')))).toBe(true);
  });

  it.each(SOURCES.map((f) => [path.relative(REPO_ROOT, f).replace(/\\/g, '/'), f]))(
    '%s parses as TypeScript',
    async (_label, file) => {
      const { transform } = await import('esbuild');
      await expect(
        transform(readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' }),
      ).resolves.toBeTruthy();
    },
  );

  it('resolves every relative import to a file that exists', () => {
    // `supabase functions deploy` bundles relative imports and fails at deploy
    // time on a missing one. `_shared/astrology-engine.generated.ts` in
    // particular is a generated file, and a fresh clone that never ran the
    // build script would not have it.
    const missing: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, 'utf8');
      const specifiers = source.match(/from\s+['"](\.[^'"]+)['"]/g) ?? [];
      for (const spec of specifiers) {
        const rel = spec.match(/['"](\.[^'"]+)['"]/)?.[1];
        if (!rel) continue;
        const resolved = path.resolve(path.dirname(file), rel);
        try {
          statSync(resolved);
        } catch {
          missing.push(`${path.relative(REPO_ROOT, file)} → ${rel}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
