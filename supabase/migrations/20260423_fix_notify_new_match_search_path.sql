-- Fix notify_new_match() AND send_match_email() — both were set with
-- `search_path = ''` by 20260206_fix_security_warnings.sql but their bodies
-- still referenced unqualified `profiles`, so any INSERT into matches raised
--   ERROR: 42P01: relation "profiles" does not exist
-- breaking match creation across the whole app.
--
-- Built-in functions (jsonb_build_object, current_setting, COALESCE, LEFT,
-- regexp_replace) live in pg_catalog which Postgres always implicitly
-- searches, so they do not need qualifying. Only user-schema references do.
--
-- NOTE: a broader audit of the other 14 functions touched by 20260206 is on
-- the P3 backlog -- they likely have the same pattern but are exercised less
-- often so the bug has not surfaced yet.

CREATE OR REPLACE FUNCTION public.notify_new_match() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM public.profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM public.profiles WHERE id = NEW.user2_id;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

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
$$;

CREATE OR REPLACE FUNCTION public.send_match_email() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user1_name TEXT;
  user2_name TEXT;
  compat INTEGER;
  edge_function_url TEXT;
BEGIN
  SELECT name INTO user1_name FROM public.profiles WHERE id = NEW.user1_id;
  SELECT name INTO user2_name FROM public.profiles WHERE id = NEW.user2_id;
  compat := COALESCE(NEW.compatibility_overall, 0);

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-email';
  ELSE
    edge_function_url := regexp_replace(edge_function_url, '/[^/]+$', '/send-email');
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user1_id,
      'template', 'new_match',
      'params', jsonb_build_object(
        'matchedName', COALESCE(user2_name, 'someone'),
        'compatibility', compat
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', NEW.user2_id,
      'template', 'new_match',
      'params', jsonb_build_object(
        'matchedName', COALESCE(user1_name, 'someone'),
        'compatibility', compat
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;
