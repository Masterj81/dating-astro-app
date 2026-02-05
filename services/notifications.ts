import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

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

// Register for push notifications and get token
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted');
    return null;
  }

  // Android specific channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#e94560',
    });
  }

  // Get Expo push token
  try {
    const response = await Notifications.getExpoPushTokenAsync({
      projectId: '4b9ba994-e045-4aad-b3be-edee8bc22e2b',
    });
    return response.data;
  } catch (error) {
    console.warn('Failed to get push token:', error);
    return null;
  }
}

// Save push token to user's profile
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    console.warn('Failed to save push token:', error.message);
    return false;
  }
  return true;
}

// Register token and persist it — call on login and app foreground
export async function registerAndSavePushToken(userId: string): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (token) {
    await savePushToken(userId, token);
  }
}

// Clear push token on sign-out so the user stops receiving notifications
export async function clearPushToken(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', userId);

  if (error) {
    console.warn('Failed to clear push token:', error.message);
  }
}

// Re-register token when app returns to foreground (tokens can rotate)
export function startPushTokenRefresh(userId: string): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      registerAndSavePushToken(userId);
    }
  });
  return () => subscription.remove();
}

// Send a local notification (for testing)
export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: null,
  });
}