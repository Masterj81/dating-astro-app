-- ============================================================
-- Phase B: Drop the unused get_user_matches RPC
-- ============================================================
--
-- Product status:
--   The conversation-first migration (20260428000002) introduced
--   get_user_conversations() which the chat tab now consumes. The
--   legacy get_user_matches(uuid) RPC powered the retired matches tab
--   and is no longer referenced by any client.
--
-- Audit (callers across the codebase):
--   grep -rn "get_user_matches" apps/                  → 0 hits
--   grep -rn "getUserMatches"   apps/                  → 0 hits
--   grep -rn "get_user_matches" supabase/functions/    → 0 hits
--   grep -rn "get_user_matches" docs/                  → 0 hits
--   Hits in supabase/migrations/ are DDL definitions and historical
--   search_path / auth-guard fixes; none invoke the function.
--
-- What this migration drops:
--   - public.get_user_matches(uuid) — the RPC, all overloads.
--
-- What this migration does NOT touch:
--   - `matches` table             (kept; Phase E)
--   - `messages.match_id` column  (kept; Phase D)
--   - `get_user_conversations()`  (the live conversation-first RPC)
--
-- Rollback:
--   The current function body lives in
--   supabase/migrations/20260504000001_secure_user_facing_rpcs.sql
--   (lines 22–65). To restore, copy that CREATE OR REPLACE FUNCTION
--   block plus the GRANT in 20260427000022_revoke_anon_from_user_facing_rpcs.sql
--   into a new forward migration. The RPC has no callers, so rollback
--   would be exclusively about restoring API surface area, not data.
--
-- Deployment order:
--   This RPC has zero callers in apps/ as of the audit, so the order
--   "migrate first, then ship code" simplifies to "migrate". No
--   accompanying app code change is required.
--
-- Risk: low. The function is reachable only by direct PostgREST calls
--   that we can prove the clients no longer make. If a third-party
--   integration somewhere still calls it, they will receive
--   PGRST202 (function not found) — recoverable by the rollback above.

begin;

DROP FUNCTION IF EXISTS public.get_user_matches(uuid);

commit;
