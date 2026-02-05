import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type LikeProfile = {
  id: string;
  name: string;
  age: number;
  sun_sign: string;
  moon_sign: string;
  image_url: string;
  liked_at: string;
  compatibility: number;
};

function LikesScreenContent() {
  const [likes, setLikes] = useState<LikeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadLikes();
  }, [user]);

  const loadLikes = async () => {
    if (!user) return;
    setLoading(true);

    // Get users who liked the current user
    const { data: swipes, error } = await supabase
      .from('swipes')
      .select('swiper_id, created_at')
      .eq('swiped_id', user.id)
      .eq('action', 'like')
      .order('created_at', { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    // Get profiles of users who liked
    const likesWithProfiles = await Promise.all(
      (swipes || []).map(async (swipe) => {
        const { data: profile } = await supabase
          .from('discoverable_profiles')
          .select('*')
          .eq('id', swipe.swiper_id)
          .single();

        if (profile) {
          return {
            ...profile,
            liked_at: swipe.created_at,
            compatibility: Math.floor(Math.random() * 30) + 70, // 70-100
          };
        }
        return null;
      })
    );

    setLikes(likesWithProfiles.filter(Boolean) as LikeProfile[]);
    setLoading(false);
  };

  const handleLikeBack = async (profileId: string) => {
    if (!user) return;

    // Create a like swipe
    const { error } = await supabase.from('swipes').insert({
      swiper_id: user.id,
      swiped_id: profileId,
      action: 'like',
    });

    if (!error) {
      // Check if it's a match
      const { data: existingLike } = await supabase
        .from('swipes')
        .select('*')
        .eq('swiper_id', profileId)
        .eq('swiped_id', user.id)
        .eq('action', 'like')
        .single();

      if (existingLike) {
        // It's a match! Create match record
        await supabase.from('matches').insert({
          user1_id: user.id,
          user2_id: profileId,
        });

        // Navigate to matches
        router.push('/(tabs)/matches');
      }
    }

    // Refresh the list
    loadLikes();
  };

  const formatTimeAgo = (dateString: string): string => {
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

  const renderLikeCard = ({ item }: { item: LikeProfile }) => (
    <View style={styles.likeCard}>
      <Image source={{ uri: item.image_url }} style={styles.profileImage} />

      <View style={styles.cardOverlay}>
        <View style={styles.compatBadge}>
          <Text style={styles.compatText}>{item.compatibility}%</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.profileName}>{item.name}, {item.age}</Text>
          <View style={styles.signsRow}>
            <Text style={styles.signText}>☀️ {item.sun_sign}</Text>
            <Text style={styles.signText}>🌙 {item.moon_sign}</Text>
          </View>
          <Text style={styles.likedTime}>{t('liked')} {formatTimeAgo(item.liked_at)}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.passButton}
              onPress={() => {
                setLikes(likes.filter(l => l.id !== item.id));
              }}
            >
              <Text style={styles.passIcon}>✕</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.likeButton}
              onPress={() => handleLikeBack(item.id)}
            >
              <Text style={styles.likeIcon}>♥</Text>
              <Text style={styles.likeText}>{t('likeBack') || 'Like Back'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          numColumns={2}
          columnWrapperStyle={styles.row}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>💫</Text>
          <Text style={styles.emptyTitle}>{t('noLikesYetTitle') || 'No Likes Yet'}</Text>
          <Text style={styles.emptySubtitle}>
            {t('noLikesYetText') || 'Keep discovering and your cosmic matches will find you!'}
          </Text>
          <TouchableOpacity
            style={styles.discoverButton}
            onPress={() => router.push('/(tabs)/discover')}
          >
            <LinearGradient
              colors={['#e94560', '#c23a51']}
              style={styles.discoverGradient}
            >
              <Text style={styles.discoverText}>{t('startDiscovering')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Premium Badge */}
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
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
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
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
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
    backgroundColor: '#e94560',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  compatText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardContent: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  signsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  signText: {
    fontSize: 12,
    color: '#ccc',
  },
  likedTime: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  passButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passIcon: {
    fontSize: 16,
    color: '#888',
  },
  likeButton: {
    flex: 1,
    flexDirection: 'row',
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  likeIcon: {
    fontSize: 14,
    color: '#fff',
  },
  likeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  discoverButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  discoverGradient: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  discoverText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
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
    color: '#e94560',
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
