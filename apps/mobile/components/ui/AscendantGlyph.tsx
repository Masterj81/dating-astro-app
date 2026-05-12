// Rising / ascendant mark: horizon line with a half-arc rising from it.
// Pure View borders — no react-native-svg required.
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';

type AscendantGlyphProps = {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export default function AscendantGlyph({
  size = 24,
  color = AppTheme.colors.gold,
  style,
}: AscendantGlyphProps) {
  const arcSize = Math.round(size * 0.7);
  const horizonWidth = size;
  const stroke = 1.5;
  return (
    <View
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        style={[
          styles.arc,
          {
            width: arcSize,
            height: arcSize / 2,
            borderTopLeftRadius: arcSize / 2,
            borderTopRightRadius: arcSize / 2,
            borderColor: color,
            borderWidth: stroke,
            borderBottomWidth: 0,
            top: Math.round(size * 0.18),
          },
        ]}
      />
      <View
        style={[
          styles.horizon,
          {
            width: horizonWidth,
            backgroundColor: color,
            bottom: Math.round(size * 0.22),
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
  arc: {
    position: 'absolute',
  },
  horizon: {
    position: 'absolute',
    height: 1.5,
    opacity: 0.85,
  },
});
