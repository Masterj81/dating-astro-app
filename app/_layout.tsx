import * as Sentry from '@sentry/react-native';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LogBox, Platform } from 'react-native';
import { AuthContext, useAuth } from '../contexts/AuthContext';

// Re-export useAuth for backward compatibility
export { useAuth };

// Suppress known deprecation warnings from dependencies
if (Platform.OS === 'web') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args[0];
    // React Navigation's pointerEvents deprecation
    if (message?.includes?.('pointerEvents')) return;
    // expo-av deprecation (transitive deps may still use it)
    if (message?.includes?.('expo-av')) return;
    // shadow* style props deprecation (react-native-web)
    if (message?.includes?.('shadow*')) return;
    if (message?.includes?.('textShadow*')) return;
    // useNativeDriver not supported on web
    if (message?.includes?.('useNativeDriver')) return;
    // expo-notifications web limitation
    if (message?.includes?.('expo-notifications')) return;
    // SecureStore size limitation on web
    if (message?.includes?.('SecureStore')) return;
    originalWarn.apply(console, args);
  };
} else {
  // Suppress on native as well using LogBox
  LogBox.ignoreLogs([
    'props.pointerEvents is deprecated',
    '[expo-av]',
  ]);
}
import { LanguageProvider } from '../contexts/LanguageContext';
import { PremiumProvider } from '../contexts/PremiumContext';
import PaywallModal from '../components/PaywallModal';
import { registerAndSavePushToken, clearPushToken, startPushTokenRefresh } from '../services/notifications';
import { initializePurchases } from '../services/purchases';
import { supabase } from '../services/supabase';
import { syncWidgetWithProfile } from '../services/widgetService';
import { registerServiceWorker, setupInstallPrompt } from '../services/pwa';

// Only initialize Sentry on native platforms
if (Platform.OS !== 'web') {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://8efb9346d012b2477c4c849bcaae2238@o4510839384178688.ingest.us.sentry.io/4510839416225792',

    // Disable PII collection for privacy (no IP addresses, cookies, etc.)
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: true,

    // Configure Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

    // Only enable in production
    enabled: !__DEV__,
  });
}

// Safe Sentry wrappers for web compatibility
const safeSentry = {
  captureException: (error: any, hint?: any) => {
    if (Platform.OS !== 'web') Sentry.captureException(error, hint);
    else console.error('Error:', error);
  },
  captureMessage: (message: string, level?: any) => {
    if (Platform.OS !== 'web') Sentry.captureMessage(message, level);
    else console.warn('Sentry message:', message);
  },
  setUser: (user: { id: string } | null) => {
    if (Platform.OS !== 'web') Sentry.setUser(user);
  },
};


function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const fetchProfile = async (userId: string) => {
    try {
      // Add timeout to prevent hanging on slow networks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, sun_sign')
        .eq('id', userId)
        .maybeSingle()
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setOnboardingCompleted(data?.onboarding_completed ?? false);

      // Sync sun sign with iOS widget
      if (data?.sun_sign) {
        syncWidgetWithProfile(data.sun_sign);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('Profile fetch timed out');
        safeSentry.captureMessage('Profile fetch timed out', 'warning');
      } else {
        console.error('Error in fetchProfile:', err);
        safeSentry.captureException(err);
      }
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    // Refresh user data from Supabase Auth (for email_confirmed_at)
    const { data: { user: refreshedUser } } = await supabase.auth.getUser();
    if (refreshedUser) {
      setUser(refreshedUser);
      setIsEmailVerified(!!refreshedUser.email_confirmed_at);
    }
    await fetchProfile(user.id);
  };

  const ensureProfileExists = async (userId: string, name?: string) => {
    try {
      // Add timeout to prevent hanging on slow networks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const { data, error: selectError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()
        .abortSignal(controller.signal);

      if (selectError) {
        clearTimeout(timeoutId);
        console.error('Error checking profile:', selectError);
        return;
      }

      if (!data) {
        const { error: insertError } = await supabase.from('profiles').insert({
          id: userId,
          name: name || 'User',
        }).abortSignal(controller.signal);

        clearTimeout(timeoutId);

        if (insertError) {
          console.error('Error creating profile:', insertError);
          // Report to Sentry for debugging
          safeSentry.captureException(insertError, {
            extra: { userId, name, context: 'ensureProfileExists' }
          });
        }
      } else {
        clearTimeout(timeoutId);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('ensureProfileExists timed out');
        safeSentry.captureMessage('ensureProfileExists timed out', 'warning');
      } else {
        console.error('Unexpected error in ensureProfileExists:', err);
        safeSentry.captureException(err);
      }
    }
  };

  useEffect(() => {
    // Timeout to prevent infinite loading on slow networks
    const AUTH_TIMEOUT_MS = 10000;
    let didTimeout = false;

    const timeoutId = setTimeout(() => {
      didTimeout = true;
      console.warn('Auth session check timed out');
      safeSentry.captureMessage('Auth session check timed out', 'warning');
      setLoading(false); // Proceed without auth - user will see login screen
    }, AUTH_TIMEOUT_MS);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (didTimeout) return; // Ignore if we already timed out
        clearTimeout(timeoutId);
        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          setIsEmailVerified(!!currentUser.email_confirmed_at);
          await fetchProfile(currentUser.id); // Wait for profile to load before setting loading=false
        }
        setLoading(false);
      })
      .catch((error) => {
        if (didTimeout) return;
        clearTimeout(timeoutId);
        console.error('Error getting session:', error);
        safeSentry.captureException(error, { extra: { context: 'getSession' } });
        setLoading(false); // Proceed to login screen on error
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Update state synchronously first to ensure UI updates
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setIsEmailVerified(!!currentUser.email_confirmed_at);

        // Run async operations with timeout protection (don't await - fire and forget)
        // This prevents blocking the auth state callback on slow networks
        const runAsyncOperations = async () => {
          const CALLBACK_TIMEOUT_MS = 15000;
          const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Auth callback timeout')), CALLBACK_TIMEOUT_MS)
          );

          try {
            await Promise.race([
              (async () => {
                // Always ensure profile exists on sign-in (handles failed profile creation)
                if (event === 'SIGNED_IN') {
                  const displayName =
                    currentUser.user_metadata?.full_name ||
                    currentUser.user_metadata?.name ||
                    currentUser.email?.split('@')[0] ||
                    'User';
                  await ensureProfileExists(currentUser.id, displayName);
                }
                await fetchProfile(currentUser.id);
              })(),
              timeoutPromise,
            ]);
          } catch (err: any) {
            if (err.message === 'Auth callback timeout') {
              console.warn('Auth state change async operations timed out');
              safeSentry.captureMessage('Auth callback async operations timed out', 'warning');
            } else {
              console.error('Error in auth state change:', err);
              safeSentry.captureException(err);
            }
          }
        };

        // Fire and forget - don't block the callback
        runAsyncOperations();
      }

      // Handle password recovery deep link
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/reset-password');
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Handle deep links for password reset
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      const url = event.url;
      if (url.includes('reset-password') || url.includes('type=recovery')) {
        // Supabase will fire PASSWORD_RECOVERY event automatically
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  // Set Sentry user context on auth changes
  useEffect(() => {
    if (user) {
      safeSentry.setUser({ id: user.id });
    } else {
      safeSentry.setUser(null);
    }
  }, [user]);

  // Register for push notifications and initialize purchases when user logs in
  useEffect(() => {
    if (!user) return;

    // Push notifications only on native
    if (Platform.OS !== 'web') {
      registerAndSavePushToken(user.id);
      // Re-register token when app comes back to foreground (tokens can rotate)
      const stopRefresh = startPushTokenRefresh(user.id);

      // Initialize RevenueCat for native
      initializePurchases(user.id);

      return () => stopRefresh();
    }
  }, [user]);

  // Handle notification taps (native only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    // Require expo-notifications only on native to avoid web warnings
    const Notifications = require('expo-notifications');
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'match') {
        router.push('/(tabs)/matches');
      } else if (data?.type === 'message' && data?.matchId) {
        router.push(`/chat/${data.matchId}`);
      }
    });

    return () => subscription.remove();
  }, []);

  // Initialize PWA on web
  useEffect(() => {
    if (Platform.OS === 'web') {
      registerServiceWorker();
      setupInstallPrompt();
    }
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (!error && data.user) {
      await supabase.from('profiles').insert({ id: data.user.id, name });
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    if (user) {
      await clearPushToken(user.id);
    }
    setOnboardingCompleted(false);
    setIsEmailVerified(false);
    await supabase.auth.signOut();
  };

  const signInWithGoogle = async () => {
    try {
      const { signInWithProvider } = await import('../services/socialAuth');
      const { error } = await signInWithProvider('google');
      return { error };
    } catch (err) {
      return { error: err };
    }
  };

  const signInWithApple = async () => {
    try {
      const { signInWithApple: appleSignIn } = await import('../services/socialAuth');
      const { error } = await appleSignIn();
      return { error };
    } catch (err) {
      return { error: err };
    }
  };

  const signInWithFacebook = async () => {
    try {
      const { signInWithProvider } = await import('../services/socialAuth');
      const { error } = await signInWithProvider('facebook');
      return { error };
    } catch (err) {
      return { error: err };
    }
  };

  return (
    <LanguageProvider>
      <AuthContext.Provider
        value={{
          user,
          session,
          loading,
          isEmailVerified,
          onboardingCompleted,
          signUp,
          signIn,
          signOut,
          signInWithGoogle,
          signInWithApple,
          signInWithFacebook,
          refreshProfile,
        }}
      >
        <PremiumProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#1a1a2e' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
              contentStyle: { backgroundColor: '#0f0f1a' },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="match/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="premium" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="splash" options={{ headerShown: false }} />
          </Stack>
          <PaywallModal />
        </PremiumProvider>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

// Only wrap with Sentry on native platforms
export default Platform.OS === 'web' ? RootLayout : Sentry.wrap(RootLayout);
