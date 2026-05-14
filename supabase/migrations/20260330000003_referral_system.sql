-- Referral system: each user gets a unique code, both referrer and referee get 1 month free

-- Add referral_code to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id);

-- Generate a short unique referral code for existing users who don't have one
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  code TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-char alphanumeric code
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = code) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN code;
END;
$$;

-- Auto-generate referral code on profile creation
CREATE OR REPLACE FUNCTION public.set_referral_code_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_referral_code ON public.profiles;
CREATE TRIGGER trigger_set_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_referral_code_on_insert();

-- Backfill existing profiles without a referral code
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

-- Referral redemptions tracking
CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'free_month',
  referrer_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  referee_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer
  ON public.referral_redemptions (referrer_id);

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access to referral redemptions"
  ON public.referral_redemptions FOR ALL
  USING (false);

CREATE POLICY "Service role can manage referral redemptions"
  ON public.referral_redemptions FOR ALL
  USING (auth.role() = 'service_role');

-- Allow authenticated users to read their own referral code
CREATE POLICY "Users can read own referral_code"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- RPC to get referral stats for current user
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id UUID)
RETURNS TABLE (
  referral_code TEXT,
  total_referrals BIGINT,
  rewarded_referrals BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.referral_code,
    (SELECT count(*) FROM referral_redemptions r WHERE r.referrer_id = p_user_id),
    (SELECT count(*) FROM referral_redemptions r WHERE r.referrer_id = p_user_id AND r.referrer_rewarded = TRUE)
  FROM profiles p
  WHERE p.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_stats(UUID) TO authenticated;
