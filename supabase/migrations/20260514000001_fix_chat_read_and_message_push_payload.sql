-- Fix conversation read receipts and conversation-first message push payloads.
--
-- Direct client UPDATEs against public.messages can only update rows allowed by
-- RLS. Historical policy only allows users to update their own messages, so a
-- reader cannot mark the sender's incoming rows as read. Keep messages locked
-- down and expose a narrow SECURITY DEFINER RPC instead.
--
-- This migration also fixes the message push `type`. Every prior definition of
-- notify_new_message emitted `type: 'messages'` (plural), but the mobile client
-- is standardized on the singular `'message'` — the NotificationType union,
-- getChannelForType(), and _layout.tsx's VALID_TYPES routing guard all expect
-- `'message'`. The send-notification edge function maps both spellings, but it
-- passes `type` through verbatim to the device payload, so the client received
-- a value it does not recognize: notification taps failed the VALID_TYPES guard
-- and never deep-linked to the chat. We now emit the canonical `'message'`.

CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  marked_count INTEGER := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'Conversation id is required.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.user_a = caller OR c.user_b = caller)
  ) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.messages m
  SET
    is_read = TRUE,
    read_at = COALESCE(m.read_at, NOW())
  WHERE m.conversation_id = p_conversation_id
    AND m.sender_id <> caller
    AND m.is_read = FALSE;

  GET DIAGNOSTICS marked_count = ROW_COUNT;
  RETURN marked_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID) TO authenticated;

COMMENT ON FUNCTION public.mark_conversation_messages_read(UUID) IS
  'Marks incoming messages in a conversation as read for the authenticated participant. SECURITY DEFINER keeps messages UPDATE locked down while limiting writes to is_read/read_at on rows sent by the other participant.';

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sender_name TEXT;
  recipient_id UUID;
  conversation_record public.conversations%ROWTYPE;
  match_record public.matches%ROWTYPE;
  edge_function_url TEXT;
  notification_data JSONB;
BEGIN
  SELECT name
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  IF NEW.conversation_id IS NOT NULL THEN
    SELECT *
    INTO conversation_record
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    IF conversation_record.id IS NULL THEN
      RETURN NEW;
    END IF;

    IF conversation_record.user_a = NEW.sender_id THEN
      recipient_id := conversation_record.user_b;
    ELSIF conversation_record.user_b = NEW.sender_id THEN
      recipient_id := conversation_record.user_a;
    ELSE
      RETURN NEW;
    END IF;

    notification_data := jsonb_build_object(
      'chatId', NEW.conversation_id,
      'conversationId', NEW.conversation_id,
      'conversation_id', NEW.conversation_id
    );
  ELSIF NEW.match_id IS NOT NULL THEN
    -- Defensive legacy fallback for old rows/inserts while match_id exists.
    SELECT *
    INTO match_record
    FROM public.matches
    WHERE id = NEW.match_id;

    IF match_record.id IS NULL THEN
      RETURN NEW;
    END IF;

    IF match_record.user1_id = NEW.sender_id THEN
      recipient_id := match_record.user2_id;
    ELSIF match_record.user2_id = NEW.sender_id THEN
      recipient_id := match_record.user1_id;
    ELSE
      RETURN NEW;
    END IF;

    notification_data := jsonb_build_object('matchId', NEW.match_id);
  ELSE
    RETURN NEW;
  END IF;

  edge_function_url := current_setting('app.settings.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    edge_function_url := 'http://host.docker.internal:54321/functions/v1/send-notification';
  END IF;

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'userId', recipient_id,
      -- Canonical client-facing type. The edge function maps 'message' to the
      -- 'messages' notification preference key and Android channel.
      'type', 'message',
      'title', COALESCE(sender_name, 'Someone') || ' sent you a message',
      'body', LEFT(NEW.content, 100),
      'data', notification_data
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$$;
