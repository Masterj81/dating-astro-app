/**
 * Line-art SVG icons for marketing pages.
 * Stroke 1.5px on `#F7F4EE` (cream), accent rose `#E94560` is reserved for hover/details.
 * Replaces the previous emoji set (🪐💫🔮⭐🌙 + 🌟🔮💬) with consistent custom glyphs.
 */

type IconProps = { className?: string; size?: number };

const STROKE = "#F7F4EE";

function base({ size = 28, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: STROKE,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export function BirthChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="16" cy="16" r="11" />
      <circle cx="16" cy="16" r="6" />
      <path d="M16 5v22M5 16h22" />
      <path d="M8.2 8.2l15.6 15.6M23.8 8.2L8.2 23.8" strokeOpacity="0.45" />
      <circle cx="16" cy="5" r="1" fill={STROKE} />
      <circle cx="27" cy="16" r="1" fill={STROKE} />
    </svg>
  );
}

export function SynastryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="16" r="7" />
      <circle cx="20" cy="16" r="7" />
      <path d="M16 11.5v9" strokeOpacity="0.55" />
    </svg>
  );
}

export function DiscoveryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="14" cy="14" r="8" />
      <path d="M20 20l5 5" />
      <path d="M14 11v6M11 14h6" strokeOpacity="0.55" />
    </svg>
  );
}

export function HoroscopeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 19a8 8 0 11-9-12 6.5 6.5 0 009 12z" />
      <circle cx="9" cy="9" r="0.8" fill={STROKE} />
      <circle cx="24" cy="11" r="0.8" fill={STROKE} />
    </svg>
  );
}

export function TransitsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="16" cy="16" rx="12" ry="5" transform="rotate(-20 16 16)" />
      <circle cx="16" cy="16" r="3" fill={STROKE} />
      <circle cx="26.5" cy="11.4" r="1.4" fill={STROKE} />
    </svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="16" cy="11" r="4.5" />
      <path d="M7 26c1.5-5 4.7-7.5 9-7.5s7.5 2.5 9 7.5" />
      <path d="M11 23h10" strokeOpacity="0.45" />
    </svg>
  );
}

export function DiscoverPeopleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 16c4-6 9-9 13-9s9 3 13 9c-4 6-9 9-13 9s-9-3-13-9z" />
      <circle cx="16" cy="16" r="4" />
      <circle cx="16" cy="16" r="1.5" fill={STROKE} />
    </svg>
  );
}

export function ConversationIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 11a4 4 0 014-4h10a4 4 0 014 4v5a4 4 0 01-4 4h-7l-5 4v-4H9a4 4 0 01-4-4z" />
      <circle cx="11" cy="13.5" r="0.9" fill={STROKE} />
      <circle cx="14.5" cy="13.5" r="0.9" fill={STROKE} />
      <circle cx="18" cy="13.5" r="0.9" fill={STROKE} />
    </svg>
  );
}
