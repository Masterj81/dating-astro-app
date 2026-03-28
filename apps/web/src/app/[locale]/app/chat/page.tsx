import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { ChatInbox } from "@/components/ChatInbox";

export default async function WebChatInboxPage() {
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("chatHubTitle")} subtitle={t("chatHubSubtitle")}>
      <ChatInbox />
    </AppShell>
  );
}
