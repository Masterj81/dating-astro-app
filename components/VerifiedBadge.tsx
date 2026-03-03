import { StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

type VerifiedBadgeProps = {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
};

export default function VerifiedBadge({
  size = 'small',
  showText = false,
}: VerifiedBadgeProps) {
  const { t } = useLanguage();

  const sizeStyles = {
    small: {
      container: styles.containerSmall,
      icon: styles.iconSmall,
      text: styles.textSmall,
    },
    medium: {
      container: styles.containerMedium,
      icon: styles.iconMedium,
      text: styles.textMedium,
    },
    large: {
      container: styles.containerLarge,
      icon: styles.iconLarge,
      text: styles.textLarge,
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <View style={[styles.container, currentSize.container]}>
      <Text style={[styles.icon, currentSize.icon]}>✓</Text>
      {showText && (
        <Text style={[styles.text, currentSize.text]}>{t('verified')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
  },
  containerSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 0,
  },
  containerMedium: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  containerLarge: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    gap: 6,
  },
  icon: {
    color: '#fff',
    fontWeight: 'bold',
  },
  iconSmall: {
    fontSize: 10,
  },
  iconMedium: {
    fontSize: 12,
  },
  iconLarge: {
    fontSize: 16,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 10,
  },
  textMedium: {
    fontSize: 12,
  },
  textLarge: {
    fontSize: 14,
  },
});
