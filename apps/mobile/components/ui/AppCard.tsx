import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
};

export function AppCard({ children, style, elevated = false }: Props) {
  return <View style={[styles.card, elevated && styles.elevated, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.lg,
    padding: AppTheme.spacing.lg,
  },
  elevated: {
    backgroundColor: AppTheme.colors.panelStrong,
    borderColor: AppTheme.colors.borderStrong,
  },
});
