-- Move suspect ascendants aside instead of deleting them.
--
-- WHAT IS SUSPECT
-- ---------------
-- 20260830000001 guarantees `birth_time IS NULL ⟹ rising_sign IS NULL`. That
-- covers the fabricated Aries, and nothing else. The ascendant also depends on
-- the PLACE: in `computeAscendant`, birth longitude enters local sidereal time
-- degree for degree, so an unknown birthplace displaces the ascendant by as
-- much as the location is wrong. Montréal against Paris is 76° — more than two
-- and a half signs.
--
-- Until 2026-08-31 four code paths substituted a location rather than
-- admitting they had none: Greenwich (51.5074, 0) in `calculate-chart` and
-- `get-profile-chart`, Montréal (45.5017, -73.5673) as the mobile facade's
-- default parameters and as `geocoding.ts`'s last-resort city. Rows written by
-- those paths carry a `rising_sign` that is plausible, varied, and cast for a
-- city the reader has never been to.
--
-- WHY MOVE AND NOT DELETE
-- -----------------------
-- The product decision is explicit: a placement someone has seen for months is
-- not erased silently. But it must also stop being displayed, and "stop being
-- displayed" has a hard constraint — `get_discoverable_profiles` returns
-- neither `birth_time`, nor `birth_chart`, nor the coordinates. Discover, the
-- public profile and the chat header can see ONLY `rising_sign`. No flag they
-- cannot read would ever hide anything from them.
--
-- So the value moves out of the column every surface reads, into one no
-- surface reads:
--
--     rising_sign  ──►  rising_sign_unconfirmed
--
-- Consequences, all of them wanted:
--   * every existing surface hides it with no code change, including the three
--     that are structurally blind;
--   * `rising_sign IS NOT NULL ⟹ birth time AND birthplace` becomes true, which
--     is what makes the bare-sign relaxation in rising.ts sound again;
--   * nothing is destroyed — the row can be restored, audited, or recomputed;
--   * the surfaces that CAN see `birth_time` and the coordinates derive the
--     "needs confirmation" state themselves and show the CTA.
--
-- The same move is applied inside `birth_chart`: `rising` → `rising_unconfirmed`.
-- Leaving it would keep feeding `hydrateStoredChart`, and therefore the
-- synastry "first impressions" factor and the equal-house cusps, with an
-- ascendant computed in the Gulf of Guinea.

begin;

-- =============================================================================
-- 1) Somewhere to put it
-- =============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rising_sign_unconfirmed TEXT;

COMMENT ON COLUMN public.profiles.rising_sign_unconfirmed IS
  'An ascendant that was computed without a reliable birthplace, preserved rather than deleted. NEVER displayed: it is here so the value is recoverable and auditable, and so `rising_sign IS NOT NULL` can mean "birth time AND birthplace were both known". Cleared when the reader confirms their birth city and the chart is recomputed.';

-- =============================================================================
-- 2) The rule, enforced on every write
-- =============================================================================
-- Extends the 20260830000001 function rather than adding a second trigger, so
-- there is exactly one place that decides whether an ascendant may be stored.
-- The birth-time branch is reproduced verbatim; only the place branch is new.
CREATE OR REPLACE FUNCTION public.enforce_rising_requires_birth_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_has_place BOOLEAN;
BEGIN
  IF NEW.birth_time IS NULL THEN
    -- The column.
    NEW.rising_sign := NULL;

    -- And the same claim frozen inside the chart JSONB, which is what the
    -- synastry surfaces read. Leaving it would keep feeding a "first
    -- impressions" score computed from a placement nobody has.
    IF NEW.birth_chart IS NOT NULL
       AND jsonb_typeof(NEW.birth_chart) = 'object'
       AND NEW.birth_chart ? 'rising'
       AND NEW.birth_chart -> 'rising' <> 'null'::jsonb
    THEN
      NEW.birth_chart := jsonb_set(NEW.birth_chart, '{rising}', 'null'::jsonb);
    END IF;

    RETURN NEW;
  END IF;

  -- Birth time is known. The ascendant is computable only if the PLACE is too.
  --
  -- Note this is a NULL test, not a truthiness test: 0 is a real coordinate
  -- (the prime meridian, the equator) and `calculate-chart` used to treat it
  -- as missing, replacing correct data with invented data.
  v_has_place := NEW.birth_latitude IS NOT NULL AND NEW.birth_longitude IS NOT NULL;

  IF NOT v_has_place THEN
    -- MOVE, never delete. COALESCE keeps the first value ever set aside: a
    -- later write must not overwrite the original with something newer and
    -- equally unreliable.
    IF NEW.rising_sign IS NOT NULL THEN
      NEW.rising_sign_unconfirmed := COALESCE(NEW.rising_sign_unconfirmed, NEW.rising_sign);
      NEW.rising_sign := NULL;
    END IF;

    IF NEW.birth_chart IS NOT NULL
       AND jsonb_typeof(NEW.birth_chart) = 'object'
       AND NEW.birth_chart ? 'rising'
       AND NEW.birth_chart -> 'rising' <> 'null'::jsonb
    THEN
      IF NOT (NEW.birth_chart ? 'rising_unconfirmed')
         OR NEW.birth_chart -> 'rising_unconfirmed' = 'null'::jsonb
      THEN
        NEW.birth_chart := jsonb_set(
          NEW.birth_chart, '{rising_unconfirmed}', NEW.birth_chart -> 'rising'
        );
      END IF;
      NEW.birth_chart := jsonb_set(NEW.birth_chart, '{rising}', 'null'::jsonb);
    END IF;
  ELSE
    -- The place is known. A confirmed ascendant supersedes the set-aside one,
    -- so the CTA stops showing once the chart has genuinely been recomputed.
    IF NEW.rising_sign IS NOT NULL THEN
      NEW.rising_sign_unconfirmed := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_rising_requires_birth_time() IS
  'An ascendant may be stored in profiles.rising_sign only when the birth time AND the birth coordinates are both present. Without a time it is deleted (it was fabricated). Without a place it is MOVED to rising_sign_unconfirmed, and birth_chart.rising to birth_chart.rising_unconfirmed — hidden from every surface, including the ones that can only read the column, but never destroyed.';

-- The trigger is unchanged; recreate it so this migration is self-sufficient.
DROP TRIGGER IF EXISTS trigger_enforce_rising_requires_birth_time ON public.profiles;

CREATE TRIGGER trigger_enforce_rising_requires_birth_time
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_rising_requires_birth_time();

-- =============================================================================
-- 3) The existing rows
-- =============================================================================
-- Done as an explicit UPDATE rather than by touching every row and letting the
-- trigger fire: `profiles` carries AFTER UPDATE triggers, and a blanket
-- no-op update would be a large, opaque write. This changes only the rows that
-- are actually suspect, and reports how many.
DO $repair$
DECLARE
  v_moved INT;
  v_chart INT;
BEGIN
  UPDATE public.profiles
     SET rising_sign_unconfirmed = COALESCE(rising_sign_unconfirmed, rising_sign),
         rising_sign             = NULL
   WHERE birth_time  IS NOT NULL
     AND rising_sign IS NOT NULL
     AND (birth_latitude IS NULL OR birth_longitude IS NULL);
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE public.profiles
     SET birth_chart = jsonb_set(
           jsonb_set(birth_chart, '{rising_unconfirmed}', birth_chart -> 'rising'),
           '{rising}', 'null'::jsonb
         )
   WHERE birth_time IS NOT NULL
     AND (birth_latitude IS NULL OR birth_longitude IS NULL)
     AND birth_chart IS NOT NULL
     AND jsonb_typeof(birth_chart) = 'object'
     AND birth_chart ? 'rising'
     AND birth_chart -> 'rising' <> 'null'::jsonb;
  GET DIAGNOSTICS v_chart = ROW_COUNT;

  RAISE NOTICE 'Set aside % column ascendant(s) and % chart ascendant(s).', v_moved, v_chart;
END
$repair$;

-- =============================================================================
-- 4) Postconditions
-- =============================================================================
DO $verify$
DECLARE
  v_violations INT;
  v_state      TEXT;
BEGIN
  -- The invariant this migration buys: a stored ascendant now proves BOTH the
  -- clock and the place. rising.ts depends on it.
  SELECT COUNT(*) INTO v_violations
    FROM public.profiles
   WHERE rising_sign IS NOT NULL
     AND (birth_time IS NULL OR birth_latitude IS NULL OR birth_longitude IS NULL);

  IF v_violations > 0 THEN
    RAISE EXCEPTION 'Still % profile(s) whose rising_sign is not backed by a birth time AND a birthplace.', v_violations;
  END IF;

  SELECT t.tgenabled::TEXT INTO v_state
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public' AND c.relname = 'profiles'
     AND t.tgname  = 'trigger_enforce_rising_requires_birth_time';

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'trigger_enforce_rising_requires_birth_time is missing.';
  END IF;

  -- O = enabled, A = always. D and R do not fire in a normal session, which
  -- would leave the invariant unenforced while looking enforced.
  IF v_state NOT IN ('O','A') THEN
    RAISE EXCEPTION 'Trigger exists but tgenabled = % (does not fire).', v_state;
  END IF;

  RAISE NOTICE 'OK. rising_sign now implies birth time AND birthplace; nothing was deleted.';
END
$verify$;

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- The Studio SQL editor does not render NOTICEs, so restate the result as rows.
-- Expect: violations = 0, trigger_actif = true.
-- `mis_de_cote` is the number of readers who will now see the "confirm your
-- birth city" CTA instead of an ascendant computed in London or Montréal.
SELECT
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign IS NOT NULL
      AND (birth_time IS NULL
        OR birth_latitude IS NULL
        OR birth_longitude IS NULL))                                AS violations,
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign_unconfirmed IS NOT NULL)                      AS mis_de_cote,
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign IS NOT NULL)                                  AS ascendants_fiables,
  (SELECT COUNT(*) = 1 FROM pg_trigger t
     JOIN pg_class c     ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public' AND c.relname = 'profiles'
      AND t.tgname  = 'trigger_enforce_rising_requires_birth_time'
      AND t.tgenabled IN ('O','A'))                                 AS trigger_actif;
