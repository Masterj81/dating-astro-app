import { Platform } from 'react-native';
import { supabase } from './supabase';
import { debugLog } from '../utils/debug';

// Stripe price IDs - set these in your Stripe dashboard
const STRIPE_PRICES = {
  celestial_monthly: process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_MONTHLY || '',
  celestial_yearly: process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_YEARLY || process.env.EXPO_PUBLIC_STRIPE_PRICE_CELESTIAL_ANNUAL || '',
  cosmic_monthly: process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_MONTHLY || '',
  cosmic_yearly: process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_YEARLY || process.env.EXPO_PUBLIC_STRIPE_PRICE_COSMIC_ANNUAL || '',
};

// Coupon code for annual plans (60% off first year)
const ANNUAL_COUPON_ID = process.env.EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID || '';

export type WebSubscriptionPlan =
  | 'celestial_monthly'
  | 'celestial_yearly'
  | 'cosmic_monthly'
  | 'cosmic_yearly';

/**
 * Check if we're on web platform
 */
export function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}

/**
 * Create a Stripe Checkout session for subscription
 * This calls a Supabase Edge Function that creates the Stripe session
 */
export async function createCheckoutSession(
  plan: WebSubscriptionPlan,
  userId: string,
  promoCode?: string
): Promise<{ url: string } | { error: string }> {
  if (!isWebPlatform()) {
    return { error: 'Web payments only available on web platform' };
  }

  const priceId = STRIPE_PRICES[plan];
  if (!priceId) {
    return { error: 'Invalid subscription plan' };
  }

  // Apply coupon for annual plans
  const isAnnual = plan.includes('yearly');
  const couponId = isAnnual && ANNUAL_COUPON_ID ? ANNUAL_COUPON_ID : undefined;

  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        priceId,
        userId,
        couponId,
        promoCode: promoCode?.trim() || undefined,
        successUrl: `${window.location.origin}/premium/success`,
        cancelUrl: `${window.location.origin}/premium`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { url: data.url };
  } catch (err) {
    return { error: 'Failed to create checkout session' };
  }
}

/**
 * Redirect to Stripe Checkout
 */
export async function redirectToCheckout(
  plan: WebSubscriptionPlan,
  userId: string,
  promoCode?: string
): Promise<void> {
  const result = await createCheckoutSession(plan, userId, promoCode);

  if ('error' in result) {
    throw new Error(result.error);
  }

  // Redirect to Stripe Checkout
  window.location.href = result.url;
}

/**
 * Create a Stripe Customer Portal session for managing subscriptions
 */
export async function createPortalSession(
  userId: string
): Promise<{ url: string } | { error: string }> {
  if (!isWebPlatform()) {
    return { error: 'Web payments only available on web platform' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: {
        userId,
        returnUrl: `${window.location.origin}/settings`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { url: data.url };
  } catch (err) {
    return { error: 'Failed to create portal session' };
  }
}

/**
 * Redirect to Stripe Customer Portal
 */
export async function redirectToPortal(userId: string): Promise<void> {
  const result = await createPortalSession(userId);

  if ('error' in result) {
    throw new Error(result.error);
  }

  window.location.href = result.url;
}

/**
 * Get subscription status from Supabase (synced via Stripe webhooks)
 */
export async function getWebSubscriptionStatus(
  userId: string
): Promise<{
  tier: 'free' | 'premium' | 'premium_plus';
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}> {
  debugLog('Checking web subscription for user:', userId);

  // Guard: only allow querying current user's subscription
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    debugLog('getWebSubscriptionStatus: userId mismatch, returning free');
    return { tier: 'free', expiresAt: null, cancelAtPeriodEnd: false };
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('tier, status, expires_at, cancel_at_period_end')
    .eq('user_id', userId)
    .eq('source', 'stripe')
    .maybeSingle();

  debugLog('Subscription query result:', { data, error });

  if (error || !data) {
    debugLog('No subscription found or error, returning free tier');
    return {
      tier: 'free',
      expiresAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  // Check if subscription is active
  if (data.status !== 'active') {
    debugLog('Subscription not active, status:', data.status);
    return {
      tier: 'free',
      expiresAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  debugLog('Active subscription found, tier:', data.tier);
  return {
    tier: data.tier,
    expiresAt: data.expires_at,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}
