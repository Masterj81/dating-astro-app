# Legacy `matches` retirement plan

Status: in progress. Phases A + B + C shipped on 2026-05-12. Phases
D + E are documented here for a future maintenance pass and require
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

## Phase C — shipped (2026-05-12)

Edge-function cleanup. Code-only; ships with the next edge-function
deploy (`supabase functions deploy send-email send-notification`).

Removed:
1. `supabase/functions/send-email/index.ts`
   - `newMatchEmail()` helper (lines 107–131).
   - `new_match:` template registration in the `TEMPLATES` dispatcher
     (lines 220–225).
   - The `if (template === "new_match")` `newMatches` preference
     short-circuit (lines 311–319). It was unreachable once the
     template entry was removed.
2. `supabase/functions/send-notification/index.ts`
   - `match: "newMatches"` and the legacy `newMatches: "newMatches"`
     alias in `TYPE_TO_PREF_KEY` (no live caller dispatches
     `type: "match"` or `type: "newMatches"` since Phase A dropped
     `notify_new_match`).
   - `match: "matches"` and `newMatches: "matches"` rows in
     `TYPE_TO_CHANNEL`.

Intentionally kept (load-bearing, do not touch in a future pass):
- `notification_preferences.newMatches` JSON key on profiles. Mobile
  Settings → Notifications still reads / writes this column under
  the "New connections" label. The JSON key is the schema contract;
  the now-removed notification dispatch branch was only one of its
  consumers.
- All chat / `newMessages` / `message` notification branches in
  `send-notification`. These are live (`messages` table INSERT
  triggers still fire them).

Validation:
- `grep -rn "new_match" supabase/functions/` returns zero hits.
- `grep -rn "newMatches" supabase/functions/` returns zero hits.
- `grep -rn "newMatches" apps/mobile/app/settings/` still resolves
  to the live preference key (read + write) and the `"newMatches"`
  i18n label across `apps/mobile/locales/*.json`.

## Phase D pass-1 — shipped + verified in prod (2026-05-13)

`supabase/migrations/20260513000005_phase_d_pass1_drop_match_id_messages_rls.sql`

Production audit after the Phase D pre-step backfill plus operator
cleanup of the 5 unsalvageable orphan rows returned:

| Query | Result |
|-------|--------|
| `SELECT count(*) FROM public.messages WHERE conversation_id IS NULL;` | **0** |
| `SELECT count(*) FROM public.messages WHERE match_id IS NOT NULL AND conversation_id IS NULL;` | **0** |

Both gating conditions met → pass-1 applied.

Post-deployment validation against production (2026-05-13):

| Check | Result |
|-------|--------|
| **A.** RLS policies on `messages` still referencing `match_id` | **0 rows** |
| **B.** `"Users can view messages in their conversations"` USING clause | Only references `public.conversations` (no `matches` OR-branch) |
| **C.** Chat-read smoke check, both participants | Confirmed |

Pass-1 is fully verified. Soak the change for one release cycle
before scheduling pass-2. The migration drops:

- `"Users can view match messages"` — legacy single-branch SELECT
  policy with no conversation_id path. Removed entirely.
- `"Users can view messages in their conversations"` — recreated
  without the OR-branch on `matches`. Reads now flow exclusively
  through the conversation_id path.

What pass-1 explicitly did NOT touch:
- `messages.match_id` column (pass-2)
- `messages_match_id_fkey` FK constraint (pass-2)
- `idx_messages_match` / `idx_messages_unread` / `idx_messages_match_read`
  indexes (pass-2)
- the `matches` table (Phase E)
- `notification_preferences.newMatches` (live UI contract)
- any INSERT/UPDATE/DELETE policy on `messages` (the canonical INSERT
  was already `match_id`-free since 20260428000002 §4)

App code requires no change — both `apps/mobile/app/chat/[id].tsx` and
`apps/web/src/components/ChatThread.tsx` already SELECT and INSERT
exclusively by `conversation_id`.

### Post-deployment validation (run against staging then prod)

```sql
-- A. Re-confirm no policy on messages still references match_id.
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'messages'
  AND (qual::text LIKE '%match_id%' OR with_check::text LIKE '%match_id%');
-- Expected: 0 rows.

-- B. Confirm the canonical SELECT policy is conversation_id-only.
SELECT policyname, qual::text AS using_clause
FROM pg_policies
WHERE tablename = 'messages'
  AND policyname = 'Users can view messages in their conversations';
-- Expected: USING clause references only public.conversations.

-- C. Chat read smoke check — pick a known conversation_id and confirm
-- both participants can still SELECT messages. Run as each participant
-- via the Supabase Studio "Run as user" feature, or via app smoke test.
```

### Rollback (pass-1)

If chat reads regress for any participant, re-apply the prior two
policies verbatim:

```sql
begin;

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
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id
        AND (m.user1_id = auth.uid() OR m.user2_id = auth.uid())
    )
  );

CREATE POLICY "Users can view match messages"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = messages.match_id
        AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
    )
  );

commit;
```

Pass-2 (column / FK / index drop) and Phase E (table drop) remain
separate, future-pass concerns — see the sketches below.

## Phase D pass-2 — deferred: column / FK / index drop

Cannot ship until pass-1 has soaked in production for one release
cycle without chat read regressions. Pass-2 drops `messages.match_id`,
its FK to `matches`, and the three indexes that referenced it.

### Prerequisites before pass-2 can ship

- Phase D pass-1 applied to production and stable.
- Re-run Queries A + B from the pass-1 deployment validation: both
  must show that no policy on `messages` references `match_id`. The
  pass-2 sketch defensively repeats the policy DROPs, so a missed
  pass-1 step would still be caught, but pass-2 is not the place to
  discover an RLS regression.
- No client app version still emits `INSERT INTO messages` with
  `match_id` (verified by grep at the time pass-1 shipped; re-verify
  before pass-2).

### Required validation SQL (re-run before pass-2)

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

### Phase D pass-2 migration sketch (full column drop, do not apply blind)

```sql
begin;

-- Step 1: defensively re-drop the legacy policies in case pass-1 was
-- skipped or rolled back. Pass-1 already removed them; this is belt
-- + suspenders.
DROP POLICY IF EXISTS "Users can view match messages" ON public.messages;
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

## Deployment order (Phase C, separate commit, edge-function deploy)

1. `supabase functions deploy send-email send-notification` against
   staging.
2. Smoke test on staging:
   - Trigger the `welcome`, `onboarding_day1`, `onboarding_day3`,
     `onboarding_day5` email templates — each must still render.
     The removed `new_match` template now returns
     `{ error: "Unknown template: new_match" }` if anything still
     tries to dispatch it (none should).
   - Trigger a chat `message` push and a `dailyHoroscope` push —
     both must still deliver and respect their preference keys.
   - Open mobile Settings → Notifications and toggle "New
     connections" — preference write must still succeed.
3. Promote to production.

## Deployment order (Phase D pre-step, prior commit)

1. Apply `20260513000004_phase_d_backfill_legacy_match_only_messages.sql`
   against staging first. Capture the `RAISE NOTICE` output (Supabase
   CLI streams it; the Studio SQL Editor surfaces it in the result
   pane).
2. Verify on staging:
   - Post-state count from the NOTICE matches the sum of the three
     "remaining" buckets (self-match + orphan-user + no-match) — i.e.,
     the `OK` reconciliation NOTICE printed, not the `WARNING`.
   - `SELECT count(*) FROM public.messages WHERE match_id IS NOT NULL
     AND conversation_id IS NULL;` returns the expected residual
     (0 if all five were salvageable, otherwise the unsalvageable
     subset).
   - Send a new chat message and verify it lands in the modern
     conversation_id path.
3. Promote to production. Re-run Query 2 against prod.
4. If Query 2 > 0, use the diagnostic SQL in the Phase D operator
   playbook to inspect the unsalvageable rows; decide row-by-row
   whether to delete or accept silent unreachability. Re-check
   Query 2 before scheduling pass-1.

## Deployment order (Phase D pass-1, this commit)

Prereq: Phase D pre-step migration applied to prod AND post-cleanup
Query 2 returns 0. (Both confirmed on 2026-05-13.)

1. Apply `20260513000005_phase_d_pass1_drop_match_id_messages_rls.sql`
   against staging.
2. Verify on staging:
   - Query A returns 0 rows (no policy on messages references
     `match_id` any more).
   - Query B confirms the canonical policy's `USING` clause references
     only `public.conversations`.
   - Open a chat thread as each participant and confirm messages still
     load (`apps/mobile/app/chat/[id].tsx` + `apps/web/.../ChatThread`
     both already SELECT by `conversation_id` only).
3. Promote to production and re-run Queries A + B + C.
4. Monitor chat read errors for one release cycle.
5. If a regression appears, apply the rollback SQL in the
   "Rollback (pass-1)" section. Otherwise schedule Phase D pass-2
   (column / FK / index drop) after the soak period.
