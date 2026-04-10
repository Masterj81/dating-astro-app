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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { formatShortDate } from '../../utils/dateFormatting';
import { useAuth } from '../../contexts/AuthContext';

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
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadBlockedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user]);

  const loadBlockedUsers = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
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
              name: profile?.name || t('unknown') || 'Unknown',
              image_url: profile?.photos?.[0] || '',
              blocked_at: d.created_at,
            };
          });
          setBlockedUsers(blockedWithProfiles);
        }
      }
    } catch (err) {
      console.error('Error loading blocked users:', err);
      Alert.alert(t('error') || 'Error', t('somethingWrong') || 'Something went wrong. Please try again.');
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
            try {
              const { error } = await supabase
                .from('blocked_users')
                .delete()
                .eq('user_id', user?.id)
                .eq('blocked_user_id', userId);

              if (!error) {
                setBlockedUsers(prev => prev.filter(u => u.id !== userId));
              } else {
                Alert.alert(t('error') || 'Error', t('somethingWrong') || 'Could not unblock user. Please try again.');
              }
            } catch {
              Alert.alert(t('error') || 'Error', t('somethingWrong') || 'Could not unblock user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const formatDate = formatShortDate;

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
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('goBack') || 'Go back'}
        >
          <Text style={styles.backText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{t('blockedUsers') || 'Blocked Users'}</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
        </View>
      ) : blockedUsers.length > 0 ? (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderBlockedUser}
          contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <View style={styles.infoCard}>
              <Text style={styles.infoIcon}>{'\u{2139}\u{FE0F}'}</Text>
              <Text style={styles.infoText}>
                {t('blockInfo') || 'Blocked users cannot see your profile, send you messages, or match with you.'}
              </Text>
            </View>
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{'\u{1F6AB}'}</Text>
          <Text style={styles.emptyTitle}>{t('noBlockedUsers') || 'No Blocked Users'}</Text>
          <Text style={styles.emptySubtitle}>
            {t('noBlockedUsersText') || "You haven't blocked anyone yet. When you block someone, they'll appear here."}
          </Text>
          <View style={[styles.infoCard, { marginTop: 24 }]}>
            <Text style={styles.infoIcon}>{'\u{2139}\u{FE0F}'}</Text>
            <Text style={styles.infoText}>
              {t('blockInfo') || 'Blocked users cannot see your profile, send you messages, or match with you.'}
            </Text>
          </View>
        </View>
      )}
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  placeholder: {
    width: 44,
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
    backgroundColor: AppTheme.colors.glass,
    padding: 16,
    borderRadius: AppTheme.radius.lg,
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(232, 93, 117, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: AppTheme.colors.coral,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  blockedDate: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
  },
  unblockButton: {
    backgroundColor: AppTheme.colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: AppTheme.radius.pill,
    minHeight: 36,
    justifyContent: 'center',
  },
  unblockText: {
    color: AppTheme.colors.coral,
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
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: AppTheme.colors.glass,
    marginHorizontal: 20,
    marginBottom: 30,
    padding: 16,
    borderRadius: AppTheme.radius.md,
    gap: 12,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: AppTheme.colors.textMuted,
    lineHeight: 18,
  },
});
