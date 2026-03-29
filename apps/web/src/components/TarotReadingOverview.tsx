"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getCurrentAccountState, type WebAccountState } from "@/lib/web-account";
import {
  generateReading,
  getCardImageUrl,
  getCardMeaning,
  getPositionLabel,
  type ReadingMode,
  type TarotReading,
} from "@/lib/tarotEngine";

type RevealState = Record<number, boolean>;

export function TarotReadingOverview() {
  const t = useTranslations("webApp");
  const [state, setState] = useState<WebAccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReadingMode>("love");
  const [revealed, setRevealed] = useState<RevealState>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const account = await getCurrentAccountState(t("unknownUser"));
        setState(account);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : t("unknownError")
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [t]);

  // Determine tier-based period
  const period = useMemo<"weekly" | "monthly" | null>(() => {
    if (!state) return null;
    if (state.tier === "premium_plus") return "weekly";
    if (state.tier === "premium") return "monthly";
    return null;
  }, [state]);

  // Generate the reading deterministically
  const reading = useMemo<TarotReading | null>(() => {
    if (!state?.userId || !period) return null;
    return generateReading(state.userId, mode, period);
  }, [state?.userId, mode, period]);

  // Reset revealed state when mode changes
  useEffect(() => {
    setRevealed({});
  }, [mode]);

  const handleReveal = useCallback((index: number) => {
    setRevealed((prev) => ({ ...prev, [index]: true }));
  }, []);

  const allRevealed = reading
    ? reading.cards.every((_, i) => revealed[i])
    : false;

  const periodLabel =
    period === "weekly" ? "Weekly" : period === "monthly" ? "Monthly" : "";

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
        <p className="mt-3 text-sm leading-7 text-text-muted">
          Sign in to unlock your personalized tarot reading.
        </p>
      </div>
    );
  }

  // --- Free tier locked state ---
  if (state.tier === "free") {
    return (
      <div className="rounded-[2rem] border border-border bg-card/90 p-8">
        <div className="max-w-3xl rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {t("premiumNav")}
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Tarot Reading
          </h2>
          <p className="mt-3 text-sm leading-7 text-text-muted">
            Upgrade to Celestial for monthly tarot readings, or Cosmic for
            weekly readings with an extra Cosmic Advice card. Each spread is
            seeded to your profile so your cards stay consistent throughout the
            period.
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

  // --- Premium reading ---
  if (!reading) return null;

  // For Celestial (premium), only show past/present/future (3 cards).
  // For Cosmic (premium_plus), show all 4 including advice.
  const visibleCards =
    state.tier === "premium_plus"
      ? reading.cards
      : reading.cards.filter((c) => c.position !== "advice");

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      {/* Main spread area */}
      <section className="rounded-[2rem] border border-border bg-card/90 p-6">
        {/* Header */}
        <div className="rounded-[1.75rem] border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
            {periodLabel} Tarot Reading
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-white">
            Your {mode === "love" ? "Love" : "General"} Spread
          </h2>

          {/* Mode toggle */}
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setMode("love")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "love"
                  ? "bg-accent text-white"
                  : "border border-border bg-bg/70 text-white hover:bg-card-hover"
              }`}
            >
              Love
            </button>
            <button
              onClick={() => setMode("general")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                mode === "general"
                  ? "bg-accent text-white"
                  : "border border-border bg-bg/70 text-white hover:bg-card-hover"
              }`}
            >
              General
            </button>
          </div>

          <p className="mt-5 text-sm leading-7 text-text-muted">
            {state.tier === "premium_plus"
              ? "Your Cosmic weekly spread draws four cards including a Cosmic Advice position. Tap each card to reveal it."
              : "Your Celestial monthly spread draws three cards. Tap each card to reveal it."}
          </p>
        </div>

        {/* Card grid */}
        <div
          className={`mt-6 grid gap-4 ${
            visibleCards.length === 4
              ? "grid-cols-2 md:grid-cols-4"
              : "grid-cols-3"
          }`}
        >
          {visibleCards.map((entry, i) => {
            const isRevealed = !!revealed[i];
            return (
              <button
                key={entry.card.id + entry.position}
                type="button"
                onClick={() => handleReveal(i)}
                className="group perspective-[800px] cursor-pointer focus:outline-none"
                aria-label={
                  isRevealed
                    ? `${entry.card.name} — ${getPositionLabel(entry.position)}`
                    : `Reveal ${getPositionLabel(entry.position)} card`
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
                      {mode === "love" ? "\u2665" : "\u2605"}
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                      {getPositionLabel(entry.position)}
                    </p>
                    <p className="text-[10px] text-text-dim/60">
                      Tap to reveal
                    </p>
                  </div>

                  {/* Card front (rotated so it faces forward after flip) */}
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
                    {/* Position label overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-text-dim">
                        {getPositionLabel(entry.position)}
                      </p>
                      <p className="text-xs font-semibold text-white truncate">
                        {entry.card.name}
                        {entry.card.reversed ? " (Rev.)" : ""}
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
            <div className="rounded-[1.75rem] border border-[rgba(232,93,117,0.24)] bg-[rgba(232,93,117,0.10)] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                Your Interpretation
              </p>
              <p className="mt-3 text-lg font-medium text-white">
                {mode === "love"
                  ? "Here is what the cards reveal about your love journey."
                  : "Here is what the cards reveal about your path ahead."}
              </p>
            </div>

            {visibleCards.map((entry) => (
              <article
                key={entry.card.id + "-meaning"}
                className="rounded-[1.5rem] border border-border bg-bg/70 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                      {getPositionLabel(entry.position)}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      {entry.card.name}
                      {entry.card.reversed ? " (Reversed)" : ""}
                    </h3>
                  </div>
                  <div className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-white">
                    {entry.card.suit === "major"
                      ? "Major Arcana"
                      : entry.card.suit.charAt(0).toUpperCase() +
                        entry.card.suit.slice(1)}
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-text-muted">
                  {getCardMeaning(entry.card, mode)}
                </p>
              </article>
            ))}
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
        <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
          Reading Details
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white">
          {periodLabel} Spread
        </h3>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              Mode
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {mode === "love" ? "Love Reading" : "General Reading"}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              Period
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {reading.seed}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              Cards Drawn
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {visibleCards.length} cards
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
              Your Tier
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {state.tier === "premium_plus" ? "Cosmic" : "Celestial"}
            </p>
            <p className="mt-2 text-sm leading-7 text-text-muted">
              {state.tier === "premium_plus"
                ? "Weekly readings with 4-card spread including Cosmic Advice."
                : "Monthly readings with 3-card past-present-future spread."}
            </p>
          </div>

          {state.tier === "premium" && (
            <div className="rounded-2xl border border-[rgba(124,108,255,0.24)] bg-[rgba(124,108,255,0.12)] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-text-dim">
                Upgrade
              </p>
              <p className="mt-3 text-sm leading-7 text-text-muted">
                Upgrade to Cosmic for weekly readings and an extra Cosmic Advice
                card in every spread.
              </p>
              <Link
                href="/app/plans"
                className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                {t("viewPlans")}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Inline styles for 3D perspective (Tailwind JIT handles most, but perspective needs a fallback) */}
      <style jsx global>{`
        .perspective-\\[800px\\] {
          perspective: 800px;
        }
      `}</style>
    </div>
  );
}
