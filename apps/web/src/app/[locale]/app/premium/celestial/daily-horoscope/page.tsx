import { AppShell } from "@/components/AppShell";
import { DailyHoroscopeOverview } from "@/components/DailyHoroscopeOverview";
import { getTranslations } from "next-intl/server";

// Daily Horoscope was reframed as a Celestial-tier feature (personal + daily,
// not a high-end exclusive). This route renders the same component as the
// existing /app/premium/cosmic/daily-horoscope route so the Celestial hub
// can link semantically into its own namespace. The cosmic-namespaced route
// is kept intact so bookmarks and deep links continue to resolve.
export default async function CelestialDailyHoroscopePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("dailyHoroscopeWebTitle")}
      subtitle={t("dailyHoroscopeWebSubtitle")}
    >
      <DailyHoroscopeOverview />
    </AppShell>
  );
}
