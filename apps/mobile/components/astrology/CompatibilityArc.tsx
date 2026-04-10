import React, { useMemo } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { useReduceMotion } from '../../utils/accessibility';

interface CompatibilityArcProps {
  percentage: number;
  size?: number;
  style?: ViewStyle;
}

function interpolateColor(pct: number): string {
  // red (0%) -> gold (50%) -> green (100%)
  if (pct <= 50) {
    const t = pct / 50;
    const r = Math.round(232 + (218 - 232) * t);
    const g = Math.round(93 + (181 - 93) * t);
    const b = Math.round(117 + (109 - 117) * t);
    return `rgb(${r},${g},${b})`;
  }
  const t = (pct - 50) / 50;
  const r = Math.round(218 + (89 - 218) * t);
  const g = Math.round(181 + (194 - 181) * t);
  const b = Math.round(109 + (139 - 109) * t);
  return `rgb(${r},${g},${b})`;
}

const DOT_COUNT = 14;

export function CompatibilityArc({
  percentage,
  size = 80,
  style,
}: CompatibilityArcProps) {
  const reduceMotion = useReduceMotion();
  const radius = size / 2 - 4;
  const dotSize = Math.max(size / 16, 3);
  const filledCount = Math.round((percentage / 100) * DOT_COUNT);

  const dots = useMemo(() => {
    return Array.from({ length: DOT_COUNT }, (_, i) => {
      // Semicircle from 180deg to 0deg (left to right across the top)
      const angleDeg = 180 - (i / (DOT_COUNT - 1)) * 180;
      const angleRad = (angleDeg * Math.PI) / 180;
      const x = radius * Math.cos(angleRad);
      const y = -radius * Math.sin(angleRad);
      const isFilled = i < filledCount;
      const dotPct = (i / (DOT_COUNT - 1)) * 100;

      return {
        key: i,
        x: size / 2 + x - dotSize / 2,
        y: size / 2 + y - dotSize / 2,
        isFilled,
        color: isFilled ? interpolateColor(dotPct) : 'rgba(255,255,255,0.15)',
        delay: i * 60,
      };
    });
  }, [radius, size, dotSize, filledCount]);

  return (
    <MotiView style={[styles.container, { width: size, height: size / 2 + dotSize }, style]}>
      {dots.map((dot) => (
        <MotiView
          key={dot.key}
          from={{
            opacity: reduceMotion ? (dot.isFilled ? 1 : 0.2) : 0,
            scale: reduceMotion ? 1 : 0.5,
          }}
          animate={{
            opacity: dot.isFilled ? 1 : 0.2,
            scale: 1,
          }}
          transition={
            reduceMotion
              ? { type: 'timing', duration: 0 }
              : {
                  type: 'timing',
                  duration: 300,
                  delay: dot.delay,
                }
          }
          style={[
            styles.dot,
            {
              left: dot.x,
              top: dot.y,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: dot.color,
            },
          ]}
        />
      ))}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  dot: {
    position: 'absolute',
  },
});
