import type { ReactNode } from "react";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";

/**
 * Premium placement card — one planet + one sign + a short pedagogical
 * read. Used inside NatalChartOverview (and later Synastry) to give
 * Celestial users a meaningful "what this means for you" panel beyond
 * the bare "Mercury in Aries" label.
 *
 * The card is intentionally dumb: the caller resolves all text upstream
 * (either from i18n keys or static maps) and passes the resolved strings
 * here. That keeps the lookup logic in one place and lets us add per-
 * placement content incrementally — show a card only when content exists
 * for that (planet, sign) tuple.
 *
 * Layout decisions:
 * - Two-column header on sm+ (zodiac glyph + planet label / sign label)
 *   collapses to a stacked header on mobile so 360px viewports stay clean.
 * - `meaning` is the universal one-liner about the planet itself
 *   ("Mercury describes how you think, speak, and process information.")
 * - `interpretation` is the placement-specific colour
 *   ("In Aries, this can show…")
 * - `inLove` is an optional dating-lens callout reserved for Venus, Mars,
 *   and Moon. The visual treatment (subtle coral border) signals it's a
 *   different kind of read without screaming for attention.
 *
 * Content guardrails are the caller's responsibility: always "can",
 * "may", "tends to" — never absolutes or predictions.
 */

type PlacementCardProps = {
  /** Localised planet name, e.g. "Mercury" or "Mercure". */
  planet: string;
  /**
   * Canonical English sign key (e.g. "aries"). Used by ZodiacGlyph to
   * resolve the Unicode symbol — never displayed directly.
   */
  signKey: string;
  /** Localised sign label, e.g. "Aries" or "Bélier". */
  signLabel: string;
  /** What this planet represents in general. One sentence. */
  meaning: string;
  /** How this sign colours this planet. One short paragraph. */
  interpretation: string;
  /** Optional dating-lens read. Only for Venus, Mars, Moon. */
  inLove?: string;
  /** Optional eyebrow above the planet name, e.g. "FEATURED INSIGHT". */
  eyebrow?: string;
  /** Optional aria label override for the "in love" callout. */
  inLoveLabel?: string;
  className?: string;
  children?: ReactNode;
};

export function PlacementCard({
  planet,
  signKey,
  signLabel,
  meaning,
  interpretation,
  inLove,
  eyebrow,
  inLoveLabel,
  className = "",
  children,
}: PlacementCardProps) {
  return (
    <article
      className={`rounded-[1.75rem] border border-border bg-card/90 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.16)] ${className}`}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.12)] text-2xl text-white"
          aria-hidden="true"
        >
          <ZodiacGlyph sign={signKey} className="text-2xl leading-none" />
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-dim">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-white sm:text-2xl">
            {planet} <span className="text-text-muted">in</span> {signLabel}
          </h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">{meaning}</p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-7 text-white/90">{interpretation}</p>

      {inLove ? (
        <div className="mt-5 rounded-2xl border border-[rgba(232,93,117,0.22)] bg-[rgba(232,93,117,0.08)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
            {inLoveLabel ?? "In love"}
          </p>
          <p className="mt-2 text-sm leading-7 text-white/90">{inLove}</p>
        </div>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </article>
  );
}
