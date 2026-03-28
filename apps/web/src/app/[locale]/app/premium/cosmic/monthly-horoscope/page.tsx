import { AppShell } from "@/components/AppShell";
import { MonthlyHoroscopeOverview } from "@/components/MonthlyHoroscopeOverview";
import { getTranslations } from "next-intl/server";

export default async function MonthlyHoroscopePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("monthlyHoroscopeWebTitle")} subtitle={t("monthlyHoroscopeWebSubtitle")}>
      <MonthlyHoroscopeOverview />
    </AppShell>
  );
}
