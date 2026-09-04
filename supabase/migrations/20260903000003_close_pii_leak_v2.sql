-- =============================================================================
-- P0 v2 — close the PII leak for real, and fail loudly if it does not
-- =============================================================================
--
-- WHY v1 DID NOT WORK
-- -------------------
-- `20260903000002` issued `REVOKE SELECT (email) ON public.profiles FROM
-- authenticated` and friends. Those statements are correct SQL and they
-- accomplished nothing, because a table-level `GRANT SELECT ON public.profiles
-- TO authenticated` was in place: PostgreSQL cannot carve a column out of a
-- table-wide privilege. It emits
--
--     WARNING: no privileges could be revoked for column "email"
--
-- and commits. The migration "succeeded". The verification block on 3 Sep
-- caught it:
--
--     "table_level_select_grants": 1,
--     "column_level_select_grants": 5
--
-- WHERE THE TABLE-LEVEL GRANT CAME FROM
-- -------------------------------------
-- Not from this repository. Every `GRANT ... TO authenticated` on a table in
-- `supabase/migrations/` was enumerated on 3 Sep: there are three, all on
-- `public.discoverable_profiles`. Nothing grants anything on `public.profiles`.
--
-- It also did not exist on 2 Sep: the audit query that day covered nine columns
-- and returned rows for only five. A table-level grant expands to every column,
-- so all nine would have appeared. It was created between the two runs, outside
-- version control — a manual GRANT, or a repair script run against production.
-- `docs/security-audit-2026-09.md` §3.1 carries the log query to find it.
--
-- WHAT THIS MIGRATION DOES DIFFERENTLY
-- ------------------------------------
-- 1. Removes the table-level SELECT, which is the actual problem.
-- 2. Re-grants SELECT column by column on the public subset, computed from
--    `information_schema.columns` rather than from a hand-typed list, so a
--    column added later is not silently exposed OR silently dropped.
-- 3. VERIFIES ITSELF BEFORE COMMITTING. If any of the nine sensitive columns is
--    still selectable by a client role at the end of the block, it raises and
--    the whole transaction rolls back. v1's defining failure was that it looked
--    like it worked; this one cannot.
--
-- REGRESSION SURFACE
-- ------------------
-- The twenty client-side `.select()` calls on `profiles` were enumerated on
-- 3 Sep and read only public-subset columns (`sun_sign`, `onboarding_completed`,
-- `is_verified`, `referral_code`, `photos`, `voice_intro_url`, `min_age`,
-- `name`, `age`, `id`, ...). Self-reads of the sensitive fields go through
-- `public.get_my_full_profile()` (SECURITY DEFINER, unaffected by grants to
-- `authenticated`). Other users' natal data goes through the `get-profile-chart`
-- edge function (service_role, sanitized chart). The `discoverable_profiles`
-- view references `birth_date` and `birth_chart` in its definition and kept
-- working on 2 Sep while both were ungranted, so a security_invoker view does
-- not require privileges on columns a query does not select.

begin;

DO $$
DECLARE
  v_sensitive CONSTANT TEXT[] := ARRAY[
    'email', 'birth_date', 'birth_time', 'birth_latitude', 'birth_longitude',
    'birth_chart', 'push_token', 'notification_preferences', 'referred_by'
  ];
  v_cols  TEXT;
  v_count INTEGER;
  v_left  INTEGER;
  v_table INTEGER;
BEGIN
  -- The public subset: every column of profiles that is not on the list above.
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
         count(*)
    INTO v_cols, v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND NOT (column_name = ANY (v_sensitive));

  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'public.profiles has no non-sensitive columns — refusing to continue';
  END IF;

  RAISE NOTICE 'Granting SELECT on % public columns: %', v_count, v_cols;

  -- 1. The actual fix: drop the table-wide privilege.
  REVOKE SELECT ON public.profiles FROM authenticated;
  REVOKE SELECT ON public.profiles FROM anon;

  -- 2. Belt and braces: clear any column-level SELECT that survives on the
  --    sensitive nine. Harmless when there is none.
  EXECUTE format(
    'REVOKE SELECT (%s) ON public.profiles FROM authenticated',
    (SELECT string_agg(quote_ident(c), ', ') FROM unnest(v_sensitive) AS c)
  );
  EXECUTE format(
    'REVOKE SELECT (%s) ON public.profiles FROM anon',
    (SELECT string_agg(quote_ident(c), ', ') FROM unnest(v_sensitive) AS c)
  );

  -- 3. Give back exactly what the client actually reads.
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', v_cols);

  -- 4. Prove it worked, inside the transaction, before anyone can call it done.
  SELECT count(*) INTO v_left
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND column_name  = ANY (v_sensitive)
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'SELECT';

  SELECT count(*) INTO v_table
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type = 'SELECT';

  IF v_left > 0 OR v_table > 0 THEN
    RAISE EXCEPTION
      'PII still readable after fix: % column grant(s), % table-level grant(s). Rolling back.',
      v_left, v_table;
  END IF;

  RAISE NOTICE 'OK — 0 column-level and 0 table-level SELECT on the sensitive columns.';
END
$$;

COMMENT ON TABLE public.profiles IS
  'Client SELECT is column-level only: the public subset is granted explicitly to authenticated, and the nine sensitive columns (email, birth_date, birth_time, birth_latitude, birth_longitude, birth_chart, push_token, notification_preferences, referred_by) are granted to nobody. NEVER issue GRANT SELECT ON public.profiles — a table-wide grant silently re-covers every column and makes the column revokes no-ops. That is exactly what happened on 3 Sep 2026 and it took a two-source check to notice.';

commit;
