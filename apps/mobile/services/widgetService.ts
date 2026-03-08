import { Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';

const APP_GROUP = 'group.com.astrodating.app';

/**
 * Service to share data between the main app and iOS widget
 * Uses App Groups for shared UserDefaults storage
 */

/**
 * Updates the widget with the user's sun sign
 * This data is stored in shared UserDefaults accessible by the widget
 */
export async function updateWidgetSunSign(sunSign: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  try {
    await SharedGroupPreferences.setItem('userSunSign', sunSign, APP_GROUP);
    await SharedGroupPreferences.setItem('lastUpdated', new Date().toISOString(), APP_GROUP);
  } catch (error) {
    // Widget data update is non-critical, silently fail
  }
}

/**
 * Gets the user's sun sign from shared storage
 */
export async function getWidgetSunSign(): Promise<string | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }

  try {
    return await SharedGroupPreferences.getItem('userSunSign', APP_GROUP);
  } catch (error) {
    return null;
  }
}

/**
 * Syncs widget data when user profile is loaded
 */
export async function syncWidgetWithProfile(sunSign: string): Promise<void> {
  if (!sunSign) {
    return;
  }
  await updateWidgetSunSign(sunSign.toLowerCase());
}
