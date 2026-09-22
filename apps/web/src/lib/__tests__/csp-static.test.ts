import { describe, expect, it } from "vitest";

import { ENFORCEMENT_CSP } from "../csp-static";

/**
 * JUNO-13 phase 2 — the static enforced policy (marketing, auth, callback),
 * set by the middleware intl branch from this single source. The /app
 * subtree gets the enforced nonce'd policy (csp-app.ts) instead.
 */
describe("csp-static — the marketing enforcement policy", () => {
  it("keeps the full confinement set", () => {
    expect(ENFORCEMENT_CSP).toContain("default-src 'self'");
    expect(ENFORCEMENT_CSP).toContain("object-src 'none'");
    expect(ENFORCEMENT_CSP).toContain("worker-src 'self'");
    expect(ENFORCEMENT_CSP).toContain("base-uri 'self'");
    expect(ENFORCEMENT_CSP).toContain("form-action 'self'");
    expect(ENFORCEMENT_CSP).toContain("frame-ancestors 'none'");
    // Turnstile trio — the widget must never break (JUNO-07).
    expect(ENFORCEMENT_CSP).toContain("https://challenges.cloudflare.com");
  });

  it("carries NO nonce — noncing is the /app policy's job (phase separation)", () => {
    expect(ENFORCEMENT_CSP).not.toMatch(/'nonce-/);
  });

  it("keeps the Supabase REST + realtime origins reachable", () => {
    expect(ENFORCEMENT_CSP).toContain("https://qtihezzbuubnyvrjdkjd.supabase.co");
    expect(ENFORCEMENT_CSP).toContain("wss://qtihezzbuubnyvrjdkjd.supabase.co");
  });
});
