import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * Cross-platform alert that works on both native and web.
 * On native, uses React Native's Alert.alert().
 * On web, falls back to window.alert() or window.confirm() for simple cases.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  if (Platform.OS === 'web') {
    // On web, use browser's native alert/confirm
    const fullMessage = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0 || buttons.length === 1) {
      // Simple alert with OK button
      window.alert(fullMessage);
      if (buttons?.[0]?.onPress) {
        buttons[0].onPress();
      }
    } else if (buttons.length === 2) {
      // Use confirm for two buttons (typically Cancel/OK)
      const result = window.confirm(fullMessage);
      if (result) {
        // User clicked OK - find the non-cancel button
        const okButton = buttons.find(b => b.style !== 'cancel') || buttons[1];
        okButton.onPress?.();
      } else {
        // User clicked Cancel - find the cancel button
        const cancelButton = buttons.find(b => b.style === 'cancel') || buttons[0];
        cancelButton.onPress?.();
      }
    } else {
      // For more than 2 buttons, just show alert and call first button
      window.alert(fullMessage);
      buttons[0]?.onPress?.();
    }
  } else {
    // On native, use React Native's Alert
    Alert.alert(title, message, buttons);
  }
}
