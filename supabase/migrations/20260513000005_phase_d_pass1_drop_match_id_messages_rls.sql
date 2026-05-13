-- ============================================================
-- Phase D pass-1: drop the legacy match_id branches from messages RLS
-- ============================================================
--
-- The messages SELECT RLS no longer needs to OR on match_id. After the
-- Phase D pre-step backfill (20260513000004_phase_d_backfill_legacy_match_only_messages.sql)
-- and the operator's manual cleanup of unsalvageable rows, the production
-- audit returned:
--
--   SELECT count(*) FROM public.messages
--   WHERE conversation_id IS NULL;                       -- 0
--
--   SELECT count(*) FROM public.messages
--   WHERE match_id IS NOT NULL AND conversation_id IS NULL;   -- 0
--
-- Every visible message is now reachable via the modern
-- conversation_id branch. Two policies on public.messages still
-- reference match_id and are dropped here:
--
--   1. "Users can view match messages" — legacy single-branch SELECT
--      policy. Pure `EXISTS … FROM matches WHERE matches.id =
--      messages.match_id` lookup. Has no conversation_id path. Dead.
--
--   2. "Users can view messages in their conversations" — canonical
--      conversation_id-based SELECT policy with a defensive `OR EXISTS
--      … FROM matches` fallback. Rewritten to drop the OR-branch.
--
-- App code already filters reads/writes on `conversation_id` only:
--   * apps/mobile/app/chat/[id].tsx:99,172,198 (select),
--     :247-251 (insert with `{ conversation_id, sender_id, content }`)
--   * apps/web/src/components/ChatThread.tsx:260-261 (select),
--     :365 (insert with `{ conversation_id, … }`)
-- Therefore no app-side change is required by this migration.
--
-- What this migration explicitly does NOT touch:
--   * messages.match_id column                  (kept for now — pass-2)
--   * messages_match_id_fkey FK constraint      (kept for now — pass-2)
--   * idx_messages_match / idx_messages_unread /
--     idx_messages_match_read indexes           (kept for now — pass-2)
--   * the matches table                          (Phase E)
--   * notification_preferences.newMatches        (live UI contract)
--   * any INSERT/UPDATE/DELETE policy on messages (only the canonical
--     INSERT policy is `match_id`-free; the legacy
--     "Users can send messages" INSERT was already dropped by
--     20260428000002_conversations_first.sql §4)
--
-- Rollback:
--   Re-apply the prior policy definitions verbatim:
--     * "Users can view messages in their conversations" with the
--       OR-branch as defined in
--       supabase/migrations/20260428000002_conversations_first.sql
--       lines 149-166.
--     * "Users can view match messages" with the single-branch USING
--       clause from the original DDL (the policy was created in the
--       initial schema and re-created across schema fixups; see
--       grep -rn '"Users can view match messages"' supabase/migrations/).
--   In practice the rollback would also require restoring any rows
--   that depended on the legacy branch — Q2 must be re-verified zero
--   before re-applying this migration after any rollback.
--
-- Idempotency: DROP POLICY IF EXISTS + CREATE POLICY (not idempotent
-- alone) means a clean re-run on a DB that already has pass-1 applied
-- would fail at CREATE POLICY ("policy already exists"). The DROPs
-- before the CREATE keep it forward-only safe on a single apply.
--
-- Risk: low. Subtractive RLS change only. The remaining canonical
-- SELECT policy matches the exact predicate that all app SELECT call
-- sites already use, so chat reads are unchanged for every row that
-- has a conversation_id.

begin;

-- 1. Drop the legacy single-branch policy. It has no value once the
--    canonical conversation_id-based path is the only one.
DROP POLICY IF EXISTS "Users can view match messages" ON public.messages;

-- 2. Replace the canonical policy with a conversation_id-only version.
--    The prior definition (with the OR-branch on matches) lived in
--    20260428000002_conversations_first.sql lines 149-166.
DROP POLICY IF EXISTS "Users can view messages in their conversations"
  ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

commit;
