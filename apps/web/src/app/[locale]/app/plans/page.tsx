import { AppShell } from "@/components/AppShell";
import { PlansCheckout } from "@/components/PlansCheckout";
import { getTranslations } from "next-intl/server";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlansPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("plansTitle")} subtitle={t("plansSubtitle")}>
      <PlansCheckout />
    </AppShell>
  );
}

