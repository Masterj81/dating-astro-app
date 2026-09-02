"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

// V2 of Monthly Horoscope. Replaces the previous numeric-score / weekly
// percentage / "important dates with exact day numbers" layout. Those were
// fabricated precision presented as personal analysis (e.g. "Week 3: 62%",
// "Day 18 — Mercury pressure point") which carries marketing / legal risk
// and looks cheap next to the enriched Natal Chart and Daily Horoscope V2.
//
// New structure (top to bottom, mirroring Daily V2 but framed monthly):
//   1. Hero — month + sign glyph + qualitative monthly theme (no %)
//   2. Month's lens — one longer reflective paragraph (pattern, not action)
//   3. Relationship rhythm — 4 axes (Love / Communication / Confidence /
//      Rest), each a qualitative label (quiet / opening / steady / bright /
//      intense). Same 5-dot meter as Daily V2 but with monthly axis names.
//   4. Dating lens — one relational pattern sentence (not a prediction)
//   5. Conversation prompt — a monthly question / intention
//   6. Reflect this month — 2 reflection invitations
//   7. Disclaimer — "monthly reflection, not prediction"
//
// All content lives behind `*V2_*` i18n keys so any stale 7-locale
// translation of the old keys can't bleed into the new UI.
//
// Editorial split versus Daily V2: monthly = pattern, theme, rhythm;
// daily = micro-action, today, single conversation. Tone uses "tends to /
// often / can / may" and never "you will / destined / guaranteed".

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

// Monthly axes differ from Daily (love/mind/body/social) — these are
// relational rather than personal: Love / Communication / Confidence /
// Rest. They map onto how a month tends to feel inside a connection.
const AXES = ["love", "communication", "confidence", "rest"] as const;
type Axis = (typeof AXES)[number];

// Monthly levels also differ from Daily (quiet/soft/steady/bright/strong).
// "opening" replaces "soft" — monthly arcs are about phase shifts, not
// instant intensity. "intense" replaces "strong" — same shape, more
// monthly weight.
const LEVELS = ["quiet", "opening", "steady", "bright", "intense"] as const;
type Level = (typeof LEVELS)[number];

// Different multipliers per axis so the four axes don't move in lockstep
// across signs and months. Co-prime with 5 (the level count) keeps the
// distribution flat-ish.
const AXIS_SEED_OFFSET: Record<Axis, number> = {
  love: 0,
  communication: 3,
  confidence: 7,
  rest: 11,
};

function pickLevel(seed: number, axis: Axis): Level {
  const value = (seed + AXIS_SEED_OFFSET[axis]) % LEVELS.length;
  return LEVELS[(value + LEVELS.length) % LEVELS.length];
}

// Dot count per level — 1..5 — used by the qualitative meter. Rendered
// visually only; we never expose a number.
const LEVEL_INTENSITY: Record<Level, number> = {
  quiet: 1,
  opening: 2,
  steady: 3,
  bright: 4,
  intense: 5,
};

// Small qualitative meter — 5 dots, N filled. Replaces the previous "72%"
// chip from the old monthly layout. Mirrors the EnergyDots pattern from
// DailyHoroscopeOverview but kept inline so the two components can evolve
// independently without a premature shared abstraction.
function RhythmDots({ level }: { level: Level }) {
  const filled = LEVEL_INTENSITY[level];
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < filled ? "bg-[#C98692]" : "bg-white/15"
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

  // Seed = month + year + signKey length. Same shape as the legacy
  // implementation, but only used to pick qualitative labels — never to
  // fabricate a percentage or "lucky" anything.
  const signKey = (sunSign?.toLowerCase() as SignKey | undefined) ?? null;
  const signLabel = sunSign ? translateSign(sunSign, locale) : null;
  const seed = (today.getMonth() + 1 + today.getFullYear() + (signKey?.length || 0)) * 5;

  const axisLabel: Record<Axis, string> = {
    love: t("monthlyHoroscopeV2AxisLove"),
    communication: t("monthlyHoroscopeV2AxisCommunication"),
    confidence: t("monthlyHoroscopeV2AxisConfidence"),
    rest: t("monthlyHoroscopeV2AxisRest"),
  };

  if (loading) {
    // Skeleton mirrors the final layout coarsely so the perceived load
    // doesn't trigger a layout shift on slow connections.
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
          {t("monthlyHoroscopeSignIn")}
        </p>
      </div>
    );
  }

  // Tier gating — preserved from legacy MonthlyHoroscopeOverview. Monthly
  // is Cosmic-only (`tier === "premium_plus"`), unlike Daily which is
  // Celestial+ (`tier !== "free"`). Do not soften this without product
  // sign-off.
  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
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
              className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
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

  // Tier is OK, but no sun sign on the profile yet. We don't fabricate a
  // sign — route them to the profile so they get an accurate monthly
  // read on next visit. Same pattern as DailyHoroscopeOverview.
  if (!isKnownSign(sunSign)) {
    return (
      <section className="rounded-[2rem] border border-border bg-card/90 p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeMonthLabel")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          {t("monthlyHoroscopeV2NoSignTitle")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-text-muted">
          {t("monthlyHoroscopeV2NoSignBody")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/app/profile"
            className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
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

  // Sign is real and tier is Cosmic. Narrow the type so the i18n keys
  // can be templated safely.
  const sign: SignKey = signKey as SignKey;

  return (
    <div className="grid gap-6">
      {/* Block 1 — Hero. Month label, glyph, sign, qualitative monthly theme. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("monthlyHoroscopeMonthLabel")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(201,134,146,0.22)] bg-[rgba(201,134,146,0.12)] text-3xl text-white"
              aria-hidden="true"
            >
              <ZodiacGlyph sign={sign} className="leading-none" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                {signLabel}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {monthFormatter.format(today)}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              {t("monthlyHoroscopeV2Theme")}
            </p>
            <p className="mt-2 text-lg font-medium text-white">
              {t(`monthlyHoroscopeMoodV2_${sign}`)}
            </p>
          </div>
        </div>
      </section>

      {/* Block 2 — Month's lens. Longer reflective paragraph framed as a
          pattern across the month, not an action for today. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeV2LensTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {t(`monthlyHoroscopeLensV2_${sign}`)}
        </p>
      </section>

      {/* Block 3 — Relationship rhythm. 4 axes × qualitative label + dot
          meter. No percentages, no "best days", no fabricated precision. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeV2RhythmTitle")}
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
                    {t(`monthlyHoroscopeV2Level_${level}`)}
                  </p>
                </div>
                <RhythmDots level={level} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Block 4 — Dating lens. One relational sentence framed as a
          monthly pattern, not a prediction. Coral-tinted to mirror Daily
          V2 and the Natal Chart dating-lens styling. */}
      <section className="rounded-[2rem] border border-[rgba(201,134,146,0.24)] bg-[rgba(201,134,146,0.10)] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
          {t("monthlyHoroscopeV2DatingTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {t(`monthlyHoroscopeDatingLensV2_${sign}`)}
        </p>
      </section>

      {/* Block 5 — Conversation prompt. A monthly question or
          intention, longer-arc than the daily single-conversation prompt. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeV2PromptTitle")}
        </p>
        <p className="mt-3 text-base leading-7 text-white">
          {t(`monthlyHoroscopeConversationPromptV2_${sign}`)}
        </p>
      </section>

      {/* Block 6 — Reflect this month. Two reflection invitations in a
          journaling / self-awareness tone. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeV2ReflectTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t(`monthlyHoroscopeReflectV2_${sign}`)}
        </p>
      </section>

      {/* Block 7 — Disclaimer. Mirrors the Natal Chart / Daily V2 pattern
          but framed monthly: "reflection, not prediction". */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("monthlyHoroscopeV2DisclaimerTitle")}
        </p>
        <p className="mt-2 text-sm leading-7 text-text-muted">
          {t("monthlyHoroscopeV2DisclaimerBody")}
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
