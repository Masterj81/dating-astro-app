import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface JSSliderProps {
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: ViewStyle;
}

const THUMB_SIZE = 24;

export default function JSSlider({
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  value = 0,
  onValueChange,
  minimumTrackTintColor = '#e94560',
  maximumTrackTintColor = '#333',
  thumbTintColor = '#e94560',
  style,
}: JSSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbX = useRef(new Animated.Value(0)).current;
  const currentValueRef = useRef(value);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;

  const range = Math.max(maximumValue - minimumValue, 0.001);

  const valueToPos = useCallback(
    (v: number, w: number) => ((Math.min(Math.max(v, minimumValue), maximumValue) - minimumValue) / range) * w,
    [minimumValue, maximumValue, range],
  );

  const posToValue = useCallback(
    (x: number, w: number) => {
      if (w === 0) return minimumValue;
      let raw = minimumValue + (Math.min(Math.max(x, 0), w) / w) * range;
      if (step > 0) raw = Math.round((raw - minimumValue) / step) * step + minimumValue;
      return Math.min(Math.max(raw, minimumValue), maximumValue);
    },
    [minimumValue, maximumValue, range, step],
  );

  // Sync thumb position when value or trackWidth changes
  useEffect(() => {
    currentValueRef.current = value;
    thumbX.setValue(valueToPos(value, trackWidth));
  }, [value, trackWidth, valueToPos, thumbX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          const x = evt.nativeEvent.locationX;
          const newVal = posToValue(x, trackWidth);
          currentValueRef.current = newVal;
          thumbX.setValue(valueToPos(newVal, trackWidth));
          onValueChangeRef.current?.(newVal);
        },
        onPanResponderMove: (evt: GestureResponderEvent) => {
          const x = evt.nativeEvent.locationX;
          const newVal = posToValue(x, trackWidth);
          if (newVal !== currentValueRef.current) {
            currentValueRef.current = newVal;
            thumbX.setValue(valueToPos(newVal, trackWidth));
            onValueChangeRef.current?.(newVal);
          }
        },
      }),
    [trackWidth, posToValue, valueToPos, thumbX],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  // Use pixel-based width for fill (not %)
  const fillStyle = useMemo(
    () => ({
      backgroundColor: minimumTrackTintColor,
      width: thumbX,
      height: '100%' as const,
      borderRadius: 2,
    }),
    [minimumTrackTintColor, thumbX],
  );

  return (
    <View
      style={[styles.container, style]}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <View style={[styles.track, { backgroundColor: maximumTrackTintColor }]}>
        <Animated.View style={fillStyle} />
      </View>
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: thumbTintColor,
            transform: [{ translateX: thumbX }, { translateX: -THUMB_SIZE / 2 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
});
