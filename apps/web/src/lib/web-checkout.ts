import { getSupabaseBrowser } from "@/lib/supabase-browser";

export type WebCheckoutPlan =
  | "celestial_monthly"
  | "celestial_yearly"
  | "cosmic_monthly"
  | "cosmic_yearly";

// The annual discount is NOT chosen here any more.
//
// This file used to read `NEXT_PUBLIC_STRIPE_ANNUAL_COUPON_ID` and send it as
// `couponId`, and `create-checkout-session` applied whatever it received. The
// price beside it was validated against an allowlist; the coupon was not. So a
// signed-in account could pair a MONTHLY price with the ANNUAL coupon — the id
// was published in this bundle — or with any other coupon in the Stripe
// account. The rule now lives on the server, derived from the validated price.
// docs/security-audit-2026-09-07.md, JUNO-03.

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

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: {
      priceId,
      userId,
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
