import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type WebCheckoutPlan =
  | "celestial_monthly"
  | "celestial_yearly"
  | "cosmic_monthly"
  | "cosmic_yearly";

const ANNUAL_COUPON_ID =
  process.env.NEXT_PUBLIC_STRIPE_ANNUAL_COUPON_ID ||
  process.env.EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID ||
  "";

export async function createCheckoutSession(
  plan: WebCheckoutPlan,
  userId: string,
  promoCode?: string,
  explicitPriceId?: string
) {
  const supabase = getSupabaseBrowser();
  const priceId = explicitPriceId;

  if (!priceId) {
    throw new Error("Missing Stripe price configuration for selected plan. Check Vercel Stripe price variables.");
  }

  const origin = window.location.origin;
  const isAnnual = plan.includes("yearly");

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: {
      priceId,
      userId,
      couponId: isAnnual && ANNUAL_COUPON_ID ? ANNUAL_COUPON_ID : undefined,
      promoCode: promoCode?.trim() || undefined,
      successUrl: `${origin}/app/checkout/success`,
      cancelUrl: `${origin}/app/plans?checkout=cancelled`,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || "Failed to create checkout session.");
  }

  return data.url as string;
}
