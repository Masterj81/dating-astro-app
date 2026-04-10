import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../utils/accessibility';
import { AppTheme } from '../../constants/theme';

const ZODIAC_SYMBOLS = [
  '\u2648', // Aries
  '\u2649', // Taurus
  '\u264A', // Gemini
  '\u264B', // Cancer
  '\u264C', // Leo
  '\u264D', // Virgo
  '\u264E', // Libra
  '\u264F', // Scorpio
  '\u2650', // Sagittarius
  '\u2651', // Capricorn
  '\u2652', // Aquarius
  '\u2653', // Pisces
];

interface ZodiacWheelProps {
  size?: number;
  highlightSigns?: number[];
  opacity?: number;
}

export const ZodiacWheel = React.memo(function ZodiacWheel({
  size = 200,
  highlightSigns,
  opacity = 0.15,
}: ZodiacWheelProps) {
  const reduceMotion = useReduceMotion();
  const rotation = useSharedValue(0);
  const radius = size / 2 - 20;
  const fontSize = Math.max(size / 12, 12);

  useEffect(() => {
    if (!reduceMotion) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 60000, easing: Easing.linear }),
        -1, // infinite
        false
      );
    }
  }, [reduceMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const signs = useMemo(() => {
    return ZODIAC_SYMBOLS.map((symbol, i) => {
      const angleDeg = i * 30 - 90; // start from top
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = radius * Math.cos(angleRad);
      const y = radius * Math.sin(angleRad);
      const isHighlighted = highlightSigns?.includes(i);

      return {
        symbol,
        x,
        y,
        isHighlighted,
        key: i,
      };
    });
  }, [radius, highlightSigns]);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, opacity },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      {signs.map((sign) => (
        <View
          key={sign.key}
          style={[
            styles.symbolContainer,
            {
              left: size / 2 + sign.x - fontSize / 2,
              top: size / 2 + sign.y - fontSize / 2,
            },
          ]}
        >
          <Text
            style={[
              styles.symbol,
              {
                fontSize,
                color: sign.isHighlighted
                  ? AppTheme.colors.coral
                  : AppTheme.colors.textSecondary,
              },
            ]}
          >
            {sign.symbol}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  symbolContainer: {
    position: 'absolute',
  },
  symbol: {
    textAlign: 'center',
  },
});
