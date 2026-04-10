import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import React, { useRef, useEffect } from 'react';
import { Animated, ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { AppTheme } from '../constants/theme';
import { useReduceMotion } from '../utils/accessibility';

const GRADIENT_COLORS = [...AppTheme.gradients.screen] as const;

type LoadingStateProps = {
  message?: string;
  accessibilityLabel?: string;
  testID?: string;
  contentStyle?: ViewStyle;
  skeleton?: React.ReactNode;
};

function PulsingOrb() {
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <Animated.View style={[styles.loadingOrb, { opacity: pulse, transform: [{ scale: pulse }] }]} />
  );
}

export const LoadingState = React.memo(function LoadingState({
  message,
  accessibilityLabel = 'Loading',
  testID = 'loading-state',
  contentStyle,
  skeleton,
}: LoadingStateProps) {
  if (skeleton) {
    return (
      <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
        <View
          testID={testID}
          accessibilityRole="progressbar"
          accessibilityLabel={accessibilityLabel}
          style={{ flex: 1, alignSelf: 'stretch' }}
        >
          {skeleton}
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      <View
        testID={testID}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        style={styles.content}
      >
        <PulsingOrb />
        <ActivityIndicator size="large" color={AppTheme.colors.coral} style={{ marginTop: 16 }} />
        {message && <Text style={styles.loadingText}>{message}</Text>}
      </View>
    </LinearGradient>
  );
});

type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
  contentStyle?: ViewStyle;
};

export const ErrorState = React.memo(function ErrorState({
  title = 'Oops, something unexpected happened',
  message = 'Don\u2019t worry \u2014 this is usually temporary. Give it another try.',
  onRetry,
  retryLabel = 'Try Again',
  testID = 'error-state',
  contentStyle,
}: ErrorStateProps) {
  const reduceMotion = useReduceMotion();

  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      <View testID={testID} accessibilityRole="alert" style={styles.content}>
        <MotiView
          from={{ translateX: reduceMotion ? 0 : -4 }}
          animate={{ translateX: 0 }}
          transition={
            reduceMotion
              ? { type: 'timing', duration: 0 }
              : { type: 'spring', damping: 4 }
          }
        >
          <Text style={styles.errorEmoji}>{'\u{1F30C}'}</Text>
        </MotiView>
        <Text style={styles.errorTitle}>{title}</Text>
        {message && <Text style={styles.errorMessage}>{message}</Text>}
        {onRetry && (
          <MotiView
            from={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduceMotion
                ? { type: 'timing', duration: 0 }
                : { type: 'timing', duration: 400, delay: 200 }
            }
          >
            <TouchableOpacity
              style={styles.retryButton}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={retryLabel}
              testID={`${testID}-retry`}
            >
              <Text style={styles.retryText}>{retryLabel}</Text>
            </TouchableOpacity>
          </MotiView>
        )}
      </View>
    </LinearGradient>
  );
});

type EmptyStateProps = {
  emoji?: string;
  title: string;
  subtitle?: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  contentStyle?: ViewStyle;
};

export const EmptyState = React.memo(function EmptyState({
  emoji = '\u{2728}',
  title,
  subtitle,
  hint,
  actionLabel,
  onAction,
  testID = 'empty-state',
  contentStyle,
}: EmptyStateProps) {
  const reduceMotion = useReduceMotion();

  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      {/* Decorative orbs */}
      {!reduceMotion && (
        <>
          <MotiView
            style={[styles.decorativeOrb, styles.orbSmall]}
            from={{ opacity: 0.08 }}
            animate={{ opacity: 0.2 }}
            transition={{
              loop: true,
              type: 'timing',
              duration: 3000,
              repeatReverse: true,
            }}
            pointerEvents="none"
          />
          <MotiView
            style={[styles.decorativeOrb, styles.orbLarge]}
            from={{ opacity: 0.06 }}
            animate={{ opacity: 0.16 }}
            transition={{
              loop: true,
              type: 'timing',
              duration: 4000,
              delay: 1000,
              repeatReverse: true,
            }}
            pointerEvents="none"
          />
        </>
      )}

      <View testID={testID} accessibilityRole="alert" style={styles.content}>
        {/* Floating emoji */}
        <MotiView
          from={{ translateY: reduceMotion ? 0 : 0 }}
          animate={{ translateY: reduceMotion ? 0 : -8 }}
          transition={
            reduceMotion
              ? { type: 'timing', duration: 0 }
              : {
                  loop: true,
                  type: 'timing',
                  duration: 2000,
                  repeatReverse: true,
                }
          }
        >
          <Text style={styles.emptyEmoji}>{emoji}</Text>
        </MotiView>

        {/* Staggered title */}
        <MotiView
          from={{ opacity: reduceMotion ? 1 : 0, translateY: reduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={
            reduceMotion
              ? { type: 'timing', duration: 0 }
              : { type: 'timing', duration: 500, delay: 100 }
          }
        >
          <Text style={styles.emptyTitle}>{title}</Text>
        </MotiView>

        {/* Staggered subtitle */}
        {subtitle && (
          <MotiView
            from={{ opacity: reduceMotion ? 1 : 0, translateY: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={
              reduceMotion
                ? { type: 'timing', duration: 0 }
                : { type: 'timing', duration: 500, delay: 250 }
            }
          >
            <Text style={styles.emptySubtitle}>{subtitle}</Text>
          </MotiView>
        )}

        {onAction && actionLabel && (
          <MotiView
            from={{ opacity: reduceMotion ? 1 : 0, translateY: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={
              reduceMotion
                ? { type: 'timing', duration: 0 }
                : { type: 'timing', duration: 500, delay: 400 }
            }
          >
            <TouchableOpacity
              style={styles.actionButton}
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              testID={`${testID}-action`}
            >
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          </MotiView>
        )}

        {hint && (
          <MotiView
            from={{ opacity: reduceMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduceMotion
                ? { type: 'timing', duration: 0 }
                : { type: 'timing', duration: 600, delay: 600 }
            }
          >
            <View style={styles.hintContainer}>
              <Text style={styles.hintIcon}>{'\u{1F4A1}'}</Text>
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          </MotiView>
        )}
      </View>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
  },
  // Decorative orbs
  decorativeOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: AppTheme.colors.coral,
  },
  orbSmall: {
    width: 40,
    height: 40,
    top: '30%',
    right: '15%',
  },
  orbLarge: {
    width: 60,
    height: 60,
    bottom: '25%',
    left: '10%',
    backgroundColor: AppTheme.colors.cosmic,
  },
  // Loading
  loadingOrb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppTheme.colors.coral,
    opacity: 0.6,
    marginBottom: 8,
  },
  loadingText: {
    color: AppTheme.colors.textSecondary,
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  // Error
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: AppTheme.radius.pill,
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center' as const,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  retryText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center' as const,
  },
  // Empty
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    maxWidth: 280,
    paddingHorizontal: 8,
  },
  actionButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: AppTheme.radius.pill,
    alignSelf: 'center',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    minWidth: 180,
  },
  actionText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    maxWidth: 300,
    gap: 8,
  },
  hintIcon: {
    fontSize: 14,
  },
  hintText: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    fontStyle: 'italic',
  },
});
