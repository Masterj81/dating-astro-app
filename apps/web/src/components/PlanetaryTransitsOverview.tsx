"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";

type PlanetKey =
  | "sun"
  | "moon"
  | "mercury"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn";

type Phase = "prominent" | "supporting" | "background" | "shifting";

type PlanetReflection = {
  key: PlanetKey;
  phase: Phase;
};

const PLANET_SYMBOL: Record<PlanetKey, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
};

const PHASE_BADGE: Record<Phase, string> = {
  prominent: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  supporting: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  background: "border-white/15 bg-white/5 text-text-muted",
  shifting: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

// Phases are intentionally hardcoded symbolic states, not derived from a real
// ephemeris. The product decision (Option C) is to drop fabricated calendar
// dates and present these as reflection prompts, not astronomical timing.
const PLANETS: PlanetReflection[] = [
  { key: "sun", phase: "supporting" },
  { key: "moon", phase: "prominent" },
  { key: "mercury", phase: "shifting" },
  { key: "venus", phase: "prominent" },
  { key: "mars", phase: "supporting" },
  { key: "jupiter", phase: "background" },
  { key: "saturn", phase: "background" },
];

const SIGN_KEYS = [
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

type SignKey = (typeof SIGN_KEYS)[number];

function normalizeSignKey(value: string | null | undefined): SignKey | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  return (SIGN_KEYS as readonly string[]).includes(lower)
    ? (lower as SignKey)
    : null;
}

type ServerGate = { allowed: boolean; reason: string | null };

export function PlanetaryTransitsOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverGate, setServerGate] = useState<ServerGate>({
    allowed: true,
    reason: null,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        if (cancelled) return;
        setState(account);

        // Server-side enforcement for Cosmic only. DB policy:
        // ('planetary_transits', 'cosmic', NULL). NULL quota = unlimited,
        // mirroring natal_chart / lucky_days / retrograde_alerts. Free and
        // Celestial fall through to the paywall below; no RPC for them.
        if (account?.tier === "premium_plus") {
          const supabase = getSupabaseBrowser();
          const { data: gateRow, error: gateError } = await supabase
            .rpc("enforce_premium_feature", {
              p_feature_key: "planetary_transits",
            })
            .maybeSingle<{ allowed: boolean; reason: string | null }>();

          if (cancelled) return;
          if (gateError || !gateRow || gateRow.allowed !== true) {
            setServerGate({
              allowed: false,
              reason: gateRow?.reason ?? "error",
            });
            return;
          }
          setServerGate({ allowed: true, reason: "ok" });

          // Personal lens only needs sun_sign and only matters for Cosmic
          // users who passed the gate.
          if (account.userId) {
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("sun_sign")
              .eq("id", account.userId)
              .maybeSingle();
            if (cancelled) return;
            if (profileError) {
              throw profileError;
            }
            setSunSign(profile?.sun_sign ?? null);
          } else {
            setSunSign(null);
          }
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error ? loadError.message : t("unknownError")
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // --- Loading ---
  if (loading) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-6 text-sm text-text-muted">
        {t("loading")}
      </div>
    );
  }

  // --- Not signed in ---
  if (!state) {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">
          {t("notSignedIn")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {t("transitReflectionV2SignInBody")}
        </p>
      </div>
    );
  }

  // --- Free / Celestial → Cosmic upgrade paywall ---
  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("transitReflectionV2LockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("transitReflectionV2LockedBody")}
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

  // --- Server-gate denied (Cosmic) ---
  if (!serverGate.allowed) {
    const isQuota = serverGate.reason === "quota_exceeded";
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">
          {isQuota
            ? t("transitReflectionV2QuotaTitle")
            : t("transitReflectionV2Title")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {isQuota
            ? t("transitReflectionV2QuotaBody")
            : t("unknownError")}
        </p>
      </div>
    );
  }

  const signKey = normalizeSignKey(sunSign);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        {/* Hero */}
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("transitReflectionV2Eyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("transitReflectionV2Title")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("transitReflectionV2Subtitle")}
          </p>
        </div>

        {/* Personal lens (Cosmic + sun_sign present) or no-sign CTA */}
        {signKey ? (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("transitReflectionV2PersonalLensTitle", {
                sign: translateSign(signKey, locale),
              })}
            </p>
            <p className="mt-3 text-sm leading-7 text-text-muted">
              {t(`transitReflectionV2PersonalLens_${signKey}`)}
            </p>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-border bg-card/90 p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              {t("transitReflectionV2NoSignTitle")}
            </p>
            <p className="mt-3 text-sm leading-7 text-text-muted">
              {t("transitReflectionV2NoSignBody")}
            </p>
            <div className="mt-5">
              <Link
                href="/app/profile"
                className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
              >
                {t("profileNav")}
              </Link>
            </div>
          </div>
        )}

        {/* Planet reflections — flat list, no expand/collapse so each card
            tells its full story without a click. Vertical stack keeps 360px
            safe and matches the Daily/Monthly/Retrograde V2 reading pattern. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("transitReflectionV2CurrentTitle")}
          </p>
          <div className="mt-5 space-y-4">
            {PLANETS.map((planet) => {
              const highlightKey = `transitReflectionV2_${planet.key}_highlight`;
              const relationshipKey = `transitReflectionV2_${planet.key}_relationship`;
              const promptKey = `transitReflectionV2_${planet.key}_prompt`;
              const phaseKey = `transitReflectionV2Phase_${planet.phase}`;
              return (
                <article
                  key={planet.key}
                  className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
                >
                  <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] text-2xl text-white">
                        {PLANET_SYMBOL[planet.key]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-white">
                          {t(`natalPlanet_${planet.key}`)}
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${PHASE_BADGE[planet.phase]}`}
                    >
                      {t(phaseKey)}
                    </span>
                  </header>

                  <div className="mt-5 space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                        {t("transitReflectionV2HighlightTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-text-muted">
                        {t(highlightKey)}
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-border bg-card/70 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                        {t("transitReflectionV2RelationshipTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-text-muted">
                        {t(relationshipKey)}
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-border bg-bg/50 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                        {t("transitReflectionV2PromptTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-7 text-text-muted">
                        {t(promptKey)}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="rounded-[2rem] border border-border bg-card/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("transitReflectionV2DisclaimerTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("transitReflectionV2DisclaimerBody")}
          </p>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("transitReflectionV2GuideTitle")}
          </p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-text-muted">
            <p>{t("transitReflectionV2Guide_1")}</p>
            <p>{t("transitReflectionV2Guide_2")}</p>
            <p>{t("transitReflectionV2Guide_3")}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
