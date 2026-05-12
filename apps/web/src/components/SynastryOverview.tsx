"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { resolveImageSrc, shouldBypassImageOptimization } from "@/lib/image-utils";
import {
  calculateSunCompatibility,
  calculateZoneScores,
  getElement,
  getScoreBand,
  getWhyFactors,
  shouldShowWatchFor,
  type SynastryElement,
  type WhyFactor,
  type ZoneScore,
} from "@/lib/synastry";
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

// Defensively pull a planet sign out of the birth_chart JSONB returned
// by get_my_full_profile. The shape may be either:
//   birth_chart.planets.{planet}.sign
//   birth_chart.{planet}.sign
// Anything else — null, primitive, missing key, non-string sign —
// resolves to null so the dimension card falls back to Sun × Sun.
function pickPlanetSign(
  birthChart: unknown,
  planet: "mercury" | "venus" | "mars" | "saturn"
): string | null {
  if (!birthChart || typeof birthChart !== "object") return null;
  const root = birthChart as Record<string, unknown>;
  const nestedPlanets =
    root.planets && typeof root.planets === "object"
      ? (root.planets as Record<string, unknown>)
      : null;
  const candidate = nestedPlanets?.[planet] ?? root[planet];
  if (!candidate || typeof candidate !== "object") return null;
  const sign = (candidate as { sign?: unknown }).sign;
  return typeof sign === "string" && sign.trim() ? sign : null;
}

// Color-only chip tokens for the "Why this score" factor rows. The chips
// communicate influence visually; no copy keys off these, so the buckets
// don't need to match the score-band names.
type FactorInfluence = "harmonious" | "neutral" | "challenging";

const INFLUENCE_STYLES: Record<FactorInfluence, string> = {
  harmonious: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  neutral: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  challenging: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

function factorInfluence(score: number): FactorInfluence {
  if (score >= 80) return "harmonious";
  if (score >= 65) return "neutral";
  return "challenging";
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
                // birth_chart JSONB is already returned by
                // get_my_full_profile. Pull mercury/venus/mars/saturn out
                // so the dimensions cards score against real placements
                // instead of silently falling back to Sun × Sun.
                mercury_sign: pickPlanetSign(ownData.birth_chart, "mercury"),
                venus_sign: pickPlanetSign(ownData.birth_chart, "venus"),
                mars_sign: pickPlanetSign(ownData.birth_chart, "mars"),
                saturn_sign: pickPlanetSign(ownData.birth_chart, "saturn"),
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
    me && other ? calculateSunCompatibility(me.sun_sign, other.sun_sign) : null;
  const zoneScores: ZoneScore[] = me && other ? calculateZoneScores(me, other) : [];

  // "Why this score" — three element pairings. Filter out rows where
  // either side's sign is missing so we never render a placeholder.
  const whyFactors: WhyFactor[] =
    me && other
      ? getWhyFactors(me, other).filter((f) => f.score != null)
      : [];

  // "How to talk to this person" — three lenses keyed by the target's
  // placement element, falling back to the target's Sun element when
  // the planet itself is missing. Each prompt entry is either resolved
  // to a translation key or null (hide that lens).
  type TalkLens = "mercury" | "moon" | "venus";
  const talkLensSources: Array<{ lens: TalkLens; sign: string | null | undefined }> = other
    ? [
        { lens: "mercury", sign: other.mercury_sign },
        { lens: "moon", sign: other.moon_sign },
        { lens: "venus", sign: other.venus_sign },
      ]
    : [];
  const talkPrompts = talkLensSources
    .map(({ lens, sign }) => {
      const element: SynastryElement | null =
        getElement(sign) ?? getElement(other?.sun_sign);
      return element ? { lens, element } : null;
    })
    .filter((p): p is { lens: TalkLens; element: SynastryElement } => p != null);

  // Watch-for callout only renders for mixed / growth / different bands
  // so we don't manufacture tension on strong scores.
  const watchVisible =
    totalScore != null && shouldShowWatchFor(getScoreBand(totalScore));

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
                  {calculateSunCompatibility(
                    selfProfile?.sun_sign ?? null,
                    candidate.sun_sign
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
            {totalScore != null ? (
              (() => {
                const band = getScoreBand(totalScore);
                return (
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {t(`synastryScoreTitle_${band}`)}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-text-muted">
                      {t(`synastryScoreBody_${band}`)}
                    </p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-text-dim">
                      {t("synastryV2HeroDisclaimer")}
                    </p>
                  </div>
                );
              })()
            ) : (
              <p className="text-sm leading-7 text-text-muted">
                {t("synastryOverviewBody")}
              </p>
            )}
          </div>
        </div>

        {/* Why this score — three element pairings (Sun/Sun, Moon/Moon,
            Rising/Rising) framed as a starting point rather than a verdict.
            Rows hide individually when either side's sign is missing; the
            whole section hides when zero factors remain. */}
        {whyFactors.length > 0 ? (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <h2 className="text-xl font-semibold text-white">
              {t("synastryV2WhyTitle")}
            </h2>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t("synastryV2WhyBody")}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {whyFactors.map((factor) => {
                const influence =
                  factor.score != null ? factorInfluence(factor.score) : "neutral";
                return (
                  <article
                    key={factor.key}
                    className="rounded-[1.4rem] border border-border bg-bg/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        {t(`synastryV2Factor_${factor.key}`)}
                      </h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${INFLUENCE_STYLES[influence]}`}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-dim">
                      {factor.selfSign ? translateSign(factor.selfSign, locale) : "?"}
                      {" • "}
                      {factor.targetSign ? translateSign(factor.targetSign, locale) : "?"}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-text-muted">
                      {t(`synastryV2FactorBody_${factor.key}`)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Compatibility dimensions — the four cards added in the previous
            commit, now wrapped with a section header and per-card body/cue
            copy plus a Sun-fallback note when the underlying placement was
            missing. Mini arc keeps the same dot palette as the hero. */}
        {zoneScores.length > 0 ? (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <h2 className="text-xl font-semibold text-white">
              {t("synastryV2DimensionsTitle")}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {zoneScores.map((zone) => (
                <article
                  key={zone.key}
                  className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      <CompatibilityDotsArc
                        percentage={zone.score}
                        size={72}
                        showScore
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-white sm:text-lg">
                        {t(`synastryV2Dimension_${zone.key}`)}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-text-muted">
                        {t(`synastryV2DimensionBody_${zone.key}`)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-white/80">
                    {t(`synastryV2Cue_${zone.key}`)}
                  </p>
                  {zone.source === "sun-fallback" ? (
                    <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-text-dim">
                      {t("synastryV2DimensionFallbackNote")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {/* How to talk to this person — three lenses (Mercury / Moon / Venus)
            on the target's chart. Each prompt is keyed by the target placement's
            element with a fallback to the target's Sun element when the planet
            is missing; lenses hide individually when even the Sun fallback
            cannot resolve an element. */}
        {talkPrompts.length > 0 ? (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <h2 className="text-xl font-semibold text-white">
              {t("synastryV2TalkTitle")}
            </h2>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t("synastryV2TalkBody")}
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {talkPrompts.map(({ lens, element }) => (
                <article
                  key={lens}
                  className="rounded-[1.4rem] border border-border bg-bg/70 p-4"
                >
                  <p className="text-sm leading-7 text-text-muted">
                    {t(`synastryV2Prompt_${lens}_${element}`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {/* Watch for — warm callout rendered only on mixed / growth / different
            bands so strong scores don't get manufactured tension. */}
        {watchVisible ? (
          <div className="rounded-[2rem] border border-amber-500/30 bg-amber-500/10 p-6">
            <h2 className="text-xl font-semibold text-white">
              {t("synastryV2WatchTitle")}
            </h2>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t("synastryV2WatchBody")}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}

        {/* Closing disclaimer — frames the whole surface as a reflection
            tool, not a relationship prediction. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <h2 className="text-base font-semibold text-white">
            {t("synastryV2DisclaimerTitle")}
          </h2>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("synastryV2DisclaimerBody")}
          </p>
        </div>
      </section>
    </div>
  );
}
