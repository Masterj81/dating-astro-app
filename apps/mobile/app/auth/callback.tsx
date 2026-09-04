import { useEffect } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';

/**
 * Auth callback handler.
 *
 * OAuth opened from inside the app is handled by `expo-web-browser`, but email
 * confirmations are different: the reader taps a link in Gmail/Chrome and
 * Android opens this route through the `astrodating://auth/callback` scheme.
 * Native must therefore consume the callback URL itself. Returning early here
 * leaves the browser on about:blank and the app listening forever on the
 * verify-email screen.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    const finishInApp = () => {
      router.replace('/');
    };

    const failInApp = () => {
      router.replace('/auth/login');
    };

    const getCallbackUrl = async (): Promise<string | null> => {
      if (Platform.OS === 'web') {
        return window.location.href;
      }

      return Linking.getInitialURL();
    };

    const readParams = (url: string) => {
      const parsed = new URL(url);
      const searchParams = new URLSearchParams(parsed.search);
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));

      return { searchParams, hashParams };
    };

    const handleCallback = async () => {
      try {
        const callbackUrl = await getCallbackUrl();

        if (!callbackUrl) {
          console.error('No callback URL available');
          failInApp();
          return;
        }

        const { searchParams, hashParams } = readParams(callbackUrl);

        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
        const error = hashParams.get('error') || searchParams.get('error');
        const errorDescription =
          hashParams.get('error_description') || searchParams.get('error_description');

        if (error) {
          console.error('OAuth error:', error, errorDescription);
          // If in popup, close it and redirect opener
          if (Platform.OS === 'web' && window.opener) {
            window.opener.location.href = '/auth/login';
            window.close();
          } else {
            failInApp();
          }
          return;
        }

        if (accessToken && refreshToken) {
          // Set the session with the tokens
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('Session error:', sessionError);
            if (Platform.OS === 'web' && window.opener) {
              window.opener.location.href = '/auth/login';
              window.close();
            } else {
              failInApp();
            }
            return;
          }

          // Successfully authenticated - redirect main window and close popup
          if (Platform.OS === 'web' && window.opener) {
            window.opener.location.href = '/';
            window.close();
          } else {
            finishInApp();
          }
          return;
        }

        // Check for code exchange flow
        const code = hashParams.get('code') || searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError);
            if (Platform.OS === 'web' && window.opener) {
              window.opener.location.href = '/auth/login';
              window.close();
            } else {
              failInApp();
            }
            return;
          }
          if (Platform.OS === 'web' && window.opener) {
            window.opener.location.href = '/';
            window.close();
          } else {
            finishInApp();
          }
          return;
        }

        const tokenHash = hashParams.get('token_hash') || searchParams.get('token_hash');
        const otpType = hashParams.get('type') || searchParams.get('type') || 'signup';
        if (tokenHash) {
          const validTypes: EmailOtpType[] = ['signup', 'magiclink', 'recovery', 'invite', 'email_change'];
          const verifyType: EmailOtpType = validTypes.includes(otpType as EmailOtpType)
            ? (otpType as EmailOtpType)
            : 'signup';

          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: verifyType,
          });
          if (otpError) {
            console.error('OTP verification error:', otpError.message);
            failInApp();
            return;
          }

          finishInApp();
          return;
        }

        // No tokens or code found
        console.error('No authentication data in callback');
        if (Platform.OS === 'web' && window.opener) {
          window.opener.location.href = '/auth/login';
          window.close();
        } else {
          failInApp();
        }
      } catch (err) {
        console.error('Callback error:', err);
        if (Platform.OS === 'web' && window.opener) {
          window.opener.location.href = '/auth/login';
          window.close();
        } else {
          failInApp();
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#C98692" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0B14',
  },
  text: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});
