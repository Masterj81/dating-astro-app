import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { checkRateLimit, recordAttempt, formatRetryMessage } from '../../utils/rateLimiter';
import { buttonPress, errorNotification } from '../../services/haptics';
import {
  useReduceMotion,
  getButtonA11yProps,
  getTextInputA11yProps,
  a11yColors,
} from '../../utils/accessibility';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const { signUp, signInWithGoogle, signInWithApple, signInWithFacebook } = useAuth();
  const { t } = useLanguage();
  const reduceMotion = useReduceMotion();

  // Inline validation errors (shown below each field)
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Refs for keyboard flow
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  // Animations - start at final values if reduce motion is enabled
  const fadeAnim = useState(new Animated.Value(reduceMotion ? 1 : 0))[0];
  const slideAnim = useState(new Animated.Value(reduceMotion ? 0 : 30))[0];
  const scaleAnim = useState(new Animated.Value(reduceMotion ? 1 : 0.8))[0];
  useEffect(() => {
    if (reduceMotion) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      scaleAnim.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, [reduceMotion]);

  // Clear inline error when user starts typing in a field
  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError) setNameError('');
  };
  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError('');
  };
  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (passwordError) setPasswordError('');
  };

  const handleSignup = async () => {
    // Inline validation -- set errors on each field instead of alert popups
    let hasError = false;

    const nameResult = name.trim() ? validateName(name) : { valid: false, error: 'signupInlineNameRequired' };
    if (!nameResult.valid) {
      setNameError(t(nameResult.error!) || nameResult.error!);
      hasError = true;
    } else {
      setNameError('');
    }

    const emailResult = email.trim() ? validateEmail(email) : { valid: false, error: 'signupInlineEmailRequired' };
    if (!emailResult.valid) {
      setEmailError(t(emailResult.error!) || emailResult.error!);
      hasError = true;
    } else {
      setEmailError('');
    }

    const passwordResult = password ? validatePassword(password) : { valid: false, error: 'signupInlinePasswordRequired' };
    if (!passwordResult.valid) {
      setPasswordError(t(passwordResult.error!) || passwordResult.error!);
      hasError = true;
    } else {
      setPasswordError('');
    }

    if (hasError) {
      errorNotification();
      return;
    }

    const limit = checkRateLimit('signup', { maxAttempts: 3, windowMs: 60000, lockoutMs: 600000 });
    if (!limit.allowed) {
      errorNotification();
      showAlert(t('error'), formatRetryMessage(limit.retryAfterMs));
      return;
    }

    buttonPress();
    setLoading(true);
    recordAttempt('signup');
    const { error } = await signUp(email, password, name);
    setLoading(false);

    if (error) {
      errorNotification();
      showAlert(t('error'), t('signupError') || 'Unable to create account. Please try again.');
    } else {
      // Navigate immediately -- the verify-email screen shows the success context
      router.replace('/auth/verify-email');
    }
  };

  const handleSocialAuth = async (provider: 'google' | 'apple' | 'facebook') => {
    buttonPress();
    setSocialLoading(provider);
    try {
      const signInFn =
        provider === 'google' ? signInWithGoogle :
        provider === 'apple' ? signInWithApple :
        signInWithFacebook;
      const { error } = await signInFn();
      if (error) {
        errorNotification();
        showAlert(t('error'), t('socialAuthError'));
      } else {
        router.replace('/');
      }
    } catch {
      errorNotification();
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
              accessibilityRole="header"
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
                <Text style={styles.label} nativeID="nameLabel">{t('name')}</Text>
                <TextInput
                  style={[styles.input, nameError ? styles.inputError : null]}
                  placeholder={t('yourName')}
                  placeholderTextColor="#666"
                  value={name}
                  onChangeText={handleNameChange}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailInputRef.current?.focus()}
                  {...getTextInputA11yProps(t('a11y.nameInput') || t('name'), t('a11y.requiredField'))}
                  accessibilityLabelledBy="nameLabel"
                />
                {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label} nativeID="emailLabel">{t('email')}</Text>
                <TextInput
                  ref={emailInputRef}
                  style={[styles.input, emailError ? styles.inputError : null]}
                  placeholder={t('yourEmail')}
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  {...getTextInputA11yProps(t('a11y.emailInput') || t('email'), t('a11y.requiredField'))}
                  accessibilityLabelledBy="emailLabel"
                />
                {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label} nativeID="passwordLabel">{t('password')}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.input, styles.passwordInput, passwordError ? styles.inputError : null]}
                    placeholder="********"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry={!showPassword}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleSignup}
                    {...getTextInputA11yProps(t('a11y.passwordInput') || t('password'), t('a11y.requiredField'))}
                    accessibilityLabelledBy="passwordLabel"
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(prev => !prev)}
                    {...getButtonA11yProps(showPassword ? t('hidePassword') : t('showPassword'))}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#f3d7dd"
                    />
                  </TouchableOpacity>
                </View>
                {passwordError ? (
                  <Text style={styles.fieldError}>{passwordError}</Text>
                ) : (
                  <Text style={styles.hint}>{t('passwordHintStrong')}</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handleSignup}
                disabled={loading}
                activeOpacity={0.8}
                {...getButtonA11yProps(
                  t('createAccount'),
                  t('a11y.doubleTapHint'),
                  { busy: loading }
                )}
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
  inputError: {
    borderColor: '#e94560',
  },
  fieldError: {
    color: '#e94560',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
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
