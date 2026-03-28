import { AppShell } from "@/components/AppShell";
import { RetrogradeAlertsOverview } from "@/components/RetrogradeAlertsOverview";
import { getTranslations } from "next-intl/server";

export default async function RetrogradeAlertsPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("retrogradeWebTitle")} subtitle={t("retrogradeWebSubtitle")}>
      <RetrogradeAlertsOverview />
    </AppShell>
  );
}
