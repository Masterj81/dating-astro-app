/**
 * Compatibility dots arc — port of apps/mobile/components/astrology/CompatibilityArc.tsx
 *
 * Renders 14 dots in a semicircle from left to right, filled progressively
 * up to `percentage`. Color of each filled dot interpolates from coral (low)
 * through gold (mid) to green (high), matching the mobile component's palette.
 *
 * Server-component compatible — animation is driven purely by CSS keyframes
 * defined in globals.css (`@keyframes dot-pop-in`, class `.dot-anim`). No
 * client JS required, no Reanimated/Moti dependency.
 *
 * Reduced-motion users still see the final state (opacity is part of the
 * keyframe `to` step, and the prefers-reduced-motion media query in
 * globals.css collapses the animation to ~0ms).
 */

const DOT_COUNT = 14;

function interpolateColor(pct: number): string {
  // 0% coral E85D75 → 50% gold DAB56D → 100% green 59C28B
  if (pct <= 50) {
    const t = pct / 50;
    const r = Math.round(232 + (218 - 232) * t);
    const g = Math.round(93 + (181 - 93) * t);
    const b = Math.round(117 + (109 - 117) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (pct - 50) / 50;
  const r = Math.round(218 + (89 - 218) * t);
  const g = Math.round(181 + (194 - 181) * t);
  const b = Math.round(109 + (139 - 109) * t);
  return `rgb(${r},${g},${b})`;
}

export function CompatibilityDotsArc({
  percentage,
  size = 120,
  showScore = true,
  label,
  className = "",
}: {
  percentage: number;
  size?: number;
  showScore?: boolean;
  label?: string;
  className?: string;
}) {
  const radius = size / 2 - 6;
  const dotSize = Math.max(size / 16, 4);
  const filledCount = Math.round((percentage / 100) * DOT_COUNT);
  const height = size / 2 + dotSize * 2;

  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angleDeg = 180 - (i / (DOT_COUNT - 1)) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = radius * Math.cos(angleRad);
    const y = -radius * Math.sin(angleRad);
    const isFilled = i < filledCount;
    const dotPct = (i / (DOT_COUNT - 1)) * 100;
    return {
      key: i,
      cx: size / 2 + x,
      cy: size / 2 + y,
      isFilled,
      color: isFilled ? interpolateColor(dotPct) : "rgba(255,255,255,0.15)",
      delayMs: i * 60,
      targetOpacity: isFilled ? 1 : 0.25,
    };
  });

  // Find the dominant filled color (last filled dot) for the score number tint
  const scoreColor =
    filledCount > 0
      ? interpolateColor(((filledCount - 1) / (DOT_COUNT - 1)) * 100)
      : "rgba(255,255,255,0.4)";

  return (
    <div
      className={`relative inline-flex flex-col items-center ${className}`}
      role="img"
      aria-label={
        label
          ? `${label}: ${Math.round(percentage)}%`
          : `Compatibility ${Math.round(percentage)}%`
      }
    >
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        {dots.map((d) => (
          <circle
            key={d.key}
            cx={d.cx}
            cy={d.cy}
            r={dotSize / 2}
            fill={d.color}
            className="dot-anim"
            style={
              {
                animationDelay: `${d.delayMs}ms`,
                "--dot-target-opacity": String(d.targetOpacity),
                opacity: d.targetOpacity,
              } as React.CSSProperties
            }
          />
        ))}
        {showScore && (
          <text
            x={size / 2}
            y={size / 2 + 2}
            textAnchor="middle"
            fill={scoreColor}
            fontSize={Math.round(size / 5)}
            fontWeight={700}
            style={{ fontFamily: "inherit" }}
          >
            {Math.round(percentage)}
          </text>
        )}
      </svg>
      {label && (
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-gold-muted">
          {label}
        </p>
      )}
    </div>
  );
}
