CREATE OR REPLACE FUNCTION public.enforce_swipe_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.swiper_id, 'swipe', 100, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many swipes. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.sender_id, 'message', 30, INTERVAL '1 minute') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_block_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.blocker_id, 'block', 20, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many block actions. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_report_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.reporter_id, 'report', 10, INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reports. Try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
