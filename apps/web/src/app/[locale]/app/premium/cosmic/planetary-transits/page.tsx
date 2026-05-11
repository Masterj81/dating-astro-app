import { AppShell } from "@/components/AppShell";
import { PlanetaryTransitsOverview } from "@/components/PlanetaryTransitsOverview";
import { getTranslations } from "next-intl/server";

export default async function PlanetaryTransitsPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("transitReflectionV2PageTitle")}
      subtitle={t("transitReflectionV2PageSubtitle")}
    >
      <PlanetaryTransitsOverview />
    </AppShell>
  );
}
