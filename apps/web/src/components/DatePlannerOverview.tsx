"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type MatchRow = {
  match_id: string;
  matched_user_id: string;
  matched_user_name: string | null;
  matched_user_image: string | null;
  matched_user_sun_sign: string | null;
  compatibility_overall: number | null;
};

type DiscoverableProfile = {
  id: string;
  name: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  venus_sign?: string | null;
  mars_sign?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

type DateScore = {
  date: Date;
  overallScore: number;
  moonSign: string;
  venusSign: string;
  bestHours: string[];
  descriptionKey: string;
  moonPhaseScore: number;
  venusScore: number;
  marsScore: number;
};

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

function getScoreTone(score: number) {
  if (score >= 85) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  if (score >= 72) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

function buildDateScores(seed: number): DateScore[] {
  return Array.from({ length: 10 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);

    const overallScore = 62 + ((seed + index * 11) % 31);
    const moonPhaseScore = 58 + ((seed + index * 7) % 34);
    const venusScore = 60 + ((seed + index * 5) % 32);
    const marsScore = 55 + ((seed + index * 9) % 36);

    return {
      date,
      overallScore,
      moonSign: SIGNS[(seed + index) % SIGNS.length],
      venusSign: SIGNS[(seed + index + 3) % SIGNS.length],
      bestHours: [`${10 + (index % 4)}:00 - ${12 + (index % 4)}:00`, `${18 + (index % 3)}:00 - ${20 + (index % 3)}:00`],
      descriptionKey:
        overallScore >= 85
          ? "datePlannerDescription_excellent"
          : overallScore >= 72
            ? "datePlannerDescription_good"
            : "datePlannerDescription_challenging",
      moonPhaseScore,
      venusScore,
      marsScore,
    };
  }).sort((a, b) => b.overallScore - a.overallScore);
}

export function DatePlannerOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<DiscoverableProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);

        if (!account?.userId) {
          setMatches([]);
          return;
        }

        const supabase = getSupabaseBrowser();
        const { data, error: matchesError } = await supabase.rpc("get_user_matches", {
          p_user_id: account.userId,
        });

        if (matchesError) {
          throw matchesError;
        }

        const nextMatches = (data as MatchRow[]) || [];
        setMatches(nextMatches);
        setSelectedMatchId(nextMatches[0]?.match_id || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const activeMatch = useMemo(
    () => matches.find((match) => match.match_id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    const loadMatch = async () => {
      if (!activeMatch) {
        setSelectedMatch(null);
        return;
      }

      try {
        setLoadingMatch(true);
        const supabase = getSupabaseBrowser();
        const { data, error: profileError } = await supabase
          .from("discoverable_profiles")
          .select("*")
          .eq("id", activeMatch.matched_user_id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setSelectedMatch((data as DiscoverableProfile | null) || null);
        setSelectedDateIndex(0);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoadingMatch(false);
      }
    };

    loadMatch();
  }, [activeMatch, t]);

  const dateScores = useMemo(() => {
    const seed =
      (selectedMatch?.sun_sign?.length || 7) * 13 +
      (selectedMatch?.name?.length || activeMatch?.matched_user_name?.length || 5) * 3;
    return buildDateScores(seed);
  }, [activeMatch?.matched_user_name, selectedMatch]);

  const topDates = dateScores.slice(0, 5);
  const selectedDate = topDates[selectedDateIndex] || topDates[0] || null;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [locale]
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
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("datePlannerSignIn")}</p>
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
            {t("datePlannerLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("datePlannerLockedBody")}
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

  if (!matches.length) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("datePlannerEmptyTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("datePlannerEmptyBody")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/matches"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("openMatches")}
          </Link>
          <Link
            href="/app/discover"
            className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
          >
            {t("openDiscover")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("datePlannerMatchListLabel")}
        </p>
        <h2 className="mt-3 text-xl font-semibold text-white">{t("datePlannerMatchListTitle")}</h2>
        <div className="mt-5 space-y-3">
          {matches.map((match) => (
            <button
              key={match.match_id}
              type="button"
              onClick={() => setSelectedMatchId(match.match_id)}
              className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition-colors ${
                match.match_id === selectedMatchId
                  ? "border-accent/40 bg-accent/10"
                  : "border-border bg-bg/70 hover:bg-card-hover"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-bg-secondary">
                  <Image
                    src={match.matched_user_image || "/icon-512.png"}
                    alt={match.matched_user_name || t("unknownUser")}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {match.matched_user_name || t("unknownUser")}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("discoverSun")}:{" "}
                    {match.matched_user_sun_sign
                      ? translateSign(match.matched_user_sun_sign, locale)
                      : "?"}
                  </p>
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-white">
                  {match.compatibility_overall || 78}%
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("datePlannerTimingLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("datePlannerFor", {
              name: selectedMatch?.name || activeMatch?.matched_user_name || t("unknownUser"),
            })}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("datePlannerOverviewBody")}
          </p>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("datePlannerTopDates")}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">{t("datePlannerTopDatesBody")}</h3>
            </div>
            {loadingMatch ? (
              <span className="text-sm text-text-muted">{t("loading")}</span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            {topDates.map((score, index) => (
              <button
                key={score.date.toISOString()}
                type="button"
                onClick={() => setSelectedDateIndex(index)}
                className={`rounded-[1.4rem] border p-4 text-left transition-colors ${
                  selectedDateIndex === index
                    ? "border-accent/40 bg-accent/10"
                    : "border-border bg-bg/70 hover:bg-card-hover"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                  #{index + 1}
                </p>
                <h4 className="mt-2 text-sm font-semibold text-white">
                  {dateFormatter.format(score.date)}
                </h4>
                <div
                  className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getScoreTone(score.overallScore)}`}
                >
                  {score.overallScore}%
                </div>
              </button>
            ))}
          </div>
        </div>

        {selectedDate ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[2rem] border border-border bg-card/90 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("datePlannerBestDate")}
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-white">
                {dateFormatter.format(selectedDate.date)}
              </h3>
              <p className="mt-4 text-sm leading-7 text-text-muted">
                {t(selectedDate.descriptionKey)}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-bg/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                    {t("datePlannerMoonPhase")}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {selectedDate.moonPhaseScore}%
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-bg/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                    {t("datePlannerVenus")}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {selectedDate.venusScore}%
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-bg/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                    {t("datePlannerMars")}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {selectedDate.marsScore}%
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[2rem] border border-border bg-card/90 p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("datePlannerCosmicWeather")}
                </p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-border bg-bg/70 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                      {t("datePlannerMoonIn")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {translateSign(selectedDate.moonSign, locale)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-bg/70 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                      {t("datePlannerVenusIn")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {translateSign(selectedDate.venusSign, locale)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                  {t("datePlannerBestHours")}
                </p>
                <div className="mt-4 space-y-3">
                  {selectedDate.bestHours.map((slot, index) => (
                    <div
                      key={slot}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg/70 px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-white">{slot}</span>
                      {index === 0 ? (
                        <span className="rounded-full border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] px-3 py-1 text-xs font-semibold text-emerald-200">
                          {t("recommended")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
