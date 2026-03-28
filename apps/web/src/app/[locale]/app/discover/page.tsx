import { AppShell } from "@/components/AppShell";
import { DiscoverOverview } from "@/components/DiscoverOverview";
import { getTranslations } from "next-intl/server";

export default async function DiscoverPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("discoverTitle")} subtitle={t("dashboardDiscoverBody")}>
      <DiscoverOverview />
    </AppShell>
  );
}
