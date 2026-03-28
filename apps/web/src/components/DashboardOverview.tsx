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
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
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
    <div>
      <section className="overflow-hidden rounded-[2.2rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_top_left,rgba(232,93,117,0.14),transparent_36%),radial-gradient(circle_at_top_right,rgba(124,108,255,0.12),transparent_34%)]" />

          <div className="relative">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("workspace")}
            </p>
            <div className="mt-4">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                    {state
                      ? t("dashboardSignedInTitle", { name: state.displayName })
                      : t("dashboardSignedOutTitle")}
                  </h2>
                  {state && tierLabel ? (
                    <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.18em] text-text-muted">
                      {t("dashboardTierPill", { tier: tierLabel })}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
                  {state
                    ? t("dashboardSignedInBody", { tier: tierLabel ?? "" })
                    : t("dashboardSignedOutBody")}
                </p>
              </div>
            </div>

            <div className="mt-8">
              {state ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {signedInCards.map((card) => (
                    <Link
                      key={card.href}
                      href={card.href}
                      className={`group relative overflow-hidden rounded-[1.8rem] border p-5 transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] ${getCardToneClassName(card)} ${card.span ?? ""}`}
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      <div className="relative flex h-full flex-col">
                        {card.eyebrow ? (
                          <p className="text-[11px] uppercase tracking-[0.22em] text-text-dim">
                            {card.eyebrow}
                          </p>
                        ) : null}
                        <h3
                          className={`mt-3 font-semibold text-white ${
                            card.featured ? "text-[1.9rem] leading-tight tracking-[-0.04em]" : "text-xl"
                          }`}
                        >
                          {card.title}
                        </h3>
                        <p
                          className={`mt-3 max-w-[32rem] text-sm leading-7 text-text-muted ${
                            card.featured ? "sm:text-base" : ""
                          }`}
                        >
                          {card.body}
                        </p>
                        {card.premiumNote ? (
                          <div className="mt-4">
                            <span className="inline-flex items-center rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/80">
                              Premium · {card.premiumNote}
                            </span>
                          </div>
                        ) : null}
                        {card.featured && card.icon === "discover" ? discoverPreview : null}
                        <div className="mt-auto pt-8">
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.18em] text-white/80 transition-colors group-hover:border-white/20 group-hover:text-white">
                            {card.icon ? <CardGlyph icon={card.icon} /> : null}
                            <span>Open</span>
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/auth/login"
                    className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_10px_30px_rgba(232,93,117,0.28)] transition-colors hover:bg-accent-hover"
                  >
                    {t("signIn")}
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="rounded-full border border-border bg-white/[0.04] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-card-hover"
                  >
                    {t("createAccount")}
                  </Link>
                </div>
              )}
            </div>

            {error ? (
              <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
