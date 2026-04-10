import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../../constants/theme';

type Props = {
  tier: 'celestial' | 'cosmic';
  label: string;
};

export function TierBadge({ tier, label }: Props) {
  const cosmic = tier === 'cosmic';

  return (
    <View style={[styles.badge, cosmic ? styles.cosmicBadge : styles.celestialBadge]}>
      <Text style={[styles.text, cosmic ? styles.cosmicText : styles.celestialText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
  },
  celestialBadge: {
    backgroundColor: 'rgba(218,181,109,0.12)',
    borderColor: 'rgba(218,181,109,0.30)',
  },
  cosmicBadge: {
    backgroundColor: 'rgba(124,108,255,0.14)',
    borderColor: 'rgba(124,108,255,0.34)',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  celestialText: {
    color: AppTheme.colors.gold,
  },
  cosmicText: {
    color: '#A9A0FF',
  },
});
