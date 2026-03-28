import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/DashboardOverview";
import { WebAppEntryGate } from "@/components/WebAppEntryGate";
import { getTranslations } from "next-intl/server";

export default async function WebAppHomePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell subtitle={t("dashboardSubtitle")}>
      <WebAppEntryGate />
      <DashboardOverview />
    </AppShell>
  );
}
