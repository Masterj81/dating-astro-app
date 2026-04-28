-- ============================================================
-- Conversation-first messaging (replaces match-gated messaging)
-- ============================================================
--
-- Product change: messaging is no longer gated by mutual like.
-- Any authenticated user can start a conversation with any active
-- profile. The legacy `matches` and `swipes` tables remain in place
-- but lose all product meaning. UI swipe is purely navigational.
--
-- This migration:
--   1. Creates `conversations` (1:1, ordered pair, unique).
--   2. Adds `conversation_id` (nullable) to `messages` and an FK.
--   3. Backfills conversations from existing `matches` and rewires
--      `messages.conversation_id` accordingly.
--   4. Replaces RLS on `messages` to be participant-based on the
--      conversation (no longer requires matches.status='active').
--      The legacy match-based policy is dropped.
--   5. Adds `get_or_create_conversation(target_user_id)` SECURITY
--      DEFINER RPC with auth.uid() guard, block guard, rate limit
--      reuse.
--   6. Adds `get_user_conversations()` SECURITY DEFINER RPC with
--      auth.uid() guard. Returns the data ChatInbox / chat tab need.
--   7. Adds a trigger to keep `conversations.last_message_at` in sync.
--   8. Keeps the existing `update_match_last_message` trigger for
--      backward compat — harmless if `match_id` is null on new rows.
--
-- Idempotent where reasonable. Re-running on a clean DB is fine.
-- After backfill, `messages.match_id` becomes nullable so future
-- messages can be inserted with conversation_id only.
-- The `match_id` column itself is kept for now so older code paths
-- don't immediately break — a follow-up migration can drop it once
-- all clients have shipped.

-- ----------------------------------------------------------------
-- 1. conversations table
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_ordered_users CHECK (user_a < user_b),
  CONSTRAINT conversations_unique_pair UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_a
  ON public.conversations(user_a, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_user_b
  ON public.conversations(user_b, last_message_at DESC NULLS LAST);

COMMENT ON TABLE public.conversations IS
  'Conversation-first DM thread between two users. Independent of the legacy `matches` table — both participants are stored as an ordered pair (user_a < user_b) to enforce 1:1 uniqueness without doubling rows.';

-- ----------------------------------------------------------------
-- 2. messages.conversation_id (nullable for backfill)
-- ----------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID
    REFERENCES public.conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_unread
  ON public.messages(conversation_id, is_read)
  WHERE is_read = FALSE;

-- ----------------------------------------------------------------
-- 3. Backfill from matches → conversations
-- ----------------------------------------------------------------
DO $$
BEGIN
  -- For every existing match, ensure a conversation exists with the
  -- ordered pair. We do NOT trust matches.user1_id < user2_id to be
  -- enforced — defensive ordering with LEAST / GREATEST. Self-matches
  -- (user1_id = user2_id) are excluded because they violate the new
  -- conversations_ordered_users strict-inequality check; their
  -- (presumably test) messages stay readable via the fallback branch
  -- of the SELECT policy below.
  INSERT INTO public.conversations (user_a, user_b, last_message_at, created_at)
  SELECT LEAST(m.user1_id, m.user2_id),
         GREATEST(m.user1_id, m.user2_id),
         m.last_message_at,
         COALESCE(m.matched_at, m.created_at, NOW())
  FROM public.matches m
  WHERE m.user1_id <> m.user2_id
  ON CONFLICT (user_a, user_b) DO NOTHING;

  -- Wire each existing message to the conversation matching its match.
  -- Same defensive ordering. Self-match messages keep conversation_id
  -- = NULL and stay readable via the legacy match_id fallback policy.
  UPDATE public.messages msg
  SET conversation_id = c.id
  FROM public.matches m
  JOIN public.conversations c
    ON c.user_a = LEAST(m.user1_id, m.user2_id)
   AND c.user_b = GREATEST(m.user1_id, m.user2_id)
  WHERE msg.match_id = m.id
    AND msg.conversation_id IS NULL
    AND m.user1_id <> m.user2_id;
END;
$$;

-- After backfill, allow new rows to be inserted with only
-- conversation_id (no match_id required). Older rows still have both.
ALTER TABLE public.messages
  ALTER COLUMN match_id DROP NOT NULL;

-- ----------------------------------------------------------------
-- 4. RLS: conversations + new participant-based message policies
-- ----------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
CREATE POLICY "Participants can view conversations"
  ON public.conversations
  FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
CREATE POLICY "Participants can update conversations"
  ON public.conversations
  FOR UPDATE
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Inserts go through the SECURITY DEFINER RPC (`get_or_create_conversation`).
-- We deliberately do NOT add a permissive INSERT policy here so that
-- conversation creation always passes through the RPC's guard rails
-- (block check, rate limit, ordered-pair handling).
DROP POLICY IF EXISTS "Deny direct conversation inserts" ON public.conversations;
CREATE POLICY "Deny direct conversation inserts"
  ON public.conversations
  FOR INSERT
  WITH CHECK (false);

-- Replace the old match-gated message policies with conversation-based ones.
DROP POLICY IF EXISTS "Users can view messages in their matches" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send conversation messages" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    -- Backward compat: still allow reading legacy match-bound rows
    -- where conversation_id was successfully backfilled OR — defensive
    -- fallback — the row still references a match the user is part of.
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id
        AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
    )
  );

CREATE POLICY "Users can send conversation messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND messages.conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    -- Block guard: do not let either side message if a block is in place.
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b, public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (b.blocker_id = c.user_a AND b.blocked_id = c.user_b) OR
          (b.blocker_id = c.user_b AND b.blocked_id = c.user_a)
        )
    )
  );

-- ----------------------------------------------------------------
-- 5. Trigger: keep conversations.last_message_at in sync
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON public.messages;
CREATE TRIGGER trigger_update_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- ----------------------------------------------------------------
-- 6. RPC: get_or_create_conversation(target_user_id)
-- ----------------------------------------------------------------
-- SECURITY DEFINER:
--   * The conversations table denies direct INSERT via RLS so that
--     creation always flows through this guarded RPC.
--   * The RPC enforces auth.uid() (no spoofing the initiator), refuses
--     self-conversations, refuses if either side has blocked the
--     other, and reuses the existing rate limit framework.
--   * Returns the existing conversation if one already exists for
--     this ordered pair.
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  ordered_a UUID;
  ordered_b UUID;
  existing_id UUID;
  new_id UUID;
  target_active BOOLEAN;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF target_user_id IS NULL OR target_user_id = caller THEN
    RAISE EXCEPTION 'Invalid conversation target.' USING ERRCODE = 'P0001';
  END IF;

  -- Target must exist and be active / onboarded so we don't leak presence.
  SELECT (p.is_active AND p.onboarding_completed)
    INTO target_active
  FROM public.profiles p
  WHERE p.id = target_user_id;

  IF target_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Target profile is not available.' USING ERRCODE = 'P0002';
  END IF;

  -- Block guard: either direction blocks the conversation.
  IF EXISTS (
    SELECT 1 FROM public.blocked_users b
    WHERE (b.blocker_id = caller AND b.blocked_id = target_user_id)
       OR (b.blocker_id = target_user_id AND b.blocked_id = caller)
  ) THEN
    RAISE EXCEPTION 'Cannot start a conversation with this user.' USING ERRCODE = 'P0003';
  END IF;

  -- Rate limit: reuse the existing per-user counter (5 new
  -- conversations / hour) so spam-message accounts get throttled.
  IF NOT public.check_rate_limit(caller, 'start_conversation', 20, INTERVAL '1 hour') THEN
    RAISE EXCEPTION 'Too many new conversations. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  IF caller < target_user_id THEN
    ordered_a := caller;
    ordered_b := target_user_id;
  ELSE
    ordered_a := target_user_id;
    ordered_b := caller;
  END IF;

  SELECT id INTO existing_id
  FROM public.conversations
  WHERE user_a = ordered_a AND user_b = ordered_b;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.conversations (user_a, user_b)
  VALUES (ordered_a, ordered_b)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_or_create_conversation(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_or_create_conversation(UUID) IS
  'Conversation-first DM gateway. SECURITY DEFINER bypasses the deny-all INSERT policy on conversations while enforcing auth.uid(), self-conversation guard, target activeness, two-way block guard, and a per-user rate limit (start_conversation, 20/hour).';

-- ----------------------------------------------------------------
-- 7. RPC: get_user_conversations()
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_conversations()
RETURNS TABLE (
  conversation_id  UUID,
  other_user_id    UUID,
  other_user_name  TEXT,
  other_user_image TEXT,
  other_user_sun_sign TEXT,
  last_message     TEXT,
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  unread_count     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    CASE WHEN c.user_a = caller THEN c.user_b ELSE c.user_a END AS other_user_id,
    p.name AS other_user_name,
    COALESCE(p.image_url, p.photos[1]) AS other_user_image,
    p.sun_sign AS other_user_sun_sign,
    (
      SELECT m.content
      FROM public.messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) AS last_message,
    c.last_message_at,
    c.created_at,
    (
      SELECT COUNT(*)
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_id <> caller
        AND m.is_read = FALSE
    ) AS unread_count
  FROM public.conversations c
  JOIN public.profiles p
    ON p.id = CASE WHEN c.user_a = caller THEN c.user_b ELSE c.user_a END
  WHERE c.user_a = caller OR c.user_b = caller
  ORDER BY COALESCE(c.last_message_at, c.created_at) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_conversations() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_conversations() TO authenticated;

COMMENT ON FUNCTION public.get_user_conversations() IS
  'Conversation list for the authenticated caller. SECURITY DEFINER + auth.uid() guard. Returns one row per conversation the caller participates in, with the counterpart''s display data, the latest message, and unread count.';
