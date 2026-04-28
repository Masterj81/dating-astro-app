-- 20260428000003_drop_message_requests_artifacts.sql
--
-- Cleanup migration: drop the orphaned RPCs created by the abandoned
-- message_requests transitional system. Three migrations
-- (20260427000041_message_requests.sql, _42, _43) were applied to prod but the
-- approach was abandoned in favor of the conversation-first model introduced
-- in 20260428000002_conversations_first.sql.
--
-- Run order: AFTER 20260428000002 has been applied. Agent 1's
-- get_user_conversations() (no args) has a distinct signature from the
-- abandoned get_user_conversations(p_user_id UUID), so this DROP only removes
-- the obsolete overload — the new RPC stays intact.
--
-- Idempotent: uses IF EXISTS guards. Safe to re-run.
--
-- NOT REVERSED (intentionally left in prod):
--   - matches.requester_id column (if added) — additive, no readers in the
--     new code path, harmless to leave.
--   - matches.status values 'requested' / 'unmatched' / 'draft' (if extended
--     via CHECK) — no writers in the new code path; the rows themselves are
--     invisible to chat (which now reads from conversations).
--   - SECURITY INVOKER conversions from migration 20260427000043 — that pass
--     is independent of message_requests and may still be desirable hardening.
--   - Any helper functions revoked by migration 20260427000042 — REVOKEs are
--     hardening, not roadblocks.

BEGIN;

DROP FUNCTION IF EXISTS public.create_message_request(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_user_conversations(UUID);

COMMIT;
