import { LinearGradient } from 'expo-linear-gradient';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './_layout';

const ZODIAC_SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const MIN_SPLASH_MS = 1500;
const MAX_SPLASH_MS = 12000; // Failsafe: never show splash longer than 12 seconds

export default function Index() {
  const { user, loading, isEmailVerified, onboardingCompleted } = useAuth();
  const [splashReady, setSplashReady] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const zodiacFade = useRef(new Animated.Value(0)).current;
  const textSlide = useRef(new Animated.Value(50)).current;

  // Minimum splash display time
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Failsafe: force splash to complete after MAX_SPLASH_MS to prevent infinite loading
  useEffect(() => {
    const failsafe = setTimeout(() => {
      if (!splashReady) {
        console.warn('Splash failsafe triggered - forcing navigation');
        setSplashReady(true);
      }
    }, MAX_SPLASH_MS);
    return () => clearTimeout(failsafe);
  }, [splashReady]);

  // Mark splash as ready once auth check completes AND min time has passed
  useEffect(() => {
    if (!loading && minTimeElapsed) {
      setSplashReady(true);
    }
  }, [loading, minTimeElapsed]);

  // Start animations immediately
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(zodiacFade, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(textSlide, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Smart redirect chain once splash is done
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
    <LinearGradient
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      {/* Animated star logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.logo}>✦</Text>
      </Animated.View>

      {/* Individual spinning zodiac signs */}
      <Animated.View style={[styles.zodiacContainer, { opacity: zodiacFade }]}>
        <View style={styles.zodiacRow}>
          {ZODIAC_SIGNS.map((sign, index) => (
            <SpinningSign key={index} sign={sign} delay={index * 100} />
          ))}
        </View>
      </Animated.View>

      {/* App name */}
      <Animated.View
        style={[
          styles.textContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: textSlide }],
          },
        ]}
      >
        <Text style={styles.title}>AstroDating</Text>
        <Text style={styles.subtitle}>Written in the stars</Text>
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsWrapper}>
        <LoadingDots />
      </View>
    </LinearGradient>
  );
}

function SpinningSign({ sign, delay }: { sign: string; delay: number }) {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }).start();

      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        })
      ).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.signContainer,
        {
          transform: [{ rotate: spin }, { scale: scaleAnim }],
        },
      ]}
    >
      <Text style={styles.zodiacSign}>{sign}</Text>
    </Animated.View>
  );
}

function LoadingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDots = () => {
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
      ]).start();

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 150);

      setTimeout(() => {
        Animated.sequence([
          Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 300);
    };

    animateDots();
    const interval = setInterval(animateDots, 900);
    return () => clearInterval(interval);
  }, []);

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
  },
  logoContainer: {
    marginBottom: 30,
  },
  logo: {
    fontSize: 80,
    color: '#e94560',
    textShadowColor: 'rgba(233, 69, 96, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  zodiacContainer: {
    marginBottom: 40,
  },
  zodiacRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 320,
  },
  signContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zodiacSign: {
    fontSize: 28,
    color: '#e94560',
    textShadowColor: 'rgba(233, 69, 96, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    fontStyle: 'italic',
  },
  dotsWrapper: {
    position: 'absolute',
    bottom: 80,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e94560',
  },
});
