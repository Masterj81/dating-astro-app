import { AppShell } from "@/components/AppShell";
import { PremiumGlyph, type PremiumGlyphName } from "@/components/PremiumGlyph";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";

type CelestialFeatureCard =
  | {
      href: string;
      title: string;
      body: string;
      badge: string;
      glyph: PremiumGlyphName;
      available: true;
    }
  | {
      href: null;
      title: string;
      body: string;
      badge: string;
      glyph: PremiumGlyphName;
      available: false;
    };

export default async function CelestialHubPage() {
  const t = await getTranslations("webApp");

  const featureCards: CelestialFeatureCard[] = [
    {
      href: "/app/premium/celestial/natal-chart",
      title: t("celestialHubOpenNatal"),
      body: t("celestialHubItem_natal"),
      badge: t("hubBadge_core"),
      glyph: "natal",
      available: true,
    },
    {
      // Free accounts reach this from the dashboard and from a chat thread —
      // this hub entry is for people who already subscribed and are browsing
      // what they have, not the discovery path. See the header of
      // ConversationGuideOverview.tsx.
      href: "/app/premium/conversation-guide",
      title: t("conversationGuide"),
      body: t("conversationGuideEntrySubtitle"),
      badge: t("hubBadge_match"),
      glyph: "coach",
      available: true,
    },
    {
      href: "/app/premium/celestial/synastry",
      title: t("celestialHubOpenSynastry"),
      body: t("celestialHubItem_synastry"),
      badge: t("hubBadge_match"),
      glyph: "synastry",
      available: true,
    },
    {
      // Daily horoscope moved from Cosmic → Celestial. It's personal and
      // frequent, not a high-end exclusive, so it belongs alongside the
      // natal chart and synastry tools. Cosmic users still have access by
      // downward inclusion via the canAccess logic.
      href: "/app/premium/celestial/daily-horoscope",
      title: t("celestialHubOpenDailyHoroscope"),
      body: t("celestialHubItem_dailyHoroscope"),
      badge: t("hubBadge_daily"),
      glyph: "daily",
      available: true,
    },
    // "Likes" and "Priority messages" cards were removed from this hub
    // when the conversation-first product shipped: there is no longer
    // a swipe/like system to surface admirers from, and the priority
    // messaging tier never had a real backend signal — the page just
    // rendered generic chat counters. The route files are kept under
    // celestial/likes and celestial/priority-messages but redirect to
    // this hub so any cached link lands somewhere coherent.
    {
      // Tarot badge previously rendered the 🃏 emoji — replaced with a
      // short uppercase tag matching the rest of the hub.
      href: "/app/premium/celestial/tarot",
      title: t("tarotReading"),
      body: t("monthlyTarotSubtitle"),
      badge: "TAROT",
      glyph: "tarot",
      available: true,
    },
  ];

  return (
    <AppShell title={t("celestialHubTitle")} subtitle={t("celestialHubWorkspaceBody")}>
      <div className="space-y-6">
        <section className="space-y-6">
          <div className="rounded-[2.2rem] border border-border bg-[linear-gradient(180deg,rgba(232,199,126,0.14),rgba(255,255,255,0.04))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featureCards.map((card) => (
                card.available ? (
                  <Link
                    key={card.title}
                    href={card.href}
                    className={`rounded-[1.7rem] border p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-card-hover ${
                      card.href === "/app/premium/celestial/natal-chart"
                        ? "border-gold-border bg-[linear-gradient(180deg,rgba(232,199,126,0.12),rgba(255,255,255,0.03))]"
                        : "border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white">
                        <PremiumGlyph name={card.glyph} />
                      </div>
                      <span className="rounded-full border border-gold-border bg-gold-wash px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                        {card.badge}
                      </span>
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-white">{card.title}</h4>
                    <p className="mt-3 text-sm leading-7 text-text-muted">{card.body}</p>
                  </Link>
                ) : (
                  <div
                    key={card.title}
                    className="rounded-[1.6rem] border border-border bg-bg/40 p-5 opacity-75"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/60">
                        <PremiumGlyph name={card.glyph} />
                      </div>
                      <span className="rounded-full border border-gold-border bg-gold-wash px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                        {card.badge}
                      </span>
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-white">{card.title}</h4>
                    <p className="mt-3 text-sm leading-7 text-text-muted">{card.body}</p>
                  </div>
                )
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
