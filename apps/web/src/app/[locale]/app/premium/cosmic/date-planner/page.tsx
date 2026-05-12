import { AppShell } from "@/components/AppShell";
import { DatePlannerOverview } from "@/components/DatePlannerOverview";
import { getTranslations } from "next-intl/server";

export default async function DatePlannerPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("dateReflectionV2Title")}
      subtitle={t("dateReflectionV2Subtitle")}
    >
      <DatePlannerOverview />
    </AppShell>
  );
}
