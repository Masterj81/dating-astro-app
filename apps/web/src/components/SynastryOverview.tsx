"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
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

type SynastryProfile = {
  id: string;
  name: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  venus_sign?: string | null;
  mars_sign?: string | null;
  mercury_sign?: string | null;
  saturn_sign?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

type AspectRow = {
  title: string;
  influence: "harmonious" | "challenging" | "neutral";
  description: string;
};

const INFLUENCE_STYLES: Record<AspectRow["influence"], string> = {
  harmonious: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  challenging: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  neutral: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

const ELEMENTS: Record<string, string> = {
  Aries: "fire",
  Leo: "fire",
  Sagittarius: "fire",
  Taurus: "earth",
  Virgo: "earth",
  Capricorn: "earth",
  Gemini: "air",
  Libra: "air",
  Aquarius: "air",
  Cancer: "water",
  Scorpio: "water",
  Pisces: "water",
};

const COMPATIBILITY_MATRIX: Record<string, Record<string, number>> = {
  fire: { fire: 86, earth: 58, air: 92, water: 49 },
  earth: { fire: 58, earth: 88, air: 56, water: 90 },
  air: { fire: 92, earth: 56, air: 84, water: 64 },
  water: { fire: 49, earth: 90, air: 64, water: 87 },
};

function calculateFallbackCompatibilityFromSunSigns(
  mySunSign: string | null,
  otherSunSign: string | null,
  fallbackScore: number | null
) {
  const el1 = mySunSign ? ELEMENTS[mySunSign] : null;
  const el2 = otherSunSign ? ELEMENTS[otherSunSign] : null;

  if (!el1 || !el2) {
    return fallbackScore ?? 76;
  }

  return COMPATIBILITY_MATRIX[el1]?.[el2] ?? fallbackScore ?? 76;
}

function calculateOverallCompatibility(
  me: SynastryProfile,
  other: SynastryProfile,
  fallbackScore: number | null
) {
  return calculateFallbackCompatibilityFromSunSigns(
    me.sun_sign,
    other.sun_sign,
    fallbackScore
  );
}

function calculateAreaScores(total: number) {
  return [
    { key: "emotional", score: Math.min(96, total + 7) },
    { key: "communication", score: Math.max(55, total - 6) },
    { key: "attraction", score: Math.min(98, total + 10) },
    { key: "stability", score: Math.max(58, total - 2) },
  ];
}

export function SynastryOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [selfProfile, setSelfProfile] = useState<SynastryProfile | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [matchProfile, setMatchProfile] = useState<SynastryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMatch = useMemo(
    () => matches.find((match) => match.match_id === selectedMatchId) || null,
    [matches, selectedMatchId]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);

        if (!account?.userId) {
          setSelfProfile(null);
          setMatches([]);
          return;
        }

        const supabase = getSupabaseBrowser();
        const [{ data: me, error: meError }, { data: matchRows, error: matchesError }] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", account.userId).maybeSingle(),
            supabase.rpc("get_user_matches", {
              p_user_id: account.userId,
            }),
          ]);

        if (meError) {
          throw meError;
        }
        if (matchesError) {
          throw matchesError;
        }

        const nextMatches = (matchRows as MatchRow[]) || [];
        setSelfProfile((me as SynastryProfile | null) || null);
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

  useEffect(() => {
    const loadSelectedMatch = async () => {
      if (!activeMatch) {
        setMatchProfile(null);
        return;
      }

      try {
        setLoadingProfile(true);
        const supabase = getSupabaseBrowser();
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", activeMatch.matched_user_id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setMatchProfile((data as SynastryProfile | null) || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoadingProfile(false);
      }
    };

    loadSelectedMatch();
  }, [activeMatch, t]);

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
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("synastrySignIn")}</p>
      </div>
    );
  }

  if (state.tier === "free") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("natalChartNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("synastryLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("synastryLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("viewPlans")}
            </Link>
            <Link
              href="/app/premium/celestial"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openNatalChart")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("synastryEmptyTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("synastryEmptyBody")}</p>
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

  const me = selfProfile;
  const other = matchProfile;
  const totalScore =
    me && other ? calculateOverallCompatibility(me, other, activeMatch?.compatibility_overall ?? null) : null;
  const safeTotalScore = totalScore ?? 76;
  const areaScores = totalScore ? calculateAreaScores(totalScore) : [];
  const aspects: AspectRow[] =
    me && other
      ? [
          {
            title: `${t("synastryAspect_sunMoon")} (${me.sun_sign ? translateSign(me.sun_sign, locale) : "?"} • ${other.moon_sign ? translateSign(other.moon_sign, locale) : "?"})`,
            influence: safeTotalScore >= 80 ? "harmonious" : "neutral",
            description: t("synastryAspectBody_sunMoon"),
          },
          {
            title: `${t("synastryAspect_venusMars")} (${translateSign(me.venus_sign || me.sun_sign || "", locale) || "?"} • ${translateSign(other.mars_sign || other.sun_sign || "", locale) || "?"})`,
            influence: safeTotalScore >= 75 ? "harmonious" : "challenging",
            description: t("synastryAspectBody_venusMars"),
          },
          {
            title: `${t("synastryAspect_mercury")} (${translateSign(me.mercury_sign || me.sun_sign || "", locale) || "?"} • ${translateSign(other.mercury_sign || other.sun_sign || "", locale) || "?"})`,
            influence: "neutral",
            description: t("synastryAspectBody_mercury"),
          },
          {
            title: `${t("synastryAspect_saturn")} (${translateSign(me.saturn_sign || me.sun_sign || "", locale) || "?"} • ${other.sun_sign ? translateSign(other.sun_sign, locale) : "?"})`,
            influence: safeTotalScore >= 70 ? "harmonious" : "challenging",
            description: t("synastryAspectBody_saturn"),
          },
        ]
      : [];

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          {t("synastryMatchListLabel")}
        </p>
        <h2 className="mt-3 text-xl font-semibold text-white">{t("synastryMatchListTitle")}</h2>
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
                    src={resolveImageSrc(match.matched_user_image)}
                    alt={match.matched_user_name || t("unknownUser")}
                    fill
                    sizes="48px"
                    unoptimized={shouldBypassImageOptimization(resolveImageSrc(match.matched_user_image))}
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {match.matched_user_name || t("unknownUser")}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("discoverSun")}: {match.matched_user_sun_sign ? translateSign(match.matched_user_sun_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-white">
                  {calculateFallbackCompatibilityFromSunSigns(
                    selfProfile?.sun_sign ?? null,
                    match.matched_user_sun_sign,
                    match.compatibility_overall ?? null
                  )}%
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
              <p className="text-sm font-semibold text-white">{me?.name || state.displayName}</p>
              <p className="mt-2 text-sm text-text-muted">
                {me?.sun_sign ? translateSign(me.sun_sign, locale) : "?"} • {me?.moon_sign ? translateSign(me.moon_sign, locale) : "?"} • {me?.rising_sign ? translateSign(me.rising_sign, locale) : "?"}
              </p>
            </div>
            <div className="flex items-center justify-center text-3xl text-white/90">✦</div>
            <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
              <p className="text-sm font-semibold text-white">
                {other?.name || activeMatch?.matched_user_name || t("unknownUser")}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {other?.sun_sign ? translateSign(other.sun_sign, locale) : activeMatch?.matched_user_sun_sign ? translateSign(activeMatch.matched_user_sun_sign, locale) : "?"} • {other?.moon_sign ? translateSign(other.moon_sign, locale) : "?"} • {other?.rising_sign ? translateSign(other.rising_sign, locale) : "?"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-accent bg-accent/10 text-center">
              <div>
                <div className="text-3xl font-bold text-white">{totalScore ?? "--"}%</div>
                <div className="mx-auto mt-1 max-w-[4.5rem] text-[10px] font-medium leading-tight tracking-[0.08em] text-text-dim">
                  {t("cosmicCompatibility")}
                </div>
              </div>
            </div>
            <p className="text-sm leading-7 text-text-muted">
              {t("synastryOverviewBody")}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {areaScores.map((area) => (
            <article
              key={area.key}
              className="rounded-[1.5rem] border border-border bg-card/90 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">
                  {t(`synastryArea_${area.key}`)}
                </h3>
                <div className="rounded-full border border-border bg-bg/70 px-3 py-1 text-sm font-semibold text-white">
                  {area.score}%
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {t(`synastryAreaBody_${area.key}`)}
              </p>
            </article>
          ))}
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("keyAspects")}
          </p>
          <div className="mt-5 space-y-3">
            {loadingProfile ? (
              <div className="rounded-2xl border border-border bg-bg/70 px-4 py-4 text-sm text-text-muted">
                {t("loading")}
              </div>
            ) : (
              aspects.map((aspect) => (
                <div
                  key={aspect.title}
                  className="rounded-[1.4rem] border border-border bg-bg/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">{aspect.title}</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${INFLUENCE_STYLES[aspect.influence]}`}
                    >
                      {t(aspect.influence)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-text-muted">
                    {aspect.description}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
