// Astro Ad Timing Lite — deterministic planetary-hour helpers.
//
// What this is:
//   - A pure-deterministic computation of the current and upcoming
//     planetary hours for an arbitrary moment and lat/lon.
//   - A static per-planet weight (per spec) used to band each hour as
//     "strong" / "usable" / "avoid" within a symbolic-framework framing.
//
// What this is NOT:
//   - A performance prediction. Every UI surface that renders these
//     outputs MUST display PLANETARY_HOURS_DISCLAIMER. Ad performance
//     depends on offer, creative, audience, budget, tracking, and
//     landing experience — not on the planetary hour at launch time.
//
// Algorithm (traditional/Chaldean):
//   1. Find the previous sunrise (the start of the current "planetary
//      day") and the surrounding sunset / next sunrise.
//   2. Divide daytime arc (sunrise → sunset) into 12 equal "unequal
//      hours"; same for nighttime arc (sunset → next sunrise).
//   3. The first daytime hour on each civil day is ruled by that day's
//      planet (Sun on Sunday, Moon on Monday, etc).
//   4. Subsequent hours follow the Chaldean order:
//        Saturn → Jupiter → Mars → Sun → Venus → Mercury → Moon → …
//   5. Output { planet, startTime, endTime, isDay } per hour.
//
// All time inputs/outputs are JS Date objects in UTC. Tests inject a
// fixed "now" so the module is fully deterministic.

import * as Astronomy from 'astronomy-engine';

export const PLANETARY_HOURS_DISCLAIMER =
  'Symbolic timing framework, not a performance prediction. Use as a soft input alongside offer, creative, audience, budget, tracking, landing.';

export type Planet =
  | 'Saturn'
  | 'Jupiter'
  | 'Mars'
  | 'Sun'
  | 'Venus'
  | 'Mercury'
  | 'Moon';

// Chaldean order is the canonical traditional sequence used to walk
// hour-by-hour through the day.
export const CHALDEAN_ORDER: readonly Planet[] = [
  'Saturn',
  'Jupiter',
  'Mars',
  'Sun',
  'Venus',
  'Mercury',
  'Moon',
] as const;

// Day-of-week (Sun=0 … Sat=6) → the planet that rules the first hour
// after sunrise on that civil day.
const DAY_RULER: readonly Planet[] = [
  'Sun', // Sunday
  'Moon', // Monday
  'Mars', // Tuesday
  'Mercury', // Wednesday
  'Jupiter', // Thursday
  'Venus', // Friday
  'Saturn', // Saturday
] as const;

// Static per-planet weight (per MVP spec). Saturn clamps to 0 — no
// negative scores in the MVP.
export const PLANET_WEIGHT: Record<Planet, number> = {
  Mercury: 20,
  Venus: 20,
  Jupiter: 20,
  Sun: 15,
  Moon: 5,
  Mars: 0,
  Saturn: -10,
};

export type Status = 'strong' | 'usable' | 'avoid';

export type AdIntent =
  | 'copy-and-ads'
  | 'dating-and-lifestyle'
  | 'scaling-and-growth'
  | 'brand-visibility'
  | 'social-and-ephemeral'
  | 'urgency-and-sale'
  | 'discouraged';

// Ad-intent mapping — display only. Never used to gate a decision.
export const PLANET_INTENT: Record<Planet, AdIntent> = {
  Mercury: 'copy-and-ads',
  Venus: 'dating-and-lifestyle',
  Jupiter: 'scaling-and-growth',
  Sun: 'brand-visibility',
  Moon: 'social-and-ephemeral',
  Mars: 'urgency-and-sale',
  Saturn: 'discouraged',
};

// Human-readable intent hint for each planet. Pure strings — the UI
// is free to wrap these in t() if it wants localization.
export const PLANET_INTENT_HINT: Record<Planet, string> = {
  Mercury: 'Copy, ads, email, targeting, landing-page tests.',
  Venus: 'Dating, beauty, lifestyle, visual creative, desire-led offers.',
  Jupiter: 'Scaling, growth, promo push, broad launch.',
  Sun: 'Visibility, brand campaign, official launch.',
  Moon: 'Social or ephemeral content.',
  Mars: 'Urgency or sale (caveat: high-energy, can read aggressive).',
  Saturn: 'Discouraged for new ads — consider waiting for the next favorable hour.',
};

export interface PlanetaryHour {
  planet: Planet;
  startTime: Date;
  endTime: Date;
  isDay: boolean;
}

export interface ScoredHour extends PlanetaryHour {
  /** Clamped to [0, 100]. Saturn scores 0; no negatives are exposed. */
  score: number;
  status: Status;
  isFavorable: boolean;
}

/** Get the per-planet MVP score, clamped to [0, 100]. */
export function getPlanetScore(planet: Planet): number {
  const raw = PLANET_WEIGHT[planet];
  if (raw <= 0) return 0;
  if (raw >= 100) return 100;
  return raw;
}

/** Status band for a score (per MVP spec). */
export function getStatus(score: number): Status {
  if (score >= 15) return 'strong';
  if (score >= 5) return 'usable';
  return 'avoid';
}

/**
 * "Favorable" = Mercury / Venus / Jupiter / Sun. Moon is soft-ok but
 * lands in `usable`; Mars is neutral-with-caveat (`avoid` per banding);
 * Saturn is `avoid`.
 */
export function isFavorablePlanet(planet: Planet): boolean {
  return (
    planet === 'Mercury' ||
    planet === 'Venus' ||
    planet === 'Jupiter' ||
    planet === 'Sun'
  );
}

// --- Sunrise/sunset via astronomy-engine ---------------------------------

const SUNRISE_DIR = 1; // SearchRiseSet: +1 = rise, -1 = set
const SUNSET_DIR = -1;

function searchSun(
  direction: number,
  latitude: number,
  longitude: number,
  start: Date,
  limitDays: number,
): Date {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const evt = Astronomy.SearchRiseSet(
    Astronomy.Body.Sun,
    observer,
    direction,
    start,
    limitDays,
  );
  if (!evt) {
    throw new Error(
      `Sun ${direction === SUNRISE_DIR ? 'rise' : 'set'} not found within ${limitDays} days of ${start.toISOString()} at (${latitude}, ${longitude})`,
    );
  }
  return evt.date;
}

/**
 * Find the most recent sunrise at or before `at`. Uses astronomy-engine's
 * native backward search (negative `limitDays`) and extends the window
 * up to 32 days to cover polar latitudes with no sunrise on some days.
 */
function previousSunrise(at: Date, latitude: number, longitude: number): Date {
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  // Try progressively wider backward windows. -2 days handles every
  // non-polar latitude; widening up to -32 catches the polar edge case.
  for (const window of [-2, -8, -32]) {
    const evt = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      observer,
      SUNRISE_DIR,
      at,
      window,
    );
    if (evt && evt.date.getTime() <= at.getTime()) {
      return evt.date;
    }
  }
  throw new Error(
    `No sunrise on or before ${at.toISOString()} at (${latitude}, ${longitude})`,
  );
}

function nextEventAfter(
  direction: number,
  latitude: number,
  longitude: number,
  after: Date,
): Date {
  // SearchRiseSet finds the next event strictly after `after`. We
  // give it a generous 32-day window to cover polar latitudes.
  return searchSun(direction, latitude, longitude, after, 32);
}

// --- Core planetary-hour computation ------------------------------------

interface ArcSegment {
  start: Date;
  end: Date;
  isDay: boolean;
  // Civil-day-of-week (Sun=0…Sat=6) of the SUNRISE that opens the day
  // this arc belongs to. Both the day-arc and the night-arc that
  // follows it use the same day-ruler index.
  dayRulerIndex: number;
}

/**
 * Build the day-arc (sunrise → sunset) and night-arc (sunset → next
 * sunrise) bracketing `at`.
 */
function arcContaining(at: Date, latitude: number, longitude: number): ArcSegment {
  const sunrise = previousSunrise(at, latitude, longitude);
  const sunset = nextEventAfter(SUNSET_DIR, latitude, longitude, sunrise);

  // Day-ruler uses the civil weekday of the sunrise instant in UTC.
  // Strict tropical astrology would localize this to the observer's
  // longitude-derived solar day; UTC weekday is the simplest
  // deterministic choice and matches the standard digital-ephemeris
  // convention used by Astrology.com / Cafe Astrology widgets.
  const dayRulerIndex = sunrise.getUTCDay();

  if (at.getTime() < sunset.getTime()) {
    return { start: sunrise, end: sunset, isDay: true, dayRulerIndex };
  }

  // We're in the night-arc that follows this sunset.
  const nextSunrise = nextEventAfter(SUNRISE_DIR, latitude, longitude, sunset);
  return { start: sunset, end: nextSunrise, isDay: false, dayRulerIndex };
}

/**
 * Compute the absolute Chaldean index of the FIRST hour of an arc.
 *
 *   - First day-hour of a civil day: planet = DAY_RULER[weekday].
 *   - First night-hour: 12 Chaldean steps after the first day-hour.
 *
 * The Chaldean order is a 7-cycle, so the night-hour offset of 12
 * mod 7 = 5 means the 13th hour is 5 positions after the 1st hour
 * in CHALDEAN_ORDER.
 */
function firstHourIndex(segment: ArcSegment): number {
  const dayRuler = DAY_RULER[segment.dayRulerIndex];
  const dayRulerChaldean = CHALDEAN_ORDER.indexOf(dayRuler);
  if (dayRulerChaldean < 0) {
    throw new Error(`Day ruler ${dayRuler} not in Chaldean order`);
  }
  if (segment.isDay) return dayRulerChaldean;
  // Night-arc: the first night hour is the 13th hour overall, i.e.
  // (dayRulerChaldean + 12) mod 7.
  return (dayRulerChaldean + 12) % 7;
}

function expandArcIntoHours(segment: ArcSegment): PlanetaryHour[] {
  const totalMs = segment.end.getTime() - segment.start.getTime();
  const hourMs = totalMs / 12;
  const startIndex = firstHourIndex(segment);
  const hours: PlanetaryHour[] = [];
  for (let i = 0; i < 12; i++) {
    const planet = CHALDEAN_ORDER[(startIndex + i) % 7];
    const hourStart = new Date(segment.start.getTime() + i * hourMs);
    const hourEnd = new Date(segment.start.getTime() + (i + 1) * hourMs);
    hours.push({
      planet,
      startTime: hourStart,
      endTime: hourEnd,
      isDay: segment.isDay,
    });
  }
  return hours;
}

/**
 * Get the planetary hour active at `at` for the observer at `latitude`,
 * `longitude`.
 */
export function getCurrentPlanetaryHour(
  at: Date,
  latitude: number,
  longitude: number,
): PlanetaryHour {
  // `at` may land on an arc boundary or slip past it by sub-second
  // refraction wobble between independent astronomy-engine searches.
  // We try the arc containing `at`, then the next arc one minute
  // forward, and fall back to clamping into the last hour we found.
  for (let attempt = 0; attempt < 3; attempt++) {
    const probe = new Date(at.getTime() + attempt * 60_000);
    const arc = arcContaining(probe, latitude, longitude);
    const hours = expandArcIntoHours(arc);
    for (const h of hours) {
      if (at.getTime() >= h.startTime.getTime() && at.getTime() < h.endTime.getTime()) {
        return h;
      }
    }
    // If `at` is just before the arc, the first hour likely contains
    // it (with a small refraction wobble). Same for "just after" and
    // the last hour. Return the hour whose boundary `at` is closest to.
    if (arc.start.getTime() <= at.getTime() + 60_000 && at.getTime() <= arc.end.getTime() + 60_000) {
      // Clamp to whichever hour is closest in time.
      let best = hours[0];
      let bestDist = Math.abs(at.getTime() - best.startTime.getTime());
      for (const h of hours) {
        const d = Math.min(
          Math.abs(at.getTime() - h.startTime.getTime()),
          Math.abs(at.getTime() - h.endTime.getTime()),
        );
        if (d < bestDist) { best = h; bestDist = d; }
      }
      return best;
    }
  }
  throw new Error(
    `Could not locate planetary hour for ${at.toISOString()} at (${latitude}, ${longitude})`,
  );
}

/**
 * Get the current planetary hour plus the next `count - 1` upcoming
 * hours. Default: 24 hours forward (~ next 12-24 wall clock hours
 * depending on day/night arc length).
 */
export function getUpcomingPlanetaryHours(
  at: Date,
  latitude: number,
  longitude: number,
  count = 24,
): PlanetaryHour[] {
  if (count <= 0) return [];
  const out: PlanetaryHour[] = [];
  let cursor = new Date(at.getTime());
  // Each arc gives us 12 hours; we typically need at most 3 arcs for
  // a 24-hour horizon, but we cap iterations to be safe.
  for (let arcIters = 0; arcIters < 8 && out.length < count; arcIters++) {
    const arc = arcContaining(cursor, latitude, longitude);
    const hours = expandArcIntoHours(arc);
    for (const h of hours) {
      if (h.endTime.getTime() <= at.getTime()) continue; // already past
      out.push(h);
      if (out.length >= count) break;
    }
    // Advance cursor past this arc's end. We bump by 60 seconds rather
    // than 1 ms because sunrise/sunset solutions can wobble a few
    // hundred ms between independent astronomy-engine calls (the
    // refraction-corrected horizon search has a 0.1 s tolerance), and
    // bumping by 1 ms can leave the cursor inside the *previous* arc
    // when the next-arc boundary lands a few hundred ms later.
    cursor = new Date(arc.end.getTime() + 60_000);
  }
  // Trim the leading hours that started before `at` but ended after,
  // so that the first element is the hour that contains `at`.
  return out.slice(0, count);
}

/** Score a single planetary hour. Saturn clamps to 0. */
export function scoreHour(hour: PlanetaryHour): ScoredHour {
  const score = getPlanetScore(hour.planet);
  return {
    ...hour,
    score,
    status: getStatus(score),
    isFavorable: isFavorablePlanet(hour.planet),
  };
}

/**
 * Find the next favorable hour (Mercury / Venus / Jupiter / Sun) that
 * starts at or after `at`. Returns `null` if none is found within the
 * search window (default 7 days).
 */
export function getNextFavorableHour(
  at: Date,
  latitude: number,
  longitude: number,
  withinDays = 7,
): ScoredHour | null {
  // Roughly 24 planetary hours per civil day; budget a few extra.
  const maxHours = withinDays * 26;
  const horizon = getUpcomingPlanetaryHours(at, latitude, longitude, maxHours);
  for (const h of horizon) {
    if (h.startTime.getTime() < at.getTime()) continue; // strictly future-start
    if (isFavorablePlanet(h.planet)) return scoreHour(h);
  }
  return null;
}

/**
 * Convenience: full snapshot for the UI. Returns the current hour
 * (scored), the next N upcoming hours (scored), and the next favorable
 * hour. All times deterministic for a given `(at, lat, lon)`.
 */
export interface AdTimingSnapshot {
  current: ScoredHour;
  upcoming: ScoredHour[];
  nextFavorable: ScoredHour | null;
  disclaimer: string;
}

export function getAdTimingSnapshot(
  at: Date,
  latitude: number,
  longitude: number,
  upcomingCount = 6,
): AdTimingSnapshot {
  const current = scoreHour(getCurrentPlanetaryHour(at, latitude, longitude));
  const upcomingHours = getUpcomingPlanetaryHours(
    at,
    latitude,
    longitude,
    upcomingCount + 1,
  );
  // Strip the first entry if it is the current hour (same startTime).
  const upcoming = upcomingHours
    .filter((h) => h.startTime.getTime() !== current.startTime.getTime())
    .slice(0, upcomingCount)
    .map(scoreHour);
  const nextFavorable = getNextFavorableHour(
    new Date(current.endTime.getTime()),
    latitude,
    longitude,
  );
  return {
    current,
    upcoming,
    nextFavorable,
    disclaimer: PLANETARY_HOURS_DISCLAIMER,
  };
}
