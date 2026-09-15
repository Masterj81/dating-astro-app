/**
 * Astro portal — behavioural tests for the three account tiers.
 *
 * These tests execute the REAL AstroPortal component (not a regex over its
 * source) with a simulated account state. They prove what the structural
 * validator cannot:
 *
 *   - free: plans CTA visible, both tiers presented as discoverable;
 *   - premium (Celestial): Celestial explored, Cosmic offered as upgrade;
 *   - premium_plus (Cosmic): both explored, NO upgrade CTA;
 *   - tier-read failure: safe degradation to the free presentation;
 *   - rendering the portal triggers ZERO premium RPC (no quota, no grant);
 *   - every produced link is the expected real route.
 *
 * Mocks are deliberately narrow: only the account-state reader, the Supabase
 * client factory (instrumented, to OBSERVE that nothing calls it for gating),
 * next-intl (labels resolve to their keys — locale-independent assertions),
 * and the i18n Link (plain anchors). Everything else — the component, its
 * tier logic, its cards, its quick links — is the shipping code.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
//
// The Supabase client factory is instrumented, not stubbed away: if the
// portal ever starts calling .rpc('enforce_premium_feature') on render —
// the exact regression this suite exists to catch — the spy records it and
// the "no premium RPC" assertions fail.

const rpcCalls: Array<{ fn: string; args: unknown }> = [];
const supabaseSpy = {
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve({ data: null, error: null });
  },
  from: (table: string) => {
    rpcCalls.push({ fn: `from:${table}`, args: null });
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => supabaseSpy,
}));

const accountState = {
  getCurrentAccountState: vi.fn(),
};
vi.mock("@/lib/web-account", () => ({
  getCurrentAccountState: (...args: unknown[]) => accountState.getCurrentAccountState(...args),
}));

vi.mock("next-intl", () => ({
  // Labels resolve to their translation keys: assertions stay
  // locale-independent and still observe WHICH copy branch the component
  // picked (explore vs discover is exactly the behaviour under test).
  useTranslations: () => (key: string) => key,
  useLocale: () => "fr",
}));

vi.mock("@/i18n/navigation", () => ({
  // Plain anchors: href assertions observe the real produced routes.
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { AstroPortal } from "@/components/AstroPortal";

// ── Helpers ────────────────────────────────────────────────────────────────
const renderPortal = () => render(<AstroPortal />);

// Le libellé du forfait n'apparaît QUE dans le bandeau supérieur, une seule
// fois : le pied de carte ne porte plus que l'action (le badge qui répétait
// le forfait du compte sur chaque carte a été retiré le 2026-09-15 après la
// passe visuelle de l'exploitant).
const waitForPlanLabel = (label: string) =>
  waitFor(() => {
    expect(screen.getAllByText(label).length).toBe(1);
  });

const expectLinks = (expected: Array<{ name: string; href: string }>) => {
  for (const { name, href } of expected) {
    const el = screen.getByRole("link", { name: new RegExp(name) });
    expect(el.getAttribute("href")).toBe(href);
  }
};

beforeEach(() => {
  rpcCalls.length = 0;
  accountState.getCurrentAccountState.mockReset();
});

afterEach(() => {
  cleanup();
});

// ── FREE ───────────────────────────────────────────────────────────────────
describe("AstroPortal — compte gratuit (free)", () => {
  it("montre le CTA forfaits et présente les deux niveaux comme découvrables", async () => {
    accountState.getCurrentAccountState.mockResolvedValue({
      userId: "synthetic-free",
      name: "Test",
      tier: "free",
    });
    renderPortal();

    await waitForPlanLabel("astroPortalPlanFree");

    // Plans CTA — discret mais présent pour un compte non-Cosmique.
    expectLinks([{ name: "astroPortalPlansCta", href: "/app/plans" }]);

    // Les deux cartes en mode découverte — jamais "Explorer".
    expectLinks([
      { name: "astroDiscoverCelestial", href: "/app/premium/celestial" },
      { name: "astroDiscoverCosmic", href: "/app/premium/cosmic" },
    ]);
    expect(screen.queryByText("astroExploreCelestial")).toBeNull();
    expect(screen.queryByText("astroExploreCosmic")).toBeNull();
  });

  it("raccourcis : natal en essai gratuit SANS cadenas, guide ouvert, synastrie seule verrouillée", async () => {
    accountState.getCurrentAccountState.mockResolvedValue({ userId: "u", tier: "free" });
    renderPortal();
    await waitForPlanLabel("astroPortalPlanFree");

    // Natal : essai gratuit annoncé, AUCUN cadenas — la politique réelle
    // (free_preview_quota = 1) rend ce raccourci réellement utilisable.
    expect(screen.getByText("astroQuickNatalFreeNote")).toBeTruthy();
    expect(screen.getByText("astroQuickGuideFreeNote")).toBeTruthy();
    // Exactement UN cadenas dans tout le portail : la synastrie (aucun
    // aperçu gratuit — free_preview_quota NULL, mesuré le 14 sep 2026).
    expect(screen.getAllByLabelText("astroLockedRequiresCelestial").length).toBe(1);
    // Le cadenas est sur le lien synastrie, pas sur le natal ni le guide.
    const synastryLink = screen.getByRole("link", { name: /celestialHubOpenSynastry/ });
    expect(synastryLink.querySelector('[aria-label="astroLockedRequiresCelestial"]')).not.toBeNull();
    const natalLink = screen.getByRole("link", { name: /celestialHubOpenNatal/ });
    expect(natalLink.querySelector('[aria-label="astroLockedRequiresCelestial"]')).toBeNull();
    const guideLink = screen.getByRole("link", { name: /conversationGuide/ });
    expect(guideLink.querySelector('[aria-label="astroLockedRequiresCelestial"]')).toBeNull();
    // Les trois raccourcis pointent vers les vraies routes — accessibles.
    expectLinks([
      { name: "celestialHubOpenNatal", href: "/app/premium/celestial/natal-chart" },
      { name: "celestialHubOpenSynastry", href: "/app/premium/celestial/synastry" },
      { name: "conversationGuide", href: "/app/premium/conversation-guide" },
    ]);
  });
});

// ── PREMIUM / CÉLESTE ──────────────────────────────────────────────────────
describe("AstroPortal — compte premium (Céleste)", () => {
  it("Céleste explorable, Cosmique proposé comme niveau supérieur", async () => {
    accountState.getCurrentAccountState.mockResolvedValue({
      userId: "synthetic-premium",
      tier: "premium",
    });
    renderPortal();

    // Bandeau = unique affichage du forfait (exactement une occurrence).
    await waitFor(() => {
      expect(screen.getAllByText("astroPortalPlanCelestial").length).toBe(1);
    });

    expectLinks([
      { name: "astroExploreCelestial", href: "/app/premium/celestial" },
      { name: "astroDiscoverCosmic", href: "/app/premium/cosmic" },
    ]);
    // L'upgrade vers Cosmique reste proposé — premium n'est pas premium_plus.
    expect(screen.getByText("astroPortalPlansCta")).toBeTruthy();
    expect(screen.queryByText("astroDiscoverCelestial")).toBeNull();
  });
});

// ── PREMIUM_PLUS / COSMIQUE ───────────────────────────────────────────────
describe("AstroPortal — compte premium_plus (Cosmique)", () => {
  it("les deux niveaux explorable, AUCUN CTA de mise à niveau", async () => {
    accountState.getCurrentAccountState.mockResolvedValue({
      userId: "synthetic-cosmic",
      tier: "premium_plus",
    });
    renderPortal();

    // Le bandeau supérieur est l'UNIQUE affichage du forfait : le libellé
    // apparaît exactement une fois (l'ancien badge de pied de carte, qui
    // répétait le forfait du compte sur chaque carte, est retiré).
    await waitFor(() => {
      expect(screen.getAllByText("astroPortalPlanCosmic").length).toBe(1);
    });

    expectLinks([
      { name: "astroExploreCelestial", href: "/app/premium/celestial" },
      { name: "astroExploreCosmic", href: "/app/premium/cosmic" },
    ]);
    expect(screen.queryByText("astroPortalPlansCta")).toBeNull();
    // L'inclusion descendante est énoncée sur la carte Cosmique.
    expect(screen.getByText("astroCardCosmicIncludes")).toBeTruthy();
  });

  it("aucun cadenas sur les raccourcis à ce niveau", async () => {
    accountState.getCurrentAccountState.mockResolvedValue({ userId: "u", tier: "premium_plus" });
    renderPortal();
    await waitForPlanLabel("astroPortalPlanCosmic");
    expect(screen.queryByLabelText("astroLockedRequiresCelestial")).toBeNull();
  });
});

// ── DÉGRADATION PRUDENTE ───────────────────────────────────────────────────
describe("AstroPortal — échec de lecture du niveau", () => {
  it("dégrade vers la présentation gratuite sans plancher", async () => {
    accountState.getCurrentAccountState.mockRejectedValue(new Error("network down"));
    renderPortal();

    // La présentation free apparaît : découverte + CTA forfaits.
    await waitFor(() => {
      expect(screen.getByText("astroPortalPlansCta")).toBeTruthy();
    });
    expect(screen.getByText("astroDiscoverCelestial")).toBeTruthy();
    expect(screen.getByText("astroDiscoverCosmic")).toBeTruthy();
    // Le marqueur d'erreur honnête est rendu (unknownUser), pas un faux niveau.
    expect(screen.getByText(/unknownUser/)).toBeTruthy();
  });
});

// ── AUCUN APPEL PREMIUM AU MONTAGE ────────────────────────────────────────
describe("AstroPortal — aucun quota consommé au rendu", () => {
  it.each(["free", "premium", "premium_plus"] as const)(
    "tier=%s : aucun appel RPC premium pendant le rendu",
    async (tier) => {
      accountState.getCurrentAccountState.mockResolvedValue({ userId: "u", tier });
      renderPortal();
      await waitFor(() => {
        expect(
          screen.getAllByText(
            tier === "premium_plus"
              ? "astroPortalPlanCosmic"
              : tier === "premium"
                ? "astroPortalPlanCelestial"
                : "astroPortalPlanFree",
          ).length,
        ).toBeGreaterThan(0);
      });
      // Le portail est une carte, pas une porte : aucun enforce_/can_use_.
      const premiumCalls = rpcCalls.filter((c) => /enforce_|can_use_/.test(c.fn));
      expect(premiumCalls).toEqual([]);
      expect(rpcCalls.filter((c) => c.fn.startsWith("from:premium_usage"))).toEqual([]);
    },
  );
});
