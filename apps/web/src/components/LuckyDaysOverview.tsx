"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type LuckyCategoryKey = "love" | "career" | "money" | "health" | "creativity";

type LuckyDay = {
  day: number;
  score: number;
  luckyWindow: string;
  bestForKeys: string[];
  avoidKeys: string[];
};

const CATEGORY_KEYS: LuckyCategoryKey[] = ["love", "career", "money", "health", "creativity"];

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function wrapDay(day: number, daysInMonth: number) {
  return ((day - 1) % daysInMonth) + 1;
}

function buildLuckyDays(
  category: LuckyCategoryKey,
  seed: number,
  daysInMonth: number
): LuckyDay[] {
  const startOffset = seed % 6;
  const spacing = 4 + (seed % 3);

  const detailMap: Record<LuckyCategoryKey, { bestForKeys: string[]; avoidKeys: string[] }> = {
    love: {
      bestForKeys: ["luckyDaysBestFor_romance", "luckyDaysBestFor_vulnerability"],
      avoidKeys: ["luckyDaysAvoid_conflict"],
    },
    career: {
      bestForKeys: ["luckyDaysBestFor_pitch", "luckyDaysBestFor_planning"],
      avoidKeys: ["luckyDaysAvoid_rushing"],
    },
    money: {
      bestForKeys: ["luckyDaysBestFor_budget", "luckyDaysBestFor_negotiation"],
      avoidKeys: ["luckyDaysAvoid_impulse"],
    },
    health: {
      bestForKeys: ["luckyDaysBestFor_routine", "luckyDaysBestFor_rest"],
      avoidKeys: ["luckyDaysAvoid_overload"],
    },
    creativity: {
      bestForKeys: ["luckyDaysBestFor_brainstorm", "luckyDaysBestFor_expression"],
      avoidKeys: ["luckyDaysAvoid_doubt"],
    },
  };

  return Array.from({ length: 5 }, (_, index) => ({
    day: wrapDay(startOffset + 2 + index * spacing, daysInMonth),
    score: 72 + ((seed + index * 9) % 25),
    luckyWindow: `${9 + ((seed + index) % 8)}:00 - ${11 + ((seed + index) % 8)}:30`,
    bestForKeys: detailMap[category].bestForKeys,
    avoidKeys: detailMap[category].avoidKeys,
  })).sort((a, b) => a.day - b.day);
}

export function LuckyDaysOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LuckyCategoryKey>("love");
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const today = useMemo(() => new Date(), []);
  const daysInMonth = useMemo(() => getDaysInMonth(today), [today]);

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

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }),
    [locale]
  );

  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [locale]
  );

  const categoryDays = useMemo(() => {
    const baseSeed = (sunSign?.length || 5) * (today.getDate() + 3);
    return CATEGORY_KEYS.reduce<Record<LuckyCategoryKey, LuckyDay[]>>((acc, category, index) => {
      acc[category] = buildLuckyDays(category, baseSeed + index * 7, daysInMonth);
      return acc;
    }, {} as Record<LuckyCategoryKey, LuckyDay[]>);
  }, [daysInMonth, sunSign, today]);

  const activeDays = categoryDays[selectedCategory];
  const signLabel = sunSign ? translateSign(sunSign, locale) : t("statusUnknown");

  useEffect(() => {
    setSelectedDay(activeDays?.[0]?.day ?? null);
  }, [activeDays]);

  const selectedLuckyDay =
    activeDays.find((entry) => entry.day === selectedDay) ?? activeDays[0] ?? null;
  const nextLuckyDay =
    activeDays.find((entry) => entry.day >= today.getDate()) ?? activeDays[0] ?? null;

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
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("luckyDaysSignIn")}</p>
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
            {t("luckyDaysLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("luckyDaysLockedBody")}
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
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("luckyDaysMonthLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("luckyDaysFor", { sign: signLabel })}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("luckyDaysOverviewBody", {
              sign: signLabel,
              month: monthFormatter.format(today),
            })}
          </p>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("luckyDaysCategoryTitle")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {CATEGORY_KEYS.map((category) => {
              const isActive = selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "border-[rgba(232,93,117,0.34)] bg-[rgba(232,93,117,0.18)] text-white"
                      : "border-border bg-bg/70 text-text-muted hover:bg-card-hover hover:text-white"
                  }`}
                >
                  {t(`luckyDaysCategory_${category}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-sm leading-7 text-text-muted">
            {t(`luckyDaysCategoryBody_${selectedCategory}`)}
          </p>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("luckyDaysCalendarTitle")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                {monthFormatter.format(today)}
              </h3>
            </div>
            {nextLuckyDay ? (
              <div className="rounded-full border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] px-4 py-2 text-sm font-semibold text-emerald-200">
                {t("luckyDaysNextTitle")}: {nextLuckyDay.day}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {activeDays.map((entry) => {
              const date = new Date(today.getFullYear(), today.getMonth(), entry.day);
              const isSelected = selectedLuckyDay?.day === entry.day;

              return (
                <button
                  key={entry.day}
                  type="button"
                  onClick={() => setSelectedDay(entry.day)}
                  className={`rounded-[1.5rem] border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-[rgba(124,108,255,0.32)] bg-[rgba(124,108,255,0.12)]"
                      : "border-border bg-bg/70 hover:bg-card-hover"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                    {t("luckyDaysBestDay")}
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    {fullDateFormatter.format(date)}
                  </h4>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-white">
                      {t("luckyDaysEnergy")}: {entry.score}%
                    </span>
                    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-white">
                      {t("luckyDaysLuckyWindow")}: {entry.luckyWindow}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        {selectedLuckyDay ? (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("luckyDaysBestDay")}
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-white">
              {fullDateFormatter.format(
                new Date(today.getFullYear(), today.getMonth(), selectedLuckyDay.day)
              )}
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("luckyDaysEnergy")}
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {selectedLuckyDay.score}%
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("luckyDaysLuckyWindow")}
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {selectedLuckyDay.luckyWindow}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("luckyDaysBestFor")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLuckyDay.bestForKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded-full border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] px-3 py-1 text-xs text-emerald-200"
                  >
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("luckyDaysAvoid")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLuckyDay.avoidKeys.map((key) => (
                  <span
                    key={key}
                    className="rounded-full border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.12)] px-3 py-1 text-xs text-amber-200"
                  >
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("luckyDaysTipsTitle")}
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-text-muted">
            <p>{t("luckyDaysTip_1")}</p>
            <p>{t("luckyDaysTip_2")}</p>
            <p>{t("luckyDaysTip_3")}</p>
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
