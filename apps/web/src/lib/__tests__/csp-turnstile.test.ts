/**
 * JUNO-07 — the CSP must let the Turnstile widget load, and nothing more.
 *
 * WHY THIS EXISTS (Preview smoke, 2026-09-17)
 * -------------------------------------------
 * The hardened contact form shipped with the widget's script blocked:
 *
 *   https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit
 *   → refused by script-src-elem 'self' 'unsafe-inline' https://va.vercel-scripts.com
 *
 * and `frame-src 'none'` would have refused the challenge iframe next. The
 * minimal Cloudflare-documented fix is exactly three allowances, all scoped
 * to the single origin: script-src, script-src-elem, frame-src.
 *
 * This suite fails if ANY of the three disappears, and equally if someone
 * "fixes" it the wrong way: a wildcard, a broader frame-src, the origin
 * pasted in connect-src (siteverify is SERVER-side — the browser never needs
 * it), or the CSP/XFO protections weakened to make the widget "work".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 2026-09-22 (JUNO-13 phase 2): the enforced CSP moved from next.config.ts
// headers() to src/lib/csp-static.ts, applied by the middleware — a config
// CSP gets folded by Vercel into /app render requests and kills the nonce
// (runbook §6quater). Same contract, new home.
const CONFIG = readFileSync(
  path.resolve(process.cwd(), "src/lib/csp-static.ts"),
  "utf8",
);
const ORIGIN = "https://challenges.cloudflare.com";

/** The cspDirectives array, isolated so line assertions cannot be fooled by
 *  comments elsewhere in the file. */
const directivesAt = CONFIG.indexOf("const cspDirectives = [");
const directivesBlock = CONFIG.slice(
  directivesAt,
  CONFIG.indexOf("];", directivesAt),
);
const directivesLines = directivesBlock
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("`"));

describe("JUNO-07 · CSP Turnstile — les trois autorisations exactes", () => {
  it("l'origine est déclarée UNE fois, comme constante exacte (aucun wildcard)", () => {
    expect(CONFIG).toContain(`const TURNSTILE_ORIGIN = "${ORIGIN}"`);
    expect(CONFIG).not.toContain(`${ORIGIN}/*`);
    expect(CONFIG).not.toContain("https://*");
  });

  it("script-src inclut TURNSTILE_ORIGIN", () => {
    const line = directivesLines.find((l) => l.startsWith("`script-src "));
    expect(line, "directive script-src introuvable").toBeDefined();
    expect(line).toContain("${TURNSTILE_ORIGIN}");
  });

  it("script-src-elem inclut TURNSTILE_ORIGIN", () => {
    const line = directivesLines.find((l) => l.startsWith("`script-src-elem "));
    expect(line, "directive script-src-elem introuvable").toBeDefined();
    expect(line).toContain("${TURNSTILE_ORIGIN}");
  });

  it("frame-src est limité à TURNSTILE_ORIGIN SEUL — plus 'none', rien d'autre", () => {
    const line = directivesLines.find((l) => l.startsWith("`frame-src "));
    expect(line, "directive frame-src introuvable").toBeDefined();
    // Virgule de fin de tableau retirée avant la comparaison stricte.
    expect(line!.replace(/,$/, "")).toBe("`frame-src ${TURNSTILE_ORIGIN}`");
  });

  it("connect-src ne contient PAS l'origine (siteverify est côté serveur)", () => {
    const line = directivesLines.find((l) => l.startsWith("`connect-src "));
    expect(line).toBeDefined();
    expect(line).not.toContain("TURNSTILE");
    expect(line).not.toContain("challenges.cloudflare.com");
  });

  it("la CSP reste présente et X-Frame-Options reste DENY", () => {
    expect(directivesAt).toBeGreaterThan(0);
    expect(directivesLines.length).toBeGreaterThanOrEqual(10);
    // La CSP vit ici (csp-static.ts) ; X-Frame-Options reste un header de
    // réponse dans next.config.ts (toutes routes).
    const nextConfig = readFileSync(
      path.resolve(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(nextConfig).toContain("{ key: 'X-Frame-Options', value: 'DENY' }");
    expect(CONFIG).toContain("export const ENFORCEMENT_CSP");
  });

  it("exactement TROIS usages de TURNSTILE_ORIGIN dans les directives — pas un de plus", () => {
    const uses = directivesLines.filter((l) => l.includes("${TURNSTILE_ORIGIN}"));
    expect(uses).toHaveLength(3);
  });
});
