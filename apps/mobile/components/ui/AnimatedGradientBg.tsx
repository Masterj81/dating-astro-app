import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { useReduceMotion } from '../../utils/accessibility';

const BASE_COLORS = ['#0B0B14', '#16192A', '#1E2740'] as const;
const OVERLAY_COLORS = ['#0B0B14', '#1A1535', '#1E2740'] as const;

type Props = {
  style?: ViewStyle;
  children?: React.ReactNode;
};

export function AnimatedGradientBg({ style, children }: Props) {
  const reduceMotion = useReduceMotion();

  return (
    <LinearGradient colors={[...BASE_COLORS]} style={[styles.container, style]}>
      {reduceMotion ? null : (
        <MotiView
          style={StyleSheet.absoluteFill}
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            loop: true,
            type: 'timing',
            duration: 4000,
            repeatReverse: true,
          }}
        >
          <LinearGradient colors={[...OVERLAY_COLORS]} style={StyleSheet.absoluteFill} />
        </MotiView>
      )}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
