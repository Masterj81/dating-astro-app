import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';

// Safe Sentry wrapper - import dynamically to avoid crashes
const safeCaptureException = (error: any, context?: any) => {
  try {
    if (Platform.OS !== 'web') {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, context);
    }
  } catch {
    console.error('Error logging to Sentry:', error);
  }
};

WebBrowser.maybeCompleteAuthSession();

// Use different redirect URIs for web vs native
const getRedirectUri = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return makeRedirectUri({
    scheme: 'astrodating',
    path: 'auth/callback',
  });
};

const redirectUri = getRedirectUri();

/**
 * Sign in with an OAuth provider (Google, Facebook) via browser redirect.
 */
export async function signInWithProvider(provider: 'google' | 'facebook') {
  try {
    // On web, use full page redirect instead of popup
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUri,
        },
      });
      // This will redirect the page, so we won't reach here unless there's an error
      return { error };
    }

    // On native, use popup/browser session
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      const authError = error || new Error('No auth URL returned');
      safeCaptureException(authError, {
        extra: { provider, context: 'signInWithProvider.getAuthUrl' }
      });
      return { error: authError };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);

      // Check for error in callback
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const errorParam = hashParams.get('error') || url.searchParams.get('error');
      const errorDesc = hashParams.get('error_description') || url.searchParams.get('error_description');
      if (errorParam) {
        const callbackError = new Error(errorDesc || errorParam);
        safeCaptureException(callbackError, {
          extra: { provider, errorParam, context: 'signInWithProvider.callback' }
        });
        return { error: callbackError };
      }

      // Prefer PKCE code exchange (more secure — tokens never in URL)
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          safeCaptureException(exchangeError, {
            extra: { provider, context: 'signInWithProvider.exchangeCode' }
          });
        }
        return { error: exchangeError };
      }

      // Fallback: implicit flow tokens in hash (less secure)
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          safeCaptureException(sessionError, {
            extra: { provider, context: 'signInWithProvider.setSession' }
          });
        }
        return { error: sessionError };
      }

      const noTokenError = new Error('No tokens found in callback');
      safeCaptureException(noTokenError, {
        extra: { provider, context: 'signInWithProvider.noTokens' }
      });
      return { error: noTokenError };
    }

    // User cancelled or dismissed
    return { error: null };
  } catch (err) {
    safeCaptureException(err, {
      extra: { provider, context: 'signInWithProvider.unexpected' }
    });
    return { error: err as Error };
  }
}

/**
 * Sign in with Apple.
 * Uses web OAuth flow for consistency across platforms.
 * Native Apple Auth was causing issues with Supabase token validation.
 */
export async function signInWithApple() {
  return signInWithAppleWeb();
}

async function signInWithAppleWeb() {
  try {
    // On web, use full page redirect instead of popup
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUri,
        },
      });
      return { error };
    }

    // On native, use popup/browser session
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      const authError = error || new Error('No auth URL returned');
      safeCaptureException(authError, {
        extra: { provider: 'apple', context: 'signInWithAppleWeb.getAuthUrl' }
      });
      return { error: authError };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const hashParams = new URLSearchParams(url.hash.substring(1));

      const errorParam = hashParams.get('error') || url.searchParams.get('error');
      const errorDesc = hashParams.get('error_description') || url.searchParams.get('error_description');
      if (errorParam) {
        const callbackError = new Error(errorDesc || errorParam);
        safeCaptureException(callbackError, {
          extra: { provider: 'apple', errorParam, context: 'signInWithAppleWeb.callback' }
        });
        return { error: callbackError };
      }

      // Prefer PKCE code exchange
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        return { error: exchangeError };
      }

      // Fallback: implicit flow
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return { error: sessionError };
      }

      return { error: new Error('No tokens found in callback') };
    }

    return { error: null };
  } catch (err) {
    safeCaptureException(err, {
      extra: { provider: 'apple', context: 'signInWithAppleWeb.unexpected' }
    });
    return { error: err as Error };
  }
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
      const noTokenError = new Error('No identity token from Apple');
      safeCaptureException(noTokenError, {
        extra: { context: 'signInWithAppleNative.noIdentityToken' }
      });
      return { error: noTokenError };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      safeCaptureException(error, {
        extra: { context: 'signInWithAppleNative.signInWithIdToken' }
      });
      return { error };
    }

    // Apple only provides name on first sign-in, store it if available
    if (credential.fullName) {
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

    return { error: null };
  } catch (err: any) {
    // User cancelled Apple sign-in
    if (err.code === 'ERR_REQUEST_CANCELED' || err.code === 'ERR_CANCELED') {
      return { error: null };
    }
    safeCaptureException(err, {
      extra: { errorCode: err.code, context: 'signInWithAppleNative.unexpected' }
    });
    return { error: err };
  }
}
