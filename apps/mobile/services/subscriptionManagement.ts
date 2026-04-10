import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';
import { getEffectiveSubscription, getAllSubscriptions } from './subscriptionService';
import { debugLog } from '../utils/debug';

type ManageResult =
  | { type: 'none' }
  | { type: 'redirect'; url: string };

function getStoreManageUrl(source: 'app_store' | 'play_store'): string {
  if (source === 'app_store') {
    return 'https://apps.apple.com/account/subscriptions';
  }
  return 'https://play.google.com/store/account/subscriptions';
}

/**
 * Creates a Stripe portal session.
 * Works from any platform — the URL can be opened in external browser on native.
 */
async function createStripePortalUrl(userId: string): Promise<string> {
  // Web: return to current origin. Native: return to web app settings page.
  const returnUrl =
    Platform.OS === 'web'
      ? `${window.location.origin}/settings`
      : 'https://app.astrodatingapp.com/settings';

  const { data, error } = await supabase.functions.invoke('create-portal-session', {
    body: {
      userId,
      returnUrl,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || 'Failed to create Stripe portal session');
  }

  return data.url;
}

/**
 * Returns the management URL for the user's effective subscription.
 */
export async function getManageSubscriptionAction(userId: string): Promise<ManageResult> {
  const subscription = await getEffectiveSubscription(userId);

  if (!subscription?.source) {
    return { type: 'none' };
  }

  if (subscription.source === 'stripe') {
    const url = await createStripePortalUrl(userId);
    return { type: 'redirect', url };
  }

  return {
    type: 'redirect',
    url: getStoreManageUrl(subscription.source),
  };
}

/**
 * Opens the correct subscription management destination.
 * Works on all platforms:
 * - Web: redirects in current window
 * - Native: opens in external browser
 */
export async function manageSubscription(userId: string): Promise<void> {
  const action = await getManageSubscriptionAction(userId);

  if (action.type === 'none') {
    debugLog('[SubscriptionManagement] No active subscription to manage');
    return;
  }

  if (Platform.OS === 'web') {
    window.location.href = action.url;
    return;
  }

  const supported = await Linking.canOpenURL(action.url);
  if (!supported) {
    throw new Error(`Cannot open subscription URL: ${action.url}`);
  }

  await Linking.openURL(action.url);
}

/**
 * Returns all subscriptions with their management URLs.
 * Useful for support/admin UI.
 * Note: Stripe returns null — use manageSubscription() to generate dynamic portal link.
 */
export async function getManageableSubscriptions(userId: string) {
  const subscriptions = await getAllSubscriptions(userId);

  return subscriptions.map((subscription) => ({
    ...subscription,
    manageUrl:
      subscription.source === 'stripe'
        ? null
        : getStoreManageUrl(subscription.source),
  }));
}
