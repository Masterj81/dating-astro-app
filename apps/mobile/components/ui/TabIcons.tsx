// Monoline tab bar icons built from View borders. No SVG / new dep.
// Each accepts size + color, mirroring the rest of the ui/ glyphs.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';
import PremiumGlyph from './PremiumGlyph';

type IconProps = {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function DiscoverTabIcon({ size = 22, color = AppTheme.colors.textPrimary, style }: IconProps) {
  const lens = Math.round(size * 0.7);
  const stroke = 1.8;
  const handleLen = Math.round(size * 0.32);
  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.lens,
          {
            width: lens,
            height: lens,
            borderRadius: lens / 2,
            borderColor: color,
            borderWidth: stroke,
            top: 0,
            left: 0,
          },
        ]}
      />
      <View
        style={[
          styles.handle,
          {
            width: stroke,
            height: handleLen,
            backgroundColor: color,
            bottom: 0,
            right: 0,
          },
        ]}
      />
    </View>
  );
}

export function ChatTabIcon({ size = 22, color = AppTheme.colors.textPrimary, style }: IconProps) {
  const w = size;
  const h = Math.round(size * 0.78);
  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={{
          width: w,
          height: h,
          borderRadius: Math.round(h * 0.32),
          borderColor: color,
          borderWidth: 1.8,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: Math.round(size * 0.08),
          left: Math.round(size * 0.22),
          width: 6,
          height: 6,
          borderLeftWidth: 1.8,
          borderBottomWidth: 1.8,
          borderColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

export function ProfileTabIcon({ size = 22, color = AppTheme.colors.textPrimary, style }: IconProps) {
  const head = Math.round(size * 0.42);
  const shoulders = Math.round(size * 0.82);
  const stroke = 1.8;
  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          borderColor: color,
          borderWidth: stroke,
          top: 0,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: shoulders,
          height: Math.round(size * 0.42),
          borderTopLeftRadius: shoulders / 2,
          borderTopRightRadius: shoulders / 2,
          borderColor: color,
          borderWidth: stroke,
          borderBottomWidth: 0,
        }}
      />
    </View>
  );
}

export function PremiumTabIcon({ size = 22, color = AppTheme.colors.gold, style }: IconProps) {
  // Tab bar tint propagates via `color`; default to gold for the brand mark.
  return <PremiumGlyph size={size} color={color} style={style} />;
}

// Hidden helper for unlikely use: a small star symbol if a caller wants it.
export function StarText({ size = 16, color = AppTheme.colors.gold }: IconProps) {
  return (
    <Text style={{ color, fontSize: size, fontWeight: '700', includeFontPadding: false }}>
      {'✦'}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: {
    position: 'absolute',
  },
  handle: {
    position: 'absolute',
    borderRadius: 1,
  },
});
