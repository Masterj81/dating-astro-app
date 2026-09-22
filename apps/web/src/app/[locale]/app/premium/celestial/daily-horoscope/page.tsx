import { AppShell } from "@/components/AppShell";
import { DailyHoroscopeOverview } from "@/components/DailyHoroscopeOverview";
import { getTranslations } from "next-intl/server";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

