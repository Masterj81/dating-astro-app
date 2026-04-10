-- =============================================================================
-- Multi-provider subscriptions
-- Idempotent version with one archive row per original subscription row
-- =============================================================================

-- =============================================================================
-- ÉTAPE 0 : Table d'archive (idempotente)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_id UUID NOT NULL UNIQUE,  -- Une seule archive par ligne
  user_id UUID,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  archive_reason TEXT NOT NULL
);

-- =============================================================================
-- ÉTAPE 1 : Archiver les lignes à nettoyer (idempotent)
-- Une ligne = une seule raison (priorité: no_source > tier_invalid)
-- =============================================================================

INSERT INTO public.subscriptions_archive (
  original_id, user_id, stripe_customer_id, stripe_subscription_id,
  tier, status, expires_at, cancel_at_period_end, created_at, updated_at,
  archive_reason
)
SELECT
  id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  tier,
  status,
  expires_at,
  cancel_at_period_end,
  created_at,
  updated_at,
  CASE
    WHEN stripe_customer_id IS NULL AND stripe_subscription_id IS NULL
      THEN 'no_source_identifiable'
    WHEN tier = 'free' OR tier IS NULL
      THEN 'tier_free_or_null'
    ELSE 'tier_free_or_null'
  END AS archive_reason
FROM public.subscriptions
WHERE (stripe_customer_id IS NULL AND stripe_subscription_id IS NULL)
   OR tier = 'free'
   OR tier IS NULL
ON CONFLICT (original_id) DO NOTHING;

-- =============================================================================
-- ÉTAPE 2 : Préparer la structure
-- =============================================================================

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

-- =============================================================================
-- ÉTAPE 3 : Migrer les données Stripe existantes
-- =============================================================================

UPDATE public.subscriptions
SET
  source = 'stripe',
  provider_customer_id = stripe_customer_id,
  provider_subscription_id = stripe_subscription_id
WHERE source IS NULL
  AND (stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL);

-- =============================================================================
-- ÉTAPE 4 : Nettoyage (données déjà archivées)
-- =============================================================================

DELETE FROM public.subscriptions
WHERE source IS NULL;

DELETE FROM public.subscriptions
WHERE tier = 'free' OR tier IS NULL;

-- =============================================================================
-- ÉTAPE 5 : Appliquer les contraintes
-- =============================================================================

ALTER TABLE public.subscriptions
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_source_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_source_check
  CHECK (source IN ('stripe', 'app_store', 'play_store'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('premium', 'premium_plus'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_user_source_unique;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_source_unique
  UNIQUE (user_id, source);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider
  ON public.subscriptions(source, provider_subscription_id);

-- =============================================================================
-- ÉTAPE 6 : Table d'audit des événements webhook
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'app_store', 'play_store')),
  event_type TEXT NOT NULL,
  tier TEXT CHECK (tier IN ('premium', 'premium_plus')),
  provider_event_id TEXT,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_events_provider_event
  ON public.subscription_events(source, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_created
  ON public.subscription_events(user_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own subscription events" ON public.subscription_events;
CREATE POLICY "Users can read own subscription events"
  ON public.subscription_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage subscription events" ON public.subscription_events;
CREATE POLICY "Service role can manage subscription events"
  ON public.subscription_events FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- ÉTAPE 7 : RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_effective_subscription(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  source TEXT,
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.tier,
    s.status,
    s.source,
    s.expires_at,
    s.cancel_at_period_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY
    CASE s.tier
      WHEN 'premium_plus' THEN 2
      WHEN 'premium' THEN 1
      ELSE 0
    END DESC,
    s.expires_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_subscription(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.get_effective_subscription(p_user_id)),
    'free'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO authenticated;
