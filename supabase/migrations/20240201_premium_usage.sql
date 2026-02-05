-- Premium Usage Table
-- Tracks daily feature usage for trial mode (1 free view per feature per day)

CREATE TABLE IF NOT EXISTS premium_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feature_key, usage_date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_premium_usage_user_date
ON premium_usage(user_id, usage_date);

CREATE INDEX IF NOT EXISTS idx_premium_usage_feature
ON premium_usage(user_id, feature_key, usage_date);

-- Enable Row Level Security
ALTER TABLE premium_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own usage data
CREATE POLICY "Users can manage own usage" ON premium_usage
  FOR ALL USING (auth.uid() = user_id);

-- RPC function to increment usage atomically
-- This handles the upsert logic in a single database call
CREATE OR REPLACE FUNCTION increment_feature_usage(p_user_id UUID, p_feature_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO premium_usage (user_id, feature_key, usage_date, view_count)
  VALUES (p_user_id, p_feature_key, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature_key, usage_date)
  DO UPDATE SET view_count = premium_usage.view_count + 1
  RETURNING view_count INTO v_count;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION increment_feature_usage(UUID, TEXT) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE premium_usage IS 'Tracks daily feature usage for premium trial mode';
COMMENT ON COLUMN premium_usage.feature_key IS 'Feature identifier (synastry, super-likes, likes, priority-messages, natal-chart, daily-horoscope, monthly-horoscope, planetary-transits, retrograde-alerts, lucky-days)';
COMMENT ON COLUMN premium_usage.usage_date IS 'Date of usage - resets daily for trial mode';
COMMENT ON COLUMN premium_usage.view_count IS 'Number of times feature was viewed on this date';
