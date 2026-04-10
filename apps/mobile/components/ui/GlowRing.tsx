import { MotiView } from 'moti';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../utils/accessibility';

type Props = {
  color?: string;
  borderRadius?: number;
  intensity?: number;
  style?: ViewStyle;
};

export function GlowRing({
  color = AppTheme.colors.coral,
  borderRadius = AppTheme.radius.lg,
  intensity = 1,
  style,
}: Props) {
  const reduceMotion = useReduceMotion();

  const baseShadowOpacity = 0.15 * intensity;
  const peakShadowOpacity = 0.4 * intensity;
  const baseShadowRadius = 8 * intensity;
  const peakShadowRadius = 20 * intensity;

  return (
    <MotiView
      style={[
        styles.ring,
        {
          borderRadius,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
      from={{
        shadowOpacity: reduceMotion ? peakShadowOpacity : baseShadowOpacity,
        shadowRadius: reduceMotion ? peakShadowRadius : baseShadowRadius,
      }}
      animate={{
        shadowOpacity: peakShadowOpacity,
        shadowRadius: peakShadowRadius,
      }}
      transition={
        reduceMotion
          ? { type: 'timing', duration: 0 }
          : {
              loop: true,
              type: 'timing',
              duration: 1500,
              repeatReverse: true,
            }
      }
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
  },
});
