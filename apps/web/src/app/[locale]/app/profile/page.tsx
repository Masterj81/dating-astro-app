import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { AccountProfileWorkspace } from "@/components/AccountProfileWorkspace";

export default async function WebAccountProfilePage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell
      title={t("profileWorkspaceTitle")}
      subtitle={t("profileWorkspaceSubtitle")}
    >
      <AccountProfileWorkspace />
    </AppShell>
  );
}
