import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, LoadingState } from '../../components/ScreenStates';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { formatRelativeTime } from '../../utils/dateFormatting';
import { resolveProfileImage } from '../../utils/profileImages';

type LikeProfile = {
  id: string;
  name: string;
  age: number;
  sun_sign: string;
  moon_sign: string;
  image_url?: string | null;
  photos?: Array<string | null>;
  images?: Array<string | null>;
  liked_at: string;
  compatibility: number;
};

function LikesScreenContent() {
  const [likes, setLikes] = useState<LikeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadLikes();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLikes = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: swipes, error } = await supabase
        .from('swipes')
        .select('swiper_id, created_at')
        .eq('swiped_id', user.id)
        .eq('action', 'like')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading likes:', error);
        setLoading(false);
        return;
      }

      const likesWithProfiles = await Promise.all(
        (swipes || []).map(async (swipe) => {
          try {
            const { data: profile } = await supabase
              .from('discoverable_profiles')
              .select('*')
              .eq('id', swipe.swiper_id)
              .maybeSingle();

            if (!profile) {
              return null;
            }

            return {
              ...profile,
              liked_at: swipe.created_at,
              compatibility: Math.floor(Math.random() * 30) + 70,
            };
          } catch {
            return null;
          }
        })
      );

      setLikes(likesWithProfiles.filter(Boolean) as LikeProfile[]);
    } catch (err) {
      console.error('Error loading likes:', err);
    }
    setLoading(false);
  };

  const handleLikeBack = async (profileId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.from('swipes').insert({
        swiper_id: user.id,
        swiped_id: profileId,
        action: 'like',
      });

      if (!error) {
        const { data: existingLike } = await supabase
          .from('swipes')
          .select('*')
          .eq('swiper_id', profileId)
          .eq('swiped_id', user.id)
          .eq('action', 'like')
          .maybeSingle();

        if (existingLike) {
          await supabase.from('matches').insert({
            user1_id: user.id,
            user2_id: profileId,
          });

          router.push('/(tabs)/matches');
        }
      }
    } catch (err) {
      console.error('Error liking back:', err);
    }

    loadLikes();
  };

  const formatTimeAgo = (dateString: string) => formatRelativeTime(dateString, t);

  const renderLikeCard = ({ item }: { item: LikeProfile }) => (
    <View style={styles.likeCard}>
      <Image source={{ uri: resolveProfileImage(item) }} style={styles.profileImage} />

      <View style={styles.cardOverlay}>
        <View style={styles.compatBadge}>
          <Text style={styles.compatText}>{item.compatibility}%</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.profileName}>
            {item.name}, {item.age}
          </Text>
          <View style={styles.signsRow}>
            <Text style={styles.signText}>☀️ {item.sun_sign}</Text>
            <Text style={styles.signText}>🌙 {item.moon_sign}</Text>
          </View>
          <Text style={styles.likedTime}>
            {t('liked')} {formatTimeAgo(item.liked_at)}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.passButton} onPress={() => setLikes(likes.filter((like) => like.id !== item.id))}>
              <Text style={styles.passIcon}>✕</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.likeButton} onPress={() => handleLikeBack(item.id)}>
              <Text style={styles.likeIcon}>♥</Text>
              <Text style={styles.likeText}>{t('likeBack') || 'Like Back'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return <LoadingState testID="likes-loading" />;
  }

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <View style={[styles.header, { paddingTop: 60 + insets.top }]}>
        <TouchableOpacity style={[styles.backButton, { top: 50 + insets.top }]} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('seeWhoLikes')}</Text>
        <Text style={styles.subtitle}>
          {likes.length === 0
            ? t('noLikesYet') || 'No one has liked you yet'
            : t('likesCount', { count: likes.length }) || `${likes.length} people like you`}
        </Text>
      </View>

      {likes.length > 0 ? (
        <FlatList
          data={likes}
          keyExtractor={(item) => item.id}
          renderItem={renderLikeCard}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          numColumns={2}
          columnWrapperStyle={styles.row}
        />
      ) : (
        <EmptyState
          emoji={'\u{1F4AB}'}
          title={t('noLikesYetTitle') || 'No Likes Yet'}
          subtitle={t('noLikesYetText') || 'Keep discovering and your cosmic matches will find you!'}
          actionLabel={t('startDiscovering')}
          onAction={() => router.push('/(tabs)/discover')}
          testID="likes-empty"
        />
      )}

      <View style={styles.premiumBadge}>
        <Text style={styles.premiumIcon}>⭐</Text>
        <Text style={styles.premiumText}>{t('premiumFeature') || 'Premium Feature'}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: '100vh' as any,
          width: '100vw' as any,
          position: 'relative' as any,
        }
      : {}),
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
  },
  listContent: {
    padding: 12,
    paddingBottom: 100,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  likeCard: {
    width: '48%',
    aspectRatio: 0.75,
    borderRadius: AppTheme.radius.lg,
    overflow: 'hidden',
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  compatBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: AppTheme.colors.coral,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  compatText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardContent: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  signsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  signText: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
  },
  likedTime: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  passButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passIcon: {
    fontSize: 16,
    color: AppTheme.colors.textMuted,
  },
  likeButton: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.coral,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  likeIcon: {
    fontSize: 14,
    color: AppTheme.colors.textOnAccent,
  },
  likeText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppTheme.colors.textOnAccent,
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  premiumIcon: {
    fontSize: 14,
  },
  premiumText: {
    fontSize: 12,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
});

export default function LikesScreen() {
  return (
    <PremiumGate feature="likes">
      <LikesScreenContent />
    </PremiumGate>
  );
}
