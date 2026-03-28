import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { AccountSetupForm } from "@/components/AccountSetupForm";

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
