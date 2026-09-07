-- =============================================================================
-- JUNO-08 — A delivered message is a fact, not a draft
-- =============================================================================
--
-- THE DEFECT
-- ----------
-- `00000000000000_full_schema.sql:402`, still live, still the only UPDATE policy
-- on the table:
--
--     CREATE POLICY "Users can update own messages" ON messages
--       FOR UPDATE USING (auth.uid() = sender_id);
--
-- No `WITH CHECK`. PostgreSQL then reuses `USING` as `WITH CHECK`, so the row
-- after the update need only keep the caller as its sender — `content`,
-- `conversation_id`, `is_read` and `read_at` are all free. A sender can
-- therefore rewrite the text of a message the other person already read, and
-- move one of their own messages from one of their conversations into another.
--
-- This is the same shape as the `conversations` finding closed on 3 Sep 2026 by
-- `20260903000001` — an UPDATE policy written to answer "can this person see
-- it?" that ended up also answering "can this person rewrite it?" — on the
-- table next door. (docs/security-audit-2026-09-07.md, JUNO-08.)
--
-- WHY IT MATTERS MORE HERE THAN THE SEVERITY SUGGESTS
-- ---------------------------------------------------
-- In a dating product the message thread is the evidence. Safety review, the
-- block/report flow, and any external process that follows all read it. A
-- participant who can edit what they said after it was read and reported can
-- edit the report out from under it. Non-repudiation of the thread is a product
-- safety property, not a database detail.
--
-- WHY A REVOKE AND NOT A BETTER POLICY
-- ------------------------------------
-- Because nothing needs the privilege. Verified on 2026-09-07 across both
-- clients: `from('messages').update(` and `from("messages").update(` return
-- ZERO matches. Read receipts already go through
-- `mark_conversation_messages_read` (`20260514000001`), a SECURITY DEFINER
-- function written for exactly this reason, whose own comment states that
-- "messages UPDATE stays locked down" — an intention the grants never carried
-- out, because no migration ever revoked anything on this table. The privilege
-- comes from Supabase's schema-wide `GRANT ALL ... TO anon, authenticated`.
--
-- Removing a privilege beats narrowing a policy: a policy is evaluated only
-- when the privilege exists, so the REVOKE makes the whole class of mistake
-- unreachable rather than correctly handled.
--
-- The policy itself is left in place, unreachable, exactly as `20260903000001`
-- left the `conversations` one. Deleting it would erase the record of what the
-- intent was, and it can no longer fire.
--
-- WHAT STILL WORKS, AND WHY IT IS SAFE TO SAY SO
-- ----------------------------------------------
--   * SELECT — untouched. The conversation-membership policy is the only gate.
--   * INSERT — untouched. "Users can send conversation messages"
--     (`20260428000002:169`) still applies, block guard included.
--   * Read receipts — `mark_conversation_messages_read` runs as the definer, so
--     it is unaffected by a grant to `authenticated`.
--   * `conversations.last_message_at` — maintained by
--     `update_conversation_last_message`, an AFTER INSERT trigger, also
--     SECURITY DEFINER. Unaffected.
--   * service_role — unaffected. Moderation, migrations and support tooling
--     keep full access.
--
-- DELETE was already impossible and stays that way: `messages` has no `FOR
-- DELETE` policy, and under RLS the absence of a policy is a refusal. The
-- REVOKE below removes the privilege as well, so the two agree.
--
-- IDEMPOTENT: REVOKE on an absent privilege is a no-op, and the verification
-- block re-runs safely.
--
-- NOT DEPLOYED BY THIS FILE. Apply statement by statement in the SQL editor —
-- see docs/security-audit-2026-09-07.md, JUNO-15, for why `supabase db push` is
-- currently unusable on this project.

begin;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.messages FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.messages FROM anon;

-- anon has had no SELECT since Phase 1; restate INSERT/SELECT removal so the
-- role's posture on this table is written down rather than inferred.
REVOKE INSERT, SELECT ON public.messages FROM anon;

COMMENT ON TABLE public.messages IS
  'Chat messages, addressed by conversation_id. Client-facing access is SELECT + INSERT only. UPDATE/DELETE/TRUNCATE revoked from authenticated on 2026-09-07 (JUNO-08): the UPDATE policy inherited from the initial schema had no WITH CHECK, so a sender could rewrite the content of a message that had already been delivered and read, or move it into another of their conversations. Read receipts go through mark_conversation_messages_read (SECURITY DEFINER), which is why no client has ever needed UPDATE.';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the transaction rather than report success.
-- ---------------------------------------------------------------------------
-- The lesson of 20260903000002 is that a migration which "succeeded" while
-- changing nothing is worse than one that fails: PostgreSQL emits
-- `WARNING: no privileges could be revoked` and commits. So this asserts the
-- end state inside the transaction, before anyone can call it done.
DO $$
DECLARE
  v_bad_dml   INTEGER;
  v_can_read  BOOLEAN;
  v_can_write BOOLEAN;
BEGIN
  SELECT count(*) INTO v_bad_dml
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name   = 'messages'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  IF v_bad_dml > 0 THEN
    RAISE EXCEPTION
      'JUNO-08 NOT CLOSED: % mutating privilege(s) remain on public.messages for a client role. A table-level GRANT elsewhere may be re-covering them.',
      v_bad_dml;
  END IF;

  -- The other half: the revoke must not have taken the product with it.
  v_can_read  := has_table_privilege('authenticated', 'public.messages', 'SELECT');
  v_can_write := has_table_privilege('authenticated', 'public.messages', 'INSERT');

  IF NOT v_can_read OR NOT v_can_write THEN
    RAISE EXCEPTION
      'Over-revoked: authenticated needs SELECT (read a thread) and INSERT (send). select=% insert=%',
      v_can_read, v_can_write;
  END IF;

  IF has_table_privilege('anon', 'public.messages', 'SELECT')
     OR has_table_privilege('anon', 'public.messages', 'INSERT') THEN
    RAISE EXCEPTION 'anon holds SELECT or INSERT on public.messages';
  END IF;

  RAISE NOTICE 'JUNO-08 closed: authenticated has SELECT + INSERT only; anon has nothing.';
END
$$;

commit;

-- =============================================================================
-- AFTER APPLYING
-- =============================================================================
--
-- VERIFICATION. Do NOT retype the queries from a comment. Open the file below,
-- select all, paste, run. It is pure runnable SQL, read-only, and it covers
-- this migration and 20260907000001 together:
--
--     supabase/tests/verify_20260907_remediation.sql
--
-- Every row it returns must show ok = true, and the last row is a VERDICT.
--
-- The reason it is a file rather than a comment block: this section used to
-- carry the queries inline, prefixed with `--`. Stripping those prefixes to run
-- them also stripped them from the PROSE in between, and PostgreSQL answered
-- `ERROR: 42P01: relation "another" does not exist` — the word came out of an
-- English sentence. A check you cannot paste is a check that gets skipped.
--
-- BEHAVIOURAL TEST (local database, writes then rolls back, leaves nothing):
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/messages_immutable.test.sql
--
-- SMOKE TEST, in this order, because each step exercises a different
-- SECURITY DEFINER path the revoke could have broken:
--     1. open a conversation list  -> SELECT on conversations
--     2. open a thread             -> SELECT on messages + mark_conversation_messages_read
--     3. SEND A MESSAGE            -> INSERT + update_conversation_last_message trigger
--
-- ROLLBACK, one statement, restoring the pre-2026-09-07 privileges exactly:
--     GRANT UPDATE ON public.messages TO authenticated;
-- It reopens JUNO-08. It is written down so a production incident has an
-- unambiguous undo, not because it is ever the right answer.
