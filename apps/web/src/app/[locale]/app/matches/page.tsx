import { redirect } from "next/navigation";

// Conversation-first product change: the legacy "Matches" tab no longer
// exists. Any link to /app/matches forwards to the conversation list so
// older bookmarks and external links still resolve.
export default async function MatchesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/app/chat`);
}
