"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import { CompatibilityDotsArc } from "@/components/CompatibilityDotsArc";
import { SynastryOverviewSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

// Picker entry. Mirrors the get_synastry_candidate_profiles RPC return
// shape — same preference filtering as Discover, minus the swipes
// exclusion so already-passed / already-liked profiles are still
// available for compatibility comparison.
type CandidateProfile = {
  id: string;
  name: string | null;
  age: number | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  bio: string | null;
  image_url: string | null;
  images: string[] | null;
  is_verified: boolean | null;
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

function normalizeSign(sign: string | null | undefined): string | null {
  if (!sign) return null;
  const trimmed = sign.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function calculateFallbackCompatibilityFromSunSigns(
  mySunSign: string | null,
  otherSunSign: string | null,
  fallbackScore: number | null
) {
  const el1 = ELEMENTS[normalizeSign(mySunSign) ?? ""] ?? null;
  const el2 = ELEMENTS[normalizeSign(otherSunSign) ?? ""] ?? null;

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

export function SynastryOverview({ initialProfileId = null }: { initialProfileId?: string | null }) {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [selfProfile, setSelfProfile] = useState<SynastryProfile | null>(null);
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [matchProfile, setMatchProfile] = useState<SynastryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedProfileId) || null,
    [candidates, selectedProfileId]
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
          setCandidates([]);
          return;
        }

        const supabase = getSupabaseBrowser();
        // Phase 3-B: own profile via SECURITY DEFINER RPC. Candidate set
        // is everyone matching the caller's discovery preferences (not
        // just matches/likes) so the picker reflects who they could
        // potentially compare charts with.
        const [{ data: ownRows, error: meError }, { data: candidateRows, error: candidatesError }] =
          await Promise.all([
            supabase.rpc("get_my_full_profile"),
            supabase.rpc("get_synastry_candidate_profiles", {
              p_user_id: account.userId,
              p_limit: 50,
            }),
          ]);

        if (meError) {
          throw meError;
        }
        if (candidatesError) {
          throw candidatesError;
        }

        const ownData = Array.isArray(ownRows) ? ownRows[0] : null;
        let nextCandidates = (candidateRows as CandidateProfile[]) || [];
        setSelfProfile(
          ownData
            ? ({
                id: ownData.id,
                name: ownData.name,
                sun_sign: ownData.sun_sign,
                moon_sign: ownData.moon_sign,
                rising_sign: ownData.rising_sign,
                image_url: ownData.image_url,
                images: ownData.images,
              } as SynastryProfile)
            : null
        );

        // Deep-link handling. If a profileId came in via ?profileId= and
        // it's already in the candidate set, just pre-select it. If it's
        // outside the set (e.g. a swiped profile that no longer matches
        // current preferences), still try to load it via get-profile-chart
        // and prepend so the link works. On failure, fall back silently
        // to the first candidate.
        let initialSelected: string | null = null;
        if (initialProfileId) {
          const inSet = nextCandidates.find((c) => c.id === initialProfileId);
          if (inSet) {
            initialSelected = initialProfileId;
          } else {
            try {
              const { data: payload, error: chartError } = await supabase.functions.invoke(
                "get-profile-chart",
                { body: { targetUserId: initialProfileId } }
              );
              if (chartError) throw chartError;
              const profilePayload = payload as
                | {
                    success?: boolean;
                    profile?: {
                      id: string;
                      name?: string | null;
                      sun_sign?: string | null;
                      moon_sign?: string | null;
                      rising_sign?: string | null;
                      image_url?: string | null;
                      images?: string[] | null;
                      age?: number | null;
                      bio?: string | null;
                      is_verified?: boolean | null;
                    };
                    error?: string;
                  }
                | null;
              if (profilePayload?.success && profilePayload.profile) {
                const p = profilePayload.profile;
                nextCandidates = [
                  {
                    id: p.id,
                    name: p.name ?? null,
                    age: p.age ?? null,
                    sun_sign: p.sun_sign ?? null,
                    moon_sign: p.moon_sign ?? null,
                    rising_sign: p.rising_sign ?? null,
                    bio: p.bio ?? null,
                    image_url: p.image_url ?? null,
                    images: p.images ?? null,
                    is_verified: p.is_verified ?? null,
                  },
                  ...nextCandidates,
                ];
                initialSelected = p.id;
              } else {
                console.warn(
                  "[synastry] deep-link target not loadable, falling back",
                  profilePayload?.error
                );
              }
            } catch (deepLinkError) {
              console.warn("[synastry] deep-link load failed, falling back", deepLinkError);
            }
          }
        }

        setCandidates(nextCandidates);
        setSelectedProfileId(initialSelected ?? nextCandidates[0]?.id ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t, initialProfileId]);

  useEffect(() => {
    const loadSelectedMatch = async () => {
      if (!selectedProfileId) {
        setMatchProfile(null);
        return;
      }

      try {
        setLoadingProfile(true);
        const supabase = getSupabaseBrowser();
        // Phase 3-B: match profile + chart via edge function. The function
        // reads the target via service_role and returns a sanitized payload —
        // birth_time, birth_date, raw lat/long, email are NEVER included.
        const { data: payload, error: profileError } = await supabase.functions.invoke(
          "get-profile-chart",
          { body: { targetUserId: selectedProfileId } }
        );

        if (profileError) {
          throw profileError;
        }

        type ChartPlanet = { sign?: string | null };
        type ChartPlanets = Record<"venus" | "mars" | "mercury" | "saturn", ChartPlanet | undefined>;
        type ProfileChartResponse = {
          success?: boolean;
          profile?: {
            id: string;
            name?: string | null;
            sun_sign?: string | null;
            moon_sign?: string | null;
            rising_sign?: string | null;
            image_url?: string | null;
            images?: string[] | null;
          };
          chart?: { planets?: ChartPlanets } | null;
          error?: string;
        };

        const response = payload as ProfileChartResponse | null;

        if (!response?.success || !response.profile) {
          throw new Error(response?.error || t("unknownError"));
        }

        const c = response.chart;
        setMatchProfile({
          id: response.profile.id,
          name: response.profile.name ?? null,
          sun_sign: response.profile.sun_sign ?? null,
          moon_sign: response.profile.moon_sign ?? null,
          rising_sign: response.profile.rising_sign ?? null,
          venus_sign: c?.planets?.venus?.sign ?? null,
          mars_sign: c?.planets?.mars?.sign ?? null,
          mercury_sign: c?.planets?.mercury?.sign ?? null,
          saturn_sign: c?.planets?.saturn?.sign ?? null,
          image_url: response.profile.image_url ?? null,
          images: response.profile.images ?? null,
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoadingProfile(false);
      }
    };

    loadSelectedMatch();
  }, [selectedProfileId, t]);

  if (loading) {
    return <SynastryOverviewSkeleton ariaLabel={t("loading")} />;
  }

  if (!state) {
    return (
      <EmptyState
        icon="🔒"
        title={t("notSignedIn")}
        body={t("synastrySignIn")}
      />
    );
  }

  if (state.tier === "free") {
    return (
      <EmptyState
        icon="✨"
        eyebrow={t("natalChartNav")}
        title={t("synastryLockedTitle")}
        body={t("synastryLockedBody")}
        action={
          <>
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
          </>
        }
      />
    );
  }

  if (!candidates.length) {
    return (
      <EmptyState
        icon="🌠"
        title={t("synastryEmptyTitle")}
        body={t("synastryEmptyBody")}
        action={
          <>
            <Link
              href="/app/profile"
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {t("openProfile")}
            </Link>
            <Link
              href="/app/discover"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openDiscover")}
            </Link>
          </>
        }
      />
    );
  }

  const me = selfProfile;
  const other = matchProfile;
  const totalScore =
    me && other ? calculateOverallCompatibility(me, other, null) : null;
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
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setSelectedProfileId(candidate.id)}
              className={`w-full rounded-[1.25rem] border px-4 py-4 text-left transition-colors ${
                candidate.id === selectedProfileId
                  ? "border-accent/40 bg-accent/10"
                  : "border-border bg-bg/70 hover:bg-card-hover"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-bg-secondary">
                  <Image
                    src={resolveImageSrc(candidate.image_url, candidate.images?.[0])}
                    alt={candidate.name || t("unknownUser")}
                    fill
                    sizes="48px"
                    unoptimized={shouldBypassImageOptimization(
                      resolveImageSrc(candidate.image_url, candidate.images?.[0])
                    )}
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {candidate.name || t("unknownUser")}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("discoverSun")}: {candidate.sun_sign ? translateSign(candidate.sun_sign, locale) : "?"}
                  </p>
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-white">
                  {calculateFallbackCompatibilityFromSunSigns(
                    selfProfile?.sun_sign ?? null,
                    candidate.sun_sign,
                    null
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
                {other?.name || activeCandidate?.name || t("unknownUser")}
              </p>
              <p className="mt-2 text-sm text-text-muted">
                {other?.sun_sign ? translateSign(other.sun_sign, locale) : activeCandidate?.sun_sign ? translateSign(activeCandidate.sun_sign, locale) : "?"} • {other?.moon_sign ? translateSign(other.moon_sign, locale) : "?"} • {other?.rising_sign ? translateSign(other.rising_sign, locale) : "?"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
            <div className="flex justify-center md:justify-start">
              {totalScore != null ? (
                <CompatibilityDotsArc
                  percentage={totalScore}
                  size={140}
                  showScore
                  label={t("cosmicCompatibility")}
                />
              ) : (
                <div
                  className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/10 bg-white/[0.03] text-center"
                  aria-label={t("cosmicCompatibility")}
                  role="img"
                >
                  <div>
                    <div className="text-3xl font-bold text-white/40">--</div>
                    <div className="mx-auto mt-1 max-w-[4.5rem] text-[10px] font-medium leading-tight tracking-[0.08em] text-text-dim">
                      {t("cosmicCompatibility")}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <p className="text-sm leading-7 text-text-muted">
              {t("synastryOverviewBody")}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {areaScores.map((area) => {
            const areaLabel = t(`synastryArea_${area.key}`);
            return (
              <article
                key={area.key}
                className="flex items-start gap-4 rounded-[1.5rem] border border-border bg-card/90 p-5"
              >
                {/* Mini arc echoes the hero score's visual language — same
                    dot palette + animation, just shrunk. Label is intentionally
                    omitted: the h3 next door already carries the zone name,
                    and the arc's own role="img" aria-label ("Compatibility N%")
                    pairs with the heading for assistive tech. */}
                <div className="shrink-0">
                  <CompatibilityDotsArc
                    percentage={area.score}
                    size={80}
                    showScore
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-white sm:text-lg">
                    {areaLabel}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-text-muted">
                    {t(`synastryAreaBody_${area.key}`)}
                  </p>
                </div>
              </article>
            );
          })}
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
