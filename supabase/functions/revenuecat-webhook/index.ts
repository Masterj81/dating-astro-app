import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? '';
const GOOGLE_PLAY_PACKAGE_NAME = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME') ?? 'com.astrodatingapp.mobile';
const GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL =
  Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL') ?? '';
const GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY =
  (Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

type Tier = 'premium' | 'premium_plus';
type Source = 'app_store' | 'play_store';
type Status = 'active' | 'trialing' | 'canceled' | 'expired' | 'past_due';
type PromoCampaign = {
  code: string;
  platform: 'stripe' | 'play_store';
  billing_cycle: 'monthly' | 'yearly';
  reward_type:
    | 'stripe_deferred_coupon'
    | 'stripe_checkout_coupon'
    | 'play_store_defer_billing'
    | 'play_store_subscription_option';
  stripe_coupon_id: string | null;
  play_defer_duration_seconds: number | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  store?: string;
  entitlement_ids?: string[];
  product_id?: string;
  original_transaction_id?: string;
  transaction_id?: string;
  expiration_at_ms?: number;
  is_trial_conversion?: boolean;
  cancel_reason?: string;
};

type RevenueCatPayload = {
  event?: RevenueCatEvent;
  api_version?: string;
};

function mapStoreToSource(store?: string): Source | null {
  if (!store) return null;
  const normalized = store.toUpperCase();
  if (normalized === 'APP_STORE' || normalized === 'MAC_APP_STORE') return 'app_store';
  if (normalized === 'PLAY_STORE') return 'play_store';
  return null;
}

function mapEntitlementToTier(entitlementIds?: string[]): Tier | null {
  if (!entitlementIds?.length) return null;
  if (entitlementIds.includes('premium_plus')) return 'premium_plus';
  if (entitlementIds.includes('premium')) return 'premium';
  return null;
}

function mapEventTypeToStatus(eventType: string): Status {
  switch (eventType.toUpperCase()) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
      return 'active';
    case 'CANCELLATION':
      // Access should continue until expiration.
      return 'active';
    case 'BILLING_ISSUE':
      return 'past_due';
    case 'EXPIRATION':
    case 'REFUND':
      return 'expired';
    default:
      return 'active';
  }
}

function shouldMarkCancelAtPeriodEnd(eventType: string): boolean {
  return eventType.toUpperCase() === 'CANCELLATION';
}

function shouldClearCancelAtPeriodEnd(eventType: string): boolean {
  const normalized = eventType.toUpperCase();
  return normalized === 'UNCANCELLATION' || normalized === 'RENEWAL' || normalized === 'INITIAL_PURCHASE';
}

function isTerminalEvent(eventType: string): boolean {
  const normalized = eventType.toUpperCase();
  return normalized === 'EXPIRATION' || normalized === 'REFUND';
}

function isInitialPurchase(eventType: string): boolean {
  return eventType.toUpperCase() === 'INITIAL_PURCHASE';
}

function isMonthlyPlayProduct(productId?: string): boolean {
  if (!productId) return false;

  const configured = [
    Deno.env.get('PLAY_PRODUCT_CELESTIAL_MONTHLY'),
    Deno.env.get('PLAY_PRODUCT_COSMIC_MONTHLY'),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const normalized = productId.toLowerCase();
  if (configured.length) {
    return configured.includes(normalized);
  }

  return normalized.includes('month');
}

function isYearlyPlayProduct(productId?: string): boolean {
  if (!productId) return false;

  const configured = [
    Deno.env.get('PLAY_PRODUCT_CELESTIAL_YEARLY'),
    Deno.env.get('PLAY_PRODUCT_COSMIC_YEARLY'),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  const normalized = productId.toLowerCase();
  if (configured.length) {
    return configured.includes(normalized);
  }

  return normalized.includes('year');
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

function encodeBase64Url(input: Uint8Array | string) {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const sanitized = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function getGooglePlayAccessToken() {
  if (!GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('Missing Google Play service account credentials');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(payload)
  )}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const assertion = `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payloadJson = await response.json();
  if (!response.ok || !payloadJson.access_token) {
    throw new Error(`Google OAuth error: ${JSON.stringify(payloadJson)}`);
  }

  return String(payloadJson.access_token);
}

async function getPlaySubscription(accessToken: string, purchaseToken: string) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      GOOGLE_PLAY_PACKAGE_NAME
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Google Play get subscription error: ${JSON.stringify(payload)}`);
  }

  return payload as { etag?: string; lineItems?: Array<{ productId?: string; expiryTime?: string }> };
}

async function deferPlaySubscription(
  accessToken: string,
  purchaseToken: string,
  etag: string,
  deferDurationSeconds: number
) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      GOOGLE_PLAY_PACKAGE_NAME
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}:defer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deferralContext: {
          etag,
          deferDuration: `${deferDurationSeconds}s`,
          validateOnly: false,
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Google Play defer error: ${JSON.stringify(payload)}`);
  }

  return payload as { itemExpiryTimeDetails?: Array<{ productId?: string; expiryTime?: string }> };
}

async function processPlayPromoRedemption(userId: string, event: RevenueCatEvent) {
  const { data: redemption, error: redemptionError } = await supabase
    .from('promo_campaign_redemptions')
    .select('campaign_code, status, metadata')
    .eq('user_id', userId)
    .eq('platform', 'play_store')
    .in('status', ['pending', 'checkout_completed'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (redemptionError) {
    throw redemptionError;
  }

  if (!redemption || redemption.status === 'consumed') {
    return;
  }

  const billingCycle =
    redemption.metadata && typeof redemption.metadata === 'object' && 'billing_cycle' in redemption.metadata
      ? String((redemption.metadata as Record<string, unknown>).billing_cycle ?? 'monthly')
      : 'monthly';

  const { data: campaignData, error: campaignError } = await supabase
    .from('promo_campaigns')
    .select(
      'code, platform, billing_cycle, reward_type, stripe_coupon_id, play_defer_duration_seconds, active, starts_at, ends_at'
    )
    .eq('code', redemption.campaign_code)
    .eq('platform', 'play_store')
    .eq('billing_cycle', billingCycle)
    .maybeSingle();

  if (campaignError) {
    throw campaignError;
  }

  const campaign = isPromoCampaignCurrentlyActive(campaignData as PromoCampaign | null)
    ? (campaignData as PromoCampaign)
    : null;

  if (!campaign) {
    return;
  }

  const isEligibleProduct =
    campaign.billing_cycle === 'monthly'
      ? isMonthlyPlayProduct(event.product_id)
      : isYearlyPlayProduct(event.product_id);

  if (!event.product_id || !isEligibleProduct) {
    const { error } = await supabase
      .from('promo_campaign_redemptions')
      .update({
        status: 'failed',
        metadata: {
          reason: 'ineligible_product',
          product_id: event.product_id ?? null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('campaign_code', campaign.code)
      .eq('platform', 'play_store');

    if (error) {
      console.error('[RC Webhook] Failed to mark ineligible play promo redemption', error);
    }
    return;
  }

  if (campaign.reward_type === 'play_store_subscription_option') {
    const { error: consumeError } = await supabase
      .from('promo_campaign_redemptions')
      .update({
        status: 'consumed',
        applied_at: new Date().toISOString(),
        metadata: {
          source: 'revenuecat-webhook',
          product_id: event.product_id,
          applied_via: 'google_play_yearly_offer',
          reward_type: campaign.reward_type,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('campaign_code', campaign.code)
      .eq('platform', 'play_store');

    if (consumeError) {
      throw consumeError;
    }

    console.log('[RC Webhook] Play yearly promo redemption consumed', {
      userId,
      campaignCode: campaign.code,
      productId: event.product_id,
    });
    return;
  }

  if (campaign.reward_type !== 'play_store_defer_billing') {
    return;
  }

  const purchaseToken = event.original_transaction_id || event.transaction_id;
  if (!purchaseToken) {
    throw new Error('Missing Play purchase token on RevenueCat event');
  }

  const accessToken = await getGooglePlayAccessToken();
  const subscription = await getPlaySubscription(accessToken, purchaseToken);
  if (!subscription.etag) {
    throw new Error('Missing Google Play subscription etag');
  }

  const deferResult = await deferPlaySubscription(
    accessToken,
    purchaseToken,
    subscription.etag,
    campaign.play_defer_duration_seconds ?? 7776000
  );

  const { error: consumeError } = await supabase
    .from('promo_campaign_redemptions')
    .update({
      status: 'consumed',
      applied_at: new Date().toISOString(),
      metadata: {
        source: 'revenuecat-webhook',
        purchase_token: purchaseToken,
        product_id: event.product_id,
        applied_via: 'google_play_subscriptionsv2.defer',
        defer_duration_seconds: campaign.play_defer_duration_seconds ?? 7776000,
        reward_type: campaign.reward_type,
        defer_result: deferResult,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('campaign_code', campaign.code)
    .eq('platform', 'play_store');

  if (consumeError) {
    throw consumeError;
  }

  console.log('[RC Webhook] Play promo redemption consumed', {
    userId,
    campaignCode: campaign.code,
    productId: event.product_id,
    purchaseToken,
  });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let result = 0;
  for (let i = 0; i < a.byteLength; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function verifyRevenueCatSignature(body: string, signatureHeader: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const expectedSig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  );

  // Decode the hex-encoded signature from the header
  const receivedHex = signatureHeader.trim();
  const receivedSig = new Uint8Array(
    receivedHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
  );

  return timingSafeEqual(expectedSig, receivedSig);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    if (!WEBHOOK_SECRET) {
      console.error('[RC Webhook] Missing REVENUECAT_WEBHOOK_SECRET');
      return new Response('Server configuration error', { status: 500 });
    }

    const signatureHeader = req.headers.get('X-RevenueCat-Webhook-Signature') ?? '';
    if (!signatureHeader) {
      console.warn('[RC Webhook] Missing signature header');
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.text();
    const isValid = await verifyRevenueCatSignature(body, signatureHeader);
    if (!isValid) {
      console.warn('[RC Webhook] Invalid HMAC signature');
      return new Response('Unauthorized', { status: 401 });
    }

    const payload: RevenueCatPayload = JSON.parse(body);
    const event = payload.event ?? (payload as unknown as RevenueCatEvent);

    const userId = event.app_user_id;
    const eventType = event.type;
    const providerEventId = event.id;
    const source = mapStoreToSource(event.store);

    if (!userId || !eventType) {
      return new Response(JSON.stringify({ error: 'Missing userId or eventType' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!source) {
      return new Response(JSON.stringify({ error: 'Unknown store' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tier = mapEntitlementToTier(event.entitlement_ids);
    const status = mapEventTypeToStatus(eventType);
    const providerSubscriptionId =
      event.original_transaction_id || event.transaction_id || null;
    const expiresAt = event.expiration_at_ms
      ? new Date(Number(event.expiration_at_ms)).toISOString()
      : null;

    console.log(
      `[RC Webhook] ${eventType} user=${userId} source=${source} tier=${tier ?? 'null'} status=${status}`
    );

    if (source === 'play_store' && isInitialPurchase(eventType)) {
      await processPlayPromoRedemption(userId, event);
    }

    const { error: eventError } = await supabase
      .from('subscription_events')
      .upsert(
        {
          user_id: userId,
          source,
          event_type: eventType.toLowerCase(),
          tier,
          provider_event_id: providerEventId,
          raw_payload: payload,
        },
        {
          onConflict: 'source,provider_event_id',
        }
      );

    if (eventError) {
      console.error('[RC Webhook] Failed to log event', eventError);
    }

    if (isTerminalEvent(eventType)) {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'expired',
          expires_at: expiresAt,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('source', source);

      if (error) {
        console.error('[RC Webhook] Failed terminal update', error);
        return new Response(JSON.stringify({ error: 'Database error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (tier) {
      const cancelAtPeriodEnd = shouldMarkCancelAtPeriodEnd(eventType)
        ? true
        : shouldClearCancelAtPeriodEnd(eventType)
        ? false
        : undefined;

      const row: Record<string, unknown> = {
        user_id: userId,
        source,
        tier,
        status,
        provider_customer_id: userId,
        provider_subscription_id: providerSubscriptionId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };

      if (cancelAtPeriodEnd !== undefined) {
        row.cancel_at_period_end = cancelAtPeriodEnd;
      }

      const { error } = await supabase.from('subscriptions').upsert(row, {
        onConflict: 'user_id,source',
      });

      if (error) {
        console.error('[RC Webhook] Failed subscription upsert', error);
        return new Response(JSON.stringify({ error: 'Database error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      const patch: Record<string, unknown> = {
        status,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };

      if (shouldMarkCancelAtPeriodEnd(eventType)) {
        patch.cancel_at_period_end = true;
      } else if (shouldClearCancelAtPeriodEnd(eventType)) {
        patch.cancel_at_period_end = false;
      }

      const { error } = await supabase
        .from('subscriptions')
        .update(patch)
        .eq('user_id', userId)
        .eq('source', source);

      if (error) {
        console.error('[RC Webhook] Failed status-only update', error);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[RC Webhook] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
