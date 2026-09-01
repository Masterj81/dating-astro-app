-- Null the birthplaces that were never given.
--
-- WHAT 20260901000002 MISSED
-- -------------------------
-- That migration set aside every ascendant stored against NULL coordinates.
-- It found zero, and reported 93 reliable ascendants. Both numbers were true
-- and the conclusion drawn from them was wrong.
--
-- The mobile onboarding never stored NULL coordinates. It called
--
--     geocodeCity(birthCity || 'Montreal')
--
-- and `geocodeCity` never returned null either: its last line was
-- `return buildResult(45.5017, -73.5673, city)`. So a reader whose birth city
-- was blank, or whose city the geocoder could not resolve, was stored at
-- Montréal's exact coordinates — as a fact, indistinguishable from someone
-- actually born there.
--
-- A census on 2026-09-01 found **69 profiles at exactly 45.5017 / -73.5673**:
--   * 67 had typed a birth city that is not Montréal;
--   *  1 had typed no city at all;
--   * 58 of them carry a rising_sign.
--
-- Those 58 were counted among the "93 reliable ascendants". They are not
-- reliable: they were cast for a city those readers have never named. Birth
-- longitude enters local sidereal time degree for degree, so an ascendant
-- computed 76° from where someone was born is off by more than two signs.
--
-- WHY NULL THE COORDINATES AND NOT JUST THE ASCENDANT
-- ---------------------------------------------------
-- `birth_latitude` and `birth_longitude` are columns that mean "where this
-- person was born". Leaving Montréal in them for someone born in Sofia is the
-- same class of statement as the ascendant itself — a plausible value standing
-- in for an absent one — and every future recompute would read it back and
-- reproduce the same wrong chart. The honest value is NULL: we do not know.
--
-- `birth_city` is deliberately KEPT. It is what the reader actually typed, it
-- is not fabricated, and it is what the "confirm your birth city" flow needs
-- to pre-fill so they are not asked to type it again from scratch.
--
-- HOW THE ASCENDANT IS PRESERVED
-- ------------------------------
-- It is not handled here at all. Nulling the coordinates makes the BEFORE
-- trigger from 20260901000002 fire on each of these rows, and that trigger
-- already knows what to do: move `rising_sign` to `rising_sign_unconfirmed`
-- and `birth_chart.rising` to `birth_chart.rising_unconfirmed`. One rule, one
-- place — and this migration doubles as proof that it works.
--
-- WHO IS EXCLUDED
-- ---------------
-- People genuinely born in Montréal. `CITY_CACHE['montreal']` holds exactly
-- these coordinates, so anyone who typed "Montreal" or "Montréal" got them
-- legitimately. The filter keeps every birth_city matching 'montr', accents
-- included, and touches nobody else's real data.

begin;

-- =============================================================================
-- 0) Pre-flight: prove this UPDATE cannot send mail
-- =============================================================================
-- 69 rows are about to be updated. `profiles` carries AFTER UPDATE triggers,
-- and one of them enqueues the onboarding email sequence. It is guarded on the
-- onboarding_completed FALSE→TRUE transition, which this UPDATE does not touch
-- — but that is the current state, not a guarantee. Assert it, because being
-- wrong means mailing 69 people a "welcome" they already had months ago.
DO $preflight$
DECLARE
  v_mailers INT;
  v_targets INT;
BEGIN
  SELECT COUNT(*) INTO v_mailers
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p      ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND n.nspname = 'public'
     AND c.relname = 'profiles'
     AND (t.tgtype & 16) <> 0                    -- bit 4 of tgtype: fires on UPDATE
     AND p.prosrc ILIKE '%scheduled_emails%'
     AND p.prosrc NOT ILIKE '%OLD.onboarding_completed%';

  SELECT COUNT(*) INTO v_targets
    FROM public.profiles
   WHERE ROUND(birth_latitude::numeric, 4)  = 45.5017
     AND ROUND(birth_longitude::numeric, 4) = -73.5673
     AND (birth_city IS NULL OR lower(birth_city) NOT LIKE '%montr%');

  IF v_mailers > 0 THEN
    RAISE EXCEPTION
      'Aborted: % UPDATE trigger(s) on public.profiles touch scheduled_emails without guarding on the onboarding transition. This UPDATE would mail % people.',
      v_mailers, v_targets;
  END IF;

  RAISE NOTICE 'Pre-flight OK. % profile(s) hold a substituted Montréal birthplace.', v_targets;
END
$preflight$;

-- =============================================================================
-- 1) Forget the birthplace we invented
-- =============================================================================
-- The ascendant is NOT touched here. The BEFORE trigger from 20260901000002
-- sees the coordinates go NULL and moves it to rising_sign_unconfirmed itself.
DO $repair$
DECLARE
  v_rows INT;
BEGIN
  UPDATE public.profiles
     SET birth_latitude  = NULL,
         birth_longitude = NULL,
         -- The chart's own echo of the coordinates. `hydrateStoredChart` reads
         -- this back into `NatalChart.input`, and a recompute from that would
         -- rebuild the same Montréal chart. `StoredBirthChart.coordinates` is
         -- nullable as of the 2026-08-31 engine change, so null is a shape
         -- every reader already tolerates.
         birth_chart = CASE
           WHEN birth_chart IS NOT NULL
            AND jsonb_typeof(birth_chart) = 'object'
            AND birth_chart ? 'coordinates'
           THEN jsonb_set(
                  birth_chart,
                  '{coordinates}',
                  jsonb_build_object('latitude', NULL, 'longitude', NULL)
                )
           ELSE birth_chart
         END
   WHERE ROUND(birth_latitude::numeric, 4)  = 45.5017
     AND ROUND(birth_longitude::numeric, 4) = -73.5673
     -- Genuine Montrealers keep their real birthplace. 'montr' matches both
     -- "Montreal" and "Montréal"; lower() handles the casing.
     AND (birth_city IS NULL OR lower(birth_city) NOT LIKE '%montr%');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Cleared a substituted birthplace on % profile(s).', v_rows;
END
$repair$;

-- =============================================================================
-- 2) Postconditions
-- =============================================================================
DO $verify$
DECLARE
  v_left       INT;
  v_violations INT;
BEGIN
  SELECT COUNT(*) INTO v_left
    FROM public.profiles
   WHERE ROUND(birth_latitude::numeric, 4)  = 45.5017
     AND ROUND(birth_longitude::numeric, 4) = -73.5673
     AND (birth_city IS NULL OR lower(birth_city) NOT LIKE '%montr%');

  IF v_left > 0 THEN
    RAISE EXCEPTION 'Still % profile(s) holding a substituted Montréal birthplace.', v_left;
  END IF;

  -- The invariant 20260901000002 bought must still hold: the BEFORE trigger
  -- should have moved every now-unbacked ascendant aside on its own. If this
  -- fails, the trigger did not fire and nothing else in the app is protected
  -- either.
  SELECT COUNT(*) INTO v_violations
    FROM public.profiles
   WHERE rising_sign IS NOT NULL
     AND (birth_time IS NULL OR birth_latitude IS NULL OR birth_longitude IS NULL);

  IF v_violations > 0 THEN
    RAISE EXCEPTION
      'The BEFORE trigger did not fire: % profile(s) keep a rising_sign with no birth time or no birthplace.',
      v_violations;
  END IF;

  RAISE NOTICE 'OK. No invented birthplace left, and every unbacked ascendant was set aside, not deleted.';
END
$verify$;

commit;

-- =============================================================================
-- Verify after applying
-- =============================================================================
-- The Studio SQL editor does not render NOTICEs, so restate the result as rows.
-- Expect: montreal_restant = 0, violations = 0.
-- `mis_de_cote` should have grown by the number of ascendants among the rows
-- this migration touched — they were MOVED, not deleted.
SELECT
  (SELECT COUNT(*) FROM public.profiles
    WHERE ROUND(birth_latitude::numeric, 4)  = 45.5017
      AND ROUND(birth_longitude::numeric, 4) = -73.5673
      AND (birth_city IS NULL OR lower(birth_city) NOT LIKE '%montr%'))  AS montreal_restant,
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign IS NOT NULL
      AND (birth_time IS NULL
        OR birth_latitude IS NULL
        OR birth_longitude IS NULL))                                     AS violations,
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign_unconfirmed IS NOT NULL)                           AS mis_de_cote,
  (SELECT COUNT(*) FROM public.profiles
    WHERE rising_sign IS NOT NULL)                                       AS ascendants_fiables,
  (SELECT COUNT(*) FROM public.profiles
    WHERE birth_time IS NOT NULL
      AND (birth_latitude IS NULL OR birth_longitude IS NULL))           AS a_reconfirmer;
