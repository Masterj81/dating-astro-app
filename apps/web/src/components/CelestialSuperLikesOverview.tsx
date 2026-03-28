"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type SuperLikeStats = {
  available: number;
  maxDaily: number;
  usedToday: number;
  totalSent: number;
};

const MAX_DAILY_SUPER_LIKES = 5;

function getStartOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export function CelestialSuperLikesOverview() {
  const t = useTranslations("webApp");
  const [stats, setStats] = useState<SuperLikeStats>({
    available: MAX_DAILY_SUPER_LIKES,
    maxDaily: MAX_DAILY_SUPER_LIKES,
    usedToday: 0,
    totalSent: 0,
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
          available: MAX_DAILY_SUPER_LIKES,
          maxDaily: MAX_DAILY_SUPER_LIKES,
          usedToday: 0,
          totalSent: 0,
        });
        setLoading(false);
        return;
      }

      const todayIso = getStartOfTodayIso();

      const [{ count: totalSent, error: totalError }, { count: usedToday, error: todayError }] =
        await Promise.all([
          supabase
            .from("swipes")
            .select("*", { count: "exact", head: true })
            .eq("swiper_id", session.user.id)
            .eq("action", "super_like"),
          supabase
            .from("swipes")
            .select("*", { count: "exact", head: true })
            .eq("swiper_id", session.user.id)
            .eq("action", "super_like")
            .gte("created_at", todayIso),
        ]);

      if (totalError) {
        throw totalError;
      }

      if (todayError) {
        throw todayError;
      }

      const dailyUsed = usedToday ?? 0;

      setStats({
        available: Math.max(0, MAX_DAILY_SUPER_LIKES - dailyUsed),
        maxDaily: MAX_DAILY_SUPER_LIKES,
        usedToday: dailyUsed,
        totalSent: totalSent ?? 0,
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

  const steps = [
    {
      number: "1",
      title: t("superLikesStep1Title"),
      body: t("superLikesStep1Body"),
    },
    {
      number: "2",
      title: t("superLikesStep2Title"),
      body: t("superLikesStep2Body"),
    },
    {
      number: "3",
      title: t("superLikesStep3Title"),
      body: t("superLikesStep3Body"),
    },
  ];

  const benefits = [
    {
      title: t("superLikesBenefit1Title"),
      body: t("superLikesBenefit1Body"),
    },
    {
      title: t("superLikesBenefit2Title"),
      body: t("superLikesBenefit2Body"),
    },
    {
      title: t("superLikesBenefit3Title"),
      body: t("superLikesBenefit3Body"),
    },
  ];

  const tips = [
    t("superLikesTip1"),
    t("superLikesTip2"),
    t("superLikesTip3"),
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
          {t("superLikesEyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">{t("superLikesHeroTitle")}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">
          {t("superLikesHeroBody")}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("superLikesAvailable")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{stats.available}</p>
            <p className="mt-2 text-sm text-text-muted">
              {t("superLikesAvailableBody", { max: stats.maxDaily })}
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("superLikesUsedToday")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {stats.usedToday}/{stats.maxDaily}
            </p>
            <p className="mt-2 text-sm text-text-muted">{t("superLikesRefreshBody")}</p>
          </div>
          <div className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
              {t("superLikesTotalSent")}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{stats.totalSent}</p>
            <p className="mt-2 text-sm text-text-muted">{t("superLikesTotalSentBody")}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/discover"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("superLikesStart")}
          </Link>
          <button
            type="button"
            onClick={loadStats}
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("likesRefresh")}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("superLikesHowItWorksEyebrow")}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="rounded-[1.4rem] border border-border bg-bg/70 p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                {step.number}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("superLikesBenefitsEyebrow")}
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
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">{t("superLikesTipsEyebrow")}</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">{t("superLikesTipsTitle")}</h3>
          <div className="mt-6 space-y-3">
            {tips.map((tip) => (
              <div key={tip} className="rounded-[1.2rem] border border-border bg-bg/70 px-4 py-4 text-sm leading-7 text-text-muted">
                {tip}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
