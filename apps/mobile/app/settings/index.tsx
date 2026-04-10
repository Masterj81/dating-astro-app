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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { getReferralStats, claimReferralCode, shareReferralCode } from '../../services/referral';
import { checkRateLimit, recordAttempt, resetRateLimit, formatRetryMessage } from '../../utils/rateLimiter';
import { useAuth } from '../../contexts/AuthContext';

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
  const insets = useSafeAreaInsets();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [friendCode, setFriendCode] = useState('');
  const [referralLoading, setReferralLoading] = useState(false);
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
      try {
        const [prefsResult, referralResult] = await Promise.all([
          supabase.from('profiles').select('notification_preferences').eq('id', user.id).maybeSingle(),
          getReferralStats(user.id),
        ]);
        if (prefsResult.data?.notification_preferences) {
          const prefs = prefsResult.data.notification_preferences;
          setNotifications(prev => ({ ...prev, ...prefs }));
        }
        setReferralCode(referralResult.code);
        setReferralCount(referralResult.totalReferrals);
      } catch (err) {
        console.error('Error loading settings:', err);
      }
      setLoadingPrefs(false);
    })();
  }, [user]);

  const toggleNotification = (key: keyof NotificationSettings) => {
    const snapshot = { ...notifications };
    const updated = { ...snapshot, [key]: !snapshot[key] };
    setNotifications(updated);
    supabase
      .from('profiles')
      .update({ notification_preferences: updated })
      .eq('id', user?.id)
      .then(({ error }) => {
        if (error) {
          setNotifications(snapshot);
          Alert.alert(t('error'), t('notificationSaveFailed') || 'Could not save notification preference. Please try again.');
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
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
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
          <Text style={styles.title} accessibilityRole="header">{t('settings')}</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account') || 'Account'}</Text>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/profile/edit')}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile') || 'Edit Profile'}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>{'\u{1F464}'}</Text>
              <Text style={styles.rowText}>{t('editProfile') || 'Edit Profile'}</Text>
            </View>
            <Text style={styles.rowArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings/preferences')}
            accessibilityRole="button"
            accessibilityLabel={t('discoveryPreferences') || 'Discovery Preferences'}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>{'\u{1F3AF}'}</Text>
              <Text style={styles.rowText}>{t('discoveryPreferences') || 'Discovery Preferences'}</Text>
            </View>
            <Text style={styles.rowArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/onboarding/birth-info')}
            accessibilityRole="button"
            accessibilityLabel={t('editBirthInfo')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>{'\u{2B50}'}</Text>
              <Text style={styles.rowText}>{t('editBirthInfo')}</Text>
            </View>
            <Text style={styles.rowArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>
        </View>

        {/* Referral Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('inviteFriends') || 'Invite Friends'}</Text>

          {/* Your code */}
          <View style={styles.referralCard}>
            <Text style={styles.referralLabel}>{t('yourReferralCode') || 'Your referral code'}</Text>
            <View style={styles.referralCodeRow}>
              <Text style={styles.referralCodeText}>{referralCode || '...'}</Text>
              <TouchableOpacity
                style={styles.referralCopyButton}
                onPress={() => {
                  if (referralCode) {
                    Clipboard.setStringAsync(referralCode);
                    Alert.alert(t('copied') || 'Copied!', t('referralCodeCopied') || 'Referral code copied to clipboard');
                  }
                }}
              >
                <Text style={styles.referralCopyText}>{t('copy') || 'Copy'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.referralReward}>{t('referralRewardInfo') || 'Both you and your friend get 1 month of premium free!'}</Text>
            <Text style={styles.referralStats}>
              {t('referralCount', { count: referralCount }) || `${referralCount} friends invited`}
            </Text>
          </View>

          {/* Share button */}
          <TouchableOpacity
            style={styles.referralShareButton}
            onPress={() => referralCode && shareReferralCode(referralCode, t)}
          >
            <Text style={styles.referralShareIcon}>📤</Text>
            <Text style={styles.referralShareText}>{t('shareReferralCode') || 'Share your code'}</Text>
          </TouchableOpacity>

          {/* Enter friend's code */}
          <View style={styles.referralInputRow}>
            <View style={styles.referralInputWrapper}>
              <Text style={styles.referralInputLabel}>{t('haveACode') || 'Have a friend\'s code?'}</Text>
              <View style={styles.referralInputContainer}>
                <TextInput
                  style={styles.referralInput}
                  placeholder={t('enterCode') || 'Enter code'}
                  placeholderTextColor="#666"
                  value={friendCode}
                  onChangeText={(text) => setFriendCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                />
                <TouchableOpacity
                  style={[styles.referralApplyButton, (!friendCode.trim() || referralLoading) && styles.referralApplyDisabled]}
                  disabled={!friendCode.trim() || referralLoading}
                  onPress={async () => {
                    const limit = checkRateLimit('referral-claim', { maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
                    if (!limit.allowed) {
                      Alert.alert(t('error') || 'Error', formatRetryMessage(limit.retryAfterMs));
                      return;
                    }
                    setReferralLoading(true);
                    recordAttempt('referral-claim');
                    const result = await claimReferralCode(friendCode);
                    setReferralLoading(false);
                    if (result.success) {
                      resetRateLimit('referral-claim');
                      setFriendCode('');
                      Alert.alert('🎉', result.reward || t('referralSuccess') || 'Referral applied! You both get 1 month free.');
                    } else {
                      Alert.alert(t('error') || 'Error', result.error || t('referralError') || 'Invalid referral code');
                    }
                  }}
                >
                  <Text style={styles.referralApplyText}>
                    {referralLoading ? '...' : t('apply') || 'Apply'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications') || 'Notifications'}</Text>

          {loadingPrefs ? (
            <ActivityIndicator color={AppTheme.colors.coral} style={{ marginVertical: 20 }} />
          ) : null}

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💕</Text>
              <Text style={styles.rowText}>{t('newMatches') || 'New Matches'}</Text>
            </View>
            <Switch
              value={notifications.newMatches}
              onValueChange={() => toggleNotification('newMatches')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>💬</Text>
              <Text style={styles.rowText}>{t('messages') || 'Messages'}</Text>
            </View>
            <Switch
              value={notifications.messages}
              onValueChange={() => toggleNotification('messages')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>❤️</Text>
              <Text style={styles.rowText}>{t('likes') || 'Likes'}</Text>
            </View>
            <Switch
              value={notifications.likes}
              onValueChange={() => toggleNotification('likes')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>⭐</Text>
              <Text style={styles.rowText}>{t('superLikes')}</Text>
            </View>
            <Switch
              value={notifications.superLikes}
              onValueChange={() => toggleNotification('superLikes')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>🔮</Text>
              <Text style={styles.rowText}>{t('dailyHoroscope') || 'Daily Horoscope'}</Text>
            </View>
            <Switch
              value={notifications.dailyHoroscope}
              onValueChange={() => toggleNotification('dailyHoroscope')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.settingsRow, loadingPrefs && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowIcon}>📢</Text>
              <Text style={styles.rowText}>{t('promotions') || 'Promotions & News'}</Text>
            </View>
            <Switch
              value={notifications.promotions}
              onValueChange={() => toggleNotification('promotions')}
              disabled={loadingPrefs}
              trackColor={{ false: '#333', true: AppTheme.colors.coral }}
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  dangerTitle: {
    color: AppTheme.colors.danger,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppTheme.colors.glass,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: AppTheme.radius.md,
    marginBottom: 8,
    minHeight: 52,
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
    color: AppTheme.colors.textPrimary,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowArrow: {
    fontSize: 16,
    color: AppTheme.colors.textMuted,
  },
  logoutText: {
    color: AppTheme.colors.coral,
  },
  deleteText: {
    color: AppTheme.colors.danger,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  versionText: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    marginBottom: 4,
  },
  versionSubtext: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  referralCard: {
    backgroundColor: 'rgba(232, 93, 117, 0.08)',
    borderRadius: AppTheme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.2)',
    padding: 16,
    marginBottom: 12,
  },
  referralLabel: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  referralCodeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    letterSpacing: 3,
  },
  referralCopyButton: {
    backgroundColor: AppTheme.colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: AppTheme.radius.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  referralCopyText: {
    fontSize: 13,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
  referralReward: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 6,
  },
  referralStats: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  referralShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.colors.coral,
    borderRadius: AppTheme.radius.md,
    paddingVertical: 14,
    marginBottom: 12,
    gap: 8,
    minHeight: 48,
  },
  referralShareIcon: {
    fontSize: 16,
  },
  referralShareText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textOnAccent,
  },
  referralInputRow: {
    marginTop: 4,
  },
  referralInputWrapper: {},
  referralInputLabel: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
    marginBottom: 8,
  },
  referralInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  referralInput: {
    flex: 1,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: AppTheme.colors.textPrimary,
    letterSpacing: 2,
    minHeight: 48,
  },
  referralApplyButton: {
    backgroundColor: AppTheme.colors.coral,
    borderRadius: AppTheme.radius.md,
    paddingHorizontal: 20,
    justifyContent: 'center',
    minHeight: 48,
  },
  referralApplyDisabled: {
    opacity: 0.4,
  },
  referralApplyText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textOnAccent,
  },
});
