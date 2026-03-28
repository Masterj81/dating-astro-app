"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type MonthlySection = {
  key: "love" | "career" | "wellbeing" | "luck";
  score: number;
};

type WeeklyForecast = {
  week: number;
  score: number;
  themeKey: string;
  bodyKey: string;
};

type ImportantDate = {
  day: number;
  eventKey: string;
  bodyKey: string;
  tone: "positive" | "neutral" | "challenging";
};

const TONE_STYLES: Record<ImportantDate["tone"], string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  neutral: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  challenging: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

function buildMonthlySections(seed: number): MonthlySection[] {
  return [
    { key: "love", score: 72 + (seed % 18) },
    { key: "career", score: 75 + ((seed + 4) % 17) },
    { key: "wellbeing", score: 64 + ((seed + 8) % 19) },
    { key: "luck", score: 70 + ((seed + 12) % 16) },
  ];
}

function buildWeeklyForecasts(seed: number): WeeklyForecast[] {
  return [
    {
      week: 1,
      score: 68 + (seed % 15),
      themeKey: "monthlyWeekTheme_1",
      bodyKey: "monthlyWeekBody_1",
    },
    {
      week: 2,
      score: 75 + ((seed + 4) % 14),
      themeKey: "monthlyWeekTheme_2",
      bodyKey: "monthlyWeekBody_2",
    },
    {
      week: 3,
      score: 62 + ((seed + 9) % 18),
      themeKey: "monthlyWeekTheme_3",
      bodyKey: "monthlyWeekBody_3",
    },
    {
      week: 4,
      score: 71 + ((seed + 13) % 17),
      themeKey: "monthlyWeekTheme_4",
      bodyKey: "monthlyWeekBody_4",
    },
  ];
}

function buildImportantDates(): ImportantDate[] {
  return [
    {
      day: 5,
      eventKey: "monthlyImportantEvent_1",
      bodyKey: "monthlyImportantBody_1",
      tone: "positive",
    },
    {
      day: 12,
      eventKey: "monthlyImportantEvent_2",
      bodyKey: "monthlyImportantBody_2",
      tone: "neutral",
    },
    {
      day: 18,
      eventKey: "monthlyImportantEvent_3",
      bodyKey: "monthlyImportantBody_3",
      tone: "challenging",
    },
    {
      day: 26,
      eventKey: "monthlyImportantEvent_4",
      bodyKey: "monthlyImportantBody_4",
      tone: "positive",
    },
  ];
}

export function MonthlyHoroscopeOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }),
    [locale]
  );

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

  const seed = (sunSign?.length || 6) * (today.getMonth() + 3) * 5;
  const sections = buildMonthlySections(seed);
  const weeks = buildWeeklyForecasts(seed);
  const importantDates = buildImportantDates();
  const overallScore = Math.round(
    sections.reduce((total, section) => total + section.score, 0) / sections.length
  );
  const translatedSign = sunSign ? translateSign(sunSign, locale) : t("statusUnknown");

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
          {t("monthlyHoroscopeSignIn")}
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
            {t("monthlyHoroscopeLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("monthlyHoroscopeLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("viewPlans")}
            </Link>
            <Link
              href="/app/premium/cosmic"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("premiumNav")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("monthlyHoroscopeMonthLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {monthFormatter.format(today)}
          </h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="rounded-full border border-border bg-bg/70 px-4 py-2 text-sm text-white">
              {t("dailyHoroscopeYourSign")}: {translatedSign}
            </span>
            <span className="rounded-full border border-border bg-bg/70 px-4 py-2 text-sm text-white">
              {t("monthlyOverallEnergy")}: {overallScore}%
            </span>
          </div>
          <p className="mt-5 text-sm leading-7 text-text-muted">
            {t("monthlyHoroscopeOverviewBody", {
              sign: translatedSign,
            })}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article
              key={section.key}
              className="rounded-[1.5rem] border border-border bg-card/90 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {t(`monthlySection_${section.key}`)}
                </h3>
                <div className="rounded-full border border-border bg-bg/70 px-3 py-1 text-sm font-semibold text-white">
                  {section.score}%
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {t(`monthlySectionBody_${section.key}`, {
                  sign: translatedSign,
                })}
              </p>
            </article>
          ))}
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("monthlyWeekTitle")}
          </p>
          <div className="mt-5 space-y-4">
            {weeks.map((week) => (
              <article
                key={week.week}
                className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                    {t("monthlyWeekLabel", { week: week.week })}
                  </div>
                  <div className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-white">
                    {week.score}%
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{t(week.themeKey)}</h3>
                <p className="mt-3 text-sm leading-7 text-text-muted">{t(week.bodyKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("monthlyImportantDatesTitle")}
          </p>
          <div className="mt-5 space-y-3">
            {importantDates.map((item) => (
              <div
                key={item.day}
                className="rounded-[1.4rem] border border-border bg-bg/70 p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${TONE_STYLES[item.tone]}`}
                  >
                    {item.day}
                  </div>
                  <p className="text-sm font-semibold text-white">{t(item.eventKey)}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-text-muted">{t(item.bodyKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("monthlyBestDaysTitle")}
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-text-muted">
            <p>{t("monthlyBestDays_love")}</p>
            <p>{t("monthlyBestDays_career")}</p>
            <p>{t("monthlyBestDays_manifestation")}</p>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
