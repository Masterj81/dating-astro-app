import { Platform } from 'react-native';

/**
 * Register the service worker for PWA functionality
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (Platform.OS !== 'web') {
    return null;
  }

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

/**
 * Check if the app is running as an installed PWA
 */
export function isInstalledPWA(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  // Check for standalone mode (installed PWA)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // iOS Safari specific check
  const isIOSStandalone = (navigator as any).standalone === true;

  return isStandalone || isIOSStandalone;
}

/**
 * Prompt user to install PWA (if supported)
 */
let deferredPrompt: any = null;

export function setupInstallPrompt(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Save the event for later use
    deferredPrompt = e;
  });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;

  return outcome === 'accepted';
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/**
 * Request notification permissions for web push
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return null;
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribe to web push notifications
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  if (Platform.OS !== 'web') {
    return null;
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
