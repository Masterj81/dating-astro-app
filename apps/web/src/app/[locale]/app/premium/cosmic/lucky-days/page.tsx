import { AppShell } from "@/components/AppShell";
import { LuckyDaysOverview } from "@/components/LuckyDaysOverview";
import { getTranslations } from "next-intl/server";

export default async function LuckyDaysPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("luckyDaysWebTitle")} subtitle={t("luckyDaysWebSubtitle")}>
      <LuckyDaysOverview />
    </AppShell>
  );
}
