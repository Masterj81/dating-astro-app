-- Scheduled emails table for drip campaigns (onboarding, trial reminders, etc.)

CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending
  ON public.scheduled_emails (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user
  ON public.scheduled_emails (user_id);

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all direct access to scheduled emails"
  ON public.scheduled_emails FOR ALL
  USING (false);

CREATE POLICY "Service role can manage scheduled emails"
  ON public.scheduled_emails FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger function: schedule onboarding emails when user completes onboarding
CREATE OR REPLACE FUNCTION public.schedule_onboarding_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only fire when onboarding_completed transitions to TRUE
  IF NEW.onboarding_completed = TRUE
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = FALSE)
  THEN
    -- J+1: Natal chart email (24 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day1',
      jsonb_build_object('sunSign', COALESCE(NEW.sun_sign, '')),
      NOW() + INTERVAL '24 hours'
    );

    -- J+3: Compatibility email (72 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day3',
      '{}'::jsonb,
      NOW() + INTERVAL '72 hours'
    );

    -- J+5: Trial ending email (120 hours after onboarding)
    INSERT INTO public.scheduled_emails (user_id, template, params, scheduled_for)
    VALUES (
      NEW.id,
      'onboarding_day5',
      '{}'::jsonb,
      NOW() + INTERVAL '120 hours'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_schedule_onboarding_emails ON public.profiles;

CREATE TRIGGER trigger_schedule_onboarding_emails
AFTER UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.schedule_onboarding_emails();
