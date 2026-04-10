import React, { useMemo } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { useReduceMotion } from '../../utils/accessibility';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacityFrom: number;
  opacityTo: number;
  duration: number;
  delay: number;
}

interface ConstellationBgProps {
  density?: number;
  style?: ViewStyle;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const ConstellationBg = React.memo(function ConstellationBg({ density = 12, style }: ConstellationBgProps) {
  const reduceMotion = useReduceMotion();

  const stars = useMemo<Star[]>(() => {
    return Array.from({ length: density }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: randomInRange(2, 4),
      opacityFrom: randomInRange(0.1, 0.3),
      opacityTo: randomInRange(0.4, 0.8),
      duration: randomInRange(1500, 3000),
      delay: randomInRange(0, 2000),
    }));
  }, [density]);

  return (
    <MotiView style={[styles.container, style]} pointerEvents="none">
      {stars.map((star) => (
        <MotiView
          key={star.id}
          from={{ opacity: reduceMotion ? (star.opacityFrom + star.opacityTo) / 2 : star.opacityFrom }}
          animate={{ opacity: reduceMotion ? (star.opacityFrom + star.opacityTo) / 2 : star.opacityTo }}
          transition={
            reduceMotion
              ? { type: 'timing', duration: 0 }
              : {
                  type: 'timing',
                  duration: star.duration,
                  delay: star.delay,
                  loop: true,
                  repeatReverse: true,
                }
          }
          style={[
            styles.star,
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
            },
          ]}
        />
      ))}
    </MotiView>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
});
