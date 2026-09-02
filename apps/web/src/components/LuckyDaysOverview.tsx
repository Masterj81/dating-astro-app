"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

// V2 of Lucky Days — renamed editorially to "Planning Windows".
//
// Why a full V2: the previous layout fabricated 5 calendar dates per month
// (e.g. "Best day: October 14") plus a numeric "energy %" and a precise
// "lucky window 11:00-13:30" per date, all derived from
// (sun_sign.length * (day-of-month + 3)) — no ephemeris, no astrological
// data. Presented across categories Money / Health / Romance, this was the
// highest legal-risk surface in the app: a date precisely framed as
// favorable for negotiation, romance, or budget revision verges on
// disguised financial/relational advice.
//
// The V2 removes:
//   - All percentage scores
//   - All time windows ("11:00-13:30")
//   - All precise calendar dates ("October 14")
//   - The "Money" / "Health" / "Romance" categories pinned to dates
//   - The "Avoid: X" callouts pinned to dates
//   - The "Next lucky day: N" green chip
//   - The word "lucky" everywhere user-facing (FR: "faste")
//
// What remains:
//   - Real `sun_sign` from Supabase (used to personalize voice, not a date)
//   - The current month (used as a frame, not a prediction)
//   - The Cosmic tier gate exactly as it was
//   - The legacy route `/cosmic/lucky-days` (no rename, deep links survive)
//
// New shape: three broad windows (Days 1-10 / 11-20 / 21-end), each with a
// sign-specific qualitative paragraph; four generic activity lenses
// (Connect / Reflect / Reset / Plan); a sign-specific dating lens; a
// monthly reflection prompt; a soft disclaimer. All content lives behind
// `luckyDays*V2*` i18n keys so any stale translation of the old keys
// can't bleed through.

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

function isKnownSign(value: string | null | undefined): value is SignKey {
  if (!value) return false;
  return SIGNS.includes(value.toLowerCase() as SignKey);
}

// Phase indicator — 5 dots, N filled. Used to convey window position in
// the monthly arc (begin / build / close), NOT a score. Visually mirrors
// the Daily/Monthly V2 meters but reads as a sequence marker, not a
// quantitative claim. The dot counts here are intrinsic to each window's
// role in a typical month — not derived from any seed or user data.
function PhaseDots({ filled }: { filled: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < filled ? "bg-[#a78bfa]" : "bg-white/15"
          }`}
        />
      ))}
    </div>
  );
}

type WindowDef = {
  key: "early" | "mid" | "late";
  rangeKey: string;
  labelKey: string;
  verbKey: string;
  bodyKeyTemplate: string;
  phase: 1 | 2 | 3 | 4 | 5;
};

const WINDOWS: WindowDef[] = [
  {
    key: "early",
    rangeKey: "luckyDaysV2WindowEarlyRange",
    labelKey: "luckyDaysV2WindowEarly",
    verbKey: "luckyDaysV2WindowEarlyVerb",
    bodyKeyTemplate: "luckyDaysEarlyWindowV2_",
    phase: 2,
  },
  {
    key: "mid",
    rangeKey: "luckyDaysV2WindowMidRange",
    labelKey: "luckyDaysV2WindowMid",
    verbKey: "luckyDaysV2WindowMidVerb",
    bodyKeyTemplate: "luckyDaysMidWindowV2_",
    phase: 4,
  },
  {
    key: "late",
    rangeKey: "luckyDaysV2WindowLateRange",
    labelKey: "luckyDaysV2WindowLate",
    verbKey: "luckyDaysV2WindowLateVerb",
    bodyKeyTemplate: "luckyDaysLateWindowV2_",
    phase: 3,
  },
];

type LensDef = {
  key: "connect" | "reflect" | "reset" | "plan";
  labelKey: string;
  bodyKey: string;
};

const LENSES: LensDef[] = [
  { key: "connect", labelKey: "luckyDaysV2LensConnect", bodyKey: "luckyDaysV2LensConnectBody" },
  { key: "reflect", labelKey: "luckyDaysV2LensReflect", bodyKey: "luckyDaysV2LensReflectBody" },
  { key: "reset", labelKey: "luckyDaysV2LensReset", bodyKey: "luckyDaysV2LensResetBody" },
  { key: "plan", labelKey: "luckyDaysV2LensPlan", bodyKey: "luckyDaysV2LensPlanBody" },
];

export function LuckyDaysOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(today),
    [locale, today]
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

  const signLabel = sunSign ? translateSign(sunSign, locale) : null;

  if (loading) {
    // Skeleton — 4 placeholder cards roughly matching the final layout.
    return (
      <div className="grid gap-6">
        <div className="h-44 animate-pulse rounded-[2rem] border border-border bg-card/90" />
        <div className="h-64 animate-pulse rounded-[2rem] border border-border bg-card/90" />
        <div className="h-48 animate-pulse rounded-[2rem] border border-border bg-card/90" />
        <div className="h-32 animate-pulse rounded-[2rem] border border-border bg-card/90" />
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

  // Cosmic-only gate, preserved exactly from the V1 surface.
  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
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

  // Tier OK but no sun sign — route to profile rather than fabricate.
  if (!isKnownSign(sunSign)) {
    return (
      <section className="rounded-[2rem] border border-border bg-card/90 p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("luckyDaysV2HeroEyebrow")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          {t("luckyDaysV2NoSignTitle")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-text-muted">
          {t("luckyDaysV2NoSignBody")}
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

  const sign: SignKey = sunSign.toLowerCase() as SignKey;

  return (
    <div className="grid gap-6">
      {/* Block 1 — Hero. Month + sign glyph + qualitative monthly theme. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <div className="rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("luckyDaysV2HeroEyebrow")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(91,84,168,0.34)] bg-[rgba(91,84,168,0.18)] text-3xl text-white"
              aria-hidden="true"
            >
              <ZodiacGlyph sign={sign} className="leading-none" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                {t("luckyDaysV2Title")}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {signLabel} · {monthLabel}
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-text-muted">
            {t("luckyDaysV2Subtitle")}
          </p>
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              {t("luckyDaysV2ThemeLabel")}
            </p>
            <p className="mt-2 text-lg font-medium text-white">
              {t(`luckyDaysThemeV2_${sign}`)}
            </p>
          </div>
        </div>
      </section>

      {/* Block 2 — Three planning windows. Each is a broad multi-day band
          (Days 1-10, 11-20, 21-end) with a qualitative verb (Begin / Build
          / Close) and a sign-specific paragraph. No precise dates, no
          times, no scores. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("luckyDaysV2WindowsTitle")}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {WINDOWS.map((w) => (
            <article
              key={w.key}
              className="flex flex-col rounded-[1.4rem] border border-border bg-bg/70 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
                    {t(w.labelKey)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">{t(w.rangeKey)}</p>
                </div>
                <PhaseDots filled={w.phase} />
              </div>
              <p className="mt-4 text-sm font-semibold text-white">
                {t(w.verbKey)}
              </p>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t(`${w.bodyKeyTemplate}${sign}`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Block 3 — Activity lenses. Four generic frames (Connect / Reflect
          / Reset / Plan) replacing the old risky categories (Love / Career
          / Money / Health / Creativity with date-pinned recommendations).
          These paragraphs are NOT pinned to any specific date — they're
          frames for the whole month. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("luckyDaysV2LensesTitle")}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {LENSES.map((lens) => (
            <article
              key={lens.key}
              className="rounded-[1.4rem] border border-border bg-bg/70 p-5"
            >
              <p className="text-sm font-semibold text-white">{t(lens.labelKey)}</p>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {t(lens.bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Block 4 — Dating lens. Coral-tinted card, mirrors Daily V2 /
          Monthly V2 styling for the dating block. */}
      <section className="rounded-[2rem] border border-[rgba(201,134,146,0.24)] bg-[rgba(201,134,146,0.10)] p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
          {t("luckyDaysV2DatingTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {t(`luckyDaysDatingLensV2_${sign}`)}
        </p>
      </section>

      {/* Block 5 — Reflection prompts. Journal-style invitations. */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("luckyDaysV2ReflectTitle")}
        </p>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t(`luckyDaysReflectionV2_${sign}`)}
        </p>
      </section>

      {/* Block 6 — Disclaimer. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("luckyDaysV2DisclaimerTitle")}
        </p>
        <p className="mt-2 text-sm leading-7 text-text-muted">
          {t("luckyDaysV2DisclaimerBody")}
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
