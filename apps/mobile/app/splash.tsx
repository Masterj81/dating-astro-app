import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import AuthBrandMark from '../components/AuthBrandMark';
import { ConstellationBg } from '../components/astrology/ConstellationBg';
import { ZodiacWheel } from '../components/astrology/ZodiacWheel';
import { AnimatedGradientBg } from '../components/ui/AnimatedGradientBg';
import { AppTheme } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';

const SPLASH_FACT_KEYS = [
  'splashFact1',
  'splashFact2',
  'splashFact3',
  'splashFact4',
  'splashFact5',
];

export default function SplashScreen() {
  const { t } = useLanguage();
  const [factIndex] = useState(() => Math.floor(Math.random() * SPLASH_FACT_KEYS.length));
  const factFade = useRef(new Animated.Value(0)).current;
  const brandFade = useRef(new Animated.Value(0)).current;
  const brandRise = useRef(new Animated.Value(18)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardRise = useRef(new Animated.Value(26)).current;
  const glowPulse = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(brandFade, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(brandRise, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(cardFade, {
        toValue: 1,
        duration: 850,
        delay: 120,
        useNativeDriver: true,
      }),
      Animated.timing(cardRise, {
        toValue: 0,
        duration: 850,
        delay: 120,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, {
            toValue: 1.06,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(glowPulse, {
            toValue: 0.92,
            duration: 1800,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.timing(factFade, {
        toValue: 1,
        duration: 600,
        delay: 900,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      router.replace('/');
    }, 2600);

    return () => clearTimeout(timer);
  }, [brandFade, brandRise, cardFade, cardRise, glowPulse, factFade]);

  return (
    <AnimatedGradientBg style={styles.container}>
      <ConstellationBg density={15} />
      <ZodiacWheel size={300} opacity={0.08} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowOrbPrimary,
          { transform: [{ scale: glowPulse }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowOrb,
          styles.glowOrbSecondary,
          { transform: [{ scale: glowPulse }] },
        ]}
      />

      <Animated.View
        style={[
          styles.hero,
          {
            opacity: brandFade,
            transform: [{ translateY: brandRise }],
          },
        ]}
      >
        <AuthBrandMark size={96} />
        <Text style={styles.eyebrow}>ASTRODATING</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: cardFade,
            transform: [{ translateY: cardRise }],
          },
        ]}
      >
        <Text style={styles.title}>{t('appName')}</Text>
        <Text style={styles.subtitle}>{t('findYourCosmicMatch')}</Text>
        <View style={styles.divider} />
        <LoadingDots />
        <Animated.Text style={[styles.cosmicFact, { opacity: factFade }]}>
          {t(SPLASH_FACT_KEYS[factIndex])}
        </Animated.Text>
      </Animated.View>
    </AnimatedGradientBg>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.28)).current;
  const dot2 = useRef(new Animated.Value(0.28)).current;
  const dot3 = useRef(new Animated.Value(0.28)).current;

  useEffect(() => {
    const animateDots = () => {
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(dot1, { toValue: 0.28, duration: 260, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(dot2, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.28, duration: 260, useNativeDriver: true }),
        ]).start();
      }, 140);

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(dot3, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.28, duration: 260, useNativeDriver: true }),
        ]).start();
      }, 280);
    };

    animateDots();
    const interval = setInterval(animateDots, 900);
    return () => clearInterval(interval);
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.dotsContainer}>
      <Animated.View style={[styles.dot, { opacity: dot1 }]} />
      <Animated.View style={[styles.dot, { opacity: dot2 }]} />
      <Animated.View style={[styles.dot, { opacity: dot3 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.18,
  },
  glowOrbPrimary: {
    width: 320,
    height: 320,
    top: -60,
    right: -80,
    backgroundColor: AppTheme.colors.coral,
  },
  glowOrbSecondary: {
    width: 260,
    height: 260,
    bottom: -40,
    left: -60,
    backgroundColor: AppTheme.colors.cosmic,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  eyebrow: {
    marginTop: 14,
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3.2,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 28,
    paddingVertical: 30,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 18, 33, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 18,
  },
  title: {
    ...AppTheme.type.display,
    color: AppTheme.colors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
  divider: {
    width: 56,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 24,
    marginBottom: 22,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 99,
    backgroundColor: AppTheme.colors.coral,
  },
  cosmicFact: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 18,
    textAlign: 'center',
    letterSpacing: 0.2,
    fontStyle: 'italic',
    maxWidth: 260,
    lineHeight: 19,
  },
});
