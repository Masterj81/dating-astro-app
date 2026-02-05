import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { validateBio, validateName } from '../../utils/validation';
import { useAuth } from '../_layout';

type UserProfile = {
  id: string;
  name: string;
  bio: string;
  photos: string[];
  age?: number;
  occupation?: string;
  interests?: string[];
};

const MAX_PHOTOS = 6;
const MAX_BIO_LENGTH = 500;

export default function EditProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [occupation, setOccupation] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
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
      setOccupation(data.occupation || '');
      setPhotos(data.photos || []);
    }
    setLoading(false);
  };

  const pickImage = async (index: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(t('error'), t('photoPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri, index);
    }
  };

  const uploadImage = async (uri: string, index: number) => {
    if (!user) return;
    setUploadingIndex(index);

    try {
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `photo_${index}_${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

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
        setUploadingIndex(null);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const newPhotos = [...photos];
      newPhotos[index] = urlData.publicUrl;
      setPhotos(newPhotos.filter(Boolean));
    } catch (error) {
      Alert.alert(t('error'), t('somethingWrong'));
    }

    setUploadingIndex(null);
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

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{t('editProfile') || 'Edit Profile'}</Text>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>{t('save') || 'Save'}</Text>
              )}
            </TouchableOpacity>
          </View>

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
                    <ActivityIndicator color="#e94560" />
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

          {/* Basic Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('basicInfo') || 'Basic Info'}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('name')} *</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder={t('yourName')}
                placeholderTextColor="#666"
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('occupation') || 'Occupation'}</Text>
              <TextInput
                style={styles.textInput}
                value={occupation}
                onChangeText={setOccupation}
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
              onChangeText={setBio}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
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
  saveButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#fff',
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
    color: '#fff',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#888',
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
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mainPhotoSlot: {
    borderColor: '#e94560',
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
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAction: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  mainBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#e94560',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mainBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  addPhotoIcon: {
    fontSize: 32,
    color: '#666',
    marginBottom: 4,
  },
  addPhotoText: {
    fontSize: 12,
    color: '#666',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bioInput: {
    minHeight: 120,
    marginBottom: 8,
  },
  bioHint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  tipsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.2)',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e94560',
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
    color: '#ccc',
    lineHeight: 20,
  },
});
