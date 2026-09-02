/**
 * SVG glyph set used on Cosmic + Celestial hub feature cards.
 *
 * Replaces a previous emoji (🃏) and the absence-of-icon for the other
 * cards. Visual style is intentionally aligned with NavIcons / CardGlyph:
 * 24x24 viewBox, 1.8 stroke width, currentColor strokes — so the
 * iconographic vocabulary is shared across navigation, dashboard cards,
 * and premium hub cards.
 *
 * Always render with aria-hidden — the card title next to the glyph
 * carries the accessible label.
 */

export type PremiumGlyphName =
  // Cosmic
  | "daily"
  | "monthly"
  | "transits"
  | "lucky"
  | "planner"
  | "retrograde"
  | "tarot"
  // Celestial
  | "natal"
  | "synastry"
  | "likes"
  | "priorityMessages"
  | "coach";

type PremiumGlyphProps = {
  name: PremiumGlyphName;
  className?: string;
};

export function PremiumGlyph({ name, className = "h-5 w-5" }: PremiumGlyphProps) {
  const stroke = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "daily":
      // Sun rising over a horizon line
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 4v2M12 18v2M4 12h2M18 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
          <path d="M3 21h18" strokeLinecap="round" />
        </svg>
      );
    case "monthly":
      // Crescent moon enclosing two stars (full / waxing reference)
      return (
        <svg {...stroke}>
          <path d="M20 14a8 8 0 1 1-9.7-9.7A6 6 0 0 0 20 14Z" />
          <circle cx="14.5" cy="9.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "transits":
      // Planet with orbit arrow — movement / progression
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M3.5 12a8.5 8.5 0 0 0 14.5 6" />
          <path d="M16 17l2 1 0-2.5" />
        </svg>
      );
    case "lucky":
      // Four-point star with a small dot — moments of luck
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 3l1.5 4.6L18 9l-4.5 1.4L12 15l-1.5-4.6L6 9l4.5-1.4L12 3Z" />
          <circle cx="18.5" cy="17.5" r="1.2" />
        </svg>
      );
    case "planner":
      // Calendar with a small heart — date planning
      return (
        <svg {...stroke}>
          <rect x="3.5" y="5" width="17" height="14" rx="2" />
          <path d="M3.5 9h17M8 3.5v3M16 3.5v3" />
          <path
            d="M12 16.5c-2.2-1.4-3-2.4-3-3.5a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 1.1-.8 2.1-3 3.5Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case "retrograde":
      // Looping arrow — retrograde motion
      return (
        <svg {...stroke}>
          <path d="M5 12a7 7 0 0 1 12-5l1.5 1.5" />
          <path d="M19 12a7 7 0 0 1-12 5l-1.5-1.5" />
          <path d="M18 4.5V8h-3.5M6 19.5V16h3.5" />
        </svg>
      );
    case "tarot":
      // Tarot card with star detail
      return (
        <svg {...stroke}>
          <rect x="6.5" y="3.5" width="11" height="17" rx="1.5" />
          <path d="M12 9v6M9 12h6" />
        </svg>
      );
    case "natal":
      // Chart wheel — concentric circles with cross axes
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <path d="M3.5 12h17M12 3.5v17" />
        </svg>
      );
    case "synastry":
      // Two overlapping rings — synastry chart
      return (
        <svg {...stroke}>
          <circle cx="9" cy="12" r="5" />
          <circle cx="15" cy="12" r="5" />
        </svg>
      );
    case "coach":
      // A speech bubble with a star above it — words, with the chart behind
      // them. Kept distinct from the plain chat bubble used in navigation.
      return (
        <svg {...stroke}>
          <path d="M4 6.5h13A2.5 2.5 0 0 1 19.5 9v5a2.5 2.5 0 0 1-2.5 2.5h-6l-4 3v-3H4A2.5 2.5 0 0 1 1.5 14V9A2.5 2.5 0 0 1 4 6.5Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 2.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
        </svg>
      );
    case "likes":
      // Heart — likes / matches
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 21s-7-4.5-9-9C1.4 8.7 3 5 6.6 5c2 0 3.4 1.1 4.4 2.4 1-1.3 2.4-2.4 4.4-2.4 3.6 0 5.2 3.7 3.6 7-2 4.5-9 9-9 9Z" />
        </svg>
      );
    case "priorityMessages":
      // Envelope with a star — priority / boosted messages
      return (
        <svg {...stroke}>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="M3.5 7.5l8.5 6.5 8.5-6.5" />
          <path d="M16.5 4l.7 1.6 1.6.6-1.6.6L16.5 8.5l-.7-1.7-1.6-.6 1.6-.6L16.5 4Z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
