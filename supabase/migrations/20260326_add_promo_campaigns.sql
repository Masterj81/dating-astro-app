CREATE TABLE IF NOT EXISTS public.promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('stripe', 'play_store')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  reward_type TEXT NOT NULL CHECK (
    reward_type IN (
      'stripe_deferred_coupon',
      'stripe_checkout_coupon',
      'play_store_defer_billing',
      'play_store_subscription_option'
    )
  ),
  stripe_coupon_id TEXT,
  play_defer_duration_seconds INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_redemptions INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, platform, billing_cycle)
);

ALTER TABLE public.promo_campaigns
DROP CONSTRAINT IF EXISTS promo_campaigns_reward_type_check;

ALTER TABLE public.promo_campaigns
ADD CONSTRAINT promo_campaigns_reward_type_check
CHECK (
  reward_type IN (
    'stripe_deferred_coupon',
    'stripe_checkout_coupon',
    'play_store_defer_billing',
    'play_store_subscription_option'
  )
);

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_lookup
  ON public.promo_campaigns(code, platform, billing_cycle, active);

ALTER TABLE public.promo_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to promo campaigns"
  ON public.promo_campaigns;

DROP POLICY IF EXISTS "Service role can manage promo campaigns"
  ON public.promo_campaigns;

CREATE POLICY "Deny all direct access to promo campaigns"
  ON public.promo_campaigns FOR ALL
  USING (false);

CREATE POLICY "Service role can manage promo campaigns"
  ON public.promo_campaigns FOR ALL
  USING (auth.role() = 'service_role');

INSERT INTO public.promo_campaigns (
  code,
  platform,
  billing_cycle,
  reward_type,
  stripe_coupon_id,
  play_defer_duration_seconds,
  active,
  metadata
)
VALUES
  (
    'PAY1GET3',
    'stripe',
    'monthly',
    'stripe_deferred_coupon',
    'PAY1GET3_INTERNAL',
    NULL,
    TRUE,
    jsonb_build_object('label', 'Pay 1 Month, Get 3 Free')
  ),
  (
    'PAY1GET3',
    'stripe',
    'yearly',
    'stripe_checkout_coupon',
    'PAY1GET3_YEARLY',
    NULL,
    TRUE,
    jsonb_build_object('label', '25% Off First Year')
  ),
  (
    'PAY1GET3',
    'play_store',
    'monthly',
    'play_store_defer_billing',
    NULL,
    7776000,
    TRUE,
    jsonb_build_object('label', 'Pay 1 Month, Get 3 Free')
  ),
  (
    'PAY1GET3',
    'play_store',
    'yearly',
    'play_store_subscription_option',
    NULL,
    NULL,
    TRUE,
    jsonb_build_object(
      'label', '25% Off First Year',
      'offers', jsonb_build_object(
        'celestial_yearly', 'yearly-v2:pay1get3-celestial-yearly',
        'cosmic_yearly', 'yearly-v2:pay1get3-cosmic-yearly'
      )
    )
  )
ON CONFLICT (code, platform, billing_cycle) DO UPDATE
SET
  reward_type = EXCLUDED.reward_type,
  stripe_coupon_id = EXCLUDED.stripe_coupon_id,
  play_defer_duration_seconds = EXCLUDED.play_defer_duration_seconds,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
