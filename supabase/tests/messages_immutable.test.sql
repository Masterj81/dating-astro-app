-- Behavioural tests for the message-immutability invariant
-- (migration 20260907000002_messages_immutable, JUNO-08).
--
-- HOW TO RUN
--   supabase start                       # or point at a branch/staging DB
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/messages_immutable.test.sql
--
-- The whole run is wrapped in a transaction that ends with ROLLBACK, so it
-- leaves no rows behind and is safe against a database that already has data.
-- Every assertion RAISEs on failure, so `ON_ERROR_STOP=1` turns a regression
-- into a non-zero exit code.
--
-- Must be run as a role that can INSERT INTO auth.users (postgres /
-- service_role), because profiles hang off real auth users. The privilege
-- assertions are made against the `authenticated` and `anon` role objects
-- directly, so they hold regardless of who runs the file.
--
-- WHAT IS BEING PROTECTED
-- -----------------------
-- The initial schema shipped `FOR UPDATE USING (auth.uid() = sender_id)` with
-- no WITH CHECK. PostgreSQL then reuses USING as WITH CHECK, so the row after
-- the update only had to keep the caller as its sender: `content` and
-- `conversation_id` were free. A sender could rewrite a message the other
-- person had already read and reported. The privilege — not the policy — is
-- what was removed, because a policy is only consulted when the privilege
-- exists. See docs/security-audit-2026-09-07.md, JUNO-08.

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  c_instance CONSTANT UUID := '00000000-0000-0000-0000-000000000000';
  v_alice    UUID := gen_random_uuid();
  v_bob      UUID := gen_random_uuid();
  v_convo    UUID;
  v_message  UUID;
  v_count    INTEGER;
  v_content  TEXT;
  v_ok       BOOLEAN;
BEGIN
  -- =========================================================================
  -- PRIVILEGES — the actual fix. Asserted first: everything below is about
  -- proving the product still works once these hold.
  -- =========================================================================
  SELECT count(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name   = 'messages'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'FAIL 1: % mutating privilege(s) on public.messages for a client role — JUNO-08 is open',
      v_count;
  END IF;
  RAISE NOTICE 'PASS 1: no UPDATE/DELETE/TRUNCATE for anon or authenticated';

  -- The sender cannot edit, even in principle: without the privilege the
  -- policy is never consulted, so this is stronger than "the policy says no".
  IF has_table_privilege('authenticated', 'public.messages', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL 2: authenticated still holds UPDATE on public.messages';
  END IF;
  IF has_table_privilege('authenticated', 'public.messages', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL 2b: authenticated still holds DELETE on public.messages';
  END IF;
  RAISE NOTICE 'PASS 2: a sender cannot rewrite or delete a delivered message';

  -- =========================================================================
  -- THE PRODUCT — reading and sending must be untouched.
  -- =========================================================================
  IF NOT has_table_privilege('authenticated', 'public.messages', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 3: authenticated lost SELECT — a thread can no longer be read';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.messages', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL 3b: authenticated lost INSERT — a message can no longer be sent';
  END IF;
  RAISE NOTICE 'PASS 3: authenticated keeps SELECT + INSERT';

  -- =========================================================================
  -- anon gains nothing, on any verb.
  -- =========================================================================
  SELECT count(*) INTO v_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'messages' AND grantee = 'anon';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 4: anon holds % privilege(s) on public.messages', v_count;
  END IF;
  RAISE NOTICE 'PASS 4: anon holds nothing on public.messages';

  -- =========================================================================
  -- The policies that must survive, and the one that must stay unreachable.
  -- =========================================================================
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'SELECT';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 5: no SELECT policy on public.messages';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'messages' AND cmd = 'INSERT';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'FAIL 5b: no INSERT policy on public.messages — sending is broken';
  END IF;
  RAISE NOTICE 'PASS 5: SELECT and INSERT policies present';

  -- RLS itself must still be on. A revoke is not a substitute for it:
  -- service_role and the table owner bypass grants entirely.
  SELECT relrowsecurity INTO v_ok FROM pg_class WHERE oid = 'public.messages'::regclass;
  IF NOT COALESCE(v_ok, FALSE) THEN
    RAISE EXCEPTION 'FAIL 6: row level security is disabled on public.messages';
  END IF;
  RAISE NOTICE 'PASS 6: RLS enabled on public.messages';

  -- =========================================================================
  -- The maintenance path that must keep working: read receipts.
  -- =========================================================================
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'mark_conversation_messages_read'
       AND p.prosecdef                       -- SECURITY DEFINER
  ) THEN
    RAISE EXCEPTION
      'FAIL 7: mark_conversation_messages_read is missing or no longer SECURITY DEFINER — read receipts depended on the UPDATE grant this migration removed';
  END IF;
  IF NOT has_function_privilege('authenticated',
        'public.mark_conversation_messages_read(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 7b: authenticated cannot execute mark_conversation_messages_read';
  END IF;
  RAISE NOTICE 'PASS 7: read receipts still reachable, as SECURITY DEFINER';

  -- The last_message_at trigger is the other definer-owned path the revoke
  -- could have broken. It fires on INSERT and updates `conversations`.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.messages'::regclass
       AND NOT tgisinternal
       AND tgname = 'trigger_update_conversation_last_message'
  ) THEN
    RAISE EXCEPTION 'FAIL 8: the last_message_at trigger is gone — sending would not bump the thread';
  END IF;
  RAISE NOTICE 'PASS 8: last_message_at trigger present';

  -- =========================================================================
  -- END TO END — a real conversation, as service_role. Proves that the schema
  -- still accepts a message after the revoke, and that the trigger fires.
  -- =========================================================================
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    (c_instance, v_alice, 'authenticated', 'authenticated',
     'juno-test-alice-' || v_alice || '@example.invalid', '', NOW(), NOW(), NOW()),
    (c_instance, v_bob, 'authenticated', 'authenticated',
     'juno-test-bob-' || v_bob || '@example.invalid', '', NOW(), NOW(), NOW());

  INSERT INTO public.profiles (id, name, email, gender, birth_date,
                               onboarding_completed, is_active)
  VALUES
    (v_alice, 'Alice Test', 'juno-test-alice-' || v_alice || '@example.invalid',
     'female', DATE '1994-07-14', TRUE, TRUE),
    (v_bob, 'Bob Test', 'juno-test-bob-' || v_bob || '@example.invalid',
     'male', DATE '1992-03-02', TRUE, TRUE)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.conversations (user_a, user_b)
  VALUES (LEAST(v_alice, v_bob), GREATEST(v_alice, v_bob))
  RETURNING id INTO v_convo;

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (v_convo, v_alice, 'original text')
  RETURNING id INTO v_message;

  SELECT content INTO v_content FROM public.messages WHERE id = v_message;
  IF v_content IS DISTINCT FROM 'original text' THEN
    RAISE EXCEPTION 'FAIL 9: the message did not land intact (got %)', v_content;
  END IF;
  RAISE NOTICE 'PASS 9: a message can still be sent and read back';

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
     WHERE id = v_convo AND last_message_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL 10: last_message_at was not set — the AFTER INSERT trigger did not fire';
  END IF;
  RAISE NOTICE 'PASS 10: last_message_at trigger fired on send';

  RAISE NOTICE '--------------------------------------------------------------';
  RAISE NOTICE 'ALL PASS — JUNO-08 closed and the chat still works end to end.';
  RAISE NOTICE '--------------------------------------------------------------';
END
$test$;

ROLLBACK;
