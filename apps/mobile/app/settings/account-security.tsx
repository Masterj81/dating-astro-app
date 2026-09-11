import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { showAlert } from '../../utils/alert';
import { validateEmail, validatePassword } from '../../utils/validation';

export default function AccountSecurityScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const updateEmail = async () => {
    const normalized = email.trim().toLowerCase();
    const emailCheck = validateEmail(normalized);
    if (!emailCheck.valid) {
      showAlert(t('error'), t(emailCheck.error!));
      return;
    }
    if (normalized === user?.email?.toLowerCase()) {
      showAlert(t('error'), t('emailUnchanged'));
      return;
    }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: normalized });
    setSavingEmail(false);
    if (error) {
      showAlert(t('error'), error.message);
      return;
    }
    setEmail('');
    showAlert(t('emailChangeRequested'), t('emailChangeRequestedDesc'));
  };

  const updatePassword = async () => {
    if (!password || !confirmPassword) {
      showAlert(t('error'), t('fillAllFields'));
      return;
    }
    const validation = validatePassword(password);
    if (!validation.valid) {
      showAlert(t('error'), t(validation.error!));
      return;
    }
    if (password !== confirmPassword) {
      showAlert(t('error'), t('passwordsDontMatch'));
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      showAlert(t('error'), error.message);
      return;
    }
    setPassword('');
    setConfirmPassword('');
    showAlert(t('passwordUpdated'), t('passwordUpdatedDesc'));
  };

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
              <Text style={styles.backText}>{'\u2190'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{t('accountSecurity')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('changeEmail')}</Text>
            <Text style={styles.help}>{t('currentEmail')}: {user?.email || '—'}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('newEmail')}
              placeholderTextColor={AppTheme.colors.textMuted}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.help}>{t('emailChangeHelp')}</Text>
            <TouchableOpacity style={styles.button} onPress={updateEmail} disabled={savingEmail}>
              {savingEmail ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t('updateEmail')}</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('changePassword')}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('newPassword')}
              placeholderTextColor={AppTheme.colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('confirmPassword')}
              placeholderTextColor={AppTheme.colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.help}>{t('passwordHintStrong')}</Text>
            <TouchableOpacity style={styles.button} onPress={updatePassword} disabled={savingPassword}>
              {savingPassword ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>{t('updatePassword')}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: AppTheme.colors.panel, alignItems: 'center', justifyContent: 'center' },
  backText: { color: AppTheme.colors.textPrimary, fontSize: 24 },
  title: { ...AppTheme.type.title, color: AppTheme.colors.textPrimary, fontSize: 22 },
  headerSpacer: { width: 44 },
  card: { backgroundColor: AppTheme.colors.panel, borderColor: AppTheme.colors.border, borderWidth: 1, borderRadius: AppTheme.radius.lg, padding: 20, gap: 12 },
  cardTitle: { color: AppTheme.colors.textPrimary, fontSize: 19, fontWeight: '700' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: AppTheme.colors.border, borderWidth: 1, borderRadius: AppTheme.radius.md, color: AppTheme.colors.textPrimary, fontSize: 16, padding: 15 },
  help: { color: AppTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  button: { backgroundColor: AppTheme.colors.gold, borderRadius: AppTheme.radius.md, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  buttonText: { color: '#111', fontSize: 15, fontWeight: '700' },
});
