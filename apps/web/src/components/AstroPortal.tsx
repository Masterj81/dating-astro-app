"use client";

import { NavIcon } from "@/components/NavIcons";
import { Link } from "@/i18n/navigation";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * Astro portal — the single door to both reading tiers.
 *
 * WHY THIS EXISTS (2026-09-15): the mobile bottom bar linked straight to
 * /app/premium/cosmic, so a phone reader could believe the PWA only ships
 * Cosmic. Celestial existed, with its hub one sidebar-scroll away on desktop
 * and unreachable on mobile. This portal reunites both tiers under one tab.
 *
 * WHAT IT MUST NEVER DO:
 *   - call any premium RPC (enforce_/can_use_) — the portal is a map, not a
 *     gate; opening it must cost no quota and grant nothing;
 *   - decide entitlement — the tier read here picks CARD COPY only. Every
 *     destination applies its own server-side guard, unchanged;
 *   - redirect the legacy hub routes — they stay where they are (mission
 *     step 7: a new door, not a replacement).
 *
 * The only mount effect reads the reader's OWN account state — the same call
 * the dashboard makes — which touches no quota table.
 */

type TierCard = {
  href: string;
  title: string;
  tagline: string;
  items: string[];
  unlocked: boolean;
  exploreLabel: string;
  discoverLabel: string;
  accent: "celestial" | "cosmic";
  includesNote?: string;
};

export function AstroPortal() {
  const t = useTranslations("webApp");
  const [state, setState] = useState<WebAccountState | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        if (active) setState(account);
      } catch {
        // The portal still renders without the tier chip — the cards
        // degrade to their "discover" form, which is correct for an
        // unauthenticated or erroring read.
        if (active) setLoadError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  // Display-only tier. Aliases per the server's tier_at_least:
  // premium === celestial, premium_plus === cosmic. The portal NEVER treats
  // this as authority — destinations enforce server-side.
  const tier = state?.tier ?? "free";
  const celestialUnlocked = tier === "premium" || tier === "premium_plus";
  const cosmicUnlocked = tier === "premium_plus";

  const cards: TierCard[] = [
    {
      href: "/app/premium/celestial",
      title: t("celestialHubTitle"),
      tagline: t("astroCardCelestialBody"),
      // Neutral items — NO availability claims. The inherited hub strings
      // said "available now", which is FALSE on a locked card for a free or
      // Celestial account (authenticated pass, 2026-09-15): availability is
      // carried by the CTA and the lock state, never by the item.
      items: [
        t("astroItemNatal"),
        t("astroItemSynastry"),
        t("astroItemDaily"),
        t("astroItemGuide"),
        t("astroItemTarotMonthly"),
      ],
      unlocked: celestialUnlocked,
      exploreLabel: t("astroExploreCelestial"),
      discoverLabel: t("astroDiscoverCelestial"),
      accent: "celestial",
    },
    {
      href: "/app/premium/cosmic",
      title: t("cosmicHubTitle"),
      tagline: t("astroCardCosmicBody"),
      items: [
        t("astroItemMonthly"),
        t("astroItemTransits"),
        t("astroItemWindows"),
        t("astroItemRetrograde"),
        t("astroItemDateReflection"),
        t("astroItemTarotWeekly"),
      ],
      unlocked: cosmicUnlocked,
      exploreLabel: t("astroExploreCosmic"),
      discoverLabel: t("astroDiscoverCosmic"),
      accent: "cosmic",
      // Downward inclusion, confirmed server-side by tier_at_least
      // (cosmic/premium_plus satisfies every celestial requirement) —
      // 20260419000006: "free < celestial < cosmic".
      includesNote: t("astroCardCosmicIncludes"),
    },
  ];

  const planLabel =
    tier === "premium_plus"
      ? t("astroPortalPlanCosmic")
      : tier === "premium"
        ? t("astroPortalPlanCelestial")
        : t("astroPortalPlanFree");

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* ── Plan state ── */}
      <section
        aria-label={t("astroPortalCurrentPlan")}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
      >
        <p className="text-sm text-text-muted">
          {t("astroPortalCurrentPlan")} :{" "}
          <span className="font-semibold text-white">{planLabel}</span>
          {loadError && !state ? (
            <span className="ml-2 text-xs text-text-dim">({t("unknownUser")})</span>
          ) : null}
        </p>
        {/* Discreet plans CTA — only for accounts that are not Cosmic yet. */}
        {!cosmicUnlocked && (
          <Link
            href="/app/plans"
            className="rounded-full border border-gold-border bg-gold/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            {t("astroPortalPlansCta")}
          </Link>
        )}
      </section>

      {/* ── Tier cards ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {cards.map((card) => (
          <section
            key={card.href}
            aria-label={card.title}
            /* min-w-0 + break-words: the standard grid-blowout remedy. A grid
               item refuses to shrink below its min-content by default
               (min-width: auto), so at 200% text zoom one long tracked word
               pushed the card to 400px inside a 290px container — horizontal
               overflow. min-w-0 lets the track decide; break-words makes any
               pathological word wrap instead of piercing the card. */
            className={`flex min-w-0 flex-col break-words rounded-[2.2rem] border p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-7 ${
              card.accent === "celestial"
                ? "border-[rgba(232,199,126,0.22)] bg-[linear-gradient(180deg,rgba(232,199,126,0.14),rgba(255,255,255,0.03))]"
                : "border-[rgba(91,84,168,0.30)] bg-[linear-gradient(180deg,rgba(91,84,168,0.20),rgba(255,255,255,0.03))]"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p
                  className={`text-xs uppercase tracking-[0.24em] ${
                    card.accent === "celestial" ? "text-gold-muted" : "text-[#b6aee0]"
                  }`}
                >
                  {card.accent === "celestial"
                    ? t("celestialHubIncluded")
                    : t("cosmicHubIncluded")}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                  {card.title}
                </h2>
              </div>
              <NavIcon
                name={card.accent === "celestial" ? "celestial" : "cosmic"}
                className={`mt-1 h-7 w-7 shrink-0 ${
                  card.accent === "celestial" ? "text-gold" : "text-[#9d94d6]"
                }`}
              />
            </div>

            <p className="mt-3 text-sm leading-7 text-text-muted">{card.tagline}</p>

            <ul className="mt-5 space-y-2.5">
              {card.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-text-muted">
                  <span
                    aria-hidden="true"
                    className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                      card.accent === "celestial" ? "bg-gold/70" : "bg-[#9d94d6]/70"
                    }`}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {card.includesNote ? (
              <p className="mt-4 rounded-xl border border-white/8 bg-white/[0.04] px-3.5 py-2.5 text-xs leading-5 text-text-muted">
                {card.includesNote}
              </p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
              {/* The card foot carries ONLY the action. The small plan label
                  that used to sit beside these CTAs showed the ACCOUNT's
                  current plan on BOTH cards — on a Cosmic account the
                  Celestial card read "Explorer Céleste · Cosmique", which
                  read as a contradiction (operator visual pass, 2026-09-15).
                  The current plan lives in the header strip and nowhere
                  else; each card's own level is its title. No replacement
                  badge. text-center lets the label wrap at extreme text
                  zoom instead of forcing the card's min-content wider than
                  the viewport. */}
              <Link
                href={card.href}
                className={`min-w-0 rounded-full px-5 py-3 text-center text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  card.accent === "celestial"
                    ? "bg-gold text-bg hover:bg-gold-soft focus-visible:outline-gold"
                    : "bg-[#6d63b0] text-white hover:bg-[#7d74c0] focus-visible:outline-[#9d94d6]"
                }`}
              >
                {card.unlocked ? card.exploreLabel : card.discoverLabel}
              </Link>
            </div>
          </section>
        ))}
      </div>

      {/* ── Quick access ── */}
      <section aria-label={t("astroQuickTitle")}>
        <h2 className="text-lg font-semibold text-white">{t("astroQuickTitle")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {/* Natal chart — open to EVERY account, including free: the server
              grants one preview read per day (natal_chart
              free_preview_quota = 1, 20260823000001, measured 14 Sep 2026).
              Showing a lock here contradicted the "1 free reading" note
              beside it (operator review, 2026-09-15): the shortcut is a
              genuine free trial, and the destination still decides
              server-side. The note IS the try-free label. */}
          <QuickLink
            href="/app/premium/celestial/natal-chart"
            label={t("celestialHubOpenNatal")}
            note={celestialUnlocked ? null : t("astroQuickNatalFreeNote")}
            locked={false}
            lockedLabel=""
            icon="celestial"
          />
          {/* Synastry — the ONLY locked shortcut in this group: no free
              preview exists (free_preview_quota IS NULL, verified
              14 Sep 2026). Locked reads as locked; the destination's 402 is
              handled by the surface, and the portal itself never consumes
              quota. */}
          <QuickLink
            href="/app/premium/celestial/synastry"
            label={t("celestialHubOpenSynastry")}
            note={null}
            locked={!celestialUnlocked}
            lockedLabel={t("astroLockedRequiresCelestial")}
            icon="astro"
          />
          {/* Conversation guide — its free situation never touches the
              server, so this shortcut is genuinely open to everyone. */}
          <QuickLink
            href="/app/premium/conversation-guide"
            label={t("conversationGuide")}
            note={celestialUnlocked ? null : t("astroQuickGuideFreeNote")}
            locked={false}
            lockedLabel=""
            icon="guide"
          />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  href,
  label,
  note,
  locked,
  lockedLabel,
  icon,
}: {
  href: string;
  label: string;
  note: string | null;
  locked: boolean;
  lockedLabel: string;
  icon: "celestial" | "astro" | "guide";
}) {
  return (
    <Link
      href={href}
      /* min-w-0 (grid item) + label that WRAPS instead of truncating: the
         original `truncate` meant white-space:nowrap, whose min-content at
         200% text zoom measured 557px — the three quick links were the whole
         horizontal overflow of the portal at extreme zoom (measured
         2026-09-15). Labels now wrap; nothing is cut with an ellipsis. */
      className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <NavIcon name={icon} className="h-5 w-5 shrink-0 text-gold/80" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        {note ? <span className="block text-xs text-text-dim">{note}</span> : null}
      </span>
      {locked ? (
        <span
          role="img"
          aria-label={lockedLabel}
          title={lockedLabel}
          className="shrink-0 text-text-dim"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" strokeLinecap="round" />
          </svg>
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="shrink-0 text-text-dim transition-transform group-hover:translate-x-0.5"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      )}
    </Link>
  );
}
