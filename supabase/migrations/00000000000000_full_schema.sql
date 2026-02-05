-- AstroDating — Full Database Schema
-- Single consolidated migration for a fresh Supabase project

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

  -- Full birth chart
  birth_chart JSONB,

  -- Profile info
  bio TEXT,
  gender TEXT CHECK (gender IN ('male', 'female', 'non-binary', 'other', 'prefer-not-to-say')),
  looking_for TEXT[] DEFAULT ARRAY['male', 'female', 'non-binary', 'other']::TEXT[],
  interests TEXT[],

  -- Profile images
  image_url TEXT,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Location
  current_city TEXT,
  current_latitude DECIMAL(9,6),
  current_longitude DECIMAL(9,6),

  -- Preferences
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 99,
  max_distance INTEGER DEFAULT 100,
  preferred_elements TEXT[] DEFAULT ARRAY['fire', 'earth', 'air', 'water']::TEXT[],

  -- Premium
  is_premium BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMPTZ DEFAULT NOW(),

  -- Push notifications
  push_token TEXT,
  notification_preferences JSONB DEFAULT '{
    "newMatches": true,
    "messages": true,
    "likes": true,
    "superLikes": true,
    "dailyHoroscope": false,
    "promotions": false
  }'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Age constraint
  CONSTRAINT profiles_age_check CHECK (age >= 18 OR age IS NULL)
);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_sun_sign ON profiles(sun_sign);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON profiles(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(current_latitude, current_longitude);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed ON profiles(onboarding_completed);

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
CREATE INDEX IF NOT EXISTS idx_swipes_likes ON swipes(swiped_id) WHERE action IN ('like', 'super_like');

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
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_match UNIQUE (user1_id, user2_id),
  CONSTRAINT ordered_users CHECK (user1_id < user2_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_matches_recent ON matches(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_last_message ON matches(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

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
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(match_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_match_read ON messages(match_id, is_read);

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

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);

-- ============================================
-- 7. PREMIUM USAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS premium_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feature_key, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_premium_usage_user_date ON premium_usage(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_premium_usage_feature ON premium_usage(user_id, feature_key, usage_date);

-- ============================================
-- 8. RATE LIMITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

-- ============================================
-- 9. DELETION REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deletion_requests (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. ROW LEVEL SECURITY
-- ============================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view active profiles" ON profiles FOR SELECT USING (is_active = true AND onboarding_completed = true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Swipes
ALTER TABLE swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own swipes" ON swipes FOR SELECT USING (auth.uid() = swiper_id OR auth.uid() = swiped_id);
CREATE POLICY "Users can create own swipes" ON swipes FOR INSERT WITH CHECK (auth.uid() = swiper_id);

-- Matches
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own matches" ON matches FOR SELECT USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Users can update own matches" ON matches FOR UPDATE USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view messages in their matches" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches WHERE matches.id = messages.match_id AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid()))
);
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND EXISTS (
    SELECT 1 FROM matches WHERE matches.id = messages.match_id
      AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
      AND matches.status = 'active'
  )
);
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (auth.uid() = sender_id);

-- Blocked users
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own blocks" ON blocked_users FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users can create blocks" ON blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can remove own blocks" ON blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- Reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view own reports" ON reports FOR SELECT USING (auth.uid() = reporter_id);

-- Premium usage
ALTER TABLE premium_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own usage" ON premium_usage FOR ALL USING (auth.uid() = user_id);

-- Rate limits (deny all direct access)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct access to rate_limits" ON rate_limits FOR ALL USING (false);

-- Deletion requests (deny all direct access)
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Deny all direct access" ON deletion_requests FOR ALL USING (false);

-- ============================================
-- 11. STORAGE BUCKET FOR AVATARS
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
CREATE POLICY "Public read access for avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
CREATE POLICY "Users can delete own avatars" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================
-- 12. DISCOVERABLE PROFILES VIEW
-- ============================================
CREATE OR REPLACE VIEW discoverable_profiles AS
SELECT
  id, name, age, birth_date, sun_sign, moon_sign, rising_sign, bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender, current_city, birth_chart, interests, is_verified, last_active, created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- ============================================
-- 13. TRIGGER FUNCTIONS
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

-- Update profile updated_at
CREATE OR REPLACE FUNCTION update_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profile_updated ON profiles;
CREATE TRIGGER trigger_profile_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_profile_timestamp();

-- ============================================
-- 14. RPC FUNCTIONS
-- ============================================

-- Get discoverable profiles (excludes swiped and blocked)
CREATE OR REPLACE FUNCTION get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id UUID, name TEXT, age INTEGER, sun_sign TEXT, moon_sign TEXT, rising_sign TEXT,
  bio TEXT, image_url TEXT, images TEXT[], gender TEXT, current_city TEXT,
  birth_chart JSONB, interests TEXT[], is_verified BOOLEAN, last_active TIMESTAMPTZ, created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT dp.id, dp.name, dp.age, dp.sun_sign, dp.moon_sign, dp.rising_sign, dp.bio,
         dp.image_url, dp.images, dp.gender, dp.current_city, dp.birth_chart,
         dp.interests, dp.is_verified, dp.last_active, dp.created_at
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
  match_id UUID, matched_user_id UUID, matched_user_name TEXT, matched_user_image TEXT,
  matched_user_sun_sign TEXT, compatibility_overall INTEGER, last_message TEXT,
  last_message_at TIMESTAMPTZ, matched_at TIMESTAMPTZ, unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id as match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END as matched_user_id,
    p.name as matched_user_name,
    COALESCE(p.image_url, p.photos[1]) as matched_user_image,
    p.sun_sign as matched_user_sun_sign,
    m.compatibility_overall,
    (SELECT msg.content FROM messages msg WHERE msg.match_id = m.id ORDER BY msg.created_at DESC LIMIT 1) as last_message,
    m.last_message_at,
    COALESCE(m.matched_at, m.created_at) as matched_at,
    (SELECT COUNT(*) FROM messages msg WHERE msg.match_id = m.id AND msg.sender_id != p_user_id AND msg.is_read = FALSE) as unread_count
  FROM matches m
  JOIN profiles p ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at, m.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment premium feature usage
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_matches(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_feature_usage(UUID, TEXT) TO authenticated;

-- ============================================
-- 15. RATE LIMITING FUNCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION check_rate_limit(p_user_id UUID, p_action TEXT, p_max_count INTEGER, p_window INTERVAL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM rate_limits WHERE user_id = p_user_id AND action = p_action FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, NOW(), 1)
    ON CONFLICT (user_id, action) DO UPDATE SET request_count = rate_limits.request_count + 1;
    RETURN TRUE;
  END IF;
  IF v_row.window_start + p_window < NOW() THEN
    UPDATE rate_limits SET window_start = NOW(), request_count = 1 WHERE user_id = p_user_id AND action = p_action;
    RETURN TRUE;
  END IF;
  IF v_row.request_count >= p_max_count THEN RETURN FALSE; END IF;
  UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = p_user_id AND action = p_action;
  RETURN TRUE;
END;
$$;

-- Swipes: 100/hour
CREATE OR REPLACE FUNCTION enforce_swipe_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT check_rate_limit(NEW.swiper_id, 'swipe', 100, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many swipes. Try again later.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_swipe_rate_limit ON swipes;
CREATE TRIGGER trigger_swipe_rate_limit BEFORE INSERT ON swipes FOR EACH ROW EXECUTE FUNCTION enforce_swipe_rate_limit();

-- Messages: 30/minute
CREATE OR REPLACE FUNCTION enforce_message_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT check_rate_limit(NEW.sender_id, 'message', 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages. Try again later.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_message_rate_limit ON messages;
CREATE TRIGGER trigger_message_rate_limit BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION enforce_message_rate_limit();

-- Blocks: 20/hour
CREATE OR REPLACE FUNCTION enforce_block_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT check_rate_limit(NEW.blocker_id, 'block', 20, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many block actions. Try again later.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_block_rate_limit ON blocked_users;
CREATE TRIGGER trigger_block_rate_limit BEFORE INSERT ON blocked_users FOR EACH ROW EXECUTE FUNCTION enforce_block_rate_limit();

-- Reports: 10/day
CREATE OR REPLACE FUNCTION enforce_report_rate_limit() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT check_rate_limit(NEW.reporter_id, 'report', 10, INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reports. Try again later.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_report_rate_limit ON reports;
CREATE TRIGGER trigger_report_rate_limit BEFORE INSERT ON reports FOR EACH ROW EXECUTE FUNCTION enforce_report_rate_limit();

-- Cleanup expired rate limit windows
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================
-- 16. PUSH NOTIFICATION TRIGGERS (requires pg_net)
-- ============================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net not available — push notification triggers will not work';
END;
$$;

-- Notify on new match
CREATE OR REPLACE FUNCTION notify_new_match() RETURNS TRIGGER AS $$
DECLARE
  user1_name TEXT; user2_name TEXT; edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM profiles WHERE id = NEW.user2_id;
  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;
  PERFORM net.http_post(url := edge_function_url,
    body := jsonb_build_object('userId', NEW.user1_id, 'type', 'newMatches', 'title', 'New Match!', 'body', 'You matched with ' || COALESCE(user2_name, 'someone'), 'data', jsonb_build_object('matchId', NEW.id)),
    headers := jsonb_build_object('Content-Type', 'application/json'));
  PERFORM net.http_post(url := edge_function_url,
    body := jsonb_build_object('userId', NEW.user2_id, 'type', 'newMatches', 'title', 'New Match!', 'body', 'You matched with ' || COALESCE(user1_name, 'someone'), 'data', jsonb_build_object('matchId', NEW.id)),
    headers := jsonb_build_object('Content-Type', 'application/json'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_match ON matches;
CREATE TRIGGER trigger_notify_new_match AFTER INSERT ON matches FOR EACH ROW EXECUTE FUNCTION notify_new_match();

-- Notify on new message
CREATE OR REPLACE FUNCTION notify_new_message() RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT; recipient_id UUID; match_record RECORD; edge_function_url TEXT;
BEGIN
  SELECT name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT * INTO match_record FROM matches WHERE id = NEW.match_id;
  IF match_record.user1_id = NEW.sender_id THEN recipient_id := match_record.user2_id;
  ELSE recipient_id := match_record.user1_id; END IF;
  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;
  PERFORM net.http_post(url := edge_function_url,
    body := jsonb_build_object('userId', recipient_id, 'type', 'messages', 'title', COALESCE(sender_name, 'Someone') || ' sent you a message', 'body', LEFT(NEW.content, 100), 'data', jsonb_build_object('matchId', NEW.match_id)),
    headers := jsonb_build_object('Content-Type', 'application/json'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;
CREATE TRIGGER trigger_notify_new_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_new_message();

-- ============================================
-- 17. EMAIL TRIGGERS (requires pg_net)
-- ============================================

-- Welcome email on onboarding complete
CREATE OR REPLACE FUNCTION send_welcome_email() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE edge_function_url TEXT;
BEGIN
  IF NEW.onboarding_completed = TRUE AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = FALSE) THEN
    edge_function_url := current_setting('app.settings.edge_function_url', true);
    IF edge_function_url IS NULL OR edge_function_url = '' THEN
      edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-email';
    ELSE
      edge_function_url := regexp_replace(edge_function_url, '/[^/]+$', '/send-email');
    END IF;
    PERFORM net.http_post(url := edge_function_url,
      body := jsonb_build_object('userId', NEW.id, 'template', 'welcome', 'params', jsonb_build_object()),
      headers := jsonb_build_object('Content-Type', 'application/json'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_welcome_email ON profiles;
CREATE TRIGGER trigger_send_welcome_email AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION send_welcome_email();

-- Match email
CREATE OR REPLACE FUNCTION send_match_email() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user1_name TEXT; user2_name TEXT; compat INTEGER; edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM profiles WHERE id = NEW.user2_id;
  compat := COALESCE(NEW.compatibility_overall, 0);
  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-email';
  ELSE
    edge_function_url := regexp_replace(edge_function_url, '/[^/]+$', '/send-email');
  END IF;
  PERFORM net.http_post(url := edge_function_url,
    body := jsonb_build_object('userId', NEW.user1_id, 'template', 'new_match', 'params', jsonb_build_object('matchedName', COALESCE(user2_name, 'someone'), 'compatibility', compat)),
    headers := jsonb_build_object('Content-Type', 'application/json'));
  PERFORM net.http_post(url := edge_function_url,
    body := jsonb_build_object('userId', NEW.user2_id, 'template', 'new_match', 'params', jsonb_build_object('matchedName', COALESCE(user1_name, 'someone'), 'compatibility', compat)),
    headers := jsonb_build_object('Content-Type', 'application/json'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_match_email ON matches;
CREATE TRIGGER trigger_send_match_email AFTER INSERT ON matches FOR EACH ROW EXECUTE FUNCTION send_match_email();

-- ============================================
-- 18. OPTIONAL: pg_cron cleanup
-- ============================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  PERFORM cron.schedule('cleanup-rate-limits', '0 3 * * *', $cron$SELECT cleanup_rate_limits();$cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule cleanup_rate_limits() manually';
END;
$$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE profiles IS 'User profiles with birth data and preferences';
COMMENT ON TABLE swipes IS 'Records of user swipe actions (like/pass/super_like)';
COMMENT ON TABLE matches IS 'Mutual matches between users';
COMMENT ON TABLE messages IS 'Chat messages between matched users';
COMMENT ON TABLE blocked_users IS 'User block list';
COMMENT ON TABLE reports IS 'User reports for moderation';
COMMENT ON TABLE premium_usage IS 'Tracks daily feature usage for premium trial mode';
COMMENT ON TABLE rate_limits IS 'Server-side rate limiting tracking';
COMMENT ON TABLE deletion_requests IS 'Account deletion verification codes';
COMMENT ON VIEW discoverable_profiles IS 'Profiles available for discovery in the swipe deck';
