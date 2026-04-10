import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { ErrorState, LoadingState, EmptyState } from '../../components/ScreenStates';
import WebTabWrapper from '../../components/WebTabWrapper';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  ImageErrorEventData,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import ReAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import VerifiedBadge from '../../components/VerifiedBadge';
import VoiceIntroPlayer from '../../components/VoiceIntroPlayer';
import PlanetGlyph from '../../components/ui/PlanetGlyph';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateQuickCompatibility } from '../../services/astrologyService';
import { supabase } from '../../services/supabase';
import { throttleAction } from '../../utils/rateLimit';
import { withRetry } from '../../utils/retry';
import { resolveProfileImage, DEFAULT_PROFILE_IMAGE } from '../../utils/profileImages';
import { useAuth } from '../../contexts/AuthContext';
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
import { usePremium } from '../../contexts/PremiumContext';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';

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
  image_url?: string | null;
  photos?: Array<string | null>;
  images?: Array<string | null>;
  is_verified?: boolean;
  has_voice_intro?: boolean;
  voice_intro_url?: string;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [swipeError, setSwipeError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [deckExhausted, setDeckExhausted] = useState(false);
  // Use discrete direction state instead of raw dragX to avoid per-frame re-renders
  const [swipeDirection, setSwipeDirection] = useState<'none' | 'left' | 'right'>('none');
  const dragXRef = useRef(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const hasReachedThresholdRef = useRef(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const { t, language } = useLanguage();
  const navigation = useNavigation();
  const reduceMotion = useReduceMotion();
  const swipeInProgressRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('discover'),
      headerTitle: `✦ ${t('discover')}`,
    });
  }, [navigation, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pulse animation for compatibility badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Card entrance animation
  const cardScale = useRef(new Animated.Value(reduceMotion ? 1 : 0.9)).current;
  const cardOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const goToNextProfileRef = useRef<(direction: 'left' | 'right') => void>(() => {});

  const { user } = useAuth();
  const { tier } = usePremium();
  const isFreeUser = tier === 'free';

  // Compute compatibility eagerly (before any early returns) to respect Rules of Hooks
  const currentProfile = profiles.length > 0 && currentIndex < profiles.length
    ? profiles[currentIndex]
    : null;
  const currentProfileImage = resolveProfileImage(currentProfile);

  const getCompatibility = useCallback((profileSign: string | null | undefined): number => {
    if (!profileSign) return 50; // safe fallback
    const userSign = userProfile?.sun_sign || 'Sagittarius';
    return calculateQuickCompatibility(userSign, profileSign);
  }, [userProfile?.sun_sign]);

  const compatibility = useMemo(
    () => getCompatibility(currentProfile?.sun_sign),
    [currentProfile?.sun_sign, getCompatibility]
  );

  useEffect(() => {
    loadProfiles();
    loadUserProfile();
    if (!reduceMotion) {
      startPulseAnimation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user, reduceMotion]);

  useEffect(() => {
    // Reset image error when profile changes
    setImageError(false);

    // Animate card entrance when index changes
    if (reduceMotion) {
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
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, [currentIndex, reduceMotion]);

  const startPulseAnimation = () => {
    if (reduceMotion) return;

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('sun_sign, moon_sign, rising_sign')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setUserProfile(data);
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  };

  const loadProfiles = async () => {
    setLoading(true);
    setLoadError(null);
    setDeckExhausted(false);

    try {
      const fetchedProfiles = await withRetry(async () => {
        // Try to use the RPC function for filtered profiles first
        if (user) {
          const { data: rpcData, error: rpcError } = await supabase
            .rpc('get_discoverable_profiles', { p_user_id: user.id, p_limit: 50 });

          if (!rpcError && rpcData && rpcData.length > 0) {
            return rpcData;
          }
        }

        // Fallback to direct table query
        let query = supabase
          .from('discoverable_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        // Exclude current user's profile
        if (user) {
          query = query.neq('id', user.id);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return data || [];
      });

      setProfiles(fetchedProfiles);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error loading profiles:', err);
      setLoadError(t('loadProfilesFailed') || 'Could not load profiles. Check your connection and try again.');
    }

    setLoading(false);
  };

  const goToNextProfile = async (direction: 'left' | 'right') => {
    if (swipeInProgressRef.current) return;
    swipeInProgressRef.current = true;

    const currentProfiles = profilesRef.current;
    const profile = currentProfiles[currentIndexRef.current];

    // Trigger haptic feedback
    if (direction === 'right') {
      likeSwipe();
    } else {
      passSwipe();
    }

    // Persist swipe to backend
    if (user && profile && throttleAction('swipe', 500)) {
      try {
        const { error } = await supabase.from('swipes').upsert({
          swiper_id: user.id,
          swiped_id: profile.id,
          action: direction === 'right' ? 'like' : 'pass',
        }, { onConflict: 'swiper_id,swiped_id' });

        if (error) {
          console.error('Swipe save error:', error);
          setSwipeError(t('swipeFailed') || 'Could not save your choice. Please try again.');
          // Auto-dismiss after 3 seconds
          setTimeout(() => setSwipeError(null), 3000);
        }
      } catch (err) {
        console.error('Swipe network error:', err);
        setSwipeError(t('swipeFailed') || 'Could not save your choice. Please try again.');
        setTimeout(() => setSwipeError(null), 3000);
      }
    }

    // Check if we've reached the end of the deck
    const isLastProfile = currentIndexRef.current >= currentProfiles.length - 1;

    if (isLastProfile) {
      setDeckExhausted(true);
      swipeInProgressRef.current = false;
      dragXRef.current = 0;
      setSwipeDirection('none');
      hasReachedThresholdRef.current = false;

      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(rotation);
      translateX.value = 0;
      translateY.value = 0;
      rotation.value = 0;
      return;
    }

    const nextIndex = currentIndexRef.current + 1;

    setCurrentIndex(nextIndex);
    dragXRef.current = 0;
    setSwipeDirection('none');
    hasReachedThresholdRef.current = false;

    // Cancel any ongoing animations and reset values
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(rotation);
    translateX.value = 0;
    translateY.value = 0;
    rotation.value = 0;

    // Announce for screen readers
    const nextProfile = currentProfiles[nextIndex];
    if (nextProfile) {
      announceForAccessibility(
        t('a11y.matchCard', {
          name: nextProfile.name || t('unknown'),
          age: nextProfile.age || '?',
          sign: nextProfile.sun_sign || t('unknown'),
          score: getCompatibility(nextProfile.sun_sign),
        })
      );
    }

    swipeInProgressRef.current = false;
  };

  // Keep ref updated with latest function
  goToNextProfileRef.current = goToNextProfile;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = gestureState.dx;
      translateY.value = gestureState.dy * 0.3;
      rotation.value = (gestureState.dx / width) * 15;
      dragXRef.current = gestureState.dx;
      // Only update React state when crossing the overlay visibility threshold (30px)
      const newDir = gestureState.dx > 30 ? 'right' : gestureState.dx < -30 ? 'left' : 'none';
      setSwipeDirection(prev => prev !== newDir ? newDir : prev);

      // Haptic feedback when reaching threshold
      if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD && !hasReachedThresholdRef.current) {
        hasReachedThresholdRef.current = true;
        swipeThreshold();
      } else if (Math.abs(gestureState.dx) <= SWIPE_THRESHOLD && hasReachedThresholdRef.current) {
        hasReachedThresholdRef.current = false;
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      hasReachedThresholdRef.current = false;

      if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
        const direction = gestureState.dx > 0 ? 'right' : 'left';
        const targetX = direction === 'right' ? width * 1.5 : -width * 1.5;
        translateX.value = withTiming(targetX, { duration: 300 });
        rotation.value = withTiming(direction === 'right' ? 30 : -30, { duration: 300 });
        setTimeout(() => goToNextProfileRef.current(direction), 300);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotation.value = withSpring(0);
        dragXRef.current = 0;
        setSwipeDirection('none');
      }
    },
  })).current;

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const handleLike = () => {
    if (swipeInProgressRef.current || !currentProfile) return;
    buttonPress();
    dragXRef.current = 150;
    setSwipeDirection('right');

    if (reduceMotion) {
      goToNextProfile('right');
    } else {
      translateX.value = withTiming(width * 1.5, { duration: 300 });
      rotation.value = withTiming(30, { duration: 300 });
      setTimeout(() => goToNextProfile('right'), 300);
    }
  };

  const handleShare = async () => {
    if (!currentProfile) return;
    buttonPress();
    const sign = currentProfile.sun_sign || 'someone';
    const score = getCompatibility(sign);
    const message = Platform.select({
      android: `I'm ${score}% compatible with a ${sign} on AstroDating! Find your cosmic match \u{1F6F0}\nhttps://play.google.com/store/apps/details?id=com.astrodatingapp.mobile`,
      default: `I'm ${score}% compatible with a ${sign} on AstroDating! Find your cosmic match \u{1F6F0}\nhttps://astrodatingapp.com`,
    });
    try {
      await Share.share({ message, title: 'AstroDating Compatibility' });
    } catch { /* user cancelled */ }
  };

  const handlePass = () => {
    if (swipeInProgressRef.current || !currentProfile) return;
    buttonPress();
    dragXRef.current = -150;
    setSwipeDirection('left');

    if (reduceMotion) {
      goToNextProfile('left');
    } else {
      translateX.value = withTiming(-width * 1.5, { duration: 300 });
      rotation.value = withTiming(-30, { duration: 300 });
      setTimeout(() => goToNextProfile('left'), 300);
    }
  };

  const handleViewChart = () => {
    if (!currentProfile?.id) return;
    buttonPress();
    router.push(`/match/${currentProfile.id}`);
  };

  const handleRefresh = () => {
    refreshTrigger();
    setDeckExhausted(false);
    setSwipeError(null);
    loadProfiles();
  };

  const handleImageError = (_e: NativeSyntheticEvent<ImageErrorEventData>) => {
    setImageError(true);
  };

  const compatibilityLabel = useMemo(() => {
    if (compatibility >= 80) return t('compatibilityHigh') || 'Strong cosmic bond';
    if (compatibility >= 55) return t('compatibilityMedium') || 'Promising alignment';
    return t('compatibilityLow') || 'Different energies';
  }, [compatibility, t]);

  // Rotating loading tips for engagement during load
  const loadingTips = useMemo(() => [
    t('loadingTip1') || 'Aligning the planets\u2026',
    t('loadingTip2') || 'Reading the cosmic map\u2026',
    t('loadingTip3') || 'Consulting the stars\u2026',
    t('loadingTip4') || 'Charting your constellation\u2026',
    t('loadingTip5') || 'Syncing with the cosmos\u2026',
  ], [t]);

  const [loadingTipIndex] = useState(() => Math.floor(Math.random() * 5));

  if (loading) {
    return (
      <WebTabWrapper>
        <LoadingState
          message={loadingTips[loadingTipIndex]}
          accessibilityLabel={t('a11y.loadingProfiles')}
          testID="discover-loading"
        />
      </WebTabWrapper>
    );
  }

  if (loadError) {
    return (
      <WebTabWrapper>
        <ErrorState
          title={t('error') || 'Something went wrong'}
          message={loadError}
          onRetry={handleRefresh}
          retryLabel={t('refresh') || 'Try Again'}
          testID="discover-error"
        />
      </WebTabWrapper>
    );
  }

  if (profiles.length === 0) {
    return (
      <WebTabWrapper>
        <EmptyState
          title={t('noMoreProfiles')}
          subtitle={t('checkBackLater')}
          actionLabel={t('refresh')}
          onAction={handleRefresh}
          testID="discover-empty"
        />
      </WebTabWrapper>
    );
  }

  // End-of-deck state: user has swiped through all profiles
  if (deckExhausted || !currentProfile) {
    return (
      <WebTabWrapper>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
          <View style={styles.exhaustedContainer} testID="discover-exhausted">
            <Text style={styles.exhaustedEmoji}>{'\u{1F30C}'}</Text>
            <Text style={styles.exhaustedTitle}>
              {t('profilesExhausted') || "You've seen everyone!"}
            </Text>
            <Text style={styles.exhaustedSubtitle}>
              {t('profilesExhaustedSub') || 'Check back soon \u2014 new people join every day.'}
            </Text>
            <View style={styles.exhaustedTimeTip}>
              <Text style={styles.exhaustedTimeTipIcon}>{'\u{23F0}'}</Text>
              <Text style={styles.exhaustedTimeTipText}>
                {t('newProfilesDaily') || 'New profiles appear daily'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.exhaustedRefreshButton}
              onPress={handleRefresh}
              activeOpacity={0.7}
              {...getButtonA11yProps(t('refresh') || 'Refresh')}
            >
              <LinearGradient
                colors={[AppTheme.colors.coral, AppTheme.colors.cosmic]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.exhaustedRefreshGradient}
              >
                <Text style={styles.exhaustedRefreshText}>{t('refresh') || 'Refresh'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            {/* Daily horoscope re-engagement hook */}
            <TouchableOpacity
              style={styles.exhaustedHoroscopeButton}
              onPress={() => {
                buttonPress();
                router.push('/premium-screens/daily-horoscope' as any);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.exhaustedHoroscopeIcon}>{'\u{1F52E}'}</Text>
              <View style={styles.exhaustedHoroscopeTextWrap}>
                <Text style={styles.exhaustedHoroscopeTitle}>
                  {t('deckExhaustedDailyTip') || 'While you wait, explore your daily horoscope'}
                </Text>
                <Text style={styles.exhaustedHoroscopeCta}>
                  {t('checkDailyHoroscope') || 'View Daily Horoscope'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.exhaustedHint}>
              {t('deckExhaustedCheckMatches')}
            </Text>
            <TouchableOpacity
              style={styles.exhaustedMatchesButton}
              onPress={() => {
                buttonPress();
                router.push('/(tabs)/matches');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.exhaustedMatchesText}>{t('goToMatches')}</Text>
            </TouchableOpacity>
            <Text style={styles.exhaustedCounter}>
              {profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'} seen
            </Text>
          </View>
        </LinearGradient>
      </WebTabWrapper>
    );
  }

  return (
    <WebTabWrapper>
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      {/* Swipe error toast */}
      {swipeError && (
        <View style={styles.swipeErrorToast} accessibilityRole="alert">
          <Text style={styles.swipeErrorText}>{swipeError}</Text>
          <TouchableOpacity onPress={() => setSwipeError(null)}>
            <Text style={styles.swipeErrorDismiss}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={{ transform: [{ scale: cardScale }], opacity: cardOpacity }}>
        <View {...panResponder.panHandlers}>
          <ReAnimated.View
            style={[styles.card, animatedCardStyle]}
            accessible={true}
            accessibilityLabel={t('a11y.matchCard', {
              name: currentProfile.name ?? t('unknown'),
              age: currentProfile.age ?? '?',
              sign: currentProfile.sun_sign ?? t('unknown'),
              score: compatibility,
            })}
            accessibilityHint={`${t('a11y.swipeLeftHint')}. ${t('a11y.swipeRightHint')}`}
            accessibilityRole="adjustable"
          >
          {/* Profile image with error fallback */}
          {imageError ? (
            <View style={[styles.cardImage, styles.imageFallback]}>
              <Text style={styles.imageFallbackEmoji}>{'\u{1F464}'}</Text>
              <Text style={styles.imageFallbackText}>
                {t('imageLoadFailed') || 'Photo unavailable'}
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: currentProfileImage, cache: 'force-cache' }}
              style={styles.cardImage}
              resizeMode="cover"
              onError={handleImageError}
              defaultSource={Platform.OS === 'ios' ? { uri: DEFAULT_PROFILE_IMAGE } : undefined}
              {...getImageA11yProps(t('a11y.profileImage', { name: currentProfile.name ?? 'Profile' }))}
            />
          )}

          {swipeDirection === 'right' && (
            <Animated.View
              style={[styles.overlay, styles.likeOverlay]}
              accessibilityLabel={t('like')}
            >
              <Text style={[styles.overlayText, styles.likeText]}>{t('like')}</Text>
            </Animated.View>
          )}

          {swipeDirection === 'left' && (
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
                compatibility >= 80 && styles.compatBadgeHigh,
                compatibility >= 55 && compatibility < 80 && styles.compatBadgeMedium,
                { transform: [{ scale: reduceMotion ? 1 : pulseAnim }] }
              ]}
              accessibilityLabel={formatCompatibilityForA11y(compatibility)}
            >
              <Text style={styles.compatibilityNumber}>{compatibility}%</Text>
              <Text style={styles.compatibilityLabel}>{t('match')}</Text>
              <Text style={styles.compatibilityHint}>{compatibilityLabel}</Text>
            </Animated.View>

            <View style={styles.cardContent}>
              <View style={styles.nameRow}>
                <Text style={styles.name} accessibilityRole="header">
                  {currentProfile.name ?? t('unknown')}, {currentProfile.age ?? '?'}
                </Text>
                {currentProfile.is_verified && <VerifiedBadge size="small" />}
              </View>

              <View style={styles.signsRow} accessibilityLabel={`Sun sign: ${currentProfile.sun_sign ?? 'unknown'}, Moon sign: ${currentProfile.moon_sign ?? 'unknown'}, Rising sign: ${currentProfile.rising_sign ?? 'unknown'}`}>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>{'\u2600\uFE0F'}</Text>
                  <View>
                    <Text style={styles.signText}>{currentProfile.sun_sign || '?'}</Text>
                    <Text style={styles.signSubtext}>{t('sunSignExplainer')}</Text>
                  </View>
                </View>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>{'\u{1F319}'}</Text>
                  <View>
                    <Text style={styles.signText}>{currentProfile.moon_sign || '?'}</Text>
                    <Text style={styles.signSubtext}>{t('moonSignExplainer')}</Text>
                  </View>
                </View>
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>{'\u2B06\uFE0F'}</Text>
                  <View>
                    <Text style={styles.signText}>{currentProfile.rising_sign || '?'}</Text>
                    <Text style={styles.signSubtext}>{t('risingSignExplainer')}</Text>
                  </View>
                </View>
              </View>

              {currentProfile.bio ? (
                <Text style={styles.bio} numberOfLines={2}>{currentProfile.bio}</Text>
              ) : null}

              {currentProfile.has_voice_intro && currentProfile.voice_intro_url && (
                <View style={styles.voiceIntroContainer}>
                  <VoiceIntroPlayer
                    url={currentProfile.voice_intro_url}
                    size="small"
                    showLabel={true}
                  />
                </View>
              )}

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
        </View>
      </Animated.View>

      {/* Action Buttons */}
      {/* Score explainer + premium teaser — below card */}
      <View style={styles.belowCardInfo}>
        <Text style={styles.scoreExplainerText}>{t('compatScoreExplainer')}</Text>
        {isFreeUser && (
          <TouchableOpacity
            style={styles.deepInsightRow}
            onPress={() => router.push('/premium-screens/plans' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.deepInsightIcon}>{'\u2726'}</Text>
            <Text style={styles.deepInsightTitle}>
              {t('deeperCompatibility')}
            </Text>
            <Text style={styles.deepInsightCta}>
              {t('unlockFullChart')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions} accessibilityRole="toolbar">
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={handlePass}
          activeOpacity={0.7}
          {...getButtonA11yProps(
            t('a11y.passButton', { name: currentProfile.name ?? '' }),
            t('a11y.doubleTapHint')
          )}
        >
          <Text style={styles.passEmoji}>{'\u2715'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.shareButton]}
          onPress={handleShare}
          activeOpacity={0.7}
          {...getButtonA11yProps(t('shareCompatibility') || 'Share compatibility')}
        >
          <Text style={styles.shareEmoji}>{'\u{1F4E4}'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.superButton, isFreeUser && styles.superButtonPremium]}
          onPress={isFreeUser ? () => router.push('/premium-screens/plans' as any) : handleViewChart}
          activeOpacity={0.7}
          {...getButtonA11yProps(isFreeUser ? (t('unlockSuperLikes') || 'Unlock Super Likes') : t('viewSynastry'))}
        >
          <Text style={styles.superEmoji}>{isFreeUser ? '\u2B50' : '\u2726'}</Text>
          {isFreeUser && <View style={styles.premiumDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={handleLike}
          activeOpacity={0.7}
          {...getButtonA11yProps(
            t('a11y.likeButton', { name: currentProfile.name ?? '' }),
            t('a11y.doubleTapHint')
          )}
        >
          <Text style={styles.likeEmoji}>{'\u2665'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counter} accessibilityLabel={`Profile ${currentIndex + 1} of ${profiles.length}`}>
        {currentIndex + 1} of {profiles.length}
      </Text>
    </LinearGradient>
    </WebTabWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  loadingText: {
    color: a11yColors.text.secondary,
    marginTop: 16,
    fontSize: 14,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: a11yColors.background.primary,
    borderWidth: 1.5,
    borderColor: AppTheme.colors.cardBorderElevated,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  imageFallback: {
    backgroundColor: AppTheme.colors.canvasAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageFallbackEmoji: {
    fontSize: 48,
    marginBottom: 8,
    opacity: 0.5,
  },
  imageFallbackText: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
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
    borderColor: AppTheme.colors.success,
    backgroundColor: 'rgba(74, 222, 128, 0.4)',
    transform: [{ rotate: '15deg' }],
  },
  nopeOverlay: {
    left: 20,
    borderColor: AppTheme.colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    transform: [{ rotate: '-15deg' }],
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  likeText: {
    color: AppTheme.colors.success,
  },
  nopeText: {
    color: AppTheme.colors.danger,
  },
  compatibilityBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: AppTheme.colors.coral,
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 10,
    minWidth: 72,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  compatibilityNumber: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  compatibilityLabel: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  compatibilityHint: {
    color: 'rgba(255, 255, 255, 0.80)',
    fontSize: 9,
    marginTop: 3,
    textAlign: 'center',
    fontWeight: '500',
  },
  cardContent: {
    gap: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  voiceIntroContainer: {
    marginTop: 4,
  },
  signsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  signPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: AppTheme.radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 6,
  },
  signEmoji: {
    fontSize: 14,
  },
  signText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bio: {
    color: AppTheme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  viewChartButton: {
    marginTop: 8,
    backgroundColor: 'rgba(232, 93, 117, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: AppTheme.radius.pill,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.28)',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 3,
  },
  viewChartText: {
    color: AppTheme.colors.coral,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 28,
  },
  actionButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
    elevation: 6,
  },
  passButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
  },
  shareButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
  },
  shareEmoji: {
    fontSize: 22,
  },
  superButton: {
    backgroundColor: 'rgba(124,108,255,0.10)',
    borderWidth: 2,
    borderColor: AppTheme.colors.cosmic,
    shadowColor: AppTheme.colors.cosmic,
    shadowOpacity: 0.40,
  },
  likeButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
    borderWidth: 2.5,
    borderColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOpacity: 0.50,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 10,
  },
  passEmoji: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.50)',
  },
  superEmoji: {
    fontSize: 26,
    color: AppTheme.colors.cosmic,
  },
  likeEmoji: {
    fontSize: 34,
    color: AppTheme.colors.coral,
  },
  counter: {
    marginTop: 12,
    color: a11yColors.text.muted,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  // Swipe error toast
  swipeErrorToast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: AppTheme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  swipeErrorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  swipeErrorDismiss: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: 'bold',
    padding: 4,
  },
  // End of deck / exhausted state
  exhaustedContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  exhaustedEmoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  exhaustedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  exhaustedSubtitle: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    maxWidth: 280,
  },
  exhaustedTimeTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: AppTheme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginBottom: 28,
    gap: 8,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  exhaustedTimeTipIcon: {
    fontSize: 16,
  },
  exhaustedTimeTipText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  exhaustedRefreshButton: {
    borderRadius: AppTheme.radius.pill,
    overflow: 'hidden',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 16,
  },
  exhaustedRefreshGradient: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: AppTheme.radius.pill,
    minWidth: 180,
    alignItems: 'center',
  },
  exhaustedRefreshText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  exhaustedCounter: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  // Legacy empty state styles (kept for reference but EmptyState component is used)
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
  deepInsightIcon: {
    fontSize: 12,
    color: AppTheme.colors.cosmic,
  },
  deepInsightTitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
  deepInsightCta: {
    fontSize: 10,
    color: AppTheme.colors.cosmic,
    fontWeight: '700',
  },
  superButtonPremium: {
    borderColor: AppTheme.colors.gold,
    shadowColor: AppTheme.colors.gold,
  },
  premiumDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppTheme.colors.gold,
    borderWidth: 1.5,
    borderColor: AppTheme.colors.canvas,
  },
  signSubtext: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
    letterSpacing: 0.3,
  },
  belowCardInfo: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    gap: 6,
  },
  scoreExplainerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  deepInsightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compatBadgeHigh: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
  },
  compatBadgeMedium: {
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
  },
  exhaustedHoroscopeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 108, 255, 0.10)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
    gap: 12,
    width: '100%',
    maxWidth: 320,
  },
  exhaustedHoroscopeIcon: {
    fontSize: 28,
  },
  exhaustedHoroscopeTextWrap: {
    flex: 1,
  },
  exhaustedHoroscopeTitle: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 19,
    marginBottom: 4,
  },
  exhaustedHoroscopeCta: {
    fontSize: 14,
    color: AppTheme.colors.cosmic,
    fontWeight: '700',
  },
  exhaustedHint: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 12,
  },
  exhaustedMatchesButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  exhaustedMatchesText: {
    color: a11yColors.text.primary,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
