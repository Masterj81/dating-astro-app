-- ============================================================
-- Phase A: Retire unreachable match creation/notification triggers
-- ============================================================
--
-- Product status:
--   The product migrated to a conversation-first model in
--   20260428000002_conversations_first.sql. The "match" concept has
--   been fully retired from the UI:
--     - mobile (tabs)/matches → (tabs)/chat
--     - mobile /match/[id]    → /premium-screens/synastry?profileId=
--     - web   /app/matches    → /app/chat
--
-- Audit (run prior to this migration):
--   grep -rn "from\('swipes'\)|\"swipes\"" apps/  → 0 hits
--   grep -rn "INSERT INTO (public\.)?swipes"   *  → 0 hits in apps/, only legacy migrations
--   grep -rn "INSERT INTO (public\.)?matches"  *  → 0 hits in apps/ or supabase/functions/
--                                                   (only the trigger function itself
--                                                    and .maestro/seed-matches.sql e2e seed,
--                                                    which is not part of production)
--   grep -rn "from\('matches'\).insert"        *  → 0 hits in apps/
--
--   `apps/mobile/services/blockingService.ts` UPDATEs matches.status
--   (block / unmatch), which fires no AFTER INSERT trigger. No code
--   path can produce an INSERT into either `swipes` or `matches`.
--
-- What this migration drops:
--   - trigger trigger_check_match    ON public.swipes
--     (fired check_and_create_match — would insert a `matches` row when
--      a mutual like landed; unreachable because nothing inserts swipes)
--   - trigger trigger_notify_new_match ON public.matches
--     (fired notify_new_match — push notification via net.http_post to
--      send-notification edge function; unreachable because nothing
--      inserts matches)
--   - trigger trigger_send_match_email ON public.matches
--     (fired send_match_email — email via net.http_post to send-email
--      edge function with `new_match` template; same unreachability)
--   - functions check_and_create_match(), notify_new_match(),
--     send_match_email() — only callers were the three triggers above.
--
-- What this migration does NOT touch:
--   - `matches` table              (kept; legacy data preserved, Phase E)
--   - `messages.match_id` column   (kept; live RLS fallback, Phase D)
--   - `swipes` table               (kept; historical data preserved)
--   - `get_user_matches` RPC       (separately dropped in 20260513000003)
--   - `send-email` `new_match` template (orphaned but harmless;
--      removing it is a separate edge-function deploy concern)
--   - `notification_preferences.newMatches` JSON key (still toggled by
--      mobile settings UI as "New connections", will be re-purposed)
--   - `send-notification` TYPE_TO_PREF_KEY mapping for `match` /
--     `newMatches` (dead branch, harmless until edge functions are
--     redeployed; tracked in Phase C plan)
--
-- Rollback:
--   The function bodies are preserved in:
--     - supabase/migrations/00000000000000_full_schema.sql (initial DDL)
--     - supabase/migrations/20260423_fix_notify_new_match_search_path.sql
--     - supabase/migrations/20260320_fix_swipe_triggers_search_path.sql
--   To restore, re-run those files (or copy the CREATE OR REPLACE
--   FUNCTION ... + CREATE TRIGGER blocks into a new forward migration).
--
-- Risk: low. If the audit assumption is violated and some unknown
--   path inserts into swipes/matches in production, the only behavioural
--   change is that a stale push notification + email will no longer
--   fire. No row reads/writes change. No RLS change.

begin;

-- Triggers first, then their functions (CASCADE not used — explicit
-- order keeps the failure mode obvious if either object has already
-- been dropped).
DROP TRIGGER IF EXISTS trigger_check_match       ON public.swipes;
DROP TRIGGER IF EXISTS trigger_notify_new_match  ON public.matches;
DROP TRIGGER IF EXISTS trigger_send_match_email  ON public.matches;

DROP FUNCTION IF EXISTS public.check_and_create_match();
DROP FUNCTION IF EXISTS public.notify_new_match();
DROP FUNCTION IF EXISTS public.send_match_email();

commit;
