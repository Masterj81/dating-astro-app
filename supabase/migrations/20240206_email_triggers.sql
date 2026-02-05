-- Email Triggers Migration
-- Sends transactional emails via the send-email edge function

-- ============================================
-- PART 1: WELCOME EMAIL ON ONBOARDING COMPLETE
-- ============================================
CREATE OR REPLACE FUNCTION send_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_url TEXT;
BEGIN
  -- Only fire when onboarding_completed flips from false to true
  IF NEW.onboarding_completed = TRUE
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = FALSE) THEN

    edge_function_url := current_setting('app.settings.edge_function_url', true);
    IF edge_function_url IS NULL OR edge_function_url = '' THEN
      edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-email';
    ELSE
      -- Replace last path segment with send-email
      edge_function_url := regexp_replace(edge_function_url, '/[^/]+$', '/send-email');
    END IF;

    PERFORM net.http_post(
      url := edge_function_url,
      body := jsonb_build_object(
        'userId', NEW.id,
        'template', 'welcome',
        'params', jsonb_build_object()
      ),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_welcome_email ON profiles;
CREATE TRIGGER trigger_send_welcome_email
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION send_welcome_email();

-- ============================================
-- PART 2: MATCH EMAIL ON NEW MATCH
-- ============================================
CREATE OR REPLACE FUNCTION send_match_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  compat INTEGER;
  edge_function_url TEXT;
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

  -- Email user1
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user1_id,
      'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user2_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  -- Email user2
  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id,
      'template', 'new_match',
      'params', jsonb_build_object('matchedName', COALESCE(user1_name, 'someone'), 'compatibility', compat)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_send_match_email ON matches;
CREATE TRIGGER trigger_send_match_email
  AFTER INSERT ON matches
  FOR EACH ROW
  EXECUTE FUNCTION send_match_email();

SELECT 'Email triggers migration completed!' as result;
