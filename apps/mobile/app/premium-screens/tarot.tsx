import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import {
  fetchTarotReading,
  tarotArtBaseUrl,
  tarotCardImageUrl,
  type ServerTarotReading,
  type TarotMode,
} from '../../services/serverTarot';

// JUNO-06: this screen renders a SERVER artifact. It imports no corpus and no
// engine — the reading is drawn by the premium-tarot-reading edge after
// enforce_premium_feature says yes, and only the authorized result arrives
// here. A patched APK that skips the gate gets nothing to render, because
// nothing local can produce the premium result anymore.

// The bucket root for the PUBLIC card art (the same 78 images for everyone —
// what the server guards is WHICH cards and their meanings, not the art).
const ART_BASE = tarotArtBaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL || '');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min((SCREEN_WIDTH - 80) / 3, 120);
const CARD_HEIGHT = CARD_WIDTH * 1.6;

function TarotScreenContent() {
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState<ServerTarotReading | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [viaPreview, setViaPreview] = useState(false);
  const [mode, setMode] = useState<TarotMode>('love');
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const [allRevealed, setAllRevealed] = useState(false);
  const { user } = useAuth();
  const { tier, triggerPaywall } = usePremium();
  const { t, language } = useLanguage();

  // The canonical positions replace past/present/future. Their labels are the
  // same sentences the web has shipped since V2, so both platforms describe
  // the same spread in the same words — and neither claims to show a future.
  const positionLabel = (position: string): string => {
    const key = {
      present: 'tarotV2PositionPresent',
      attention: 'tarotV2PositionAttention',
      connection: 'tarotV2PositionConnection',
      advice: 'tarotV2PositionAdvice',
    }[position as 'present' | 'attention' | 'connection' | 'advice'];
    return (key && t(key)) || position;
  };
  const insets = useSafeAreaInsets();

  const isCosmic = tier === 'premium_plus';
  const period = isCosmic ? 'weekly' : 'monthly';

  // Flip animations for each card
  const flipAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(false);
    fetchTarotReading(period, mode, language).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setReading(result.reading);
        setViaPreview(result.viaFreePreview);
        setRevealedCards(new Set());
        setAllRevealed(false);
        flipAnims.forEach((anim) => anim.setValue(0));
      } else if (result.code === 'premium_required') {
        // The server refused. This screen has NO PremiumGate wrapper on
        // purpose (it would spend a SECOND enforce on the same open — the
        // edge already owns the decision, preview included). The paywall is
        // the modal, and the server's refusal stands: nothing local can
        // produce a reading anymore.
        setReading(null);
        setFetchError(false);
        triggerPaywall(isCosmic ? 'weekly-tarot' : 'monthly-tarot');
      } else {
        // Network/server failure — no local fallback exists, on purpose.
        setReading(null);
        setFetchError(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, mode, period, language]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealCard = (index: number) => {
    if (revealedCards.has(index)) return;

    Animated.spring(flipAnims[index], {
      toValue: 1,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();

    const newRevealed = new Set(revealedCards);
    newRevealed.add(index);
    setRevealedCards(newRevealed);

    const maxCards = isCosmic ? 4 : 3;
    if (newRevealed.size >= maxCards) {
      setAllRevealed(true);
    }
  };

  const getPeriodLabel = () => {
    const now = new Date();
    if (period === 'weekly') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const weekNum = Math.ceil(
        ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
      );
      return `${t('week') || 'Week'} ${weekNum}, ${now.getFullYear()}`;
    }
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return `${t(months[now.getMonth()]) || months[now.getMonth()]} ${now.getFullYear()}`;
  };

  // Cosmic draws four, Celestial three. That rule now lives in the shared
  // engine (`CARDS_PER_PERIOD`) rather than being re-derived from `isCosmic`
  // here and, separately, from the tier on web.
  const cardsToShow = reading?.cards ?? [];

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#C98692" />
        </View>
      </LinearGradient>
    );
  }

  if (fetchError || !reading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.header}>
            <Text style={styles.title}>{t('tarotReading') || 'Tarot Reading'}</Text>
            <Text style={styles.errorText}>{t('tarotServerError')}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                fetchTarotReading(period, mode, language).then((result) => {
                  if (result.ok) {
                    setReading(result.reading);
                    setViaPreview(result.viaFreePreview);
                    setRevealedCards(new Set());
                    setAllRevealed(false);
                    flipAnims.forEach((anim) => anim.setValue(0));
                    setFetchError(false);
                  } else if (result.code === 'premium_required') {
                    triggerPaywall(isCosmic ? 'weekly-tarot' : 'monthly-tarot');
                  }
                  setLoading(false);
                });
              }}
            >
              <Text style={styles.retryText}>{t('tryAgain') || 'Try Again'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('tarotReading') || 'Tarot Reading'}</Text>
          <Text style={styles.subtitle}>
            {isCosmic
              ? t('weeklyTarotSubtitle') || 'Your weekly cosmic guidance'
              : t('monthlyTarotSubtitle') || 'Your monthly cosmic guidance'}
          </Text>
          <Text style={styles.period}>{getPeriodLabel()}</Text>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'love' && styles.modeButtonActive]}
            onPress={() => setMode('love')}
          >
            <Text style={[styles.modeText, mode === 'love' && styles.modeTextActive]}>
              {t('loveFocus') || 'Love'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'general' && styles.modeButtonActive]}
            onPress={() => setMode('general')}
          >
            <Text style={[styles.modeText, mode === 'general' && styles.modeTextActive]}>
              {t('generalFocus') || 'General'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Spread instruction */}
        {!allRevealed && (
          <Text style={styles.instruction}>
            {t('tapToReveal') || 'Tap each card to reveal your reading'}
          </Text>
        )}

        {/* Cards Row */}
        <View style={styles.cardsRow}>
          {cardsToShow.map((entry, index) => {
            const label = positionLabel(entry.position);
            const frontInterpolate = flipAnims[index].interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ['0deg', '90deg', '0deg'],
            });
            const backOpacity = flipAnims[index].interpolate({
              inputRange: [0, 0.49, 0.5, 1],
              outputRange: [1, 1, 0, 0],
            });
            const frontOpacity = flipAnims[index].interpolate({
              inputRange: [0, 0.49, 0.5, 1],
              outputRange: [0, 0, 1, 1],
            });

            return (
              <View key={entry.position} style={styles.cardSlot}>
                <Text style={styles.positionLabel}>
                  {label}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => revealCard(index)}
                  disabled={revealedCards.has(index)}
                >
                  <Animated.View
                    style={[
                      styles.card,
                      { transform: [{ rotateY: frontInterpolate }] },
                    ]}
                  >
                    {/* Card back */}
                    <Animated.View style={[styles.cardFace, { opacity: backOpacity }]}>
                      <LinearGradient
                        colors={['#2d1b69', '#1a0a3e', '#0d0520']}
                        style={styles.cardBack}
                      >
                        <Text style={styles.cardBackSymbol}>✦</Text>
                        <Text style={styles.cardBackLabel}>
                          {t('tapCard') || 'TAP'}
                        </Text>
                      </LinearGradient>
                    </Animated.View>

                    {/* Card front */}
                    <Animated.View
                      style={[styles.cardFace, styles.cardFront, { opacity: frontOpacity }]}
                    >
                      <Image
                        source={{ uri: tarotCardImageUrl(ART_BASE, entry.card.imageFile) }}
                        style={[
                          styles.cardImage,
                          entry.card.reversed && styles.cardReversed,
                        ]}
                        resizeMode="cover"
                      />
                    </Animated.View>
                  </Animated.View>
                </TouchableOpacity>
                {revealedCards.has(index) && (
                  <Text style={styles.cardName} numberOfLines={2}>
                    {entry.card.name}
                    {entry.card.reversed ? ` (${t('reversed') || 'Rev.'})` : ''}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Interpretations */}
        {allRevealed && reading && (
          <View style={styles.interpretations}>
            <Text style={styles.sectionTitle}>
              {t('yourReading') || 'Your Reading'}
            </Text>
            {reading.isFallback ? (
              <Text style={styles.corpusNote}>
                {t('tarotV2EnglishCorpusNote')}
              </Text>
            ) : null}
            {cardsToShow.map((entry) => {
              const label = positionLabel(entry.position);
              const meaning = entry.card.meaning;
              return (
                <View key={entry.position} style={styles.interpretationCard}>
                  <View style={styles.interpretationHeader}>
                    <Text style={styles.interpretationPosition}>
                      {label}
                    </Text>
                    <Text style={styles.interpretationCardName}>
                      {entry.card.name}
                      {entry.card.reversed ? ` ↓` : ''}
                    </Text>
                  </View>
                  <Text style={styles.interpretationText}>{meaning}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Free-preview banner — the server decided this open spent the
            account's daily preview (same banner contract as PremiumGate). */}
        {viaPreview && tier === 'free' && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewBannerText}>
              {t('freePreviewAvailable') || '1 free preview per day'}
            </Text>
          </View>
        )}

        {/* Premium badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {isCosmic ? 'Cosmic' : 'Celestial'} {t('feature') || 'Feature'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function TarotScreen() {
  // JUNO-06: deliberately NOT wrapped in PremiumGate. The reading is a
  // server artifact and the EDGE owns the single enforce call — wrapping the
  // screen would spend a second decision on the same open (the free preview
  // would be consumed by the wrapper, then the edge would refuse the very
  // reader who just spent it). The screen renders the paywall modal itself
  // when the server answers premium_required. Same shape as the Conversation
  // Guide (the other screen that must not double-gate), but stricter: here
  // even a patched APK has no local engine to fall back to.
  return <TarotScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && { minHeight: '100vh' as any }),
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  backText: {
    color: '#fff',
    fontSize: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    marginBottom: 4,
  },
  period: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
  },
  errorText: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#C98692',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  modeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(201, 134, 146, 0.2)',
    borderColor: 'rgba(201, 134, 146, 0.5)',
  },
  modeText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textMuted,
  },
  modeTextActive: {
    color: '#fff',
  },
  instruction: {
    textAlign: 'center',
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  cardSlot: {
    alignItems: 'center',
    width: CARD_WIDTH + 16,
  },
  positionLabel: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cardBack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(147, 51, 234, 0.4)',
    borderRadius: 12,
  },
  cardBackSymbol: {
    fontSize: 36,
    color: 'rgba(147, 51, 234, 0.6)',
    marginBottom: 8,
  },
  cardBackLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(147, 51, 234, 0.5)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  cardReversed: {
    transform: [{ rotate: '180deg' }],
  },
  cardName: {
    marginTop: 8,
    fontSize: 11,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
  },
  interpretations: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  // Shown only when the card corpus falls back to English, which is every
  // locale except EN and FR. Muted on purpose: it is an honest footnote, not
  // an error.
  corpusNote: {
    fontSize: 12,
    lineHeight: 18,
    color: AppTheme.colors.textMuted,
    borderWidth: 1,
    borderColor: AppTheme.colors.goldBorder,
    backgroundColor: AppTheme.colors.goldWash,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  interpretationCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  interpretationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  interpretationPosition: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  interpretationCardName: {
    fontSize: 14,
    color: '#C98692',
    fontWeight: '600',
  },
  interpretationText: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    lineHeight: 24,
  },
  badge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
    marginBottom: 16,
  },
  previewBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(201, 134, 146, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(201, 134, 146, 0.35)',
    marginBottom: 16,
  },
  previewBannerText: {
    fontSize: 12,
    color: '#C98692',
    fontWeight: '600',
  },
  badgeText: {
    fontSize: 12,
    color: '#8B87FF',
    fontWeight: '600',
  },
});
