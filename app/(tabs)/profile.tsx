import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LanguageSelector from '../../components/LanguageSelector';
import VerifiedBadge from '../../components/VerifiedBadge';
import { useLanguage } from '../../contexts/LanguageContext';
import { pickImage as pickImageCrossPlatform } from '../../services/imagePicker';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

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
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('profile'),
      headerTitle: t('myChart'),
    });
  }, [navigation, language]);

  useEffect(() => {
    if (user) {
      loadProfile();
    } else if (!authLoading) {
      // Auth finished but no user - stop loading and show login prompt
      setLoading(false);
    }
    // If authLoading is true, keep waiting for auth to finish
  }, [user, authLoading]);

  const loadProfile = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
    } else {
      setProfile(data);

      if (data?.photos && data.photos.length > 0) {
        setAvatarUrl(data.photos[0]);
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

    setLoading(false);
  };

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
    setUploading(true);

    try {
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar.${ext}`;
      const filePath = `${user?.id}/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          upsert: true,
          contentType: `image/${ext}`,
        });

      if (uploadError) {
        Alert.alert(t('error'), t('failedUpload'));
        setUploading(false);
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
        .eq('id', user?.id);

      if (updateError) {
      } else {
        setAvatarUrl(publicUrl + '?t=' + Date.now());
        Alert.alert(t('success'), t('photoUpdated'));
      }
    } catch (error) {
      Alert.alert(t('error'), t('somethingWrong'));
    }

    setUploading(false);
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/auth/login');
  };

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return t('notSet');
    const date = new Date(dateString);
    return `${getMonthName(date.getMonth())} ${date.getDate()}, ${date.getFullYear()}`;
  };

  // Show loading while auth is initializing OR while loading profile data
  if (authLoading || loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: '#0f0f1a' }]}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: '#0f0f1a' }]}>
        <Text style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>Profile not found</Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }}>
          There was an issue loading your profile. Please try logging out and back in.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, backgroundColor: '#e94560', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}
          onPress={handleLogout}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{t('logOut')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Web version with position fixed to work around parent container clipping
  // Only show when this tab is focused to prevent covering other tabs
  if (Platform.OS === 'web') {
    if (!isFocused) {
      return null;
    }
    return (
      <div style={{
        position: 'fixed',
        top: 64,
        left: 0,
        right: 0,
        bottom: 60,
        background: 'linear-gradient(#0f0f1a, #1a1a2e, #16213e)',
        padding: 20,
        overflowY: 'auto',
        zIndex: 1
      }}>
        {/* Profile Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            onClick={pickImage}
            style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: '#1a1a2e', border: '3px solid #e94560',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', cursor: 'pointer', position: 'relative'
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} style={{ width: '100%', height: '100%', borderRadius: 60, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 48, color: '#e94560', fontWeight: 'bold' }}>
                {profile?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            )}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              backgroundColor: '#e94560', width: 36, height: 36, borderRadius: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '3px solid #0f0f1a'
            }}>
              📷
            </div>
          </div>
          <h2 style={{ color: '#fff', margin: '0 0 20px', fontSize: 24 }}>{profile?.name}</h2>

          {/* Big Three */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { emoji: '☀️', label: t('sun'), value: profile?.sun_sign },
              { emoji: '🌙', label: t('moon'), value: profile?.moon_sign },
              { emoji: '⬆️', label: t('rising'), value: profile?.rising_sign }
            ].map((sign, i) => (
              <div key={i} style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: 16, padding: 16, minWidth: 100,
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{sign.emoji}</div>
                <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>{sign.label}</div>
                <div style={{ fontSize: 16, color: '#fff', fontWeight: 600 }}>{sign.value ? t(sign.value.toLowerCase()) : '?'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Birth Details */}
        <div style={{ marginBottom: 24, padding: '0 20px' }}>
          <h3 style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>{t('birthDetails')}</h3>
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: 16, padding: 16,
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            {[
              { icon: '📅', value: formatDate(profile?.birth_date || '') },
              { icon: '🕐', value: profile?.birth_time || t('notSet') },
              { icon: '📍', value: profile?.birth_city || t('notSet') }
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{ color: '#ccc', fontSize: 15 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, padding: '0 20px' }}>
          {[
            { icon: '✏️', label: t('editProfile') || 'Edit Profile', href: '/profile/edit' },
            { icon: '⭐', label: t('premium') || 'Premium', href: '/premium', isPremium: true }
          ].map((action, i) => (
            <button
              key={i}
              onClick={() => router.push(action.href as any)}
              style={{
                flex: 1, backgroundColor: action.isPremium ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${action.isPremium ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: 16, cursor: 'pointer', textAlign: 'center'
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{action.icon}</div>
              <div style={{ fontSize: 12, color: action.isPremium ? '#e94560' : '#ccc' }}>{action.label}</div>
            </button>
          ))}
        </div>

        {/* Settings */}
        <div style={{ padding: '0 20px' }}>
          <h3 style={{ color: '#fff', fontSize: 18, marginBottom: 12 }}>{t('settings')}</h3>

          <div
            onClick={() => router.push('/onboarding/birth-info')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>🌙</span>
            <span style={{ color: '#ccc', fontSize: 16 }}>{t('editBirthInfo')}</span>
            <span style={{ marginLeft: 'auto', color: '#666' }}>→</span>
          </div>

          <div
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>🚪</span>
            <span style={{ color: '#e94560', fontSize: 16 }}>{t('logOut')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <View style={{ flex: 1 }}>
        <View style={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={pickImage} disabled={uploading}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.profileImage} />
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
                  <Text style={styles.editBadgeText}>📷</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile?.name || t('yourName')}</Text>
            {profile?.is_verified && <VerifiedBadge size="medium" />}
          </View>

          <View style={styles.bigThree}>
            <View style={styles.signCard}>
              <Text style={styles.signEmoji}>☀️</Text>
              <Text style={styles.signLabel}>{t('sun')}</Text>
              <Text style={styles.signValue}>{profile?.sun_sign ? t(profile.sun_sign.toLowerCase()) : '?'}</Text>
            </View>
            <View style={styles.signCard}>
              <Text style={styles.signEmoji}>🌙</Text>
              <Text style={styles.signLabel}>{t('moon')}</Text>
              <Text style={styles.signValue}>{profile?.moon_sign ? t(profile.moon_sign.toLowerCase()) : '?'}</Text>
            </View>
            <View style={styles.signCard}>
              <Text style={styles.signEmoji}>⬆️</Text>
              <Text style={styles.signLabel}>{t('rising')}</Text>
              <Text style={styles.signValue}>{profile?.rising_sign ? t(profile.rising_sign.toLowerCase()) : '?'}</Text>
            </View>
          </View>
        </View>

        {/* Birth Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('birthDetails')}</Text>
          <View style={styles.birthInfo}>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>📅</Text>
              <Text style={styles.birthValue}>{formatDate(profile?.birth_date || '')}</Text>
            </View>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>🕐</Text>
              <Text style={styles.birthValue}>{profile?.birth_time || t('notSet')}</Text>
            </View>
            <View style={styles.birthRow}>
              <Text style={styles.birthLabel}>📍</Text>
              <Text style={styles.birthValue}>{profile?.birth_city || t('notSet')}</Text>
            </View>
          </View>
        </View>

        {/* Verification Prompt */}
        {!profile?.is_verified && (
          <TouchableOpacity
            style={styles.verificationPrompt}
            onPress={() => router.push('/profile/verify')}
          >
            <View style={styles.verificationContent}>
              <Text style={styles.verificationIcon}>✓</Text>
              <View style={styles.verificationText}>
                <Text style={styles.verificationTitle}>{t('getVerified')}</Text>
                <Text style={styles.verificationDesc}>{t('verificationPromptDesc')}</Text>
              </View>
            </View>
            <Text style={styles.verificationArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/profile/edit')}
            >
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionText}>{t('editProfile') || 'Edit Profile'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/settings/preferences')}
            >
              <Text style={styles.actionIcon}>🎯</Text>
              <Text style={styles.actionText}>{t('preferences') || 'Preferences'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.premiumAction]}
              onPress={() => router.push('/premium')}
            >
              <Text style={styles.actionIcon}>⭐</Text>
              <Text style={[styles.actionText, styles.premiumActionText]}>{t('premium') || 'Premium'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings')}</Text>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsIcon}>🌐</Text>
            <Text style={styles.settingsText}>{t('language')}</Text>
            <View style={{ marginLeft: 'auto' }}>
              <LanguageSelector />
            </View>
          </View>

          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/settings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
            <Text style={styles.settingsText}>{t('allSettings') || 'All Settings'}</Text>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/onboarding/birth-info')}>
            <Text style={styles.settingsIcon}>🌙</Text>
            <Text style={styles.settingsText}>{t('editBirthInfo')}</Text>
            <Text style={styles.settingsArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} onPress={handleLogout}>
            <Text style={styles.settingsIcon}>🚪</Text>
            <Text style={[styles.settingsText, styles.logoutText]}>{t('logOut')}</Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
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
    color: '#888',
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
    borderColor: '#e94560',
  },
  placeholderImage: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: '#e94560',
    fontWeight: 'bold',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#e94560',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0f0f1a',
  },
  editBadgeText: {
    fontSize: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  bigThree: {
    flexDirection: 'row',
    gap: 12,
  },
  signCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  signEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  signLabel: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  signValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  birthInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ccc',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#ccc',
    fontWeight: '500',
  },
  premiumActionText: {
    color: '#e94560',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
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
    color: '#ccc',
  },
  premiumText: {
    color: '#e94560',
    fontWeight: '600',
  },
  logoutText: {
    color: '#e94560',
  },
  verificationPrompt: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  verificationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationIcon: {
    fontSize: 24,
    color: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
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
    color: '#3b82f6',
    marginBottom: 2,
  },
  verificationDesc: {
    fontSize: 13,
    color: '#888',
  },
  verificationArrow: {
    fontSize: 20,
    color: '#3b82f6',
  },
});
