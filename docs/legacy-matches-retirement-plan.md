# Legacy `matches` retirement plan

Status: in progress. Phases A + B shipped on 2026-05-12. Phases C–E
are documented here for a future maintenance pass and require
production-side validation before they can ship.

## Context

The product migrated to conversation-first messaging in
`supabase/migrations/20260428000002_conversations_first.sql`. All
user-visible "match" surfaces were retired in commits `30913e4`,
`7674ceb`, `c3cc1b4`, `d2870ce` (web `/app/matches` → `/app/chat`
redirect, mobile `(tabs)/matches` → `(tabs)/chat`, mobile
`/match/[id]` → `/premium-screens/synastry?profileId=`).

The Postgres backend still mounts:
- `matches` table (rows preserved)
- `messages.match_id` column (live RLS fallback)
- `swipes` table (no live writers)
- `notification_preferences.newMatches` JSON key (live; mobile
  Settings → Notifications toggles it as "New connections")

Phases A + B (this commit) removed the unreachable creation /
notification triggers and the unused `get_user_matches` RPC.

## Phase A — shipped (2026-05-12)

`supabase/migrations/20260513000002_retire_unreachable_match_triggers.sql`

Dropped:
- trigger `trigger_check_match` on `public.swipes`
- trigger `trigger_notify_new_match` on `public.matches`
- trigger `trigger_send_match_email` on `public.matches`
- functions `check_and_create_match`, `notify_new_match`,
  `send_match_email`

Audit basis: zero `INSERT INTO swipes` / `INSERT INTO matches` paths
in `apps/` or `supabase/functions/`.

## Phase B — shipped (2026-05-12)

`supabase/migrations/20260513000003_drop_get_user_matches_rpc.sql`

Dropped: `public.get_user_matches(uuid)`. Zero callers anywhere in
`apps/` or `supabase/functions/`.

## Phase C — deferred: edge-function cleanup

Pending work, separate edge-function deploy:

1. `supabase/functions/send-email/index.ts`
   - Remove `newMatchEmail()` helper and the `new_match` template
     entry in the dispatcher (now orphaned — Postgres no longer
     emits this template since Phase A dropped `send_match_email`).
2. `supabase/functions/send-notification/index.ts`
   - Optionally drop `match` / `newMatches` keys from
     `TYPE_TO_PREF_KEY` and `TYPE_TO_CHANNEL`. These are dead
     branches now (no live caller passes `type: "match"` or
     `type: "newMatches"`).
   - Keep `notification_preferences.newMatches` JSON column read
     path — the mobile Settings UI still uses the `newMatches`
     preference label ("New connections"). The schema key is
     load-bearing for UI; the notification branch that consumed it
     is not.

Deferred because: edge functions deploy independently of SQL; this
is housekeeping with no behaviour change. Pair with the next
edge-function deploy.

## Phase D — deferred: `messages.match_id` retirement

Cannot ship without running the validation queries below against
production. Local Supabase migration lint / dry-run is not
available without a connected DB.

### Required validation SQL (run against prod before drafting Phase D)

```sql
-- 1. Are there messages without a conversation_id?
SELECT count(*) AS messages_missing_conversation_id
FROM public.messages
WHERE conversation_id IS NULL;

-- 2. Are there messages where match_id is set but conversation_id
-- is null? These would become invisible if the RLS fallback to
-- match_id is removed.
SELECT count(*) AS messages_match_only
FROM public.messages
WHERE match_id IS NOT NULL AND conversation_id IS NULL;

-- 3. List RLS policies that reference match_id (must be zero for
-- Phase D to drop the column).
SELECT schemaname, tablename, policyname,
       qual::text       AS using_clause,
       with_check::text AS with_check_clause
FROM pg_policies
WHERE qual::text       LIKE '%match_id%'
   OR with_check::text LIKE '%match_id%';

-- 4. List triggers on swipes / matches (Phase A should have left
-- only `trigger_swipe_rate_limit` on swipes; `update_match_last_message`
-- on messages if still wired).
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_table IN ('swipes', 'matches', 'messages')
ORDER BY event_object_table, trigger_name;

-- 5. Foreign keys referencing matches (must be cleared before
-- Phase E can drop the table).
SELECT tc.table_schema, tc.table_name, tc.constraint_name,
       kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'matches';
```

### Decision rule

- Query 1 returns 0 AND Query 2 returns 0 → safe to backfill /
  retire the column.
- Either is non-zero → backfill the legacy rows first (write a
  one-off SQL job that derives `conversation_id` from the
  `(user1_id, user2_id)` ordered pair in `matches`, mirroring the
  algorithm in `20260428000002_conversations_first.sql` §3) and
  re-run.

### Phase D migration sketch (do not apply blind)

```sql
begin;

-- Step 1: rewrite SELECT policy on messages to drop the match_id
-- legacy branch. Conversation_id must be NOT NULL by this point.
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

-- Step 2: make conversation_id required for future inserts.
ALTER TABLE public.messages
  ALTER COLUMN conversation_id SET NOT NULL;

-- Step 3: drop the FK and the column.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_match_id_fkey;
ALTER TABLE public.messages
  DROP COLUMN IF EXISTS match_id;

-- Step 4: drop indexes that referenced match_id (verify they exist
-- before dropping — names below from 00000000000000_full_schema.sql).
DROP INDEX IF EXISTS public.idx_messages_match;
DROP INDEX IF EXISTS public.idx_messages_unread;
DROP INDEX IF EXISTS public.idx_messages_match_read;

commit;
```

Rollback: re-`ALTER TABLE public.messages ADD COLUMN match_id UUID
REFERENCES matches(id)` and re-create the policy with the legacy
fallback from `20260428000002_conversations_first.sql` §4. Data in
`match_id` for historical rows would not survive the drop and would
need to be re-derived from `conversations.user_a/user_b` joined
back to `matches.user1_id/user2_id`.

## Phase E — deferred: drop `matches` table

Only after Phase D ships and no FKs reference `matches` (Query 5).

Caller surface area that still hits the table today:
- `apps/mobile/services/blockingService.ts` — `unmatchUser()` and
  the side-effect UPDATE inside `blockUser()`. Both run `UPDATE
  matches SET status = ...`. Internally only — no UI affordance
  exposes "unmatch" any more, but `BlockReportMenu` still calls it
  defensively when a `matchId` is passed.

Phase E migration sketch:

```sql
begin;

-- Verify zero FKs first (Query 5 above must return 0 rows).

DROP TABLE IF EXISTS public.matches;

commit;
```

Before dropping, retire the `unmatchUser` call sites in
`apps/mobile/services/blockingService.ts` and `BlockReportMenu` —
or rewrite them to soft-disable a conversation instead. Keeping
the table around is zero-cost; only proceed with Phase E if there
is a concrete reason (cleanup audit, lint pass) to remove it.

## Deployment order (Phases A + B, this commit)

1. Run the new SQL migrations in order against staging:
   - `20260513000002_retire_unreachable_match_triggers.sql`
   - `20260513000003_drop_get_user_matches_rpc.sql`
2. Smoke test on staging:
   - Send a message in chat — should still work
     (`get_or_create_conversation` + `messages` INSERT path).
   - Open mobile Settings → Notifications and toggle "New
     connections" — preference write must still succeed
     (`newMatches` JSON key untouched).
   - Block / unblock a user from a chat header — should still
     work (`unmatchUser` UPDATE on `matches` is not affected by
     the trigger drop).
3. Promote to production after staging smoke passes.
4. Phases C and D wait for the prod validation queries above; this
   pass does not deploy any app-code change.
