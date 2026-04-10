import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';
import { GlowRing } from './GlowRing';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  subtitle?: string;
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  subtitle,
  style,
}: Props) {
  const showGlow = !disabled && !loading;

  return (
    <View style={styles.glowContainer}>
      {showGlow && (
        <GlowRing borderRadius={AppTheme.radius.lg} />
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled || loading}
        style={[styles.wrapper, style, (disabled || loading) && styles.disabled]}
      >
        <LinearGradient colors={[...AppTheme.gradients.cta]} style={styles.button}>
          {loading ? (
            <ActivityIndicator color={AppTheme.colors.textOnAccent} />
          ) : (
            <>
              <Text style={styles.label}>{label}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  glowContainer: {
    position: 'relative',
  },
  wrapper: {
    borderRadius: AppTheme.radius.lg,
    overflow: 'hidden',
  },
  button: {
    minHeight: 58,
    paddingHorizontal: AppTheme.spacing.xl,
    paddingVertical: AppTheme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 4,
  },
  disabled: {
    opacity: 0.55,
  },
});
