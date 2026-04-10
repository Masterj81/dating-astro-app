import Stripe from 'https://esm.sh/stripe@14.14.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
const fromEmail =
  Deno.env.get('EMAIL_FROM') || 'AstroDating <noreply@astrodatingapp.com>';
const RESEND_API_URL = 'https://api.resend.com/emails';

type Tier = 'premium' | 'premium_plus';
type Source = 'stripe';
type PromoCampaign = {
  code: string;
  platform: 'stripe' | 'play_store';
  billing_cycle: 'monthly' | 'yearly';
  reward_type: 'stripe_deferred_coupon' | 'stripe_checkout_coupon' | 'play_store_defer_billing';
  stripe_coupon_id: string | null;
  play_defer_duration_seconds: number | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    console.log('[Stripe Webhook] Received event', event.type);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string | null;

        if (userId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const priceId = subscription.items.data[0]?.price.id;
          const tier = getTierFromPriceId(priceId);

          if (tier) {
            await upsertSubscription(supabase, {
              userId,
              source: 'stripe',
              tier,
              status: normalizeStripeStatus(subscription.status),
              customerId,
              subscriptionId: subscription.id,
              expiresAt: toIso(subscription.current_period_end),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });
          }

          const campaignCode = session.metadata?.campaign_code?.trim().toUpperCase();
          const billingCycle = getBillingCycleFromPriceId(priceId);

          if (userId && campaignCode && billingCycle) {
            const campaign = await getPromoCampaign(supabase, campaignCode, 'stripe', billingCycle);
            if (!campaign) {
              console.log('[Stripe Webhook] No active promo campaign found', {
                subscriptionId: subscription.id,
                campaignCode,
                billingCycle,
              });
            } else {
            const { data: existingRedemption, error: existingRedemptionError } = await supabase
              .from('promo_campaign_redemptions')
              .select('status')
              .eq('user_id', userId)
              .eq('campaign_code', campaign.code)
              .eq('platform', 'stripe')
              .maybeSingle();

            if (existingRedemptionError) {
              throw existingRedemptionError;
            }

            if (existingRedemption?.status !== 'consumed') {
              await upsertPromoRedemption(supabase, {
                userId,
                campaignCode: campaign.code,
                status: 'checkout_completed',
                customerId,
                subscriptionId: subscription.id,
                priceId,
                metadata: {
                  checkout_session_id: session.id,
                  reward_type: campaign.reward_type,
                  billing_cycle: campaign.billing_cycle,
                },
              });

              if (campaign.reward_type === 'stripe_checkout_coupon') {
                await upsertPromoRedemption(supabase, {
                  userId,
                  campaignCode: campaign.code,
                  status: 'consumed',
                  customerId,
                  subscriptionId: subscription.id,
                  priceId,
                  metadata: {
                    checkout_session_id: session.id,
                    coupon_id: campaign.stripe_coupon_id,
                    applied_via: 'checkout.session.completed',
                    reward_type: campaign.reward_type,
                  },
                });
                console.log('[Stripe Webhook] Marked checkout coupon redemption as consumed', {
                  subscriptionId: subscription.id,
                  couponId: campaign.stripe_coupon_id,
                });
              } else {
                const latestSubscription = await stripe.subscriptions.retrieve(subscription.id);
                if (
                  latestSubscription.status === 'active' ||
                  latestSubscription.status === 'trialing'
                ) {
                  console.log('[Stripe Webhook] Applying promo after checkout completion', {
                    subscriptionId: latestSubscription.id,
                    status: latestSubscription.status,
                  });
                  await applyPay1Get3Discount(
                    supabase,
                    userId,
                    latestSubscription,
                    'checkout.session.completed',
                    campaign
                  );
                }
              }
            }
            }
          }

          if (userId && session.payment_status === 'paid') {
            await sendPaymentConfirmationEmail(supabase, {
              userId,
              customerId,
              subscription,
              checkoutSessionId: session.id,
              amountTotal: session.amount_total ?? null,
              currency: session.currency ?? null,
            });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const priceId = subscription.items.data[0]?.price.id;
          const tier = getTierFromPriceId(priceId);

          if (tier) {
            await upsertSubscription(supabase, {
              userId,
              source: 'stripe',
              tier,
              status: normalizeStripeStatus(subscription.status),
              customerId: subscription.customer as string,
              subscriptionId: subscription.id,
              expiresAt: toIso(subscription.current_period_end),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        await supabase
          .from('subscriptions')
          .update({
            status: 'expired',
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq('source', 'stripe')
          .eq('provider_subscription_id', subscription.id);

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        if (subscriptionId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('source', 'stripe')
            .eq('provider_subscription_id', subscriptionId);
        }

        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        if (subscriptionId) {
          console.log('[Stripe Webhook] invoice.paid', {
            subscriptionId,
            billingReason: invoice.billing_reason,
            invoiceId: invoice.id,
          });

          await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('source', 'stripe')
            .eq('provider_subscription_id', subscriptionId);

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.supabase_user_id;
          const campaignCode = subscription.metadata?.campaign_code?.trim().toUpperCase();
          const billingCycle = getBillingCycleFromPriceId(subscription.items.data[0]?.price.id);

          console.log('[Stripe Webhook] subscription metadata', {
            subscriptionId: subscription.id,
            userId,
            campaignCode,
            billingCycle,
          });

          if (userId && campaignCode && billingCycle) {
            const campaign = await getPromoCampaign(supabase, campaignCode, 'stripe', billingCycle);
            if (campaign?.reward_type === 'stripe_deferred_coupon') {
              await applyPay1Get3Discount(
                supabase,
                userId,
                subscription,
                invoice.billing_reason ?? null,
                campaign
              );
            }
          }
        }

        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function toIso(unixSeconds?: number | null): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function normalizeStripeStatus(status: string): 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'expired';
    case 'incomplete':
    case 'incomplete_expired':
      return 'past_due';
    default:
      return 'active';
  }
}

async function upsertSubscription(
  supabase: ReturnType<typeof createClient>,
  input: {
    userId: string;
    source: Source;
    tier: Tier;
    status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
    customerId: string | null;
    subscriptionId: string;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
  }
) {
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: input.userId,
      source: input.source,
      tier: input.tier,
      status: input.status,
      stripe_customer_id: input.customerId,
      stripe_subscription_id: input.subscriptionId,
      provider_customer_id: input.customerId,
      provider_subscription_id: input.subscriptionId,
      expires_at: input.expiresAt,
      cancel_at_period_end: input.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,source',
    }
  );

  if (error) {
    throw error;
  }
}

async function upsertPromoRedemption(
  supabase: ReturnType<typeof createClient>,
  input: {
    userId: string;
    campaignCode: string;
    status: 'pending' | 'checkout_completed' | 'consumed' | 'failed';
    customerId: string | null;
    subscriptionId: string | null;
    priceId: string | null | undefined;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('promo_campaign_redemptions').upsert(
    {
      user_id: input.userId,
      campaign_code: input.campaignCode,
      platform: 'stripe',
      status: input.status,
      stripe_customer_id: input.customerId,
      stripe_subscription_id: input.subscriptionId,
      stripe_price_id: input.priceId ?? null,
      applied_at: input.status === 'consumed' ? new Date().toISOString() : null,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,campaign_code,platform',
    }
  );

  if (error) {
    throw error;
  }
}

async function applyPay1Get3Discount(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  subscription: Stripe.Subscription,
  billingReason: string | null,
  campaign: PromoCampaign
) {
  if (!campaign.stripe_coupon_id) {
    throw new Error(`Missing stripe coupon id for campaign ${campaign.code}`);
  }

  const priceId = subscription.items.data[0]?.price.id;
  if (!isMonthlyPriceId(priceId)) {
    await upsertPromoRedemption(supabase, {
      userId,
      campaignCode: campaign.code,
      status: 'failed',
      customerId: subscription.customer as string,
      subscriptionId: subscription.id,
      priceId,
      metadata: {
        reason: 'ineligible_price',
      },
    });
    return;
  }

  const { data: redemption, error: redemptionError } = await supabase
    .from('promo_campaign_redemptions')
    .select('status, metadata')
    .eq('user_id', userId)
    .eq('campaign_code', campaign.code)
    .eq('platform', 'stripe')
    .maybeSingle();

  if (redemptionError) {
    throw redemptionError;
  }

  if (!redemption) {
    console.log('[Stripe Webhook] No promo redemption found', {
      userId,
      subscriptionId: subscription.id,
    });
    return;
  }

  if (redemption.status === 'consumed') {
    console.log('[Stripe Webhook] Promo already consumed', {
      userId,
      subscriptionId: subscription.id,
    });
    return;
  }

  console.log('[Stripe Webhook] Applying deferred promo coupon', {
    userId,
    subscriptionId: subscription.id,
    billingReason,
    campaignCode: campaign.code,
    currentStatus: redemption.status,
  });

  if (subscription.discount?.coupon?.id !== campaign.stripe_coupon_id) {
    await stripe.subscriptions.update(subscription.id, {
      discounts: [{ coupon: campaign.stripe_coupon_id }],
      proration_behavior: 'none',
    });
    console.log('[Stripe Webhook] Coupon applied to subscription', {
      subscriptionId: subscription.id,
      couponId: campaign.stripe_coupon_id,
    });
  }

  await upsertPromoRedemption(supabase, {
    userId,
    campaignCode: campaign.code,
    status: 'consumed',
    customerId: subscription.customer as string,
    subscriptionId: subscription.id,
    priceId,
    metadata: {
      coupon_id: campaign.stripe_coupon_id,
      applied_via: 'invoice.paid',
      billing_reason: billingReason,
      reward_type: campaign.reward_type,
    },
  });
}

function isMonthlyPriceId(priceId?: string | null): boolean {
  if (!priceId) return false;

  const monthlyPriceIds = [
    Deno.env.get('STRIPE_PRICE_CELESTIAL_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_COSMIC_MONTHLY'),
  ].filter(Boolean);

  return monthlyPriceIds.includes(priceId);
}

function isYearlyPriceId(priceId?: string | null): boolean {
  if (!priceId) return false;

  const yearlyPriceIds = [
    Deno.env.get('STRIPE_PRICE_CELESTIAL_YEARLY'),
    Deno.env.get('STRIPE_PRICE_COSMIC_YEARLY'),
  ].filter(Boolean);

  return yearlyPriceIds.includes(priceId);
}

function getTierFromPriceId(priceId?: string | null): Tier | null {
  if (!priceId) return null;

  const celestialPrices = [
    Deno.env.get('STRIPE_PRICE_CELESTIAL_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_CELESTIAL_YEARLY'),
  ].filter(Boolean);

  const cosmicPrices = [
    Deno.env.get('STRIPE_PRICE_COSMIC_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_COSMIC_YEARLY'),
  ].filter(Boolean);

  if (cosmicPrices.includes(priceId)) return 'premium_plus';
  if (celestialPrices.includes(priceId)) return 'premium';
  return null;
}

function getBillingCycleFromPriceId(priceId?: string | null): 'monthly' | 'yearly' | null {
  if (isMonthlyPriceId(priceId)) return 'monthly';
  if (isYearlyPriceId(priceId)) return 'yearly';
  return null;
}

function isPromoCampaignCurrentlyActive(campaign: PromoCampaign | null): campaign is PromoCampaign {
  if (!campaign?.active) return false;

  const now = Date.now();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) {
    return false;
  }
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) {
    return false;
  }

  return true;
}

async function getPromoCampaign(
  supabase: ReturnType<typeof createClient>,
  code: string,
  platform: 'stripe' | 'play_store',
  billingCycle: 'monthly' | 'yearly'
) {
  const { data, error } = await supabase
    .from('promo_campaigns')
    .select(
      'code, platform, billing_cycle, reward_type, stripe_coupon_id, play_defer_duration_seconds, active, starts_at, ends_at'
    )
    .eq('code', code)
    .eq('platform', platform)
    .eq('billing_cycle', billingCycle)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return isPromoCampaignCurrentlyActive(data as PromoCampaign | null)
    ? (data as PromoCampaign)
    : null;
}

function formatCurrency(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) {
    return null;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatBillingDate(isoDate: string | null): string | null {
  if (!isoDate) {
    return null;
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}

function getPlanLabel(priceId?: string | null): string {
  if (priceId === Deno.env.get('STRIPE_PRICE_CELESTIAL_MONTHLY')) {
    return 'Celestial Monthly';
  }

  if (priceId === Deno.env.get('STRIPE_PRICE_CELESTIAL_YEARLY')) {
    return 'Celestial Yearly';
  }

  if (priceId === Deno.env.get('STRIPE_PRICE_COSMIC_MONTHLY')) {
    return 'Cosmic Monthly';
  }

  if (priceId === Deno.env.get('STRIPE_PRICE_COSMIC_YEARLY')) {
    return 'Cosmic Yearly';
  }

  return 'AstroDating Premium';
}

function renderPaymentEmailShell({
  eyebrow,
  title,
  intro,
  summaryRows,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  summaryRows: Array<{ label: string; value: string }>;
  footer: string;
}) {
  const summaryHtml = summaryRows
    .map(
      (row) => `
        <tr>
          <td style="padding:0 0 10px;color:#98a2b8;font-size:13px;letter-spacing:0.02em;">${row.label}</td>
          <td style="padding:0 0 10px;color:#ffffff;font-size:14px;font-weight:600;text-align:right;">${row.value}</td>
        </tr>
      `
    )
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at top left,#2d1638 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,rgba(244,114,182,0.18),rgba(167,139,250,0.08));border-bottom:1px solid #2a3247;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #4b556f;color:#f8d4df;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
                  ${eyebrow}
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;">
                  ${title}
                </h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <div style="margin-bottom:22px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(99,102,241,0.14));border:1px solid rgba(255,255,255,0.08);">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${summaryHtml}
                  </table>
                </div>
                <div style="color:#b7bfd3;font-size:14px;line-height:1.75;">
                  ${footer}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendPaymentConfirmationEmail(
  supabase: ReturnType<typeof createClient>,
  input: {
    userId: string;
    customerId: string | null;
    subscription: Stripe.Subscription;
    checkoutSessionId: string;
    amountTotal: number | null;
    currency: string | null;
  }
) {
  if (!resendApiKey) {
    console.log('[Stripe Webhook] Skipping payment confirmation email: missing RESEND_API_KEY');
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, name')
    .eq('id', input.userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile?.email) {
    console.log('[Stripe Webhook] Skipping payment confirmation email: missing email', {
      userId: input.userId,
    });
    return;
  }

  const existingPaymentEmail = subscriptionMetadataValue(
    input.subscription.metadata,
    'payment_confirmation_sent_at'
  );

  if (existingPaymentEmail) {
    console.log('[Stripe Webhook] Payment confirmation email already sent', {
      subscriptionId: input.subscription.id,
      sentAt: existingPaymentEmail,
    });
    return;
  }

  const amountLabel =
    formatCurrency(input.amountTotal, input.currency) ??
    formatCurrency(input.subscription.items.data[0]?.price.unit_amount ?? null, input.currency);
  const nextBillingDate = formatBillingDate(toIso(input.subscription.current_period_end));
  const planLabel = getPlanLabel(input.subscription.items.data[0]?.price.id);
  const firstName = profile.name?.trim() || 'there';
  const summaryRows = [
    { label: 'Plan', value: planLabel },
    ...(amountLabel ? [{ label: 'Amount paid', value: amountLabel }] : []),
    ...(nextBillingDate ? [{ label: 'Next billing date', value: nextBillingDate }] : []),
    { label: 'Subscription ID', value: input.subscription.id },
  ];

  const html = renderPaymentEmailShell({
    eyebrow: 'Payment confirmed',
    title: 'Your AstroDating payment went through',
    intro: `Hi ${firstName}, your subscription is active and your payment has been confirmed.`,
    summaryRows,
    footer:
      'You can manage your subscription anytime from billing settings. If anything looks wrong, reply to this email and the AstroDating team will review it.',
  });

  const resendResponse = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [profile.email],
      subject: `Payment confirmed - ${planLabel}`,
      html,
    }),
  });

  const resendPayload = await resendResponse.json();

  if (!resendResponse.ok) {
    throw new Error(`Resend API error: ${JSON.stringify(resendPayload)}`);
  }

  await stripe.subscriptions.update(input.subscription.id, {
    metadata: {
      ...input.subscription.metadata,
      payment_confirmation_sent_at: new Date().toISOString(),
      payment_confirmation_checkout_session_id: input.checkoutSessionId,
    },
  });

  console.log('[Stripe Webhook] Payment confirmation email sent', {
    subscriptionId: input.subscription.id,
    customerId: input.customerId,
    email: profile.email,
  });
}

function subscriptionMetadataValue(
  metadata: Stripe.Metadata | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value ? value : null;
}
