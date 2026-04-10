import React, { useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { MotiView } from 'moti';
import { LoadingState, EmptyState, ErrorState } from '../../components/ScreenStates';
import PlanetGlyph from '../../components/ui/PlanetGlyph';
import WebTabWrapper from '../../components/WebTabWrapper';
import { useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getButtonA11yProps,
  getImageA11yProps,
  formatCompatibilityForA11y,
  a11yColors,
} from '../../utils/accessibility';
import { buttonPress } from '../../services/haptics';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { usePremium } from '../../contexts/PremiumContext';
import { formatRelativeTime } from '../../utils/dateFormatting';
import { DEFAULT_PROFILE_IMAGE, resolveProfileImage } from '../../utils/profileImages';

// --- TYPES ---
type Match = {
  id: string;
  user1_id: string;
  user2_id: string;
  compatibility_score: number;
  created_at: string;
  matched_profile: {
    id: string;
    name: string;
    sun_sign: string;
    moon_sign: string;
    image_url?: string | null;
    photos?: Array<string | null>;
    images?: Array<string | null>;
  };
};

// --- HELPER FUNCTIONS ---
type TranslateFunction = (key: string, options?: Record<string, string | number>) => string;

// --- SUB-COMPONENTS (Moved Outside) ---
const MatchCard = React.memo(function MatchCard({ match, t }: { match: Match; t: TranslateFunction }) {
  const handleMatchPress = () => {
    buttonPress();
    router.push(`/match/${match.matched_profile.id}`);
  };

  const handleChatPress = () => {
    buttonPress();
    router.push(`/chat/${match.id}`);
  };

  const compatibilityScore = match.compatibility_score || 85;

  const getCompatLabel = (score: number) => {
    if (score >= 90) return t('scoreExcellent') || 'Soulmate potential';
    if (score >= 75) return t('scoreGreat') || 'Strong cosmic bond';
    if (score >= 60) return t('scoreGood') || 'Promising alignment';
    return t('scoreFair') || 'Room to grow together';
  };

  // Consider matches within 24 hours as "new"
  const isNew = Date.now() - new Date(match.created_at).getTime() < 24 * 60 * 60 * 1000;

  return (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={handleMatchPress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${match.matched_profile.name}, ${match.matched_profile.sun_sign} sign, ${formatCompatibilityForA11y(compatibilityScore)}, matched ${formatRelativeTime(match.created_at, t)}`}
      accessibilityHint="Double tap to view profile"
    >
      <View style={styles.matchImageWrap}>
        <Image
          source={{ uri: resolveProfileImage(match.matched_profile) }}
          style={styles.matchImage}
          {...getImageA11yProps(t('a11y.profileImage', { name: match.matched_profile.name }))}
        />
        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{t('newMatch') || 'New'}</Text>
          </View>
        )}
      </View>

      <View style={styles.matchInfo}>
        <View style={styles.matchHeader}>
          <Text style={styles.matchName}>{match.matched_profile.name}</Text>
          <View
            style={[
              styles.compatBadge,
              compatibilityScore >= 80 && styles.compatBadgeHigh,
            ]}
            accessibilityLabel={formatCompatibilityForA11y(compatibilityScore)}
          >
            <Text style={[
              styles.compatText,
              compatibilityScore >= 80 && styles.compatTextHigh,
            ]}>{compatibilityScore}%</Text>
          </View>
        </View>

        <View style={styles.matchSignsRow}>
          <Text style={styles.matchSign}>
            <PlanetGlyph symbol="☀️" size={14} textStyle={styles.matchSign} /> {match.matched_profile.sun_sign || '?'}
          </Text>
          {match.matched_profile.moon_sign && (
            <Text style={styles.matchSign}>
              <PlanetGlyph symbol="🌙" size={14} textStyle={styles.matchSign} /> {match.matched_profile.moon_sign}
            </Text>
          )}
        </View>

        <Text style={styles.compatLabel}>{getCompatLabel(compatibilityScore)}</Text>
        <Text style={styles.matchActive}>{formatRelativeTime(match.created_at, t)}</Text>
      </View>

      <View style={styles.matchActions}>
        <TouchableOpacity
          style={styles.chatButton}
          onPress={handleChatPress}
          {...getButtonA11yProps(
            t('a11y.chatTab') + ' ' + match.matched_profile.name,
            'Double tap to start chatting'
          )}
        >
          <Text style={styles.chatButtonText}>💬</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

// --- DAILY COSMIC TIP BANNER ---
const COSMIC_TIPS = [
  'matchesCosmicTipVenus',
  'matchesCosmicTipMoon',
  'matchesCosmicTipMercury',
  'matchesCosmicTipJupiter',
  'matchesCosmicTipMars',
];

const CosmicTipBanner = React.memo(function CosmicTipBanner({ t }: { t: TranslateFunction }) {
  // Rotate tip based on day of year for consistency throughout the day
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const tipKey = COSMIC_TIPS[dayOfYear % COSMIC_TIPS.length];

  return (
    <View style={styles.cosmicTipBanner}>
      <View style={styles.cosmicTipHeader}>
        <Text style={styles.cosmicTipIcon}>{'\u2728'}</Text>
        <Text style={styles.cosmicTipTitle}>{t('matchesCosmicTip') || "Today's Cosmic Energy"}</Text>
      </View>
      <Text style={styles.cosmicTipText}>{t(tipKey)}</Text>
    </View>
  );
});

// --- PREMIUM LIKES BANNER ---
const LikesBanner = React.memo(function LikesBanner({ t }: { t: TranslateFunction }) {
  return (
    <TouchableOpacity
      style={styles.likesBanner}
      onPress={() => {
        buttonPress();
        router.push('/premium-screens/plans' as any);
      }}
      activeOpacity={0.85}
    >
      <View style={styles.likesBannerLeft}>
        <View style={styles.likesBannerAvatarStack}>
          <View style={[styles.likesBannerAvatar, { backgroundColor: 'rgba(232,93,117,0.25)' }]}>
            <Text style={styles.likesBannerAvatarText}>{'?'}</Text>
          </View>
          <View style={[styles.likesBannerAvatar, styles.likesBannerAvatarOverlap, { backgroundColor: 'rgba(124,108,255,0.25)' }]}>
            <Text style={styles.likesBannerAvatarText}>{'?'}</Text>
          </View>
        </View>
        <View style={styles.likesBannerTextWrap}>
          <Text style={styles.likesBannerTitle}>
            {t('seeWhoLikes') || 'See Who Likes You'}
          </Text>
          <Text style={styles.likesBannerSubtitle}>
            {t('likesHiddenHint') || 'People have liked your profile'}
          </Text>
        </View>
      </View>
      <View style={styles.likesBannerCta}>
        <Text style={styles.likesBannerCtaText}>
          {t('reveal') || 'Reveal'}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// --- MAIN SCREEN ---
export default function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const { tier } = usePremium();
  const isFreeUser = tier === 'free';
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('matches'),
      headerTitle: `💫 ${t('yourMatches')}`,
    });
  }, [navigation, language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      loadMatches();
    } else if (!authLoading) {
      // Auth finished but no user - stop loading
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user, authLoading]);

  const loadMatches = async () => {
    // 1. Safety check to ensure user exists before query
    if (!user) return;

    setLoading(true);
    setLoadError(null);

    // Get matches where user is either user1 or user2
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      // Use optional chaining safely in the string interpolation
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading matches:', error);
      setLoadError(t('loadingFailed') || 'Failed to load matches. Please try again.');
      setLoading(false);
      return;
    }

    // For each match, get the other person's profile
    const matchesWithProfiles = await Promise.all(
      (data || []).map(async (match) => {
        // Safe check for ID comparison
        const otherUserId = match.user1_id === user.id ? match.user2_id : match.user1_id;

        const { data: profile } = await supabase
          .from('discoverable_profiles')
          .select('*')
          .eq('id', otherUserId)
          .maybeSingle();

        return {
          ...match,
          matched_profile: profile || {
            id: otherUserId,
            name: t('unknown'),
            sun_sign: '?',
            moon_sign: '?',
            image_url: DEFAULT_PROFILE_IMAGE,
          },
        };
      })
    );

    setMatches(matchesWithProfiles as Match[]);
    setLoading(false);
  };

  // Show loading while auth is initializing OR while loading matches data
  if (authLoading || loading) {
    return (
      <WebTabWrapper>
        <LoadingState
          message={t('loadingMatches')}
          accessibilityLabel={t('loadingMatches')}
          testID="matches-loading"
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
          onRetry={loadMatches}
          retryLabel={t('refresh') || 'Try Again'}
          testID="matches-error"
        />
      </WebTabWrapper>
    );
  }

  return (
    <WebTabWrapper>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        {matches.length > 0 ? (
          <FlatList
            data={matches}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MatchCard match={item} t={t} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={10}
            updateCellsBatchingPeriod={50}
            accessibilityLabel={`${matches.length} matches`}
            ListHeaderComponent={
              <View>
                <View style={styles.header} accessibilityRole="header">
                  <View style={{ height: insets.top + 8 }} />
                  <Text style={styles.headerTitle}>{t('yourMatches')}</Text>
                  <Text style={styles.headerSubtitle}>
                    {matches.length === 1
                      ? t('matchCount', { count: matches.length })
                      : t('matchesCount', { count: matches.length })}
                  </Text>
                </View>
                {isFreeUser && <LikesBanner t={t} />}
                <CosmicTipBanner t={t} />
              </View>
            }
            ListFooterComponent={
              <View style={styles.listFooter}>
                <Text style={styles.listFooterText}>
                  {'\u{2728}'} {t('deckExhaustedCheckMatches') || 'Keep swiping to find more cosmic connections'}
                </Text>
              </View>
            }
          />
        ) : (
          <EmptyState
            emoji={'\u{1F4AB}'}
            title={t('emptyMatchesTitle') || t('noMatchesYet')}
            subtitle={t('emptyMatchesSubtitle') || t('keepExploring')}
            hint={t('emptyMatchesHint')}
            actionLabel={t('emptyMatchesCta') || t('startDiscovering')}
            onAction={() => {
              buttonPress();
              router.push('/(tabs)/discover');
            }}
            testID="matches-empty"
          />
        )}
      </LinearGradient>
    </WebTabWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: a11yColors.text.secondary,
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: a11yColors.text.primary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: a11yColors.text.secondary,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  matchCard: {
    flexDirection: 'row',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    marginBottom: 12,
    minHeight: 84,
  },
  matchImageWrap: {
    position: 'relative',
    marginRight: 12,
  },
  matchImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  newBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: AppTheme.colors.panel,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  matchInfo: {
    flex: 1,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  matchName: {
    fontSize: 18,
    fontWeight: '600',
    color: a11yColors.text.primary,
  },
  compatBadge: {
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  compatBadgeHigh: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  compatText: {
    color: AppTheme.colors.coral,
    fontSize: 12,
    fontWeight: '600',
  },
  compatTextHigh: {
    color: '#22c55e',
  },
  compatLabel: {
    fontSize: 11,
    color: a11yColors.text.muted,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  matchSignsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  matchSign: {
    fontSize: 13,
    color: a11yColors.text.secondary,
    marginBottom: 2,
  },
  matchActive: {
    fontSize: 12,
    color: a11yColors.text.muted,
  },
  matchActions: {
    paddingLeft: 12,
  },
  chatButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatButtonText: {
    fontSize: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
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
    color: a11yColors.text.primary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: a11yColors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  discoverButton: {
    backgroundColor: '#e94560',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  discoverButtonText: {
    color: a11yColors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  likesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(232, 93, 117, 0.10)',
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    marginHorizontal: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.20)',
  },
  likesBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  likesBannerAvatarStack: {
    flexDirection: 'row',
    width: 52,
  },
  likesBannerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: AppTheme.colors.canvas,
  },
  likesBannerAvatarOverlap: {
    marginLeft: -16,
  },
  likesBannerAvatarText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  likesBannerTextWrap: {
    flex: 1,
  },
  likesBannerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: a11yColors.text.primary,
    marginBottom: 2,
  },
  likesBannerSubtitle: {
    fontSize: 12,
    color: a11yColors.text.secondary,
  },
  likesBannerCta: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: AppTheme.radius.pill,
  },
  likesBannerCtaText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  cosmicTipBanner: {
    marginHorizontal: 4,
    marginBottom: 12,
    backgroundColor: 'rgba(124, 108, 255, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.16)',
  },
  cosmicTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cosmicTipIcon: {
    fontSize: 14,
  },
  cosmicTipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: a11yColors.text.primary,
    letterSpacing: 0.3,
  },
  cosmicTipText: {
    fontSize: 13,
    color: a11yColors.text.secondary,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  listFooter: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  listFooterText: {
    fontSize: 13,
    color: a11yColors.text.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
