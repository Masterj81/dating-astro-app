CREATE OR REPLACE FUNCTION public.enforce_adult_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  calculated_age INTEGER;
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    calculated_age := DATE_PART('year', AGE(CURRENT_DATE, NEW.birth_date::date));
    IF calculated_age < 18 THEN
      RAISE EXCEPTION 'Users must be at least 18 years old.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.age IS NOT NULL AND NEW.age < 18 THEN
    RAISE EXCEPTION 'Users must be at least 18 years old.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_adult_profile ON public.profiles;

CREATE TRIGGER trigger_enforce_adult_profile
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_adult_profile();
