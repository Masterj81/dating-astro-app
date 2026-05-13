// Per-feature glyph for premium hub cards. Switches on a feature key
// and falls back to PremiumGlyph. Pure View/Text — no SVG dep.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';
import PremiumGlyph from './PremiumGlyph';
import CompatibilityGlyph from './CompatibilityGlyph';
import AscendantGlyph from './AscendantGlyph';

type PremiumCardGlyphProps = {
  featureKey: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

function Tarot({ size, color }: { size: number; color: string }) {
  const w = Math.round(size * 0.58);
  const h = Math.round(size * 0.86);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: Math.round(size * 0.1),
          borderColor: color,
          borderWidth: 1.6,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color, fontSize: Math.round(size * 0.32), fontWeight: '700', includeFontPadding: false }}>
          {'✦'}
        </Text>
      </View>
    </View>
  );
}

function Calendar({ size, color }: { size: number; color: string }) {
  const w = Math.round(size * 0.82);
  const h = Math.round(size * 0.78);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 3,
          borderColor: color,
          borderWidth: 1.6,
        }}
      />
      <View style={{ position: 'absolute', top: Math.round(size * 0.11), width: w, height: 1.6, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: Math.round(size * 0.02), left: Math.round(size * 0.22), width: 1.6, height: Math.round(size * 0.16), backgroundColor: color }} />
      <View style={{ position: 'absolute', top: Math.round(size * 0.02), right: Math.round(size * 0.22), width: 1.6, height: Math.round(size * 0.16), backgroundColor: color }} />
    </View>
  );
}

function Planet({ size, color }: { size: number; color: string }) {
  const body = Math.round(size * 0.5);
  const ringW = Math.round(size * 0.92);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: body,
          height: body,
          borderRadius: body / 2,
          borderColor: color,
          borderWidth: 1.6,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: ringW,
          height: Math.round(body * 0.5),
          borderRadius: ringW / 2,
          borderColor: color,
          borderWidth: 1.4,
          opacity: 0.7,
          transform: [{ rotate: '-22deg' }],
        }}
      />
    </View>
  );
}

function Clover({ size, color }: { size: number; color: string }) {
  // Four-leaf abstract: a centered diamond with four small dots.
  const r = Math.round(size * 0.18);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: r * 2, height: r * 2, borderColor: color, borderWidth: 1.6, transform: [{ rotate: '45deg' }] }} />
      {[0, 90, 180, 270].map((deg) => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            width: r,
            height: r,
            borderRadius: r / 2,
            borderColor: color,
            borderWidth: 1.4,
            transform: [{ rotate: `${deg}deg` }, { translateY: -Math.round(size * 0.3) }],
          }}
        />
      ))}
    </View>
  );
}

export default function PremiumCardGlyph({
  featureKey,
  size = 36,
  color = AppTheme.colors.gold,
  style,
}: PremiumCardGlyphProps) {
  const wrap = (child: ReactNode) => (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {child}
    </View>
  );
  switch (featureKey) {
    case 'fullNatalChart':
      return wrap(<AscendantGlyph size={size} color={color} />);
    case 'advancedSynastry':
      return wrap(<CompatibilityGlyph size={size} color={color} />);
    case 'dailyHoroscope':
      return wrap(<PremiumGlyph size={size} color={color} />);
    case 'monthlyTarot':
    case 'weeklyTarot':
      return wrap(<Tarot size={size} color={color} />);
    case 'monthlyHoroscope':
      return wrap(<Calendar size={size} color={color} />);
    // V2 rename: `planetaryTransits` is now `transitReflection`.
    // Both keys resolve to the planet glyph for back-compat.
    case 'transitReflection':
    case 'planetaryTransits':
      return wrap(<Planet size={size} color={color} />);
    // V2: `luckyDays` was renamed to `planningWindows` in the premium
    // catalog. Both keys are accepted here so any older translation /
    // deep link that still references `luckyDays` keeps a stable glyph.
    case 'planningWindows':
    case 'luckyDays':
      return wrap(<Clover size={size} color={color} />);
    // V2: `datePlanner` was renamed to `dateReflection`. Same back-compat.
    case 'dateReflection':
    case 'datePlanner':
      return wrap(<PremiumGlyph size={size} color={color} />);
    default:
      return wrap(<PremiumGlyph size={size} color={color} />);
  }
}

// styles intentionally inline — each sub-glyph is tiny.
const _styles = StyleSheet.create({});
void _styles;
