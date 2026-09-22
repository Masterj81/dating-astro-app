import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { ChatInbox } from "@/components/ChatInbox";

// JUNO-13 (diag) : le layout force-dynamic ne se propage pas sur le runtime Vercel ;
// chaque page porte son propre segment config.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WebChatInboxPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("chatHubTitle")} subtitle={t("chatHubSubtitle")}>
      <ChatInbox />
    </AppShell>
  );
}

