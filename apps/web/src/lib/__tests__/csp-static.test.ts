import { describe, expect, it } from "vitest";

import { ENFORCEMENT_CSP, ENFORCEMENT_CSP_META } from "../csp-static";

/**
 * JUNO-13 phase 1 — the two flavours of the enforced policy.
 *
 * ENFORCEMENT_CSP: response header for marketing paths (middleware intl
 * branch). ENFORCEMENT_CSP_META: document <meta> for the /app subtree —
 * the only shape that survives Vercel's response-header folding (a
 * response CSP overwrites the nonce'd request CSP inside the render;
 * proven 2026-09-22, runbook §6quater).
 */
describe("csp-static — enforcement policies", () => {
  it("keeps the confinement set in both flavours", () => {
    for (const policy of [ENFORCEMENT_CSP, ENFORCEMENT_CSP_META]) {
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("script-src 'self' 'unsafe-inline'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("worker-src 'self'");
      expect(policy).toContain("base-uri 'self'");
      expect(policy).toContain("form-action 'self'");
      // Turnstile trio — the widget must never break (JUNO-07).
      expect(policy).toContain("https://challenges.cloudflare.com");
    }
  });

  it("header flavour enforces frame-ancestors, meta flavour omits it", () => {
    expect(ENFORCEMENT_CSP).toContain("frame-ancestors 'none'");
    expect(ENFORCEMENT_CSP_META).not.toContain("frame-ancestors");
  });

  it("meta flavour is EXACTLY the header flavour minus frame-ancestors", () => {
    const derived = ENFORCEMENT_CSP.split("; ")
      .filter((d) => !d.startsWith("frame-ancestors"))
      .join("; ");
    expect(ENFORCEMENT_CSP_META).toBe(derived);
  });

  it("carries NO nonce — a nonce here would be phase 2 (forbidden)", () => {
    expect(ENFORCEMENT_CSP).not.toMatch(/'nonce-/);
    expect(ENFORCEMENT_CSP_META).not.toMatch(/'nonce-/);
  });

  it("keeps the Supabase realtime/REST origins reachable", () => {
    for (const policy of [ENFORCEMENT_CSP, ENFORCEMENT_CSP_META]) {
      expect(policy).toContain("https://qtihezzbuubnyvrjdkjd.supabase.co");
      expect(policy).toContain("wss://qtihezzbuubnyvrjdkjd.supabase.co");
    }
  });
});
