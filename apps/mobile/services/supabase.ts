import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

// Secure storage adapter for native (iOS/Android)
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // SecureStore has a 2KB limit — silently fail in production
      if (__DEV__) console.warn('SecureStore failed, value may be too large');
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore errors on delete
    }
  },
};

// Web storage adapter.
//
// SECURITY NOTE (P1-8): tokens in localStorage are vulnerable to any XSS in
// the page. This is the Supabase default on web — base64 obfuscation does
// NOT add security (the key lives in the bundle, one devtools tab defeats
// it) and gives a false sense of protection. Migrating auth to httpOnly
// cookies requires a Next.js BFF with a session table and is tracked as a
// P2. Until then we stay on the default and keep the attack surface honest.
//
// Legacy keys: prior versions stored tokens with the `ad_s_` prefix + base64.
// On read we transparently migrate them back to the canonical unprefixed
// key Supabase expects, so existing sessions are not invalidated.
const LEGACY_STORAGE_PREFIX = 'ad_s_';

function maybeMigrateLegacy(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_PREFIX + key);
  if (legacy === null) return null;
  try {
    const decoded = decodeURIComponent(atob(legacy));
    window.localStorage.setItem(key, decoded);
    window.localStorage.removeItem(LEGACY_STORAGE_PREFIX + key);
    return decoded;
  } catch {
    // Corrupted legacy value — drop it silently.
    window.localStorage.removeItem(LEGACY_STORAGE_PREFIX + key);
    return null;
  }
}

const LocalStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    const direct = window.localStorage.getItem(key);
    if (direct !== null) return direct;
    return maybeMigrateLegacy(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
    // Clean up any stale legacy copy that may still be around.
    window.localStorage.removeItem(LEGACY_STORAGE_PREFIX + key);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(LEGACY_STORAGE_PREFIX + key);
  },
};

// Use localStorage on web, SecureStore on native
const storageAdapter = Platform.OS === 'web' ? LocalStorageAdapter : SecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce', // Use PKCE flow for OAuth — tokens exchanged via code, never in URL
  },
});
