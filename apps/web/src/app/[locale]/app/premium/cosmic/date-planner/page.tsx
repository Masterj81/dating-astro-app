import { AppShell } from "@/components/AppShell";
import { DatePlannerOverview } from "@/components/DatePlannerOverview";
import { getTranslations } from "next-intl/server";

export default async function DatePlannerPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("datePlannerWebTitle")} subtitle={t("datePlannerWebSubtitle")}>
      <DatePlannerOverview />
    </AppShell>
  );
}
