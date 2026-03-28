import { AppShell } from "@/components/AppShell";
import { DailyHoroscopeOverview } from "@/components/DailyHoroscopeOverview";
import { getTranslations } from "next-intl/server";

export default async function DailyHoroscopePage() {
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
