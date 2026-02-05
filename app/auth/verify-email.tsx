import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

const RESEND_COOLDOWN = 60;
const POLL_INTERVAL = 3000;

export default function VerifyEmailScreen() {
  const { user, refreshProfile, signOut } = useAuth();
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
  }, []);

  // Poll for email verification
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: { user: refreshedUser } } = await supabase.auth.getUser();
      if (refreshedUser?.email_confirmed_at) {
        clearInterval(interval);
        await refreshProfile();
        router.replace('/');
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, []);

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
    });
    setSending(false);

    if (error) {
      Alert.alert(t('error'), error.message);
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
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.icon}>✉</Text>
        <Text style={styles.title}>{t('checkYourEmail')}</Text>
        <Text style={styles.subtitle}>
          {t('verificationEmailSent')}
        </Text>
        {user?.email && (
          <Text style={styles.email}>{user.email}</Text>
        )}

        <View style={styles.pollingIndicator}>
          <ActivityIndicator color="#e94560" size="small" />
          <Text style={styles.pollingText}>{t('loading')}</Text>
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
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: '#e94560',
    fontWeight: '600',
    marginBottom: 32,
  },
  pollingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  pollingText: {
    color: '#666',
    fontSize: 13,
  },
  resendButton: {
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 12,
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  backButton: {
    padding: 12,
  },
  backText: {
    color: '#666',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
