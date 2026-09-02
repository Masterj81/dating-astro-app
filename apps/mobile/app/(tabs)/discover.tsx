import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, LoadingState, EmptyState } from '../../components/ScreenStates';
import { isRisingTrustworthy } from '@astro/shared/astrology';
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
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  CONNECTION_INTENTIONS,
  DEFAULT_CONNECTION_INTENTIONS,
  sanitizeConnectionIntentions,
  sanitizeLifestyleTags,
  type ConnectionIntention,
} from '../../data/profile-fields';
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
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';

const { width, height } = Dimensions.get('window');
// Full-bleed card. Action buttons are overlaid INSIDE the card at the
// bottom (previous / view profile / message / next), so we only reserve
// space for the tab bar + a thin safe-area margin. ~100px is enough on
// Samsung devices with rounded corners.
const CARD_WIDTH = width;
const CARD_HEIGHT = Math.max(height - 100, 600);
// Distance the card must be dragged before a release pages to the
// adjacent profile. INTERNAL constant — paging only, no like/pass verdict.
const PAGE_THRESHOLD = 100;

type Profile = {
  id: string;
  name: string;
  age: number;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  bio: string;
  image_url?: string | null;
  photos?: (string | null)[];
  images?: (string | null)[];
  is_verified?: boolean;
  has_voice_intro?: boolean;
  voice_intro_url?: string;
  // MVP profile additions (surfaced via get_discoverable_profiles since
  // 20260430000002). All optional / nullable -- legacy profiles may not
  // have any of these.
  relationship_intent?: string | null;
  personal_values?: string[] | null;
  interests?: string[] | null;
  looking_for_text?: string | null;
  prompts?: unknown;
  icebreaker_question?: string | null;
  // Macro connection intentions surfaced by the extended
  // get_discoverable_profiles RPC (migration 20260601000001). Optional /
  // nullable for legacy rows.
  connection_intentions?: string[] | null;
};

// Filter values the segmented control above the card accepts. 'all' bypasses
// the RPC filter (default behavior). The other three map straight to the
// connection_intentions vocabulary.
type DiscoverIntentionFilter = 'all' | ConnectionIntention;

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [deckExhausted, setDeckExhausted] = useState(false);
  // Discrete drag-direction state, used only to show a neutral paging hint
  // while the card is dragged. `dragDirection` is an INTERNAL name -- the
  // horizontal gesture is navigation between profiles (previous / next).
  // It carries no like / pass / match meaning and nothing is persisted.
  const [dragDirection, setDragDirection] = useState<'none' | 'left' | 'right'>('none');
  const dragXRef = useRef(0);
  const hasReachedThresholdRef = useRef(false);
  // One horizontal offset drives a calm slide between profiles. There is
  // deliberately no card rotation and no vertical throw -- the card pages
  // sideways like a carousel, it is not a swipe-to-decide card deck.
  const translateX = useSharedValue(0);
  const { t, language } = useLanguage();
  const navigation = useNavigation();
  const reduceMotion = useReduceMotion();
  const navInProgressRef = useRef(false);
  const [startingChat, setStartingChat] = useState(false);
  // Viewer's own lifestyle tags -- used to highlight shared tags on the
  // public card. Fetched once on mount via get_my_full_profile (the same
  // RPC the edit screen uses). Empty array on failure / no tags.
  const [viewerInterests, setViewerInterests] = useState<string[]>([]);
  // Macro intention filter for the deck. 'all' is the default and matches
  // the historical behavior of the discover RPC. Other values trim the deck
  // to profiles whose connection_intentions overlap the selected value.
  const [intentionFilter, setIntentionFilter] = useState<DiscoverIntentionFilter>('all');

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

  const goToProfileRef = useRef<(targetIndex: number) => void>(() => {});

  const { user } = useAuth();

  // Compute card eagerly (before any early returns) to respect Rules of Hooks
  const currentProfile = profiles.length > 0 && currentIndex < profiles.length
    ? profiles[currentIndex]
    : null;
  const currentProfileImage = resolveProfileImage(currentProfile);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount + filter change
  }, [user, reduceMotion, intentionFilter]);

  // Fetch the viewer's own lifestyle tags so the card can highlight
  // shared tags on profiles they discover. Read-only one-shot -- failure
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
        // gender preference matching (bidirectional) -- see migration
        // 20260428000001_fix_discover_gender_filter.sql. Falling back to a
        // raw `discoverable_profiles` view query would silently leak profiles
        // that do not match the viewer's looking_for, which is exactly the
        // bug we are fixing. So: an RPC error is a hard failure, and an
        // empty deck is a legitimate "no more profiles for this viewer".
        if (!user) {
          return [];
        }

        // Pass the macro intention filter through as p_intentions when
        // a specific filter is selected. The RPC accepts NULL (no filter)
        // and falls back to historical behavior in that case, so we never
        // send an empty array.
        const intentionsArg =
          intentionFilter === 'all' ? null : [intentionFilter];

        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'get_discoverable_profiles',
          {
            p_user_id: user.id,
            p_limit: 50,
            p_intentions: intentionsArg,
          },
        );

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

  // Core profile navigation -- pages the browser to `targetIndex`.
  // Discover is a relationship-profile browser: this is navigation only.
  // There is no like / pass verdict and nothing is persisted. Paging past
  // the last profile shows the end-of-deck state; paging before the first
  // profile is a no-op (the card settles back into place).
  const goToProfile = async (targetIndex: number) => {
    if (navInProgressRef.current) return;
    navInProgressRef.current = true;

    const currentProfiles = profilesRef.current;

    // Subtle haptic so paging has presence; nothing is persisted.
    swipeThreshold();

    cancelAnimation(translateX);
    dragXRef.current = 0;
    setDragDirection('none');
    hasReachedThresholdRef.current = false;

    // Before the first profile -- settle back, there is nowhere to go.
    if (targetIndex < 0) {
      translateX.value = withSpring(0);
      navInProgressRef.current = false;
      return;
    }

    // Past the last profile -- show the end-of-deck state.
    if (targetIndex >= currentProfiles.length) {
      setDeckExhausted(true);
      translateX.value = 0;
      navInProgressRef.current = false;
      return;
    }

    setCurrentIndex(targetIndex);
    translateX.value = 0;

    // Announce for screen readers -- compatibility is intentionally hidden,
    // free users see a "See synastry" CTA instead.
    const nextProfile = currentProfiles[targetIndex];
    if (nextProfile) {
      announceForAccessibility(
        t('a11y.profileCard', {
          name: nextProfile.name || t('unknown'),
          age: nextProfile.age || '?',
          sign: nextProfile.sun_sign || t('unknown'),
        }) || `${nextProfile.name || ''}, ${nextProfile.age || ''}, ${nextProfile.sun_sign || ''}`
      );
    }

    navInProgressRef.current = false;
  };

  // Keep the ref updated with the latest navigation function.
  goToProfileRef.current = goToProfile;

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
      // Horizontal slide only -- no rotation, no vertical drift. The card
      // pages sideways like a carousel; it is not thrown like a swipe card.
      translateX.value = gestureState.dx;
      dragXRef.current = gestureState.dx;
      // Update the neutral paging hint once past a 30px threshold.
      const newDir = gestureState.dx > 30 ? 'right' : gestureState.dx < -30 ? 'left' : 'none';
      setDragDirection(prev => prev !== newDir ? newDir : prev);

      // Subtle haptic when the paging threshold is crossed.
      if (Math.abs(gestureState.dx) > PAGE_THRESHOLD && !hasReachedThresholdRef.current) {
        hasReachedThresholdRef.current = true;
        swipeThreshold();
      } else if (Math.abs(gestureState.dx) <= PAGE_THRESHOLD && hasReachedThresholdRef.current) {
        hasReachedThresholdRef.current = false;
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      hasReachedThresholdRef.current = false;

      if (Math.abs(gestureState.dx) > PAGE_THRESHOLD) {
        // Carousel paging: dragging right reveals the PREVIOUS profile,
        // dragging left reveals the NEXT one. Pure navigation -- no
        // like / pass, nothing persisted.
        const goingBack = gestureState.dx > 0;
        const atFirst = currentIndexRef.current <= 0;
        if (goingBack && atFirst) {
          // No previous profile -- settle the card back into place.
          translateX.value = withSpring(0);
          dragXRef.current = 0;
          setDragDirection('none');
          return;
        }
        const targetX = goingBack ? width : -width;
        const targetIndex = currentIndexRef.current + (goingBack ? -1 : 1);
        translateX.value = withTiming(targetX, { duration: 260 });
        setTimeout(() => goToProfileRef.current(targetIndex), 260);
      } else {
        translateX.value = withSpring(0);
        dragXRef.current = 0;
        setDragDirection('none');
      }
    },
  })).current;

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Advance to the next profile via the Next button. Plain list navigation
  // -- it carries no "like" meaning and persists nothing.
  const handleNext = () => {
    if (navInProgressRef.current || !currentProfile) return;
    buttonPress();
    dragXRef.current = -150;

    if (reduceMotion) {
      goToProfile(currentIndexRef.current + 1);
    } else {
      translateX.value = withTiming(-width, { duration: 260 });
      setTimeout(() => goToProfile(currentIndexRef.current + 1), 260);
    }
  };

  // Go back to the previous profile via the Previous button. No-op on the
  // first profile. This makes Discover a true two-way profile browser.
  const handlePrevious = () => {
    if (navInProgressRef.current || !currentProfile) return;
    if (currentIndexRef.current <= 0) return;
    buttonPress();
    dragXRef.current = 150;

    if (reduceMotion) {
      goToProfile(currentIndexRef.current - 1);
    } else {
      translateX.value = withTiming(width, { duration: 260 });
      setTimeout(() => goToProfile(currentIndexRef.current - 1), 260);
    }
  };

  // View profile -- opens the public profile detail screen with the full
  // MVP block. Synastry/compatibility is a separate route reached via
  // `handleFindCompatibility` (top CTA on the card + bottom CTA on the
  // profile detail screen).
  const handleViewProfile = () => {
    if (!currentProfile?.id) return;
    buttonPress();
    router.push(`/profile/${currentProfile.id}` as any);
  };

  // Free conversation start -- no paywall on entering the chat.
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

  // Synastry CTA: takes the user to the synastry insight for the currently
  // viewed profile. The compatibility % is intentionally hidden from the
  // card itself -- the chart context is reviewed before any conversation.
  const handleFindCompatibility = () => {
    if (!currentProfile?.id) return;
    buttonPress();
    router.push(`/premium-screens/synastry?profileId=${currentProfile.id}` as any);
  };

  // Apple Guideline 1.2: after a block (or report), remove the profile from
  // the deck in place so the blocked user never reappears in this session.
  // Block is server-side persisted by BlockReportMenu via blockUser() ->
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

    // Reset the paging animation state so the new card renders cleanly.
    cancelAnimation(translateX);
    translateX.value = 0;
    dragXRef.current = 0;
    setDragDirection('none');
    hasReachedThresholdRef.current = false;
  }, [translateX]);

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
    t('loadingTip1') || 'Aligning the planets…',
    t('loadingTip2') || 'Reading the cosmic map…',
    t('loadingTip3') || 'Consulting the stars…',
    t('loadingTip4') || 'Charting your constellation…',
    t('loadingTip5') || 'Syncing with the cosmos…',
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
    // P0-4 of docs/retention-day2-audit-2026-08.md — the filter trap.
    //
    // This early return renders ABOVE the intention pills, so when a filter
    // empties the deck the pills are off-screen and the only control left is
    // "Refresh", which re-runs the same query with the same filter. Every seed
    // profile carries connection_intentions = ['love'], so tapping Friendship
    // or Business is a guaranteed empty deck with no way back short of killing
    // the app.
    //
    // Offer the way out instead: when a filter is active, the action clears it
    // rather than retrying a query we know returns nothing.
    const filtered = intentionFilter !== 'all';

    return (
      <WebTabWrapper>
        <EmptyState
          title={
            filtered
              ? t('discoverNoneForIntention') || 'Nobody with this intention yet'
              : t('noMoreProfiles')
          }
          subtitle={
            filtered
              ? t('discoverTryAllIntentions') ||
                'Clear the filter to see everyone who is open to connecting.'
              : t('checkBackLater')
          }
          actionLabel={
            filtered
              ? t('discoverShowAllIntentions') || 'Show all intentions'
              : t('refresh')
          }
          onAction={filtered ? () => setIntentionFilter('all') : handleRefresh}
          testID="discover-empty"
        />
      </WebTabWrapper>
    );
  }

  // End-of-deck state: the viewer has paged through every profile.
  if (deckExhausted || !currentProfile) {
    return (
      <WebTabWrapper>
        <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
          <View style={styles.exhaustedContainer} testID="discover-exhausted">
            <Text style={styles.exhaustedEmoji}>{'\u{1F30C}'}</Text>
            <Text style={styles.exhaustedTitle}>
              {t('profilesExhausted') || 'No more profiles right now'}
            </Text>
            <Text style={styles.exhaustedSubtitle}>
              {t('profilesExhaustedSub') || 'Check back soon or adjust your discovery preferences.'}
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
            {/* Daily insight re-engagement hook */}
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

  const filterOptions: { key: DiscoverIntentionFilter; labelKey: string }[] = [
    { key: 'all',        labelKey: 'discoverFilterIntention_all' },
    { key: 'love',       labelKey: 'discoverFilterIntention_love' },
    { key: 'friendship', labelKey: 'discoverFilterIntention_friendship' },
    { key: 'business',   labelKey: 'discoverFilterIntention_business' },
  ];

  return (
    <WebTabWrapper>
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      {/* Action error toast */}
      {actionError && (
        <View style={styles.actionErrorToast} accessibilityRole="alert">
          <Text style={styles.actionErrorText}>{actionError}</Text>
          <TouchableOpacity onPress={() => setActionError(null)}>
            <Text style={styles.actionErrorDismiss}>{'✕'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Macro intention filter — segmented control. 'All' is the default
          and keeps the original deck behavior. */}
      <View style={[styles.intentionFilterRow, { paddingTop: insets.top + 8 }]} accessibilityRole="tablist">
        {filterOptions.map((opt) => {
          const active = intentionFilter === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.intentionFilterPill,
                active && styles.intentionFilterPillActive,
              ]}
              onPress={() => {
                if (intentionFilter !== opt.key) {
                  buttonPress();
                  setIntentionFilter(opt.key);
                }
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.intentionFilterPillText,
                  active && styles.intentionFilterPillTextActive,
                ]}
              >
                {t(opt.labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
            accessibilityHint={t('a11y.swipeNavigateHint') || 'Browse profiles with gestures or buttons.'}
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

          {/* Intent banner -- frames Discover as a calm, intentional
              relationship-profile browser rather than a swipe deck.
              Purely informational, no interaction. */}
          <View style={styles.intentBanner} pointerEvents="none">
            <Text style={styles.intentBannerStar}>{'✦'}</Text>
            <Text style={styles.intentBannerText}>
              {t('discoverBrowseWithIntention') || 'Browse with intention'}
            </Text>
          </View>

          {/* Report / Block menu -- Apple Guideline 1.2 (UGC safety).
              Discrete shield icon, top-right of the card, with a 44pt hit
              area. Positioned absolutely so it never shifts the primary
              CTAs (previous / view profile / message / next) and has its
              own touch area outside the paging gesture path. */}
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

          {/* Paging hint overlays -- neutral navigation feedback only. No
              like/pass meaning, no red/green, no match. Dragging right
              pages to the previous profile; dragging left pages to the
              next profile. */}
          {dragDirection === 'right' && (
            <Animated.View
              style={[styles.overlay, styles.navOverlayLeft]}
              accessibilityLabel={t('a11y.previousButton') || 'Previous profile'}
            >
              <Text style={[styles.overlayText, styles.navOverlayText]}>{'‹'}</Text>
            </Animated.View>
          )}

          {dragDirection === 'left' && (
            <Animated.View
              style={[styles.overlay, styles.navOverlayRight]}
              accessibilityLabel={t('a11y.nextButton') || 'Next profile'}
            >
              <Text style={[styles.overlayText, styles.navOverlayText]}>{'›'}</Text>
            </Animated.View>
          )}

          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.cardGradient}>
            {/* Synastry CTA -- the chart context entry point. Replaces the
                old compatibility % badge: the synastry insight is reviewed
                before any conversation, the score is never shown on the card. */}
            <TouchableOpacity
              style={styles.compatibilityCta}
              onPress={handleFindCompatibility}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('discoverSeeSynastry') || 'See synastry'}
            >
              <View style={styles.compatibilityCtaGlyphWrap}>
                <CompatibilityGlyph size={22} color={'#FFFFFF'} />
              </View>
              <Text style={styles.compatibilityCtaText}>
                {t('discoverSeeSynastry') || 'See synastry'}
              </Text>
            </TouchableOpacity>

            <View style={styles.cardContent}>
              <View style={styles.nameRow}>
                <Text style={styles.name} accessibilityRole="header">
                  {currentProfile.name ?? t('unknown')}, {currentProfile.age ?? '?'}
                </Text>
                {currentProfile.is_verified && <VerifiedBadge size="small" />}
              </View>

              {/* Macro connection intentions chip cluster — rendered only
                  when the profile signals more than the default 'love' so
                  Love-only profiles keep the existing look intact. */}
              {(() => {
                const intentions = sanitizeConnectionIntentions(currentProfile.connection_intentions);
                const isDefaultOnly =
                  intentions.length === DEFAULT_CONNECTION_INTENTIONS.length &&
                  intentions.every((k) => DEFAULT_CONNECTION_INTENTIONS.includes(k));
                if (isDefaultOnly) return null;
                return (
                  <View style={styles.intentionChipCluster}>
                    <Text style={styles.intentionChipPrefix}>
                      {t('discoverChipOpenTo') || 'Open to:'}
                    </Text>
                    {intentions.map((key) => {
                      const def = CONNECTION_INTENTIONS.find((i) => i.key === key);
                      if (!def) return null;
                      return (
                        <View key={key} style={styles.intentionChip}>
                          <Text style={styles.intentionChipText}>{t(def.labelKey)}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Chart context -- the birth-chart signal the viewer reviews
                  before deciding to start a conversation. */}
              <Text style={styles.chartContextLabel}>
                {'✧'} {t('discoverChartContext') || 'Chart context'}
              </Text>

              {/* The screen reader hears exactly what is on screen: naming a
                  rising sign here while the pill is hidden would leak the
                  unverified value to the one audience that cannot see it is
                  absent. */}
              <View
                style={styles.signsRow}
                accessibilityLabel={[
                  `Sun sign: ${currentProfile.sun_sign ?? 'unknown'}`,
                  `Moon sign: ${currentProfile.moon_sign ?? 'unknown'}`,
                  ...(isRisingTrustworthy({ storedRisingSign: currentProfile.rising_sign })
                    ? [`Rising sign: ${currentProfile.rising_sign}`]
                    : []),
                ].join(', ')}
              >
                <View style={styles.signPill}>
                  <Text style={styles.signEmoji}>{'☀️'}</Text>
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
                {/* Rising is shown only when it can be trusted, and on this
                    screen it never can: `get_discoverable_profiles` returns
                    neither `birth_time` nor `birth_chart`, so nothing here can
                    distinguish a real Aries ascendant from one the old mobile
                    fallback invented for an account with no birth time.
                    `isRisingTrustworthy` therefore returns false on a bare
                    sign, and the pill disappears rather than asserting a fact
                    about a stranger that JUNO cannot back up.

                    Accounts written by the fixed engine have
                    `rising_sign = NULL`, so the pill would hide anyway. This
                    also covers the poisoned rows still in the database, with
                    no migration — see docs/rising-sign-integrity-2026-08.md.
                    Once those rows are cleaned up and the RPC carries a trust
                    signal, this call starts returning real ascendants again
                    with no change here. */}
                {isRisingTrustworthy({ storedRisingSign: currentProfile.rising_sign }) ? (
                  <View style={styles.signPill}>
                    <Text style={styles.signEmoji}>{'⬆️'}</Text>
                    <View>
                      <Text style={styles.signText}>{currentProfile.rising_sign}</Text>
                      <Text style={styles.signSubtext}>{t('risingSignExplainer')}</Text>
                    </View>
                  </View>
                ) : null}
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

              {/* MVP profile sections -- display-only. Sanitization happens
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

              {/* In-card action row -- a relationship-profile browser, not a
                  swipe deck: Previous / View profile / Message / Next. The
                  arrows page the browser; they carry no like/pass meaning. */}
              <View style={styles.cardActions} accessibilityRole="toolbar">
                <TouchableOpacity
                  style={[
                    styles.cardActionButton,
                    currentIndex === 0 && styles.cardActionButtonDisabled,
                  ]}
                  onPress={handlePrevious}
                  disabled={currentIndex === 0}
                  activeOpacity={0.7}
                  testID="discover-prev-button"
                  {...getButtonA11yProps(t('a11y.previousButton') || 'Previous profile')}
                >
                  <Text style={styles.cardActionEmoji}>{'‹'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionButton}
                  onPress={handleViewProfile}
                  activeOpacity={0.85}
                  testID="discover-view-profile-button"
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
                    <>
                      <Text style={styles.cardActionMessageEmoji}>{'\u{1F4AC}'}</Text>
                      <Text style={styles.cardActionMessageText}>
                        {t('discoverMessageAction') || 'Message'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionButton}
                  onPress={handleNext}
                  activeOpacity={0.7}
                  testID="discover-next-button"
                  {...getButtonA11yProps(t('a11y.nextButton') || 'Next profile')}
                >
                  <Text style={styles.cardActionEmoji}>{'›'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
          </ReAnimated.View>
        </View>
      </Animated.View>

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
    paddingBottom: 0,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    // Edge-to-edge -- no border radius, no border. The full-bleed photo
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
  // Paging hint overlay -- a single neutral chevron shown while the card
  // is dragged. No like/pass colour, no rotation, no match meaning.
  overlay: {
    position: 'absolute',
    top: 50,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 4,
  },
  overlayText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  navOverlayRight: {
    right: 20,
    borderColor: AppTheme.colors.cosmic,
    backgroundColor: 'rgba(124, 108, 255, 0.30)',
  },
  navOverlayLeft: {
    left: 20,
    borderColor: AppTheme.colors.cosmic,
    backgroundColor: 'rgba(124, 108, 255, 0.30)',
  },
  navOverlayText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  // Intent banner -- top-left pill, frames Discover as an intentional
  // browser. Sober, no interaction.
  intentBanner: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 9, 11, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(231, 233, 238, 0.18)',
    zIndex: 20,
  },
  intentBannerStar: {
    fontSize: 11,
    color: AppTheme.colors.gold,
  },
  intentBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  // "Chart context" label above the sign pills -- makes the synastry /
  // birth-chart framing explicit on the card.
  chartContextLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: -4,
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
  signSubtext: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 1,
    letterSpacing: 0.3,
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
  // In-card action row: previous / view profile / message / next.
  // Sits at the bottom of the gradient overlay so the photo stays
  // edge-to-edge. The Message button gets coral primary treatment with a
  // text label; the others are translucent controls.
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
  cardActionButtonDisabled: {
    opacity: 0.35,
  },
  cardActionEmoji: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '700',
  },
  // Message button -- a labelled pill, not an icon-only circle. The text
  // label is the clearest signal that the core action is a conversation.
  cardActionMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  cardActionMessageEmoji: {
    fontSize: 20,
  },
  cardActionMessageText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  counter: {
    marginTop: 12,
    color: a11yColors.text.muted,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  // Action error toast (e.g. a conversation failed to start).
  actionErrorToast: {
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
  actionErrorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  actionErrorDismiss: {
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
  // Report/Block trigger -- top-right of the card, above the synastry
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

  // Macro intention filter (segmented control at the top of Discover).
  intentionFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  intentionFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  intentionFilterPillActive: {
    backgroundColor: 'rgba(232, 93, 117, 0.18)',
    borderColor: 'rgba(232, 93, 117, 0.55)',
  },
  intentionFilterPillText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '600',
  },
  intentionFilterPillTextActive: {
    color: '#fff4f6',
  },

  // Connection intentions chip cluster (only renders when profile signals
  // more than the default 'love' set).
  intentionChipCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  intentionChipPrefix: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  intentionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  intentionChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
