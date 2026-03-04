import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer as string;

        if (userId && session.subscription) {
          // Get subscription details
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );

          const priceId = subscription.items.data[0].price.id;
          const tier = getTierFromPriceId(priceId);

          // Upsert subscription in database
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            tier,
            status: subscription.status,
            expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const priceId = subscription.items.data[0].price.id;
          const tier = getTierFromPriceId(priceId);

          await supabase
            .from('subscriptions')
            .update({
              tier,
              status: subscription.status,
              expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        await supabase
          .from('subscriptions')
          .update({
            tier: 'free',
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function getTierFromPriceId(priceId: string): 'free' | 'premium' | 'premium_plus' {
  // Celestial = Premium tier
  const celestialPrices = [
    Deno.env.get('STRIPE_PRICE_CELESTIAL_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_CELESTIAL_YEARLY'),
    'price_1T6c0o7L5UcZ0cfVx7pVAyGZ', // celestial_monthly
    'price_1T6c0K7L5UcZ0cfVr8fNTUae', // celestial_yearly
  ];
  // Cosmic = Premium Plus tier
  const cosmicPrices = [
    Deno.env.get('STRIPE_PRICE_COSMIC_MONTHLY'),
    Deno.env.get('STRIPE_PRICE_COSMIC_YEARLY'),
    'price_1T6c1a7L5UcZ0cfVp1G7LUUN', // cosmic_monthly
    'price_1T6c2d7L5UcZ0cfVtnicXWhd', // cosmic_yearly
  ];

  if (cosmicPrices.includes(priceId)) {
    return 'premium_plus';
  }
  if (celestialPrices.includes(priceId)) {
    return 'premium';
  }
  return 'free';
}
