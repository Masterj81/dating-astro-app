import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { AppTheme } from '../../constants/theme';

type PlanetGlyphProps = {
  symbol: string;
  planetKey?: string;
  size?: number;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const PLANET_ACCENTS: Record<string, string> = {
  sun: AppTheme.colors.gold,
  moon: AppTheme.colors.textPrimary,
  mercury: AppTheme.colors.cosmicSoft,
  venus: AppTheme.colors.coral,
  mars: AppTheme.colors.warning,
  jupiter: AppTheme.colors.gold,
  saturn: AppTheme.colors.cosmicSoft,
};

const SYMBOL_ALIASES: Record<string, { key: string; symbol: string }> = {
  '☀️': { key: 'sun', symbol: '☉' },
  'â˜€ï¸': { key: 'sun', symbol: '☉' },
  '☉': { key: 'sun', symbol: '☉' },
  '🌙': { key: 'moon', symbol: '☽' },
  'ðŸŒ™': { key: 'moon', symbol: '☽' },
  '☽': { key: 'moon', symbol: '☽' },
  '☿️': { key: 'mercury', symbol: '☿' },
  'â˜¿ï¸': { key: 'mercury', symbol: '☿' },
  '☿': { key: 'mercury', symbol: '☿' },
  '♀️': { key: 'venus', symbol: '♀' },
  'â™€ï¸': { key: 'venus', symbol: '♀' },
  '♀': { key: 'venus', symbol: '♀' },
  '♂️': { key: 'mars', symbol: '♂' },
  'â™‚ï¸': { key: 'mars', symbol: '♂' },
  '♂': { key: 'mars', symbol: '♂' },
  '♃': { key: 'jupiter', symbol: '♃' },
  'â™ƒ': { key: 'jupiter', symbol: '♃' },
  '♄': { key: 'saturn', symbol: '♄' },
  'â™„': { key: 'saturn', symbol: '♄' },
};

const PLANET_OFFSETS: Partial<Record<string, number>> = Platform.select({
  android: {
    sun: -0.5,
    moon: -1,
    mercury: -0.5,
    venus: -0.5,
    mars: -0.5,
    jupiter: -1,
    saturn: -1,
  },
  default: {},
}) as Partial<Record<string, number>>;

export default function PlanetGlyph({
  symbol,
  planetKey,
  size = 30,
  containerStyle,
  textStyle,
}: PlanetGlyphProps) {
  const alias = SYMBOL_ALIASES[symbol];
  const resolvedKey = planetKey || alias?.key;
  const resolvedSymbol = alias?.symbol || symbol;
  const accentColor = resolvedKey ? PLANET_ACCENTS[resolvedKey] : undefined;
  const verticalOffset = resolvedKey ? (PLANET_OFFSETS[resolvedKey] ?? 0) : 0;

  if (!accentColor) {
    return (
      <Text style={[styles.symbol, { fontSize: size, lineHeight: size + 4 }, textStyle]}>
        {resolvedSymbol}
      </Text>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          width: size + 12,
          height: size + 12,
          borderColor: `${accentColor}55`,
          backgroundColor: `${accentColor}16`,
          shadowColor: accentColor,
        },
        containerStyle,
      ]}
    >
      <View style={styles.symbolWrap}>
        <Text
          style={[
            styles.badgeSymbol,
            {
              color: accentColor,
              fontSize: size * 0.78,
              transform: [{ translateY: verticalOffset }],
            },
            textStyle,
          ]}
        >
          {resolvedSymbol}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  symbol: {
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  symbolWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSymbol: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
