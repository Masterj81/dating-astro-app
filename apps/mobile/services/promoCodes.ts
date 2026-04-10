import { supabase } from './supabase';

export type ClaimedPlayPromoCampaign = {
  billingCycle: 'monthly' | 'yearly';
  rewardType:
    | 'stripe_deferred_coupon'
    | 'stripe_checkout_coupon'
    | 'play_store_defer_billing'
    | 'play_store_subscription_option';
  metadata: Record<string, unknown>;
};

export async function claimPlayPromoCode(code: string, billingCycle: 'monthly' | 'yearly') {
  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) {
    return { success: false, error: 'Missing promo code' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { success: false, error: 'Missing authenticated session' };
  }

  const { data, error } = await supabase.functions.invoke('claim-promo-code', {
    body: {
      code: trimmedCode,
      platform: 'play_store',
      billingCycle,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data?.success) {
    return { success: false, error: String(data?.error || 'Unable to apply promo code') };
  }

  return {
    success: true,
    code: trimmedCode,
    campaign: (data?.campaign ?? null) as ClaimedPlayPromoCampaign | null,
  };
}
