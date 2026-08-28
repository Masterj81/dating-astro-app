"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateElement, translateModality, translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type NatalProfile = {
  id: string;
  name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_city: string | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  mercury_sign?: string | null;
  venus_sign?: string | null;
  mars_sign?: string | null;
  jupiter_sign?: string | null;
  saturn_sign?: string | null;
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
  degree: number;
  house: number;
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

function getFallbackSign(seed: number) {
  return SIGNS[seed % SIGNS.length];
}

function buildPlanetPositions(profile: NatalProfile, t: ReturnType<typeof useTranslations>) {
  const baseSeed =
    (profile.sun_sign?.length || 0) +
    (profile.moon_sign?.length || 0) +
    (profile.rising_sign?.length || 0) +
    (profile.birth_date?.length || 0);

  const picks = [
    profile.sun_sign,
    profile.moon_sign,
    profile.rising_sign,
    profile.mercury_sign,
    profile.venus_sign,
    profile.mars_sign,
    profile.jupiter_sign,
    profile.saturn_sign,
  ];

  const keys: PlanetKey[] = [
    "sun",
    "moon",
    "rising",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
  ];

  return keys.map((key, index) => ({
    key,
    label: t(`natalPlanet_${key}`),
    symbol: PLANET_SYMBOLS[key],
    sign: picks[index] || getFallbackSign(baseSeed + index * 3),
    degree: ((baseSeed + index * 7) % 29) + 1,
    house: ((baseSeed + index * 2) % 12) + 1,
  })) satisfies PlanetPosition[];
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

  const positions = useMemo(
    () => (profile ? buildPlanetPositions(profile, t) : []),
    [profile, t]
  );

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
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
              className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
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

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("natalChartBirthLabel")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {profile.name || t("unknownUser")}
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("birthDateLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_date || t("statusUnknown")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("birthTimeLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_time || t("statusUnknown")}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                {t("birthCityLabel")}
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {profile.birth_city || t("statusUnknown")}
              </p>
            </div>
          </div>
        </div>

        {/* Editorial reminder — sits just above the Planetary Positions card
            so the user reads the framing before tapping into each placement. */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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

              const houseNumber = position.house;
              const hasHouse = houseNumber >= 1 && houseNumber <= 12;
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
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.12)] text-2xl text-white"
                      aria-hidden="true"
                    >
                      {position.symbol}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-white">{position.label}</p>
                      <p className="mt-1 text-sm text-text-muted">
                        {signLabel} {position.degree}° · {t("natalHouse")} {position.house}
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
                      className="mt-2 space-y-4 rounded-[1.4rem] border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.06)] px-4 py-5"
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
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
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
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
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
                        <div className="rounded-2xl border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.10)] p-4">
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

        {/* House meanings — pedagogical, identical for every chart. Future
            iteration will overlay the sign on each house's cusp once the
            edge function returns cusps, but the meanings themselves don't
            depend on the viewer's chart. Two-column grid on md+, single
            column on mobile so 360px stays clean. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("natalChartHousesTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("natalChartHousesBody")}
          </p>
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
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {t(`natalHouseMeaning_${houseNumber}`)}
                  </p>
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

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("elementsModalities")}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">
            {t("natalChartBalanceTitle")}
          </h3>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-border bg-bg/70 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
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
