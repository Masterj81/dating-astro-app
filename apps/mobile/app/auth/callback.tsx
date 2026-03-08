import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../services/supabase';

/**
 * OAuth callback handler for web platform.
 * Handles the redirect from OAuth providers (Google, Apple, Facebook)
 * and extracts tokens from the URL hash.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    const handleCallback = async () => {
      if (Platform.OS !== 'web') {
        // On native, the deep link is handled by expo-web-browser
        router.replace('/');
        return;
      }

      try {
        // Get the hash from the URL (contains access_token, refresh_token, etc.)
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const error = params.get('error');
        const errorDescription = params.get('error_description');

        if (error) {
          console.error('OAuth error:', error, errorDescription);
          // If in popup, close it and redirect opener
          if (window.opener) {
            window.opener.location.href = '/auth/login';
            window.close();
          } else {
            router.replace('/auth/login');
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
            if (window.opener) {
              window.opener.location.href = '/auth/login';
              window.close();
            } else {
              router.replace('/auth/login');
            }
            return;
          }

          // Successfully authenticated - redirect main window and close popup
          if (window.opener) {
            window.opener.location.href = '/';
            window.close();
          } else {
            router.replace('/');
          }
          return;
        }

        // Check for code exchange flow
        const code = params.get('code') || new URLSearchParams(window.location.search).get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError);
            if (window.opener) {
              window.opener.location.href = '/auth/login';
              window.close();
            } else {
              router.replace('/auth/login');
            }
            return;
          }
          if (window.opener) {
            window.opener.location.href = '/';
            window.close();
          } else {
            router.replace('/');
          }
          return;
        }

        // No tokens or code found
        console.error('No authentication data in callback');
        if (window.opener) {
          window.opener.location.href = '/auth/login';
          window.close();
        } else {
          router.replace('/auth/login');
        }
      } catch (err) {
        console.error('Callback error:', err);
        if (window.opener) {
          window.opener.location.href = '/auth/login';
          window.close();
        } else {
          router.replace('/auth/login');
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#e94560" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  text: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
});
