import { AppShell } from "@/components/AppShell";
import { SynastryOverview } from "@/components/SynastryOverview";
import { getTranslations } from "next-intl/server";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

