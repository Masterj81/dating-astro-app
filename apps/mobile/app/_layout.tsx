import * as Sentry from '@sentry/react-native';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, AppState, LogBox, Platform } from 'react-native';
import { AuthContext } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { PremiumProvider } from '../contexts/PremiumContext';
import OfflineBanner from '../components/OfflineBanner';
import PaywallModal from '../components/PaywallModal';
import { registerAndSavePushToken, clearPushToken, startPushTokenRefresh, NotificationPayload, NotificationType } from '../services/notifications';
import { initializePurchases } from '../services/purchases';
import { getAuthCallbackRedirectUri } from '../services/authRedirect';
import { supabase } from '../services/supabase';
import { syncWidgetWithProfile } from '../services/widgetService';
import { registerServiceWorker, setupInstallPrompt } from '../services/pwa';
import { t, getCurrentLanguage } from '../services/i18n';
import { syncPreferredLanguage, resetPreferredLanguageCache } from '../services/preferredLanguage';
import { touchLastActive, resetActivityThrottle } from '../services/activity';
import {
  clearPreSignupDraft,
  loadOnboardingDraft,
  loadPreSignupDraft,
  saveOnboardingDraft,
} from '../utils/onboardingDraft';

// Suppress known benign warnings on native only (LogBox is the proper API)
// Only in dev - production builds don't show LogBox anyway
if (__DEV__ && Platform.OS !== 'web') {
  LogBox.ignoreLogs([
    'props.pointerEvents is deprecated',
    '[expo-av]',
    // FCM not configured in the dev client -- expected, non-fatal, and the
    // yellow LogBox banner otherwise covers the chat send button during E2E.
    'Failed to get push token',
    'FirebaseApp is not initialized',
  ]);
}

// Only initialize Sentry on native platforms
if (Platform.OS !== 'web') {
  const sentryIntegrations: any[] = [Sentry.feedbackIntegration()];

  if (Platform.OS !== 'android') {
    sentryIntegrations.unshift(Sentry.mobileReplayIntegration());
  }

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,

    // Disable PII collection for privacy (no IP addresses, cookies, etc.)
    sendDefaultPii: false,

    // Enable Logs
    enableLogs: true,

    // Disable mobile replay on Android to avoid PixelCopy-related ANRs.
    replaysSessionSampleRate: Platform.OS === 'android' ? 0 : 0.1,
    replaysOnErrorSampleRate: Platform.OS === 'android' ? 0 : 1,
    integrations: sentryIntegrations,

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
    const QUERY_TIMEOUT_MS = 8000;

    try {
      const queryPromise = supabase
        .from('profiles')
        .select('onboarding_completed, sun_sign')
        .eq('id', userId)
        .maybeSingle();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), QUERY_TIMEOUT_MS)
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

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
      if (err?.message === 'Profile fetch timeout') {
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
    try {
      // Refresh user data from Supabase Auth (for email_confirmed_at)
      const { data: { user: refreshedUser } } = await supabase.auth.getUser();
      if (refreshedUser) {
        setUser(refreshedUser);
        setIsEmailVerified(!!refreshedUser.email_confirmed_at);
      }
      await fetchProfile(user.id);
    } catch (err) {
      console.error('Error refreshing profile:', err);
      safeSentry.captureException(err);
    }
  };

  const ensureProfileExists = async (userId: string, name?: string, gender?: string) => {
    const QUERY_TIMEOUT_MS = 8000;

    const createTimeout = (message: string) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(message)), QUERY_TIMEOUT_MS)
      );

    try {
      // Check if profile exists
      const selectPromise = supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      const { data, error: selectError } = await Promise.race([
        selectPromise,
        createTimeout('Profile check timeout'),
      ]);

      if (selectError) {
        console.error('Error checking profile:', selectError);
        return;
      }

      // Create profile if it doesn't exist
      if (!data) {
        const insertPromise = supabase.from('profiles').insert({
          id: userId,
          name: name || 'User',
          gender: gender || null,
        });

        const { error: insertError } = await Promise.race([
          insertPromise,
          createTimeout('Profile insert timeout'),
        ]);

        if (insertError) {
          console.error('Error creating profile:', insertError);
          safeSentry.captureException(insertError, {
            extra: { userId, name, context: 'ensureProfileExists' },
          });
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('timeout')) {
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

    // Track whether sign-out was initiated by the user
    let userInitiatedSignOut = false;
    const originalSignOut = supabase.auth.signOut.bind(supabase.auth);
    supabase.auth.signOut = async (...args: Parameters<typeof originalSignOut>) => {
      userInitiatedSignOut = true;
      return originalSignOut(...args);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Handle unexpected sign-out (e.g. expired token that could not be refreshed)
      // P1-5: explicitly clear *all* auth-dependent state and route to login so
      // premium content does not flash while stale state tears down.
      if (event === 'SIGNED_OUT') {
        setOnboardingCompleted(false);
        setIsEmailVerified(false);
        setSession(null);
        setUser(null);
        // Drop the cached "already written" markers so the next account syncs
        // its own language and reports its own visit instead of inheriting
        // this one's no-op.
        resetPreferredLanguageCache();
        resetActivityThrottle();
        if (!userInitiatedSignOut) {
          Alert.alert(
            t('sessionExpiredTitle'),
            t('sessionExpiredMessage'),
            [{ text: t('ok') }]
          );
        }
        try {
          router.replace('/auth/login');
        } catch {
          // Router may not be mounted yet on cold start — safe to ignore.
        }
        userInitiatedSignOut = false;
        return;
      }

      // TOKEN_REFRESHED keeps the user signed in but the underlying access
      // token rotated — refresh verified email flag so UI stays in sync.
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setIsEmailVerified(!!session.user.email_confirmed_at);
      }

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
                  const profileGender =
                    typeof currentUser.user_metadata?.gender === 'string'
                      ? currentUser.user_metadata.gender
                      : undefined;
                  await ensureProfileExists(currentUser.id, displayName, profileGender);

                  // Phase B: hand off the pre-signup welcome draft to the
                  // user-keyed draft so the onboarding screens pre-fill
                  // birth date / time / city. We never overwrite an
                  // existing user-keyed draft (returning users signing in
                  // again on the same device should keep their own draft),
                  // and we always clear the pre-signup copy so it does not
                  // leak across accounts on a shared device.
                  try {
                    const preSignup = await loadPreSignupDraft();
                    if (preSignup) {
                      const existing = await loadOnboardingDraft(currentUser.id);
                      if (!existing) {
                        await saveOnboardingDraft(currentUser.id, preSignup);
                      }
                      await clearPreSignupDraft();
                    }
                  } catch (handoffErr) {
                    if (__DEV__) console.warn('[welcome] pre-signup hand-off failed:', handoffErr);
                  }
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

  // Handle deep links with validation
  useEffect(() => {
    // Must stay in sync with android.intentFilters hosts in app.json.
    // The legacy astrodatingapp.com hosts are intentionally gone: they now
    // redirect to junosynastry.com, are no longer declared as App Links, and
    // failing Google Play domain checks. `localhost` is for dev only.
    const ALLOWED_DEEP_LINK_HOSTS = ['app.junosynastry.com', 'www.junosynastry.com', 'localhost'];
    const ALLOWED_DEEP_LINK_PATHS = ['/auth/', '/app/', '/invite/', '/download'];

    const handleUrl = (event: { url: string }) => {
      try {
        const parsed = new URL(event.url);

        // 1. Scheme must be https or our custom app scheme.
        const isCustomScheme = parsed.protocol === 'astrodating:';
        const isHttps = parsed.protocol === 'https:';
        if (!isHttps && !isCustomScheme) {
          return;
        }

        // 2. Host must be one we trust. Custom scheme links don't have a
        //    conventional host — we require it to be one of our known hosts
        //    or empty (e.g. `astrodating:/auth/...`). For https, the hostname
        //    must be in the allowlist. This is the critical check — we NEVER
        //    let `type=recovery` substring bypass it (P1-7).
        if (isHttps && !ALLOWED_DEEP_LINK_HOSTS.includes(parsed.hostname)) {
          return;
        }
        if (isCustomScheme) {
          const host = parsed.hostname;
          if (host && !ALLOWED_DEEP_LINK_HOSTS.includes(host)) {
            return;
          }
        }

        // 3. Parse query params safely and check type=recovery explicitly.
        //    URL.searchParams handles fragments incorrectly (Supabase puts
        //    tokens after `#`), so also inspect the hash.
        const params = new URLSearchParams(parsed.search);
        let recoveryFlag = params.get('type') === 'recovery';
        if (!recoveryFlag && parsed.hash) {
          const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
          recoveryFlag = hashParams.get('type') === 'recovery';
        }

        // 4. Path must start with one of the allowed prefixes.
        //    Recovery tokens may arrive on a root path — allow that ONLY
        //    when the host check above has already passed.
        const pathAllowed = ALLOWED_DEEP_LINK_PATHS.some((prefix) =>
          parsed.pathname.startsWith(prefix)
        );
        if (!pathAllowed && !recoveryFlag) {
          return;
        }

        // Password recovery handled by Supabase auth state change
      } catch {
        // Invalid URL — ignore silently
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  // Set Sentry user context on auth changes (hashed ID for privacy)
  useEffect(() => {
    if (user) {
      // Hash user ID to prevent PII leakage to Sentry
      const hashId = (id: string) => {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
          hash = ((hash << 5) - hash) + id.charCodeAt(i);
          hash |= 0;
        }
        return 'u_' + Math.abs(hash).toString(36);
      };
      safeSentry.setUser({ id: hashId(user.id) });
    } else {
      safeSentry.setUser(null);
    }
  }, [user]);

  // P2-8: re-verify the Supabase session whenever the app returns to
  // foreground after more than 5 minutes in the background. If the refresh
  // token has expired, Supabase will emit SIGNED_OUT (handled above) which
  // tears down premium state and routes to /auth/login. This catches the
  // case where a user comes back after a long break and we don't want them
  // silently browsing with a stale session.
  useEffect(() => {
    const REAUTH_THRESHOLD_MS = 5 * 60 * 1000;
    let lastBackgroundedAt: number | null = null;

    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundedAt = Date.now();
        return;
      }
      if (nextState === 'active') {
        // A return to the foreground is a visit. Recorded before the session
        // checks below so a stale-token bail-out doesn't lose the beacon.
        void touchLastActive();

        const backgroundedAt = lastBackgroundedAt;
        lastBackgroundedAt = null;
        if (!backgroundedAt) return;
        if (Date.now() - backgroundedAt < REAUTH_THRESHOLD_MS) return;

        try {
          const { data: { session: refreshed } } = await supabase.auth.getSession();
          // If the session is gone, onAuthStateChange -> SIGNED_OUT will have
          // already fired or will fire once supabase-js notices. Force the
          // UI to the login screen defensively too.
          if (!refreshed) {
            try {
              router.replace('/auth/login');
            } catch {
              // Router not mounted yet — safe to ignore.
            }
          }
        } catch (err) {
          safeSentry.captureException(err, { extra: { context: 'foreground-reauth' } });
        }
      }
    });

    return () => sub.remove();
  }, []);

  // Capture the language this account reads in, so lifecycle email can
  // eventually be written in it. Runs on every sign-in rather than only on an
  // explicit language change, so accounts that never touch the picker are
  // still recorded. Not native-only: the web build reads the same column.
  useEffect(() => {
    if (!user) return;
    void syncPreferredLanguage(getCurrentLanguage());
  }, [user]);

  // Record that this account opened the app. Without this write nothing in the
  // product can answer "did they come back", which is the question the whole
  // retention effort turns on — and every lifecycle email past D+1 needs it to
  // know whether to cancel itself. Throttled inside the service.
  useEffect(() => {
    if (!user) return;
    void touchLastActive();
  }, [user]);

  // Register for push notifications and initialize purchases when user logs in
  useEffect(() => {
    if (!user) return;

    // Push notifications only on native
    if (Platform.OS !== 'web') {
      // Silent on sign-in: register only if permission already exists. The
      // request itself happens after the chart reveal (onboarding/birth-info),
      // where the reader has just been shown something worth being notified
      // about. See registerForPushNotificationsAsync.
      registerAndSavePushToken(user.id, false);
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications');

    const VALID_TYPES: NotificationType[] = [
      'match', 'message', 'like',
      'dailyHoroscope', 'retrogradeAlert', 'promotion',
    ];

    // P2-2: prevent arbitrary deep link navigation if the push payload is
    // forged or the backend is compromised. Any ID used to build a route
    // MUST pass this strict UUID check; anything else is silently dropped
    // (and logged in dev) and the user falls back to the default tab.
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUuid = (value: unknown): value is string =>
      typeof value === 'string' && UUID_REGEX.test(value);

    const handleNotificationResponse = (response: any) => {
      const data = response?.notification?.request?.content?.data as NotificationPayload | undefined;
      if (!data || typeof data.type !== 'string') return;
      // Normalize the legacy 'messages' spelling to the canonical 'message'.
      // The notify_new_message trigger emitted 'messages' until migration
      // 20260514000001; notifications delivered before that deploy still
      // carry it, and must still route correctly when tapped.
      const notificationType: string =
        data.type === 'messages' ? 'message' : data.type;
      if (!VALID_TYPES.includes(notificationType as NotificationType)) return;

      // Don't navigate if user is not authenticated yet
      if (!user) return;

      // Validate any routable ID fields before building a URL from them.
      const safeMatchId = isValidUuid(data.matchId) ? data.matchId : null;
      const safeChatId =
        isValidUuid(data.chatId)
          ? data.chatId
          : isValidUuid(data.conversationId)
            ? data.conversationId
            : isValidUuid(data.conversation_id)
              ? data.conversation_id
              : null;
      if (__DEV__) {
        if (data.matchId !== undefined && !safeMatchId) {
          console.warn('[Notifications] Ignoring non-UUID matchId in push payload:', data.matchId);
        }
        if (
          (data.chatId !== undefined || data.conversationId !== undefined || data.conversation_id !== undefined) &&
          !safeChatId
        ) {
          console.warn('[Notifications] Ignoring non-UUID chat payload:', {
            chatId: data.chatId,
            conversationId: data.conversationId,
            conversation_id: data.conversation_id,
          });
        }
      }

      switch (notificationType) {
        case 'match':
        case 'like':
          if (safeMatchId) {
            router.push(`/match/${safeMatchId}`);
          } else {
            router.push('/(tabs)/matches');
          }
          break;
        case 'message':
          // Prefer chatId if it's valid; otherwise fall back to a validated
          // matchId; otherwise the default chat tab.
          if (safeChatId) {
            router.push(`/chat/${safeChatId}`);
          } else if (safeMatchId) {
            router.push(`/chat/${safeMatchId}`);
          } else {
            router.push('/(tabs)/chat');
          }
          break;
        case 'dailyHoroscope':
          router.push('/premium-screens/daily-horoscope');
          break;
        case 'retrogradeAlert':
          router.push('/premium-screens/retrograde-alerts');
          break;
        case 'promotion':
          router.push('/(tabs)/premium');
          break;
        default:
          break;
      }
    };

    // Handle taps when app is already running
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Handle cold-start: check if app was opened from a notification
    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (response) {
        handleNotificationResponse(response);
      }
    });

    return () => subscription.remove();
  }, [user]);

  // Initialize PWA on web
  useEffect(() => {
    if (Platform.OS === 'web') {
      registerServiceWorker();
      setupInstallPrompt();
    }
  }, []);

  const signUp = async (
    email: string,
    password: string,
    name: string
  ) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim() || 'User';

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { name: normalizedName, full_name: normalizedName },
        emailRedirectTo: getAuthCallbackRedirectUri(),
      },
    });

    // Try to create profile if we have a session (auto-confirm enabled)
    if (!error && data.user && data.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, name: normalizedName });

      if (profileError) {
        console.warn('Profile creation failed, will retry on first sign-in:', profileError.message);
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
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
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="premium-screens" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="match/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="splash" options={{ headerShown: false }} />
          </Stack>
          <PaywallModal />
          <OfflineBanner />
        </PremiumProvider>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

// Only wrap with Sentry on native platforms
export default Platform.OS === 'web' ? RootLayout : Sentry.wrap(RootLayout);
