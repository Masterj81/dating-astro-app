// Load real edge-function code into vitest.
//
// WHY THIS EXISTS
// ---------------
// The Supabase edge functions are Deno modules: URL imports, `Deno.env` at the
// top level, `serve(...)` at the bottom. None of that runs under Node, so the
// obvious way to test them — paste the logic into a fixture — produces a suite
// that passes forever while the deployed function drifts away from it.
//
// `engine-contract.test.ts` solved that for the ephemeris in September 2026 by
// reading the ACTUAL source, extracting the declarations it needs by brace
// matching, and evaluating that exact text with npm equivalents injected for
// the Deno URL imports. This module is that machinery, factored out, so the
// security suites added for docs/security-audit-2026-09-07.md test the same
// deployed bytes rather than a second copy of them.
//
// THE TWO TRAPS THE BRACE MATCHER EXISTS TO AVOID, both of which truncate
// silently and leave a module that exports nothing for the name you asked for:
//   1. a generic return type carries braces —
//      `Record<string, { longitude: number; … }>`;
//   2. an object-literal return type IS a brace group —
//      `: { iana: string; source: 'input' | 'lookup' | 'fallback' }`.
// Stopping at the first balanced group yields the TYPE. The body is always the
// LAST top-level group before the next declaration, so that is what is taken.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Repository root, from this file's location. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

export function readRepoFile(relativePath: string): string {
  const file = path.join(REPO_ROOT, relativePath);
  if (!existsSync(file)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(file, 'utf8');
}

/**
 * Replace every comment with spaces, preserving length and therefore every
 * index into the original string.
 *
 * WHY THIS IS NOT OPTIONAL
 * -----------------------
 * The brace matcher below skips string literals so a `}` inside a template
 * cannot close a body early. Without masking, it treats a quote inside a
 * COMMENT as the start of a string — and an apostrophe in ordinary prose
 * ("this target's chart") opens a string that only closes at the next quote in
 * real code, which shifts the depth count and makes the matcher return the last
 * `return { … }` object instead of the function body. The emitted module is
 * then a syntax error, or worse, a function missing its closing brace.
 *
 * Masking rather than deleting keeps every offset valid, so the caller can
 * still slice the ORIGINAL source and get real, commented code.
 */
function maskComments(source: string): string {
  const out = source.split('');
  let i = 0;
  let inString: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inString = ch; i += 1; continue; }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      for (; i < stop; i += 1) if (source[i] !== '\n') out[i] = ' ';
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Pull one top-level declaration out of a source file, by name.
 *
 * Recognises `function`, `async function`, `const`, `export function`,
 * `export async function` and `export const` — the edge functions use all six.
 * Comments are masked and string contents skipped, so neither an apostrophe in
 * prose nor a brace in a template literal can close a body early.
 */
export function extractDeclaration(source: string, name: string): string | null {
  // All scanning happens on the masked copy; all slicing on the original.
  const scan = maskComments(source);
  const keywords = [
    'export async function ',
    'export function ',
    'export const ',
    'async function ',
    'function ',
    'const ',
  ];

  let start = -1;
  let isConst = false;
  for (const keyword of keywords) {
    // Literal search rather than a built regex: a `\n` inside a template
    // literal is a real newline and `\b` is a backspace, so a constructed
    // RegExp silently matches nothing. indexOf has no such trap.
    const needle = `\n${keyword}${name}`;
    const at = scan.indexOf(needle);
    if (at < 0) continue;
    // Reject a prefix match: `const PLANET_BODIES_EXTRA` must not answer for
    // `PLANET_BODIES`.
    const after = scan[at + needle.length];
    if (after && /[A-Za-z0-9_$]/.test(after)) continue;
    if (start < 0 || at < start) {
      start = at + 1;
      isConst = keyword.endsWith('const ');
    }
  }
  if (start < 0) return null;

  const boundary = [
    '\nfunction ', '\nconst ', '\nasync function ', '\ntype ', '\ninterface ',
    '\nexport function ', '\nexport const ', '\nexport async function ',
    '\nexport interface ', '\nexport type ',
    '\nserve(', '\nDeno.serve(',
  ]
    .map((marker) => scan.indexOf(marker, start + 1))
    .filter((index) => index > 0);
  const end = boundary.length ? Math.min(...boundary) : scan.length;

  let last: number | null = null;
  let depth = 0;
  let groupOpen: string | null = null;
  let inString: string | null = null;

  for (let i = start; i < end; i++) {
    const ch = scan[i];
    const prev = scan[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (depth === 0 && (ch === '{' || ch === '[')) {
      // A `const` takes its FIRST group (the array/object literal); a function
      // takes its LAST (the body).
      if (isConst && last !== null) break;
      groupOpen = ch;
      depth = 1;
      continue;
    }
    if (groupOpen && ch === groupOpen) depth += 1;
    else if (groupOpen && ch === (groupOpen === '[' ? ']' : '}')) {
      depth -= 1;
      if (depth === 0) {
        last = i;
        groupOpen = null;
      }
    }
  }

  if (last !== null) return source.slice(start, last + 1);

  // A single-expression const with no braces or brackets:
  //   const CHART_DEGREE_QUANTUM = 0.1
  //   const PUBLISH_LEGACY_DEGREES = true
  if (isConst) {
    const line = source.slice(start, end).split('\n')[0];
    if (line.includes('=')) return line.replace(/;?\s*$/, '');
  }
  return null;
}

export interface LoadEdgeModuleOptions {
  /** Repo-relative path of the edge function source. */
  file: string;
  /** Declarations to extract, in dependency order. */
  declarations: readonly string[];
  /** Lines prepended before the extracted code (npm shims for Deno imports). */
  preamble?: readonly string[];
  /** A stable name for the emitted temp module. */
  label: string;
}

/**
 * Scratch directory for the transpiled modules.
 *
 * Unique per process, and that is not decoration. Vitest runs test FILES in
 * parallel workers; with one shared directory, `cleanupEdgeModules()` in a
 * file's `afterAll` deletes the modules another file's `beforeAll` is still
 * writing. The result is an intermittent failure in a security suite — and an
 * intermittently red guard is a guard somebody eventually disables.
 *
 * The pid keeps workers apart; `process.hrtime` keeps two runs of the same pid
 * apart on a machine that recycles pids quickly.
 */
const TMP_ROOT = path.join(
  import.meta.dirname,
  `.edge-source-${process.pid}-${process.hrtime.bigint().toString(36)}`,
);

/**
 * Extract, transpile and import. Throws with the missing names rather than
 * returning a partial namespace — a suite that silently skips proves nothing.
 */
export async function loadEdgeModule<T = Record<string, unknown>>(
  options: LoadEdgeModuleOptions,
): Promise<T> {
  const source = readRepoFile(options.file);
  const parts: string[] = [];
  const missing: string[] = [];

  for (const name of options.declarations) {
    const decl = extractDeclaration(source, name);
    if (!decl) missing.push(name);
    else parts.push(decl);
  }
  if (missing.length) {
    throw new Error(
      `${options.file}: could not extract ${missing.join(', ')}. ` +
      `Either the declaration was renamed or removed — both are findings, not test bugs.`,
    );
  }

  const shim = [
    ...(options.preamble ?? []),
    '',
    // Strip a leading `export` from each extracted declaration. Some of these
    // are exported in the edge source precisely so this suite can reach them,
    // and the single `export { … }` below is what names them — keeping both
    // makes esbuild refuse the module for a duplicate export.
    ...parts.map((decl) => decl.replace(/^export\s+/, '')),
    '',
    `export { ${options.declarations.join(', ')} };`,
  ].join('\n');

  // esbuild rather than a dynamic import of a `.ts` file, which loads outside
  // Vite's transform and yields an empty namespace — also silently.
  const { transform } = await import('esbuild');
  const { code } = await transform(shim, { loader: 'ts', format: 'esm' });

  mkdirSync(TMP_ROOT, { recursive: true });
  const file = path.join(TMP_ROOT, `${options.label}.mjs`);
  writeFileSync(file, code, 'utf8');
  // Cache-bust so a second load in the same process sees fresh code.
  return (await import(`${pathToFileURL(file).href}?v=${Date.now()}`)) as T;
}

/**
 * Transpile and import a whole file. Only valid for modules that touch no Deno
 * global at the top level — `supabase/functions/_shared/cors.ts` is written to
 * that rule on purpose, and this is what enforces it: a stray `Deno.env` here
 * becomes a ReferenceError in the suite.
 */
export async function loadWholeModule<T = Record<string, unknown>>(
  relativePath: string,
  label: string,
): Promise<T> {
  const source = readRepoFile(relativePath);
  const { transform } = await import('esbuild');
  const { code } = await transform(source, { loader: 'ts', format: 'esm' });
  mkdirSync(TMP_ROOT, { recursive: true });
  const file = path.join(TMP_ROOT, `${label}.mjs`);
  writeFileSync(file, code, 'utf8');
  return (await import(`${pathToFileURL(file).href}?v=${Date.now()}`)) as T;
}

/** Remove the temp directory. Call from `afterAll`. */
export function cleanupEdgeModules(): void {
  rmSync(TMP_ROOT, { recursive: true, force: true });
}
