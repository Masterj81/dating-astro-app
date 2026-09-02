import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  buildNatalWheelData,
  glyphOffsetDegrees,
  type NatalChart,
  type NatalWheelData,
  type Placement,
  type WheelAspect,
  type WheelPoint,
} from '@astro/shared/astrology';
import { AppTheme } from '../constants/theme';

// The chart wheel, drawn with plain React Native primitives.
//
// WHY NOT react-native-svg
// ------------------------
// It is not a dependency of this app and not in the lockfile — the two
// existing glyph components say so in their own headers ("Pure View borders —
// no react-native-svg required"). Adding a native module means a new native
// build and a new thing to keep working across Expo upgrades, for a drawing
// made of circles, straight lines and text.
//
// All four primitives this wheel needs exist already:
//   * rings      → View with borderRadius + borderWidth
//   * radial and chord lines → a 1px-tall View, positioned at the segment's
//     MIDPOINT and rotated to its bearing. React Native has no transform-origin,
//     so rotating about the centre of the element is the reliable construction.
//   * glyphs and numbers → absolutely positioned Text
//
// WHERE THE GEOMETRY COMES FROM
// -----------------------------
// `buildNatalWheelData` in the shared package — the same function the web SVG
// renderer calls. Neither renderer computes a position of its own, so the two
// wheels cannot disagree about where Mars is. This file decides colour and
// type, and nothing else.

type NatalChartWheelProps = {
  chart:
    | Pick<
        NatalChart,
        'sun' | 'moon' | 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'
      >
    | null;
  rising: Placement | null;
  mc: Placement | null;
  cusps: number[] | null;
  size: number;
  /** Shown under the wheel when angles and houses are unavailable. */
  unavailableNote?: string | null;
  labels: {
    title: string;
    body: string;
    asc: string;
    mc: string;
    hideAspects: string;
    showAspects: string;
    noChart: string;
  };
};

const GLYPHS: Record<string, string> = {
  sun: '☉', moon: '☽', mercury: '☿', venus: '♀', mars: '♂',
  jupiter: '♃', saturn: '♄', uranus: '♅', neptune: '♆', pluto: '♇',
};

const SIGN_GLYPHS: Record<string, string> = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋', Leo: '♌', Virgo: '♍',
  Libra: '♎', Scorpio: '♏', Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
};

const ASPECT_COLOR: Record<WheelAspect['kind'], string> = {
  harmonious: 'rgba(139, 176, 255, 0.55)',
  challenging: 'rgba(201, 134, 146, 0.50)',
  intense: 'rgba(240, 214, 160, 0.55)',
};

/**
 * One straight line between two points, as a rotated View.
 *
 * The element is placed so its CENTRE lands on the segment's midpoint and then
 * rotated — React Native offers no transform-origin, so rotating about the
 * element's own centre is the only construction that lands predictably.
 */
function Segment({
  from,
  to,
  color,
  width = 1,
  dashed = false,
}: {
  from: WheelPoint;
  to: WheelPoint;
  color: string;
  width?: number;
  dashed?: boolean;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.5) return null;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: from.x + dx / 2 - length / 2,
        top: from.y + dy / 2 - width / 2,
        width: length,
        height: width,
        backgroundColor: dashed ? 'transparent' : color,
        borderTopWidth: dashed ? width : 0,
        borderTopColor: color,
        borderStyle: dashed ? 'dashed' : 'solid',
        transform: [{ rotate: `${angleDeg}deg` }],
      }}
    />
  );
}

/** Absolutely positioned text, centred on a point. */
function Mark({
  at,
  children,
  color,
  fontSize,
  weight = '400',
}: {
  at: WheelPoint;
  children: string;
  color: string;
  fontSize: number;
  weight?: '400' | '600';
}) {
  const box = fontSize * 2.2;
  return (
    <Text
      style={{
        position: 'absolute',
        left: at.x - box / 2,
        top: at.y - fontSize * 0.72,
        width: box,
        textAlign: 'center',
        color,
        fontSize,
        fontWeight: weight,
      }}
    >
      {children}
    </Text>
  );
}

export default function NatalChartWheel({
  chart,
  rising,
  mc,
  cusps,
  size,
  unavailableNote = null,
  labels,
}: NatalChartWheelProps) {
  const [showAspects, setShowAspects] = useState(true);

  const wheel: NatalWheelData = useMemo(
    () => buildNatalWheelData(chart, { size, rising, mc, cusps, showAspects }),
    [chart, size, rising, mc, cusps, showAspects],
  );

  const { geometry } = wheel;
  const { center } = geometry;
  const ring = (radius: number, borderColor: string, background?: string) => ({
    position: 'absolute' as const,
    left: center.x - radius,
    top: center.y - radius,
    width: radius * 2,
    height: radius * 2,
    borderRadius: radius,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor,
    backgroundColor: background ?? 'transparent',
  });

  const hasAngles = wheel.angles.length > 0;
  const hasHouses = wheel.houses.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{labels.title}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: showAspects }}
          onPress={() => setShowAspects((current) => !current)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>
            {showAspects ? labels.hideAspects : labels.showAspects}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.body}>{labels.body}</Text>

      <View style={{ width: size, height: size, alignSelf: 'center', marginTop: 14 }}>
        <View style={ring(geometry.zodiacOuter, 'rgba(232, 199, 126, 0.26)')} />
        <View style={ring(geometry.zodiacInner, 'rgba(232, 199, 126, 0.16)')} />
        <View style={ring(geometry.hubRadius, 'rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)')} />

        {/* Zodiac dividers and glyphs. */}
        {wheel.zodiac.map((sector) => (
          <View key={sector.sign}>
            <Segment
              from={sector.divider.inner}
              to={sector.divider.outer}
              color="rgba(232, 199, 126, 0.18)"
            />
            <Mark
              at={sector.label}
              color="rgba(232, 199, 126, 0.72)"
              fontSize={size * 0.042}
            >
              {SIGN_GLYPHS[sector.sign] ?? sector.sign.slice(0, 2)}
            </Mark>
          </View>
        ))}

        {/* House cusps — absent entirely without a birth time and place. */}
        {wheel.houses.map((house) => (
          <View key={house.number}>
            <Segment from={house.inner} to={house.outer} color="rgba(255, 255, 255, 0.09)" dashed />
            <Mark at={house.numberAt} color="rgba(255, 255, 255, 0.32)" fontSize={size * 0.03}>
              {String(house.number)}
            </Mark>
          </View>
        ))}

        {/* Aspects, between TRUE positions. */}
        {wheel.aspects.map((aspect, index) => (
          <Segment
            key={`${aspect.bodyA}-${aspect.bodyB}-${index}`}
            from={aspect.from}
            to={aspect.to}
            color={ASPECT_COLOR[aspect.kind]}
            width={aspect.orb < 2 ? 1.4 : 0.8}
          />
        ))}

        {/* Angles — only the ones that were proven. */}
        {wheel.angles.map((angle) => (
          <View key={angle.key}>
            <Segment
              from={angle.inner}
              to={angle.outer}
              color="rgba(201, 134, 146, 0.55)"
              width={1.4}
            />
            <Mark at={angle.label} color="#ffb7c7" fontSize={size * 0.032} weight="600">
              {angle.key === 'asc' ? labels.asc : labels.mc}
            </Mark>
          </View>
        ))}

        {/* Planets: tick on the true longitude, glyph possibly nudged. */}
        {wheel.planets.map((planet) => {
          const offset = glyphOffsetDegrees(planet, geometry);
          return (
            <View key={planet.key}>
              <Segment
                from={planet.tickInner}
                to={planet.tickOuter}
                color="rgba(255, 255, 255, 0.45)"
                width={1.2}
              />
              {planet.nudged && offset > 1.5 ? (
                <Segment
                  from={planet.tickInner}
                  to={planet.glyph}
                  color="rgba(255, 255, 255, 0.16)"
                  width={0.7}
                />
              ) : null}
              <Mark at={planet.glyph} color="#ffffff" fontSize={size * 0.05}>
                {GLYPHS[planet.key] ?? '·'}
              </Mark>
            </View>
          );
        })}
      </View>

      {(!hasAngles || !hasHouses) && unavailableNote ? (
        <Text style={styles.note}>{unavailableNote}</Text>
      ) : null}
      {wheel.planets.length === 0 ? <Text style={styles.note}>{labels.noChart}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: AppTheme.colors.goldMuted,
    flexShrink: 1,
  },
  toggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 11,
    color: AppTheme.colors.textSecondary,
  },
  body: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: AppTheme.colors.textSecondary,
  },
  note: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 20,
    color: AppTheme.colors.textSecondary,
  },
});
