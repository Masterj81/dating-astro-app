/**
 * Shared navigation icon set for the authenticated web app shell.
 *
 * Replaces the emoji-as-icon strings (🏠 🔮 💬 🌌 ✨ 👤) that previously
 * lived in AppShell. SVG-based, currentColor-driven so they pick up the
 * sidebar / bottom-tab text color including the active accent state.
 *
 * Visual style is aligned with the CardGlyph set used in DashboardOverview
 * — 24x24 viewBox, 1.8 stroke width, soft rounded line caps — so navigation
 * and dashboard cards share the same iconographic vocabulary.
 *
 * Always pair with aria-hidden="true" at the call site (the visible label
 * next to the icon already names the destination).
 */

export type NavIconName =
  | "dashboard"
  | "discover"
  | "chat"
  | "cosmic"
  | "celestial"
  | "profile"
  | "globe"
  | "signout"
  | "upgrade";

type NavIconProps = {
  name: NavIconName;
  className?: string;
};

export function NavIcon({ name, className = "h-5 w-5" }: NavIconProps) {
  const baseProps = {
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
    case "dashboard":
      return (
        <svg {...baseProps}>
          <path d="M3 11.5L12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5z" />
        </svg>
      );
    case "discover":
      // Compass-meets-search: a circle with a focus dot and a southeast handle,
      // matching the mobile Discover identity (browse-with-intent).
      return (
        <svg {...baseProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l5 5" />
          <circle cx="11" cy="11" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "chat":
      return (
        <svg {...baseProps}>
          <path d="M5 6.5h14A2.5 2.5 0 0 1 21.5 9v6A2.5 2.5 0 0 1 19 17.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V9A2.5 2.5 0 0 1 5 6.5Z" />
          <path d="M8 11.5h8M8 14.5h5" />
        </svg>
      );
    case "cosmic":
      // Saturn-with-rings glyph — Cosmic tier hub.
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="4" />
          <ellipse cx="12" cy="12" rx="9" ry="3" />
        </svg>
      );
    case "celestial":
      // Four-point star with smaller secondary star — Celestial hub / natal.
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.6 4.5L18 8l-4.4 1.5L12 14l-1.6-4.5L6 8l4.4-1.5L12 2Z" />
          <path d="M18.5 14l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
        </svg>
      );
    case "profile":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5 19.5c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
        </svg>
      );
    case "globe":
      return (
        <svg {...baseProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "signout":
      return (
        <svg {...baseProps}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 17l5-5-5-5M15 12H4" />
        </svg>
      );
    case "upgrade":
      // Same four-point star as celestial but a touch smaller — used inline as
      // a "go premium" affordance.
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12 3l1.6 4.5L18 9l-4.4 1.5L12 15l-1.6-4.5L6 9l4.4-1.5L12 3Z" />
        </svg>
      );
  }
}
