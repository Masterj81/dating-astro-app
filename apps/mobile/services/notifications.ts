import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

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

// Save push token to user's profile
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  if (!isValidExpoPushToken(token)) {
    if (__DEV__) console.warn('Refusing to save invalid push token:', token);
    return false;
  }

  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    if (__DEV__) console.warn('Failed to save push token:', error.message);
    return false;
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
export async function clearPushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', userId);

  if (error) {
    if (__DEV__) console.warn('Failed to clear push token:', error.message);
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
  | 'superLike'
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
    case 'superLike':
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
