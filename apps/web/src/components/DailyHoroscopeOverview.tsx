"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

// V2 of Daily Horoscope. Replaces the previous numeric-score / lucky-numbers /
// lucky-window layout. Those were fabricated precision presented as personal
// analysis (e.g. "Lucky window 3:00 - 5:30") which carries marketing /
// legal risk and looks cheap next to the enriched Natal Chart.
//
// New structure (top to bottom):
//   1. Hero — date + zodiac glyph + qualitative mood phrase (no %)
//   2. Today's lens — one short reflective paragraph
//   3. Energy rhythm — 4 axes (Love / Mind / Body / Social), each given a
//      qualitative label (quiet / soft / steady / bright / strong) chosen
//      deterministically from a (date + sign) seed. Still pseudo-random but
//      framed as symbolic, not as a score.
//   4. Dating lens — one relational sentence
//   5. Conversation prompt — a concrete question to ask someone today
//   6. Reflect on — 1–2 reflection invitations
//   7. Disclaimer — "for reflection, not prediction"
//
// All content lives behind `*V2_*` i18n keys so any stale 7-locale
// translation of the old keys can't accidentally bleed through into the new
// UI.

const SIGNS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

type SignKey = (typeof SIGNS)[number];

const AXES = ["love", "mind", "body", "social"] as const;
type Axis = (typeof AXES)[number];

const LEVELS = ["quiet", "soft", "steady", "bright", "strong"] as const;
type Level = (typeof LEVELS)[number];

// Different multipliers per axis so the four axes don't move in lockstep.
// Co-primes with 5 (the level count) keep the distribution flat-ish across
// a month rather than clustering on one label.
const AXIS_SEED_OFFSET: Record<Axis, number> = {
  love: 0,
  mind: 3,
  body: 7,
  social: 11,
};

function pickLevel(seed: number, axis: Axis): Level {
  const value = (seed + AXIS_SEED_OFFSET[axis]) % LEVELS.length;
  return LEVELS[(value + LEVELS.length) % LEVELS.length];
}

// Dot count per level — 1..5 — used by the qualitative meter. We render the
// dot count visually but never expose it as a number.
const LEVEL_INTENSITY: Record<Level, number> = {
  quiet: 1,
  soft: 2,
  steady: 3,
  bright: 4,
  strong: 5,
};

// Small qualitative meter — 5 dots, N filled. Replaces the previous "72%"
// chip. Renders left-to-right so screen readers and visual scanners both
// get an at-a-glance read without exposing fabricated precision.
function EnergyDots({ level }: { level: Level }) {
  const filled = LEVEL_INTENSITY[level];
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < filled
              ? "bg-[#e85d75]"
              : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

function isKnownSign(value: string | null | undefined): value is SignKey {
  if (!value) return false;
  return SIGNS.includes(value.toLowerCase() as SignKey);
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

  // Seed = today's day-of-month + signKey length. Same shape as the legacy
  // implementation, but we only use it to pick qualitative labels now —
  // never to fabricate a percentage or a lucky number.
  const signKey = (sunSign?.toLowerCase() as SignKey | undefined) ?? null;
  const signLabel = sunSign ? translateSign(sunSign, locale) : null;
  const seed = (today.getDate() + (signKey?.length || 0)) * 7;

  // i18n level labels (e.g. "quiet" / "silencieux") for the energy axes.
  const axisLabel: Record<Axis, string> = {
    love: t("dailyHoroscopeV2AxisLove"),
    mind: t("dailyHoroscopeV2AxisMind"),
    body: t("dailyHoroscopeV2AxisBody"),
    social: t("dailyHoroscopeV2AxisSocial"),
  };

  if (loading) {
    // Skeleton: three placeholder cards. Mirrors the final layout coarsely
    // so the perceived load doesn't feel like a layout shift on slow
    // connections.
    return (
      <div className="grid gap-6">
        <div className="h-44 animate-pulse rounded-[2rem] border border-border bg-card/90" />
        <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card/90" />
        <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card/90" />
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

  // Daily Horoscope is part of the Celestial tier (and Cosmic, by inclusion).
  // Free users hit the paywall.
  if (state.tier === "free") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
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

  // Tier is OK, but no sun sign on the profile yet. We don't fabricate a
  // sign — we route them to the profile so they get an accurate read on
  // next visit.
  if (!isKnownSign(sunSign)) {
    return (
      <section className="rounded-[2rem] border border-border bg-card/90 p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeDateLabel")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          {t("dailyHoroscopeV2NoSignTitle")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-text-muted">
          {t("dailyHoroscopeV2NoSignBody")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/profile"
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t("openProfile")}
          </Link>
        </div>
        {error ? (
          <p className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  // From here on we have a real sun sign and a Celestial+ tier.
  // signKey is now narrowed to SignKey.
  const sign: SignKey = signKey as SignKey;

  return (
    <div className="grid gap-6">
      {/* Block 1 — Hero. Date, glyph, sign, mood phrase. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dailyHoroscopeDateLabel")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.12)] text-3xl text-white"
              aria-hidden="true"
            >
              <ZodiacGlyph sign={sign} className="leading-none" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                {signLabel}
              </h2>
              <p className="mt-1 text-sm text-text-muted">{formattedDate}</p>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              {t("dailyHoroscopeV2Mood")}
            </p>
            <p className="mt-2 text-lg font-medium text-white">
              {t(`dailyHoroscopeMoodV2_${sign}`)}
            </p>
          </div>
        </div>
      </section>

      {/* Block 2 — Today's lens. Short reflective paragraph. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeV2LensTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {t(`dailyHoroscopeLensV2_${sign}`)}
        </p>
      </section>

      {/* Block 3 — Energy rhythm. 4 axes × qualitative label + dot meter.
          No percentages, no scores. Symbolic, not numeric. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeV2EnergyTitle")}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {AXES.map((axis) => {
            const level = pickLevel(seed, axis);
            return (
              <div
                key={axis}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {axisLabel[axis]}
                  </p>
                  <p className="mt-1 text-xs capitalize text-text-muted">
                    {t(`dailyHoroscopeV2Level_${level}`)}
                  </p>
                </div>
                <EnergyDots level={level} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Block 4 — Dating lens. One relational sentence. Coral-tinted card
          to mirror the Natal Chart dating-lens styling. */}
      <section className="rounded-[2rem] border border-[rgba(232,93,117,0.24)] bg-[rgba(232,93,117,0.10)] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
          {t("dailyHoroscopeV2DatingTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {t(`dailyHoroscopeDatingLensV2_${sign}`)}
        </p>
      </section>

      {/* Block 5 — Conversation prompt. Concrete question to ask someone. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeV2PromptTitle")}
        </p>
        <p className="mt-3 text-base leading-7 text-white">
          {t(`dailyHoroscopeConversationPromptV2_${sign}`)}
        </p>
      </section>

      {/* Block 6 — Reflect on. 1–2 reflection invitations. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeV2ReflectTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t(`dailyHoroscopeReflectV2_${sign}`)}
        </p>
      </section>

      {/* Block 7 — Disclaimer. Same pattern as Natal Chart. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("dailyHoroscopeV2DisclaimerTitle")}
        </p>
        <p className="mt-2 text-sm leading-7 text-text-muted">
          {t("dailyHoroscopeV2DisclaimerBody")}
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
