-- Core Tables Migration v4 - Cleans orphaned data first
-- Run this in your Supabase SQL Editor

-- ============================================
-- PART 0: CLEAN UP ORPHANED DATA
-- ============================================
-- Delete swipes that reference non-existent profiles
DELETE FROM swipes WHERE swiper_id NOT IN (SELECT id FROM profiles);
DELETE FROM swipes WHERE swiped_id NOT IN (SELECT id FROM profiles);

-- Delete matches that reference non-existent profiles
DELETE FROM matches WHERE user1_id NOT IN (SELECT id FROM profiles);
DELETE FROM matches WHERE user2_id NOT IN (SELECT id FROM profiles);

-- Delete messages that reference non-existent matches or profiles
DELETE FROM messages WHERE match_id NOT IN (SELECT id FROM matches);
DELETE FROM messages WHERE sender_id NOT IN (SELECT id FROM profiles);

-- Delete blocked_users that reference non-existent profiles
DELETE FROM blocked_users WHERE blocker_id NOT IN (SELECT id FROM profiles);
DELETE FROM blocked_users WHERE blocked_id NOT IN (SELECT id FROM profiles);

-- ============================================
-- PART 1: ADD COLUMNS TO PROFILES
-- ============================================
DO $$
BEGIN
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'sun_sign') THEN
    ALTER TABLE profiles ADD COLUMN sun_sign TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'moon_sign') THEN
    ALTER TABLE profiles ADD COLUMN moon_sign TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'rising_sign') THEN
    ALTER TABLE profiles ADD COLUMN rising_sign TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'birth_chart') THEN
    ALTER TABLE profiles ADD COLUMN birth_chart JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
    ALTER TABLE profiles ADD COLUMN bio TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'gender') THEN
    ALTER TABLE profiles ADD COLUMN gender TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'looking_for') THEN
    ALTER TABLE profiles ADD COLUMN looking_for TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'interests') THEN
    ALTER TABLE profiles ADD COLUMN interests TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'image_url') THEN
    ALTER TABLE profiles ADD COLUMN image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'images') THEN
    ALTER TABLE profiles ADD COLUMN images TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_city') THEN
    ALTER TABLE profiles ADD COLUMN current_city TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_latitude') THEN
    ALTER TABLE profiles ADD COLUMN current_latitude DECIMAL(9,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_longitude') THEN
    ALTER TABLE profiles ADD COLUMN current_longitude DECIMAL(9,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'min_age') THEN
    ALTER TABLE profiles ADD COLUMN min_age INTEGER DEFAULT 18;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'max_age') THEN
    ALTER TABLE profiles ADD COLUMN max_age INTEGER DEFAULT 99;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'max_distance') THEN
    ALTER TABLE profiles ADD COLUMN max_distance INTEGER DEFAULT 100;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_premium') THEN
    ALTER TABLE profiles ADD COLUMN is_premium BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'premium_until') THEN
    ALTER TABLE profiles ADD COLUMN premium_until TIMESTAMPTZ;
  END IF;
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'created_at') THEN
    ALTER TABLE profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view active profiles" ON profiles;
CREATE POLICY "Users can view profiles" ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- PART 2: SWIPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL,
  swiped_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clean orphaned swipes again after table creation
DELETE FROM swipes WHERE swiper_id NOT IN (SELECT id FROM profiles);
DELETE FROM swipes WHERE swiped_id NOT IN (SELECT id FROM profiles);

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'swipes_swiper_id_fkey' AND table_name = 'swipes') THEN
    ALTER TABLE swipes ADD CONSTRAINT swipes_swiper_id_fkey FOREIGN KEY (swiper_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'swipes_swiped_id_fkey' AND table_name = 'swipes') THEN
    ALTER TABLE swipes ADD CONSTRAINT swipes_swiped_id_fkey FOREIGN KEY (swiped_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'swipes_swiper_id_swiped_id_key' AND table_name = 'swipes') THEN
    ALTER TABLE swipes ADD CONSTRAINT swipes_swiper_id_swiped_id_key UNIQUE (swiper_id, swiped_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own swipes" ON swipes;
DROP POLICY IF EXISTS "Users can create own swipes" ON swipes;
CREATE POLICY "Users can view own swipes" ON swipes FOR SELECT USING (auth.uid() = swiper_id OR auth.uid() = swiped_id);
CREATE POLICY "Users can create own swipes" ON swipes FOR INSERT WITH CHECK (auth.uid() = swiper_id);

-- ============================================
-- PART 3: MATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  status TEXT DEFAULT 'active'
);

-- Add columns to matches
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_overall') THEN
    ALTER TABLE matches ADD COLUMN compatibility_overall INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_emotional') THEN
    ALTER TABLE matches ADD COLUMN compatibility_emotional INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_communication') THEN
    ALTER TABLE matches ADD COLUMN compatibility_communication INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_passion') THEN
    ALTER TABLE matches ADD COLUMN compatibility_passion INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_long_term') THEN
    ALTER TABLE matches ADD COLUMN compatibility_long_term INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_values') THEN
    ALTER TABLE matches ADD COLUMN compatibility_values INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'compatibility_growth') THEN
    ALTER TABLE matches ADD COLUMN compatibility_growth INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'matched_at') THEN
    ALTER TABLE matches ADD COLUMN matched_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'last_message_at') THEN
    ALTER TABLE matches ADD COLUMN last_message_at TIMESTAMPTZ;
  END IF;
END $$;

-- Clean orphaned matches
DELETE FROM matches WHERE user1_id NOT IN (SELECT id FROM profiles);
DELETE FROM matches WHERE user2_id NOT IN (SELECT id FROM profiles);

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matches_user1_id_fkey' AND table_name = 'matches') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_user1_id_fkey FOREIGN KEY (user1_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'matches_user2_id_fkey' AND table_name = 'matches') THEN
    ALTER TABLE matches ADD CONSTRAINT matches_user2_id_fkey FOREIGN KEY (user2_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own matches" ON matches;
DROP POLICY IF EXISTS "Users can update own matches" ON matches;
CREATE POLICY "Users can view own matches" ON matches FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can update own matches" ON matches FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ============================================
-- PART 4: MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clean orphaned messages
DELETE FROM messages WHERE match_id NOT IN (SELECT id FROM matches);
DELETE FROM messages WHERE sender_id NOT IN (SELECT id FROM profiles);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_match_id_fkey' AND table_name = 'messages') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_sender_id_fkey' AND table_name = 'messages') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view messages in their matches" ON messages;
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can view messages in their matches" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches WHERE matches.id = messages.match_id AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid()))
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (SELECT 1 FROM matches WHERE matches.id = messages.match_id AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid()))
);

-- ============================================
-- PART 5: BLOCKED USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL,
  blocked_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clean orphaned blocked_users
DELETE FROM blocked_users WHERE blocker_id NOT IN (SELECT id FROM profiles);
DELETE FROM blocked_users WHERE blocked_id NOT IN (SELECT id FROM profiles);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'blocked_users_blocker_id_fkey' AND table_name = 'blocked_users') THEN
    ALTER TABLE blocked_users ADD CONSTRAINT blocked_users_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'blocked_users_blocked_id_fkey' AND table_name = 'blocked_users') THEN
    ALTER TABLE blocked_users ADD CONSTRAINT blocked_users_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'blocked_users_blocker_id_blocked_id_key' AND table_name = 'blocked_users') THEN
    ALTER TABLE blocked_users ADD CONSTRAINT blocked_users_blocker_id_blocked_id_key UNIQUE (blocker_id, blocked_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can create blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can remove own blocks" ON blocked_users;
CREATE POLICY "Users can view own blocks" ON blocked_users FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users can create blocks" ON blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can remove own blocks" ON blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================
-- PART 6: VIEW
-- ============================================
DROP VIEW IF EXISTS discoverable_profiles;
CREATE VIEW discoverable_profiles AS
SELECT id, name, age, sun_sign, moon_sign, rising_sign, bio, image_url, images, gender, current_city, birth_chart, interests, is_verified, last_active, created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- ============================================
-- PART 7: FUNCTIONS
-- ============================================

-- Auto-match trigger
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

-- Update last_message_at
CREATE OR REPLACE FUNCTION update_match_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE matches SET last_message_at = NEW.created_at WHERE id = NEW.match_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_match_message ON messages;
CREATE TRIGGER trigger_update_match_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_match_last_message();

-- Get discoverable profiles RPC
CREATE OR REPLACE FUNCTION get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (id UUID, name TEXT, age INTEGER, sun_sign TEXT, moon_sign TEXT, rising_sign TEXT, bio TEXT, image_url TEXT, images TEXT[], gender TEXT, current_city TEXT, birth_chart JSONB, interests TEXT[], is_verified BOOLEAN, last_active TIMESTAMPTZ, created_at TIMESTAMPTZ)
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

-- Get user matches RPC
CREATE OR REPLACE FUNCTION get_user_matches(p_user_id UUID)
RETURNS TABLE (match_id UUID, matched_user_id UUID, matched_user_name TEXT, matched_user_image TEXT, matched_user_sun_sign TEXT, compatibility_overall INTEGER, last_message TEXT, last_message_at TIMESTAMPTZ, matched_at TIMESTAMPTZ, unread_count BIGINT)
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END, p.name, p.image_url, p.sun_sign, m.compatibility_overall,
    (SELECT msg.content FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1),
    m.last_message_at, m.matched_at,
    (SELECT COUNT(*) FROM messages msg WHERE msg.match_id = m.id AND msg.sender_id != p_user_id AND msg.is_read = FALSE)
  FROM matches m
  JOIN profiles p ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id) AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_matches(UUID) TO authenticated;

SELECT 'Migration completed successfully!' as result;
