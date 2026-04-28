import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { getTranslations } from "next-intl/server";

// NOTE: the URL segment is still called `matchId` for back-compat with
// any external links / bookmarks; semantically it's now a conversation_id.
// Renaming the segment would invalidate every existing chat URL the user
// already has, so we accept the legacy name and pass it through as a
// conversation id internally.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId: conversationId } = await params;
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("chatPageTitle")} subtitle={t("chatPageSubtitle")}>
      <ChatThread conversationId={conversationId} />
    </AppShell>
  );
}
