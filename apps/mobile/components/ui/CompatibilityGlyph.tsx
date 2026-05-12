// Compatibility / synastry CTA mark: two overlapping rings suggesting two
// charts in dialogue. View/border based so we ship no new dependency.
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';

type CompatibilityGlyphProps = {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export default function CompatibilityGlyph({
  size = 24,
  color = AppTheme.colors.gold,
  style,
}: CompatibilityGlyphProps) {
  const ringSize = Math.round(size * 0.7);
  const overlap = Math.round(ringSize * 0.32);
  const wrapWidth = ringSize * 2 - overlap;
  return (
    <View
      style={[
        styles.wrap,
        { width: wrapWidth, height: ringSize },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: color,
            left: 0,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: color,
            right: 0,
            opacity: 0.7,
          },
        ]}
      />
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
    opacity: 0.9,
  },
});
