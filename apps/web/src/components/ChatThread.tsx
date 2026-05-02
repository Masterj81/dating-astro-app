"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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
  otherUserImage: string | null;
  otherUserSunSign: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
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

export function ChatThread({ conversationId, initialPrefill }: ChatThreadProps) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<ConversationListRow[]>([]);
  // Seed the composer once with the icebreaker prefill (if any). Plain
  // useState initializer so navigating away and back without the param
  // doesn't clobber a draft the user has been typing.
  const [draft, setDraft] = useState<string>(initialPrefill ?? "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const markMessagesRead = async (
    supabase: ReturnType<typeof getSupabaseBrowser>,
    currentUserId: string,
    nextMessages: Message[]
  ) => {
    const unreadIds = nextMessages
      .filter((message) => message.sender_id !== currentUserId && !message.is_read)
      .map((message) => message.id);

    if (!unreadIds.length) {
      return;
    }

    await supabase
      .from("messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in("id", unreadIds);
  };

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
          .select("id, name, photos, sun_sign")
          .eq("id", otherUserId)
          .maybeSingle(),
        supabase
          .from("messages")
          .select("id, conversation_id, sender_id, content, created_at, is_read")
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
        otherUserImage: profile?.photos?.[0] || null,
        otherUserSunSign: profile?.sun_sign || null,
      });
      setConversations((conversationsData as ConversationListRow[]) || []);
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
            await markMessagesRead(supabase, userId, [nextMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, userId]);

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

      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
      });

      if (insertError) {
        throw insertError;
      }
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
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
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
          className="mt-6 inline-flex rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {t("chatNav")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.55fr_1.45fr]">
      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
                        </p>
                        {conversation.unread_count ? (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
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

      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="flex min-h-[640px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.5rem] border border-border bg-bg/60 px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl bg-bg-secondary">
                <Image
                  src={resolveImageSrc(conversationInfo.otherUserImage)}
                  alt={conversationInfo.otherUserName}
                  fill
                  sizes="64px"
                  unoptimized={shouldBypassImageOptimization(resolveImageSrc(conversationInfo.otherUserImage))}
                  className="object-cover"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("chatWith")}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{conversationInfo.otherUserName}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {t("discoverSun")}: {conversationInfo.otherUserSunSign || "?"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/app/chat"
                className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
              >
                {t("backToChat") || t("chatNav")}
              </Link>
              <Link
                href={`/app/profile/${conversationInfo.otherUserId}`}
                className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
              >
                {t("matchesViewProfile")}
              </Link>
            </div>
          </div>

          <div role="log" aria-live="polite" aria-label={t("chatNav")} className="mt-6 flex-1 space-y-3 overflow-y-auto rounded-[1.5rem] border border-border bg-bg/40 p-4 pr-3">
            {messages.length ? (
              messages.map((message) => {
                const isMine = message.sender_id === userId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-[1.5rem] px-4 py-3 text-sm ${
                        isMine
                          ? "rounded-br-md bg-accent text-white"
                          : "rounded-bl-md border border-border bg-bg/80 text-white"
                      }`}
                    >
                      <p className="leading-6">{message.content}</p>
                      <p
                        className={`mt-2 text-xs ${
                          isMine ? "text-white/75" : "text-text-muted"
                        }`}
                      >
                        {formatTimestamp(message.created_at, locale)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.5rem] border border-border bg-bg/50 px-6 text-center text-sm text-text-muted">
                {t("chatEmpty")}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="mt-6">
            <div className="flex gap-3">
              <label htmlFor="chat-composer" className="sr-only">{t("chatPlaceholder")}</label>
              <textarea
                id="chat-composer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={t("chatPlaceholder")}
                rows={3}
                className="min-h-[96px] flex-1 rounded-[1.5rem] border border-border bg-bg px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-text-dim focus:border-accent"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                className="self-end rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {sending ? t("loading") : t("chatSend")}
              </button>
            </div>
            <p className="mt-2 text-xs text-text-dim">{t("chatComposerHint")}</p>
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
