import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import AuthBrandMark from '../components/AuthBrandMark';
import { AppTheme } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const MIN_SPLASH_MS = 1500;
const MAX_SPLASH_MS = 12000;

const LOADING_TIP_KEYS = [
  'loadingTip1',
  'loadingTip2',
  'loadingTip3',
  'loadingTip4',
  'loadingTip5',
];

export default function Index() {
  const { user, loading, isEmailVerified, onboardingCompleted } = useAuth();
  const { t } = useLanguage();
  const [splashReady, setSplashReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  const brandFade = useRef(new Animated.Value(0)).current;
  const brandRise = useRef(new Animated.Value(18)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardRise = useRef(new Animated.Value(26)).current;
  const glowPulse = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const failsafe = setTimeout(() => {
      if (!splashReady) {
        console.warn('Splash failsafe triggered - forcing navigation');
        setSplashReady(true);
      }
    }, MAX_SPLASH_MS);

    return () => clearTimeout(failsafe);
  }, [splashReady]);

  useEffect(() => {
    if (!loading && minTimeElapsed) {
      setSplashReady(true);
    }
  }, [loading, minTimeElapsed]);

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
    ]).start();
  }, [brandFade, brandRise, cardFade, cardRise, glowPulse]);

  if (splashReady) {
    if (!user) {
      return <Redirect href="/auth/login" />;
    }
    if (!isEmailVerified) {
      return <Redirect href="/auth/verify-email" />;
    }
    if (!onboardingCompleted) {
      return <Redirect href="/onboarding/birth-info" />;
    }
    return <Redirect href="/(tabs)/discover" />;
  }

  return (
    <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
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
        <RotatingLoadingTip t={t} />
      </Animated.View>
    </LinearGradient>
  );
}

function RotatingLoadingTip({ t }: { t: (key: string) => string }) {
  const [tipIndex, setTipIndex] = useState(0);
  const tipFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(tipFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setTipIndex(prev => (prev + 1) % LOADING_TIP_KEYS.length);
        Animated.timing(tipFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    }, 2400);
    return () => clearInterval(interval);
  }, [tipFade]);

  return (
    <Animated.Text style={[styles.loadingHint, { opacity: tipFade }]}>
      {t(LOADING_TIP_KEYS[tipIndex]) || 'Preparing your stars\u2026'}
    </Animated.Text>
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
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
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
  loadingHint: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 16,
    letterSpacing: 0.3,
  },
});
