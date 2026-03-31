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

// Obfuscated localStorage adapter for web
// Not true encryption (key is in client), but prevents casual token theft
// from browser devtools, extensions, or simple XSS payloads
const STORAGE_PREFIX = 'ad_s_';

function obfuscate(value: string): string {
  return btoa(encodeURIComponent(value));
}

function deobfuscate(value: string): string {
  try {
    return decodeURIComponent(atob(value));
  } catch {
    // Fallback for legacy unencoded values
    return value;
  }
}

const LocalStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) {
      // Check for legacy unencoded key (migration)
      const legacy = window.localStorage.getItem(key);
      if (legacy !== null) {
        // Migrate to obfuscated storage
        window.localStorage.setItem(STORAGE_PREFIX + key, obfuscate(legacy));
        window.localStorage.removeItem(key);
        return legacy;
      }
      return null;
    }
    return deobfuscate(raw);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_PREFIX + key, obfuscate(value));
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(STORAGE_PREFIX + key);
    window.localStorage.removeItem(key); // Also clean legacy
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
