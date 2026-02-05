-- Rate Limiting Migration
-- Server-side enforcement via triggers — cannot be bypassed from the client

-- ============================================
-- PART 1: RATE LIMIT TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id   UUID   NOT NULL,
  action    TEXT   NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Users should never read/write this table directly
DROP POLICY IF EXISTS "Deny all direct access to rate_limits" ON rate_limits;
CREATE POLICY "Deny all direct access to rate_limits"
  ON rate_limits FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- ============================================
-- PART 2: CORE RATE LIMIT CHECK FUNCTION
-- ============================================
-- Returns TRUE if the action is allowed, FALSE if rate-limited.
-- Automatically resets the window when it expires.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id     UUID,
  p_action      TEXT,
  p_max_count   INTEGER,
  p_window      INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM rate_limits
   WHERE user_id = p_user_id AND action = p_action
   FOR UPDATE;

  IF NOT FOUND THEN
    -- First request for this action
    INSERT INTO rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, NOW(), 1)
    ON CONFLICT (user_id, action) DO UPDATE
      SET request_count = rate_limits.request_count + 1;
    RETURN TRUE;
  END IF;

  IF v_row.window_start + p_window < NOW() THEN
    -- Window expired — reset
    UPDATE rate_limits
       SET window_start = NOW(), request_count = 1
     WHERE user_id = p_user_id AND action = p_action;
    RETURN TRUE;
  END IF;

  IF v_row.request_count >= p_max_count THEN
    -- Over the limit
    RETURN FALSE;
  END IF;

  -- Under the limit — increment
  UPDATE rate_limits
     SET request_count = request_count + 1
   WHERE user_id = p_user_id AND action = p_action;
  RETURN TRUE;
END;
$$;

-- ============================================
-- PART 3: TRIGGER — SWIPES (100 / hour)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_swipe_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT check_rate_limit(NEW.swiper_id, 'swipe', 100, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many swipes. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_swipe_rate_limit ON swipes;
CREATE TRIGGER trigger_swipe_rate_limit
  BEFORE INSERT ON swipes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_swipe_rate_limit();

-- ============================================
-- PART 4: TRIGGER — MESSAGES (30 / minute)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT check_rate_limit(NEW.sender_id, 'message', 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_message_rate_limit ON messages;
CREATE TRIGGER trigger_message_rate_limit
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION enforce_message_rate_limit();

-- ============================================
-- PART 5: TRIGGER — BLOCKS (20 / hour)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_block_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT check_rate_limit(NEW.blocker_id, 'block', 20, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many block actions. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_block_rate_limit ON blocked_users;
CREATE TRIGGER trigger_block_rate_limit
  BEFORE INSERT ON blocked_users
  FOR EACH ROW
  EXECUTE FUNCTION enforce_block_rate_limit();

-- ============================================
-- PART 6: TRIGGER — REPORTS (10 / day)
-- ============================================
CREATE OR REPLACE FUNCTION enforce_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT check_rate_limit(NEW.reporter_id, 'report', 10, INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reports. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_report_rate_limit ON reports;
CREATE TRIGGER trigger_report_rate_limit
  BEFORE INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION enforce_report_rate_limit();

-- ============================================
-- PART 7: CLEANUP — purge expired windows
-- ============================================
-- Call this periodically (e.g. via pg_cron or a scheduled edge function)
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits
   WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- If pg_cron is available, schedule daily cleanup (safe to fail if extension missing)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  PERFORM cron.schedule(
    'cleanup-rate-limits',
    '0 3 * * *',  -- 3 AM daily
    $cron$SELECT cleanup_rate_limits();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule cleanup_rate_limits() manually';
END;
$$;

SELECT 'Rate limiting migration completed!' as result;
