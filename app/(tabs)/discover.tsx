import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateQuickCompatibility } from '../../services/astrologyService';
import { supabase } from '../../services/supabase';
import { throttleAction } from '../../utils/rateLimit';
import { useAuth } from '../_layout';
import {
  useReduceMotion,
  getButtonA11yProps,
  getImageA11yProps,
  announceForAccessibility,
  formatCompatibilityForA11y,
  a11yColors,
} from '../../utils/accessibility';
import {
  swipeThreshold,
  likeSwipe,
  passSwipe,
  buttonPress,
  refreshTrigger,
} from '../../services/haptics';

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width - 40, 400);
const CARD_HEIGHT = Math.min(CARD_WIDTH * 1.2, 500);
const SWIPE_THRESHOLD = 100;

type Profile = {
  id: string;
  name: string;
  age: number;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  bio: string;
  image_url: string;
};

type UserProfile = {
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
};

export default function DiscoverScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dragX, setDragX] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [hasReachedThreshold, setHasReachedThreshold] = useState(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const { t, language } = useLanguage();
  const navigation = useNavigation();
  const reduceMotion = useReduceMotion();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('discover'),
      headerTitle: `✦ ${t('discover')}`,
    });
  }, [navigation, language]);

  // Pulse animation for compatibility badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Card entrance animation
  const cardScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.9)).current;
  const cardOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const { user } = useAuth();

  useEffect(() => {
    loadProfiles();
    loadUserProfile();
    if (!reduceMotion) {
      startPulseAnimation();
    }
  }, [user, reduceMotion]);

  useEffect(() => {
    // Animate card entrance when index changes
    if (reduceMotion) {
      // Skip animations for reduce motion
      cardScale.setValue(1);
      cardOpacity.setValue(1);
      return;
    }

    cardScale.setValue(0.9);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex, reduceMotion]);

  const startPulseAnimation = () => {
    if (reduceMotion) return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const loadUserProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('sun_sign, moon_sign, rising_sign')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setUserProfile(data);
    }
  };

  const loadProfiles = async () => {
    setLoading(true);

    // Try to use the RPC function for filtered profiles first
    if (user) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_discoverable_profiles', { p_user_id: user.id, p_limit: 50 });

      if (!rpcError && rpcData && rpcData.length > 0) {
        setProfiles(rpcData || []);
        setLoading(false);
        return;
      }
    }

    // Fallback to direct table query
    const { data, error } = await supabase
      .from('discoverable_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setProfiles(data || []);
    }

    setLoading(false);
  };

  const currentProfile = profiles[currentIndex];

  const getCompatibility = (profileSign: string): number => {
    // Use the user's actual sun sign from their profile
    const userSign = userProfile?.sun_sign || 'Sagittarius';

    // Use the astrology service for compatibility calculation
    return calculateQuickCompatibility(userSign, profileSign);
  };

  const goToNextProfile = async (direction: 'left' | 'right') => {
    const profile = profiles[currentIndexRef.current];

    // Trigger haptic feedback
    if (direction === 'right') {
      likeSwipe();
    } else {
      passSwipe();
    }

    if (user && profile && throttleAction('swipe', 500)) {
      const { error } = await supabase.from('swipes').insert({
        swiper_id: user.id,
        swiped_id: profile.id,
        action: direction === 'right' ? 'like' : 'pass',
      });
    }

    const nextIndex = currentIndexRef.current < profiles.length - 1
      ? currentIndexRef.current + 1
      : 0;

    setCurrentIndex(nextIndex);
    setDragX(0);
    setHasReachedThreshold(false);

    setTimeout(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotation.value = 0;
    }, 50);

    // Announce for screen readers
    const nextProfile = profiles[nextIndex];
    if (nextProfile) {
      announceForAccessibility(
        t('a11y.matchCard', {
          name: nextProfile.name,
          age: nextProfile.age,
          sign: nextProfile.sun_sign,
          score: getCompatibility(nextProfile.sun_sign || 'Aries'),
        })
      );
    }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = gestureState.dx;
      translateY.value = gestureState.dy * 0.3;
      rotation.value = (gestureState.dx / width) * 15;
      setDragX(gestureState.dx);

      // Haptic feedback when reaching threshold
      if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD && !hasReachedThreshold) {
        setHasReachedThreshold(true);
        swipeThreshold();
      } else if (Math.abs(gestureState.dx) <= SWIPE_THRESHOLD && hasReachedThreshold) {
        setHasReachedThreshold(false);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      setHasReachedThreshold(false);

      if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
        const direction = gestureState.dx > 0 ? 'right' : 'left';

        if (reduceMotion) {
          // Skip animation for reduce motion
          goToNextProfile(direction);
        } else {
          const targetX = direction === 'right' ? width * 1.5 : -width * 1.5;
          translateX.value = withTiming(targetX, { duration: 300 });
          rotation.value = withTiming(direction === 'right' ? 30 : -30, { duration: 300 });
          setTimeout(() => goToNextProfile(direction), 300);
        }
      } else {
        if (reduceMotion) {
          translateX.value = 0;
          translateY.value = 0;
          rotation.value = 0;
        } else {
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          rotation.value = withSpring(0);
        }
        setDragX(0);
      }
    },
  }), [profiles, hasReachedThreshold, reduceMotion]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const handleLike = () => {
    buttonPress();
    setDragX(150);

    if (reduceMotion) {
      goToNextProfile('right');
    } else {
      translateX.value = withTiming(width * 1.5, { duration: 300 });
      rotation.value = withTiming(30, { duration: 300 });
      setTimeout(() => goToNextProfile('right'), 300);
    }
  };

  const handlePass = () => {
    buttonPress();
    setDragX(-150);

    if (reduceMotion) {
      goToNextProfile('left');
    } else {
      translateX.value = withTiming(-width * 1.5, { duration: 300 });
      rotation.value = withTiming(-30, { duration: 300 });
      setTimeout(() => goToNextProfile('left'), 300);
    }
  };

  const handleViewChart = () => {
    buttonPress();
    router.push(`/match/${currentProfile?.id}`);
  };

  const handleRefresh = () => {
    refreshTrigger();
    loadProfiles();
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator
          size="large"
          color="#e94560"
          accessibilityLabel={t('a11y.loadingProfiles')}
        />
        <Text style={styles.loadingText}>{t('findingConnections')}</Text>
      </LinearGradient>
    );
  }

  if (!currentProfile || profiles.length === 0) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.emptyState} accessibilityRole="alert">
          <Text style={styles.emptyEmoji} accessibilityLabel="">✨</Text>
          <Text style={styles.emptyTitle}>{t('noMoreProfiles')}</Text>
          <Text style={styles.emptySubtitle}>{t('checkBackLater')}</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            {...getButtonA11yProps(t('refresh'), t('a11y.doubleTapHint'))}
          >
            <Text style={styles.refreshText}>{t('refresh')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const compatibility = getCompatibility(currentProfile.sun_sign || 'Aries');

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <Animated.View style={{ transform: [{ scale: cardScale }], opacity: cardOpacity }}>
        <ReAnimated.View
          style={[styles.card, animatedCardStyle]}
          {...panResponder.panHandlers}
          accessible={true}
          accessibilityLabel={t('a11y.matchCard', {
            name: currentProfile.name,
            age: currentProfile.age,
            sign: currentProfile.sun_sign,
            score: compatibility,
          })}
          accessibilityHint={`${t('a11y.swipeLeftHint')}. ${t('a11y.swipeRightHint')}`}
          accessibilityRole="adjustable"
        >
          <Image
            source={{ uri: currentProfile.image_url }}
            style={styles.cardImage}
            resizeMode="cover"
            {...getImageA11yProps(t('a11y.profileImage', { name: currentProfile.name }))}
          />

          {dragX > 30 && (
            <Animated.View
              style={[styles.overlay, styles.likeOverlay]}
              accessibilityLabel={t('like')}
            >
              <Text style={[styles.overlayText, styles.likeText]}>{t('like')}</Text>
            </Animated.View>
          )}

          {dragX < -30 && (
            <Animated.View
              style={[styles.overlay, styles.nopeOverlay]}
              accessibilityLabel={t('nope')}
            >
              <Text style={[styles.overlayText, styles.nopeText]}>{t('nope')}</Text>
            </Animated.View>
          )}

          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.cardGradient}>
            {/* Pulsing Compatibility Badge */}
            <Animated.View
              style={[
                styles.compatibilityBadge,
                { transform: [{ scale: reduceMotion ? 1 : pulseAnim }] }
              ]}
              accessibilityLabel={formatCompatibilityForA11y(compatibility)}
            >
              <Text style={styles.compatibilityNumber}>{compatibility}%</Text>
              <Text style={styles.compatibilityLabel}>{t('match')}</Text>
            </Animated.View>

            <View style={styles.cardContent}>
              <Text style={styles.name} accessibilityRole="header">
                {currentProfile.name}, {currentProfile.age}
              </Text>

              <View style={styles.signsRow} accessibilityLabel={`Sun sign: ${currentProfile.sun_sign}, Moon sign: ${currentProfile.moon_sign || 'unknown'}, Rising sign: ${currentProfile.rising_sign || 'unknown'}`}>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>☀️</Text>
                  <Text style={styles.signText}>{currentProfile.sun_sign || '?'}</Text>
                </View>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>🌙</Text>
                  <Text style={styles.signText}>{currentProfile.moon_sign || '?'}</Text>
                </View>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>⬆️</Text>
                  <Text style={styles.signText}>{currentProfile.rising_sign || '?'}</Text>
                </View>
              </View>

              <Text style={styles.bio} numberOfLines={2}>{currentProfile.bio}</Text>

              <TouchableOpacity
                style={styles.viewChartButton}
                onPress={handleViewChart}
                {...getButtonA11yProps(t('viewSynastry'))}
              >
                <Text style={styles.viewChartText}>{t('viewSynastry')}</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </ReAnimated.View>
      </Animated.View>

      {/* Action Buttons */}
      <View style={styles.actions} accessibilityRole="toolbar">
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={handlePass}
          activeOpacity={0.7}
          {...getButtonA11yProps(
            t('a11y.passButton', { name: currentProfile.name }),
            t('a11y.doubleTapHint')
          )}
        >
          <Text style={styles.passEmoji}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.superButton]}
          onPress={handleViewChart}
          activeOpacity={0.7}
          {...getButtonA11yProps(t('viewSynastry'))}
        >
          <Text style={styles.superEmoji}>✦</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleLike}
          activeOpacity={0.7}
          {...getButtonA11yProps(
            t('a11y.likeButton', { name: currentProfile.name }),
            t('a11y.doubleTapHint')
          )}
        >
          <Text style={styles.likeEmoji}>♥</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter} accessibilityLabel={`Profile ${currentIndex + 1} of ${profiles.length}`}>
        {currentIndex + 1} / {profiles.length}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    color: a11yColors.text.secondary,
    marginTop: 16,
    fontSize: 14,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: a11yColors.background.primary,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
  },
  overlay: {
    position: 'absolute',
    top: 50,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 4,
  },
  likeOverlay: {
    right: 20,
    borderColor: '#4ade80',
    backgroundColor: 'rgba(74, 222, 128, 0.4)',
    transform: [{ rotate: '15deg' }],
  },
  nopeOverlay: {
    left: 20,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    transform: [{ rotate: '-15deg' }],
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  likeText: {
    color: '#4ade80',
  },
  nopeText: {
    color: '#ef4444',
  },
  compatibilityBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#e94560',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  compatibilityNumber: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  compatibilityLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardContent: {
    gap: 12,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  signsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  signPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  signEmoji: {
    fontSize: 14,
  },
  signText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  bio: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
    lineHeight: 22,
  },
  viewChartButton: {
    marginTop: 4,
  },
  viewChartText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 24,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  passButton: {
    backgroundColor: 'rgba(30, 30, 45, 0.9)',
    borderWidth: 2,
    borderColor: a11yColors.text.muted,
    shadowColor: a11yColors.text.muted,
  },
  superButton: {
    backgroundColor: 'rgba(30, 30, 45, 0.9)',
    borderWidth: 2,
    borderColor: '#9b59b6',
    shadowColor: '#9b59b6',
  },
  likeButton: {
    backgroundColor: 'rgba(30, 30, 45, 0.9)',
    borderWidth: 2,
    borderColor: '#e94560',
    shadowColor: '#e94560',
  },
  passEmoji: {
    fontSize: 28,
    color: a11yColors.text.secondary,
  },
  superEmoji: {
    fontSize: 28,
    color: '#9b59b6',
  },
  likeEmoji: {
    fontSize: 28,
    color: '#e94560',
  },
  counter: {
    marginTop: 16,
    color: a11yColors.text.muted,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: a11yColors.text.secondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  refreshText: {
    color: '#fff',
    fontWeight: '600',
  },
});
