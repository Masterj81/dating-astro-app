import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Sentry from '@sentry/react-native';
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
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      const authError = error || new Error('No auth URL returned');
      Sentry.captureException(authError, {
        extra: { provider, context: 'signInWithProvider.getAuthUrl' }
      });
      return { error: authError };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'success' && result.url) {
      // Extract tokens from the callback URL
      const url = new URL(result.url);
      // Supabase returns tokens as hash fragments
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      // Check for error in callback
      const errorParam = hashParams.get('error') || url.searchParams.get('error');
      const errorDesc = hashParams.get('error_description') || url.searchParams.get('error_description');
      if (errorParam) {
        const callbackError = new Error(errorDesc || errorParam);
        Sentry.captureException(callbackError, {
          extra: { provider, errorParam, errorDesc, context: 'signInWithProvider.callback' }
        });
        return { error: callbackError };
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          Sentry.captureException(sessionError, {
            extra: { provider, context: 'signInWithProvider.setSession' }
          });
        }
        return { error: sessionError };
      }

      // Try query params as fallback (some flows use code exchange)
      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          Sentry.captureException(exchangeError, {
            extra: { provider, context: 'signInWithProvider.exchangeCode' }
          });
        }
        return { error: exchangeError };
      }

      const noTokenError = new Error('No tokens found in callback');
      Sentry.captureException(noTokenError, {
        extra: { provider, callbackUrl: result.url, context: 'signInWithProvider.noTokens' }
      });
      return { error: noTokenError };
    }

    // User cancelled or dismissed
    return { error: null };
  } catch (err) {
    Sentry.captureException(err, {
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
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUri,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      const authError = error || new Error('No auth URL returned');
      Sentry.captureException(authError, {
        extra: { provider: 'apple', context: 'signInWithAppleWeb.getAuthUrl' }
      });
      return { error: authError };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      const errorParam = hashParams.get('error') || url.searchParams.get('error');
      const errorDesc = hashParams.get('error_description') || url.searchParams.get('error_description');
      if (errorParam) {
        const callbackError = new Error(errorDesc || errorParam);
        Sentry.captureException(callbackError, {
          extra: { provider: 'apple', errorParam, errorDesc, context: 'signInWithAppleWeb.callback' }
        });
        return { error: callbackError };
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return { error: sessionError };
      }

      const code = url.searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        return { error: exchangeError };
      }

      return { error: new Error('No tokens found in callback') };
    }

    return { error: null };
  } catch (err) {
    Sentry.captureException(err, {
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
      Sentry.captureException(noTokenError, {
        extra: { context: 'signInWithAppleNative.noIdentityToken' }
      });
      return { error: noTokenError };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (error) {
      Sentry.captureException(error, {
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
    Sentry.captureException(err, {
      extra: { errorCode: err.code, context: 'signInWithAppleNative.unexpected' }
    });
    return { error: err };
  }
}
