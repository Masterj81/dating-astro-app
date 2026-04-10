import { MotiView } from 'moti';
import { StyleProp, ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';
import { useReduceMotion } from '../../utils/accessibility';

type SkeletonProps = {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Skeleton({
  width,
  height,
  borderRadius = AppTheme.radius.sm,
  style,
}: SkeletonProps) {
  const reduceMotion = useReduceMotion();

  return (
    <MotiView
      from={{ opacity: reduceMotion ? 0.5 : 0.3 }}
      animate={{ opacity: reduceMotion ? 0.5 : 0.7 }}
      transition={
        reduceMotion
          ? { type: 'timing', duration: 0 }
          : { type: 'timing', duration: 1000, loop: true }
      }
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: AppTheme.colors.panel,
        },
        style,
      ]}
    />
  );
}
