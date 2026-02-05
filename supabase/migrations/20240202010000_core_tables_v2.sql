-- Core Tables Migration for Astro Dating App (v2 - handles existing tables)
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. ADD COLUMNS TO EXISTING PROFILES TABLE
-- ============================================
-- Add new columns if they don't exist
DO $$
BEGIN
  -- Basic info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE profiles ADD COLUMN email TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'age') THEN
    ALTER TABLE profiles ADD COLUMN age INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_date') THEN
    ALTER TABLE profiles ADD COLUMN birth_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_time') THEN
    ALTER TABLE profiles ADD COLUMN birth_time TIME;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_city') THEN
    ALTER TABLE profiles ADD COLUMN birth_city TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_latitude') THEN
    ALTER TABLE profiles ADD COLUMN birth_latitude DECIMAL(9,6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_longitude') THEN
    ALTER TABLE profiles ADD COLUMN birth_longitude DECIMAL(9,6);
  END IF;

  -- Zodiac signs
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'sun_sign') THEN
    ALTER TABLE profiles ADD COLUMN sun_sign TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'moon_sign') THEN
    ALTER TABLE profiles ADD COLUMN moon_sign TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'rising_sign') THEN
    ALTER TABLE profiles ADD COLUMN rising_sign TEXT;
  END IF;

  -- Full birth chart JSON
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_chart') THEN
    ALTER TABLE profiles ADD COLUMN birth_chart JSONB;
  END IF;

  -- Profile info
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
    ALTER TABLE profiles ADD COLUMN bio TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
    ALTER TABLE profiles ADD COLUMN gender TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'looking_for') THEN
    ALTER TABLE profiles ADD COLUMN looking_for TEXT[] DEFAULT ARRAY['male', 'female', 'non-binary', 'other']::TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'interests') THEN
    ALTER TABLE profiles ADD COLUMN interests TEXT[];
  END IF;

  -- Profile images
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'image_url') THEN
    ALTER TABLE profiles ADD COLUMN image_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'images') THEN
    ALTER TABLE profiles ADD COLUMN images TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;

  -- Location
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_city') THEN
    ALTER TABLE profiles ADD COLUMN current_city TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_latitude') THEN
    ALTER TABLE profiles ADD COLUMN current_latitude DECIMAL(9,6);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_longitude') THEN
    ALTER TABLE profiles ADD COLUMN current_longitude DECIMAL(9,6);
  END IF;

  -- Preferences
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'min_age') THEN
    ALTER TABLE profiles ADD COLUMN min_age INTEGER DEFAULT 18;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'max_age') THEN
    ALTER TABLE profiles ADD COLUMN max_age INTEGER DEFAULT 99;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'max_distance') THEN
    ALTER TABLE profiles ADD COLUMN max_distance INTEGER DEFAULT 100;
  END IF;

  -- Premium status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_premium') THEN
    ALTER TABLE profiles ADD COLUMN is_premium BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'premium_until') THEN
    ALTER TABLE profiles ADD COLUMN premium_until TIMESTAMPTZ;
  END IF;

  -- Profile status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_verified') THEN
    ALTER TABLE profiles ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_active') THEN
    ALTER TABLE profiles ADD COLUMN last_active TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'created_at') THEN
    ALTER TABLE profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for profiles (only if columns exist now)
CREATE INDEX IF NOT EXISTS idx_profiles_sun_sign ON profiles(sun_sign);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active DESC);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view active profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view active profiles" ON profiles
  FOR SELECT USING (TRUE);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. SWIPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('like', 'pass', 'super_like')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swiper_id, swiped_id)
);

CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON swipes(swiped_id, action);

ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own swipes" ON swipes;
DROP POLICY IF EXISTS "Users can create own swipes" ON swipes;

CREATE POLICY "Users can view own swipes" ON swipes
  FOR SELECT USING (auth.uid() = swiper_id OR auth.uid() = swiped_id);

CREATE POLICY "Users can create own swipes" ON swipes
  FOR INSERT WITH CHECK (auth.uid() = swiper_id);

-- ============================================
-- 3. MATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  compatibility_overall INTEGER,
  compatibility_emotional INTEGER,
  compatibility_communication INTEGER,
  compatibility_passion INTEGER,
  compatibility_long_term INTEGER,
  compatibility_values INTEGER,
  compatibility_growth INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unmatched', 'blocked')),
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_match') THEN
    ALTER TABLE matches ADD CONSTRAINT unique_match UNIQUE (user1_id, user2_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_matches_recent ON matches(matched_at DESC);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own matches" ON matches;
DROP POLICY IF EXISTS "Users can update own matches" ON matches;

CREATE POLICY "Users can view own matches" ON matches
  FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update own matches" ON matches
  FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ============================================
-- 4. MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'gif', 'icebreaker')),
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in their matches" ON messages;
DROP POLICY IF EXISTS "Users can send messages in their matches" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;

CREATE POLICY "Users can view messages in their matches" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = messages.match_id
      AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
    )
  );

CREATE POLICY "Users can send messages in their matches" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = messages.match_id
      AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
      AND matches.status = 'active'
    )
  );

CREATE POLICY "Users can update own messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- ============================================
-- 5. BLOCKED USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can create blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can remove own blocks" ON blocked_users;

CREATE POLICY "Users can view own blocks" ON blocked_users
  FOR SELECT USING (auth.uid() = blocker_id);

CREATE POLICY "Users can create blocks" ON blocked_users
  FOR INSERT WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can remove own blocks" ON blocked_users
  FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================
-- 6. REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'fake_profile', 'inappropriate_content', 'underage', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'action_taken', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create reports" ON reports;
DROP POLICY IF EXISTS "Users can view own reports" ON reports;

CREATE POLICY "Users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================
-- 7. DISCOVERABLE PROFILES VIEW
-- ============================================
DROP VIEW IF EXISTS discoverable_profiles;
CREATE VIEW discoverable_profiles AS
SELECT
  p.id,
  p.name,
  p.age,
  p.sun_sign,
  p.moon_sign,
  p.rising_sign,
  p.bio,
  p.image_url,
  p.images,
  p.gender,
  p.current_city,
  p.birth_chart,
  p.interests,
  p.is_verified,
  p.last_active,
  p.created_at
FROM profiles p
WHERE p.is_active = TRUE
  AND p.name IS NOT NULL;

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to check for mutual like and create match
CREATE OR REPLACE FUNCTION check_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
  mutual_like RECORD;
  ordered_user1 UUID;
  ordered_user2 UUID;
BEGIN
  IF NEW.action NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO mutual_like
  FROM swipes
  WHERE swiper_id = NEW.swiped_id
    AND swiped_id = NEW.swiper_id
    AND action IN ('like', 'super_like');

  IF FOUND THEN
    IF NEW.swiper_id < NEW.swiped_id THEN
      ordered_user1 := NEW.swiper_id;
      ordered_user2 := NEW.swiped_id;
    ELSE
      ordered_user1 := NEW.swiped_id;
      ordered_user2 := NEW.swiper_id;
    END IF;

    INSERT INTO matches (user1_id, user2_id)
    VALUES (ordered_user1, ordered_user2)
    ON CONFLICT (user1_id, user2_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_match ON swipes;
CREATE TRIGGER trigger_check_match
  AFTER INSERT ON swipes
  FOR EACH ROW
  EXECUTE FUNCTION check_and_create_match();

-- Function to update last_message_at on match
CREATE OR REPLACE FUNCTION update_match_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE matches
  SET last_message_at = NEW.created_at
  WHERE id = NEW.match_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_match_message ON messages;
CREATE TRIGGER trigger_update_match_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_match_last_message();

-- ============================================
-- 9. RPC FUNCTIONS
-- ============================================

-- Get discoverable profiles for a user
CREATE OR REPLACE FUNCTION get_discoverable_profiles(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  age INTEGER,
  sun_sign TEXT,
  moon_sign TEXT,
  rising_sign TEXT,
  bio TEXT,
  image_url TEXT,
  images TEXT[],
  gender TEXT,
  current_city TEXT,
  birth_chart JSONB,
  interests TEXT[],
  is_verified BOOLEAN,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT dp.*
  FROM discoverable_profiles dp
  WHERE dp.id != p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = dp.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = dp.id)
         OR (b.blocker_id = dp.id AND b.blocked_id = p_user_id)
    )
  ORDER BY dp.last_active DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's matches
CREATE OR REPLACE FUNCTION get_user_matches(p_user_id UUID)
RETURNS TABLE (
  match_id UUID,
  matched_user_id UUID,
  matched_user_name TEXT,
  matched_user_image TEXT,
  matched_user_sun_sign TEXT,
  compatibility_overall INTEGER,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END as matched_user_id,
    p.name as matched_user_name,
    p.image_url as matched_user_image,
    p.sun_sign as matched_user_sun_sign,
    m.compatibility_overall,
    (
      SELECT msg.content
      FROM messages msg
      WHERE msg.match_id = m.id
      ORDER BY msg.created_at DESC
      LIMIT 1
    ) as last_message,
    m.last_message_at,
    m.matched_at,
    (
      SELECT COUNT(*)
      FROM messages msg
      WHERE msg.match_id = m.id
        AND msg.sender_id != p_user_id
        AND msg.is_read = FALSE
    ) as unread_count
  FROM matches m
  JOIN profiles p ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_matches(UUID) TO authenticated;

-- Done!
SELECT 'Migration completed successfully!' as status;
