import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = makeRedirectUri({
  scheme: 'astrodating',
  path: 'auth/callback',
});

/**
 * Sign in with an OAuth provider (Google, Facebook) via browser redirect.
 */
export async function signInWithProvider(provider: 'google' | 'facebook') {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return { error: error || new Error('No auth URL returned') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type === 'success' && result.url) {
    // Extract tokens from the callback URL
    const url = new URL(result.url);
    // Supabase returns tokens as hash fragments
    const hashParams = new URLSearchParams(url.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return { error: sessionError };
    }

    // Try query params as fallback (some flows use code exchange)
    const code = url.searchParams.get('code');
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      return { error: exchangeError };
    }

    return { error: new Error('No tokens found in callback') };
  }

  // User cancelled or dismissed
  return { error: null };
}

/**
 * Sign in with Apple.
 * Uses native Apple Auth on iOS, falls back to web OAuth on Android.
 */
export async function signInWithApple() {
  if (Platform.OS === 'ios') {
    return signInWithAppleNative();
  }
  return signInWithProvider('google'); // Android: no native Apple, fallback to Google
}

async function signInWithAppleNative() {
  try {
    const AppleAuthentication = require('expo-apple-authentication');

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: new Error('No identity token from Apple') };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    // Apple only provides name on first sign-in, store it if available
    if (!error && credential.fullName) {
      const name = [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(' ');
      if (name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.auth.updateUser({
            data: { full_name: name },
          });
        }
      }
    }

    return { error };
  } catch (err: any) {
    // User cancelled Apple sign-in
    if (err.code === 'ERR_REQUEST_CANCELED') {
      return { error: null };
    }
    return { error: err };
  }
}
