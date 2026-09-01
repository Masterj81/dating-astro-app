// Everything a chart wheel needs, and nothing about how to draw it.
//
// WHY THE MATH LIVES HERE
// -----------------------
// Two renderers have to agree: an SVG one on web and a View-based one on
// mobile (`react-native-svg` is not a dependency of this project and adding a
// native module would cost a build). If each computed its own placement, the
// two wheels would drift the way the three natal engines did — and a wheel
// that puts Mars in a different sector on Android than on the web is worse
// than no wheel.
//
// So this module returns coordinates. It performs no drawing, imports no
// renderer, and has no opinion about colour.
//
// WHAT IT REFUSES TO DO
// ---------------------
// It never invents a position. A planet a chart does not carry is absent from
// the output; angles and houses are absent unless the caller passes cusps that
// `resolveHouseCusps` already vouched for. There is no "default ascendant", no
// 0° Aries stand-in for a missing angle, and no placeholder ring.
//
// ORIENTATION
// -----------
// The ascendant sits at the LEFT of the wheel (9 o'clock) and ecliptic
// longitude increases COUNTER-CLOCKWISE, which is how every chart since
// Ptolemy has been drawn. Houses therefore run 1 → 12 counter-clockwise from
// the ascendant, with the first house below it.
//
// Without a trustworthy ascendant the wheel is anchored at 0° Aries instead —
// stated in `anchor` so a renderer can label what it is showing rather than
// implying an ascendant it does not have.

import { detectAspect } from './aspects';
import { ZODIAC_SIGNS } from './chart';
import type { Aspect, AspectKind, NatalChart, PlanetKey, Placement } from './types';

/** Bodies the wheel can plot, in the order they are drawn. */
export const WHEEL_BODIES: readonly PlanetKey[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;

export interface WheelPoint {
  x: number;
  y: number;
}

export interface WheelPlanet {
  key: PlanetKey;
  /** True ecliptic longitude, 0–360. */
  longitude: number;
  sign: string;
  /** Degree within the sign, rounded for display. */
  degree: number;
  /** Screen angle of the TRUE position, degrees, math convention. */
  angle: number;
  /** Where the tick mark touches the ring — always the true position. */
  tickInner: WheelPoint;
  tickOuter: WheelPoint;
  /**
   * Where the glyph is drawn. Equal to the true position unless neighbours
   * were too close to read, in which case it is nudged along the ring and
   * `nudged` is true so a renderer can draw a leader line.
   */
  glyph: WheelPoint;
  nudged: boolean;
}

export interface WheelAngleMark {
  key: 'asc' | 'mc';
  longitude: number;
  sign: string;
  degree: number;
  angle: number;
  inner: WheelPoint;
  outer: WheelPoint;
  /** Where to put the "ASC" / "MC" label, just outside the ring. */
  label: WheelPoint;
}

export interface WheelHouse {
  /** 1–12. */
  number: number;
  cuspLongitude: number;
  angle: number;
  /** The cusp line, from the inner hub to the house ring. */
  inner: WheelPoint;
  outer: WheelPoint;
  /** Centre of the sector, where the house number goes. */
  numberAt: WheelPoint;
}

export interface WheelZodiacSector {
  sign: string;
  /** Index 0–11, Aries first. */
  index: number;
  startAngle: number;
  endAngle: number;
  /** Sector boundary line on the outer ring. */
  divider: { inner: WheelPoint; outer: WheelPoint };
  /** Where the sign glyph or label goes. */
  label: WheelPoint;
}

export interface WheelAspect {
  bodyA: PlanetKey;
  bodyB: PlanetKey;
  name: Aspect['name'];
  kind: AspectKind;
  orb: number;
  from: WheelPoint;
  to: WheelPoint;
}

export interface WheelGeometry {
  size: number;
  center: WheelPoint;
  /** Outer edge of the zodiac band. */
  zodiacOuter: number;
  /** Inner edge of the zodiac band = outer edge of the house ring. */
  zodiacInner: number;
  /** Radius the planet glyphs sit on. */
  planetRadius: number;
  /** Inner hub where the aspect lines live. */
  hubRadius: number;
}

export interface NatalWheelData {
  geometry: WheelGeometry;
  /** What the left-hand point of the wheel represents. */
  anchor: 'ascendant' | 'aries';
  zodiac: WheelZodiacSector[];
  planets: WheelPlanet[];
  /** Empty unless the caller supplied trustworthy angles. */
  angles: WheelAngleMark[];
  /** Empty unless the caller supplied trustworthy cusps. */
  houses: WheelHouse[];
  aspects: WheelAspect[];
}

export interface NatalWheelOptions {
  /** Square viewport edge, in px. */
  size?: number;
  /** Cusps that `resolveHouseCusps` has already vouched for. */
  cusps?: number[] | null;
  /** A midheaven that `resolveTrustedMidheaven` has already vouched for. */
  mc?: Placement | null;
  /** A rising placement whose trust the caller has already established. */
  rising?: Placement | null;
  /** Draw aspect chords. */
  showAspects?: boolean;
  /**
   * How many aspects to keep, tightest orb first.
   *
   * A ten-body chart can carry thirty in-orb aspects; drawing them all turns
   * the hub into a solid disc and says nothing. Eight is enough to read the
   * shape of a chart, and they are the eight that matter most.
   */
  maxAspects?: number;
  /**
   * Minimum arc between two glyphs before they are nudged apart, in degrees.
   * Below about six degrees two glyphs overlap at any sensible wheel size.
   */
  minGlyphSeparation?: number;
}

const DEFAULTS = {
  size: 320,
  showAspects: true,
  maxAspects: 8,
  minGlyphSeparation: 7,
} as const;

function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

/** Signed difference in (-180, 180]. */
function delta180(a: number, b: number): number {
  return ((((a - b) % 360) + 360) % 360 + 180) % 360 - 180;
}

/**
 * Ecliptic longitude → screen angle.
 *
 * `anchorLongitude` is placed at 180° (the left of the wheel) and longitude
 * increases counter-clockwise from there.
 */
function screenAngle(longitude: number, anchorLongitude: number): number {
  return norm360(180 + (longitude - anchorLongitude));
}

/**
 * Screen angle + radius → x/y, with the SVG/RN convention that y grows
 * downward. Rounded to a hundredth of a pixel: renderers do not need more,
 * and exact values keep the two platforms byte-identical in tests.
 */
function polar(center: WheelPoint, radius: number, angleDeg: number): WheelPoint {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round((center.x + radius * Math.cos(rad)) * 100) / 100,
    y: Math.round((center.y - radius * Math.sin(rad)) * 100) / 100,
  };
}

/**
 * Spread glyphs that would overlap, without moving the tick marks.
 *
 * Real chart software does this; skipping it is what makes a stellium look
 * like one smudged symbol. The TRUE longitude is kept for the tick and for
 * every aspect chord — only the glyph moves, and it is flagged so the renderer
 * can draw a short leader line back to the truth.
 */
function spreadGlyphAngles(angles: number[], minSeparation: number): { angle: number; moved: boolean }[] {
  const order = angles
    .map((angle, index) => ({ angle, index }))
    .sort((a, b) => a.angle - b.angle);

  const adjusted = order.map((entry) => ({ ...entry, moved: false }));

  // Two passes around the ring: one forward to push clusters apart, one back
  // to relieve the wrap-around seam a single pass would leave squashed.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < adjusted.length; i++) {
      const gap = adjusted[i].angle - adjusted[i - 1].angle;
      if (gap < minSeparation) {
        adjusted[i].angle = adjusted[i - 1].angle + minSeparation;
        adjusted[i].moved = true;
      }
    }
    // The last and first can still collide across 0/360.
    if (adjusted.length > 1) {
      const wrap = adjusted[0].angle + 360 - adjusted[adjusted.length - 1].angle;
      if (wrap < minSeparation) {
        adjusted[0].angle = adjusted[0].angle + (minSeparation - wrap);
        adjusted[0].moved = true;
      }
    }
  }

  const out: { angle: number; moved: boolean }[] = new Array(angles.length);
  for (const entry of adjusted) {
    out[entry.index] = { angle: norm360(entry.angle), moved: entry.moved };
  }
  return out;
}

/**
 * Turn a chart into drawable coordinates.
 *
 * Every element is optional and absent when its data is: no planet is invented,
 * no angle is assumed, and houses appear only when the caller passes cusps that
 * were already proven trustworthy (`resolveHouseCusps`). Passing raw
 * `chart.houses` is fine — the engine only produces them with a birth time and
 * a birthplace.
 */
export function buildNatalWheelData(
  chart: Pick<NatalChart, PlanetKey> | null,
  options: NatalWheelOptions = {},
): NatalWheelData {
  const size = options.size ?? DEFAULTS.size;
  const showAspects = options.showAspects ?? DEFAULTS.showAspects;
  const maxAspects = options.maxAspects ?? DEFAULTS.maxAspects;
  const minGlyphSeparation = options.minGlyphSeparation ?? DEFAULTS.minGlyphSeparation;

  const center: WheelPoint = { x: size / 2, y: size / 2 };
  const zodiacOuter = size * 0.47;
  const zodiacInner = size * 0.385;
  const planetRadius = size * 0.335;
  const hubRadius = size * 0.245;

  const geometry: WheelGeometry = {
    size,
    center,
    zodiacOuter,
    zodiacInner,
    planetRadius,
    hubRadius,
  };

  const cusps =
    Array.isArray(options.cusps) && options.cusps.length === 12 ? options.cusps : null;
  const rising = options.rising ?? null;

  // The wheel turns on the ascendant when there is one, and says so. Without
  // it, 0° Aries anchors the left — which is a different picture, and the
  // renderer is told which it is drawing.
  const anchorLongitude = rising ? rising.longitude : 0;
  const anchor: NatalWheelData['anchor'] = rising ? 'ascendant' : 'aries';

  // --- zodiac ---------------------------------------------------------------
  const zodiac: WheelZodiacSector[] = ZODIAC_SIGNS.map((sign, index) => {
    const startLongitude = index * 30;
    const startAngle = screenAngle(startLongitude, anchorLongitude);
    const endAngle = screenAngle(startLongitude + 30, anchorLongitude);
    const midAngle = screenAngle(startLongitude + 15, anchorLongitude);
    return {
      sign,
      index,
      startAngle,
      endAngle,
      divider: {
        inner: polar(center, zodiacInner, startAngle),
        outer: polar(center, zodiacOuter, startAngle),
      },
      label: polar(center, (zodiacInner + zodiacOuter) / 2, midAngle),
    };
  });

  // --- planets --------------------------------------------------------------
  const present = chart
    ? WHEEL_BODIES.map((key) => ({ key, placement: chart[key] as Placement | null | undefined }))
        .filter((entry): entry is { key: PlanetKey; placement: Placement } =>
          Boolean(entry.placement) && Number.isFinite(entry.placement?.longitude),
        )
    : [];

  const trueAngles = present.map((entry) => screenAngle(entry.placement.longitude, anchorLongitude));
  const spread = spreadGlyphAngles(trueAngles, minGlyphSeparation);

  const planets: WheelPlanet[] = present.map((entry, index) => {
    const angle = trueAngles[index];
    return {
      key: entry.key,
      longitude: entry.placement.longitude,
      sign: entry.placement.sign,
      degree: Math.round(entry.placement.degree),
      angle,
      tickInner: polar(center, zodiacInner - size * 0.015, angle),
      tickOuter: polar(center, zodiacInner, angle),
      glyph: polar(center, planetRadius, spread[index].angle),
      nudged: spread[index].moved,
    };
  });

  // --- angles ---------------------------------------------------------------
  // Only what the caller proved. `rising` and `mc` come from
  // `resolveTrustedRisingSign` / `resolveTrustedMidheaven`; this module does
  // not re-derive them and cannot manufacture one.
  const angles: WheelAngleMark[] = [];
  const pushAngle = (key: 'asc' | 'mc', placement: Placement | null) => {
    if (!placement || !Number.isFinite(placement.longitude)) return;
    const angle = screenAngle(placement.longitude, anchorLongitude);
    angles.push({
      key,
      longitude: placement.longitude,
      sign: placement.sign,
      degree: Math.round(placement.degree),
      angle,
      inner: polar(center, hubRadius, angle),
      outer: polar(center, zodiacOuter, angle),
      label: polar(center, zodiacOuter + size * 0.035, angle),
    });
  };
  pushAngle('asc', rising);
  pushAngle('mc', options.mc ?? null);

  // --- houses ---------------------------------------------------------------
  const houses: WheelHouse[] = cusps
    ? cusps.map((cuspLongitude, index) => {
        const angle = screenAngle(cuspLongitude, anchorLongitude);
        // The number sits in the middle of its sector. Equal house makes that
        // exactly fifteen degrees past the cusp; deriving it from the NEXT
        // cusp instead keeps this correct if the system ever stops being equal.
        const nextCusp = cusps[(index + 1) % 12];
        const span = norm360(nextCusp - cuspLongitude) || 30;
        const midAngle = screenAngle(cuspLongitude + span / 2, anchorLongitude);
        return {
          number: index + 1,
          cuspLongitude,
          angle,
          inner: polar(center, hubRadius, angle),
          outer: polar(center, zodiacInner, angle),
          numberAt: polar(center, hubRadius + size * 0.035, midAngle),
        };
      })
    : [];

  // --- aspects --------------------------------------------------------------
  const aspects: WheelAspect[] = [];
  if (showAspects) {
    const found: (WheelAspect & { orbValue: number })[] = [];
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        const aspect = detectAspect(
          a.placement.longitude,
          b.placement.longitude,
          a.key,
          b.key,
        );
        if (!aspect) continue;
        found.push({
          bodyA: a.key,
          bodyB: b.key,
          name: aspect.name,
          kind: aspect.kind,
          orb: aspect.orb,
          orbValue: aspect.orb,
          // Chords are drawn between the TRUE positions, never the nudged
          // glyphs — an aspect line that pointed at a moved symbol would be
          // drawing a relationship that does not exist.
          from: polar(center, hubRadius, trueAngles[i]),
          to: polar(center, hubRadius, trueAngles[j]),
        });
      }
    }
    found.sort((x, y) => x.orbValue - y.orbValue);
    for (const entry of found.slice(0, maxAspects)) {
      const { orbValue: _orbValue, ...rest } = entry;
      aspects.push(rest);
    }
  }

  return { geometry, anchor, zodiac, planets, angles, houses, aspects };
}

/**
 * How far a nudged glyph sits from its true position, in degrees.
 * Renderers use it to decide whether a leader line is worth drawing.
 */
export function glyphOffsetDegrees(planet: WheelPlanet, geometry: WheelGeometry): number {
  const trueAt = polar(geometry.center, geometry.planetRadius, planet.angle);
  const dx = planet.glyph.x - trueAt.x;
  const dy = planet.glyph.y - trueAt.y;
  const chord = Math.sqrt(dx * dx + dy * dy);
  // Chord → central angle, for a circle of radius planetRadius.
  return (2 * Math.asin(Math.min(1, chord / (2 * geometry.planetRadius))) * 180) / Math.PI;
}

/** Re-exported so a renderer never has to know the delta helper exists. */
export const wheelInternals = { norm360, delta180, screenAngle, polar };
