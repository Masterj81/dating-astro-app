-- ============================================================
-- Phase D pre-step: backfill legacy match-only messages
-- ============================================================
--
-- Production audit results (2026-05-13):
--   SELECT count(*) FROM public.messages
--   WHERE conversation_id IS NULL;
--   -- 5
--
--   SELECT count(*) FROM public.messages
--   WHERE match_id IS NOT NULL AND conversation_id IS NULL;
--   -- 5
--
-- These 5 rows are the residue from the original conversation-first
-- backfill in 20260428000002_conversations_first.sql §3, which
-- intentionally skipped two categories that violate the new
-- conversations invariants:
--
--   1. Self-matches (matches.user1_id = matches.user2_id) — these
--      violate the conversations_ordered_users CHECK (user_a < user_b)
--      strict-inequality constraint. No conversation row can ever exist
--      for them.
--
--   2. Orphan-user matches — matches whose user1_id or user2_id no
--      longer exists in public.profiles (the legacy matches FK did not
--      have ON DELETE CASCADE wired symmetrically). The conversations
--      FK to profiles is enforced, so these cannot be inserted either.
--
-- The Phase D pass-1 migration (drop the legacy match_id OR-branch from
-- the messages SELECT RLS) cannot ship while any such row exists —
-- removing the OR-branch would silently hide those messages from the
-- only readers that can still see them. This migration is therefore
-- the gate: salvage whatever can be wired to a conversation, and
-- raise a NOTICE for anything that cannot be salvaged so the operator
-- can decide whether to delete it manually or accept the table-level
-- unreachability before Phase D pass-1.
--
-- After this migration runs, the operator should re-run validation
-- Query 2 from docs/legacy-matches-retirement-plan.md:
--
--   SELECT count(*) AS messages_match_only
--   FROM public.messages
--   WHERE match_id IS NOT NULL AND conversation_id IS NULL;
--
-- If it returns 0, Phase D pass-1 RLS rewrite is unblocked. If > 0,
-- the remaining rows are by construction unreachable via the modern
-- conversation_id path and must be deleted (or accepted as silently
-- hidden) before pass-1 ships.
--
-- This migration explicitly does NOT:
--   * touch messages.match_id (column kept — Phase D pass-2)
--   * touch any RLS policy (Phase D pass-1, gated on remaining = 0)
--   * touch the matches table (Phase E)
--   * touch notification_preferences.newMatches (live UI contract)
--   * delete any orphan / self-match row (operator-only decision)
--
-- The migration is idempotent. A clean run on a DB that already has
-- conversation_id wired for every salvageable row is a no-op (the
-- INSERT respects ON CONFLICT DO NOTHING on (user_a, user_b), and the
-- UPDATE is scoped to messages where conversation_id IS NULL).
--
-- Rollback (only the salvaged rows; the unsalvageable rows are
-- untouched anyway):
--   -- Identify the messages this migration wired up and revert.
--   UPDATE public.messages SET conversation_id = NULL
--   WHERE id IN ( /* ids reported in fixed_count below */ );
--   -- The conversations rows created here are harmless to leave even
--   -- after a rollback (RLS-gated, no UI affordance creates them).

begin;

DO $$
DECLARE
  before_total       INTEGER;
  fixed_count        INTEGER;
  self_remaining     INTEGER;
  orphan_remaining   INTEGER;
  no_match_remaining INTEGER;
  after_total        INTEGER;
BEGIN
  -- ---- Snapshot before ----
  SELECT count(*) INTO before_total
  FROM public.messages
  WHERE conversation_id IS NULL;

  RAISE NOTICE
    'Phase D backfill: pre-state — % message rows with conversation_id IS NULL',
    before_total;

  -- ---- Step 1: insert missing conversations for salvageable matches ----
  -- Mirrors 20260428000002_conversations_first.sql §3 but scoped only to
  -- matches that still have orphan messages. The defensive filters
  -- (user1 <> user2, profile existence on both sides) are intentionally
  -- the same so we never violate conversations_ordered_users or the
  -- conversations → profiles FKs.
  INSERT INTO public.conversations (user_a, user_b, last_message_at, created_at)
  SELECT LEAST(m.user1_id, m.user2_id),
         GREATEST(m.user1_id, m.user2_id),
         m.last_message_at,
         COALESCE(m.matched_at, m.created_at, NOW())
  FROM public.matches m
  WHERE m.id IN (
    SELECT DISTINCT msg.match_id
    FROM public.messages msg
    WHERE msg.conversation_id IS NULL
      AND msg.match_id IS NOT NULL
  )
    AND m.user1_id <> m.user2_id
    AND EXISTS (SELECT 1 FROM public.profiles p1 WHERE p1.id = m.user1_id)
    AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = m.user2_id)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  -- ---- Step 2: wire each salvageable orphan message to its conversation ----
  WITH fixed AS (
    UPDATE public.messages msg
    SET conversation_id = c.id
    FROM public.matches m
    JOIN public.conversations c
      ON c.user_a = LEAST(m.user1_id, m.user2_id)
     AND c.user_b = GREATEST(m.user1_id, m.user2_id)
    WHERE msg.match_id = m.id
      AND msg.conversation_id IS NULL
      AND m.user1_id <> m.user2_id
      AND EXISTS (SELECT 1 FROM public.profiles p1 WHERE p1.id = m.user1_id)
      AND EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = m.user2_id)
    RETURNING msg.id
  )
  SELECT count(*) INTO fixed_count FROM fixed;

  RAISE NOTICE
    'Phase D backfill: % messages successfully wired to a conversation',
    fixed_count;

  -- ---- Step 3: diagnose what (if anything) remains ----
  -- 3a. Self-matches: user1 = user2. Cannot map to a conversation.
  SELECT count(*) INTO self_remaining
  FROM public.messages msg
  JOIN public.matches m ON m.id = msg.match_id
  WHERE msg.conversation_id IS NULL
    AND m.user1_id = m.user2_id;

  -- 3b. Orphan-user matches: at least one referenced profile is gone.
  SELECT count(*) INTO orphan_remaining
  FROM public.messages msg
  JOIN public.matches m ON m.id = msg.match_id
  WHERE msg.conversation_id IS NULL
    AND m.user1_id <> m.user2_id
    AND (
      NOT EXISTS (SELECT 1 FROM public.profiles p1 WHERE p1.id = m.user1_id)
      OR
      NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = m.user2_id)
    );

  -- 3c. No-match-row remaining: defensive. The messages.match_id FK to
  -- matches.id is RESTRICT, so this bucket should always be 0 unless
  -- the row's match_id is NULL (which would mean the row never had a
  -- conversation_id either — a true ghost).
  SELECT count(*) INTO no_match_remaining
  FROM public.messages msg
  WHERE msg.conversation_id IS NULL
    AND (
      msg.match_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = msg.match_id)
    );

  RAISE NOTICE
    'Phase D backfill: remaining buckets — self-match: %, orphan-user: %, no-match: %',
    self_remaining, orphan_remaining, no_match_remaining;

  -- ---- Snapshot after ----
  SELECT count(*) INTO after_total
  FROM public.messages
  WHERE conversation_id IS NULL;

  RAISE NOTICE
    'Phase D backfill: post-state — % message rows with conversation_id IS NULL',
    after_total;

  -- ---- Sanity reconciliation ----
  IF after_total = (self_remaining + orphan_remaining + no_match_remaining) THEN
    RAISE NOTICE
      'Phase D backfill: OK — every remaining null is accounted for by a known unsalvageable bucket. Operator decides whether to delete those rows before Phase D pass-1 ships.';
  ELSE
    RAISE WARNING
      'Phase D backfill: UNEXPECTED — % null rows remain but only % accounted for by known buckets. Investigate before proceeding to Phase D pass-1.',
      after_total,
      (self_remaining + orphan_remaining + no_match_remaining);
  END IF;
END $$;

commit;
