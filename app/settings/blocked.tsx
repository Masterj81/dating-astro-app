import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type BlockedUser = {
  id: string;
  name: string;
  image_url: string;
  blocked_at: string;
};

export default function BlockedUsersScreen() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadBlockedUsers();
  }, [user]);

  const loadBlockedUsers = async () => {
    if (!user) return;
    setLoading(true);

    // In real app, fetch from blocked_users table
    // For now, simulating empty list
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_user_id, created_at')
      .eq('user_id', user.id);

    if (!error && data && data.length > 0) {
      // Fetch profiles of blocked users
      const blockedIds = data.map(d => d.blocked_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, photos')
        .in('id', blockedIds);

      if (profiles) {
        const blockedWithProfiles = data.map(d => {
          const profile = profiles.find(p => p.id === d.blocked_user_id);
          return {
            id: d.blocked_user_id,
            name: profile?.name || 'Unknown',
            image_url: profile?.photos?.[0] || '',
            blocked_at: d.created_at,
          };
        });
        setBlockedUsers(blockedWithProfiles);
      }
    }

    setLoading(false);
  };

  const handleUnblock = (userId: string, userName: string) => {
    Alert.alert(
      t('unblockUser') || 'Unblock User',
      t('unblockConfirm', { name: userName }) || `Are you sure you want to unblock ${userName}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unblock') || 'Unblock',
          onPress: async () => {
            const { error } = await supabase
              .from('blocked_users')
              .delete()
              .eq('user_id', user?.id)
              .eq('blocked_user_id', userId);

            if (!error) {
              setBlockedUsers(prev => prev.filter(u => u.id !== userId));
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderBlockedUser = ({ item }: { item: BlockedUser }) => (
    <View style={styles.userCard}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.blockedDate}>
          {t('blockedOn') || 'Blocked on'} {formatDate(item.blocked_at)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.unblockButton}
        onPress={() => handleUnblock(item.id, item.name)}
      >
        <Text style={styles.unblockText}>{t('unblock') || 'Unblock'}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('blockedUsers') || 'Blocked Users'}</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
        </View>
      ) : blockedUsers.length > 0 ? (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderBlockedUser}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🚫</Text>
          <Text style={styles.emptyTitle}>{t('noBlockedUsers') || 'No Blocked Users'}</Text>
          <Text style={styles.emptySubtitle}>
            {t('noBlockedUsersText') || "You haven't blocked anyone yet. When you block someone, they'll appear here."}
          </Text>
        </View>
      )}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Text style={styles.infoIcon}>ℹ️</Text>
        <Text style={styles.infoText}>
          {t('blockInfo') || 'Blocked users cannot see your profile, send you messages, or match with you.'}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
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
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#e94560',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  blockedDate: {
    fontSize: 13,
    color: '#888',
  },
  unblockButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  unblockText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
});
