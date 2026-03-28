import { AppShell } from "@/components/AppShell";
import { SynastryOverview } from "@/components/SynastryOverview";
import { getTranslations } from "next-intl/server";

export default async function SynastryPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("synastryWebTitle")} subtitle={t("synastryWebSubtitle")}>
      <SynastryOverview />
    </AppShell>
  );
}
