"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type HoroscopeSection = {
  key: "love" | "career" | "wellbeing" | "lucky";
  score: number;
};

function buildSectionScores(seed: number): HoroscopeSection[] {
  return [
    { key: "love", score: 72 + (seed % 18) },
    { key: "career", score: 65 + ((seed + 5) % 21) },
    { key: "wellbeing", score: 70 + ((seed + 8) % 19) },
    { key: "lucky", score: 68 + ((seed + 11) % 22) },
  ];
}

export function DailyHoroscopeOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(today);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);

        if (!account?.userId) {
          setSunSign(null);
          return;
        }

        const supabase = getSupabaseBrowser();
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("sun_sign")
          .eq("id", account.userId)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setSunSign(data?.sun_sign || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const signKey = sunSign?.toLowerCase();
  const signLabel = sunSign ? translateSign(sunSign, locale) : "?";
  const seed = (today.getDate() + (signKey?.length || 0)) * 7;
  const sections = buildSectionScores(seed);
  const overallEnergy = Math.round(
    sections.reduce((total, section) => total + section.score, 0) / sections.length
  );

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("notSignedIn")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("dailyHoroscopeSignIn")}
        </p>
      </div>
    );
  }

  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("dailyHoroscopeLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("dailyHoroscopeLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("viewPlans")}
            </Link>
            <Link
              href="/app/profile"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openProfile")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("dailyHoroscopeDateLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">{formattedDate}</h2>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <div className="rounded-full border border-border bg-bg/70 px-4 py-2 text-white">
              {t("dailyHoroscopeYourSign")}: {signLabel}
            </div>
            <div className="rounded-full border border-border bg-bg/70 px-4 py-2 text-white">
              {t("dailyHoroscopeEnergy")}: {overallEnergy}%
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-text-muted">
            {t("dailyHoroscopeOverviewBody", {
              sign: signLabel,
            })}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article
              key={section.key}
              className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                    {t(`dailyHoroscopeSection_${section.key}`)}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {t(`dailyHoroscopeSection_${section.key}`)}
                  </h3>
                </div>
                <div className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-white">
                  {section.score}%
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-text-muted">
                {t(`dailyHoroscopeSectionBody_${section.key}`, {
                  sign: signLabel,
                })}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-[rgba(232,93,117,0.24)] bg-[rgba(232,93,117,0.10)] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("dailyHoroscopeAffirmation")}
          </p>
          <p className="mt-3 text-lg font-medium text-white">
            {t("dailyHoroscopeAffirmationBody", {
              sign: signLabel,
            })}
          </p>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("dailyHoroscopeRightLabel")}
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white">
          {t("dailyHoroscopeRightTitle")}
        </h3>
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("dailyHoroscopeLuckyWindow")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {`${(seed % 9) + 1}:00 - ${(seed % 9) + 3}:30`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("dailyHoroscopeLuckyNumbers")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {`${(seed % 11) + 3}, ${(seed % 17) + 8}, ${(seed % 23) + 12}`}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("dailyHoroscopeFocus")}
            </p>
            <p className="mt-3 text-sm leading-7 text-text-muted">
              {t("dailyHoroscopeFocusBody")}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
