-- Core Tables Migration - Final (based on actual schema)
-- Run this in your Supabase SQL Editor

-- ============================================
-- PART 1: ADD MISSING COLUMNS TO PROFILES
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_chart JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS images TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_latitude DECIMAL(9,6);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_longitude DECIMAL(9,6);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS min_age INTEGER DEFAULT 18;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_age INTEGER DEFAULT 99;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_distance INTEGER DEFAULT 100;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- PART 2: ADD MISSING COLUMNS TO MATCHES
-- ============================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_overall INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_emotional INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_communication INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_passion INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_long_term INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_values INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS compatibility_growth INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS matched_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- ============================================
-- PART 3: ADD MISSING COLUMNS TO MESSAGES
-- ============================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- PART 4: CREATE BLOCKED_USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- ============================================
-- PART 5: CREATE REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

-- ============================================
-- PART 6: RLS POLICIES
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can view profiles" ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Swipes
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own swipes" ON swipes;
DROP POLICY IF EXISTS "Users can create own swipes" ON swipes;
CREATE POLICY "Users can view own swipes" ON swipes FOR SELECT USING (auth.uid() = swiper_id OR auth.uid() = swiped_id);
CREATE POLICY "Users can create own swipes" ON swipes FOR INSERT WITH CHECK (auth.uid() = swiper_id);

-- Matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own matches" ON matches;
DROP POLICY IF EXISTS "Users can update own matches" ON matches;
CREATE POLICY "Users can view own matches" ON matches FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can update own matches" ON matches FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view messages in their matches" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can view messages in their matches" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches WHERE matches.id = messages.match_id AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid()))
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM matches WHERE matches.id = messages.match_id AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid()))
);

-- Blocked users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can create blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can remove own blocks" ON blocked_users;
CREATE POLICY "Users can view own blocks" ON blocked_users FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users can create blocks" ON blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can remove own blocks" ON blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can create reports" ON reports;
DROP POLICY IF EXISTS "Users can view own reports" ON reports;
CREATE POLICY "Users can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view own reports" ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================
-- PART 7: UPDATE DISCOVERABLE_PROFILES VIEW
-- ============================================
DROP TABLE IF EXISTS discoverable_profiles;
CREATE OR REPLACE VIEW discoverable_profiles AS
SELECT
  id,
  name,
  age,
  birth_date,
  sun_sign,
  moon_sign,
  rising_sign,
  bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender,
  current_city,
  birth_chart,
  interests,
  is_verified,
  last_active,
  created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- ============================================
-- PART 8: TRIGGER FUNCTIONS
-- ============================================

-- Auto-match on mutual like
CREATE OR REPLACE FUNCTION check_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
  ordered_user1 UUID;
  ordered_user2 UUID;
BEGIN
  IF NEW.action NOT IN ('like', 'super_like') THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM swipes WHERE swiper_id = NEW.swiped_id AND swiped_id = NEW.swiper_id AND action IN ('like', 'super_like')) THEN
    IF NEW.swiper_id < NEW.swiped_id THEN
      ordered_user1 := NEW.swiper_id; ordered_user2 := NEW.swiped_id;
    ELSE
      ordered_user1 := NEW.swiped_id; ordered_user2 := NEW.swiper_id;
    END IF;
    INSERT INTO matches (user1_id, user2_id) VALUES (ordered_user1, ordered_user2) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_match ON swipes;
CREATE TRIGGER trigger_check_match AFTER INSERT ON swipes FOR EACH ROW EXECUTE FUNCTION check_and_create_match();

-- Update last_message_at on new message
CREATE OR REPLACE FUNCTION update_match_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE matches SET last_message_at = NEW.created_at WHERE id = NEW.match_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_match_message ON messages;
CREATE TRIGGER trigger_update_match_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_match_last_message();

-- ============================================
-- PART 9: RPC FUNCTIONS
-- ============================================

-- Get discoverable profiles (excludes swiped and blocked)
CREATE OR REPLACE FUNCTION get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 20)
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
)
AS $$
BEGIN
  RETURN QUERY
  SELECT dp.id, dp.name, dp.age, dp.sun_sign, dp.moon_sign, dp.rising_sign, dp.bio, dp.image_url, dp.images, dp.gender, dp.current_city, dp.birth_chart, dp.interests, dp.is_verified, dp.last_active, dp.created_at
  FROM discoverable_profiles dp
  WHERE dp.id != p_user_id
    AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = p_user_id AND s.swiped_id = dp.id)
    AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE (b.blocker_id = p_user_id AND b.blocked_id = dp.id) OR (b.blocker_id = dp.id AND b.blocked_id = p_user_id))
  ORDER BY dp.last_active DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's matches with last message
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
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END as matched_user_id,
    p.name as matched_user_name,
    COALESCE(p.image_url, p.photos[1]) as matched_user_image,
    p.sun_sign as matched_user_sun_sign,
    COALESCE(m.compatibility_overall, m.compatibility_score) as compatibility_overall,
    (SELECT msg.content FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) as last_message,
    m.last_message_at,
    COALESCE(m.matched_at, m.created_at) as matched_at,
    (SELECT COUNT(*) FROM messages msg WHERE msg.match_id = m.id AND msg.sender_id != p_user_id AND (msg.is_read = FALSE OR msg.read = FALSE)) as unread_count
  FROM matches m
  JOIN profiles p ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND COALESCE(m.status, 'active') = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at, m.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_matches(UUID) TO authenticated;

SELECT 'Migration completed successfully!' as result;
