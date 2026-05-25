// Shared astrology types. Single source of truth for charts, synastry,
// confidence flags, and warnings used by mobile, web, and edge.

export type ZodiacSign =
  | 'Aries'
  | 'Taurus'
  | 'Gemini'
  | 'Cancer'
  | 'Leo'
  | 'Virgo'
  | 'Libra'
  | 'Scorpio'
  | 'Sagittarius'
  | 'Capricorn'
  | 'Aquarius'
  | 'Pisces';

export type PlanetKey =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn';

export type AngleKey = 'rising' | 'mc';

export type PlacementKey = PlanetKey | AngleKey;

export interface Placement {
  sign: ZodiacSign;
  /** Degree in sign, 0–30. */
  degree: number;
  /** Ecliptic longitude, 0–360. */
  longitude: number;
}

/**
 * Confidence level for the resulting chart and any score derived from it.
 *   - high: full birth data (date + time + IANA timezone resolved).
 *   - medium: birth date + a coarse local time but no IANA tz (fallback used).
 *   - low: birth time missing or "unknown"; chart computed at solar noon.
 */
export type Confidence = 'high' | 'medium' | 'low';

export type ChartWarning =
  | 'missing_birth_time'
  | 'missing_birth_timezone'
  | 'timezone_fallback_used'
  | 'houses_unavailable_without_birth_time';

export interface BirthInput {
  /** Local civil date, YYYY-MM-DD. */
  date: string;
  /**
   * Local civil time, HH:MM (24h). Optional — null/undefined means birth time
   * unknown; chart is computed at local noon and confidence drops to 'low'.
   */
  time?: string | null;
  /** IANA timezone identifier (e.g. "America/New_York"). Optional. */
  timezone?: string | null;
  /** Latitude in degrees, -90..90. */
  latitude: number;
  /** Longitude in degrees, -180..180. */
  longitude: number;
}

export interface NatalChart {
  sun: Placement;
  moon: Placement;
  mercury: Placement;
  venus: Placement;
  mars: Placement;
  jupiter: Placement;
  saturn: Placement;
  /** Ascendant. Only meaningful when birth time is known. */
  rising: Placement | null;
  /** Midheaven. Only meaningful when birth time is known. */
  mc: Placement | null;
  /** Equal-house cusps, 12 longitudes. Null when birth time is unknown. */
  houses: number[] | null;
  /** The UTC instant the chart was computed at. */
  utcInstant: string;
  /** IANA timezone actually used (resolved or fallback). */
  timezone: string;
  confidence: Confidence;
  warnings: ChartWarning[];
  /** Echo of the inputs used. */
  input: BirthInput;
}

export type AspectName =
  | 'conjunction'
  | 'sextile'
  | 'square'
  | 'trine'
  | 'opposition';

export type AspectKind = 'harmonious' | 'challenging' | 'intense';

export interface Aspect {
  name: AspectName;
  /** Canonical aspect angle (0, 60, 90, 120, 180). */
  angle: number;
  /** Absolute orb, in degrees. */
  orb: number;
  kind: AspectKind;
}

export interface SynastryAspect extends Aspect {
  bodyA: PlacementKey;
  bodyB: PlacementKey;
  /** Weighted contribution to the framed score (-1..+1). */
  contribution: number;
}

export type FrameKey = 'love' | 'friendship' | 'business';

export type SynastryBand =
  | 'resonant'
  | 'strong-themes'
  | 'promising-mix'
  | 'mixed'
  | 'different-rhythms'
  | 'likely-friction';

export interface FrameScore {
  frame: FrameKey;
  /** Integer 0..100. Confidence-capped (low → max 80). */
  score: number;
  band: SynastryBand;
  /** Aspects that contributed, sorted strongest first. */
  topAspects: SynastryAspect[];
}

export interface SynastryResult {
  /** Confidence of the weakest of the two natal charts. */
  confidence: Confidence;
  warnings: ChartWarning[];
  frames: Record<FrameKey, FrameScore>;
  /** Scoring model version used (see ./version.ts). */
  modelVersion: number;
}

export interface ResolvedTimezone {
  /** IANA identifier we ended up using. */
  iana: string;
  /** UTC offset in minutes at the resolved instant. */
  offsetMinutes: number;
  /**
   * Where the value came from:
   *   - 'input': caller supplied a valid IANA string.
   *   - 'lookup': resolved from lat/lng via tz-lookup.
   *   - 'fallback': lat/lng lookup failed AND no input supplied.
   *     Use this sparingly; confidence is reduced when this happens.
   */
  source: 'input' | 'lookup' | 'fallback';
}
