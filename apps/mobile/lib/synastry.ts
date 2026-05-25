// Sign-element synastry helpers for the mobile Synastry V2 screen.
//
// Mirrors apps/web/src/lib/synastry.ts; cross-app imports aren't supported
// by the mobile bundler so the element-matrix math is duplicated here.
// Any tweak to the element matrix, score bands, or zone formulas must
// happen on both sides to keep web + mobile in sync.
//
// The canonical full chart + synastry engine (timezone-correct, with
// confidence and the three intentions: love / friendship / business)
// lives in `@astro/shared/astrology` and is delegated to from
// `apps/mobile/services/astrology.ts`. Use that for anything that needs
// UTC instants, DST handling, or aspect-level analysis. This file stays
// focused on the lightweight sign-only "first pass" view.

export type SynastrySign = string | null | undefined;

export type SynastryElement = 'fire' | 'earth' | 'air' | 'water';

export type SynastryScoreBand =
  | 'exceptional'
  | 'strong'
  | 'promising'
  | 'mixed'
  | 'growth'
  | 'different';

export type SynastryPlacements = {
  sun_sign: SynastrySign;
  moon_sign: SynastrySign;
  rising_sign: SynastrySign;
  mercury_sign?: SynastrySign;
  venus_sign?: SynastrySign;
  mars_sign?: SynastrySign;
  saturn_sign?: SynastrySign;
};

export type ZoneKey = 'emotional' | 'communication' | 'attraction' | 'stability';

export type ZoneScore = {
  key: ZoneKey;
  score: number;
  band: SynastryScoreBand;
  source: 'real' | 'sun-fallback';
};

export type WhyFactor = {
  key: 'elementRhythm' | 'emotionalPace' | 'risingRhythm';
  selfSign: string | null;
  targetSign: string | null;
  selfElement: SynastryElement | null;
  targetElement: SynastryElement | null;
  score: number | null;
  band: SynastryScoreBand | null;
};

const ELEMENTS: Record<string, SynastryElement> = {
  Aries: 'fire',
  Leo: 'fire',
  Sagittarius: 'fire',
  Taurus: 'earth',
  Virgo: 'earth',
  Capricorn: 'earth',
  Gemini: 'air',
  Libra: 'air',
  Aquarius: 'air',
  Cancer: 'water',
  Scorpio: 'water',
  Pisces: 'water',
};

const COMPATIBILITY_MATRIX: Record<SynastryElement, Record<SynastryElement, number>> = {
  fire: { fire: 86, earth: 58, air: 92, water: 49 },
  earth: { fire: 58, earth: 88, air: 56, water: 90 },
  air: { fire: 92, earth: 56, air: 84, water: 64 },
  water: { fire: 49, earth: 90, air: 64, water: 87 },
};

const NEUTRAL_FALLBACK = 76;

export function normalizeSign(sign: SynastrySign): string | null {
  if (!sign) return null;
  const trimmed = sign.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function getElement(sign: SynastrySign): SynastryElement | null {
  const normalized = normalizeSign(sign);
  if (!normalized) return null;
  return ELEMENTS[normalized] ?? null;
}

export function getElementCompatibilityScore(
  a: SynastryElement | null,
  b: SynastryElement | null,
): number | null {
  if (!a || !b) return null;
  return COMPATIBILITY_MATRIX[a]?.[b] ?? null;
}

export function getScoreBand(score: number): SynastryScoreBand {
  if (score >= 90) return 'exceptional';
  if (score >= 80) return 'strong';
  if (score >= 70) return 'promising';
  if (score >= 60) return 'mixed';
  if (score >= 50) return 'growth';
  return 'different';
}

export function calculateSunCompatibility(
  selfSun: SynastrySign,
  targetSun: SynastrySign,
): number {
  const a = getElement(selfSun);
  const b = getElement(targetSun);
  const matrix = getElementCompatibilityScore(a, b);
  return matrix ?? NEUTRAL_FALLBACK;
}

function pairScore(a: SynastrySign, b: SynastrySign): number | null {
  const ea = getElement(a);
  const eb = getElement(b);
  return getElementCompatibilityScore(ea, eb);
}

function sunFallbackScore(self: SynastryPlacements, target: SynastryPlacements): number {
  const direct = pairScore(self.sun_sign, target.sun_sign);
  return direct ?? NEUTRAL_FALLBACK;
}

function buildZone(
  key: ZoneKey,
  primary: number | null,
  fallback: number,
): ZoneScore {
  const score = primary ?? fallback;
  return {
    key,
    score,
    band: getScoreBand(score),
    source: primary != null ? 'real' : 'sun-fallback',
  };
}

export function calculateZoneScores(
  self: SynastryPlacements,
  target: SynastryPlacements,
): ZoneScore[] {
  const sunFallback = sunFallbackScore(self, target);

  // Emotional: Moon x Moon.
  const emotionalPrimary = pairScore(self.moon_sign, target.moon_sign);

  // Communication: Mercury x Mercury.
  const communicationPrimary = pairScore(self.mercury_sign, target.mercury_sign);

  // Attraction: average of self.Venus x target.Mars and target.Venus x self.Mars.
  // Requires all four placements to count as "real".
  let attractionPrimary: number | null = null;
  if (
    self.venus_sign &&
    self.mars_sign &&
    target.venus_sign &&
    target.mars_sign
  ) {
    const cross1 = pairScore(self.venus_sign, target.mars_sign);
    const cross2 = pairScore(target.venus_sign, self.mars_sign);
    if (cross1 != null && cross2 != null) {
      attractionPrimary = Math.round((cross1 + cross2) / 2);
    }
  }

  // Stability: Saturn x Saturn.
  const stabilityPrimary = pairScore(self.saturn_sign, target.saturn_sign);

  return [
    buildZone('emotional', emotionalPrimary, sunFallback),
    buildZone('communication', communicationPrimary, sunFallback),
    buildZone('attraction', attractionPrimary, sunFallback),
    buildZone('stability', stabilityPrimary, sunFallback),
  ];
}

function buildFactor(
  key: WhyFactor['key'],
  selfSign: SynastrySign,
  targetSign: SynastrySign,
): WhyFactor {
  const selfNormalized = normalizeSign(selfSign);
  const targetNormalized = normalizeSign(targetSign);
  const selfElement = getElement(selfSign);
  const targetElement = getElement(targetSign);
  const score = getElementCompatibilityScore(selfElement, targetElement);
  return {
    key,
    selfSign: selfNormalized,
    targetSign: targetNormalized,
    selfElement,
    targetElement,
    score,
    band: score != null ? getScoreBand(score) : null,
  };
}

export function getWhyFactors(
  self: SynastryPlacements,
  target: SynastryPlacements,
): WhyFactor[] {
  return [
    buildFactor('elementRhythm', self.sun_sign, target.sun_sign),
    buildFactor('emotionalPace', self.moon_sign, target.moon_sign),
    buildFactor('risingRhythm', self.rising_sign, target.rising_sign),
  ];
}

export function shouldShowWatchFor(band: SynastryScoreBand): boolean {
  return band === 'mixed' || band === 'growth' || band === 'different';
}

// Defensively pull a planet sign out of the birth_chart JSONB returned by
// get_my_full_profile. Same shape-tolerant logic as web — supports either
//   birth_chart.planets.{planet}.sign
//   birth_chart.{planet}.sign
// Returns null for any missing / non-string sign so the dimension card
// falls back to Sun x Sun.
export function pickPlanetSign(
  birthChart: unknown,
  planet: 'mercury' | 'venus' | 'mars' | 'saturn',
): string | null {
  if (!birthChart || typeof birthChart !== 'object') return null;
  const root = birthChart as Record<string, unknown>;
  const nestedPlanets =
    root.planets && typeof root.planets === 'object'
      ? (root.planets as Record<string, unknown>)
      : null;
  const candidate = nestedPlanets?.[planet] ?? root[planet];
  if (!candidate || typeof candidate !== 'object') return null;
  const sign = (candidate as { sign?: unknown }).sign;
  return typeof sign === 'string' && sign.trim() ? sign : null;
}

// Influence buckets for the "Why this score" chip — color cue only,
// no user-visible copy keys off this.
export type FactorInfluence = 'harmonious' | 'neutral' | 'challenging';

export function factorInfluence(score: number): FactorInfluence {
  if (score >= 80) return 'harmonious';
  if (score >= 65) return 'neutral';
  return 'challenging';
}
