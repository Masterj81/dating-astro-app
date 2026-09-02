"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ChatThreadSkeleton } from "@/components/Skeleton";
import { resolveCoachSign } from "@astro/shared/coach";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";

type ChatThreadProps = {
  conversationId: string;
  // Optional prefill string sourced from `?prefill=` on the chat URL —
  // used by the icebreaker CTA to seed the composer with the target's
  // icebreaker question. Never auto-sends; user always confirms.
  initialPrefill?: string;
};

type ConversationInfo = {
  id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserAge: number | null;
  otherUserImage: string | null;
  otherUserSunSign: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  /** 'text' | 'icebreaker' | unset (treated as 'text'). */
  message_type?: string | null;
  created_at: string;
  is_read?: boolean;
};

type ConversationListRow = {
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

function formatTimestamp(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeDate(value: string | null, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  }
  if (diffMinutes < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMinutes, "minute");
  }
  if (diffHours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
}

/** Day-bucket label for in-thread date dividers — "today", "yesterday", "April 23". */
function formatDayDivider(value: string, locale: string): string {
  const at = new Date(value);
  at.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((at.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0 || diffDays === -1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diffDays, "day");
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

/**
 * Group consecutive messages from the same sender within a 5-minute window so
 * the bubble stack reads as one "turn" rather than four disconnected boxes.
 * Icebreaker messages always stand alone — they're a distinct visual species
 * and would dilute the chip if collapsed into a normal bubble group.
 */
type MessageGroup = {
  sender_id: string;
  isIcebreaker: boolean;
  messages: Message[];
};

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const isIcebreaker = msg.message_type === "icebreaker";
    const last = groups[groups.length - 1];
    const lastMsg = last?.messages[last.messages.length - 1];
    const closeInTime =
      lastMsg
        ? new Date(msg.created_at).getTime() - new Date(lastMsg.created_at).getTime() <
          5 * 60 * 1000
        : false;
    if (
      last &&
      last.sender_id === msg.sender_id &&
      !isIcebreaker &&
      !last.isIcebreaker &&
      closeInTime
    ) {
      last.messages.push(msg);
    } else {
      groups.push({ sender_id: msg.sender_id, isIcebreaker, messages: [msg] });
    }
  }
  return groups;
}

/** Paper-plane send icon — same stroke language as NavIcons / PremiumGlyph. */
function SendIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 11.5 21 4l-7.5 17-2-7-8-2.5Z" />
      <path d="M11.5 13 21 4" />
    </svg>
  );
}

export function ChatThread({ conversationId, initialPrefill }: ChatThreadProps) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationListRow[]>([]);
  // Sidebar uses the same get_user_conversations shape as the inbox; the RPC
  // omits age, so we enrich with a single batch profiles SELECT.
  const [sidebarAgesByUserId, setSidebarAgesByUserId] = useState<Record<string, number>>({});
  // Seed the composer once with the icebreaker prefill (if any). Plain
  // useState initializer so navigating away and back without the param
  // doesn't clobber a draft the user has been typing.
  const [draft, setDraft] = useState<string>(initialPrefill ?? "");
  // Track whether the prefill is still untouched in the composer — used
  // to swap the generic composer hint for the "edit before sending"
  // helper while the user is still working with the seeded prompt.
  // Cleared on first edit (or send) and never re-enters TRUE on that
  // mount, so we don't nag once the user has signed off on their copy.
  const [prefillActive, setPrefillActive] = useState<boolean>(Boolean(initialPrefill));
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const markMessagesRead = useCallback(
    async (
      supabase: ReturnType<typeof getSupabaseBrowser>,
      currentUserId: string,
      nextMessages: Message[]
    ) => {
      const hasUnreadIncoming = nextMessages
        .filter((message) => message.sender_id !== currentUserId && !message.is_read)
        .length > 0;

      if (!hasUnreadIncoming) {
        return;
      }

      const { error: markReadError } = await supabase.rpc("mark_conversation_messages_read", {
        p_conversation_id: conversationId,
      });

      if (markReadError) {
        throw markReadError;
      }

      setMessages((current) =>
        current.map((message) =>
          message.sender_id !== currentUserId && !message.is_read
            ? { ...message, is_read: true }
            : message
        )
      );
      setConversations((current) =>
        current.map((conversation) =>
          conversation.conversation_id === conversationId
            ? { ...conversation, unread_count: 0 }
            : conversation
        )
      );
    },
    [conversationId]
  );

  const loadThread = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setUserId(null);
        setConversationInfo(null);
        setMessages([]);
        setConversations([]);
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      // RLS on `conversations` already restricts SELECT to participants;
      // an extra defense-in-depth check after the fetch validates the row.
      const [{ data: conversation, error: conversationError }, { data: conversationsData, error: conversationsError }] =
        await Promise.all([
          supabase
            .from("conversations")
            .select("id, user_a, user_b")
            .eq("id", conversationId)
            .maybeSingle(),
          supabase.rpc("get_user_conversations"),
        ]);

      if (conversationError || !conversation) {
        throw conversationError || new Error("Conversation not found");
      }

      if (
        conversation.user_a !== session.user.id &&
        conversation.user_b !== session.user.id
      ) {
        throw new Error("Unauthorized");
      }

      if (conversationsError) {
        throw conversationsError;
      }

      const otherUserId =
        conversation.user_a === session.user.id ? conversation.user_b : conversation.user_a;

      const [{ data: profile }, { data: threadMessages, error: messageError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, age, photos, sun_sign")
          .eq("id", otherUserId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id, conversation_id, sender_id, content, message_type, created_at, is_read")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      ]);

      if (messageError) {
        throw messageError;
      }

      const nextMessages = (threadMessages as Message[]) || [];

      setConversationInfo({
        id: conversation.id,
        otherUserId,
        otherUserName: profile?.name || t("unknownUser"),
        otherUserAge: typeof profile?.age === "number" ? profile.age : null,
        otherUserImage: profile?.photos?.[0] || null,
        otherUserSunSign: profile?.sun_sign || null,
      });
      const conversationRows = (conversationsData as ConversationListRow[]) || [];
      setConversations(conversationRows);

      const sidebarOtherIds = Array.from(
        new Set(conversationRows.map((r) => r.other_user_id).filter(Boolean))
      );
      if (sidebarOtherIds.length) {
        const { data: sidebarProfiles } = await supabase
          .from("profiles")
          .select("id, age")
          .in("id", sidebarOtherIds);
        const nextAges: Record<string, number> = {};
        for (const row of (sidebarProfiles as Array<{ id: string; age: number | null }>) || []) {
          if (typeof row.age === "number") nextAges[row.id] = row.age;
        }
        setSidebarAgesByUserId(nextAges);
      } else {
        setSidebarAgesByUserId({});
      }

      setMessages(nextMessages);
      await markMessagesRead(supabase, session.user.id, nextMessages);
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`web-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const nextMessage = payload.new as Message;

          setMessages((current) => {
            if (current.some((message) => message.id === nextMessage.id)) {
              return current;
            }
            return [...current, nextMessage];
          });

          if (userId) {
            try {
              await markMessagesRead(supabase, userId, [nextMessage]);
            } catch (markReadFailure) {
              console.error("Error marking messages as read:", markReadFailure);
            }
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, userId, markMessagesRead]);

  const handleSend = async () => {
    if (!draft.trim() || !userId || !conversationInfo) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      const supabase = getSupabaseBrowser();
      const content = draft.trim();
      setDraft("");
      setPrefillActive(false);

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
      });

      if (insertError) {
        throw insertError;
      }
      // Re-focus composer after a successful send so a user can keep typing
      // without reaching for the mouse.
      composerRef.current?.focus();
    } catch (sendFailure) {
      setError(sendFailure instanceof Error ? sendFailure.message : t("unknownError"));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = async (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handleSend();
    }
  };

  if (loading) {
    return <ChatThreadSkeleton ariaLabel={t("loading")} />;
  }

  if (!conversationInfo) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("chatUnavailableTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("chatUnavailableBody")}
        </p>
        <Link
          href="/app/chat"
          className="mt-6 inline-flex rounded-full bg-gold px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
        >
          {t("chatNav")}
        </Link>
      </div>
    );
  }

  const profileHref = `/app/profile/${conversationInfo.otherUserId}`;
  const sunLabel = conversationInfo.otherUserSunSign
    ? translateSign(conversationInfo.otherUserSunSign, locale)
    : null;
  const groups = groupMessages(messages);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.55fr_1.45fr]">
      <aside className="hidden rounded-[2rem] border border-border bg-card/90 p-6 xl:block">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
              {t("chatRecentLabel")}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">{t("chatRecentTitle")}</h2>
          </div>
          <Link
            href="/app/chat"
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("chatNav")}
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {conversations.length ? (
            conversations.map((conversation) => {
              const isActive = conversation.conversation_id === conversationId;
              const relativeDate = formatRelativeDate(
                conversation.last_message_at || conversation.created_at,
                locale
              );

              return (
                <Link
                  key={conversation.conversation_id}
                  href={`/app/chat/${conversation.conversation_id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`block rounded-[1.25rem] border px-4 py-4 transition-colors ${
                    isActive
                      ? "border-accent/40 bg-accent/10"
                      : "border-border bg-bg/70 hover:bg-card-hover"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-bg-secondary">
                      <Image
                        src={resolveImageSrc(conversation.other_user_image)}
                        alt={conversation.other_user_name || t("unknownUser")}
                        fill
                        sizes="48px"
                        unoptimized={shouldBypassImageOptimization(resolveImageSrc(conversation.other_user_image))}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-white">
                          {conversation.other_user_name || t("unknownUser")}
                          {sidebarAgesByUserId[conversation.other_user_id] != null
                            ? `, ${sidebarAgesByUserId[conversation.other_user_id]}`
                            : ""}
                        </p>
                        {conversation.unread_count ? (
                          <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-bg">
                            {conversation.unread_count}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {conversation.last_message || t("matchesNoMessage")}
                      </p>
                      {relativeDate ? (
                        <p className="mt-1 text-xs text-text-dim">{relativeDate}</p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="rounded-[1.25rem] border border-border bg-bg/70 px-4 py-4 text-sm text-text-muted">
              {t("chatRecentEmpty")}
            </div>
          )}
        </div>
      </aside>

      <section className="overflow-hidden rounded-[2rem] border border-border bg-card/90">
        <div className="flex min-h-[640px] flex-col">
          {/*
           * Sticky header — clickable identity strip that opens the profile.
           * Sticks to the top of the viewport (or just below the AppShell
           * mobile topbar at ~56px) so the conversation context is always
           * present even on long threads. backdrop-blur keeps it readable
           * over scrolled message bubbles.
           */}
          <div className="sticky top-[56px] z-20 -mx-px border-b border-white/8 bg-card/85 backdrop-blur-xl lg:top-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <Link
                href={profileHref}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 transition-colors hover:bg-white/[0.04]"
                aria-label={t("matchesViewProfile")}
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-bg-secondary ring-1 ring-white/10">
                  <Image
                    src={resolveImageSrc(conversationInfo.otherUserImage)}
                    alt={conversationInfo.otherUserName}
                    fill
                    sizes="48px"
                    unoptimized={shouldBypassImageOptimization(
                      resolveImageSrc(conversationInfo.otherUserImage)
                    )}
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white sm:text-lg">
                    {conversationInfo.otherUserName}
                    {conversationInfo.otherUserAge != null
                      ? `, ${conversationInfo.otherUserAge}`
                      : ""}
                  </p>
                  {sunLabel ? (
                    <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
                      <ZodiacGlyph
                        sign={conversationInfo.otherUserSunSign}
                        className="text-sm leading-none text-accent"
                        ariaLabel={sunLabel}
                      />
                      <span>{sunLabel}</span>
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-text-dim">
                      {t("discoverSun")}: ?
                    </span>
                  )}
                </div>
                <span
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-text-dim transition-colors group-hover:border-white/30 group-hover:text-white sm:flex"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 3l5 5-5 5" />
                  </svg>
                </span>
              </Link>

              <div className="flex shrink-0 gap-2">
                {/* Conversation Guide, at the moment of need. Shown to every
                    account, free included: the "Start a conversation" situation
                    is free for all twelve signs and asks the server nothing, and
                    this — not a premium hub — is where someone actually does not
                    know what to say. `resolveCoachSign` returns null rather than
                    guessing when the other profile has no usable Sun sign; the
                    guide then opens on its own picker instead of putting someone
                    else's advice under this person's name. */}
                <Link
                  href={
                    resolveCoachSign(conversationInfo.otherUserSunSign)
                      ? `/app/premium/conversation-guide?sign=${resolveCoachSign(
                          conversationInfo.otherUserSunSign
                        )}`
                      : "/app/premium/conversation-guide"
                  }
                  data-testid="chat-conversation-guide-chip"
                  className="rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/20 sm:px-4 sm:text-sm"
                >
                  {t("conversationGuideChatChip")}
                </Link>
                <Link
                  href="/app/chat"
                  className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:bg-card-hover hover:text-white sm:px-4 sm:text-sm xl:hidden"
                >
                  {t("backToChat") || t("chatNav")}
                </Link>
              </div>
            </div>
          </div>

          {/* Message scroll surface */}
          <div
            role="log"
            aria-live="polite"
            aria-label={t("chatNav")}
            className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          >
            {messages.length ? (
              <div className="space-y-4">
                {groups.map((group, groupIndex) => {
                  const isMine = group.sender_id === userId;
                  const firstMsg = group.messages[0];
                  const prevGroup = groups[groupIndex - 1];
                  const prevMsg = prevGroup?.messages[prevGroup.messages.length - 1];
                  const showDayDivider =
                    !prevMsg ||
                    new Date(prevMsg.created_at).toDateString() !==
                      new Date(firstMsg.created_at).toDateString();

                  if (group.isIcebreaker) {
                    const message = group.messages[0];
                    return (
                      <div key={message.id} className="space-y-3">
                        {showDayDivider && (
                          <DayDivider label={formatDayDivider(message.created_at, locale)} />
                        )}
                        <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <article
                            className={`max-w-[85%] rounded-2xl border p-4 shadow-[0_8px_24px_rgba(201, 134, 146, 0.12)] ${
                              isMine
                                ? "rounded-br-md border-accent/35 bg-[linear-gradient(135deg,rgba(201, 134, 146, 0.18),rgba(201, 134, 146, 0.08))]"
                                : "rounded-bl-md border-accent/30 bg-[linear-gradient(135deg,rgba(201, 134, 146, 0.12),rgba(255, 255, 255, 0.02))]"
                            }`}
                          >
                            <p className="mb-1.5 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent/90">
                              <span aria-hidden="true">✦</span>
                              <span>{t("chatIcebreakerChip")}</span>
                            </p>
                            <p className="text-sm leading-6 text-white">{message.content}</p>
                            <p
                              className={`mt-2 text-[11px] ${
                                isMine ? "text-white/70" : "text-text-dim"
                              }`}
                            >
                              {formatTimestamp(message.created_at, locale)}
                            </p>
                          </article>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={`${group.sender_id}-${groupIndex}`} className="space-y-1.5">
                      {showDayDivider && (
                        <DayDivider label={formatDayDivider(firstMsg.created_at, locale)} />
                      )}
                      <div
                        className={`flex flex-col ${isMine ? "items-end" : "items-start"} gap-1`}
                      >
                        {group.messages.map((message, index) => {
                          const isFirst = index === 0;
                          const isLast = index === group.messages.length - 1;
                          // Tailwind composition for the "tail" effect — only the
                          // first/last bubble in a group rounds the corner that
                          // points away from the sender.
                          let bubbleRounding: string;
                          if (group.messages.length === 1) {
                            bubbleRounding = isMine ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md";
                          } else if (isFirst) {
                            bubbleRounding = isMine ? "rounded-t-2xl rounded-bl-2xl rounded-br-md" : "rounded-t-2xl rounded-br-2xl rounded-bl-md";
                          } else if (isLast) {
                            bubbleRounding = isMine ? "rounded-b-2xl rounded-tl-2xl rounded-tr-md" : "rounded-b-2xl rounded-tr-2xl rounded-tl-md";
                          } else {
                            bubbleRounding = isMine ? "rounded-l-2xl rounded-r-md" : "rounded-r-2xl rounded-l-md";
                          }

                          return (
                            <div
                              key={message.id}
                              className={`max-w-[85%] px-4 py-2.5 text-sm leading-6 ${
                                isMine
                                  ? "bg-gold text-bg"
                                  : "border border-border bg-bg/70 text-white"
                              } ${bubbleRounding}`}
                            >
                              {message.content}
                            </div>
                          );
                        })}
                        <p
                          className={`px-1 text-[11px] ${
                            isMine ? "text-text-dim" : "text-text-dim"
                          }`}
                        >
                          {formatTimestamp(
                            group.messages[group.messages.length - 1].created_at,
                            locale
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-white/[0.04] text-2xl text-accent">
                  ✦
                </div>
                <p className="max-w-xs text-sm leading-7 text-text-muted">{t("chatEmpty")}</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="border-t border-white/6 bg-bg/30 px-4 py-4 sm:px-6">
            <div className="flex items-end gap-3">
              <label htmlFor="chat-composer" className="sr-only">
                {t("chatPlaceholder")}
              </label>
              <textarea
                id="chat-composer"
                ref={composerRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (prefillActive) {
                    setPrefillActive(false);
                  }
                }}
                onKeyDown={handleComposerKeyDown}
                placeholder={t("chatPlaceholder")}
                rows={2}
                className="min-h-[56px] flex-1 resize-none rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                aria-label={t("chatSend")}
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-gold px-5 text-sm font-semibold text-bg transition-all hover:bg-gold-soft hover:shadow-[0_8px_20px_rgba(201, 134, 146, 0.3)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
              >
                <SendIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{sending ? t("loading") : t("chatSend")}</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-text-dim">
              {prefillActive ? t("chatPrefillHint") : t("chatComposerHint")}
            </p>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-4 mb-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7] sm:mx-6"
          >
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="h-px flex-1 bg-white/8" aria-hidden="true" />
      <span className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/8" aria-hidden="true" />
    </div>
  );
}
