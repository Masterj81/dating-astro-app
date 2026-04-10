CREATE TABLE IF NOT EXISTS public.promo_campaign_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_code TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('stripe', 'play_store')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'checkout_completed', 'consumed', 'failed')
  ),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  applied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, campaign_code, platform)
);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_redemptions_status
  ON public.promo_campaign_redemptions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_campaign_redemptions_user
  ON public.promo_campaign_redemptions(user_id, created_at DESC);

ALTER TABLE public.promo_campaign_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all direct access to promo campaign redemptions"
  ON public.promo_campaign_redemptions;

DROP POLICY IF EXISTS "Service role can manage promo campaign redemptions"
  ON public.promo_campaign_redemptions;

CREATE POLICY "Deny all direct access to promo campaign redemptions"
  ON public.promo_campaign_redemptions FOR ALL
  USING (false);

CREATE POLICY "Service role can manage promo campaign redemptions"
  ON public.promo_campaign_redemptions FOR ALL
  USING (auth.role() = 'service_role');
