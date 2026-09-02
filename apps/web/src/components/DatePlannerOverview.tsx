"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { translateSign } from "@/lib/astrology-labels";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import {
  getCurrentAccountState,
  type WebAccountState,
} from "@/lib/web-account";

// V2 Date Reflection. The previous Date Planner surfaced fabricated scores,
// hour windows, and ranked calendar slots. This surface drops every
// prediction and becomes a calm preparation tool: pick the intention you're
// bringing into the next conversation, read what to pay attention to (and
// what not to force), take a few open-ended prompts and low-pressure ideas,
// and step away. No astrological prescription, no calendar dates, no
// percentages.

type Intent = "firstConversation" | "firstDate" | "reconnect" | "deepen";

const INTENTS: Intent[] = [
  "firstConversation",
  "firstDate",
  "reconnect",
  "deepen",
];

type ServerGate = { allowed: boolean; reason: string | null };

type SelfProfile = {
  sun_sign: string | null;
};

export function DatePlannerOverview() {
  const t = useTranslations("webApp");
  const locale = useLocale();
  const [state, setState] = useState<WebAccountState | null>(null);
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverGate, setServerGate] = useState<ServerGate>({
    allowed: true,
    reason: null,
  });
  // Default to "firstDate" — the most common reason a user opens this tool
  // when meeting someone new from the app. Client-side only; no persistence.
  const [intent, setIntent] = useState<Intent>("firstDate");

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
        // ('date_planner', 'cosmic', 10). Free and Celestial fall through to
        // the paywall below; no RPC for them. Mirrors the
        // Retrograde / Transits V2 gate pattern exactly.
        if (account?.tier === "premium_plus") {
          const supabase = getSupabaseBrowser();
          const { data: gateRow, error: gateError } = await supabase
            .rpc("enforce_premium_feature", { p_feature_key: "date_planner" })
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

          // Own profile via SECURITY DEFINER RPC. We only need sun_sign for
          // the calm personal touch in the hero — never used to gate or
          // prescribe content. If it's missing we render the hero without
          // the glyph and offer a CTA to complete the profile.
          if (account.userId) {
            const { data: rows, error: profileError } = await supabase.rpc(
              "get_my_full_profile"
            );
            if (cancelled) return;
            if (profileError) {
              throw profileError;
            }
            const data = Array.isArray(rows) ? rows[0] : null;
            setProfile((data as SelfProfile | null) || null);
          } else {
            setProfile(null);
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
          {t("dateReflectionV2SignInBody")}
        </p>
      </div>
    );
  }

  // --- Free / Celestial → Cosmic upgrade paywall ---
  if (state.tier !== "premium_plus") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("dateReflectionV2LockedTitle")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("dateReflectionV2LockedBody")}
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
            ? t("dateReflectionV2QuotaTitle")
            : t("dateReflectionV2Title")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {isQuota
            ? t("dateReflectionV2QuotaBody")
            : t("unknownError")}
        </p>
      </div>
    );
  }

  const sunSign = profile?.sun_sign ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-6">
        {/* Hero */}
        <div className="rounded-[2rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2HeroEyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("dateReflectionV2Title")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("dateReflectionV2Subtitle")}
          </p>
          {sunSign ? (
            <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-border bg-bg/60 px-4 py-2 text-sm text-white">
              <ZodiacGlyph sign={sunSign} className="text-lg leading-none" />
              <span>{translateSign(sunSign, locale)}</span>
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-xs leading-6 text-text-muted">
                {t("dateReflectionV2NoProfileBody")}
              </p>
              <Link
                href="/app/profile"
                className="mt-3 inline-flex rounded-full border border-border px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-card-hover"
              >
                {t("openProfile")}
              </Link>
            </div>
          )}
        </div>

        {/* Intention selector — four mutually exclusive chips. State only
            lives in this component; no URL, no Supabase write. Quality over
            cleverness: a single click sets the lens for the rest of the
            surface. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2IntentTitle")}
          </p>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t("dateReflectionV2IntentBody")}
          </p>
          <div
            role="radiogroup"
            aria-label={t("dateReflectionV2IntentTitle")}
            className="mt-5 flex flex-wrap gap-2"
          >
            {INTENTS.map((value) => {
              const active = value === intent;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setIntent(value)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? "border-accent/40 bg-accent/15 text-white"
                      : "border-border bg-bg/70 text-text-muted hover:bg-card-hover"
                  }`}
                >
                  {t(`dateReflectionV2Intent_${value}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reflection lens — what to pay attention to, what to avoid forcing,
            plus a small grounding callout. All copy is keyed by intent only;
            no element nuance in this ship to keep quality high across both
            locales. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2LensTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t(`dateReflectionV2Lens_${intent}`)}
          </p>

          <div className="mt-5 rounded-[1.25rem] border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.10)] p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-200">
              {t("dateReflectionV2AvoidTitle")}
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t(`dateReflectionV2Avoid_${intent}`)}
            </p>
          </div>

          <div className="mt-5 rounded-[1.25rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-4">
            <p className="text-sm leading-7 text-emerald-100">
              {t("dateReflectionV2Callout")}
            </p>
          </div>
        </div>

        {/* Conversation prompts — three open-ended questions per intent. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2PromptsTitle")}
          </p>
          <ul className="mt-5 space-y-3">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="rounded-[1.25rem] border border-border bg-bg/70 p-4 text-sm leading-7 text-text-muted"
              >
                {t(`dateReflectionV2Prompts_${intent}_${n}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Low-pressure date ideas — three ideas per intent. Framed
            conditionally ("If you want low pressure…") and never tied to
            astrology, weather, or specific days. */}
        <div className="rounded-[2rem] border border-border bg-card/90 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2IdeasTitle")}
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="rounded-[1.25rem] border border-border bg-bg/70 p-4 text-sm leading-7 text-text-muted"
              >
                {t(`dateReflectionV2Idea_${intent}_${n}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer — same family of language as Retrograde / Transit V2. */}
        <div className="rounded-[2rem] border border-border bg-card/70 p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2DisclaimerTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("dateReflectionV2DisclaimerBody")}
          </p>
        </div>

        {error ? (
          <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      {/* Right rail: consent / boundaries note. Sits beside the main column
          on wide screens, drops below on narrow viewports. */}
      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.10)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("dateReflectionV2BoundariesTitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("dateReflectionV2BoundariesBody")}
          </p>
        </div>
      </aside>
    </div>
  );
}
