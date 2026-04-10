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
import { getResetPasswordRedirectUri } from '../../services/authRedirect';
import { supabase } from '../../services/supabase';
import { validateEmail } from '../../utils/validation';
import { checkRateLimit, recordAttempt, formatRetryMessage } from '../../utils/rateLimiter';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
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
    if (!email) {
      showAlert(t('error'), t('enterYourEmail'));
      return;
    }

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      showAlert(t('error'), t(emailResult.error!));
      return;
    }

    const limit = checkRateLimit('password-reset', { maxAttempts: 3, windowMs: 60000, lockoutMs: 300000 });
    if (!limit.allowed) {
      showAlert(t('error'), formatRetryMessage(limit.retryAfterMs));
      return;
    }

    setLoading(true);
    recordAttempt('password-reset');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordRedirectUri(),
      });

      if (error) {
        showAlert(t('error'), error.message);
      } else {
        router.replace({
          pathname: '/auth/password-reset-sent',
          params: { email },
        });
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
          <Text style={styles.icon}>🔑</Text>
          <Text style={styles.title}>{t('forgotPassword')}</Text>
          <Text style={styles.subtitle}>{t('resetEmailSentDesc')}</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('email')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('yourEmail')}
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
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
                <Text style={styles.buttonText}>{t('sendResetLink')}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backText}>{t('backToLogin')}</Text>
          </TouchableOpacity>
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
  inputContainer: {
    marginBottom: 24,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
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
  button: {
    borderRadius: AppTheme.radius.md,
    overflow: 'hidden',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
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
  backButton: {
    padding: 16,
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
