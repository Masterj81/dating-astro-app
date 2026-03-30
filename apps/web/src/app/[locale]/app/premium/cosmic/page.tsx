import { AppShell } from "@/components/AppShell";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

export default async function CosmicHubPage() {
  const t = await getTranslations("webApp");

  const featureCards = [
    {
      href: "/app/premium/cosmic/daily-horoscope",
      title: t("cosmicHubOpenDaily"),
      body: t("cosmicHubItem_daily"),
      badge: t("hubBadge_now"),
    },
    {
      href: "/app/premium/cosmic/monthly-horoscope",
      title: t("cosmicHubOpenMonthly"),
      body: t("cosmicHubItem_monthly"),
      badge: t("hubBadge_macro"),
    },
    {
      href: "/app/premium/cosmic/planetary-transits",
      title: t("cosmicHubOpenTransits"),
      body: t("cosmicHubItem_transits"),
      badge: t("hubBadge_live"),
    },
    {
      href: "/app/premium/cosmic/lucky-days",
      title: t("cosmicHubOpenLucky"),
      body: t("cosmicHubItem_lucky"),
      badge: t("hubBadge_timing"),
    },
    {
      href: "/app/premium/cosmic/date-planner",
      title: t("cosmicHubOpenPlanner"),
      body: t("cosmicHubItem_planner"),
      badge: t("hubBadge_dates"),
    },
    {
      href: "/app/premium/cosmic/retrograde-alerts",
      title: t("cosmicHubOpenRetrograde"),
      body: t("cosmicHubItem_retrograde"),
      badge: t("hubBadge_alerts"),
    },
    {
      href: "/app/premium/cosmic/tarot",
      title: t("tarotReading"),
      body: t("weeklyTarotSubtitle"),
      badge: "🃏",
    },
  ];

  return (
    <AppShell title={t("cosmicHubTitle")} subtitle={t("cosmicHubWorkspaceBody")}>
      <div className="space-y-6">
        <section className="space-y-6">
          <div className="rounded-[2.2rem] border border-border bg-[linear-gradient(180deg,rgba(124,108,255,0.18),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
                    card.href === "/app/premium/cosmic/daily-horoscope"
                      ? "border-[rgba(232,93,117,0.24)] bg-[linear-gradient(180deg,rgba(232,93,117,0.14),rgba(255,255,255,0.03))]"
                      : "border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
                  }`}
                >
                  <div className="flex items-center gap-3">
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
