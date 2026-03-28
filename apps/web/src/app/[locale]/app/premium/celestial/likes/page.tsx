import { AppShell } from "@/components/AppShell";
import { CelestialLikesOverview } from "@/components/CelestialLikesOverview";
import { getTranslations } from "next-intl/server";

export default async function CelestialLikesPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("likesWebTitle")} subtitle={t("likesWebSubtitle")}>
      <CelestialLikesOverview />
    </AppShell>
  );
}
