import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PasswordResetSentScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { t } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <LinearGradient
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.icon}>📧</Text>
        <Text style={styles.title}>{t('resetEmailSent')}</Text>
        <Text style={styles.subtitle}>{t('resetEmailSentDesc')}</Text>
        {email && <Text style={styles.email}>{email}</Text>}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {t('checkYourEmail')}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/auth/login')}
        >
          <LinearGradient
            colors={['#e94560', '#c23a51']}
            style={styles.buttonGradient}
          >
            <Text style={styles.buttonText}>{t('backToLogin')}</Text>
          </LinearGradient>
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
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: '#e94560',
    fontWeight: '600',
    marginBottom: 24,
  },
  infoBox: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    maxWidth: 400,
    width: '100%',
  },
  infoText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 400,
    width: '100%',
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
