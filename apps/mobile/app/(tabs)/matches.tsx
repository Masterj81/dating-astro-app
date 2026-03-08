import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { LoadingState, EmptyState } from '../../components/ScreenStates';
import WebTabWrapper from '../../components/WebTabWrapper';
import { useEffect, useLayoutEffect, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    image_url: string;
  };
};

// --- HELPER FUNCTIONS ---
type TranslateFunction = (key: string, options?: Record<string, string | number>) => string;

const formatDate = (dateString: string, t: TranslateFunction) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('justNow');
  if (diffMins < 60) return t('minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('hoursAgo', { count: diffHours });
  return t('daysAgo', { count: diffDays });
};

// --- SUB-COMPONENTS (Moved Outside) ---
function MatchCard({ match, t }: { match: Match; t: TranslateFunction }) {
  const handleMatchPress = () => {
    buttonPress();
    router.push(`/match/${match.matched_profile.id}`);
  };

  const handleChatPress = () => {
    buttonPress();
    router.push(`/chat/${match.id}`);
  };

  const compatibilityScore = match.compatibility_score || 85;

  return (
    <TouchableOpacity
      style={styles.matchCard}
      onPress={handleMatchPress}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${match.matched_profile.name}, ${match.matched_profile.sun_sign} sign, ${formatCompatibilityForA11y(compatibilityScore)}, matched ${formatDate(match.created_at, t)}`}
      accessibilityHint="Double tap to view profile"
    >
      <Image
        source={{ uri: match.matched_profile.image_url }}
        style={styles.matchImage}
        {...getImageA11yProps(t('a11y.profileImage', { name: match.matched_profile.name }))}
      />

      <View style={styles.matchInfo}>
        <View style={styles.matchHeader}>
          <Text style={styles.matchName}>{match.matched_profile.name}</Text>
          <View
            style={styles.compatBadge}
            accessibilityLabel={formatCompatibilityForA11y(compatibilityScore)}
          >
            <Text style={styles.compatText}>{compatibilityScore}%</Text>
          </View>
        </View>

        <Text style={styles.matchSign}>☀️ {match.matched_profile.sun_sign || '?'}</Text>
        <Text style={styles.matchActive}>{formatDate(match.created_at, t)}</Text>
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
}

// --- MAIN SCREEN ---
export default function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const navigation = useNavigation();

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

    // Get matches where user is either user1 or user2
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      // Use optional chaining safely in the string interpolation
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    if (error) {
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
            image_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
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

  return (
    <WebTabWrapper>
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        {matches.length > 0 ? (
          <>
            <View style={styles.header} accessibilityRole="header">
              <Text style={styles.headerTitle}>{t('yourMatches')}</Text>
              <Text style={styles.headerSubtitle}>
                {matches.length === 1
                  ? t('matchCount', { count: matches.length })
                  : t('matchesCount', { count: matches.length })}
              </Text>
            </View>

            <FlatList
              data={matches}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <MatchCard match={item} t={t} />}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              accessibilityLabel={`${matches.length} matches`}
            />
          </>
        ) : (
          <EmptyState
            emoji={'\u{1F4AB}'}
            title={t('noMatchesYet')}
            subtitle={t('keepExploring')}
            actionLabel={t('startDiscovering')}
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
    paddingTop: 16,
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 12,
  },
  matchImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 12,
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
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  compatText: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },
  matchSign: {
    fontSize: 14,
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
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
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
});
