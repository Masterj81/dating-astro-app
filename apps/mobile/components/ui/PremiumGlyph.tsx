// Small monoline gold mark for premium surfaces. Built with View/Text
// (no react-native-svg dep) so we add no package weight.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';

type PremiumGlyphProps = {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export default function PremiumGlyph({
  size = 24,
  color = AppTheme.colors.gold,
  style,
}: PremiumGlyphProps) {
  const ring = size;
  const inner = Math.round(size * 0.42);
  return (
    <View
      style={[styles.wrap, { width: ring, height: ring }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.ring,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: color,
          },
        ]}
      />
      <Text
        style={[
          styles.glyph,
          {
            color: AppTheme.colors.heroStart,
            fontSize: Math.round(size * 0.34),
            lineHeight: Math.round(size * 0.34),
          },
        ]}
      >
        {'✷'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    opacity: 0.55,
  },
  dot: {
    position: 'absolute',
    opacity: 0.18,
  },
  glyph: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
