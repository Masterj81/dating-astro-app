import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ChatThread";
import { getTranslations } from "next-intl/server";

// NOTE: the URL segment is still called `matchId` for back-compat with
// any external links / bookmarks; semantically it's now a conversation_id.
// Renaming the segment would invalidate every existing chat URL the user
// already has, so we accept the legacy name and pass it through as a
// conversation id internally.
//
// `?prefill=<question>` is used by the icebreaker CTA (DiscoverOverview /
// ProfileDetail) to seed the composer with the target's icebreaker
// question. Decoded once here, then passed to the client component as a
// prop — never auto-sends, the user always confirms with the send button.
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ prefill?: string | string[] }>;
}) {
  const { matchId: conversationId } = await params;
  const { prefill: rawPrefill } = await searchParams;
  const prefill = typeof rawPrefill === "string" ? rawPrefill : undefined;
  const t = await getTranslations("webApp");

  return (
    <AppShell title={t("chatPageTitle")} subtitle={t("chatPageSubtitle")}>
      <ChatThread conversationId={conversationId} initialPrefill={prefill} />
    </AppShell>
  );
}
