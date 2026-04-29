import { Alert, AppState, Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { t } from './i18n';

// B1 — stable per-install device id used by the push_tokens table so a single
// user can register N devices and a device never silently gets reassigned to
// another user. Generated once, stored in SecureStore on native and in
// localStorage on web (web currently has no native push but we keep the id
// consistent for future use). The value is opaque — never parsed server-side.
const DEVICE_ID_KEY = 'astrodating_device_id';

function generateFallbackUuidV4(): string {
  // RFC 4122 v4 fallback — used only if expo-crypto.randomUUID is missing
  // (extremely unlikely on SDK 54+, but belt-and-suspenders).
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[(Math.random() * 4) | 0 | 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

async function getDeviceId(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      // SecureStore is a no-op on web; use localStorage for parity.
      if (typeof window === 'undefined') return null;
      let id = window.localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = typeof Crypto.randomUUID === 'function'
          ? Crypto.randomUUID()
          : generateFallbackUuidV4();
        window.localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    }

    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = typeof Crypto.randomUUID === 'function'
        ? Crypto.randomUUID()
        : generateFallbackUuidV4();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (err) {
    if (__DEV__) console.warn('getDeviceId failed:', err);
    return null;
  }
}

// Q-L5: track whether we've already shown the "permission denied" prompt so
// users aren't nagged on every app launch. Reset when the process restarts.
let pushPermissionPromptShown = false;

// Suppress expo-notifications warning on web BEFORE any require
// This must happen before the module is loaded to catch the warning
if (Platform.OS === 'web') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('expo-notifications')) {
      return; // Suppress expo-notifications warnings on web
    }
    originalWarn.apply(console, args);
  };
}

// Conditionally import native-only modules
let Device: any = null;
let Notifications: any = null;

if (Platform.OS !== 'web') {
  Device = require('expo-device');
  Notifications = require('expo-notifications');

  // Configure how notifications appear when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Expo push token format: ExponentPushToken[...] or ExpoPushToken[...]
const EXPO_TOKEN_REGEX = /^Expo(?:nent)?PushToken\[.+\]$/;

function isValidExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_REGEX.test(token);
}

// Register for push notifications and get token
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Skip on web - use web push API separately
  if (Platform.OS === 'web' || !Device || !Notifications) {
    return null;
  }

  if (!Device.isDevice) {
    if (__DEV__) console.warn('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.warn('Push notification permission not granted');
      // Q-L5: once per process lifetime, offer a non-blocking shortcut to the
      // OS settings screen. Only prompt when the user has actively rejected
      // in this session (existingStatus !== 'granted' OR 'denied'), and never
      // on subsequent foreground events within the same process.
      if (!pushPermissionPromptShown) {
        pushPermissionPromptShown = true;
        try {
          Alert.alert(
            t('notificationsDisabledTitle'),
            t('notificationsDisabledMessage'),
            [
              { text: t('notNow'), style: 'cancel' },
              {
                text: t('openSettings'),
                onPress: () => {
                  Linking.openSettings().catch(() => {
                    // openSettings can reject if no Settings app is available
                    // (rare). Fail quietly — we already told the user where
                    // to look.
                  });
                },
              },
            ]
          );
        } catch {
          // Alert is unavailable in some test environments — ignore.
        }
      }
      return null;
    }

    // Android specific channels
    if (Platform.OS === 'android') {
      await Promise.all([
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#e94560',
        }),
        Notifications.setNotificationChannelAsync('matches', {
          name: 'Matches & Likes',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#e94560',
        }),
        Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#e94560',
        }),
        Notifications.setNotificationChannelAsync('horoscope', {
          name: 'Horoscope',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#e94560',
        }),
      ]);
    }

    // Get Expo push token
    const response = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID || '4b9ba994-e045-4aad-b3be-edee8bc22e2b',
    });

    const token = response.data;
    if (!isValidExpoPushToken(token)) {
      if (__DEV__) console.warn('Invalid Expo push token format:', token);
      return null;
    }

    return token;
  } catch (error) {
    if (__DEV__) console.warn('Failed to get push token:', error);
    return null;
  }
}

// Save push token to the push_tokens table (multi-device) AND mirror it to the
// legacy profiles.push_token column while send-notification still supports that
// fallback path for users on older app/server combinations.
// TODO(P3): remove the legacy profiles.push_token write once send-notification
//           is confirmed to read exclusively from push_tokens.
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  if (!isValidExpoPushToken(token)) {
    if (__DEV__) console.warn('Refusing to save invalid push token:', token);
    return false;
  }

  const deviceId = await getDeviceId();

  // B1: preferred path — claim_push_token_v2 scrubs any other user who
  // previously held this device_id and upserts into public.push_tokens.
  let v2Ok = false;
  if (deviceId) {
    try {
      const platform: 'ios' | 'android' | 'web' =
        Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

      const { error: claimV2Error } = await supabase.rpc('claim_push_token_v2', {
        p_device_id: deviceId,
        p_token: token,
        p_platform: platform,
      });

      if (claimV2Error) {
        if (__DEV__) console.warn('claim_push_token_v2 RPC error:', claimV2Error.message);
      } else {
        v2Ok = true;
      }
    } catch (err) {
      if (__DEV__) console.warn('claim_push_token_v2 RPC threw:', err);
    }
  } else if (__DEV__) {
    console.warn('getDeviceId returned null — falling back to legacy profiles.push_token only');
  }

  // The v2 RPC already scrubs any stale legacy profiles.push_token rows that
  // hold this token, so we only need to mirror the current user's token into
  // the legacy single-slot column for the fallback delivery path.

  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    if (__DEV__) console.warn('Failed to save legacy push token:', error.message);
    // If v2 succeeded, we're still fine — the new table is the source of truth.
    return v2Ok;
  }
  return true;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000]; // exponential-ish back-off

// Register token and persist it — call on login and app foreground
export async function registerAndSavePushToken(userId: string): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const saved = await savePushToken(userId, token);
    if (saved) return;

    // Don't retry after the last attempt
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (__DEV__) console.warn(`Failed to save push token after ${MAX_RETRIES + 1} attempts`);
}

// Clear push token on sign-out so the user stops receiving notifications
// on THIS device. Other devices of the same user keep their rows.
export async function clearPushToken(userId: string): Promise<void> {
  // B1: delete this device's row from push_tokens.
  const deviceId = await getDeviceId();
  if (deviceId) {
    try {
      const { error: rpcError } = await supabase.rpc('clear_push_token_v2', {
        p_device_id: deviceId,
      });
      if (rpcError && __DEV__) {
        console.warn('clear_push_token_v2 RPC error:', rpcError.message);
      }
    } catch (err) {
      if (__DEV__) console.warn('clear_push_token_v2 RPC threw:', err);
    }
  }

  // Legacy: also null out profiles.push_token so the old single-slot
  // fallback path in send-notification can't still deliver to us.
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', userId);

  if (error) {
    if (__DEV__) console.warn('Failed to clear legacy push token:', error.message);
  }
}

// Throttle foreground re-registration to at most once per 30 minutes
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
let lastTokenRefresh = 0;

// Re-register token when app returns to foreground (tokens can rotate)
export function startPushTokenRefresh(userId: string): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      const now = Date.now();
      if (now - lastTokenRefresh < TOKEN_REFRESH_INTERVAL_MS) return;
      lastTokenRefresh = now;
      registerAndSavePushToken(userId);
    }
  });
  return () => subscription.remove();
}

// Send a local notification (for testing)
export async function sendLocalNotification(title: string, body: string) {
  if (Platform.OS === 'web' || !Notifications) {
    if (__DEV__) console.warn('Local notifications are not available on web');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: null,
  });
}

// Notification payload types for type-safe handling
export type NotificationType =
  | 'match'
  | 'message'
  | 'like'
  | 'dailyHoroscope'
  | 'retrogradeAlert'
  | 'promotion';

export interface NotificationPayload {
  type: NotificationType;
  matchId?: string;
  chatId?: string;
  screen?: string;
  [key: string]: unknown;
}

// Map a notification type to the Android channel it should use
export function getChannelForType(type: NotificationType): string {
  switch (type) {
    case 'match':
    case 'like':
      return 'matches';
    case 'message':
      return 'messages';
    case 'dailyHoroscope':
    case 'retrogradeAlert':
      return 'horoscope';
    default:
      return 'default';
  }
}
