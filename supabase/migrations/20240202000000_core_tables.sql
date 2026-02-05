-- Core Tables Migration for Astro Dating App
-- Creates: profiles, discoverable_profiles (view), matches, messages, swipes, blocked_users, reports

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  birth_time TIME,
  birth_city TEXT,
  birth_latitude DECIMAL(9,6),
  birth_longitude DECIMAL(9,6),

  -- Zodiac signs
  sun_sign TEXT,
  moon_sign TEXT,
  rising_sign TEXT,

  -- Full birth chart (JSON for flexibility)
  birth_chart JSONB,

  -- Profile info
  bio TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'non-binary', 'other', 'prefer-not-to-say')),
  looking_for TEXT[] DEFAULT ARRAY['male', 'female', 'non-binary', 'other']::TEXT[],
  interests TEXT[],

  -- Profile images
  image_url TEXT,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Location (for discovery)
  current_city TEXT,
  current_latitude DECIMAL(9,6),
  current_longitude DECIMAL(9,6),

  -- Preferences
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 99,
  max_distance INTEGER DEFAULT 100, -- km
  preferred_elements TEXT[] DEFAULT ARRAY['fire', 'earth', 'air', 'water']::TEXT[],

  -- Premium status
  is_premium BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMPTZ,

  -- Profile status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_sun_sign ON profiles(sun_sign);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(current_latitude, current_longitude);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view active profiles" ON profiles
  FOR SELECT USING (is_active = TRUE);

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

-- Indexes for swipes
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON swipes(swiped_id, action);
CREATE INDEX IF NOT EXISTS idx_swipes_likes ON swipes(swiped_id) WHERE action IN ('like', 'super_like');

-- Enable RLS
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for swipes
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

  -- Compatibility scores (cached from synastry calculation)
  compatibility_overall INTEGER,
  compatibility_emotional INTEGER,
  compatibility_communication INTEGER,
  compatibility_passion INTEGER,
  compatibility_long_term INTEGER,
  compatibility_values INTEGER,
  compatibility_growth INTEGER,

  -- Match status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'unmatched', 'blocked')),
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,

  -- Ensure user1_id < user2_id to prevent duplicates
  CONSTRAINT unique_match UNIQUE (user1_id, user2_id),
  CONSTRAINT ordered_users CHECK (user1_id < user2_id)
);

-- Indexes for matches
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_matches_recent ON matches(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_last_message ON matches(last_message_at DESC NULLS LAST);

-- Enable RLS
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for matches
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

  -- Read status
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(match_id, is_read) WHERE is_read = FALSE;

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id);

-- Enable RLS
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);

-- Enable RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- ============================================
-- 7. DISCOVERABLE PROFILES VIEW
-- ============================================
-- View that shows profiles available for discovery (excludes blocked, already swiped, etc.)
CREATE OR REPLACE VIEW discoverable_profiles AS
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
  AND p.onboarding_completed = TRUE
  AND p.name IS NOT NULL
  AND (p.image_url IS NOT NULL OR array_length(p.images, 1) > 0);

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to check for mutual like and create match
CREATE OR REPLACE FUNCTION check_and_create_match()
RETURNS TRIGGER AS $$
DECLARE
  mutual_like RECORD;
  new_match_id UUID;
  ordered_user1 UUID;
  ordered_user2 UUID;
BEGIN
  -- Only process likes and super_likes
  IF NEW.action NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  -- Check for mutual like
  SELECT * INTO mutual_like
  FROM swipes
  WHERE swiper_id = NEW.swiped_id
    AND swiped_id = NEW.swiper_id
    AND action IN ('like', 'super_like');

  IF FOUND THEN
    -- Order user IDs to satisfy constraint
    IF NEW.swiper_id < NEW.swiped_id THEN
      ordered_user1 := NEW.swiper_id;
      ordered_user2 := NEW.swiped_id;
    ELSE
      ordered_user1 := NEW.swiped_id;
      ordered_user2 := NEW.swiper_id;
    END IF;

    -- Check if match already exists
    IF NOT EXISTS (
      SELECT 1 FROM matches
      WHERE user1_id = ordered_user1 AND user2_id = ordered_user2
    ) THEN
      -- Create match
      INSERT INTO matches (user1_id, user2_id)
      VALUES (ordered_user1, ordered_user2)
      RETURNING id INTO new_match_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create matches
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

-- Trigger for updating last_message_at
DROP TRIGGER IF EXISTS trigger_update_match_message ON messages;
CREATE TRIGGER trigger_update_match_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_match_last_message();

-- Function to update profile updated_at
CREATE OR REPLACE FUNCTION update_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profile updated_at
DROP TRIGGER IF EXISTS trigger_profile_updated ON profiles;
CREATE TRIGGER trigger_profile_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profile_timestamp();

-- ============================================
-- 9. RPC FUNCTIONS FOR APP
-- ============================================

-- Get discoverable profiles for a user (excluding already swiped and blocked)
CREATE OR REPLACE FUNCTION get_discoverable_profiles(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS SETOF discoverable_profiles AS $$
BEGIN
  RETURN QUERY
  SELECT dp.*
  FROM discoverable_profiles dp
  WHERE dp.id != p_user_id
    -- Exclude already swiped profiles
    AND NOT EXISTS (
      SELECT 1 FROM swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = dp.id
    )
    -- Exclude blocked users (both directions)
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = dp.id)
         OR (b.blocker_id = dp.id AND b.blocked_id = p_user_id)
    )
  ORDER BY dp.last_active DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's matches with latest message
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

-- ============================================
-- 10. STORAGE BUCKET FOR AVATARS
-- ============================================
-- Note: This needs to be run via Supabase dashboard or API
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Storage policies would be set up in the dashboard:
-- SELECT: Anyone can view avatar images
-- INSERT: Authenticated users can upload to their own folder
-- UPDATE: Users can update their own avatars
-- DELETE: Users can delete their own avatars

COMMENT ON TABLE profiles IS 'User profiles with birth data and preferences';
COMMENT ON TABLE swipes IS 'Records of user swipe actions (like/pass/super_like)';
COMMENT ON TABLE matches IS 'Mutual matches between users';
COMMENT ON TABLE messages IS 'Chat messages between matched users';
COMMENT ON TABLE blocked_users IS 'User block list';
COMMENT ON TABLE reports IS 'User reports for moderation';
COMMENT ON VIEW discoverable_profiles IS 'Profiles available for discovery in the swipe deck';
