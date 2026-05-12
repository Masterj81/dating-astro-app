import { AppShell } from "@/components/AppShell";
import { SynastryOverview } from "@/components/SynastryOverview";
import { getTranslations } from "next-intl/server";

export default async function SynastryPage({
  searchParams,
}: {
  searchParams: Promise<{ profileId?: string }>;
}) {
  const t = await getTranslations("webApp");
  const { profileId } = await searchParams;

  return (
    <AppShell title={t("synastryWebTitle")} subtitle={t("synastryWebSubtitle")}>
      <SynastryOverview initialProfileId={profileId ?? null} />
    </AppShell>
  );
}
