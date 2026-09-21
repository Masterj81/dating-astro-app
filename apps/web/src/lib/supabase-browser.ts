import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * JUNO-05 — the browser Supabase client, migrated from localStorage to cookies
 * via the OFFICIAL @supabase/ssr adapter (2026-09-21).
 *
 * BEFORE: createClient (supabase-js) with persistSession:true and no storage
 * adapter — auth-js falls back to `globalThis.localStorage` (key
 * `sb-<ref>-auth-token`), so the session — access AND refresh token — was
 * readable by any injected script (XSS → account takeover, no user gesture).
 *
 * AFTER: createBrowserClient stores the session in COOKIES. Honest property:
 * these cookies are NOT HttpOnly — the browser SDK must read and refresh the
 * tokens from JS, so it writes via document.cookie. What this migration
 * actually buys:
 *   - tokens leave localStorage (no longer trivially readable alongside
 *     other stored data; storage-event snooping across tabs gone);
 *   - Secure; SameSite=Lax; Path=/ (see buildCookieOptions) — the session
 *     cookie is never sent on cross-site POSTs;
 *   - `__Host-` prefix in production (Secure + Path=/ + no Domain, enforced
 *     by the browser prefix contract);
 *   - server-side readability (middleware refresh, future SSR guards).
 * The OTHER half of JUNO-05 — an XSS reading whatever storage holds the
 * session — is closed by the JUNO-13 nonce CSP (no arbitrary inline script
 * execution), not by this cookie. A true HttpOnly model requires a BFF
 * (server-owned tokens); that is a separate, larger migration — documented in
 * docs/runbooks/web-session-csp-2026-09.md, not simulated here.
 *
 * Chunking: sessions exceed the 4 KB per-cookie limit, so @supabase/ssr
 * splits them into `<name>-0`, `<name>-1`, … chunks. That is handled by the
 * adapter; only the base name is configured here.
 *
 * PKCE note: flowType stays "pkce" (createBrowserClient default); the PKCE
 * code_verifier is stored by the same cookie adapter, and
 * exchangeCodeForSession on the callback page reads it from there.
 */

const isProd = process.env.NODE_ENV === "production";

/**
 * Cookie contract, exported for tests and the structural validator.
 * `__Host-` requires: Secure, Path=/, no Domain — the browser enforces the
 * prefix, so misconfiguration fails closed at write time, not silently.
 * Dev (http://localhost) cannot set Secure cookies, hence the plain name
 * and secure:false there.
 */
export function buildCookieOptions() {
  return {
    name: isProd ? "__Host-juno.sb" : "juno.sb",
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}

// Explicit type: `ReturnType<typeof createBrowserClient>` would pick the
// LAST overload of a generic factory and degrade to any at call sites
// (supabase.auth.getSession().then(({ data }) => …) → implicit any).
let supabaseBrowser: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (!supabaseBrowser) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable");
    }

    supabaseBrowser = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookieOptions: buildCookieOptions(),
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
          autoRefreshToken: true,
        },
      },
    );

    // JUNO-05 cleanup: any session left in localStorage by the pre-migration
    // client is dead weight the new client will never read again — and its
    // tokens must not keep sitting in the most readable storage there is.
    // Runs once per page load, before the first render reads cookies.
    if (typeof window !== "undefined") {
      clearLegacySupabaseLocalStorage();
    }
  }

  return supabaseBrowser;
}

/**
 * Remove every Supabase session key the OLD (localStorage) client could have
 * written, on any project ref:
 *   sb-<ref>-auth-token                      (the session itself)
 *   sb-<ref>-auth-token-code-verifier        (the PKCE verifier)
 *   supabase.auth.token[-code-verifier]      (legacy pre-v2 default key)
 * Sessions are NOT migrated (no token is read or copied — only key NAMES are
 * inspected): readers get a clean login, which is the honest state after a
 * storage migration. Unrelated keys are untouched. Idempotent.
 */
export function clearLegacySupabaseLocalStorage() {
  if (typeof window === "undefined") return;
  const LEGACY_KEY =
    /^(sb-.+-auth-token(-code-verifier)?|supabase\.auth\.token(-code-verifier)?)$/;
  try {
    const store = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && LEGACY_KEY.test(key)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Private-mode/blocked storage: nothing to clean, nothing to break.
  }
}
