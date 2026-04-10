import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VoiceIntroRecorder from '../../components/VoiceIntroRecorder';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { readFileAsArrayBuffer, getExtFromMime } from '../../services/fileUtils';
import { pickImage as pickImageCrossPlatform } from '../../services/imagePicker';
import { supabase } from '../../services/supabase';
import { validateBio, validateName } from '../../utils/validation';
import { useAuth } from '../../contexts/AuthContext';

type UserProfile = {
  id: string;
  name: string;
  bio: string;
  gender?: string | null;
  photos: string[];
  age?: number;
  occupation?: string;
  interests?: string[];
  voice_intro_url?: string | null;
  has_voice_intro?: boolean;
};

const MAX_PHOTOS = 6;
const MAX_BIO_LENGTH = 500;

export default function EditProfileScreen() {
  const [_profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('');
  const [occupation, setOccupation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [voiceIntroUrl, setVoiceIntroUrl] = useState<string | null>(null);
  const [_hasVoiceIntro, setHasVoiceIntro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const initialDataRef = useRef<{ name: string; bio: string; gender: string; occupation: string; photos: string[] } | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Fallbacks for web where SafeAreaProvider may not work
  const topInset = insets?.top ?? 0;

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user]);

  const loadProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
      setName(data.name || '');
      setBio(data.bio || '');
      setGender(data.gender || '');
      setOccupation(data.occupation || '');
      setPhotos(data.photos || []);
      setVoiceIntroUrl(data.voice_intro_url || null);
      setHasVoiceIntro(data.has_voice_intro || false);
    }
    setLoading(false);
  };

  const handleVoiceIntroUpdate = useCallback((hasIntro: boolean, url?: string) => {
    setHasVoiceIntro(hasIntro);
    setVoiceIntroUrl(url || null);
  }, []);

  const pickImage = async (index: number) => {
    const result = await pickImageCrossPlatform({
      aspect: [3, 4],
      quality: 0.8,
    });

    if (result.cancelled) {
      // User cancelled or permission denied
      return;
    }

    if (result.uri) {
      uploadImage(result.uri, index);
    }
  };

  const uploadImage = async (uri: string, index: number) => {
    if (!user) return;
    setUploadingIndex(index);

    try {
      const { data: uploadBody, mimeType } = await readFileAsArrayBuffer(uri);
      const ext = getExtFromMime(mimeType);
      const fileName = `photo_${index}_${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

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

      const newPhotos = [...photos];
      newPhotos[index] = urlData.publicUrl;
      setPhotos(newPhotos.filter(Boolean));
    } catch (error: any) {
      console.error('Image upload failed:', error);
      Alert.alert(t('error'), t('uploadFailed') || t('somethingWrong'));
    } finally {
      setUploadingIndex(null);
    }
  };

  const removePhoto = (index: number) => {
    Alert.alert(
      t('removePhoto') || 'Remove Photo',
      t('removePhotoConfirm') || 'Are you sure you want to remove this photo?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('remove') || 'Remove',
          style: 'destructive',
          onPress: () => {
            const newPhotos = photos.filter((_, i) => i !== index);
            setPhotos(newPhotos);
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!user) return;

    const nameResult = validateName(name);
    if (!nameResult.valid) {
      Alert.alert(t('error'), t(nameResult.error!));
      return;
    }

    const bioResult = validateBio(bio);
    if (!bioResult.valid) {
      Alert.alert(t('error'), t(bioResult.error!));
      return;
    }

    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim(),
        bio: bioResult.sanitized,
        gender: gender || null,
        occupation: occupation.trim(),
        photos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      Alert.alert(t('error'), t('somethingWrong'));
    } else {
      Alert.alert(t('success'), t('profileUpdated') || 'Profile updated successfully', [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    }
  };

  const completeness = useMemo(() => {
    const fields = [
      !!name.trim(),
      !!bio.trim(),
      photos.length > 0,
      !!gender,
      !!occupation.trim(),
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [name, bio, photos.length, gender, occupation]);

  const handleBack = () => {
    if (isDirty) {
      Alert.alert(
        t('unsavedChanges') || 'Unsaved Changes',
        t('unsavedChangesMessage') || 'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('discard') || 'Discard', style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <ActivityIndicator size="large" color={AppTheme.colors.coral} style={{ marginTop: 100 }} />
      </LinearGradient>
    );
  }

  const renderContent = () => (
    <View>
      {/* Profile Completeness */}
      {completeness < 100 && (
        <View style={styles.completenessCard}>
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
            {completeness < 60
              ? (t('completeProfileLow') || 'Add more details to attract better matches')
              : (t('completeProfileHigh') || 'Almost there! Just a few more details.')}
          </Text>
        </View>
      )}

      {/* Photos Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('photos') || 'Photos'}</Text>
            <Text style={styles.sectionSubtitle}>
              {t('photosHint') || 'Add up to 6 photos. First photo is your main profile picture.'}
            </Text>
            <View style={styles.photosGrid}>
              {Array.from({ length: MAX_PHOTOS }).map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.photoSlot,
                    index === 0 && styles.mainPhotoSlot,
                  ]}
                  onPress={() => photos[index] ? removePhoto(index) : pickImage(index)}
                  disabled={uploadingIndex === index}
                >
                  {photos[index] ? (
                    <>
                      <Image source={{ uri: photos[index] }} style={styles.photoImage} />
                      <View style={styles.photoOverlay}>
                        <Text style={styles.photoAction}>✕</Text>
                      </View>
                      {index === 0 && (
                        <View style={styles.mainBadge}>
                          <Text style={styles.mainBadgeText}>{t('main') || 'Main'}</Text>
                        </View>
                      )}
                    </>
                  ) : uploadingIndex === index ? (
                    <ActivityIndicator color={AppTheme.colors.coral} />
                  ) : (
                    <>
                      <Text style={styles.addPhotoIcon}>+</Text>
                      <Text style={styles.addPhotoText}>{t('addPhoto') || 'Add'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Voice Intro Section */}
          {user && (
            <View style={styles.section}>
              <VoiceIntroRecorder
                userId={user.id}
                existingUrl={voiceIntroUrl}
                onUpdate={handleVoiceIntroUpdate}
              />
            </View>
          )}

          {/* Basic Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('basicInfo') || 'Basic Info'}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('name')} *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={(text) => { setName(text); setIsDirty(true); }}
                placeholder={t('yourName')}
                placeholderTextColor="#666"
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('genderLabel')}</Text>
              <View style={styles.preferenceOptions}>
                {[
                  { value: 'male', label: t('genderOption_male') },
                  { value: 'female', label: t('genderOption_female') },
                  { value: 'non-binary', label: t('genderOption_nonBinary') },
                  { value: 'other', label: t('genderOption_other') },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.preferenceOption,
                      gender === option.value && styles.preferenceOptionActive,
                    ]}
                    onPress={() => { setGender(option.value); setIsDirty(true); }}
                  >
                    <Text
                      style={[
                        styles.preferenceOptionText,
                        gender === option.value && styles.preferenceOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('occupation') || 'Occupation'}</Text>
              <TextInput
                style={styles.textInput}
                value={occupation}
                onChangeText={(text) => { setOccupation(text); setIsDirty(true); }}
                placeholder={t('occupationPlaceholder') || 'What do you do?'}
                placeholderTextColor="#666"
                maxLength={100}
              />
            </View>
          </View>

          {/* Bio Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('aboutMe') || 'About Me'}</Text>
              <Text style={styles.charCount}>{bio.length}/{MAX_BIO_LENGTH}</Text>
            </View>
            <TextInput
              style={[styles.textInput, styles.bioInput]}
              value={bio}
              onChangeText={(text) => { setBio(text); setIsDirty(true); }}
              placeholder={t('bioPlaceholder') || 'Tell others about yourself...'}
              placeholderTextColor="#666"
              multiline
              maxLength={MAX_BIO_LENGTH}
              textAlignVertical="top"
            />
            <Text style={styles.bioHint}>
              {t('bioHint') || 'Share what makes you unique. Mention your interests, values, or what you\'re looking for.'}
            </Text>
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>{t('profileTips') || 'Profile Tips'}</Text>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>📸</Text>
              <Text style={styles.tipText}>
                {t('tip1') || 'Use clear, recent photos that show your face'}
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>✨</Text>
              <Text style={styles.tipText}>
                {t('tip2') || 'A complete profile gets 3x more matches'}
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Text style={styles.tipIcon}>💬</Text>
              <Text style={styles.tipText}>
                {t('tip3') || 'Be specific about your interests to find better matches'}
              </Text>
            </View>
          </View>
    </View>
  );

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 30 + topInset }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel={t('goBack') || 'Go back'}
        >
          <Text style={styles.backText}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('editProfile') || 'Edit Profile'}</Text>
        <TouchableOpacity
          style={[styles.saveButton, (saving || !isDirty) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !isDirty}
          accessibilityRole="button"
          accessibilityLabel={t('save') || 'Save'}
          accessibilityState={{ disabled: saving || !isDirty }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>{t('save') || 'Save'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: '100vh' as any,
      width: '100vw' as any,
      position: 'relative' as any,
    } : {}),
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    ...(Platform.OS === 'web' ? {
      height: 'calc(100vh - 70px)' as any,
      width: '100%' as any,
      overflowY: 'auto' as any,
    } : {
      flex: 1,
    }),
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
    zIndex: 10,
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
  saveButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: AppTheme.radius.pill,
    minWidth: 70,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    marginBottom: 16,
  },
  charCount: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginBottom: 8,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoSlot: {
    width: '31%',
    aspectRatio: 0.75,
    borderRadius: AppTheme.radius.md,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 2,
    borderColor: AppTheme.colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mainPhotoSlot: {
    borderColor: AppTheme.colors.coral,
    borderStyle: 'solid',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAction: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 14,
    fontWeight: 'bold',
  },
  mainBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: AppTheme.colors.coral,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mainBadgeText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 10,
    fontWeight: '600',
  },
  addPhotoIcon: {
    fontSize: 32,
    color: AppTheme.colors.textMuted,
    marginBottom: 4,
  },
  addPhotoText: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  inputGroup: {
    marginBottom: 16,
  },
  preferenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  preferenceOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: AppTheme.radius.md,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  preferenceOptionActive: {
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    borderColor: 'rgba(232, 93, 117, 0.55)',
  },
  preferenceOptionText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceOptionTextActive: {
    color: AppTheme.colors.textPrimary,
  },
  inputLabel: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: AppTheme.colors.glass,
    borderRadius: AppTheme.radius.md,
    padding: 16,
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    minHeight: 48,
  },
  bioInput: {
    minHeight: 120,
    marginBottom: 8,
  },
  bioHint: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
    lineHeight: 18,
  },
  tipsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(232, 93, 117, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.2)',
  },
  completenessCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: 'rgba(124, 108, 255, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.2)',
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
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.coral,
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tipIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
});
