import { AppShell } from "@/components/AppShell";
import { CelestialSuperLikesOverview } from "@/components/CelestialSuperLikesOverview";
import { getTranslations } from "next-intl/server";

export default async function CelestialSuperLikesPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("superLikesWebTitle")} subtitle={t("superLikesWebSubtitle")}>
      <CelestialSuperLikesOverview />
    </AppShell>
  );
}
