import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  calculateSunCompatibility,
  calculateZoneScores,
  factorInfluence,
  getElement,
  getScoreBand,
  getWhyFactors,
  normalizeSign,
  pickPlanetSign,
  shouldShowWatchFor,
  type FactorInfluence,
  type SynastryElement,
  type SynastryPlacements,
  type SynastryScoreBand,
  type WhyFactor,
  type ZoneKey,
  type ZoneScore,
} from '../../lib/synastry';
import { supabase } from '../../services/supabase';

// Synastry V2 — Conversation map, not prediction.
//
// Mirrors apps/web/src/components/SynastryOverview.tsx + apps/web/src/lib/synastry.ts.
// Pure scoring lives in apps/mobile/lib/synastry.ts so web + mobile stay
// in sync without cross-app imports.
//
// V2 removes:
//   - Fake per-area zone math (faked offsets off a single total score)
//   - Hardcoded aspects independent of real placements
//   - Decorative emojis (sun/moon glyphs/coral hearts as primary UI)
//   - Predictive copy ("exceptional cosmic alignment", "stand the test of time")
//   - calculateSynastry / buildSynastryCategories / buildSynastryAspects paths
//
// V2 ships, top to bottom:
//   1. Hero — score (0–100), band label, dim disclaimer
//   2. Why this score — 3 element-pairing factors
//   3. Compatibility dimensions — Emotional / Communication / Attraction / Stability
//      derived from real Moon, Mercury, Venus/Mars cross, Saturn placements
//      (with Sun fallback marker when a planet is missing)
//   4. How to talk — 2–3 prompts keyed by target's Mercury / Moon / Venus element
//   5. Watch for — visible only when band is mixed / growth / different
//   6. Disclaimer card — "Conversation map, not prediction."
//
// Gating, route, candidate picker, deep-link via ?profileId= (with
// ?matchId= back-compat) are preserved.

type CandidateProfile = {
  id: string;
  name: string | null;
  age: number | null;
  sun_sign: string | null;
  moon_sign: string | null;
  rising_sign: string | null;
  image_url: string | null;
  images: string[] | null;
};

type SynastryProfile = SynastryPlacements & {
  id: string;
  name: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

const ZONE_KEYS: ZoneKey[] = ['emotional', 'communication', 'attraction', 'stability'];

const INFLUENCE_COLORS: Record<FactorInfluence, { bg: string; border: string }> = {
  harmonious: { bg: 'rgba(74, 222, 128, 0.14)', border: 'rgba(74, 222, 128, 0.36)' },
  neutral: { bg: 'rgba(251, 191, 36, 0.14)', border: 'rgba(251, 191, 36, 0.36)' },
  challenging: { bg: 'rgba(248, 113, 113, 0.14)', border: 'rgba(248, 113, 113, 0.36)' },
};

type SynastryContentProps = {
  onLoadingChange?: (loading: boolean) => void;
};

function SynastryScreenContent({ onLoadingChange }: SynastryContentProps) {
  // Canonical param is profileId. matchId is kept as a back-compat fallback
  // so old deep links (notifications, share sheets) keep resolving.
  const { profileId, matchId } = useLocalSearchParams<{ profileId?: string; matchId?: string }>();
  const initialTargetId = useMemo(() => {
    const pid = Array.isArray(profileId) ? profileId[0] : profileId;
    if (typeof pid === 'string' && pid.length > 0) return pid;
    const mid = Array.isArray(matchId) ? matchId[0] : matchId;
    if (typeof mid === 'string' && mid.length > 0) return mid;
    return null;
  }, [profileId, matchId]);

  const [loading, setLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<SynastryProfile | null>(null);
  const [matchProfile, setMatchProfile] = useState<SynastryProfile | null>(null);
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialTargetId);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, fadeAnim]);

  // Load a single target's profile + chart via the same get-profile-chart
  // edge function the web surface uses. Returns the resolved profile so
  // deep-link prepend logic can reuse it.
  const loadTargetChart = useCallback(
    async (targetUserId: string): Promise<SynastryProfile> => {
      const { data: payload, error: matchErr } = await supabase.functions.invoke(
        'get-profile-chart',
        { body: { targetUserId } },
      );
      if (matchErr) throw matchErr;

      type ChartPlanet = { sign?: string | null };
      type ChartPlanets = Record<'mercury' | 'venus' | 'mars' | 'saturn', ChartPlanet | undefined>;
      const response = payload as
        | {
            success?: boolean;
            profile?: {
              id: string;
              name?: string | null;
              sun_sign?: string | null;
              moon_sign?: string | null;
              rising_sign?: string | null;
              image_url?: string | null;
              images?: string[] | null;
            };
            chart?: { planets?: ChartPlanets } | null;
            error?: string;
          }
        | null;

      if (!response?.success || !response.profile) {
        throw new Error(response?.error || t('matchDataMissing') || 'Profile data not found');
      }

      const p = response.profile;
      const c = response.chart;
      const profile: SynastryProfile = {
        id: p.id,
        name: p.name ?? null,
        sun_sign: p.sun_sign ?? null,
        moon_sign: p.moon_sign ?? null,
        rising_sign: p.rising_sign ?? null,
        mercury_sign: c?.planets?.mercury?.sign ?? null,
        venus_sign: c?.planets?.venus?.sign ?? null,
        mars_sign: c?.planets?.mars?.sign ?? null,
        saturn_sign: c?.planets?.saturn?.sign ?? null,
        image_url: p.image_url ?? null,
        images: p.images ?? null,
      };
      setMatchProfile(profile);
      return profile;
    },
    [t],
  );

  const loadProfiles = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Own profile + candidate set in parallel. Candidates are everyone
      // matching the caller's discovery preferences, minus the swipes
      // exclusion so already-passed / already-liked profiles still surface.
      const [ownResult, candidatesResult] = await Promise.all([
        supabase.rpc('get_my_full_profile'),
        supabase.rpc('get_synastry_candidate_profiles', {
          p_user_id: user.id,
          p_limit: 50,
        }),
      ]);

      if (ownResult.error) throw ownResult.error;

      const ownData = Array.isArray(ownResult.data) ? ownResult.data[0] : null;
      if (!ownData) {
        setSelfProfile(null);
        setMatchProfile(null);
        return;
      }

      // Build self profile + pull planet placements out of birth_chart JSONB
      // so the dimension cards can score against real positions instead of
      // silently falling back to Sun x Sun for every zone.
      const own: SynastryProfile = {
        id: ownData.id,
        name: ownData.name ?? null,
        sun_sign: ownData.sun_sign ?? null,
        moon_sign: ownData.moon_sign ?? null,
        rising_sign: ownData.rising_sign ?? null,
        mercury_sign: pickPlanetSign(ownData.birth_chart, 'mercury'),
        venus_sign: pickPlanetSign(ownData.birth_chart, 'venus'),
        mars_sign: pickPlanetSign(ownData.birth_chart, 'mars'),
        saturn_sign: pickPlanetSign(ownData.birth_chart, 'saturn'),
        image_url: ownData.image_url ?? null,
        images: ownData.images ?? null,
      };
      setSelfProfile(own);

      let nextCandidates = (candidatesResult.data as CandidateProfile[]) || [];
      if (candidatesResult.error) {
        // Candidate RPC failure isn't fatal — the deep-link path may still work.
        console.warn('Synastry candidates RPC failed:', candidatesResult.error);
        nextCandidates = [];
      }

      let selected: string | null = null;
      if (initialTargetId) {
        const inSet = nextCandidates.find((c) => c.id === initialTargetId);
        if (inSet) {
          selected = initialTargetId;
          try {
            await loadTargetChart(initialTargetId);
          } catch (err) {
            console.error('Failed to load synastry chart for deep-link target:', err);
            selected = nextCandidates[0]?.id ?? null;
            if (selected) {
              try {
                await loadTargetChart(selected);
              } catch (e) {
                console.error(e);
              }
            }
          }
        } else {
          // Deep-link target isn't in candidate set (e.g. already swiped).
          // Still try to load via get-profile-chart and prepend so the link works.
          try {
            const loaded = await loadTargetChart(initialTargetId);
            nextCandidates = [
              {
                id: loaded.id,
                name: loaded.name ?? null,
                age: null,
                sun_sign: loaded.sun_sign ?? null,
                moon_sign: loaded.moon_sign ?? null,
                rising_sign: loaded.rising_sign ?? null,
                image_url: loaded.image_url ?? null,
                images: loaded.images ?? null,
              },
              ...nextCandidates,
            ];
            selected = loaded.id;
          } catch (err) {
            console.warn('Deep-link target not loadable, falling back:', err);
            selected = nextCandidates[0]?.id ?? null;
            if (selected) {
              try {
                await loadTargetChart(selected);
              } catch (e) {
                console.error(e);
              }
            }
          }
        }
      } else if (nextCandidates.length > 0) {
        selected = nextCandidates[0].id;
        try {
          await loadTargetChart(selected);
        } catch (e) {
          console.error(e);
        }
      }

      setCandidates(nextCandidates);
      setSelectedId(selected);

      if (!selected) {
        setMatchProfile(null);
      }
    } catch (err) {
      console.error('Error loading synastry profiles:', err);
      setError(err instanceof Error ? err.message : t('unknownError') || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [user, initialTargetId, loadTargetChart, t]);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadProfiles already captures the deps it cares about
  }, [user, initialTargetId]);

  const handleSelectCandidate = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      setSelectedId(id);
      try {
        await loadTargetChart(id);
      } catch (err) {
        console.error('Failed to load synastry chart for selected profile:', err);
      }
    },
    [selectedId, loadTargetChart],
  );

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  // PremiumGate handles its own loading shell.
  if (loading) {
    return null;
  }

  const me = selfProfile;
  const other = matchProfile;

  const totalScore: number | null =
    me && other ? calculateSunCompatibility(me.sun_sign, other.sun_sign) : null;
  const band: SynastryScoreBand | null = totalScore != null ? getScoreBand(totalScore) : null;

  const zoneScores: ZoneScore[] = me && other ? calculateZoneScores(me, other) : [];

  // "Why this score" — three element pairings. Filter out rows where
  // either side's sign is missing so we never render a placeholder.
  const whyFactors: WhyFactor[] =
    me && other ? getWhyFactors(me, other).filter((f) => f.score != null) : [];

  // "How to talk" — three lenses keyed by the target's placement element.
  // Falls back to the target's Sun element when the planet itself is missing.
  type TalkLens = 'mercury' | 'moon' | 'venus';
  const talkLensSources: Array<{ lens: TalkLens; sign: string | null | undefined }> = other
    ? [
        { lens: 'mercury', sign: other.mercury_sign },
        { lens: 'moon', sign: other.moon_sign },
        { lens: 'venus', sign: other.venus_sign },
      ]
    : [];
  const talkPrompts = talkLensSources
    .map(({ lens, sign }) => {
      const element: SynastryElement | null = getElement(sign) ?? getElement(other?.sun_sign);
      return element ? { lens, element } : null;
    })
    .filter((p): p is { lens: TalkLens; element: SynastryElement } => p != null);

  const watchVisible = band != null && shouldShowWatchFor(band);

  const translateSign = (sign: string | null | undefined): string => {
    const normalized = normalizeSign(sign);
    if (!normalized) return '?';
    const translated = t(normalized.toLowerCase());
    return translated && translated !== normalized.toLowerCase() ? translated : normalized;
  };

  const renderHeader = (
    <View style={[styles.header, { paddingTop: 40 + topInset }]}>
      <TouchableOpacity
        style={[styles.backButton, { top: 30 + topInset }]}
        onPress={() => router.back()}
        accessibilityLabel={t('back') || 'Back'}
      >
        <Text style={styles.backText}>{'←'}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('synastryV2Title') || 'Synastry Reflection'}</Text>
      <Text style={styles.subtitle}>
        {t('synastryV2Subtitle') || 'Conversation map, not prediction.'}
      </Text>
    </View>
  );

  const renderPicker = () => {
    if (candidates.length === 0) return null;
    return (
      <View style={styles.pickerSection}>
        <Text style={styles.pickerLabel}>
          {t('synastryProfileListLabel') || 'Matching your preferences'}
        </Text>
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerList}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedId;
            const avatar = item.image_url || item.images?.[0] || null;
            return (
              <TouchableOpacity
                onPress={() => handleSelectCandidate(item.id)}
                style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                accessibilityLabel={item.name || 'profile'}
              >
                <View style={styles.pickerAvatar}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.pickerAvatarImage} />
                  ) : (
                    <Text style={styles.pickerAvatarFallback}>
                      {(item.name || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.pickerName} numberOfLines={1}>
                  {item.name || '?'}
                </Text>
                <Text style={styles.pickerSign} numberOfLines={1}>
                  {translateSign(item.sun_sign)}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );
  };

  const renderEmptyOrErrorState = () => {
    if (!me) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>
            {t('profileDataMissing') || 'Your profile data is missing.'}
          </Text>
          <Text style={styles.stateBody}>
            {t('synastryV2NoSelfBody') ||
              'Add your birth details so we can compare placements.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadProfiles}>
            <Text style={styles.primaryButtonText}>
              {t('retryLoading') || 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (candidates.length === 0 && !other) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>
            {t('synastryNoProfilesTitle') || 'No profiles match your preferences yet'}
          </Text>
          <Text style={styles.stateBody}>
            {t('synastryNoProfilesBody') ||
              'Try widening your preferences to compare more charts.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.primaryButtonText}>
              {t('adjustPreferences') || 'Edit preferences'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!other) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>
            {t('matchDataMissing') || 'Profile data is unavailable.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadProfiles}>
            <Text style={styles.primaryButtonText}>
              {t('retryLoading') || 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  };

  const emptyState = renderEmptyOrErrorState();

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          {renderHeader}
          {renderPicker()}

          {emptyState ? (
            emptyState
          ) : (
            <View style={styles.contentWrapper}>
              {/* Block 1 — Hero. Score + band label + dim disclaimer. */}
              <View style={styles.heroCard}>
                <View style={styles.heroProfilesRow}>
                  <View style={styles.heroProfileCol}>
                    <Text style={styles.heroProfileName} numberOfLines={1}>
                      {me?.name || t('you') || 'You'}
                    </Text>
                    <Text style={styles.heroProfileSigns} numberOfLines={2}>
                      {translateSign(me?.sun_sign)}
                      {' · '}
                      {translateSign(me?.moon_sign)}
                      {' · '}
                      {translateSign(me?.rising_sign)}
                    </Text>
                  </View>
                  <Text style={styles.heroJoiner}>{'✦'}</Text>
                  <View style={styles.heroProfileCol}>
                    <Text style={styles.heroProfileName} numberOfLines={1}>
                      {other?.name || t('match') || 'Connection'}
                    </Text>
                    <Text style={styles.heroProfileSigns} numberOfLines={2}>
                      {translateSign(other?.sun_sign)}
                      {' · '}
                      {translateSign(other?.moon_sign)}
                      {' · '}
                      {translateSign(other?.rising_sign)}
                    </Text>
                  </View>
                </View>

                {totalScore != null && band ? (
                  <View style={styles.heroScoreBlock}>
                    <View style={styles.heroScoreCircle}>
                      <Text style={styles.heroScoreNumber}>{totalScore}</Text>
                      <Text style={styles.heroScoreOutOf}>/ 100</Text>
                    </View>
                    <View style={styles.heroScoreTextCol}>
                      <Text style={styles.heroScoreEyebrow}>
                        {t('synastryV2ScoreEyebrow') || 'Score band'}
                      </Text>
                      <Text style={styles.heroScoreTitle}>
                        {t(`synastryScoreTitle_${band}`)}
                      </Text>
                      <Text style={styles.heroScoreBody}>
                        {t(`synastryScoreBody_${band}`)}
                      </Text>
                      <Text style={styles.heroScoreDisclaimer}>
                        {t('synastryV2HeroDisclaimer') ||
                          'A starting point for conversation, not a verdict.'}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {/* Block 2 — Why this score. Three element pairings. */}
              {whyFactors.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionEyebrow}>
                    {t('synastryV2WhyTitle') || 'Why this score'}
                  </Text>
                  <Text style={styles.sectionBodyMuted}>
                    {t('synastryV2WhyBody') ||
                      'Three element pairings that shape the overall read.'}
                  </Text>
                  <View style={styles.factorList}>
                    {whyFactors.map((factor) => {
                      const influence =
                        factor.score != null ? factorInfluence(factor.score) : 'neutral';
                      const palette = INFLUENCE_COLORS[influence];
                      return (
                        <View
                          key={factor.key}
                          style={[
                            styles.factorRow,
                            { borderColor: palette.border, backgroundColor: palette.bg },
                          ]}
                        >
                          <View style={styles.factorTextCol}>
                            <Text style={styles.factorTitle}>
                              {t(`synastryV2Factor_${factor.key}`)}
                            </Text>
                            <Text style={styles.factorSigns}>
                              {translateSign(factor.selfSign)}
                              {' · '}
                              {translateSign(factor.targetSign)}
                            </Text>
                            <Text style={styles.factorBody}>
                              {t(`synastryV2FactorBody_${factor.key}`)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Block 3 — Compatibility dimensions. Four cards from real
                  Moon / Mercury / Venus-Mars / Saturn placements with a
                  Sun-fallback note when a placement was missing. */}
              {zoneScores.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionEyebrow}>
                    {t('synastryV2DimensionsTitle') || 'Compatibility dimensions'}
                  </Text>
                  <View style={styles.zoneList}>
                    {zoneScores.map((zone) => (
                      <View key={zone.key} style={styles.zoneCard}>
                        <View style={styles.zoneHeaderRow}>
                          <Text style={styles.zoneName}>
                            {t(`synastryV2Dimension_${zone.key}`)}
                          </Text>
                          <Text style={styles.zoneScore}>{zone.score}</Text>
                        </View>
                        <View style={styles.progressBar}>
                          <View
                            style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, zone.score))}%` }]}
                          />
                        </View>
                        <Text style={styles.zoneBandLabel}>
                          {t(`synastryScoreTitle_${zone.band}`)}
                        </Text>
                        <Text style={styles.zoneBody}>
                          {t(`synastryV2DimensionBody_${zone.key}`)}
                        </Text>
                        <Text style={styles.zoneCue}>
                          {t(`synastryV2Cue_${zone.key}`)}
                        </Text>
                        {zone.source === 'sun-fallback' ? (
                          <Text style={styles.zoneFallback}>
                            {t('synastryV2DimensionFallbackNote') ||
                              'Based on Sun sign while chart details are loading.'}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Block 4 — How to talk to this person. Lenses keyed by
                  target's Mercury / Moon / Venus element. */}
              {talkPrompts.length > 0 ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionEyebrow}>
                    {t('synastryV2TalkTitle') || 'How to talk to this person'}
                  </Text>
                  <Text style={styles.sectionBodyMuted}>
                    {t('synastryV2TalkBody') ||
                      'Concrete entry points based on their placements.'}
                  </Text>
                  <View style={styles.talkList}>
                    {talkPrompts.map(({ lens, element }) => (
                      <View key={lens} style={styles.talkCard}>
                        <Text style={styles.talkLensLabel}>
                          {t(`synastryV2TalkLens_${lens}`)}
                        </Text>
                        <Text style={styles.talkPromptBody}>
                          {t(`synastryV2Prompt_${lens}_${element}`)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Block 5 — Watch for. Only on mixed / growth / different bands. */}
              {watchVisible ? (
                <View style={styles.watchCard}>
                  <Text style={styles.watchEyebrow}>
                    {t('synastryV2WatchTitle') || 'Watch for'}
                  </Text>
                  <Text style={styles.watchBody}>
                    {t('synastryV2WatchBody') ||
                      'Conversation rhythms may differ — pace yourself and check in often.'}
                  </Text>
                </View>
              ) : null}

              {/* Block 6 — Closing disclaimer. Same pattern as Daily / Retrograde V2. */}
              <View style={styles.disclaimerCard}>
                <Text style={styles.disclaimerEyebrow}>
                  {t('synastryV2DisclaimerTitle') || 'A reminder'}
                </Text>
                <Text style={styles.disclaimerBody}>
                  {t('synastryV2DisclaimerBody') ||
                    'Conversation map, not prediction.'}
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          height: '100%',
          width: '100%',
        } as any)
      : {}),
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          height: 'calc(100vh - 120px)',
          overflowY: 'auto',
        } as any)
      : {}),
  },
  scrollContent: {
    paddingBottom: 40,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pickerSection: {
    paddingTop: 4,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: AppTheme.colors.textMuted,
    marginBottom: 10,
  },
  pickerList: {
    gap: 10,
    paddingRight: 20,
  },
  pickerItem: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.panel,
  },
  pickerItemSelected: {
    borderColor: AppTheme.colors.coral,
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
  },
  pickerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: AppTheme.colors.panelStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 6,
  },
  pickerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  pickerAvatarFallback: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  pickerName: {
    fontSize: 12,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
  },
  pickerSign: {
    fontSize: 10,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  stateCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 22,
    borderRadius: 20,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 10,
    lineHeight: 24,
  },
  stateBody: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: 18,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
  },
  heroProfilesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroProfileCol: {
    flex: 1,
    minWidth: 0,
  },
  heroProfileName: {
    fontSize: 15,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  heroProfileSigns: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    lineHeight: 18,
  },
  heroJoiner: {
    fontSize: 18,
    color: AppTheme.colors.textPrimary,
    opacity: 0.6,
    paddingHorizontal: 4,
  },
  heroScoreBlock: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  heroScoreCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(232, 93, 117, 0.14)',
    borderWidth: 3,
    borderColor: AppTheme.colors.coral,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroScoreNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: AppTheme.colors.coral,
  },
  heroScoreOutOf: {
    fontSize: 10,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
    letterSpacing: 1,
  },
  heroScoreTextCol: {
    flex: 1,
    minWidth: 0,
  },
  heroScoreEyebrow: {
    fontSize: 10,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroScoreTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  heroScoreBody: {
    fontSize: 13.5,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  heroScoreDisclaimer: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  sectionCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  sectionEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  sectionBodyMuted: {
    fontSize: 13.5,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  factorList: {
    gap: 10,
  },
  factorRow: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  factorTextCol: {
    gap: 4,
  },
  factorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  factorSigns: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  factorBody: {
    fontSize: 13.5,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  zoneList: {
    gap: 12,
  },
  zoneCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  zoneHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  zoneName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  zoneScore: {
    fontSize: 16,
    fontWeight: '700',
    color: AppTheme.colors.coral,
  },
  progressBar: {
    height: 6,
    backgroundColor: AppTheme.colors.panelStrong,
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AppTheme.colors.coral,
    borderRadius: 3,
  },
  zoneBandLabel: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  zoneBody: {
    fontSize: 13.5,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  zoneCue: {
    fontSize: 13.5,
    color: AppTheme.colors.textPrimary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  zoneFallback: {
    fontSize: 10.5,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  talkList: {
    gap: 10,
  },
  talkCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(232, 93, 117, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.24)',
  },
  talkLensLabel: {
    fontSize: 11,
    color: '#FFB7C7',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: 6,
  },
  talkPromptBody: {
    fontSize: 14.5,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  watchCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.34)',
  },
  watchEyebrow: {
    fontSize: 11,
    color: '#FBBF24',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: 6,
  },
  watchBody: {
    fontSize: 14,
    color: AppTheme.colors.textPrimary,
    lineHeight: 21,
  },
  disclaimerCard: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  disclaimerEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  disclaimerBody: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(248, 113, 113, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.30)',
  },
  errorBannerText: {
    fontSize: 13,
    color: '#FECACA',
    lineHeight: 19,
  },
});

export default function SynastryScreen() {
  const [isDataLoading, setIsDataLoading] = useState(true);

  return (
    <PremiumGate feature="synastry" isDataLoading={isDataLoading}>
      <SynastryScreenContent onLoadingChange={setIsDataLoading} />
    </PremiumGate>
  );
}
