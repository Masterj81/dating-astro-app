import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LanguageSelector from '../../components/LanguageSelector';
import { LoadingState } from '../../components/ScreenStates';
import VerifiedBadge from '../../components/VerifiedBadge';
import WebTabWrapper from '../../components/WebTabWrapper';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { formatBirthDate } from '../../utils/dateFormatting';
import { useLanguage } from '../../contexts/LanguageContext';
import { readFileAsArrayBuffer, getExtFromMime } from '../../services/fileUtils';
import { pickImage as pickImageCrossPlatform } from '../../services/imagePicker';
import { getManageSubscriptionAction, manageSubscription } from '../../services/subscriptionManagement';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePremium } from '../../contexts/PremiumContext';

type UserProfile = {
  id: string;
  name: string;
  birth_date: string;
  birth_time: string;
  birth_city: string;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  bio: string;
  photos: string[];
  is_verified?: boolean;
  verified_at?: string;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { user, signOut, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const { tier } = usePremium();
  const isFreeUser = tier === 'free';
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('profile'),
      headerTitle: t('myChart'),
    });
  }, [navigation, language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      loadProfile();
    } else if (!authLoading) {
      // Auth finished but no user - stop loading and show login prompt
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user, authLoading]);

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
      } else {
        setProfile(data);

        const photos = Array.isArray(data?.photos) ? data.photos : [];
        if (photos.length > 0 && photos[0]) {
          setAvatarUrl(photos[0]);
        } else {
          const { data: files } = await supabase.storage
            .from('avatars')
            .list(user?.id);

          if (files && files.length > 0) {
            const { data: urlData } = supabase.storage
              .from('avatars')
              .getPublicUrl(`${user?.id}/${files[0].name}`);
            setAvatarUrl(urlData.publicUrl);
          }
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }

    setLoading(false);
  }, [user?.id]);

  const pickImage = async () => {
    const result = await pickImageCrossPlatform({
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.cancelled) {
      return;
    }

    if (result.uri) {
      uploadImage(result.uri);
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user?.id) {
      Alert.alert(t('error'), t('notLoggedIn') || t('somethingWrong'));
      return;
    }

    setUploading(true);

    try {
      const { data: uploadBody, mimeType } = await readFileAsArrayBuffer(uri);
      const ext = getExtFromMime(mimeType);
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, uploadBody, {
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        Alert.alert(t('error'), t('uploadFailed') || t('failedUpload'));
        return;
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          photos: [publicUrl],
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        Alert.alert(t('error'), t('profileUpdateFailed') || t('somethingWrong'));
      } else {
        setAvatarUrl(publicUrl + '?t=' + Date.now());
        Alert.alert(t('success'), t('photoUpdated'));
      }
    } catch (error: any) {
      console.error('Image upload failed:', error);
      Alert.alert(t('error'), t('uploadFailed') || t('somethingWrong'));
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
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

  const handleManageSubscription = async () => {
    if (!user?.id) return;

    try {
      const action = await getManageSubscriptionAction(user.id);

      if (action.type === 'none') {
        Alert.alert(
          t('subscriptions') || 'Subscriptions',
          t('manageSubscriptionUnavailable') || 'No active subscription was found to manage.',
          [{ text: t('ok') || 'OK' }]
        );
        return;
      }

      await manageSubscription(user.id);
    } catch (error) {
      console.error('[Profile] Failed to open subscription management:', error);
      Alert.alert(
        t('error') || 'Error',
        t('manageSubscriptionError') || 'Unable to open subscription management right now.',
        [{ text: t('ok') || 'OK' }]
      );
    }
  };

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const formatDate = (dateString: string) => {
    return formatBirthDate(dateString, getMonthName, t('notSet'));
  };

  const completeness = useMemo(() => {
    if (!profile) return 0;
    const fields = [
      !!profile.name,
      !!profile.bio,
      !!avatarUrl,
      !!profile.sun_sign,
      !!profile.birth_city,
      !!profile.birth_time,
      !!profile.is_verified,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [profile, avatarUrl]);

  // Show loading while auth is initializing OR while loading profile data
  if (authLoading || loading) {
    return (
      <WebTabWrapper>
        <LoadingState message={t('loading')} testID="profile-loading" />
      </WebTabWrapper>
    );
  }

  if (!profile) {
    if (Platform.OS === 'web') {
      return (
        <WebTabWrapper centered padding={20}>
          <p style={{ color: AppTheme.colors.textPrimary, fontSize: 18, marginBottom: 12 }}>Profile not found</p>
          <p style={{ color: AppTheme.colors.textSecondary, fontSize: 14, textAlign: 'center' }}>
            There was an issue loading your profile. Please try again.
          </p>
          <button
            onClick={() => loadProfile()}
            style={{
              marginTop: 20,
              backgroundColor: AppTheme.colors.coral,
              padding: '12px 24px',
              borderRadius: AppTheme.radius.md,
              border: 'none',
              color: AppTheme.colors.textOnAccent,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {t('refresh') || 'Try Again'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              marginTop: 20,
              backgroundColor: AppTheme.colors.coral,
              padding: '12px 24px',
              borderRadius: AppTheme.radius.md,
              border: 'none',
              color: AppTheme.colors.textOnAccent,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {t('logOut')}
          </button>
        </WebTabWrapper>
      );
    }
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: AppTheme.colors.heroStart, paddingHorizontal: 32 }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{'\u{1F30C}'}</Text>
        <Text style={{ color: AppTheme.colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
          {t('profileNotFound') || 'We couldn\u2019t load your profile'}
        </Text>
        <Text style={{ color: AppTheme.colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          {t('profileLoadError') || 'This is usually temporary. Give it another try, or sign back in.'}
        </Text>
        <TouchableOpacity
          style={{ marginBottom: 16, backgroundColor: AppTheme.colors.coral, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 999, shadowColor: AppTheme.colors.coral, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 4, minWidth: 180, alignItems: 'center' }}
          onPress={loadProfile}
          activeOpacity={0.85}
        >
          <Text style={{ color: AppTheme.colors.textOnAccent, fontWeight: '700', fontSize: 16 }}>{t('refresh') || 'Try Again'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ paddingVertical: 12, paddingHorizontal: 24 }}
          onPress={handleLogout}
        >
          <Text style={{ color: AppTheme.colors.textMuted, fontWeight: '500' }}>{t('logOut')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Web version with position fixed to work around parent container clipping
  if (Platform.OS === 'web') {
    return (
      <WebTabWrapper
        background={`linear-gradient(${AppTheme.colors.heroStart}, ${AppTheme.colors.heroMid}, ${AppTheme.colors.heroEnd})`}
        padding={20}
        paddingTop={40}
      >
        {/* Profile Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            onClick={pickImage}
            style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: AppTheme.colors.canvasAlt, border: `3px solid ${AppTheme.colors.coral}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', cursor: 'pointer', position: 'relative'
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} style={{ width: '100%', height: '100%', borderRadius: 60, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 48, color: AppTheme.colors.coral, fontWeight: 'bold' }}>
                {profile?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            )}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              backgroundColor: AppTheme.colors.coral, width: 36, height: 36, borderRadius: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `3px solid ${AppTheme.colors.heroStart}`
            }}>
              {'\u{1F4F7}'}
            </div>
          </div>
          <h2 style={{ color: AppTheme.colors.textPrimary, margin: '0 0 20px', fontSize: 24 }}>{profile?.name}</h2>

          {/* Big Three */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { emoji: '\u{2600}\u{FE0F}', label: t('sun'), value: profile?.sun_sign },
              { emoji: '\u{1F319}', label: t('moon'), value: profile?.moon_sign },
              { emoji: '\u{2B06}\u{FE0F}', label: t('rising'), value: profile?.rising_sign }
            ].map((sign, i) => (
              <div key={i} style={{
                backgroundColor: AppTheme.colors.panel,
                borderRadius: 16, padding: 16, minWidth: 100,
                border: `1px solid ${AppTheme.colors.border}`
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{sign.emoji}</div>
                <div style={{ fontSize: 12, color: AppTheme.colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{sign.label}</div>
                <div style={{ fontSize: 16, color: AppTheme.colors.textPrimary, fontWeight: 600 }}>{sign.value ? t(sign.value.toLowerCase()) : '?'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Birth Details */}
        <div style={{ marginBottom: 24, padding: '0 20px' }}>
          <h3 style={{ color: AppTheme.colors.textPrimary, fontSize: 18, marginBottom: 12 }}>{t('birthDetails')}</h3>
          <div style={{
            backgroundColor: AppTheme.colors.panel,
            borderRadius: 16, padding: 16,
            border: `1px solid ${AppTheme.colors.border}`
          }}>
            {[
              { icon: '\u{1F4C5}', value: formatDate(profile?.birth_date || '') },
              { icon: '\u{1F550}', value: profile?.birth_time || t('notSet') },
              { icon: '\u{1F4CD}', value: profile?.birth_city || t('notSet') }
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ color: AppTheme.colors.textSecondary, fontSize: 15 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, padding: '0 20px' }}>
          <button
            onClick={() => router.push('/profile/edit')}
            style={{
              flex: 1, backgroundColor: AppTheme.colors.panel,
              border: `1px solid ${AppTheme.colors.border}`,
              borderRadius: 12, padding: 16, cursor: 'pointer', textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 6 }}>{'\u{270F}\u{FE0F}'}</div>
            <div style={{ fontSize: 12, color: AppTheme.colors.textSecondary }}>{t('editProfile') || 'Edit Profile'}</div>
          </button>
        </div>

        {/* Settings */}
        <div style={{ padding: '0 20px' }}>
          <h3 style={{ color: AppTheme.colors.textPrimary, fontSize: 18, marginBottom: 12 }}>{t('settings')}</h3>

          <div
            onClick={() => router.push('/onboarding/birth-info')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              borderBottom: `1px solid ${AppTheme.colors.border}`, cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>{'\u{1F319}'}</span>
            <span style={{ color: AppTheme.colors.textSecondary, fontSize: 16 }}>{t('editBirthInfo')}</span>
            <span style={{ marginLeft: 'auto', color: AppTheme.colors.textMuted }}>{'\u{2192}'}</span>
          </div>

          <div
            onClick={() => void handleManageSubscription()}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              borderBottom: `1px solid ${AppTheme.colors.border}`, cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>{'\u{1F4B3}'}</span>
            <span style={{ color: AppTheme.colors.textSecondary, fontSize: 16 }}>{t('subscriptions') || 'Subscriptions & Payments'}</span>
            <span style={{ marginLeft: 'auto', color: AppTheme.colors.textMuted }}>{'\u{2192}'}</span>
          </div>

          <div
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>{'\u{1F6AA}'}</span>
            <span style={{ color: AppTheme.colors.coral, fontSize: 16 }}>{t('logOut')}</span>
          </div>
        </div>
      </WebTabWrapper>
    );
  }

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={pickImage}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel={t('changeProfilePhoto') || 'Change profile photo'}
          >
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl, cache: 'force-cache' }} style={styles.profileImage} />
              ) : (
                <View style={[styles.profileImage, styles.placeholderImage]}>
                  <Text style={styles.placeholderText}>
                    {profile?.name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.editBadge}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.editBadgeText}>{'\u{1F4F7}'}</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.nameRow}>
            <Text style={styles.name} accessibilityRole="header">{profile?.name || t('yourName')}</Text>
            {profile?.is_verified && <VerifiedBadge size="medium" />}
          </View>

          {/* Bio Preview */}
          {profile?.bio ? (
            <Text style={styles.bioPreview} numberOfLines={2}>{profile.bio}</Text>
          ) : (
            <TouchableOpacity
              onPress={() => router.push('/profile/edit')}
              accessibilityRole="button"
              accessibilityLabel={t('addBio') || 'Add a bio'}
            >
              <Text style={styles.bioPrompt}>{t('addBioPrompt') || 'Add a bio to tell others about yourself'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.bigThree}>
            <View style={styles.signCard} accessibilityLabel={`${t('sun')}: ${profile?.sun_sign ? t(profile.sun_sign.toLowerCase()) : t('notSet')}`}>
              <Text style={styles.signEmoji}>{'\u{2600}\u{FE0F}'}</Text>
              <Text style={styles.signLabel}>{t('sun')}</Text>
              <Text style={styles.signValue}>{profile?.sun_sign ? t(profile.sun_sign.toLowerCase()) : '?'}</Text>
            </View>
            <View style={styles.signCard} accessibilityLabel={`${t('moon')}: ${profile?.moon_sign ? t(profile.moon_sign.toLowerCase()) : t('notSet')}`}>
              <Text style={styles.signEmoji}>{'\u{1F319}'}</Text>
              <Text style={styles.signLabel}>{t('moon')}</Text>
              <Text style={styles.signValue}>{profile?.moon_sign ? t(profile.moon_sign.toLowerCase()) : '?'}</Text>
            </View>
            <View style={styles.signCard} accessibilityLabel={`${t('rising')}: ${profile?.rising_sign ? t(profile.rising_sign.toLowerCase()) : t('notSet')}`}>
              <Text style={styles.signEmoji}>{'\u{2B06}\u{FE0F}'}</Text>
              <Text style={styles.signLabel}>{t('rising')}</Text>
              <Text style={styles.signValue}>{profile?.rising_sign ? t(profile.rising_sign.toLowerCase()) : '?'}</Text>
            </View>
          </View>
        </View>

        {/* Daily Horoscope Nudge - Re-engagement hook */}
        <TouchableOpacity
          style={styles.dailyNudge}
          onPress={() => router.push('/premium-screens/daily-horoscope' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('checkDailyHoroscope') || 'View Daily Horoscope'}
        >
          <Text style={styles.dailyNudgeIcon}>{'\u{2728}'}</Text>
          <View style={styles.dailyNudgeContent}>
            <Text style={styles.dailyNudgeTitle}>
              {t('matchesCosmicTip') || "Today's Cosmic Energy"}
            </Text>
            <Text style={styles.dailyNudgeSubtitle}>
              {t('checkDailyHoroscope') || 'View Daily Horoscope'}
            </Text>
          </View>
          <Text style={styles.dailyNudgeArrow}>{'\u{2192}'}</Text>
        </TouchableOpacity>

        {/* Profile Completeness */}
        {completeness < 100 && (
            <TouchableOpacity
              style={styles.completenessCard}
              onPress={() => router.push('/profile/edit')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t('profileCompleteness') || 'Profile completeness'}: ${completeness}%`}
            >
              <View style={styles.completenessHeader}>
                <Text style={styles.completenessTitle}>
                  {t('profileCompleteness') || 'Profile Completeness'}
                </Text>
                <Text style={styles.completenessScore}>{completeness}%</Text>
              </View>
              <View style={styles.completenessBar}>
                <View style={[styles.completenessBarFill, { width: `${completeness}%` }]} />
              </View>
              <Text style={styles.completenessHint}>
                {t('completeProfileHint') || 'Complete profiles get up to 3x more matches'}
              </Text>
            </TouchableOpacity>
        )}

        {/* Birth Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('birthDetails')}</Text>
          <View style={styles.birthInfo}>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>{'\u{1F4C5}'}</Text>
              <Text style={styles.birthValue}>{formatDate(profile?.birth_date || '')}</Text>
            </View>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>{'\u{1F550}'}</Text>
              <Text style={styles.birthValue}>{profile?.birth_time || t('notSet')}</Text>
            </View>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>{'\u{1F4CD}'}</Text>
              <Text style={styles.birthValue}>{profile?.birth_city || t('notSet')}</Text>
            </View>
          </View>
        </View>

        {/* Premium Cosmic Insights Teaser */}
        {isFreeUser && (
          <TouchableOpacity
            style={styles.cosmicTeaser}
            onPress={() => router.push('/premium-screens/plans' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('unlockInsights') || 'Unlock Your Insights'}
          >
            <View style={styles.cosmicTeaserHeader}>
              <Text style={styles.cosmicTeaserIcon}>{'\u{1F52E}'}</Text>
              <View style={styles.cosmicTeaserHeaderText}>
                <Text style={styles.cosmicTeaserTitle}>
                  {t('yourCosmicInsights') || 'Your Cosmic Insights'}
                </Text>
                <Text style={styles.cosmicTeaserSubtitle}>
                  {t('personalizedGuidance') || 'Personalized daily guidance awaits'}
                </Text>
              </View>
            </View>
            <View style={styles.cosmicTeaserPreview}>
              <View style={styles.cosmicTeaserItem}>
                <Text style={styles.cosmicTeaserItemIcon}>{'\u{2600}\u{FE0F}'}</Text>
                <View style={styles.cosmicTeaserItemBlur}>
                  <View style={styles.blurredLine} />
                  <View style={[styles.blurredLine, { width: '60%' }]} />
                </View>
              </View>
              <View style={styles.cosmicTeaserItem}>
                <Text style={styles.cosmicTeaserItemIcon}>{'\u{1F495}'}</Text>
                <View style={styles.cosmicTeaserItemBlur}>
                  <View style={styles.blurredLine} />
                  <View style={[styles.blurredLine, { width: '70%' }]} />
                </View>
              </View>
            </View>
            <View style={styles.cosmicTeaserCta}>
              <Text style={styles.cosmicTeaserCtaText}>
                {t('unlockInsights') || 'Unlock Your Insights'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Verification Prompt */}
        {!profile?.is_verified && (
          <TouchableOpacity
            style={styles.verificationPrompt}
            onPress={() => router.push('/profile/verify')}
            accessibilityRole="button"
            accessibilityLabel={t('getVerified') || 'Get verified'}
          >
            <View style={styles.verificationContent}>
              <Text style={styles.verificationIcon}>{'\u{2713}'}</Text>
              <View style={styles.verificationText}>
                <Text style={styles.verificationTitle}>{t('getVerified')}</Text>
                <Text style={styles.verificationDesc}>{t('verificationPromptDesc')}</Text>
              </View>
            </View>
            <Text style={styles.verificationArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/profile/edit')}
              accessibilityRole="button"
              accessibilityLabel={t('editProfile') || 'Edit Profile'}
            >
              <Text style={styles.actionIcon}>{'\u{270F}\u{FE0F}'}</Text>
              <Text style={styles.actionText}>{t('editProfile') || 'Edit Profile'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/settings/preferences')}
              accessibilityRole="button"
              accessibilityLabel={t('preferences') || 'Preferences'}
            >
              <Text style={styles.actionIcon}>{'\u{1F3AF}'}</Text>
              <Text style={styles.actionText}>{t('preferences') || 'Preferences'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings')}</Text>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsIcon}>{'\u{1F310}'}</Text>
            <Text style={styles.settingsText}>{t('language')}</Text>
            <View style={{ marginLeft: 'auto' }}>
              <LanguageSelector />
            </View>
          </View>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel={t('allSettings') || 'All Settings'}
          >
            <Text style={styles.settingsIcon}>{'\u{2699}\u{FE0F}'}</Text>
            <Text style={styles.settingsText}>{t('allSettings') || 'All Settings'}</Text>
            <Text style={styles.settingsArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => router.push('/onboarding/birth-info')}
            accessibilityRole="button"
            accessibilityLabel={t('editBirthInfo')}
          >
            <Text style={styles.settingsIcon}>{'\u{1F319}'}</Text>
            <Text style={styles.settingsText}>{t('editBirthInfo')}</Text>
            <Text style={styles.settingsArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => void handleManageSubscription()}
            accessibilityRole="button"
            accessibilityLabel={t('subscriptions') || 'Subscriptions & Payments'}
          >
            <Text style={styles.settingsIcon}>{'\u{1F4B3}'}</Text>
            <Text style={styles.settingsText}>{t('subscriptions') || 'Subscriptions & Payments'}</Text>
            <Text style={styles.settingsArrow}>{'\u{2192}'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingsRow, styles.logoutRow]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel={t('logOut')}
          >
            <Text style={styles.settingsIcon}>{'\u{1F6AA}'}</Text>
            <Text style={[styles.settingsText, styles.logoutText]}>{t('logOut')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
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
    color: AppTheme.colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: AppTheme.colors.coral,
  },
  placeholderImage: {
    backgroundColor: AppTheme.colors.canvasAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: AppTheme.colors.coral,
    fontWeight: 'bold',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: AppTheme.colors.coral,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: AppTheme.colors.heroStart,
  },
  editBadgeText: {
    fontSize: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
  },
  bioPreview: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  bioPrompt: {
    fontSize: 14,
    color: AppTheme.colors.cosmic,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  dailyNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(232, 93, 117, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.18)',
    gap: 12,
  },
  dailyNudgeIcon: {
    fontSize: 22,
  },
  dailyNudgeContent: {
    flex: 1,
  },
  dailyNudgeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 2,
  },
  dailyNudgeSubtitle: {
    fontSize: 12,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
  dailyNudgeArrow: {
    fontSize: 16,
    color: AppTheme.colors.coral,
  },
  completenessCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(124, 108, 255, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.20)',
  },
  completenessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  completenessTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  completenessScore: {
    fontSize: 15,
    fontWeight: '700',
    color: AppTheme.colors.cosmic,
  },
  completenessBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  completenessBarFill: {
    height: '100%',
    backgroundColor: AppTheme.colors.cosmic,
    borderRadius: 3,
  },
  completenessHint: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
  },
  bigThree: {
    flexDirection: 'row',
    gap: 12,
  },
  signCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  signEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  signLabel: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  signValue: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 12,
  },
  birthInfo: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  birthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  birthLabel: {
    fontSize: 18,
  },
  birthValue: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  premiumAction: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderColor: 'rgba(233, 69, 96, 0.3)',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionText: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
    fontWeight: '500',
  },
  premiumActionText: {
    color: '#e94560',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  settingsArrow: {
    marginLeft: 'auto',
    color: '#666',
    fontSize: 16,
  },
  settingsIcon: {
    fontSize: 20,
  },
  settingsText: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
  },
  premiumText: {
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
  logoutRow: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  logoutText: {
    color: AppTheme.colors.coral,
  },
  cosmicTeaser: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(124, 108, 255, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.20)',
  },
  cosmicTeaserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cosmicTeaserIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  cosmicTeaserHeaderText: {
    flex: 1,
  },
  cosmicTeaserTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 2,
  },
  cosmicTeaserSubtitle: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  cosmicTeaserPreview: {
    gap: 10,
    marginBottom: 14,
  },
  cosmicTeaserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
  },
  cosmicTeaserItemIcon: {
    fontSize: 18,
  },
  cosmicTeaserItemBlur: {
    flex: 1,
    gap: 6,
  },
  blurredLine: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: '80%',
  },
  cosmicTeaserCta: {
    backgroundColor: AppTheme.colors.cosmic,
    borderRadius: AppTheme.radius.pill,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cosmicTeaserCtaText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  verificationPrompt: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.24)',
  },
  verificationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationIcon: {
    fontSize: 24,
    color: AppTheme.colors.cosmic,
    backgroundColor: 'rgba(124, 108, 255, 0.16)',
    width: 40,
    height: 40,
    borderRadius: 20,
    textAlign: 'center',
    lineHeight: 40,
    marginRight: 12,
  },
  verificationText: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.cosmic,
    marginBottom: 2,
  },
  verificationDesc: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  verificationArrow: {
    fontSize: 20,
    color: AppTheme.colors.cosmic,
  },
});
