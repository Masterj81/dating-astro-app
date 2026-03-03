import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';

export default function PremiumSuccessScreen() {
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();
  const { refreshSubscription } = usePremium();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Refresh premium status after successful payment
    const checkStatus = async () => {
      await refreshSubscription();
      setLoading(false);
    };

    // Give Stripe webhook time to process
    const timer = setTimeout(checkStatus, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color="#e94560" />
            <Text style={styles.loadingText}>{t('processingPayment') || 'Processing your payment...'}</Text>
          </>
        ) : (
          <>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.title}>{t('welcomePremium')}</Text>
            <Text style={styles.subtitle}>{t('premiumAccessGranted')}</Text>

            <View style={styles.features}>
              <Text style={styles.featureItem}>✨ {t('unlimitedSwipes')}</Text>
              <Text style={styles.featureItem}>🌙 {t('fullNatalChart')}</Text>
              <Text style={styles.featureItem}>💫 {t('advancedSynastry')}</Text>
              <Text style={styles.featureItem}>⭐ {t('superLikes')}</Text>
            </View>

            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/(tabs)/discover')}
            >
              <LinearGradient
                colors={['#e94560', '#c23a51']}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>{t('startExploring') || 'Start Exploring'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  features: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    width: '100%',
    maxWidth: 300,
  },
  featureItem: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 300,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
