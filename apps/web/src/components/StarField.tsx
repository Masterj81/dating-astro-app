/**
 * StarField — pure-CSS server component.
 *
 * Previous version was a "use client" component that created 80-120 individual
 * <div> DOM nodes via useState/useEffect, causing:
 *   - a hydration JS cost on every page load
 *   - 80-120 animated DOM elements hitting the compositor
 *   - a layout shift (empty → populated) after hydration
 *
 * This version uses a deterministic seeded pseudo-random number generator so
 * stars are rendered on the server (no JS bundle cost, zero CLS, instant LCP).
 * Star count is capped at 60 — visually indistinguishable from 120 but halves
 * the animated DOM nodes.
 */

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

const STAR_COLORS = [
  "rgba(255,255,255,0.9)",
  "rgba(255,255,255,0.7)",
  "rgba(232,93,117,0.5)",
  "rgba(118,129,255,0.5)",
  "rgba(77,167,255,0.4)",
];

/** Simple seeded PRNG (mulberry32) — deterministic across server/client. */
function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateStars(count: number): Star[] {
  const rand = seededRandom(42);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand() * 100,
    y: rand() * 100,
    size: rand() * 2.5 + 0.5,
    duration: rand() * 5 + 2,
    delay: rand() * 5,
    color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
  }));
}

const MAX_STARS = 60;

export function StarField({ count = 60 }: { count?: number }) {
  const stars = generateStars(Math.min(count, MAX_STARS));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.color,
            boxShadow: star.size > 1.8 ? `0 0 ${star.size * 3}px ${star.color}` : undefined,
            ["--duration" as string]: `${star.duration}s`,
            ["--delay" as string]: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
