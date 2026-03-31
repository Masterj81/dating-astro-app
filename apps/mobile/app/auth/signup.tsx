import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppleIcon from '../../components/AppleIcon';
import AuthBrandMark from '../../components/AuthBrandMark';
import { AppTheme } from '../../constants/theme';
import { showAlert } from '../../utils/alert';
import LanguageSelector from '../../components/LanguageSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { validateEmail, validateName, validatePassword } from '../../utils/validation';
import { useAuth } from '../_layout';
import { checkRateLimit, recordAttempt, resetRateLimit, formatRetryMessage } from '../../utils/rateLimiter';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const { signUp, signInWithGoogle, signInWithApple, signInWithFacebook } = useAuth();
  const { t } = useLanguage();

  // Animations
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(30))[0];
  const scaleAnim = useState(new Animated.Value(0.8))[0];
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: false,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, []);

  const handleSignup = async () => {
    if (!name || !email || !password) {
      showAlert(t('error'), t('fillAllFields'));
      return;
    }

    const nameResult = validateName(name);
    if (!nameResult.valid) {
      showAlert(t('error'), t(nameResult.error!));
      return;
    }

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      showAlert(t('error'), t(emailResult.error!));
      return;
    }

    const passwordResult = validatePassword(password);
    if (!passwordResult.valid) {
      showAlert(t('error'), t(passwordResult.error!));
      return;
    }

    const limit = checkRateLimit('signup', { maxAttempts: 3, windowMs: 60000, lockoutMs: 600000 });
    if (!limit.allowed) {
      showAlert(t('error'), formatRetryMessage(limit.retryAfterMs));
      return;
    }

    setLoading(true);
    recordAttempt('signup');
    const { error } = await signUp(email, password, name);
    setLoading(false);

    if (error) {
      showAlert(t('error'), t('signupError') || 'Unable to create account. Please try again.');
    } else {
      // Show success message and navigate to verify email
      showAlert(
        t('accountCreated') || 'Account Created',
        t('checkEmailVerification') || 'Please check your email to verify your account.'
      );
      // Navigate after alert (works on both web and native)
      router.replace('/auth/verify-email');
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'apple' | 'facebook') => {
    setSocialLoading(provider);
    try {
      const signInFn =
        provider === 'google' ? signInWithGoogle :
        provider === 'apple' ? signInWithApple :
        signInWithFacebook;
      const { error } = await signInFn();
      if (error) {
        showAlert(t('error'), t('socialAuthError'));
      } else {
        router.replace('/');
      }
    } catch {
      showAlert(t('error'), t('socialAuthError'));
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <LinearGradient
      colors={[...AppTheme.gradients.screen]}
      style={styles.container}
    >
      {/* Language Selector */}
      <View style={styles.languageContainer}>
        <LanguageSelector />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Header with animation */}
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }],
                }
              ]}
            >
              <AuthBrandMark />
              <Text style={styles.title}>{t('joinTheCosmos')}</Text>
              <Text style={styles.subtitle}>{t('createCelestialProfile')}</Text>
            </Animated.View>

            {/* Zodiac ring animation */}
            <Animated.View
              style={[
                styles.zodiacContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                }
              ]}
            >
              <Text style={styles.zodiacRing}>♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓</Text>
            </Animated.View>

            {/* Form with animation */}
            <Animated.View
              style={[
                styles.form,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                }
              ]}
            >
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('name')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('yourName')}
                  placeholderTextColor="#666"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>

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
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('password')}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    placeholder="********"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(prev => !prev)}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#f3d7dd"
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>{t('passwordHintStrong')}</Text>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handleSignup}
                disabled={loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#e94560', '#c23a51']}
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t('createAccount')}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Social auth divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('orContinueWith')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social auth buttons */}
              <View style={styles.socialContainer}>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('google')}
                  disabled={!!socialLoading}
                >
                  {socialLoading === 'google' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.socialButtonText}>G</Text>
                  )}
                </TouchableOpacity>

                {(Platform.OS === 'ios' || Platform.OS === 'web') && (
                  <TouchableOpacity
                    style={styles.socialButton}
                    onPress={() => handleSocialAuth('apple')}
                    disabled={!!socialLoading}
                  >
                    {socialLoading === 'apple' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <AppleIcon size={24} color="#fff" />
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('facebook')}
                  disabled={!!socialLoading}
                >
                  {socialLoading === 'facebook' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.socialButtonText}>f</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>{t('alreadyHaveAccount')} </Text>
                <Link href="/auth/login" asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>{t('signIn')}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </Animated.View>
          </View>
        </ScrollView>
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
  languageContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  keyboardView: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48
  },
  header: {
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
    fontStyle: 'italic'
  },
  zodiacContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  zodiacRing: {
    fontSize: 18,
    color: '#e94560',
    letterSpacing: 8,
    opacity: 0.6,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center'
  },
  inputContainer: {
    marginBottom: 20
  },
  label: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.md,
    padding: 16,
    fontSize: 16,
    color: AppTheme.colors.textPrimary
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerWrapper: {
    flex: 1,
    backgroundColor: '#f6f1ea',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerWrapperSmall: {
    flex: 0.7,
    backgroundColor: '#f6f1ea',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    color: '#1c1a24',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      height: 50,
      paddingHorizontal: 12,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: '#f6f1ea',
      color: '#1c1a24',
      fontSize: 14,
      width: '100%',
      borderRadius: 12,
    }),
  } as any,
  pickerItem: {
    color: '#1c1a24',
  },
  pickerItemPlaceholder: {
    color: '#7f6f77',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  passwordInput: {
    flex: 1,
  },
  passwordToggle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  preferenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  preferenceOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  preferenceOptionActive: {
    backgroundColor: 'rgba(233, 69, 96, 0.16)',
    borderColor: 'rgba(233, 69, 96, 0.55)',
  },
  preferenceOptionText: {
    color: '#d3d0da',
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceOptionTextActive: {
    color: '#fff4f6',
  },
  button: {
    marginTop: 8,
    borderRadius: AppTheme.radius.md,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center'
  },
  buttonText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600'
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dividerText: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    marginHorizontal: 16,
  },
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: AppTheme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: AppTheme.colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24
  },
  footerText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14
  },
  linkText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600'
  },
});
