-- ============================================================
-- Phase D pass-2: drop messages.match_id, its FK, and its indexes
-- ============================================================
--
-- DEPLOYMENT STATUS: applied to production out-of-band via the SQL
-- editor on 2026-05-14, ahead of this file being committed. Verified
-- by a full prod schema snapshot (messages columns, triggers, pg_proc,
-- constraints, FK/index): match_id column gone, conversation_id NOT
-- NULL, trigger_update_match_message + update_match_last_message gone,
-- notify_new_message conversation-only, zero pg_proc references to
-- match_id. This file is the canonical idempotent record — safe to
-- re-run; a fresh DB / future `db push` reaches the same end state.
--
-- Reference plan: docs/legacy-matches-retirement-plan.md
--   §"Phase D pass-2 — deferred: column / FK / index drop".
--
-- Phase D pass-1 (20260513000005) dropped the last RLS policies on
-- public.messages that referenced match_id. It deliberately left the
-- physical column, its FK, and its three indexes in place to soak for
-- one release cycle. This migration completes pass-2: it removes the
-- column-level legacy match wiring from public.messages.
--
-- ------------------------------------------------------------
-- WHAT THIS MIGRATION DOES
-- ------------------------------------------------------------
--
--   Steps below are listed in execution order.
--
--   1. Rewrites public.notify_new_message() to be conversation-only.
--      The version shipped in 20260514000001 still carries an
--      `ELSIF NEW.match_id IS NOT NULL` legacy fallback branch that
--      reads public.matches and emits a `{ matchId }` payload. Once
--      Step 4 drops the match_id column this AFTER INSERT trigger
--      would throw `record "new" has no field "match_id"` on every
--      message insert. (Postgres does not parse plpgsql bodies for
--      column dependencies, so the column drop itself would NOT fail
--      at apply time — the breakage is a runtime trigger error on the
--      next insert. Either way the branch must go.) The branch is
--      also dead: pass-1's prod audit confirmed every visible message
--      has a conversation_id, and no client inserts messages with
--      match_id any more (verified by grep — see "Audit" below). The
--      rewritten function keeps the exact same conversation_id
--      behaviour and the exact same push payload shape introduced by
--      20260514000001:
--        - type: 'message' (canonical singular)
--        - data: { chatId, conversationId, conversation_id }
--      Only the now-unreachable match_id branch is removed; for a
--      message with no conversation_id, or where the sender is not a
--      participant, it still RETURN NEW (no-op), exactly as before.
--
--   2. Retires trigger trigger_update_match_message on public.messages
--      and its backing function public.update_match_last_message().
--      The function body runs `UPDATE public.matches SET
--      last_message_at = NEW.created_at WHERE id = NEW.match_id`
--      (20260323_fix_message_trigger_functions.sql lines 1-14). Same
--      hazard as step 1: after the column drop this AFTER INSERT
--      trigger would throw `record "new" has no field "match_id"` on
--      EVERY message insert, breaking chat entirely. It is also
--      already a pure no-op for conversation-first rows (NEW.match_id
--      has been NULL on every new message since 20260428000002, so
--      the embedded UPDATE matched zero rows). Both 20260513000006
--      and 20260428000002 describe it as "kept for Phase E", but that
--      reasoning predates the physical column drop; pass-2 is the
--      migration that makes the column disappear, so pass-2 is where
--      this trigger + function must be retired. CASCADE-free
--      ordering: trigger first (it depends on the function), function
--      second.
--
--   2b. Drops the two remaining match_id-referencing functions that a
--      pg_proc audit in production surfaced (and that the original
--      pass-2 audit missed):
--        - public.get_user_matches(uuid) — reads
--          `public.messages WHERE msg.match_id = m.id` twice. It is
--          meant to be dropped by 20260513000003 (Phase B), but the
--          prod pg_proc audit found it STILL present, so Phase B's
--          drop has not actually reached prod. Dropping it here is
--          defensive: it removes the dependency regardless of whether
--          20260513000003 lands first, and DROP FUNCTION IF EXISTS is
--          a no-op once that migration does land. Zero callers (the
--          chat tab moved to get_user_conversations()), so the drop
--          is behaviour-neutral.
--        - public.activate_requested_match_on_reply() — orphan trigger
--          function from the abandoned message_requests system. Its
--          trigger was already dropped by 20260513000006; the function
--          body (created via Supabase Studio, never tracked) still
--          references match_id. With no trigger it is unreachable, so
--          it cannot break at runtime — but it is the loose end the
--          Phase E preamble explicitly deferred. Tied off here.
--      Both are DROP FUNCTION IF EXISTS (guarded, idempotent), with
--      no CASCADE — a surprise dependency makes the drop fail loudly
--      rather than silently widen.
--
--   3. Makes conversation_id NOT NULL. Pass-1's prod audit returned
--      zero rows for `conversation_id IS NULL`. With the match_id
--      fallback gone there is no other way to address a message, so
--      conversation_id becomes a hard requirement for every future
--      insert. (Re-run prevalidation Query 1 before applying — see
--      the deployment package in the plan.)
--
--   4. Drops the FK constraint messages_match_id_fkey (the implicit
--      name Postgres assigned to the inline
--      `match_id UUID ... REFERENCES matches(id)` in
--      00000000000000_full_schema.sql line 257), then drops the
--      match_id column itself. FK first, column second: dropping the
--      column would drop the FK with it, but doing it explicitly and
--      in order keeps the intent legible and the failure mode narrow.
--
--   5. Drops the three indexes whose leading/only key was match_id,
--      as defined in 00000000000000_full_schema.sql lines 267-270:
--        - idx_messages_match       ON messages(match_id, created_at DESC)
--        - idx_messages_unread      ON messages(match_id, is_read) WHERE is_read = FALSE
--        - idx_messages_match_read  ON messages(match_id, is_read)
--      DROP COLUMN already cascades these away; the explicit
--      DROP INDEX IF EXISTS statements are belt-and-suspenders and
--      make the index retirement self-documenting.
--
-- ------------------------------------------------------------
-- AUDIT (active references to messages.match_id at pass-2 time)
-- ------------------------------------------------------------
--
--   SQL — active server objects referencing match_id:
--     * public.notify_new_message() — the ELSIF NEW.match_id branch.
--       Rewritten conversation-only by this migration (step 1).
--     * public.update_match_last_message() / trigger
--       trigger_update_match_message — its body references
--       NEW.match_id. RETIRED by this migration (step 2). It cannot
--       survive the column drop: the AFTER INSERT trigger would throw
--       on every message insert. It is already a no-op for every
--       conversation-first row, so retiring it changes no observable
--       behaviour. See step 2 in "WHAT THIS MIGRATION DOES".
--     * public.get_user_matches(uuid) — body reads
--       `public.messages msg WHERE msg.match_id = m.id` twice (the
--       last_message preview + unread_count subqueries, per
--       20260504000001 lines 52-57). DROP COLUMN does not fail at
--       apply time on a plpgsql body reference, but the next call
--       would throw `column "match_id" does not exist`. A pg_proc
--       audit in PROD found it still present despite 20260513000003
--       (Phase B) being marked shipped — so this migration drops it
--       defensively (step 2b). Zero callers (grep apps/,
--       supabase/functions/ — chat tab uses get_user_conversations()).
--     * public.activate_requested_match_on_reply() — orphan trigger
--       function (message_requests system). Trigger dropped by
--       20260513000006; body still references match_id but is
--       unreachable with no trigger. Tied off here (step 2b).
--     The original pass-2 audit claimed only two active objects; the
--     prod pg_proc check (Q5) proved four. All four are now handled
--     before the column drop.
--     * RLS on public.messages — already match_id-free since pass-1
--       (20260513000005). Re-verified: pass-1 deployment Queries A+B
--       returned 0 rows / conversation-only.
--
--   App — apps/web + apps/mobile:
--     * apps/mobile/app/chat/[id].tsx line 31 — the local `Message`
--       TS type still declares an optional `match_id?: string | null`
--       field. It is NOT an active dependency: reads use
--       `.select('*')` (the column simply stops appearing in the row
--       once dropped) and inserts only write
--       `{ conversation_id, sender_id, content }`. Harmless dead type
--       field; left untouched here to keep this migration SQL-only.
--       Optional cosmetic cleanup for a later app-side commit.
--     * All other apps/ hits for `matchId` (mobile _layout.tsx,
--       notifications.ts, synastry.tsx, date-planner.tsx,
--       match/[id].tsx, web chat/[matchId]/page.tsx) are route-param
--       / push-payload back-compat names — none read or write the
--       messages.match_id *column*. Verified by grep at pass-2 time.
--
--   Historical-only (NOT touched — do not "fix" on reflex):
--     * 00000000000000_full_schema.sql, 20260428000002_conversations_first.sql,
--       20260323_fix_message_trigger_functions.sql,
--       20260320_fix_get_user_matches_search_path.sql, and the other
--       older migrations all contain match_id. They are immutable
--       deployment history. Only forward migrations count.
--
-- ------------------------------------------------------------
-- WHAT THIS MIGRATION EXPLICITLY DOES NOT TOUCH
-- ------------------------------------------------------------
--   * The public.matches table — Phase E, still deferred. This
--     migration removes the LAST FK into matches from public.messages
--     and retires the last messages-side trigger that wrote to
--     matches, but the table itself, its rows, and any non-messages
--     wiring stay. (After this migration, public.messages has zero
--     references to public.matches — column, FK, and trigger all
--     gone — which is exactly the precondition Phase E needs.)
--   * public.swipes / trigger_swipe_rate_limit — Phase E-adjacent,
--     untouched.
--   * notification_preferences.newMatches JSON key — live UI contract
--     (mobile Settings → Notifications "New connections"). Untouched.
--   * Any INSERT/UPDATE/DELETE policy on public.messages — the
--     canonical INSERT policy has been match_id-free since
--     20260428000002 §4; pass-1 cleared the SELECT policies. This
--     migration changes no policy. (It does NOT re-drop the pass-1
--     policies — pass-1 is verified in prod; re-dropping/recreating
--     them here would only risk a spurious "already exists" failure.
--     If a deploy somehow skipped pass-1, prevalidation Query 3 will
--     catch it before this migration is applied.)
--   * idx_messages_sender ON messages(sender_id) — not a match index,
--     stays.
--   * App code — no app change is required. The mobile TS type field
--     noted in the audit is cosmetic and out of scope for a SQL
--     migration.
--
-- ------------------------------------------------------------
-- IDEMPOTENCE
-- ------------------------------------------------------------
--   * CREATE OR REPLACE FUNCTION — safe to re-run.
--   * ALTER COLUMN ... SET NOT NULL — re-running on an already-NOT NULL
--     column is a no-op in Postgres.
--   * DROP CONSTRAINT IF EXISTS / DROP COLUMN IF EXISTS /
--     DROP INDEX IF EXISTS — all guarded; a second apply is a no-op.
--   * DROP TRIGGER IF EXISTS / DROP FUNCTION IF EXISTS — guarded; a
--     second apply is a no-op.
--   No CASCADE is used on the constraint/index/trigger/function drops.
--   The column drop does cascade its own dependent FK + indexes by
--   necessity, but by that point this migration has already dropped
--   them explicitly, so nothing unexpected can ride along.
--
-- ------------------------------------------------------------
-- RISK
-- ------------------------------------------------------------
--   Low-to-moderate. Subtractive schema change on a hot table
--   (public.messages). The notify_new_message() rewrite is
--   behaviour-preserving for the only path that is still reachable
--   (conversation_id). Retiring trigger_update_match_message /
--   update_match_last_message() removes a trigger that was already a
--   no-op for every conversation-first row, so no observable
--   behaviour changes — and leaving it would actively break message
--   inserts post-column-drop, so its removal lowers risk rather than
--   raising it. The SET NOT NULL on conversation_id takes a brief
--   ACCESS EXCLUSIVE lock and a full-table validation scan —
--   acceptable for the current messages volume; run during a low-
--   traffic window if in doubt. DROP COLUMN on a large table is a
--   metadata-only operation in Postgres (the column is tombstoned,
--   not rewritten), so it is fast.
--
-- ------------------------------------------------------------
-- ROLLBACK
-- ------------------------------------------------------------
--   begin;
--
--   -- 1. Re-add the column + FK (historical match_id values are NOT
--   --    recoverable from the drop; rows would have match_id NULL and
--   --    would need re-derivation from conversations.user_a/user_b
--   --    joined back to matches.user1_id/user2_id if ever required).
--   ALTER TABLE public.messages
--     ADD COLUMN match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE;
--
--   -- 2. Re-create the three indexes.
--   CREATE INDEX IF NOT EXISTS idx_messages_match
--     ON public.messages(match_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_messages_unread
--     ON public.messages(match_id, is_read) WHERE is_read = FALSE;
--   CREATE INDEX IF NOT EXISTS idx_messages_match_read
--     ON public.messages(match_id, is_read);
--
--   -- 3. Relax conversation_id back to nullable.
--   ALTER TABLE public.messages
--     ALTER COLUMN conversation_id DROP NOT NULL;
--
--   -- 4. Restore notify_new_message() with the match_id fallback
--   --    branch verbatim from 20260514000001.
--   --    (Re-apply that migration's CREATE OR REPLACE FUNCTION body.)
--
--   -- 5. Restore update_match_last_message() + its trigger, verbatim
--   --    from 20260323_fix_message_trigger_functions.sql lines 1-14:
--   CREATE OR REPLACE FUNCTION public.update_match_last_message()
--   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
--   AS $fn$
--   BEGIN
--     UPDATE public.matches
--     SET last_message_at = NEW.created_at
--     WHERE id = NEW.match_id;
--     RETURN NEW;
--   END;
--   $fn$;
--   CREATE TRIGGER trigger_update_match_message
--     AFTER INSERT ON public.messages
--     FOR EACH ROW EXECUTE FUNCTION public.update_match_last_message();
--
--   -- 6. get_user_matches(uuid) and activate_requested_match_on_reply()
--   --    are NOT restored by this rollback. get_user_matches has zero
--   --    callers (restoring it is API-surface-only — copy the body
--   --    from 20260504000001 lines 22-65 + the GRANT from
--   --    20260427000022 into a forward migration if ever needed).
--   --    activate_requested_match_on_reply is a dead orphan with no
--   --    trigger — there is nothing to roll back to.
--
--   commit;
--
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Step 1: rewrite notify_new_message() as conversation-only.
--   Done before the Step 4 column drop so this AFTER INSERT trigger
--   never fires against a NEW record that has no match_id field.
--   Behaviour and push payload for the conversation_id path are
--   identical to 20260514000001 — only the dead match_id ELSIF and
--   the now-unused match_record local are removed.
-- ------------------------------------------------------------
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
  edge_function_url TEXT;
  notification_data JSONB;
BEGIN
  -- Conversation-first messaging is the only addressing model. A row
  -- without a conversation_id cannot be delivered; no-op out.
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name
  INTO sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

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

-- ------------------------------------------------------------
-- Step 2: retire the last messages-side match_id trigger.
--   trigger_update_match_message fires update_match_last_message(),
--   whose body is `UPDATE public.matches SET last_message_at =
--   NEW.created_at WHERE id = NEW.match_id`. Once Step 4 drops the
--   match_id column this AFTER INSERT trigger would throw
--   `record "new" has no field "match_id"` on every message insert.
--   The trigger has been a no-op for every conversation-first row
--   since 20260428000002 (NEW.match_id always NULL → UPDATE matched
--   zero rows), so retiring it changes no observable behaviour.
--   Trigger first (it depends on the function), function second.
--   No CASCADE — if anything unexpected depends on the function the
--   drop should fail loudly rather than silently widen.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_update_match_message ON public.messages;
DROP FUNCTION IF EXISTS public.update_match_last_message();

-- ------------------------------------------------------------
-- Step 2b: drop the two remaining match_id-referencing functions a
--   prod pg_proc audit surfaced (the original pass-2 audit missed
--   them — it claimed two active objects, prod has four).
--
--   get_user_matches(uuid): reads public.messages WHERE
--     msg.match_id = m.id twice. 20260513000003 (Phase B) is supposed
--     to drop it, but the prod audit found it still present — so we
--     drop it here regardless. Zero callers; DROP IF EXISTS is a
--     no-op once 20260513000003 actually lands.
--   activate_requested_match_on_reply(): orphan trigger function;
--     its trigger was dropped by 20260513000006. Unreachable, but
--     still references match_id — retired here so the column drop
--     leaves nothing dangling.
--
--   No CASCADE: an unexpected dependency should fail the migration
--   loudly, not be silently dropped.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_user_matches(uuid);
DROP FUNCTION IF EXISTS public.activate_requested_match_on_reply();

-- ------------------------------------------------------------
-- Step 3: make conversation_id mandatory for all future inserts.
--   Pass-1 prod audit: zero rows with conversation_id IS NULL.
--   Re-confirm with prevalidation Query 1 before applying.
-- ------------------------------------------------------------
ALTER TABLE public.messages
  ALTER COLUMN conversation_id SET NOT NULL;

-- ------------------------------------------------------------
-- Step 4: drop the FK, then the column. FK explicitly first so the
--   intent is legible; DROP COLUMN would otherwise cascade it.
-- ------------------------------------------------------------
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_match_id_fkey;

ALTER TABLE public.messages
  DROP COLUMN IF EXISTS match_id;

-- ------------------------------------------------------------
-- Step 5: drop the three match_id-keyed indexes. DROP COLUMN above
--   already cascaded these; the explicit guarded drops keep the
--   index retirement self-documenting and safe on partial-state DBs.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_messages_match;
DROP INDEX IF EXISTS public.idx_messages_unread;
DROP INDEX IF EXISTS public.idx_messages_match_read;

commit;
