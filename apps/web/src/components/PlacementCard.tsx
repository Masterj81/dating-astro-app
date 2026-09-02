import type { ReactNode } from "react";
import { ZodiacGlyph } from "@/components/ZodiacGlyph";

/**
 * Premium placement card — one planet + one sign + (optional) one house +
 * a short pedagogical read in four passes. Used inside NatalChartOverview
 * (and later Synastry) to give Celestial users a defensible "what this
 * means for you" panel beyond the bare "Mercury in Aries" label.
 *
 * The four reads, in order:
 * 1. `planetMeaning`         — what the planet describes in general.
 * 2. `signInterpretation`    — how this sign colours that planet.
 * 3. `houseMeaning`          — where this energy expresses in life (optional).
 * 4. `datingLens`            — relationship / communication lens (optional).
 *
 * The card is intentionally dumb: the caller resolves every string
 * upstream (i18n key, static map, or future API) and passes resolved
 * text here. That keeps the lookup logic in one place and lets us add
 * per-placement content incrementally — show a card only when content
 * exists for that (planet, sign) tuple.
 *
 * Content guardrails are the caller's responsibility: always "can",
 * "may", "tends to" — never absolutes, never predictions, never
 * "destined" / "guaranteed" / "soulmate".
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
  /** What this planet describes in general. One sentence. */
  planetMeaning: string;
  /** How this sign colours this planet. One short paragraph. */
  signInterpretation: string;
  /** Optional 1..12 house number to surface as a badge on the header. */
  houseNumber?: number | null;
  /** Localised house name, e.g. "5th house" / "Maison V". */
  houseLabel?: string;
  /** Short description of the life area this house governs. */
  houseMeaning?: string;
  /** Optional relationship / communication callout. */
  datingLens?: string;
  /** Optional eyebrow above the planet name, e.g. "FEATURED INSIGHT". */
  eyebrow?: string;
  /** Label for the dating-lens callout, e.g. "Dating lens". */
  datingLensLabel?: string;
  className?: string;
  children?: ReactNode;
};

export function PlacementCard({
  planet,
  signKey,
  signLabel,
  planetMeaning,
  signInterpretation,
  houseNumber,
  houseLabel,
  houseMeaning,
  datingLens,
  eyebrow,
  datingLensLabel,
  className = "",
  children,
}: PlacementCardProps) {
  const hasHouse = typeof houseNumber === "number" && houseNumber >= 1 && houseNumber <= 12;
  return (
    <article
      className={`flex h-full flex-col rounded-[1.75rem] border border-border bg-card/90 p-6 shadow-[0_18px_50px_rgba(0, 0, 0, 0.16)] ${className}`}
    >
      <header className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[rgba(201, 134, 146, 0.22)] bg-[rgba(201, 134, 146, 0.12)] text-2xl text-white"
          aria-hidden="true"
        >
          <ZodiacGlyph sign={signKey} className="text-2xl leading-none" />
        </div>
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-muted">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-white sm:text-2xl">
            {planet} <span className="text-text-muted">in</span> {signLabel}
          </h3>
        </div>
        {hasHouse && houseLabel ? (
          <span
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80"
            aria-label={houseLabel}
          >
            {houseLabel}
          </span>
        ) : null}
      </header>

      <p className="mt-4 text-sm leading-6 text-text-muted">{planetMeaning}</p>

      <p className="mt-3 text-sm leading-7 text-white/90">{signInterpretation}</p>

      {houseMeaning ? (
        <p className="mt-3 text-sm leading-6 text-text-muted">
          <span className="font-semibold text-white/90">
            {houseLabel ?? `House ${houseNumber ?? ""}`}
          </span>
          <span> — {houseMeaning}</span>
        </p>
      ) : null}

      {datingLens ? (
        <div className="mt-5 rounded-2xl border border-[rgba(201, 134, 146, 0.22)] bg-[rgba(201, 134, 146, 0.08)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#ffb7c7]">
            {datingLensLabel ?? "Dating lens"}
          </p>
          <p className="mt-2 text-sm leading-7 text-white/90">{datingLens}</p>
        </div>
      ) : null}

      {children ? <div className="mt-5">{children}</div> : null}
    </article>
  );
}
