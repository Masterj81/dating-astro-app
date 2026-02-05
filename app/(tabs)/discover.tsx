import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
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
import { calculateQuickCompatibility, getElement } from '../../services/astrologyService';
import { supabase } from '../../services/supabase';
import { throttleAction } from '../../utils/rateLimit';
import { useAuth } from '../_layout';

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
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const { t, language } = useLanguage();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('discover'),
      headerTitle: `✦ ${t('discover')}`,
    });
  }, [navigation, language]);

  // Pulse animation for compatibility badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Card entrance animation
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const { user } = useAuth();

  useEffect(() => {
    loadProfiles();
    loadUserProfile();
    startPulseAnimation();
  }, [user]);

  useEffect(() => {
    // Animate card entrance when index changes
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
  }, [currentIndex]);

  const startPulseAnimation = () => {
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

    const { data, error } = await supabase
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

    if (error) {
    } else {
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

    if (user && profile && throttleAction('swipe', 500)) {
      const { error } = await supabase.from('swipes').insert({
        swiper_id: user.id,
        swiped_id: profile.id,
        action: direction === 'right' ? 'like' : 'pass',
      });

      if (error?.message?.includes('Rate limit')) {
        // Server-side rate limit reached — silently skip
      }
    }

    const nextIndex = currentIndexRef.current < profiles.length - 1
      ? currentIndexRef.current + 1
      : 0;

    setCurrentIndex(nextIndex);
    setDragX(0);

    setTimeout(() => {
      translateX.value = 0;
      translateY.value = 0;
      rotation.value = 0;
    }, 50);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = gestureState.dx;
      translateY.value = gestureState.dy * 0.3;
      rotation.value = (gestureState.dx / width) * 15;
      setDragX(gestureState.dx);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
        const direction = gestureState.dx > 0 ? 'right' : 'left';
        const targetX = direction === 'right' ? width * 1.5 : -width * 1.5;

        translateX.value = withTiming(targetX, { duration: 300 });
        rotation.value = withTiming(direction === 'right' ? 30 : -30, { duration: 300 });

        setTimeout(() => goToNextProfile(direction), 300);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotation.value = withSpring(0);
        setDragX(0);
      }
    },
  }), [profiles]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const handleLike = () => {
    setDragX(150);
    translateX.value = withTiming(width * 1.5, { duration: 300 });
    rotation.value = withTiming(30, { duration: 300 });
    setTimeout(() => goToNextProfile('right'), 300);
  };

  const handlePass = () => {
    setDragX(-150);
    translateX.value = withTiming(-width * 1.5, { duration: 300 });
    rotation.value = withTiming(-30, { duration: 300 });
    setTimeout(() => goToNextProfile('left'), 300);
  };

  const handleViewChart = () => {
    router.push(`/match/${currentProfile?.id}`);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>{t('findingConnections')}</Text>
      </LinearGradient>
    );
  }

  if (!currentProfile || profiles.length === 0) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>✨</Text>
          <Text style={styles.emptyTitle}>{t('noMoreProfiles')}</Text>
          <Text style={styles.emptySubtitle}>{t('checkBackLater')}</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadProfiles}>
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
        >
          <Image source={{ uri: currentProfile.image_url }} style={styles.cardImage} resizeMode="cover" />

          {dragX > 30 && (
            <Animated.View style={[styles.overlay, styles.likeOverlay]}>
              <Text style={[styles.overlayText, styles.likeText]}>{t('like')}</Text>
            </Animated.View>
          )}

          {dragX < -30 && (
            <Animated.View style={[styles.overlay, styles.nopeOverlay]}>
              <Text style={[styles.overlayText, styles.nopeText]}>{t('nope')}</Text>
            </Animated.View>
          )}

          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.cardGradient}>
            {/* Pulsing Compatibility Badge */}
            <Animated.View style={[styles.compatibilityBadge, { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.compatibilityNumber}>{compatibility}%</Text>
              <Text style={styles.compatibilityLabel}>{t('match')}</Text>
            </Animated.View>

            <View style={styles.cardContent}>
              <Text style={styles.name}>{currentProfile.name}, {currentProfile.age}</Text>

              <View style={styles.signsRow}>
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

              <TouchableOpacity style={styles.viewChartButton} onPress={handleViewChart}>
                <Text style={styles.viewChartText}>{t('viewSynastry')}</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </ReAnimated.View>
      </Animated.View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={handlePass}
          activeOpacity={0.7}
        >
          <Text style={styles.passEmoji}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.superButton]}
          onPress={handleViewChart}
          activeOpacity={0.7}
        >
          <Text style={styles.superEmoji}>✦</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleLike}
          activeOpacity={0.7}
        >
          <Text style={styles.likeEmoji}>♥</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter}>{currentIndex + 1} / {profiles.length}</Text>
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
    color: '#888',
    marginTop: 16,
    fontSize: 14,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
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
    borderColor: '#666',
    shadowColor: '#666',
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
    color: '#888',
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
    color: '#666',
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
    color: '#888',
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
