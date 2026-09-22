import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { AccountSetupForm } from "@/components/AccountSetupForm";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WebAccountSetupPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("setupWorkspaceTitle")}
      subtitle={t("setupWorkspaceSubtitle")}
    >
      <AccountSetupForm />
    </AppShell>
  );
}

