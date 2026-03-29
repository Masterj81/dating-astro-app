"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type DashboardCard = {
  href: string;
  title: string;
  body: string;
  eyebrow?: string;
  premiumNote?: string;
  featured?: boolean;
  tone?: "rose" | "cosmic" | "celestial" | "neutral";
  icon?: "discover" | "cosmic" | "celestial" | "matches" | "chat" | "profile";
  span?: string;
};

function CardGlyph({ icon }: { icon: NonNullable<DashboardCard["icon"]> }) {
  switch (icon) {
    case "discover":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16L21 21" strokeLinecap="round" />
          <circle cx="11" cy="11" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cosmic":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1L5.3 5.3" strokeLinecap="round" />
        </svg>
      );
    case "celestial":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.6 4.5L18 8l-4.4 1.5L12 14l-1.6-4.5L6 8l4.4-1.5L12 2Z" />
          <path d="M18.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
        </svg>
      );
    case "matches":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12 21s-6.8-4.3-8.9-8C1.2 9.9 2.7 6 6.6 6c2.2 0 3.5 1.2 4.4 2.4C11.9 7.2 13.2 6 15.4 6c3.9 0 5.4 3.9 3.5 7-2.1 3.7-8.9 8-8.9 8Z" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 6.5h14A2.5 2.5 0 0 1 21.5 9v6A2.5 2.5 0 0 1 19 17.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V9A2.5 2.5 0 0 1 5 6.5Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 11.5h8M8 14.5h5" strokeLinecap="round" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 19.5c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export function DashboardOverview() {
  const t = useTranslations("webApp");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<WebAccountState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        setState(await getCurrentAccountState(t("unknownUser")));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const signedInCards: DashboardCard[] = state
    ? [
        {
          href: "/app/discover",
          title: t("dashboardDiscoverTitle"),
          body: t("dashboardDiscoverBody"),
          eyebrow: t("discoverNav"),
          featured: true,
          tone: "rose",
          icon: "discover",
          span: "md:col-span-2 xl:col-span-2 xl:row-span-2",
        },
        {
          href: "/app/premium/cosmic",
          title: t("cosmicHubTitle"),
          body: t("cosmicHubWorkspaceBody"),
          eyebrow: t("premiumNav"),
          premiumNote: t("tier_premium_plus"),
          tone: "cosmic",
          icon: "cosmic",
          span: "xl:col-span-1",
        },
        {
          href: "/app/premium/celestial",
          title: t("celestialHubTitle"),
          body: t("celestialHubSubtitle"),
          eyebrow: t("natalChartNav"),
          premiumNote: t("tier_premium"),
          tone: "celestial",
          icon: "celestial",
          span: "xl:col-span-1",
        },
        {
          href: "/app/matches",
          title: t("matchesPageTitle"),
          body: t("matchesPageSubtitle"),
          eyebrow: t("matchesNav"),
          tone: "neutral",
          icon: "matches",
        },
        {
          href: "/app/chat",
          title: t("chatHubTitle"),
          body: t("chatHubSubtitle"),
          eyebrow: t("chatNav"),
          tone: "neutral",
          icon: "chat",
        },
        {
          href: "/app/profile",
          title: t("profileWorkspaceTitle"),
          body: t("profileWorkspaceSubtitle"),
          eyebrow: t("profileNav"),
          tone: "neutral",
          icon: "profile",
        },
      ]
    : [];

  const tierLabel = state ? t(`tier_${state.tier}`) : null;

  const getCardToneClassName = (card: DashboardCard) => {
    if (card.tone === "rose") {
      return "border-[rgba(232,93,117,0.26)] bg-[linear-gradient(180deg,rgba(232,93,117,0.18),rgba(255,255,255,0.04))] shadow-[0_24px_60px_rgba(232,93,117,0.10)]";
    }

    if (card.tone === "cosmic") {
      return "border-[rgba(124,108,255,0.28)] bg-[linear-gradient(180deg,rgba(124,108,255,0.18),rgba(255,255,255,0.04))] shadow-[0_24px_60px_rgba(124,108,255,0.10)]";
    }

    if (card.tone === "celestial") {
      return "border-[rgba(77,159,255,0.24)] bg-[linear-gradient(180deg,rgba(77,159,255,0.15),rgba(255,255,255,0.04))] shadow-[0_24px_60px_rgba(77,159,255,0.08)]";
    }

    return "border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]";
  };

  const discoverPreview = (
    <div className="mt-8 grid gap-4 rounded-[1.6rem] border border-white/12 bg-[linear-gradient(180deg,rgba(13,15,28,0.72),rgba(23,26,45,0.9))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.24)] sm:grid-cols-[108px_minmax(0,1fr)] sm:p-5">
      <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.55),transparent_24%),linear-gradient(145deg,rgba(244,118,147,0.95),rgba(94,72,173,0.95))] shadow-[0_18px_35px_rgba(118,74,167,0.24)]">
        <div className="absolute inset-x-0 bottom-0 h-[58%] rounded-t-[999px] bg-[rgba(16,18,33,0.26)]" />
        <div className="absolute left-1/2 top-[28%] h-10 w-10 -translate-x-1/2 rounded-full bg-white/90" />
        <div className="absolute left-1/2 top-[52%] h-16 w-20 -translate-x-1/2 rounded-t-[999px] bg-white/85" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[rgba(255,255,255,0.12)] bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80">
            {t("cosmicCompatibility")} 92%
          </span>
          <span className="rounded-full border border-[rgba(244,118,147,0.25)] bg-[rgba(244,118,147,0.12)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#ffb2c4]">
            Montreal
          </span>
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold tracking-[-0.04em] text-white">
              Mila, 27
            </p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              {t("discoverSun")}: Cancer · {t("discoverMoon")}: Libra
            </p>
          </div>
          <div className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-[#ffb2c4] sm:flex">
            <CardGlyph icon="matches" />
          </div>
        </div>
        <p className="mt-4 max-w-xl text-sm leading-7 text-text-muted">
          Photographe de nuit, romantique calme, attirée par les connexions qui ont du fond et du rythme.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Welcome strip */}
      {state && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-[linear-gradient(135deg,rgba(232,93,117,0.08),rgba(124,108,255,0.08))] px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {t("dashboardSignedInTitle", { name: state.displayName })}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {t("dashboardSignedInBody", { tier: tierLabel ?? "" })}
            </p>
          </div>
          {tierLabel && (
            <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.18em] text-text-muted">
              {t("dashboardTierPill", { tier: tierLabel })}
            </span>
          )}
        </div>
      )}

      {state ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {signedInCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:shadow-lg ${getCardToneClassName(card)} ${card.span ?? ""}`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center gap-3">
                  {card.icon && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                      <CardGlyph icon={card.icon} />
                    </div>
                  )}
                  {card.eyebrow && (
                    <p className="text-[11px] uppercase tracking-[0.22em] text-text-dim">
                      {card.eyebrow}
                    </p>
                  )}
                </div>
                <h3
                  className={`mt-4 font-semibold text-white ${
                    card.featured ? "text-2xl tracking-[-0.03em]" : "text-lg"
                  }`}
                >
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-text-muted line-clamp-2">
                  {card.body}
                </p>
                {card.premiumNote && (
                  <div className="mt-3">
                    <span className="inline-flex items-center rounded-full border border-white/12 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70">
                      ✨ {card.premiumNote}
                    </span>
                  </div>
                )}
                {card.featured && card.icon === "discover" ? discoverPreview : null}
                <div className="mt-auto pt-4">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-dim transition-colors group-hover:text-white">
                    <span>Open</span>
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 2.5l4 3.5-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card/90 py-16 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 text-4xl">
            ✦
          </div>
          <h2 className="text-2xl font-semibold text-white">{t("dashboardSignedOutTitle")}</h2>
          <p className="mt-3 max-w-md text-sm text-text-muted">{t("dashboardSignedOutBody")}</p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/auth/login"
              className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("signIn")}
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("createAccount")}
            </Link>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      )}
    </div>
  );
}
