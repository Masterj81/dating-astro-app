import { AppShell } from "@/components/AppShell";
import { TarotReadingOverview } from "@/components/TarotReadingOverview";
import { getTranslations } from "next-intl/server";

export default async function CelestialTarotPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("tarotReading")}
      subtitle={t("monthlyTarotSubtitle")}
    >
      <TarotReadingOverview />
    </AppShell>
  );
}
