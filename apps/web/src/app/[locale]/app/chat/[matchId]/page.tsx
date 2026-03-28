import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { getTranslations } from "next-intl/server";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("chatPageTitle")} subtitle={t("chatPageSubtitle")}>
      <ChatThread matchId={matchId} />
    </AppShell>
  );
}
