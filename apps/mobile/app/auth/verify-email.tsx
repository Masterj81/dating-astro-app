import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AuthBrandMark from '../../components/AuthBrandMark';
import { showAlert } from '../../utils/alert';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { getAuthCallbackRedirectUri } from '../../services/authRedirect';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

const RESEND_COOLDOWN = 60;
const POLL_INTERVAL = 3000;

export default function VerifyEmailScreen() {
  const { user, refreshProfile, signOut, isEmailVerified } = useAuth();
  const { t } = useLanguage();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, []);

  // If the user is already verified (e.g., came back to this screen), redirect immediately
  useEffect(() => {
    if (isEmailVerified) {
      router.replace('/');
    }
  }, [isEmailVerified]);

  // Poll for email verification
  useEffect(() => {
    // Don't poll if already verified
    if (isEmailVerified) return;

    const interval = setInterval(async () => {
      try {
        const { data: { user: refreshedUser } } = await supabase.auth.getUser();
        if (refreshedUser?.email_confirmed_at) {
          clearInterval(interval);
          await refreshProfile();
          router.replace('/');
        }
      } catch (err) {
        // Network error during polling — silently retry on next interval
        console.warn('Email verification poll failed:', err);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [isEmailVerified]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (resendCooldown > 0 || !user?.email) return;

    setSending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
      options: {
        emailRedirectTo: getAuthCallbackRedirectUri(),
      },
    });
    setSending(false);

    if (error) {
      showAlert(t('error'), error.message);
    } else {
      setResendCooldown(RESEND_COOLDOWN);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth/login');
  };

  return (
    <LinearGradient
      colors={[...AppTheme.gradients.screen]}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <AuthBrandMark size={84} />

        {/* Progress context -- show where they are in the overall journey */}
        <View style={styles.progressHint}>
          <View style={styles.progressDots}>
            <View style={[styles.progressDot, styles.progressDotDone]} />
            <View style={[styles.progressDot, styles.progressDotActive]} />
            <View style={styles.progressDot} />
          </View>
          <Text style={styles.progressLabel}>
            {t('verifyEmailProgress') || 'Account created -- now verify your email'}
          </Text>
        </View>

        <Text style={styles.title}>{t('checkYourEmail')}</Text>
        <Text style={styles.subtitle}>
          {t('verificationEmailSent')}
        </Text>
        {user?.email && (
          <Text style={styles.email}>{user.email}</Text>
        )}

        <View style={styles.pollingIndicator}>
          <ActivityIndicator color="#e94560" size="small" />
          <Text style={styles.pollingText}>{t('waitingForVerification') || 'Listening for your confirmation...'}</Text>
        </View>

        {/* Helpful tip */}
        <View style={styles.tipBox}>
          <Text style={styles.tipIcon}>{'\uD83D\uDCE7'}</Text>
          <Text style={styles.tipText}>
            {t('verifyEmailTip') || "Check your spam or promotions folder if you don't see the email. It arrives within a minute."}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.resendButton, resendCooldown > 0 && styles.resendButtonDisabled]}
          onPress={handleResend}
          disabled={resendCooldown > 0 || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.resendText}>
              {resendCooldown > 0
                ? `${t('resendIn')} ${resendCooldown}s`
                : t('resendVerificationEmail')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={handleSignOut}>
          <Text style={styles.backText}>{t('backToLogin')}</Text>
        </TouchableOpacity>
      </Animated.View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  progressHint: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressDotDone: {
    backgroundColor: AppTheme.colors.coral,
  },
  progressDotActive: {
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  progressLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  title: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: AppTheme.colors.coral,
    fontWeight: '600',
    marginBottom: 24,
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  pollingText: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 340,
  },
  tipIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  resendButton: {
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 1,
    borderColor: AppTheme.colors.coral,
    borderRadius: AppTheme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginBottom: 16,
    minWidth: 250,
    alignItems: 'center',
  },
  resendButtonDisabled: {
    borderColor: '#444',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  resendText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  backButton: {
    padding: 12,
  },
  backText: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
