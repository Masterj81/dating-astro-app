import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LanguageSelector from '../../components/LanguageSelector';
import { useLanguage } from '../../contexts/LanguageContext';
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
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const { t, language } = useLanguage();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('profile'),
      headerTitle: t('myChart'),
    });
  }, [navigation, language]);

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .maybeSingle();

    if (error) {
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
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(t('error'), t('photoPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri);
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

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

          <Text style={styles.name}>{profile?.name || t('yourName')}</Text>

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
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
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
});
