-- Scheduled marketing posts table for server-side publishing
-- Used by the publish-scheduled-posts edge function + pg_cron

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  topic TEXT,
  ai_score INTEGER DEFAULT 0,
  platforms TEXT[] NOT NULL DEFAULT ARRAY['facebook', 'instagram'],
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posted', 'failed')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  blotato_post_id TEXT,
  error TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_posts_scheduled
  ON public.marketing_posts (scheduled_for)
  WHERE status = 'scheduled';

ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access to marketing posts"
  ON public.marketing_posts FOR ALL
  USING (false);

CREATE POLICY "Service role can manage marketing posts"
  ON public.marketing_posts FOR ALL
  USING (auth.role() = 'service_role');
