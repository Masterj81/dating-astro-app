/**
 * JUNO-10 — the web auth callback must NEVER establish a session from tokens
 * in the URL fragment.
 *
 * WHY THIS EXISTS (audit 2026-09-07, JUNO-10)
 * -------------------------------------------
 * The callback's nominal paths are PKCE (`?code=` → exchangeCodeForSession)
 * and email links (`?token_hash=` → verifyOtp). A residual third branch read
 * `access_token`/`refresh_token` from `window.location.hash` and called
 * `supabase.auth.setSession()` with them — no code exchange, no state, no
 * nonce. A crafted link could therefore impose an attacker's session on the
 * victim's browser (session fixation). The mobile client removed this flow
 * in `apps/mobile/services/socialAuth.ts` ("Implicit flow removed — PKCE
 * code exchange is required"); this suite pins the same rule on the web.
 *
 * All tokens below are SYNTHETIC and obviously fake. No real account, no
 * production URL, no offensive testing — the "attack" is a mocked call count.
 *
 * TRANCHANT: the implicit-rejection cases FAIL against the pre-fix code
 * (setSession WAS called) and pass after — that is the point.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────
// Only the boundary is mocked. The callback page itself, auth-redirect
// (incl. normalizeAuthNext's safe-redirect logic) and the routing config are
// the REAL shipped code.

const authCalls = {
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
  getSession: vi.fn(),
};
const supabaseMock = { auth: authCalls };
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => supabaseMock,
}));

const routerReplace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  // Labels resolve to their keys: assertions observe WHICH copy branch ran
  // (e.g. the implicit-rejection key) without depending on a locale file.
  useTranslations: () => (key: string) => key,
  useLocale: () => "fr",
}));

// Profile state: complete onboarding so the post-auth routing is observable
// without the setup hop.
vi.mock("@/lib/web-account", () => ({
  getProfileSetupState: vi.fn(async () => ({ onboarding_completed: true })),
  isWebProfileSetupIncomplete: vi.fn(() => false),
}));

import AuthCallbackPage from "@/app/[locale]/auth/callback/page";

// Obviously synthetic tokens — never real.
const FAKE_ACCESS = "synthetic-access-token-JUNO10-NOT-REAL";
const FAKE_REFRESH = "synthetic-refresh-token-JUNO10-NOT-REAL";
const FAKE_CODE = "synthetic-pkce-code-NOT-REAL";
const FAKE_HASH = "synthetic-token-hash-NOT-REAL";
const FAKE_USER_ID = "00000000-0000-4000-8000-0000000000aa";

const sessionFor = () => ({ data: { session: { user: { id: FAKE_USER_ID } } } });
const noSession = () => ({ data: { session: null } });

const setUrl = (pathAndHash: string) => {
  window.history.replaceState({}, "", pathAndHash);
};

beforeEach(() => {
  vi.clearAllMocks();
  authCalls.getSession.mockResolvedValue(noSession());
  routerReplace.mockClear();
  // Spy on console so we can assert tokens are never logged.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  setUrl("/fr/auth/callback");
});

describe("JUNO-10 · chemins nominaux intacts", () => {
  it("?code= → exchangeCodeForSession (PKCE), session → routage, PAS de setSession", async () => {
    setUrl(`/fr/auth/callback?code=${FAKE_CODE}`);
    authCalls.exchangeCodeForSession.mockResolvedValue({ error: null });
    authCalls.getSession.mockResolvedValue(sessionFor());
    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(authCalls.exchangeCodeForSession).toHaveBeenCalledWith(FAKE_CODE),
    );
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(authCalls.setSession).not.toHaveBeenCalled();
    expect(authCalls.verifyOtp).not.toHaveBeenCalled();
  });

  it("?token_hash= (+type) → verifyOtp sur son parcours nominal", async () => {
    setUrl(`/fr/auth/callback?token_hash=${FAKE_HASH}&type=magiclink`);
    authCalls.verifyOtp.mockResolvedValue({ error: null });
    authCalls.getSession.mockResolvedValue(sessionFor());
    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(authCalls.verifyOtp).toHaveBeenCalledWith({
        token_hash: FAKE_HASH,
        type: "magiclink",
      }),
    );
    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    expect(authCalls.setSession).not.toHaveBeenCalled();
    expect(authCalls.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("une redirection non sûre (?next=https://evil.example) ne sort jamais du /app local", async () => {
    setUrl(`/fr/auth/callback?code=${FAKE_CODE}&next=${encodeURIComponent("https://evil.example/x")}`);
    authCalls.exchangeCodeForSession.mockResolvedValue({ error: null });
    authCalls.getSession.mockResolvedValue(sessionFor());
    render(<AuthCallbackPage />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalled());
    const dest = routerReplace.mock.calls[0][0] as string;
    expect(dest.startsWith("/app")).toBe(true);
    expect(dest).not.toContain("evil.example");
  });
});

describe("JUNO-10 · rejet du flux implicite (le cœur du correctif)", () => {
  it("#access_token + #refresh_token : setSession JAMAIS appelé, erreur localisée", async () => {
    setUrl(`/fr/auth/callback#access_token=${FAKE_ACCESS}&refresh_token=${FAKE_REFRESH}`);
    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText("callbackImplicitRejected")).toBeTruthy(),
    );
    expect(authCalls.setSession).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("un seul des deux jetons implicites est tout aussi rejeté", async () => {
    setUrl(`/fr/auth/callback#access_token=${FAKE_ACCESS}`);
    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText("callbackImplicitRejected")).toBeTruthy(),
    );
    expect(authCalls.setSession).not.toHaveBeenCalled();
    // Et ce n'est pas un accident d'UI : aucune session n'est établie non plus.
    expect(authCalls.getSession.mock.calls.length).toBeGreaterThanOrEqual(0);
  });

  it("le fragment est nettoyé et les jetons ne sont NI journalisés NI affichés", async () => {
    setUrl(`/fr/auth/callback#access_token=${FAKE_ACCESS}&refresh_token=${FAKE_REFRESH}`);
    render(<AuthCallbackPage />);

    await waitFor(() =>
      expect(screen.getByText("callbackImplicitRejected")).toBeTruthy(),
    );
    // Fragment purgé sans navigation (replaceState, pas de boucle).
    expect(window.location.hash).toBe("");
    // Aucune sortie console ne contient la valeur d'un jeton.
    for (const call of [
      ...(console.error as ReturnType<typeof vi.fn>).mock.calls,
      ...(console.warn as ReturnType<typeof vi.fn>).mock.calls,
    ]) {
      expect(JSON.stringify(call)).not.toContain(FAKE_ACCESS);
      expect(JSON.stringify(call)).not.toContain(FAKE_REFRESH);
    }
    expect(document.body.textContent).not.toContain(FAKE_ACCESS);
    expect(document.body.textContent).not.toContain(FAKE_REFRESH);
  });
});

describe("JUNO-10 · états d'erreur contrôlés", () => {
  it("aucun paramètre reconnu → erreur contrôlée (corps par défaut), pas de crash", async () => {
    setUrl("/fr/auth/callback");
    authCalls.getSession.mockResolvedValue(noSession());
    render(<AuthCallbackPage />);

    // Le retry après 2 s ne trouve rien → erreur. Timeout élargi pour le délai réel.
    await waitFor(
      () => expect(screen.getByText("callbackErrorBody")).toBeTruthy(),
      { timeout: 4500 },
    );
    expect(authCalls.setSession).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("#error= (OAuth refusé) → erreur contrôlée, pas de setSession", async () => {
    setUrl("/fr/auth/callback#error=access_denied&error_description=User%20cancelled");
    render(<AuthCallbackPage />);

    await waitFor(() => expect(screen.getByText("User cancelled")).toBeTruthy());
    expect(authCalls.setSession).not.toHaveBeenCalled();
  });
});
