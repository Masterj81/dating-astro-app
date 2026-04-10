import { Platform } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';

export function getAuthCallbackRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }

  return makeRedirectUri({
    scheme: 'astrodating',
    path: 'auth/callback',
  });
}

export function getResetPasswordRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/reset-password`;
  }

  return 'astrodating://auth/reset-password';
}
