"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  houseOfLongitude,
  hydrateStoredChart,
  mcIsTenthCusp,
  planetsByHouse,
  resolveHouseCuspInterpretations,
  resolveTrustedMidheaven,
  resolveBirthDataState,
  resolveHouseCusps,
  resolveTrustedRisingSign,
  risingNeedsLocationConfirmation,
  signsOnCusps,
  type BirthDataState,
} from "@astro/shared/astrology";
import { translateElement, translateModality, translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import { NatalChartWheel } from "@/components/NatalChartWheel";
import type { Placement } from "@astro/shared/astrology";

type NatalProfile = {
  id: string;
  name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_city: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  // `profiles` has NO mercury_sign / venus_sign / … columns — only Sun, Moon
  // and Rising exist as columns. Every other placement lives in `birth_chart`,
  // which is also the ONLY source of degrees and therefore the only way to
  // place a planet in a house. Reading the columns alone is why five of the
  // eight planets silently never rendered on this screen.
  birth_chart?: unknown;
  birth_latitude?: number | null;
  birth_longitude?: number | null;
  /**
   * `profiles.rising_sign_unconfirmed` — an ascendant migration 20260901000002
   * set aside because it was computed without a reliable birthplace. NEVER
   * rendered as a placement; it exists so this screen can offer to recompute
   * instead of pretending the placement never existed.
   */
  rising_sign_unconfirmed?: string | null;
};

type PlanetKey =
  | "sun"
  | "moon"
  | "rising"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn";

type PlanetPosition = {
  key: PlanetKey;
  label: string;
  symbol: string;
  sign: string;
  /**
   * Degree in sign, read from the stored chart. Null when only a sign column
   * is available — a legacy row, or a chart too partial to hydrate. It used to
   * be `((baseSeed + index * 7) % 29) + 1`.
   */
  degree: number | null;
  /**
   * House 1–12, computed from real longitudes against trustworthy cusps. Null
   * whenever the birth time or the birthplace is missing. It used to be
   * `((baseSeed + index * 2) % 12) + 1` — a hash of string lengths, which also
   * meant a reader's "houses" rearranged themselves when they fixed a typo in
   * their name. See packages/shared/src/astrology/houses.ts.
   */
  house: number | null;
};

const PLANET_SYMBOLS: Record<PlanetKey, string> = {
  sun: "☉",
  moon: "☽",
  rising: "↑",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
};

// The zodiac list that used to live here existed for exactly one purpose:
// `getFallbackSign` picked from it with `seed % 12` to invent a sign for any
// placement the profile did not have. Both are gone. Nothing in this file
// needs a list of all twelve signs any more, and leaving one behind is an
// invitation to reach for it the same way. Real sign labels come from
// `translateSign`; membership tests use SIGN_ELEMENTS / SIGN_MODALITIES below.

const SIGN_ELEMENTS: Record<string, "fire" | "earth" | "air" | "water"> = {
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

const SIGN_MODALITIES: Record<string, "cardinal" | "fixed" | "mutable"> = {
  Aries: "cardinal",
  Cancer: "cardinal",
  Libra: "cardinal",
  Capricorn: "cardinal",
  Taurus: "fixed",
  Leo: "fixed",
  Scorpio: "fixed",
  Aquarius: "fixed",
  Gemini: "mutable",
  Virgo: "mutable",
  Sagittarius: "mutable",
  Pisces: "mutable",
};

const DEFAULT_INTERPRETATIONS: Record<"sun" | "moon" | "rising", string> = {
  sun: "Your Sun sign describes your core identity, direction, and the style of energy you naturally radiate.",
  moon: "Your Moon sign reveals how you process feelings, seek comfort, and restore emotional balance.",
  rising: "Your Rising sign shapes first impressions, your visible style, and how you enter new situations.",
};

// Locale-aware label builders. We keep these in code rather than inline
// templates in JSON because the English form for houses uses an article
// ("in the 1st house") that FR doesn't carry, and other locales without
// dedicated phrasing get a neutral bullet that always reads cleanly.
function formatPlanetInSignLabel(planet: string, sign: string, locale: string): string {
  if (locale === "fr") return `${planet} en ${sign}`;
  if (locale === "en") return `${planet} in ${sign}`;
  return `${planet} · ${sign}`;
}

function formatPlanetInHouseLabel(planet: string, houseName: string, locale: string): string {
  if (locale === "fr") return `${planet} en ${houseName}`;
  if (locale === "en") return `${planet} in the ${houseName}`;
  return `${planet} · ${houseName}`;
}

/** What this reader's chart actually supports, computed once per profile. */
type ChartReading = {
  positions: PlanetPosition[];
  /** Trustworthy equal-house cusps, or null. */
  cusps: number[] | null;
  /** Sign on each of the twelve cusps, or null when there are no cusps. */
  cuspSigns: string[] | null;
  /** Which of the three birth-data states this reader is in. */
  birthDataState: BirthDataState;
  /** True when an ascendant was set aside and the birth city would restore it. */
  needsLocationConfirmation: boolean;
  /** The midheaven, when the clock and the place both prove it. */
  mc: { sign: string; degree: number } | null;
  /** In equal house the MC is usually NOT the tenth cusp. Never assumed. */
  mcIsTenth: boolean;
  /** Which planets sit in each house, 1–12. Empty when there are no cusps. */
  planetsPerHouse: Map<number, string[]>;
  /** The hydrated chart, for the wheel. Null when the row cannot be read. */
  chart: ReturnType<typeof hydrateStoredChart>;
  /** The ascendant placement, only when it was proven. */
  risingPlacement: Placement | null;
  /** The midheaven placement, only when it was proven. */
  mcPlacement: Placement | null;
};

const PLANET_ORDER: readonly PlanetKey[] = [
  "sun",
  "moon",
  "rising",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
] as const;

function readChart(
  profile: NatalProfile,
  t: ReturnType<typeof useTranslations>,
): ChartReading {
  // The rising sign is the one placement that cannot exist without an exact
  // birth time, and this screen can read `birth_time` — the strongest proof
  // available. See packages/shared/src/astrology/rising.ts.
  const trustedRising = resolveTrustedRisingSign({
    birthTime: profile.birth_time,
    storedRisingSign: profile.rising_sign,
    // The birthplace matters as much as the clock: birth longitude enters
    // local sidereal time degree for degree, so an ascendant computed without
    // coordinates was cast for whichever city the old fallback substituted.
    birthLatitude: profile.birth_latitude,
    birthLongitude: profile.birth_longitude,
  });

  const trustInput = {
    birthTime: profile.birth_time,
    birthLatitude: profile.birth_latitude,
    birthLongitude: profile.birth_longitude,
    birthChart: profile.birth_chart,
    storedRisingSign: profile.rising_sign,
    unconfirmedRisingSign: profile.rising_sign_unconfirmed,
  };

  const birthDataState = resolveBirthDataState(trustInput);
  // Shown only to readers who HAVE a set-aside ascendant. Someone who never
  // gave a birth time is not in this state: the city would not help them, and
  // asking would send them to fix the wrong field.
  const needsLocationConfirmation = risingNeedsLocationConfirmation(trustInput);
  const mcPlacement = resolveTrustedMidheaven(trustInput);
  // Null unless the clock AND the birthplace are both proven. Everything
  // house-shaped below is downstream of this one value.
  const cusps = resolveHouseCusps(trustInput);
  const cuspSigns = signsOnCusps(cusps);

  // `hydrateStoredChart` returns null for a row too partial to be a chart. That
  // is a legitimate outcome for legacy data, and it costs only the degrees —
  // the Sun/Moon/Rising columns still carry real signs.
  const chart = hydrateStoredChart(profile.birth_chart);

  // A placement we do not have is DROPPED, never invented.
  //
  // Signs used to read `picks[index] || getFallbackSign(baseSeed + index * 3)`,
  // where getFallbackSign was `SIGNS[seed % 12]` — a sign derived from the
  // length of some strings. Degrees and houses were the same trick and outlived
  // it by a day; they are gone now too. Nothing on this screen is allowed to be
  // derived from a seed.
  const positions = PLANET_ORDER.map((key) => {
    // The chart is the richer source: it carries a degree, which the columns
    // never did, and it is the only place mercury..saturn exist at all.
    const placement =
      key === "rising"
        ? (trustedRising ? chart?.rising ?? null : null)
        : chart?.[key] ?? null;

    const sign =
      placement?.sign ??
      (key === "sun"
        ? profile.sun_sign
        : key === "moon"
          ? profile.moon_sign
          : key === "rising"
            ? trustedRising
            : null);

    if (!sign) return null;

    const longitude = placement?.longitude;
    const house =
      cusps && typeof longitude === "number" ? houseOfLongitude(cusps, longitude) : null;

    return {
      key,
      label: t(`natalPlanet_${key}`),
      symbol: PLANET_SYMBOLS[key],
      sign,
      // Rounded for display only. Absent rather than approximated when the
      // stored chart could not supply one.
      degree: typeof placement?.degree === "number" ? Math.round(placement.degree) : null,
      house,
    } satisfies PlanetPosition;
  }).filter((position): position is PlanetPosition => position !== null);

  return {
    positions,
    cusps,
    cuspSigns,
    birthDataState,
    needsLocationConfirmation,
    chart,
    // The wheel places the ascendant itself, so it needs the placement, not
    // just the sign. Gated exactly as the Angles card is.
    risingPlacement: trustedRising && chart?.rising ? chart.rising : null,
    mcPlacement: mcPlacement ?? null,
    mc: mcPlacement ? { sign: mcPlacement.sign, degree: Math.round(mcPlacement.degree) } : null,
    mcIsTenth: mcIsTenthCusp(mcPlacement, cusps),
    // Real longitudes only. A house with no planets renders as a house with no
    // planets — never as a house with a plausible one.
    planetsPerHouse: chart
      ? new Map(
          [...planetsByHouse(chart, cusps).entries()].map(([house, keys]) => [
            house,
            keys as string[],
          ]),
        )
      : new Map<number, string[]>(),
  };
}

type ServerGate = { allowed: boolean; reason: string | null };

export function NatalChartOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [profile, setProfile] = useState<NatalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverGate, setServerGate] = useState<ServerGate>({ allowed: true, reason: null });
  // Single-open accordion. Picked over multi-open because it keeps state to
  // one string, matches the mobile pattern (`expandedSection`), and avoids
  // a second scroll-jump puzzle on small viewports.
  const [openKey, setOpenKey] = useState<PlanetKey | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);

        if (!account?.userId) {
          setProfile(null);
          return;
        }

        const supabase = getSupabaseBrowser();

        // Server-side tier + quota enforcement.
        const { data: gateRow, error: gateError } = await supabase
          .rpc("enforce_premium_feature", { p_feature_key: "natal_chart" })
          .maybeSingle<{ allowed: boolean; reason: string | null }>();

        if (gateError || !gateRow || gateRow.allowed !== true) {
          setServerGate({
            allowed: false,
            reason: gateRow?.reason ?? "error",
          });
          setProfile(null);
          return;
        }

        setServerGate({ allowed: true, reason: "ok" });

        // Phase 3-B: own profile via SECURITY DEFINER RPC (sensitive fields).
        const { data: rows, error: profileError } = await supabase.rpc("get_my_full_profile");
        const data = Array.isArray(rows) ? rows[0] : null;

        if (profileError) {
          throw profileError;
        }

        setProfile((data as NatalProfile | null) || null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const reading = useMemo(
    () =>
      profile
        ? readChart(profile, t)
        : ({
            positions: [],
            cusps: null,
            cuspSigns: null,
            birthDataState: "missing_birth_time",
            needsLocationConfirmation: false,
            mc: null,
            mcIsTenth: false,
            planetsPerHouse: new Map<number, string[]>(),
            chart: null,
            risingPlacement: null,
            mcPlacement: null,
          } satisfies ChartReading),
    [profile, t]
  );
  const { positions, cuspSigns, birthDataState, needsLocationConfirmation, mc, mcIsTenth, planetsPerHouse } =
    reading;
  // The ascendant is already gated inside `readChart`; if it is not in
  // `positions` it must not appear in the Angles card either.
  const risingAngle = positions.find((position) => position.key === "rising") ?? null;

  const elementCounts = useMemo(() => {
    return positions.reduce(
      (counts, position) => {
        const element = SIGN_ELEMENTS[position.sign];
        if (element) {
          counts[element] += 1;
        }
        return counts;
      },
      { fire: 0, earth: 0, air: 0, water: 0 }
    );
  }, [positions]);

  const modalityCounts = useMemo(() => {
    return positions.reduce(
      (counts, position) => {
        const modality = SIGN_MODALITIES[position.sign];
        if (modality) {
          counts[modality] += 1;
        }
        return counts;
      },
      { cardinal: 0, fixed: 0, mutable: 0 }
    );
  }, [positions]);

  const dominantElement = useMemo(
    () =>
      Object.entries(elementCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "fire",
    [elementCounts]
  );

  const dominantModality = useMemo(
    () =>
      Object.entries(modalityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "cardinal",
    [modalityCounts]
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
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("natalChartSignIn")}</p>
      </div>
    );
  }

  // A spent free preview is a daily limit from the reader's point of view:
  // come back tomorrow, or subscribe.
  if (
    !serverGate.allowed &&
    (serverGate.reason === "quota_exceeded" ||
      serverGate.reason === "free_preview_exhausted")
  ) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("dailyLimitReached")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("dailyLimitBody")}
        </p>
      </div>
    );
  }

  // Free accounts get the daily preview the paywall promises, and the server
  // is what decides that (`enforce_premium_feature` → reason 'free_preview').
  // Only fall through to the locked card once the server has actually said no,
  // otherwise this client-side tier check would silently override the grant —
  // the same class of bug that broke the preview on mobile.
  if (state.tier === "free" && !serverGate.allowed) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("natalChartLockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("natalChartLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
            >
              {t("viewPlans")}
            </Link>
            <Link
              href="/app/premium/cosmic"
              className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openPremiumFeature")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">{t("profileUnavailableTitle")}</h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">{t("natalChartProfileUnavailable")}</p>
      </div>
    );
  }

  // The twelve sign-on-cusp readings, or null. `resolveHouseCuspInterpretations`
  // enforces twelve-or-nothing itself, so this cannot render a partial ring
  // even if `cuspSigns` were ever handed a short array. Deliberately not a
  // `useMemo`: it is twelve object lookups, and every hook in this component
  // has to sit above the five early returns to stay unconditional.
  const houseCuspReadings = cuspSigns
    ? resolveHouseCuspInterpretations(cuspSigns, locale)
    : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("natalChartBirthLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {profile.name || t("unknownUser")}
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("birthDateLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_date || t("statusUnknown")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("birthTimeLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_time || t("statusUnknown")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("birthCityLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_city || t("statusUnknown")}
              </p>
            </div>
          </div>
        </div>

        {/* The wheel. First, because it IS the chart — the accordion, the
            angles and the houses below are all readings of it, and a reader
            who has to scroll past a hundred lines of prose to reach the
            picture has been shown a list, not a chart.
            340 is the mobile cap; the column is wider than that from `xl` up
            and the SVG scales to whatever it is given. */}
        <NatalChartWheel
          size={420}
          chart={reading.chart}
          rising={reading.risingPlacement}
          mc={reading.mcPlacement}
          cusps={reading.cusps}
          unavailableNote={
            birthDataState === "missing_birth_time"
              ? t("natalWheelNeedBirthTime")
              : birthDataState === "missing_birth_place"
                ? t("natalWheelNeedBirthPlace")
                : null
          }
        />

        {/* Editorial reminder — sits just above the Planetary Positions card
            so the user reads the framing before tapping into each placement. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("natalChartDisclaimerTitle")}
          </p>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("natalChartDisclaimerBody")}
          </p>
        </div>

        {/* Planetary Positions — inline accordion. Each row is a button that
            toggles a panel below it with up to four reads:
            (1) planet meaning, (2) sign expression, (3) house area,
            (4) dating lens. Reads 2 + 4 only render when an i18n entry
            exists for that planet × sign tuple. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("planetaryPositions")}
          </p>
          <ul className="mt-5 space-y-3">
            {positions.map((position) => {
              const isOpen = openKey === position.key;
              const signKey = position.sign.toLowerCase();
              const panelId = `natal-planet-panel-${position.key}`;
              const buttonId = `natal-planet-button-${position.key}`;

              const planetMeaningKey = `natalPlanetMeaning_${position.key}`;
              const planetInKey = `natalPlanetIn_${position.key}_${signKey}`;
              const datingLensKey = `natalPlanetDatingLens_${position.key}_${signKey}`;
              const coreInterpretationKey = `natalInterpretation_${position.key}`;

              const hasPlanetMeaning = t.has(planetMeaningKey);
              const hasPlanetInSign = t.has(planetInKey);
              const hasCoreInterpretation =
                (position.key === "sun" || position.key === "moon" || position.key === "rising") &&
                t.has(coreInterpretationKey);
              const hasDatingLens = t.has(datingLensKey);

              // `houseNumber` is null unless it came from a real longitude
              // measured against trustworthy cusps. `hasHouse` used to be
              // `houseNumber >= 1 && houseNumber <= 12`, which was
              // unconditionally true because the number was manufactured — so
              // this block, and one of the 96 `natalPlanetInHouse_*`
              // interpretations, rendered for everyone.
              const houseNumber = position.house;
              const hasHouse = houseNumber !== null;
              const planetInHouseKey = `natalPlanetInHouse_${position.key}_${houseNumber}`;
              const hasPlanetInHouse = hasHouse && t.has(planetInHouseKey);

              const signLabel = translateSign(position.sign, locale);

              return (
                <li key={position.key}>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() =>
                      setOpenKey((current) => (current === position.key ? null : position.key))
                    }
                    className="flex w-full items-center gap-4 rounded-[1.4rem] border border-border bg-bg/70 px-4 py-4 text-left transition-colors hover:bg-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.12)] text-2xl text-white"
                      aria-hidden="true"
                    >
                      {position.symbol}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-white">{position.label}</p>
                      {/* Every part of this line is now optional, because every
                          part of it used to be fabricated. A reader whose chart
                          carries no degree sees the sign alone, which is true,
                          rather than a number that is not. */}
                      <p className="mt-1 text-sm text-text-muted">
                        {signLabel}
                        {position.degree !== null ? ` ${position.degree}°` : ""}
                        {position.house !== null
                          ? ` · ${t("natalHouse")} ${position.house}`
                          : ""}
                      </p>
                    </div>
                    {/* Chevron — CSS-only rotation, gated behind motion-safe
                        so reduced-motion users don't see the transition. */}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className={`h-5 w-5 shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 ${
                        isOpen ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      <path
                        d="M5 7l5 5 5-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>

                  {isOpen ? (
                    <div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      className="mt-2 space-y-4 rounded-[1.4rem] border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.06)] px-4 py-5"
                    >
                      {/* Block 1: planet-in-sign. Cascade priority:
                          1) natalPlanetIn_<planet>_<sign>  — specific tuple
                          2) natalInterpretation_<planet> {sign}  — sun/moon/rising legacy
                          3) DEFAULT_INTERPRETATIONS — final safety net
                          4) natalPlanetMeaning_<planet>  — outer-planet fallback
                          The generic planet meaning is NEVER rendered as its
                          own block; it only becomes the body when nothing
                          more specific exists. */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                          {formatPlanetInSignLabel(position.label, signLabel, locale)}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-white/90">
                          {hasPlanetInSign
                            ? t(planetInKey)
                            : hasCoreInterpretation
                              ? t(coreInterpretationKey, { sign: signLabel })
                              : (position.key === "sun" || position.key === "moon" || position.key === "rising")
                                ? DEFAULT_INTERPRETATIONS[position.key as "sun" | "moon" | "rising"]
                                : hasPlanetMeaning
                                  ? t(planetMeaningKey)
                                  : ""}
                        </p>
                      </div>

                      {hasHouse ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                            {hasPlanetInHouse
                              ? formatPlanetInHouseLabel(position.label, t(`natalHouseName_${houseNumber}`), locale)
                              : t(`natalHouseName_${houseNumber}`)}
                          </p>
                          <p className="mt-2 text-sm leading-7 text-text-muted">
                            {hasPlanetInHouse
                              ? t(planetInHouseKey)
                              : t(`natalHouseMeaning_${houseNumber}`)}
                          </p>
                        </div>
                      ) : null}

                      {hasDatingLens ? (
                        <div className="rounded-2xl border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.10)] p-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
                            {t("natalPlanetCardDatingLensLabel")}
                          </p>
                          <p className="mt-2 text-sm leading-7 text-white/90">
                            {t(datingLensKey)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        {/* The twelve houses.
            The MEANINGS are pedagogical and identical for every chart. The
            SIGN on each cusp is personal and appears only when `cuspSigns` is
            non-null, which requires the birth clock AND the birthplace.

            The intro copy used to promise the cusp sign unconditionally ("the
            sign sitting on each house cusp colors how that area unfolds") and
            then render twelve cards without one — describing a personalisation
            the section did not deliver, right below an accordion that was
            inventing house numbers. There are now two variants: `…BodyGeneral`
            makes no claim, `…Body` is used only when the signs are really
            there. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("natalChartHousesTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {cuspSigns ? t("natalChartHousesBody") : t("natalChartHousesBodyGeneral")}
          </p>

          {/* Which house system produced these cusps. It was named only in the
              MC copy, which lives in the other column and appears only when an
              MC exists — so the twelve cusps could be read with no idea where
              they came from. Equal House is not a detail: it is why cusp 10 is
              not the Midheaven. */}
          {cuspSigns ? (
            <p className="mt-2 text-xs leading-6 text-text-dim">
              {t("natalHousesSystemNote")}
            </p>
          ) : null}

          {/* Explained ONCE, at the top, never as twelve empty slots. A blank
              where a reader expects a sign reads as a bug or as data being
              withheld. */}
          {!cuspSigns ? (
            <div className="mt-4 rounded-[1.4rem] border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.10)] p-4">
              <p className="text-sm leading-7 text-white/90">
                {birthDataState === "missing_birth_time"
                  ? t("natalHousesNeedBirthTime")
                  : t("natalHousesNeedBirthPlace")}
              </p>
              <Link
                href="/app/profile"
                className="mt-3 inline-block text-sm font-semibold text-accent hover:underline"
              >
                {t("natalHousesCompleteBirthData")}
              </Link>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((houseNumber) => (
              <div
                key={houseNumber}
                className="flex items-start gap-3 rounded-[1.4rem] border border-border bg-bg/70 p-4"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white"
                  aria-hidden="true"
                >
                  {houseNumber}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {t(`natalHouseName_${houseNumber}`)}
                  </p>
                  {cuspSigns ? (
                    <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-accent">
                      {t("natalHouseCuspSign", {
                        sign: translateSign(cuspSigns[houseNumber - 1], locale),
                      })}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {t(`natalHouseMeaning_${houseNumber}`)}
                  </p>
                  {/* What the SIGN does to that area — personal, where the line
                      above is the same for every chart. Gated on
                      `houseCuspReadings`, which is null unless the birth time
                      AND the birthplace produced twelve trustworthy cusps.
                      `lang` is set because the corpus is English and French
                      only: without it a screen reader would read English prose
                      with the page's voice. */}
                  {houseCuspReadings ? (
                    <div className="mt-3 rounded-[1rem] border border-white/[0.07] bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gold-muted">
                        {t("natalHouseCuspColorsTitle")}
                      </p>
                      <p
                        lang={houseCuspReadings[houseNumber - 1].locale}
                        className="mt-1.5 text-sm leading-6 text-white/90"
                      >
                        {houseCuspReadings[houseNumber - 1].text}
                      </p>
                      {houseCuspReadings[houseNumber - 1].isFallback ? (
                        <p className="mt-2 text-[11px] leading-5 text-text-dim">
                          {t("natalHouseCuspInterpretationLanguageNote")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {/* Only real longitudes put a planet here. An empty house
                      renders as an empty house — it is still a life area, and
                      saying so beats filling it. */}
                  {cuspSigns ? (
                    <p className="mt-2 text-xs leading-5 text-text-dim">
                      {(planetsPerHouse.get(houseNumber) ?? []).length > 0
                        ? `${t("natalPlanetsInHouse")}: ${(planetsPerHouse.get(houseNumber) ?? [])
                            .map((key) => t(`natalPlanet_${key}`))
                            .join(" · ")}`
                        : t("natalNoPlanetsInHouse")}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      {/* NOT sticky, on purpose. It was, briefly: the left column runs to
          twelve house cards, so pinning the rail kept the angles and the
          balance on screen. But a column that holds still while its neighbour
          moves reads as a rendering fault rather than as a feature — the two
          halves of one page stop looking like one page. Both columns scroll
          together. */}
      <aside className="space-y-6">
        {/* Angles — the two points that need the birth clock AND the birthplace.
            Kept OUT of the planet list on purpose: an angle is not a body, and
            listing the MC beside Mars would say it moves through the zodiac the
            way a planet does.
            In the right rail because ASC and MC are drawn on the wheel: from
            `xl` up they sit level with it and name what the reader is looking
            at, instead of arriving one screen later. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("natalAnglesTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">{t("natalAnglesBody")}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {/* Rising */}
            <div className="rounded-[1.4rem] border border-border bg-bg/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold-muted">
                {t("natalPlanet_rising")}
              </p>
              {risingAngle ? (
                <>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {translateSign(risingAngle.sign, locale)}
                    {risingAngle.degree !== null ? ` ${risingAngle.degree}°` : ""}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {t("natalRisingMeaning")}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {t("natalAnglesNeedBirthData")}
                </p>
              )}
            </div>

            {/* Midheaven */}
            <div className="rounded-[1.4rem] border border-border bg-bg/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold-muted">
                {t("natalMidheavenLabel")}
              </p>
              {mc ? (
                <>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {translateSign(mc.sign, locale)} {mc.degree}°
                  </p>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {t("natalMidheavenMeaning")}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {t("natalAnglesNeedBirthData")}
                </p>
              )}
            </div>
          </div>

          {/* The distinction that matters, and only when both are on screen. */}
          {mc && cuspSigns ? (
            <p className="mt-4 text-sm leading-7 text-text-muted">
              {mcIsTenth ? t("natalMidheavenOnTenthCusp") : t("natalMidheavenNotTenthCusp")}
            </p>
          ) : null}
        </div>

        {/* An ascendant we set aside.
            The value was NOT deleted — migration 20260901000002 moved it to
            `rising_sign_unconfirmed`, out of the one column the blind surfaces
            read. The reader saw a rising sign here for months; saying nothing
            would read as data quietly disappearing. So we say what happened
            and offer the one thing that fixes it. The old sign is never shown:
            it was cast for a city this reader has never been to. */}
        {needsLocationConfirmation ? (
          <div className="rounded-[2rem] border border-[rgba(201,134,146,0.28)] bg-[rgba(201,134,146,0.10)] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-[#ffb7c7]">
              {t("risingNeedsBirthCityLabel")}
            </p>
            <p className="mt-3 text-sm leading-7 text-white/90">
              {t("risingNeedsBirthCity")}
            </p>
            <Link
              href="/app/profile"
              className="mt-4 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
            >
              {t("risingConfirmBirthCity")}
            </Link>
          </div>
        ) : null}

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("elementsModalities")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">
            {t("natalChartBalanceTitle")}
          </h3>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("natalChartDominantElement")}
              </p>
              <p className="mt-2 text-lg font-semibold capitalize text-white">
                {translateElement(dominantElement, locale)}
              </p>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t("natalChartElementBody", { element: translateElement(dominantElement, locale) })}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("natalChartDominantModality")}
              </p>
              <p className="mt-2 text-lg font-semibold capitalize text-white">
                {translateModality(dominantModality, locale)}
              </p>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t("natalChartModalityBody", { modality: translateModality(dominantModality, locale) })}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("cosmicSummary")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("natalChartSummaryBody", {
              sun: profile.sun_sign ? translateSign(profile.sun_sign, locale) : t("statusUnknown"),
              moon: profile.moon_sign ? translateSign(profile.moon_sign, locale) : t("statusUnknown"),
              rising: profile.rising_sign ? translateSign(profile.rising_sign, locale) : t("statusUnknown"),
            })}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/app/premium/cosmic"
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openPremiumFeature")}
            </Link>
            <Link
              href="/app/profile"
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
            >
              {t("openProfile")}
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
