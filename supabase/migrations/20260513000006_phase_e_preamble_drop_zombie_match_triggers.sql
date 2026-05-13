-- ============================================================
-- Phase E preamble: drop zombie triggers from the legacy match flow
-- ============================================================
--
-- The 2026-05-13 production audit (docs/legacy-matches-retirement-plan.md
-- §"Phase D pass-1 — shipped + verified in prod") surfaced four zombie
-- triggers still wired in pg_catalog despite their corresponding code
-- paths having been retired across Phases A → D pass-1:
--
--   1. trigger_notify_new_match_on_activate  ON matches  AFTER UPDATE
--   2. trigger_send_match_email_on_activate  ON matches  AFTER UPDATE
--   3. trigger_activate_requested_match_on_reply ON messages BEFORE INSERT
--   4. (defensive re-drop) Phase A items that should already be absent
--      after 20260513000002_retire_unreachable_match_triggers.sql, but
--      may persist in a partial-deploy state:
--      - trigger_notify_new_match            ON matches  AFTER INSERT
--      - trigger_send_match_email            ON matches  AFTER INSERT
--      - trigger_check_match                 ON swipes   AFTER INSERT
--
-- Origin of the _on_activate + activate_requested_match_on_reply
-- triggers: the abandoned `message_requests` system (migrations
-- 20260427000041_message_requests.sql, _42, _43), of which only the
-- RPC drop was captured in 20260428000003_drop_message_requests_artifacts.sql.
-- The remaining triggers were left in pg_catalog. Phase A retired
-- their INSERT cousins; this migration retires the UPDATE/BEFORE
-- variants.
--
-- Why these are zombies, not live wiring:
--   - notify_new_match / send_match_email functions were dropped by
--     Phase A. The _on_activate variants either share those functions
--     (and have been silently failing on UPDATE) or reference a
--     similarly-orphaned helper. Either way, dropping the trigger
--     wires removes the dead AFTER hook.
--   - activate_requested_match_on_reply was meant to flip
--     matches.status from 'requested' → 'active' on the first reply.
--     With Phase A out, conversation-first messaging in place since
--     20260428000002, Phase B dropping get_user_matches, and Phase D
--     pass-1 dropping the match-based SELECT RLS, no surface reads
--     matches.status for product logic any more. The trigger is a
--     no-op for new messages (NEW.match_id IS NULL) and an irrelevant
--     side-effect for legacy rows.
--
-- What this migration DOES NOT touch:
--   * trigger_update_match_message + update_match_last_message()
--     function — kept as Phase E preamble alongside the matches table
--     drop. It's a no-op for new messages (NEW.match_id IS NULL → the
--     embedded UPDATE matches WHERE id = NULL matches no rows), but it
--     is operationally tied to matches.last_message_at and is cleaner
--     to retire alongside the table itself.
--   * trigger_swipe_rate_limit — defensive guard kept until swipes is
--     retired.
--   * trigger_message_rate_limit / trigger_notify_new_message /
--     trigger_update_conversation_last_message — all live, all keep.
--   * messages.match_id column — Phase D pass-2.
--   * messages_match_id_fkey — Phase D pass-2.
--   * matches table — Phase E.
--   * notification_preferences.newMatches JSON key — live UI contract.
--   * Backing functions for the dropped triggers — names not in the
--     tracked migration history (created via Supabase Studio for the
--     abandoned message_requests system). Orphan plpgsql functions
--     with no callers are harmless; identifying canonical names for a
--     safe DROP FUNCTION pass is deferred follow-up work.
--
-- Rollback:
--   If a zombie trigger turns out to have a behaviour that some
--   undocumented flow still relies on, re-`CREATE TRIGGER` against
--   the original function name. The function bodies (if they still
--   exist in pg_proc) were not removed by this migration. If a
--   function was already dropped by a prior pass, re-creating the
--   trigger would fail at apply time — surface the gap loudly rather
--   than reintroduce silently broken wiring.
--
-- Idempotency: all DROPs are guarded with IF EXISTS. Re-runs and
-- partial-state DBs are both safe. No CASCADE is used so the failure
-- mode is "trigger absent" → silent success, not "dropped along with
-- unexpected dependent object".
--
-- Risk: low. Subtractive trigger removal only. The functions backing
-- the dropped triggers were already orphan (Phase A) or in a state
-- where their work was a no-op for current-product invariants. No
-- RLS change. No column change. No row mutation.

begin;

-- Block A: Phase E preamble — UPDATE-variant zombies on matches
DROP TRIGGER IF EXISTS trigger_notify_new_match_on_activate
  ON public.matches;
DROP TRIGGER IF EXISTS trigger_send_match_email_on_activate
  ON public.matches;

-- Block B: Phase E preamble — message-requests legacy BEFORE INSERT
DROP TRIGGER IF EXISTS trigger_activate_requested_match_on_reply
  ON public.messages;

-- Block C: defensive re-drop of Phase A triggers in case prod is
--          partial-deployed against 20260513000002.
DROP TRIGGER IF EXISTS trigger_notify_new_match  ON public.matches;
DROP TRIGGER IF EXISTS trigger_send_match_email  ON public.matches;
DROP TRIGGER IF EXISTS trigger_check_match       ON public.swipes;

commit;
