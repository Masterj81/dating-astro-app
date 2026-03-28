import { AppShell } from "@/components/AppShell";
import { MatchesOverview } from "@/components/MatchesOverview";
import { getTranslations } from "next-intl/server";

export default async function MatchesPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("matchesPageTitle")} subtitle={t("matchesPageSubtitle")}>
      <MatchesOverview />
    </AppShell>
  );
}
