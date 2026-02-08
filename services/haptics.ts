import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback service for iOS
 * Provides consistent haptic patterns across the app
 */

/**
 * Check if haptics are supported on the current device
 */
export function isHapticsSupported(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Light impact - subtle feedback for minor interactions
 * Use for: UI taps, toggles, minor state changes
 */
export async function lightImpact(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Medium impact - moderate feedback for significant interactions
 * Use for: Swipe threshold reached, selection changes
 */
export async function mediumImpact(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/**
 * Heavy impact - strong feedback for major interactions
 * Use for: Completed actions, confirmations
 */
export async function heavyImpact(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

/**
 * Selection feedback - for UI selection changes
 * Use for: Tab switches, option selections, carousel navigation
 */
export async function selectionFeedback(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.selectionAsync();
}

/**
 * Success notification - positive action completed
 * Use for: Like swipe confirmed, match found, message sent
 */
export async function successNotification(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * Warning notification - caution needed
 * Use for: Approaching limits, reversible actions
 */
export async function warningNotification(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/**
 * Error notification - action failed or prevented
 * Use for: Errors, failed submissions, blocked actions
 */
export async function errorNotification(): Promise<void> {
  if (!isHapticsSupported()) return;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

// ============ Custom Patterns ============

/**
 * Swipe threshold reached - user has swiped far enough
 * Pattern: Medium impact
 */
export async function swipeThreshold(): Promise<void> {
  await mediumImpact();
}

/**
 * Like swipe confirmed - user completed a like swipe
 * Pattern: Heavy impact followed by success notification
 */
export async function likeSwipe(): Promise<void> {
  if (!isHapticsSupported()) return;
  await heavyImpact();
  await delay(50);
  await successNotification();
}

/**
 * Pass swipe confirmed - user completed a pass swipe
 * Pattern: Light impact only (less celebration)
 */
export async function passSwipe(): Promise<void> {
  await lightImpact();
}

/**
 * Super like pattern - extra special feedback
 * Pattern: Heavy-Light-Heavy sequence
 */
export async function superLike(): Promise<void> {
  if (!isHapticsSupported()) return;
  await heavyImpact();
  await delay(100);
  await lightImpact();
  await delay(100);
  await heavyImpact();
}

/**
 * New match celebration - when two users match
 * Pattern: 4-pulse celebration pattern
 */
export async function matchCelebration(): Promise<void> {
  if (!isHapticsSupported()) return;

  // Quick succession of pulses building excitement
  await successNotification();
  await delay(150);
  await mediumImpact();
  await delay(100);
  await mediumImpact();
  await delay(100);
  await heavyImpact();
}

/**
 * Compatibility reveal - haptic intensity based on score
 * Higher scores = more intense haptic
 */
export async function compatibilityReveal(score: number): Promise<void> {
  if (!isHapticsSupported()) return;

  if (score >= 90) {
    // Excellent match - celebration pattern
    await successNotification();
    await delay(100);
    await heavyImpact();
  } else if (score >= 75) {
    // Great match - strong positive
    await successNotification();
  } else if (score >= 60) {
    // Good match - medium positive
    await mediumImpact();
  } else if (score >= 40) {
    // Moderate match - light feedback
    await lightImpact();
  } else {
    // Low match - minimal feedback
    await selectionFeedback();
  }
}

/**
 * Button press feedback - consistent button interaction
 */
export async function buttonPress(): Promise<void> {
  await lightImpact();
}

/**
 * Tab switch feedback - navigation between tabs
 */
export async function tabSwitch(): Promise<void> {
  await selectionFeedback();
}

/**
 * Message sent feedback - confirmation of sent message
 */
export async function messageSent(): Promise<void> {
  await lightImpact();
}

/**
 * Keyboard key press - for custom keyboards if needed
 */
export async function keyPress(): Promise<void> {
  await selectionFeedback();
}

/**
 * Pull to refresh trigger
 */
export async function refreshTrigger(): Promise<void> {
  await mediumImpact();
}

/**
 * Card flip or reveal animation
 */
export async function cardReveal(): Promise<void> {
  await mediumImpact();
}

/**
 * Modal open/close
 */
export async function modalFeedback(): Promise<void> {
  await lightImpact();
}

/**
 * Premium feature locked - gentle warning
 */
export async function premiumLocked(): Promise<void> {
  await warningNotification();
}

/**
 * Profile action (block, report, etc.)
 */
export async function profileAction(): Promise<void> {
  await mediumImpact();
}

/**
 * Undo action feedback
 */
export async function undoAction(): Promise<void> {
  if (!isHapticsSupported()) return;
  await lightImpact();
  await delay(50);
  await lightImpact();
}

// ============ Utility Functions ============

/**
 * Delay helper for sequencing haptics
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Haptic service with method chaining for complex patterns
 */
export const HapticPatterns = {
  // Quick access to common patterns
  swipeThreshold,
  likeSwipe,
  passSwipe,
  superLike,
  matchCelebration,
  compatibilityReveal,
  buttonPress,
  tabSwitch,
  messageSent,
  refreshTrigger,
  cardReveal,
  modalFeedback,
  premiumLocked,
  profileAction,
  undoAction,

  // Raw impacts
  light: lightImpact,
  medium: mediumImpact,
  heavy: heavyImpact,
  selection: selectionFeedback,
  success: successNotification,
  warning: warningNotification,
  error: errorNotification,
};

export default HapticPatterns;
