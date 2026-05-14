CREATE OR REPLACE FUNCTION public.check_and_create_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ordered_user1 UUID;
  ordered_user2 UUID;
BEGIN
  IF NEW.action NOT IN ('like', 'super_like') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.swipes
    WHERE swiper_id = NEW.swiped_id
      AND swiped_id = NEW.swiper_id
      AND action IN ('like', 'super_like')
  ) THEN
    IF NEW.swiper_id < NEW.swiped_id THEN
      ordered_user1 := NEW.swiper_id;
      ordered_user2 := NEW.swiped_id;
    ELSE
      ordered_user1 := NEW.swiped_id;
      ordered_user2 := NEW.swiper_id;
    END IF;

    INSERT INTO public.matches (user1_id, user2_id)
    VALUES (ordered_user1, ordered_user2)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INTEGER,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.rate_limits%ROWTYPE;
BEGIN
  SELECT *
  INTO v_row
  FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, NOW(), 1)
    ON CONFLICT (user_id, action)
    DO UPDATE SET request_count = public.rate_limits.request_count + 1;
    RETURN TRUE;
  END IF;

  IF v_row.window_start + p_window < NOW() THEN
    UPDATE public.rate_limits
    SET window_start = NOW(), request_count = 1
    WHERE user_id = p_user_id
      AND action = p_action;
    RETURN TRUE;
  END IF;

  IF v_row.request_count >= p_max_count THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET request_count = request_count + 1
  WHERE user_id = p_user_id
    AND action = p_action;

  RETURN TRUE;
END;
$$;

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
