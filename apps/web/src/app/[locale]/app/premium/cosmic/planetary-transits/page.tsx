import { AppShell } from "@/components/AppShell";
import { PlanetaryTransitsOverview } from "@/components/PlanetaryTransitsOverview";
import { getTranslations } from "next-intl/server";

export default async function PlanetaryTransitsPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("planetaryTransitsWebTitle")}
      subtitle={t("planetaryTransitsWebSubtitle")}
    >
      <PlanetaryTransitsOverview />
    </AppShell>
  );
}
