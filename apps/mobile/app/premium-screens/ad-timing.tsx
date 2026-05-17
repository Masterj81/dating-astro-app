import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  AdTimingSnapshot,
  PLANETARY_HOURS_DISCLAIMER,
  Planet,
  ScoredHour,
  getAdTimingSnapshot,
} from '../../services/planetaryHours';

// Astro Ad Timing Lite — a symbolic, opt-in planetary-hour panel.
//
// This screen is intentionally NOT gated behind PremiumGate. The
// research framing for this MVP is: opt-in advanced surface, never a
// default-on recommendation, and never a performance promise. Users
// who land here have followed an explicit deep link.
//
// Location handling: the MVP does not collect a fresh lat/lon. It
// uses a fixed reference location (NYC) so every user sees the same
// deterministic output, which makes the "this is a symbolic framework,
// not your-location-specific advice" framing more honest. A future
// iteration can wire in `services/geocoding.ts` and a user-selected
// city, but that change should arrive with localization and a clear
// "your local sky" framing — not silently.

const REFERENCE_LOCATION = {
  // New York City. Matches `services/geocoding.ts` CITY_CACHE['new york'].
  // The label is shown to the user so they know the timing isn't
  // computed for their device location.
  latitude: 40.7128,
  longitude: -74.006,
  labelKey: 'adTimingLocationNyc',
  fallbackLabel: 'New York City (reference)',
} as const;

function formatTime(d: Date): string {
  // Render in the device's local time zone. The underlying computation
  // is deterministic (UTC moment + fixed lat/lon) — only the display
  // format is locale-aware.
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function planetSymbol(planet: Planet): string {
  switch (planet) {
    case 'Sun': return '☉';
    case 'Moon': return '☾';
    case 'Mercury': return '☿';
    case 'Venus': return '♀';
    case 'Mars': return '♂';
    case 'Jupiter': return '♃';
    case 'Saturn': return '♄';
  }
}

function statusKey(status: ScoredHour['status']): string {
  switch (status) {
    case 'strong': return 'adTimingStatusStrong';
    case 'usable': return 'adTimingStatusUsable';
    case 'avoid': return 'adTimingStatusAvoid';
  }
}

function intentKey(planet: Planet): string {
  return `adTimingIntent${planet}`;
}

function planetKey(planet: Planet): string {
  return planet.toLowerCase(); // existing planet i18n keys are lowercase
}

export default function AdTimingScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<AdTimingSnapshot | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  // Recompute snapshot every minute. Planetary hours are ~45-75 min
  // long depending on latitude/season, so a 60-second refresh is
  // accurate enough without burning battery.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const snap = getAdTimingSnapshot(
        now,
        REFERENCE_LOCATION.latitude,
        REFERENCE_LOCATION.longitude,
        6,
      );
      setSnapshot(snap);
    } catch (err) {
      // Polar latitudes can occasionally fail to find a sunrise; the
      // reference location (NYC) never hits this. We still defend.
      console.error('Ad-timing snapshot failed:', err);
      setSnapshot(null);
    }
  }, [now]);

  const disclaimer = useMemo(
    () => t('adTimingDisclaimer') || PLANETARY_HOURS_DISCLAIMER,
    [t],
  );
  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: 40 + topInset }]}>
          <TouchableOpacity
            style={[styles.backButton, { top: 30 + topInset }]}
            onPress={() => router.back()}
            accessibilityLabel={t('back') || 'Back'}
          >
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('adTimingTitle') || 'Astro Ad Timing'}</Text>
          <Text style={styles.subtitle}>
            {t('adTimingSubtitle') || 'Symbolic timing for ad launches.'}
          </Text>
          <Text style={styles.location}>
            {t(REFERENCE_LOCATION.labelKey) || REFERENCE_LOCATION.fallbackLabel}
          </Text>
        </View>

        {/* Always-visible disclaimer at the top of the value cards. */}
        <View style={styles.disclaimerCardTop}>
          <Text style={styles.disclaimerEyebrow}>
            {t('adTimingDisclaimerEyebrow') || 'Note'}
          </Text>
          <Text style={styles.disclaimerBody}>{disclaimer}</Text>
        </View>

        {snapshot ? (
          <>
            {/* Current planetary hour */}
            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>
                {t('adTimingCurrentEyebrow') || 'Current Planetary Hour'}
              </Text>
              <View style={styles.currentCard}>
                <View style={styles.currentHeader}>
                  <Text style={styles.currentSymbol}>{planetSymbol(snapshot.current.planet)}</Text>
                  <View style={styles.currentHeaderText}>
                    <Text style={styles.currentPlanet}>
                      {t(planetKey(snapshot.current.planet)) || snapshot.current.planet}
                    </Text>
                    <Text style={styles.currentRange}>
                      {formatTime(snapshot.current.startTime)} {'→'} {formatTime(snapshot.current.endTime)}
                    </Text>
                  </View>
                  <StatusPill status={snapshot.current.status} t={t} />
                </View>
                <Text style={styles.currentIntent}>
                  {t(intentKey(snapshot.current.planet)) || snapshot.current.planet}
                </Text>
              </View>
            </View>

            {/* Next favorable */}
            {snapshot.nextFavorable ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>
                  {t('adTimingNextFavorableEyebrow') || 'Next Favorable Hour'}
                </Text>
                <View style={styles.favorableCard}>
                  <View style={styles.favorableRow}>
                    <Text style={styles.favorableSymbol}>{planetSymbol(snapshot.nextFavorable.planet)}</Text>
                    <View style={styles.favorableText}>
                      <Text style={styles.favorablePlanet}>
                        {t(planetKey(snapshot.nextFavorable.planet)) || snapshot.nextFavorable.planet}
                      </Text>
                      <Text style={styles.favorableTime}>
                        {t('adTimingStarts') || 'Starts'} {formatTime(snapshot.nextFavorable.startTime)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.favorableIntent}>
                    {t(intentKey(snapshot.nextFavorable.planet)) || snapshot.nextFavorable.planet}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Upcoming hours */}
            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>
                {t('adTimingUpcomingEyebrow') || 'Upcoming Hours'}
              </Text>
              {snapshot.upcoming.map((h, i) => (
                <View key={`${h.startTime.getTime()}-${i}`} style={styles.upcomingRow}>
                  <Text style={styles.upcomingSymbol}>{planetSymbol(h.planet)}</Text>
                  <View style={styles.upcomingText}>
                    <Text style={styles.upcomingPlanet}>
                      {t(planetKey(h.planet)) || h.planet}
                    </Text>
                    <Text style={styles.upcomingTime}>{formatTime(h.startTime)}</Text>
                  </View>
                  <StatusPill status={h.status} t={t} compact />
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.loadingText}>
              {t('adTimingLoading') || 'Computing planetary hours…'}
            </Text>
          </View>
        )}

        {/* Repeat disclaimer below the data so it's visible at scroll end. */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerEyebrow}>
            {t('adTimingDisclaimerEyebrow') || 'Note'}
          </Text>
          <Text style={styles.disclaimerBody}>{disclaimer}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function StatusPill({
  status,
  t,
  compact = false,
}: {
  status: ScoredHour['status'];
  t: (key: string) => string;
  compact?: boolean;
}) {
  const palette = {
    strong: { bg: 'rgba(101,196,103,0.18)', border: 'rgba(101,196,103,0.40)', fg: '#a4e2a4' },
    usable: { bg: 'rgba(245,196,87,0.18)', border: 'rgba(245,196,87,0.40)', fg: '#f7d68b' },
    avoid: { bg: 'rgba(220,93,93,0.16)', border: 'rgba(220,93,93,0.34)', fg: '#f3a8a8' },
  } as const;
  const colors = palette[status];
  return (
    <View
      style={[
        compact ? styles.statusPillCompact : styles.statusPill,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.statusPillText, { color: colors.fg }]}>
        {t(statusKey(status)) || status}
      </Text>
    </View>
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
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 16,
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
  location: {
    marginTop: 6,
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
  },
  disclaimerCardTop: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(124, 108, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
  },
  disclaimerCard: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  disclaimerEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  disclaimerBody: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  currentCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  currentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  currentSymbol: {
    fontSize: 32,
    color: AppTheme.colors.textPrimary,
  },
  currentHeaderText: {
    flex: 1,
  },
  currentPlanet: {
    fontSize: 18,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  currentRange: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
  },
  currentIntent: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  favorableCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(101,196,103,0.25)',
  },
  favorableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  favorableSymbol: {
    fontSize: 26,
    color: AppTheme.colors.textPrimary,
  },
  favorableText: {
    flex: 1,
  },
  favorablePlanet: {
    fontSize: 16,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  favorableTime: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
  },
  favorableIntent: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 19,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    gap: 12,
  },
  upcomingSymbol: {
    fontSize: 20,
    color: AppTheme.colors.textPrimary,
    width: 28,
    textAlign: 'center',
  },
  upcomingText: {
    flex: 1,
  },
  upcomingPlanet: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  upcomingTime: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loadingText: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
