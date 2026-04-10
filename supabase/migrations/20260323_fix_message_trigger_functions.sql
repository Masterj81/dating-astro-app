CREATE OR REPLACE FUNCTION public.update_match_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.matches
  SET last_message_at = NEW.created_at
  WHERE id = NEW.match_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sender_name TEXT;
  recipient_id UUID;
  match_record public.matches%ROWTYPE;
  edge_function_url TEXT;
BEGIN
  SELECT name
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  SELECT *
  INTO match_record
  FROM public.matches
  WHERE id = NEW.match_id;

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
$$;
