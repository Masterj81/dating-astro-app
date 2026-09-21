/**
 * JUNO-05 — behavioural proof that the web session lives in COOKIES, not in
 * Web Storage (2026-09-21).
 *
 * TRANCHANT: against the PRE-migration client (supabase-js createClient,
 * persistSession:true, no adapter) these tests FAIL — that client persisted
 * the session to localStorage by library default. They run the REAL
 * getSupabaseBrowser() (the one all 37 call sites import) in a real jsdom
 * document: a synthetic, obviously-fake session is set via the public
 * auth.setSession API (no network — auth-js decodes the expiry locally) and
 * the assertions observe WHERE it landed: cookie jar yes, Web Storage never.
 *
 * No real account, no real token: the JWT below is synthetic padding whose
 * only meaningful field is an expiry in the future.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, it } from "vitest";

import {
  buildCookieOptions,
  clearLegacySupabaseLocalStorage,
  getSupabaseBrowser,
} from "@/lib/supabase-browser";

/** Synthetic JWT: header.payload(future exp).signature — base64url, fake. */
function syntheticAccessToken() {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub: "00000000-0000-4000-8000-0000000000aa",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "anon",
  });
  return `${header}.${payload}.synthetic-signature-not-a-real-token`;
}

const LEGACY_KEYS = [
  "sb-qtihezzbuubnyvrjdkjd-auth-token",
  "sb-qtihezzbuubnyvrjdkjd-auth-token-code-verifier",
  "supabase.auth.token",
  "supabase.auth.token-code-verifier",
  "sb-some-other-ref-auth-token",
];

beforeEach(() => {
  // Env required by getSupabaseBrowser (synthetic, obviously not a secret).
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic-ref.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic-anon-key-not-real";
  // setSession (supabase-js 2.114) confirms the user with one GET
  // /auth/v1/user — answer with a synthetic user, zero network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-0000000000aa",
          aud: "authenticated",
          role: "authenticated",
          email: "synthetic@example.invalid",
          app_metadata: { provider: "email" },
          user_metadata: {},
          created_at: "2026-09-21T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )),
  );
  document.cookie = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("JUNO-05 · la session vit dans les cookies, jamais dans Web Storage", () => {
  it("TRANCHANT: setSession → cookies présents, localStorage et sessionStorage VIDES", async () => {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.setSession({
      access_token: syntheticAccessToken(),
      refresh_token: "synthetic-refresh-not-a-real-token",
    });
    expect(error).toBeNull();

    const cookieNames = document.cookie
      .split(";")
      .map((c) => c.split("=")[0].trim())
      .filter(Boolean);
    expect(
      cookieNames.some((n) => n.startsWith("juno.sb")),
      `chunks attendus dans le cookie jar, trouvés: ${cookieNames.join(",")}`,
    ).toBe(true);

    // The JUNO-05 invariant itself — would FAIL against the old client,
    // which wrote sb-<ref>-auth-token to localStorage by default.
    expect(Object.keys(window.localStorage)).toHaveLength(0);
    expect(Object.keys(window.sessionStorage)).toHaveLength(0);
  });

  it("buildCookieOptions: le contrat exact (Secure prod, SameSite=Lax, Path=/, __Host- en prod)", () => {
    const options = buildCookieOptions();
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    // NODE_ENV=test in vitest → dev contract (no __Host-, no Secure:
    // localhost cannot set Secure cookies). The prod branch is asserted by
    // the structural validator against the source, which keys on
    // NODE_ENV === "production".
    expect(options.secure).toBe(false);
    expect(options.name).toBe("juno.sb");
    expect(options.name).not.toContain("__Host-"); // dev contract
  });
});

describe("JUNO-05 · purge des sessions legacy localStorage", () => {
  it("supprime exactement les clés Supabase legacy, conserve le reste, idempotent", () => {
    window.localStorage.setItem("preferred_language", "fr");
    window.localStorage.setItem("coach:preview-date:some-user", "2026-09-21");
    for (const key of LEGACY_KEYS) window.localStorage.setItem(key, "synthetic-legacy-value");

    clearLegacySupabaseLocalStorage();

    const remaining = Object.keys(window.localStorage).sort();
    expect(remaining).toEqual(["coach:preview-date:some-user", "preferred_language"]);

    // Idempotent: a second pass changes nothing and throws nothing.
    clearLegacySupabaseLocalStorage();
    expect(Object.keys(window.localStorage).sort()).toEqual(remaining);
  });

  it("après un nouveau login, aucune clé sb-*-auth-token ne réapparaît dans localStorage", async () => {
    for (const key of LEGACY_KEYS) window.localStorage.setItem(key, "synthetic-legacy-value");

    // A FRESH page load: reset modules so getSupabaseBrowser builds a new
    // client — whose constructor runs the legacy cleanup, exactly like a
    // reader returning to the site after the migration deploy.
    vi.resetModules();
    const { getSupabaseBrowser: freshClient } = await import("@/lib/supabase-browser");
    const supabase = freshClient();
    await supabase.auth.setSession({
      access_token: syntheticAccessToken(),
      refresh_token: "synthetic-refresh-not-a-real-token",
    });
    expect(
      Object.keys(window.localStorage).filter((k) => /auth-token|supabase\.auth/.test(k)),
    ).toHaveLength(0);
  });
});
