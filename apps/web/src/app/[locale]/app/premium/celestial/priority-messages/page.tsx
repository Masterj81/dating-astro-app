import { AppShell } from "@/components/AppShell";
import { CelestialPriorityMessagesOverview } from "@/components/CelestialPriorityMessagesOverview";
import { getTranslations } from "next-intl/server";

export default async function CelestialPriorityMessagesPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("priorityMessagesWebTitle")}
      subtitle={t("priorityMessagesWebSubtitle")}
    >
      <CelestialPriorityMessagesOverview />
    </AppShell>
  );
}
