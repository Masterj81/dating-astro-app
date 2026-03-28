import { AppShell } from "@/components/AppShell";
import { NatalChartOverview } from "@/components/NatalChartOverview";
import { getTranslations } from "next-intl/server";

export default async function NatalChartPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("natalChartWebTitle")}
      subtitle={t("natalChartWebSubtitle")}
    >
      <NatalChartOverview />
    </AppShell>
  );
}
