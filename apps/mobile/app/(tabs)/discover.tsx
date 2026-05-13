import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { ErrorState, LoadingState, EmptyState } from '../../components/ScreenStates';
import ProfilePublicMVPSections from '../../components/profile/ProfilePublicMVPSections';
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
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { sanitizeLifestyleTags } from '../../data/profile-fields';
import ReAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import BlockReportMenu from '../../components/BlockReportMenu';
import VerifiedBadge from '../../components/VerifiedBadge';
import VoiceIntroPlayer from '../../components/VoiceIntroPlayer';
import PlanetGlyph from '../../components/ui/PlanetGlyph';
import CompatibilityGlyph from '../../components/ui/CompatibilityGlyph';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { startConversationWith } from '../../services/conversations';
import { withRetry } from '../../utils/retry';
import { resolveProfileImage, DEFAULT_PROFILE_IMAGE } from '../../utils/profileImages';
import { useAuth } from '../../contexts/AuthContext';
import {
  useReduceMotion,
  getButtonA11yProps,
  getImageA11yProps,
  announceForAccessibility,
  a11yColors,
} from '../../utils/accessibility';
import {
  swipeThreshold,
  buttonPress,
  refreshTrigger,
} from '../../services/haptics';
import { usePremium } from '../../contexts/PremiumContext';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';

const { width, height } = Dimensions.get('window');
// Full-bleed card. Action buttons are now overlaid INSIDE the card at
// the bottom (prev / view profile / message / next), so we only reserve
// space for the tab bar + a thin safe-area margin. ~100px is enough on
// Samsung devices with rounded corners.
const CARD_WIDTH = width;
const CARD_HEIGHT = Math.max(height - 100, 600);
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
  // MVP profile additions (surfaced via get_discoverable_profiles since
  // 20260430000002). All optional / nullable — legacy profiles may not
  // have any of these.
  relationship_intent?: string | null;
  personal_values?: string[] | null;
  interests?: string[] | null;
  looking_for_text?: string | null;
  prompts?: unknown;
  icebreaker_question?: string | null;
};

export default function DiscoverScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [deckExhausted, setDeckExhausted] = useState(false);
  // Use discrete direction state instead of raw dragX to avoid per-frame re-renders.
  // Swipe is now purely navigational (next/previous card) — no like/pass meaning.
  const [swipeDirection, setSwipeDirection] = useState<'none' | 'left' | 'right'>('none');
  const dragXRef = useRef(0);
  const hasReachedThresholdRef = useRef(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const { t, language } = useLanguage();
  const navigation = useNavigation();
  const reduceMotion = useReduceMotion();
  const swipeInProgressRef = useRef(false);
  const [startingChat, setStartingChat] = useState(false);
  // Viewer's own lifestyle tags — used to highlight shared tags on the
  // public card. Fetched once on mount via get_my_full_profile (the same
  // RPC the edit screen uses). Empty array on failure / no tags.
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('discover'),
      headerTitle: `✦ ${t('discover')}`,
    });
  }, [navigation, language]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Compute card eagerly (before any early returns) to respect Rules of Hooks
  const currentProfile = profiles.length > 0 && currentIndex < profiles.length
    ? profiles[currentIndex]
    : null;
  const currentProfileImage = resolveProfileImage(currentProfile);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user, reduceMotion]);

  // Fetch the viewer's own lifestyle tags so the card can highlight
  // shared tags on profiles they discover. Read-only one-shot — failure
  // is silent (the highlight just won't show).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.rpc('get_my_full_profile');
      const row = Array.isArray(rows) ? rows[0] : null;
      if (cancelled || !row) return;
      setViewerInterests(sanitizeLifestyleTags(row.interests));
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const loadProfiles = async () => {
    setLoading(true);
    setLoadError(null);
    setDeckExhausted(false);

    try {
      const fetchedProfiles = await withRetry(async () => {
        // Use the RPC function for filtered profiles. The RPC enforces
        // gender preference matching (bidirectional) — see migration
        // 20260428000001_fix_discover_gender_filter.sql. Falling back to a
        // raw `discoverable_profiles` view query would silently leak profiles
        // that do not match the viewer's looking_for, which is exactly the
        // bug we are fixing. So: an RPC error is a hard failure, and an
        // empty deck is a legitimate "no more profiles for this viewer".
        if (!user) {
          return [];
        }

        const { data: rpcData, error: rpcError } = await supabase
          .rpc('get_discoverable_profiles', { p_user_id: user.id, p_limit: 50 });

        if (rpcError) {
          throw rpcError;
        }

        // Defensive client-side guard: if a stale build of the server returns
        // any profile equal to the current user, drop it. The RPC already
        // excludes self, but we double-check to keep the deck safe across
        // server/client deploy skew.
        return (rpcData || []).filter((profile: { id: string }) => profile.id !== user.id);
      });

      setProfiles(fetchedProfiles);
      setCurrentIndex(0);
    } catch (err) {
      console.error('Error loading profiles:', err);
      setLoadError(t('loadProfilesFailed') || 'Could not load profiles. Check your connection and try again.');
    }

    setLoading(false);
  };

  // Navigation-only "swipe": move to the next card.
  // No like/pass/super-like meaning is persisted anywhere — this is now
  // a pure card-deck UX. The `direction` argument is kept only to pick
  // a haptic / overlay so the gesture still feels alive.
  const goToNextProfile = async (direction: 'left' | 'right') => {
    if (swipeInProgressRef.current) return;
    swipeInProgressRef.current = true;

    const currentProfiles = profilesRef.current;

    // Subtle haptic so the gesture has presence; nothing is persisted.
    swipeThreshold();

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

    // Announce for screen readers — compatibility intentionally hidden,
    // free users see a "Find your compatibility" CTA instead.
    const nextProfile = currentProfiles[nextIndex];
    if (nextProfile) {
      announceForAccessibility(
        t('a11y.profileCard', {
          name: nextProfile.name || t('unknown'),
          age: nextProfile.age || '?',
          sign: nextProfile.sun_sign || t('unknown'),
        }) || `${nextProfile.name || ''}, ${nextProfile.age || ''}, ${nextProfile.sun_sign || ''}`
      );
    }

    swipeInProgressRef.current = false;
  };

  // Keep ref updated with latest function
  goToNextProfileRef.current = goToNextProfile;

  const panResponder = useRef(PanResponder.create({
    // Only claim the gesture for horizontal-dominant moves so the inner
    // ScrollView (used to surface MVP profile sections inside the card)
    // can capture vertical scrolls. Threshold of 6px avoids stealing tiny
    // accidental moves from taps on inner buttons.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 6,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 6,
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

  // Navigate to next card via the right-arrow button (no like meaning).
  const handleNext = () => {
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

  // Navigate to previous-looking card via the left-arrow button (no pass meaning).
  const handleSkip = () => {
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

  const handleShare = async () => {
    if (!currentProfile) return;
    buttonPress();
    const message = Platform.select({
      android: `Discovering real connections on AstroDating \u{1F6F0}\nhttps://play.google.com/store/apps/details?id=com.astrodatingapp.mobile`,
      default: `Discovering real connections on AstroDating \u{1F6F0}\nhttps://astrodatingapp.com`,
    });
    try {
      await Share.share({ message, title: 'AstroDating' });
    } catch { /* user cancelled */ }
  };

  // View profile — opens the public profile detail screen with the full
  // MVP block. Synastry/compatibility is a separate route reached via
  // `handleFindCompatibility` (top CTA on the card + bottom CTA on the
  // profile detail screen).
  const handleViewProfile = () => {
    if (!currentProfile?.id) return;
    buttonPress();
    router.push(`/profile/${currentProfile.id}` as any);
  };

  // Free conversation start — no paywall on entering the chat.
  const handleStartConversation = async () => {
    if (!currentProfile?.id || startingChat) return;
    buttonPress();
    setStartingChat(true);
    setActionError(null);
    try {
      const conversationId = await startConversationWith(currentProfile.id);
      router.push(`/chat/${conversationId}`);
    } catch (err: any) {
      console.error('Could not start conversation:', err);
      setActionError(err?.message || t('startConversationFailed') || 'Could not start conversation.');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setStartingChat(false);
    }
  };

  // Premium CTA: takes the user to synastry for the currently viewed profile.
  // Compatibility % is hidden from the card itself.
  const handleFindCompatibility = () => {
    if (!currentProfile?.id) return;
    buttonPress();
    router.push(`/premium-screens/synastry?profileId=${currentProfile.id}` as any);
  };

  // Apple Guideline 1.2: after a block (or report), remove the profile from
  // the deck in place so the blocked user never reappears in this session.
  // Block is server-side persisted by BlockReportMenu via blockUser() →
  // blocked_users table; the next deck load will exclude them via the
  // get_discoverable_profiles RPC. Here we just patch the in-memory deck.
  const removeCurrentProfileFromDeck = useCallback(() => {
    const idx = currentIndexRef.current;
    const current = profilesRef.current;
    if (!current.length) return;

    const next = current.filter((_, i) => i !== idx);
    setProfiles(next);

    if (next.length === 0) {
      setDeckExhausted(true);
      setCurrentIndex(0);
      return;
    }

    // Stay on the same index (which now points to what was the next
    // profile). Clamp if we removed the last card.
    const clamped = Math.min(idx, next.length - 1);
    setCurrentIndex(clamped);

    // Reset swipe animation state so the new card renders cleanly.
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(rotation);
    translateX.value = 0;
    translateY.value = 0;
    rotation.value = 0;
    dragXRef.current = 0;
    setSwipeDirection('none');
    hasReachedThresholdRef.current = false;
  }, [rotation, translateX, translateY]);

  const handleRefresh = () => {
    refreshTrigger();
    setDeckExhausted(false);
    setActionError(null);
    // Q-L1: clear the stale deck first so the list renders a proper empty
    // loading state instead of flashing the previous profiles before the
    // new batch arrives.
    setProfiles([]);
    loadProfiles();
  };

  const handleImageError = (_e: NativeSyntheticEvent<ImageErrorEventData>) => {
    setImageError(true);
  };

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
              {t('deckExhaustedCheckChat') || 'Pick up where you left off in your conversations.'}
            </Text>
            <TouchableOpacity
              style={styles.exhaustedMatchesButton}
              onPress={() => {
                buttonPress();
                router.push('/(tabs)/chat');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.exhaustedMatchesText}>
                {t('goToConversations') || 'Open conversations'}
              </Text>
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
      {/* Action error toast */}
      {actionError && (
        <View style={styles.swipeErrorToast} accessibilityRole="alert">
          <Text style={styles.swipeErrorText}>{actionError}</Text>
          <TouchableOpacity onPress={() => setActionError(null)}>
            <Text style={styles.swipeErrorDismiss}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={{ transform: [{ scale: cardScale }], opacity: cardOpacity }}>
        <View {...panResponder.panHandlers}>
          <ReAnimated.View
            style={[styles.card, animatedCardStyle]}
            accessible={true}
            testID="discover-card"
            accessibilityLabel={t('a11y.profileCard', {
              name: currentProfile.name ?? t('unknown'),
              age: currentProfile.age ?? '?',
              sign: currentProfile.sun_sign ?? t('unknown'),
            }) || `${currentProfile.name ?? ''} ${currentProfile.age ?? ''} ${currentProfile.sun_sign ?? ''}`}
            accessibilityHint={t('a11y.swipeNavigateHint') || 'Swipe to navigate between profiles.'}
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

          {/* Report / Block menu — Apple Guideline 1.2 (UGC safety).
              Discrete shield icon, top-right of the card, with a 44pt hit
              area. Positioned absolutely so it never shifts the primary
              CTAs (prev / view profile / message / next) and has its own
              touch area outside the swipe gesture path. */}
          {user && currentProfile?.id && currentProfile?.name && (
            <View
              style={styles.reportBlockMenuWrap}
              pointerEvents="box-none"
              accessibilityLabel={t('moreOptions') || 'More options'}
            >
              <BlockReportMenu
                userId={user.id}
                targetUserId={currentProfile.id}
                targetUserName={currentProfile.name}
                onBlock={removeCurrentProfileFromDeck}
                onReport={removeCurrentProfileFromDeck}
              />
            </View>
          )}

          {/* Navigation overlays — purely visual feedback, no like/pass meaning */}
          {swipeDirection === 'right' && (
            <Animated.View
              style={[styles.overlay, styles.navOverlayRight]}
              accessibilityLabel={t('nextProfile') || 'Next profile'}
            >
              <Text style={[styles.overlayText, styles.navOverlayText]}>{'→'}</Text>
            </Animated.View>
          )}

          {swipeDirection === 'left' && (
            <Animated.View
              style={[styles.overlay, styles.navOverlayLeft]}
              accessibilityLabel={t('skipProfile') || 'Skip profile'}
            >
              <Text style={[styles.overlayText, styles.navOverlayText]}>{'←'}</Text>
            </Animated.View>
          )}

          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.cardGradient}>
            {/* Compatibility CTA replaces the % badge — premium gated */}
            <TouchableOpacity
              style={styles.compatibilityCta}
              onPress={handleFindCompatibility}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('findYourCompatibility') || 'Find your compatibility'}
            >
              <View style={styles.compatibilityCtaGlyphWrap}>
                <CompatibilityGlyph size={22} color={'#FFFFFF'} />
              </View>
              <Text style={styles.compatibilityCtaText}>
                {t('findYourCompatibility') || 'Find your compatibility'}
              </Text>
            </TouchableOpacity>

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

              {/* MVP profile sections — display-only. Sanitization happens
                  inside the component so we can pass the raw RPC payload. */}
              <ScrollView
                style={styles.mvpScroll}
                contentContainerStyle={styles.mvpScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <ProfilePublicMVPSections
                  relationshipIntent={currentProfile.relationship_intent}
                  personalValues={currentProfile.personal_values}
                  interests={currentProfile.interests}
                  lookingForText={currentProfile.looking_for_text}
                  prompts={currentProfile.prompts}
                  icebreakerQuestion={currentProfile.icebreaker_question}
                  viewerInterests={viewerInterests}
                  onSendIcebreaker={handleStartConversation}
                />
              </ScrollView>

              {/* Action row overlaid inside the card. 4 buttons:
                  ← prev / 👤 view profile / 💬 message / → next */}
              <View style={styles.cardActions} accessibilityRole="toolbar">
                <TouchableOpacity
                  style={styles.cardActionButton}
                  onPress={handleSkip}
                  activeOpacity={0.7}
                  testID="discover-skip-button"
                  {...getButtonA11yProps(
                    t('a11y.passButton', { name: currentProfile.name ?? '' }),
                  )}
                >
                  <Text style={styles.cardActionEmoji}>{'←'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionButton}
                  onPress={handleViewProfile}
                  activeOpacity={0.85}
                  {...getButtonA11yProps(t('viewProfile') || 'View profile')}
                >
                  <Text style={styles.cardActionEmoji}>{'\u{1F464}'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionMessageButton}
                  onPress={handleStartConversation}
                  activeOpacity={0.85}
                  disabled={startingChat}
                  testID="discover-message-button"
                  {...getButtonA11yProps(
                    t('a11y.messageButton', { name: currentProfile.name ?? '' }) || 'Send a message',
                  )}
                >
                  {startingChat ? (
                    <Text style={styles.cardActionMessageText}>{'…'}</Text>
                  ) : (
                    <Text style={styles.cardActionMessageEmoji}>{'\u{1F4AC}'}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionButton}
                  onPress={handleNext}
                  activeOpacity={0.7}
                  testID="discover-next-button"
                  {...getButtonA11yProps(t('a11y.nextButton') || 'Next profile')}
                >
                  <Text style={styles.cardActionEmoji}>{'→'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          </ReAnimated.View>
        </View>
      </Animated.View>

      {/* Action Buttons */}
      {/* Score explainer + premium teaser — below card */}
      {/* Below-card chrome removed. Action buttons (skip / view profile /
          message / next) are now overlaid INSIDE the card via
          styles.cardActions, leaving the full-bleed photo to breathe. */}

      {/* Secondary row removed: the top-of-card "Find your compatibility"
          CTA is the single canonical entry to synastry, and the share
          button was rarely tapped \u2014 both deleted to declutter the action
          surface. handleShare and handleFindCompatibility remain available
          if we want them back somewhere else. */}

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
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 0,
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
    // Edge-to-edge — no border radius, no border. The full-bleed photo
    // becomes the visual frame of the screen.
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: a11yColors.background.primary,
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
  // Inner vertical scroll for the MVP profile sections (intent, values,
  // tags, prompts, icebreaker). Capped so the action row at the bottom
  // of the card stays visible without scrolling.
  mvpScroll: {
    maxHeight: 360,
    marginTop: 8,
  },
  mvpScrollContent: {
    paddingBottom: 8,
  },
  // In-card action row: prev / view profile / message / next.
  // Sits at the bottom of the gradient overlay so the photo stays
  // edge-to-edge. Message button gets coral primary treatment, others
  // are translucent circles to read against the photo.
  cardActions: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardActionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  cardActionEmoji: {
    fontSize: 22,
    color: '#fff',
  },
  cardActionMessageButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  cardActionMessageEmoji: {
    fontSize: 26,
  },
  cardActionMessageText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
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

  // === Conversation-first additions ===
  navOverlayRight: {
    right: 20,
    borderColor: AppTheme.colors.cosmic,
    backgroundColor: 'rgba(124, 108, 255, 0.30)',
    transform: [{ rotate: '15deg' }],
  },
  navOverlayLeft: {
    left: 20,
    borderColor: AppTheme.colors.cosmic,
    backgroundColor: 'rgba(124, 108, 255, 0.30)',
    transform: [{ rotate: '-15deg' }],
  },
  navOverlayText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  // Report/Block trigger — top-right of the card, above the compatibility
  // CTA. 44pt touch target with a subtle translucent chip background so it
  // reads against any photo. zIndex sits above the gradient + overlays.
  reportBlockMenuWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  compatibilityCta: {
    position: 'absolute',
    top: 56,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 108, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    shadowColor: AppTheme.colors.cosmic,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 14,
    elevation: 10,
  },
  compatibilityCtaIcon: {
    fontSize: 14,
  },
  compatibilityCtaGlyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  compatibilityCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  primaryMessageButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.50,
    shadowRadius: 16,
    elevation: 10,
    minWidth: 160,
  },
  primaryMessageIcon: {
    fontSize: 28,
  },
  primaryMessageText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  compatibilityCtaSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: AppTheme.radius.pill,
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.32)',
  },
  compatibilityCtaSecondaryIcon: {
    fontSize: 14,
  },
  compatibilityCtaSecondaryText: {
    color: AppTheme.colors.cosmic,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  shareSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});
