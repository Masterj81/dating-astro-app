import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { showAlert } from '../../utils/alert';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { validatePassword } from '../../utils/validation';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, []);

  const handleReset = async () => {
    if (!password || !confirmPassword) {
      showAlert(t('error'), t('fillAllFields'));
      return;
    }

    const passwordResult = validatePassword(password);
    if (!passwordResult.valid) {
      showAlert(t('error'), t(passwordResult.error!));
      return;
    }

    if (password !== confirmPassword) {
      showAlert(t('error'), t('passwordsDontMatch'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        showAlert(t('error'), t('passwordResetError') || 'Could not update your password. Please try again.');
      } else {
        showAlert(t('passwordUpdated'), t('passwordUpdatedDesc'), [
          { text: t('ok'), onPress: () => router.replace('/auth/login') },
        ]);
      }
    } catch (err) {
      console.error('Password reset error:', err);
      showAlert(t('error'), t('somethingWrong') || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <LinearGradient
      colors={[...AppTheme.gradients.screen]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <Text style={styles.icon}>🔐</Text>
          <Text style={styles.title}>{t('resetPassword')}</Text>
          <Text style={styles.subtitle}>{t('enterNewPassword') || 'Enter your new password below.'}</Text>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('newPassword')}</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
              />
              <Text style={styles.hint}>{t('passwordHintStrong')}</Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>{t('confirmPassword')}</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#666"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={handleReset}
              disabled={loading}
            >
              <LinearGradient
                colors={['#e94560', '#c23a51']}
                style={styles.buttonGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{t('resetPassword')}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.md,
    padding: 16,
    fontSize: 16,
    color: AppTheme.colors.textPrimary,
  },
  hint: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  button: {
    marginTop: 8,
    borderRadius: AppTheme.radius.md,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
  },
});
