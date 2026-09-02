"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import {
  generateReading,
  getCardImageUrl,
  getCardMeaning,
  type ReadingMode,
  type SpreadPosition,
  type TarotCard,
  type TarotReading,
  type TarotSuit,
} from "@/lib/tarotEngine";

type RevealState = Record<number, boolean>;

// The seed order in tarotEngine is past/present/future/advice. V2 re-labels
// those positions editorially without touching the engine — same draw, new
// language. Maps the legacy SpreadPosition to the V2 i18n key suffix.
const POSITION_KEY: Record<SpreadPosition, string> = {
  past: "tarotV2PositionPresent",
  present: "tarotV2PositionAttention",
  future: "tarotV2PositionConnection",
  advice: "tarotV2PositionAdvice",
};

// Position × mode lens copy. A single static lens (V1 of V2) repeated the same
// sentence on every card and broke the illusion that each card was speaking
// to a different question. Splitting per position keeps the lens framing
// reflective without writing 78 card-specific lenses.
const LENS_KEY: Record<SpreadPosition, Record<ReadingMode, string>> = {
  past:    { love: "tarotV2DatingLensPresent",    general: "tarotV2ReflectionLensPresent" },
  present: { love: "tarotV2DatingLensAttention",  general: "tarotV2ReflectionLensAttention" },
  future:  { love: "tarotV2DatingLensConnection", general: "tarotV2ReflectionLensConnection" },
  advice:  { love: "tarotV2DatingLensAdvice",     general: "tarotV2ReflectionLensAdvice" },
};

const SUIT_KEY: Record<TarotSuit, string> = {
  major: "tarotV2MajorArcana",
  cups: "tarotV2SuitCups",
  wands: "tarotV2SuitWands",
  swords: "tarotV2SuitSwords",
  pents: "tarotV2SuitPentacles",
};

type ServerGate = { allowed: boolean; reason: string | null };

export function TarotReadingOverview() {
  const t = useTranslations("webApp");
  const [state, setState] = useState<WebAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReadingMode>("love");
  const [revealed, setRevealed] = useState<RevealState>({});
  const [serverGate, setServerGate] = useState<ServerGate>({ allowed: true, reason: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        if (cancelled) return;
        setState(account);

        // Server-side enforcement runs for both paid tiers. The legacy single
        // 'tarot' policy key was cosmic-only, which forced the previous bypass
        // for Celestial; migration 20260511000002 split it into two keys so
        // each tier hits the policy that matches the product:
        //   premium       (Celestial) → 'tarot_monthly' (NULL quota)
        //   premium_plus  (Cosmic)    → 'tarot_cosmic'  (10/day)
        const featureKey =
          account?.tier === "premium_plus"
            ? "tarot_cosmic"
            : account?.tier === "premium"
              ? "tarot_monthly"
              : null;

        if (featureKey) {
          const supabase = getSupabaseBrowser();
          const { data: gateRow, error: gateError } = await supabase
            .rpc("enforce_premium_feature", { p_feature_key: featureKey })
            .maybeSingle<{ allowed: boolean; reason: string | null }>();

          if (cancelled) return;
          if (gateError || !gateRow || gateRow.allowed !== true) {
            setServerGate({ allowed: false, reason: gateRow?.reason ?? "error" });
            return;
          }
          setServerGate({ allowed: true, reason: "ok" });
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : t("unknownError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const period = useMemo<"weekly" | "monthly" | null>(() => {
    if (!state) return null;
    if (state.tier === "premium_plus") return "weekly";
    if (state.tier === "premium") return "monthly";
    return null;
  }, [state]);

  const reading = useMemo<TarotReading | null>(() => {
    if (!state?.userId || !period) return null;
    return generateReading(state.userId, mode, period);
  }, [state?.userId, mode, period]);

  useEffect(() => {
    setRevealed({});
  }, [mode]);

  const handleReveal = useCallback((index: number) => {
    setRevealed((prev) => ({ ...prev, [index]: true }));
  }, []);

  const allRevealed = reading
    ? reading.cards.every((_, i) => revealed[i])
    : false;

  // --- Loading state ---
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
      </div>
    );
  }

  // --- Free tier locked state ---
  if (state.tier === "free") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("tarotV2Title")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("tarotV2Subtitle")}
          </p>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("tarotLockedBody")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/app/plans"
              className="rounded-full bg-gold px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
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

  // --- Server-gate denied (any paid tier) ---
  if (
    (state.tier === "premium" || state.tier === "premium_plus") &&
    !serverGate.allowed
  ) {
    const isQuota = serverGate.reason === "quota_exceeded";
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <h2 className="text-2xl font-semibold text-white">
          {isQuota ? t("tarotV2QuotaTitle") : t("tarotV2Title")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-text-muted">
          {isQuota ? t("tarotV2QuotaBody") : t("unknownError")}
        </p>
      </div>
    );
  }

  // --- Premium reading ---
  if (!reading) return null;

  // Celestial (premium) sees 3 cards (no advice). Cosmic (premium_plus) sees all 4.
  const visibleCards =
    state.tier === "premium_plus"
      ? reading.cards
      : reading.cards.filter((c) => c.position !== "advice");

  const tierLabelKey =
    state.tier === "premium_plus" ? "tarotV2TierCosmic" : "tarotV2TierCelestial";
  const tierDescriptionKey =
    state.tier === "premium_plus"
      ? "tarotV2TierCosmicDescription"
      : "tarotV2TierCelestialDescription";
  const periodLabelKey =
    period === "weekly" ? "tarotV2WeeklyPeriodLabel" : "tarotV2MonthlyPeriodLabel";
  const descriptionKey =
    state.tier === "premium_plus"
      ? "tarotV2WeeklyDescription"
      : "tarotV2MonthlyDescription";
  const spreadTitleKey =
    mode === "love" ? "tarotV2LoveSpread" : "tarotV2GeneralSpread";
  const interpretationBodyKey =
    mode === "love"
      ? "tarotV2InterpretationLoveBody"
      : "tarotV2InterpretationGeneralBody";
  const lensLabelKey =
    mode === "love" ? "tarotV2DatingLensLabel" : "tarotV2ReflectionLensLabel";

  const promptKeys =
    mode === "love"
      ? ["tarotV2PromptLove1", "tarotV2PromptLove2", "tarotV2PromptLove3"]
      : ["tarotV2PromptGeneral1", "tarotV2PromptGeneral2", "tarotV2PromptGeneral3"];

  // Responsive grid: 360px-safe. 3-card spread = 1 col on phone, 3 on sm+.
  // 4-card spread = 2 cols on phone, 4 on md+.
  const gridClass =
    visibleCards.length === 4
      ? "grid-cols-2 md:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-3";

  const suitLabel = (card: TarotCard) => t(SUIT_KEY[card.suit]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      {/* Main spread area */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        {/* Hero */}
        <div className="rounded-[1.75rem] border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
            {t(periodLabelKey)}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            {t("tarotV2Title")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            {t("tarotV2Subtitle")}
          </p>

          {/* Mode toggle */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setMode("love")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "love"
                  ? "bg-gold text-bg"
                  : "border border-border bg-bg/70 text-white hover:bg-card-hover"
              }`}
            >
              {t("tarotV2ModeLove")}
            </button>
            <button
              onClick={() => setMode("general")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "general"
                  ? "bg-gold text-bg"
                  : "border border-border bg-bg/70 text-white hover:bg-card-hover"
              }`}
            >
              {t("tarotV2ModeGeneral")}
            </button>
          </div>

          <p className="mt-5 text-lg font-medium text-white">
            {t(spreadTitleKey)}
          </p>
          <p className="mt-2 text-sm leading-7 text-text-muted">
            {t(descriptionKey)}
          </p>
        </div>

        {/* Card grid */}
        <div className={`mt-6 grid gap-4 ${gridClass}`}>
          {visibleCards.map((entry, i) => {
            const isRevealed = !!revealed[i];
            const positionLabel = t(POSITION_KEY[entry.position]);
            return (
              <button
                key={entry.card.id + entry.position}
                type="button"
                onClick={() => handleReveal(i)}
                className="group perspective-[800px] cursor-pointer focus:outline-none"
                aria-label={
                  isRevealed
                    ? `${entry.card.name} — ${positionLabel}`
                    : `${t("tarotV2TapToReveal")} — ${positionLabel}`
                }
              >
                <div
                  className={`relative aspect-[2/3] w-full transition-transform duration-700 [transform-style:preserve-3d] ${
                    isRevealed ? "[transform:rotateY(180deg)]" : ""
                  }`}
                >
                  {/* Card back */}
                  <div className="absolute inset-0 rounded-2xl border border-border bg-gradient-to-br from-[#2a1a4e] to-[#1a0e2e] [backface-visibility:hidden] flex flex-col items-center justify-center gap-3 group-hover:border-accent/50 transition-colors">
                    <div className="text-3xl">
                      {mode === "love" ? "♥" : "★"}
                    </div>
                    <p className="text-center px-2 text-xs uppercase tracking-[0.24em] text-gold-muted">
                      {positionLabel}
                    </p>
                    <p className="text-[10px] text-text-dim/60">
                      {t("tarotV2TapToReveal")}
                    </p>
                  </div>

                  {/* Card front */}
                  <div className="absolute inset-0 rounded-2xl border border-border overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getCardImageUrl(entry.card.imageFile)}
                      alt={entry.card.name}
                      className={`h-full w-full object-cover ${
                        entry.card.reversed ? "rotate-180" : ""
                      }`}
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-gold-muted">
                        {positionLabel}
                      </p>
                      <p className="text-xs font-semibold text-white truncate">
                        {entry.card.name}
                        {entry.card.reversed ? ` (${t("tarotV2ReversedSuffix")})` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Interpretations — shown after all cards revealed */}
        {allRevealed && (
          <div className="mt-6 space-y-4">
            <div className="rounded-[1.75rem] border border-[rgba(201,134,146,0.24)] bg-[rgba(201,134,146,0.10)] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("tarotV2InterpretationTitle")}
              </p>
              <p className="mt-3 text-lg font-medium text-white">
                {t(interpretationBodyKey)}
              </p>
            </div>

            {visibleCards.map((entry) => (
              <article
                key={entry.card.id + "-meaning"}
                className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                      {t(POSITION_KEY[entry.position])}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      {entry.card.name}
                      {entry.card.reversed
                        ? ` (${t("tarotV2ReversedSuffix")})`
                        : ""}
                    </h3>
                  </div>
                  <div className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-white">
                    {suitLabel(entry.card)}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-text-muted">
                  {getCardMeaning(entry.card, mode)}
                </p>
                <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                    {t(lensLabelKey)}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-text-muted">
                    {t(LENS_KEY[entry.position][mode])}
                  </p>
                </div>
              </article>
            ))}

            {/* Journal prompts */}
            <div className="rounded-[1.5rem] border border-border bg-bg/70 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("tarotV2JournalTitle")}
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-text-muted">
                {promptKeys.map((key) => (
                  <li key={key} className="flex gap-2">
                    <span aria-hidden className="text-text-dim">·</span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Disclaimer */}
            <div className="rounded-[1.5rem] border border-border bg-bg/50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("tarotV2DisclaimerTitle")}
              </p>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                {t("tarotV2DisclaimerBody")}
              </p>
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-[#ffd0d7]">
            {error}
          </p>
        ) : null}
      </section>

      {/* Sidebar */}
      <aside className="rounded-[2rem] border border-border bg-card/90 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
          {t("tarotV2ReadingDetailsLabel")}
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white">
          {t(periodLabelKey)}
        </h3>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
              {t("tarotV2ModeLabel")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {t(spreadTitleKey)}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
              {t("tarotV2PeriodLabel")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {reading.seed}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
              {t("tarotV2CardsLabel")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {visibleCards.length}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
              {t("tarotV2TierLabel")}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {t(tierLabelKey)}
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {t(tierDescriptionKey)}
            </p>
          </div>

          {state.tier === "premium" && (
            <div className="rounded-2xl border border-[rgba(91,84,168,0.24)] bg-[rgba(91,84,168,0.12)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gold-muted">
                {t("tarotV2UpgradeLabel")}
              </p>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                {t("tarotV2UpgradeBody")}
              </p>
              <Link
                href="/app/plans"
                className="mt-3 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-soft"
              >
                {t("viewPlans")}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Inline styles for 3D perspective */}
      <style jsx global>{`
        .perspective-\\[800px\\] {
          perspective: 800px;
        }
      `}</style>
    </div>
  );
}
