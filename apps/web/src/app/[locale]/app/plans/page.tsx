import { AppShell } from "@/components/AppShell";
import { PlansCheckout } from "@/components/PlansCheckout";
import { getTranslations } from "next-intl/server";

export default async function PlansPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("plansTitle")} subtitle={t("plansSubtitle")}>
      <PlansCheckout />
    </AppShell>
  );
}
