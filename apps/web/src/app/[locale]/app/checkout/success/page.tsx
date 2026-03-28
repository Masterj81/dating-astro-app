import { AppShell } from "@/components/AppShell";
import { CheckoutSuccessCard } from "@/components/CheckoutSuccessCard";
import { getTranslations } from "next-intl/server";

export default async function CheckoutSuccessPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("checkoutSuccessTitle")} subtitle={t("checkoutSuccessSubtitle")}>
      <CheckoutSuccessCard />
    </AppShell>
  );
}
