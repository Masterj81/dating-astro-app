import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type NotificationSettings = {
  newMatches: boolean;
  messages: boolean;
  likes: boolean;
  superLikes: boolean;
  dailyHoroscope: boolean;
  promotions: boolean;
};

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    newMatches: true,
    messages: true,
    likes: true,
    superLikes: true,
    dailyHoroscope: false,
    promotions: false,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .single();
      if (data?.notification_preferences) {
        setNotifications(prev => ({ ...prev, ...data.notification_preferences }));
      }
      setLoadingPrefs(false);
    })();
  }, [user]);

  const toggleNotification = (key: keyof NotificationSettings) => {
    const prev = notifications;
    const updated = { ...prev, [key]: !prev[key] };
    setNotifications(updated);
    supabase
      .from('profiles')
      .update({ notification_preferences: updated })
      .eq('id', user?.id)
      .then(({ error }) => {
        if (error) {
          setNotifications(prev);
          Alert.alert(t('error'), t('somethingWrong'));
        }
      });
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccount') || 'Delete Account',
      t('deleteAccountWarning') || 'This action cannot be undone. All your data, matches, and messages will be permanently deleted.',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      t('areYouSure') || 'Are you sure?',
      t('typeDeleteConfirm') || 'Please confirm you want to delete your account.',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yesDelete') || 'Yes, Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.functions.invoke('delete-account', {
                method: 'POST',
              });
              if (error) throw error;
              await signOut();
              router.replace('/auth/login');
            } catch {
              Alert.alert(
                t('error') || 'Error',
                t('deleteAccountError') || 'Failed to delete account. Please try again or contact support.',
              );
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert(
      t('logOut'),
      t('logoutConfirm') || 'Are you sure you want to log out?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth/login');
          },
        },
      ]
    );
  };

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert(t('error'), t('cantOpenLink') || "Couldn't open link");
    });
  };

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('settings')}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account') || 'Account'}</Text>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/profile/edit')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>👤</Text>
              <Text style={styles.rowText}>{t('editProfile') || 'Edit Profile'}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings/preferences')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🎯</Text>
              <Text style={styles.rowText}>{t('discoveryPreferences') || 'Discovery Preferences'}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/onboarding/birth-info')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>⭐</Text>
              <Text style={styles.rowText}>{t('editBirthInfo')}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications') || 'Notifications'}</Text>

          {loadingPrefs ? (
            <ActivityIndicator color="#e94560" style={{ marginVertical: 20 }} />
          ) : null}

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💕</Text>
              <Text style={styles.rowText}>{t('newMatches') || 'New Matches'}</Text>
            </View>
            <Switch
              value={notifications.newMatches}
              onValueChange={() => toggleNotification('newMatches')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💬</Text>
              <Text style={styles.rowText}>{t('messages') || 'Messages'}</Text>
            </View>
            <Switch
              value={notifications.messages}
              onValueChange={() => toggleNotification('messages')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>❤️</Text>
              <Text style={styles.rowText}>{t('likes') || 'Likes'}</Text>
            </View>
            <Switch
              value={notifications.likes}
              onValueChange={() => toggleNotification('likes')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>⭐</Text>
              <Text style={styles.rowText}>{t('superLikes')}</Text>
            </View>
            <Switch
              value={notifications.superLikes}
              onValueChange={() => toggleNotification('superLikes')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔮</Text>
              <Text style={styles.rowText}>{t('dailyHoroscope') || 'Daily Horoscope'}</Text>
            </View>
            <Switch
              value={notifications.dailyHoroscope}
              onValueChange={() => toggleNotification('dailyHoroscope')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingsRow}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📢</Text>
              <Text style={styles.rowText}>{t('promotions') || 'Promotions & News'}</Text>
            </View>
            <Switch
              value={notifications.promotions}
              onValueChange={() => toggleNotification('promotions')}
              trackColor={{ false: '#333', true: '#e94560' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('privacy') || 'Privacy'}</Text>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings/blocked')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🚫</Text>
              <Text style={styles.rowText}>{t('blockedUsers') || 'Blocked Users'}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings/privacy-policy')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔒</Text>
              <Text style={styles.rowText}>{t('privacyPolicy') || 'Privacy Policy'}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings/terms-of-service')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📜</Text>
              <Text style={styles.rowText}>{t('termsOfService') || 'Terms of Service'}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('support') || 'Support'}</Text>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => openLink('https://astrodatingapp.com/help')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>❓</Text>
              <Text style={styles.rowText}>{t('helpCenter') || 'Help Center'}</Text>
            </View>
            <Text style={styles.rowArrow}>↗</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => openLink('mailto:support@astrodatingapp.com')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>✉️</Text>
              <Text style={styles.rowText}>{t('contactUs') || 'Contact Us'}</Text>
            </View>
            <Text style={styles.rowArrow}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>
            {t('dangerZone') || 'Danger Zone'}
          </Text>

          <TouchableOpacity style={styles.settingsRow} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🚪</Text>
              <Text style={[styles.rowText, styles.logoutText]}>{t('logOut')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🗑️</Text>
              <Text style={[styles.rowText, styles.deleteText]}>
                {t('deleteAccount') || 'Delete Account'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>AstroDating v1.0.0</Text>
          <Text style={styles.versionSubtext}>{t('madeWithLove') || 'Made with ♥ and ✨'}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  dangerTitle: {
    color: '#e94560',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  rowText: {
    fontSize: 16,
    color: '#fff',
  },
  rowArrow: {
    fontSize: 16,
    color: '#666',
  },
  logoutText: {
    color: '#e94560',
  },
  deleteText: {
    color: '#ff4444',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  versionSubtext: {
    fontSize: 12,
    color: '#555',
  },
});
