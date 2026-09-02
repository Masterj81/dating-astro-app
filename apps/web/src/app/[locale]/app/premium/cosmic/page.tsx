import { AppShell } from "@/components/AppShell";
import { PremiumGlyph, type PremiumGlyphName } from "@/components/PremiumGlyph";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function CosmicHubPage() {
  const t = await getTranslations("webApp");

  const featureCards: Array<{
    href: string;
    title: string;
    body: string;
    badge: string;
    glyph: PremiumGlyphName;
  }> = [
    // Daily Horoscope was moved to the Celestial hub — it's a personal,
    // frequent feature, not a high-end Cosmic exclusive. Cosmic still
    // includes it by downward inclusion; the card just lives in the
    // Celestial hub now. The /app/premium/cosmic/daily-horoscope route
    // is kept alive for backward compatibility with any cached link.
    {
      href: "/app/premium/cosmic/monthly-horoscope",
      title: t("cosmicHubOpenMonthly"),
      body: t("cosmicHubItem_monthly"),
      badge: t("hubBadge_macro"),
      glyph: "monthly",
    },
    {
      href: "/app/premium/cosmic/planetary-transits",
      title: t("cosmicHubOpenTransits"),
      body: t("cosmicHubItem_transits"),
      badge: t("hubBadge_live"),
      glyph: "transits",
    },
    {
      href: "/app/premium/cosmic/lucky-days",
      title: t("cosmicHubOpenLucky"),
      body: t("cosmicHubItem_lucky"),
      badge: t("hubBadge_timing"),
      glyph: "lucky",
    },
    {
      href: "/app/premium/cosmic/retrograde-alerts",
      title: t("cosmicHubOpenRetrograde"),
      body: t("cosmicHubItem_retrograde"),
      badge: t("hubBadge_alerts"),
      glyph: "retrograde",
    },
    {
      href: "/app/premium/cosmic/date-planner",
      title: t("dateReflectionV2HubTitle"),
      body: t("dateReflectionV2HubBody"),
      badge: t("hubBadge_dates"),
      glyph: "planner",
    },
    {
      // Tarot badge previously rendered the 🃏 emoji. The Tarot title is
      // already rendered as the card heading; the badge becomes a short
      // uppercase tag matching the rest of the hub. "TAROT" is the same
      // word in EN/FR/ES/IT/PT/DE so the literal works for our shipped
      // locales pending a proper hubBadge_tarot key in i18n.
      href: "/app/premium/cosmic/tarot",
      title: t("tarotReading"),
      body: t("weeklyTarotSubtitle"),
      badge: "TAROT",
      glyph: "tarot",
    },
  ];

  return (
    <AppShell title={t("cosmicHubTitle")} subtitle={t("cosmicHubWorkspaceBody")}>
      <div className="space-y-6">
        <section className="space-y-6">
          <div className="rounded-[2.2rem] border border-border bg-[linear-gradient(180deg,rgba(91, 84, 168, 0.18),rgba(255, 255, 255, 0.04))] p-6 shadow-[0_24px_80px_rgba(0, 0, 0, 0.18)]">
            <div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                  {t("cosmicHubIncluded")}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-white">
                  {t("cosmicHubWorkspaceTitle")}
                </h3>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className={`rounded-[1.7rem] border p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-card-hover ${
                    card.href === "/app/premium/cosmic/monthly-horoscope"
                      ? "border-[rgba(201, 134, 146, 0.24)] bg-[linear-gradient(180deg,rgba(201, 134, 146, 0.14),rgba(255, 255, 255, 0.03))]"
                      : "border-border bg-[linear-gradient(180deg,rgba(255, 255, 255, 0.05),rgba(255, 255, 255, 0.02))]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white">
                      <PremiumGlyph name={card.glyph} />
                    </div>
                    <span className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                      {card.badge}
                    </span>
                  </div>
                  <h4 className="mt-4 text-lg font-semibold text-white">{card.title}</h4>
                  <p className="mt-3 text-sm leading-7 text-text-muted">{card.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
