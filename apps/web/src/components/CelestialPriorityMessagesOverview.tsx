"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type MessageStats = {
  sentCount: number;
  activeChats: number;
  unreadReceived: number;
};

export function CelestialPriorityMessagesOverview() {
  const t = useTranslations("webApp");
  const [stats, setStats] = useState<MessageStats>({
    sentCount: 0,
    activeChats: 0,
    unreadReceived: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setStats({
          sentCount: 0,
          activeChats: 0,
          unreadReceived: 0,
        });
        setLoading(false);
        return;
      }

      const [{ count: sentCount, error: sentError }, { data: matchesData, error: matchesError }] =
        await Promise.all([
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("sender_id", session.user.id),
          supabase.rpc("get_user_matches", {
            p_user_id: session.user.id,
          }),
        ]);

      if (sentError) {
        throw sentError;
      }

      if (matchesError) {
        throw matchesError;
      }

      const activeChats = ((matchesData as { match_id: string; unread_count: number | null }[]) || [])
        .filter((row) => row.match_id)
        .length;
      const unreadReceived = ((matchesData as { unread_count: number | null }[]) || []).reduce(
        (sum, row) => sum + (row.unread_count ?? 0),
        0
      );

      setStats({
        sentCount: sentCount ?? 0,
        activeChats,
        unreadReceived,
      });
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const benefits = [
    {
      title: t("priorityMessagesBenefit1Title"),
      body: t("priorityMessagesBenefit1Body"),
    },
    {
      title: t("priorityMessagesBenefit2Title"),
      body: t("priorityMessagesBenefit2Body"),
    },
    {
      title: t("priorityMessagesBenefit3Title"),
      body: t("priorityMessagesBenefit3Body"),
    },
  ];

  const starters = [
    t("priorityMessagesStarter1"),
    t("priorityMessagesStarter2"),
    t("priorityMessagesStarter3"),
  ];

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[rgba(232,93,117,0.24)] bg-[rgba(232,93,117,0.10)] p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("priorityMessagesEyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          {t("priorityMessagesHeroTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
          {t("priorityMessagesHeroBody")}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("priorityMessagesSent")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{stats.sentCount}</p>
            <p className="mt-2 text-sm text-text-muted">
              {t("priorityMessagesSentBody")}
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("priorityMessagesActiveChats")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{stats.activeChats}</p>
            <p className="mt-2 text-sm text-text-muted">
              {t("priorityMessagesActiveChatsBody")}
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("priorityMessagesUnread")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{stats.unreadReceived}</p>
            <p className="mt-2 text-sm text-text-muted">
              {t("priorityMessagesUnreadBody")}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/chat"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("priorityMessagesOpenChat")}
          </Link>
          <Link
            href="/app/discover"
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("discoverNav")}
          </Link>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("priorityMessagesDemoEyebrow")}
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          {t("priorityMessagesDemoTitle")}
        </h3>
        <div className="mt-6 space-y-3">
          <div className="rounded-[1.4rem] border border-border bg-bg/50 p-4 opacity-70">
            <p className="text-sm font-semibold text-white">{t("priorityMessagesDemoRegular")}</p>
            <p className="mt-2 text-sm text-text-muted">{t("priorityMessagesDemoRegularBody")}</p>
          </div>
          <div className="rounded-[1.4rem] border border-[rgba(232,93,117,0.3)] bg-[rgba(232,93,117,0.10)] p-4 shadow-[0_0_0_1px_rgba(232,93,117,0.08)]">
            <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              {t("priorityMessagesBadge")}
            </span>
            <p className="mt-3 text-sm font-semibold text-white">{t("priorityMessagesDemoPriority")}</p>
            <p className="mt-2 text-sm text-text-muted">{t("priorityMessagesDemoPriorityBody")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("priorityMessagesBenefitsEyebrow")}
          </p>
          <div className="mt-6 space-y-4">
            {benefits.map((benefit) => (
              <div key={benefit.title} className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
                <h3 className="text-lg font-semibold text-white">{benefit.title}</h3>
                <p className="mt-3 text-sm leading-7 text-text-muted">{benefit.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("priorityMessagesStartersEyebrow")}
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            {t("priorityMessagesStartersTitle")}
          </h3>
          <div className="mt-6 space-y-3">
            {starters.map((starter) => (
              <div
                key={starter}
                className="rounded-[1.2rem] border border-border bg-bg/70 px-4 py-4 text-sm leading-7 text-text-muted"
              >
                {starter}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
