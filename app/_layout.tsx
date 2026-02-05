import '../services/sentry';
import { Sentry } from '../services/sentry';
import { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useState } from 'react';
import { LanguageProvider } from '../contexts/LanguageContext';
import { PremiumProvider } from '../contexts/PremiumContext';
import PaywallModal from '../components/PaywallModal';
import { registerAndSavePushToken, clearPushToken, startPushTokenRefresh } from '../services/notifications';
import { initializePurchases } from '../services/purchases';
import { supabase } from '../services/supabase';

// Auth Context
type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isEmailVerified: boolean;
  onboardingCompleted: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithApple: () => Promise<{ error: any }>;
  signInWithFacebook: () => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function RootLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .single();
    setOnboardingCompleted(data?.onboarding_completed ?? false);
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
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    if (!data) {
      await supabase.from('profiles').insert({
        id: userId,
        name: name || 'User',
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setIsEmailVerified(!!currentUser.email_confirmed_at);
        fetchProfile(currentUser.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        setIsEmailVerified(!!currentUser.email_confirmed_at);
        await fetchProfile(currentUser.id);

        // Auto-create profile for social auth users on first sign-in
        if (event === 'SIGNED_IN' && currentUser.app_metadata?.provider !== 'email') {
          const displayName =
            currentUser.user_metadata?.full_name ||
            currentUser.user_metadata?.name ||
            currentUser.email?.split('@')[0] ||
            'User';
          await ensureProfileExists(currentUser.id, displayName);
          await fetchProfile(currentUser.id);
        }
      }

      // Handle password recovery deep link
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/auth/reset-password');
      }
    });

    return () => subscription.unsubscribe();
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
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  // Register for push notifications and initialize purchases when user logs in
  useEffect(() => {
    if (!user) return;

    registerAndSavePushToken(user.id);
    initializePurchases(user.id);

    // Re-register token when app comes back to foreground (tokens can rotate)
    const stopRefresh = startPushTokenRefresh(user.id);
    return () => stopRefresh();
  }, [user]);

  // Handle notification taps
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'match') {
        router.push('/(tabs)/matches');
      } else if (data?.type === 'message' && data?.matchId) {
        router.push(`/chat/${data.matchId}`);
      }
    });

    return () => subscription.remove();
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

export default Sentry.wrap(RootLayout);
