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
      // SecureStore has a 2KB limit, fall back for large values
      console.warn('SecureStore failed, value may be too large');
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

// localStorage adapter for web
const LocalStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

// Use localStorage on web, SecureStore on native
const storageAdapter = Platform.OS === 'web' ? LocalStorageAdapter : SecureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === 'web', // Enable URL detection on web for OAuth callbacks
  },
});
