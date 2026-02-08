import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { getBaseFontSize, FontSize, a11yColors } from '../utils/accessibility';

export type TextVariant = FontSize;

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'error'
  | 'success'
  | 'warning'
  | 'link'
  | 'accent';

export interface AccessibleTextProps extends Omit<TextProps, 'style'> {
  /**
   * Text size variant
   * @default 'base'
   */
  variant?: TextVariant;

  /**
   * Text color from the accessible color palette
   * @default 'primary'
   */
  color?: TextColor;

  /**
   * Maximum font scale multiplier for Dynamic Type
   * Prevents layout breaks with large text
   * @default 1.5
   */
  maxFontSizeMultiplier?: number;

  /**
   * Font weight
   * @default 'normal'
   */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';

  /**
   * Text alignment
   * @default 'left'
   */
  align?: 'left' | 'center' | 'right';

  /**
   * Additional styles to merge
   */
  style?: TextStyle | TextStyle[];

  /**
   * Whether this text is a heading (for accessibility)
   */
  isHeading?: boolean;

  /**
   * Heading level (1-6) for accessibility
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Children content
   */
  children: React.ReactNode;
}

const colorMap: Record<TextColor, string> = {
  primary: a11yColors.text.primary,
  secondary: a11yColors.text.secondary,
  muted: a11yColors.text.muted,
  error: a11yColors.text.error,
  success: a11yColors.text.success,
  warning: a11yColors.text.warning,
  link: a11yColors.text.link,
  accent: a11yColors.text.accent,
};

const weightMap: Record<string, TextStyle['fontWeight']> = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

/**
 * AccessibleText - A text component that respects Dynamic Type settings
 *
 * Features:
 * - Scales with system font size preferences
 * - Limits max scaling to prevent layout breaks
 * - Uses WCAG AA compliant colors
 * - Supports heading accessibility roles
 *
 * @example
 * <AccessibleText variant="lg" color="primary" weight="bold">
 *   Welcome back!
 * </AccessibleText>
 *
 * @example
 * <AccessibleText variant="sm" color="muted" isHeading headingLevel={2}>
 *   Your Matches
 * </AccessibleText>
 */
export function AccessibleText({
  variant = 'base',
  color = 'primary',
  maxFontSizeMultiplier = 1.5,
  weight = 'normal',
  align = 'left',
  style,
  isHeading = false,
  headingLevel,
  children,
  ...props
}: AccessibleTextProps) {
  const fontSize = getBaseFontSize(variant);
  const textColor = colorMap[color];
  const fontWeight = weightMap[weight];

  const accessibilityProps = isHeading
    ? {
        accessibilityRole: 'header' as const,
        ...(headingLevel && {
          accessibilityLevel: headingLevel,
        }),
      }
    : {};

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        styles.base,
        {
          fontSize,
          color: textColor,
          fontWeight,
          textAlign: align,
        },
        style,
      ]}
      {...accessibilityProps}
      {...props}
    >
      {children}
    </Text>
  );
}

/**
 * Heading component - AccessibleText with heading role
 */
export function Heading({
  level = 1,
  ...props
}: Omit<AccessibleTextProps, 'isHeading' | 'headingLevel'> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  // Map heading levels to variants
  const variantMap: Record<number, TextVariant> = {
    1: 'display',
    2: 'xxl',
    3: 'xl',
    4: 'lg',
    5: 'md',
    6: 'base',
  };

  return (
    <AccessibleText
      variant={props.variant || variantMap[level]}
      weight={props.weight || 'bold'}
      isHeading
      headingLevel={level}
      {...props}
    />
  );
}

/**
 * BodyText component - Optimized for body content
 */
export function BodyText(
  props: Omit<AccessibleTextProps, 'variant'> & { variant?: 'sm' | 'base' | 'md' }
) {
  return <AccessibleText variant={props.variant || 'base'} {...props} />;
}

/**
 * Caption component - Small muted text
 */
export function Caption(
  props: Omit<AccessibleTextProps, 'variant' | 'color'> & { color?: TextColor }
) {
  return (
    <AccessibleText
      variant="xs"
      color={props.color || 'muted'}
      {...props}
    />
  );
}

/**
 * LinkText component - Styled for links
 */
export function LinkText(props: Omit<AccessibleTextProps, 'color'>) {
  return (
    <AccessibleText
      color="link"
      accessibilityRole="link"
      {...props}
    />
  );
}

/**
 * ErrorText component - For error messages
 */
export function ErrorText(props: Omit<AccessibleTextProps, 'color'>) {
  return (
    <AccessibleText
      color="error"
      accessibilityLiveRegion="polite"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // Default styles that can be overridden
  },
});

export default AccessibleText;
