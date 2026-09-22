import { AppShell } from "@/components/AppShell";
import { NatalChartOverview } from "@/components/NatalChartOverview";
import { getTranslations } from "next-intl/server";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NatalChartPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("natalChartWebTitle")}
      subtitle={t("natalChartWebSubtitle")}
    >
      <NatalChartOverview />
    </AppShell>
  );
}

