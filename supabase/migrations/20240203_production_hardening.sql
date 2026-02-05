-- Production Hardening Migration
-- Adds push notification columns, tightens RLS, adds indexes, and notification triggers

-- ============================================
-- PART 1: SCHEMA CHANGES
-- ============================================

-- Add push notification columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "newMatches": true,
  "messages": true,
  "likes": true,
  "superLikes": true,
  "dailyHoroscope": false,
  "promotions": false
}'::jsonb;

-- Add age constraint (must be 18+ or NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_age_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_age_check CHECK (age >= 18 OR age IS NULL);
  END IF;
END $$;

-- ============================================
-- PART 2: INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed ON profiles(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_messages_match_read ON messages(match_id, is_read);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON swipes(swiped_id);

-- ============================================
-- PART 3: TIGHTEN RLS POLICIES
-- ============================================

-- Tighten profiles SELECT: own profile always visible, others only when active + onboarded
DROP POLICY IF EXISTS "Users can view profiles" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view active profiles" ON profiles
  FOR SELECT USING (is_active = true AND onboarding_completed = true);

-- Tighten messages INSERT: only allow sending to active matches
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = messages.match_id
        AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
        AND matches.status = 'active'
    )
  );

-- ============================================
-- PART 4: PUSH NOTIFICATION TRIGGERS
-- ============================================

-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: notify on new match
CREATE OR REPLACE FUNCTION notify_new_match()
RETURNS TRIGGER AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM profiles WHERE id = NEW.user2_id;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

  -- Notify user1
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user1_id,
      'type', 'newMatches',
      'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user2_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  -- Notify user2
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id,
      'type', 'newMatches',
      'title', 'New Match!',
      'body', 'You matched with ' || COALESCE(user1_name, 'someone'),
      'data', jsonb_build_object('matchId', NEW.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_match ON matches;
CREATE TRIGGER trigger_notify_new_match
  AFTER INSERT ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match();

-- Trigger function: notify on new message
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  recipient_id UUID;
  match_record RECORD;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT * INTO match_record FROM matches WHERE id = NEW.match_id;

  -- Determine recipient (the other user in the match)
  IF match_record.user1_id = NEW.sender_id THEN
    recipient_id := match_record.user2_id;
  ELSE
    recipient_id := match_record.user1_id;
  END IF;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', recipient_id,
      'type', 'messages',
      'title', COALESCE(sender_name, 'Someone') || ' sent you a message',
      'body', LEFT(NEW.content, 100),
      'data', jsonb_build_object('matchId', NEW.match_id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_message ON messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();

SELECT 'Production hardening migration completed!' as result;
