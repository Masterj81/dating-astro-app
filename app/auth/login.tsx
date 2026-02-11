import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import LanguageSelector from '../../components/LanguageSelector';
import { useLanguage } from '../../contexts/LanguageContext';
import { validateEmail } from '../../utils/validation';
import { useAuth } from '../_layout';
import {
  useReduceMotion,
  getButtonA11yProps,
  getTextInputA11yProps,
  a11yColors,
} from '../../utils/accessibility';
import { buttonPress, errorNotification } from '../../services/haptics';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const { signIn, signInWithGoogle, signInWithApple, signInWithFacebook } = useAuth();
  const { t } = useLanguage();
  const reduceMotion = useReduceMotion();

  // Refs for text inputs (for accessibility focus)
  const passwordInputRef = useRef<TextInput>(null);

  // Animations - start at final values if reduce motion is enabled
  const fadeAnim = useState(new Animated.Value(reduceMotion ? 1 : 0))[0];
  const slideAnim = useState(new Animated.Value(reduceMotion ? 0 : 30))[0];
  const scaleAnim = useState(new Animated.Value(reduceMotion ? 1 : 0.8))[0];

  useEffect(() => {
    if (reduceMotion) {
      // Skip animations
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
  }, [reduceMotion]);

  const handleLogin = async () => {
    if (!email || !password) {
      errorNotification();
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      errorNotification();
      Alert.alert(t('error'), t(emailResult.error!));
      return;
    }

    buttonPress();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      errorNotification();
      Alert.alert(t('error'), error.message);
    } else {
      router.replace('/');
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
        Alert.alert(t('error'), t('socialAuthError'));
      } else {
        router.replace('/');
      }
    } catch {
      errorNotification();
      Alert.alert(t('error'), t('socialAuthError'));
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <LinearGradient
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
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
              <Text style={styles.logoText} accessibilityLabel="">✦</Text>
              <Text style={styles.title}>{t('appName')}</Text>
              <Text style={styles.subtitle}>{t('findYourCosmicMatch')}</Text>
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
              accessibilityLabel="Zodiac symbols"
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
                <Text style={styles.label} nativeID="emailLabel">{t('email')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('yourEmail')}
                  placeholderTextColor={a11yColors.text.muted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  {...getTextInputA11yProps(t('a11y.emailInput'), t('a11y.requiredField'))}
                  accessibilityLabelledBy="emailLabel"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label} nativeID="passwordLabel">{t('password')}</Text>
                <TextInput
                  ref={passwordInputRef}
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={a11yColors.text.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  {...getTextInputA11yProps(t('a11y.passwordInput'), t('a11y.requiredField'))}
                  accessibilityLabelledBy="passwordLabel"
                />
              </View>

              <TouchableOpacity
                onPress={() => {
                  buttonPress();
                  router.push('/auth/forgot-password');
                }}
                style={styles.forgotPasswordContainer}
                {...getButtonA11yProps(t('forgotPassword'))}
              >
                <Text style={styles.forgotPasswordText}>{t('forgotPassword')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.button}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
                {...getButtonA11yProps(
                  t('signIn'),
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
                    <Text style={styles.buttonText}>{t('signIn')}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Social auth divider */}
              <View style={styles.dividerContainer} accessibilityRole="none">
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('orContinueWith')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Social auth buttons */}
              <View style={styles.socialContainer} accessibilityRole="toolbar">
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('google')}
                  disabled={!!socialLoading}
                  {...getButtonA11yProps(
                    t('a11y.loginWithGoogle'),
                    undefined,
                    { busy: socialLoading === 'google' }
                  )}
                >
                  {socialLoading === 'google' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.socialButtonText}>G</Text>
                  )}
                </TouchableOpacity>

                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={styles.socialButton}
                    onPress={() => handleSocialAuth('apple')}
                    disabled={!!socialLoading}
                    {...getButtonA11yProps(
                      t('a11y.loginWithApple'),
                      undefined,
                      { busy: socialLoading === 'apple' }
                    )}
                  >
                    {socialLoading === 'apple' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={[styles.socialButtonText, { fontFamily: 'System' }]}>{'\uF8FF'}</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialAuth('facebook')}
                  disabled={!!socialLoading}
                  {...getButtonA11yProps(
                    t('a11y.loginWithFacebook'),
                    undefined,
                    { busy: socialLoading === 'facebook' }
                  )}
                >
                  {socialLoading === 'facebook' ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.socialButtonText}>f</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>{t('dontHaveAccount')} </Text>
                <Link href="/auth/signup" asChild>
                  <TouchableOpacity {...getButtonA11yProps(t('signUp'))}>
                    <Text style={styles.linkText}>{t('signUp')}</Text>
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
    flex: 1
  },
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
  logoText: {
    fontSize: 64,
    color: '#e94560',
    marginBottom: 16,
    textShadowColor: 'rgba(233, 69, 96, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: a11yColors.text.primary,
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: a11yColors.text.secondary,
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
    color: a11yColors.text.secondary,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: a11yColors.text.primary
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -8,
  },
  forgotPasswordText: {
    color: '#e94560',
    fontSize: 14,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center'
  },
  buttonText: {
    color: a11yColors.text.primary,
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
    color: a11yColors.text.muted,
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
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialButtonText: {
    color: a11yColors.text.primary,
    fontSize: 22,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24
  },
  footerText: {
    color: a11yColors.text.secondary,
    fontSize: 14
  },
  linkText: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600'
  },
});
