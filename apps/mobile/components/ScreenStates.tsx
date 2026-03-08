import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

const GRADIENT_COLORS = ['#0f0f1a', '#1a1a2e', '#16213e'] as const;

// ─────────────────────────────────────────────────────────────
// LoadingState
// ─────────────────────────────────────────────────────────────
type LoadingStateProps = {
  message?: string;
  accessibilityLabel?: string;
  testID?: string;
  contentStyle?: ViewStyle;
};

export function LoadingState({
  message,
  accessibilityLabel = 'Loading',
  testID = 'loading-state',
  contentStyle,
}: LoadingStateProps) {
  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      <View
        testID={testID}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel}
        style={styles.content}
      >
        <ActivityIndicator size="large" color="#e94560" />
        {message && <Text style={styles.loadingText}>{message}</Text>}
      </View>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────
// ErrorState
// ─────────────────────────────────────────────────────────────
type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
  contentStyle?: ViewStyle;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try Again',
  testID = 'error-state',
  contentStyle,
}: ErrorStateProps) {
  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      <View testID={testID} accessibilityRole="alert" style={styles.content}>
        <Text style={styles.errorEmoji}>{'\u{26A0}\u{FE0F}'}</Text>
        <Text style={styles.errorTitle}>{title}</Text>
        {message && <Text style={styles.errorMessage}>{message}</Text>}
        {onRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            testID={`${testID}-retry`}
          >
            <Text style={styles.retryText}>{retryLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────
type EmptyStateProps = {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  contentStyle?: ViewStyle;
};

export function EmptyState({
  emoji = '\u{2728}',
  title,
  subtitle,
  actionLabel,
  onAction,
  testID = 'empty-state',
  contentStyle,
}: EmptyStateProps) {
  return (
    <LinearGradient colors={[...GRADIENT_COLORS]} style={[styles.container, contentStyle]}>
      <View testID={testID} accessibilityRole="alert" style={styles.content}>
        <Text style={styles.emptyEmoji}>{emoji}</Text>
        <Text style={styles.emptyTitle}>{title}</Text>
        {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
        {onAction && actionLabel && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            testID={`${testID}-action`}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
  },
  // Loading
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
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
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignSelf: 'center',
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  // Empty
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    alignSelf: 'center',
  },
  actionText: {
    color: '#e94560',
    fontWeight: '600',
    fontSize: 14,
  },
});
