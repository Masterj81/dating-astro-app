"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ChatListSkeleton } from "@/components/Skeleton";

// Conversation-first: rows now come from `get_user_conversations` RPC.
// Compatibility % is intentionally absent.
type ConversationRow = {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string | null;
  other_user_image: string | null;
  other_user_sun_sign: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string | null;
  unread_count: number | null;
};

function formatRelativeDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  if (diffMinutes < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMinutes, "minute");
  if (diffHours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
}

export function ChatInbox() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  // get_user_conversations RPC doesn't return age, so we enrich client-side
  // with a single follow-up batch SELECT against `profiles`. Keeps the
  // canonical RPC unchanged while still surfacing age in the inbox.
  const [agesByUserId, setAgesByUserId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) { setConversations([]); setLoading(false); return; }
      const { data, error: rpcError } = await supabase.rpc("get_user_conversations");
      if (rpcError) throw rpcError;
      const rows = (data as ConversationRow[]) || [];
      setConversations(rows);

      const otherIds = Array.from(
        new Set(rows.map((r) => r.other_user_id).filter(Boolean))
      );
      if (otherIds.length) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, age")
          .in("id", otherIds);
        const nextAges: Record<string, number> = {};
        for (const row of (profileRows as Array<{ id: string; age: number | null }>) || []) {
          if (typeof row.age === "number") nextAges[row.id] = row.age;
        }
        setAgesByUserId(nextAges);
      } else {
        setAgesByUserId({});
      }
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <ChatListSkeleton ariaLabel={t("loading")} rows={4} />;
  }

  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-purple/10 text-5xl" aria-hidden="true">
          💬
        </div>
        <h2 className="text-2xl font-semibold text-white">{t("chatInboxEmptyTitle")}</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-text-muted">
          {t("chatInboxEmptyBody")}
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/app/discover"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("discoverNav")}
          </Link>
        </div>
      </div>
    );
  }

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // Sort: unread first, then by last message date
  const sorted = [...conversations].sort((a, b) => {
    if ((a.unread_count || 0) > 0 && !(b.unread_count || 0)) return -1;
    if ((b.unread_count || 0) > 0 && !(a.unread_count || 0)) return 1;
    const aTime = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  return (
    <div className="space-y-4">
      {/* Unread indicator */}
      {totalUnread > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/8 px-5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            {totalUnread}
          </span>
          <span className="text-sm font-medium text-white">
            {t("matchesUnread", { count: totalUnread })}
          </span>
        </div>
      )}

      {/* Chat list — messenger style. Compatibility % is intentionally absent. */}
      <div className="overflow-hidden rounded-2xl border border-border">
        {sorted.map((conversation, index) => {
          const profileImage = resolveImageSrc(conversation.other_user_image);
          const relativeDate = formatRelativeDate(conversation.last_message_at || conversation.created_at, locale);
          const hasUnread = (conversation.unread_count || 0) > 0;

          return (
            <Link
              key={conversation.conversation_id}
              href={`/app/chat/${conversation.conversation_id}`}
              className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.06] ${
                index > 0 ? "border-t border-white/6" : ""
              } ${hasUnread ? "bg-white/[0.03]" : ""}`}
            >
              {/* Avatar with online-like indicator */}
              <div className="relative shrink-0">
                <div className="relative h-14 w-14 overflow-hidden rounded-full bg-bg-secondary ring-2 ring-transparent ring-offset-2 ring-offset-[#090b13]">
                  <Image
                    src={profileImage}
                    alt={conversation.other_user_name || t("unknownUser")}
                    fill
                    sizes="56px"
                    unoptimized={shouldBypassImageOptimization(profileImage)}
                    className="object-cover"
                  />
                </div>
                {hasUnread && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white ring-2 ring-[#090b13]"
                    aria-label={t("matchesUnread", { count: conversation.unread_count || 0 })}
                  >
                    {conversation.unread_count}
                  </span>
                )}
              </div>

              {/* Message content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`truncate text-[15px] ${hasUnread ? "font-bold text-white" : "font-medium text-white/90"}`}>
                    {conversation.other_user_name || t("unknownUser")}
                    {agesByUserId[conversation.other_user_id] != null
                      ? `, ${agesByUserId[conversation.other_user_id]}`
                      : ""}
                  </h3>
                  {relativeDate && (
                    <span className={`shrink-0 text-xs ${hasUnread ? "font-semibold text-accent" : "text-text-dim"}`}>
                      {relativeDate}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className={`truncate text-sm ${hasUnread ? "font-medium text-white/80" : "text-text-muted"}`}>
                    {conversation.last_message || (
                      <span className="italic">{t("matchesNoMessage")}</span>
                    )}
                  </p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-text-dim">
                    ☀️ {conversation.other_user_sun_sign
                      ? translateSign(conversation.other_user_sun_sign, locale)
                      : "?"}
                  </span>
                </div>
              </div>

              {/* Arrow */}
              <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-text-dim" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      )}
    </div>
  );
}
