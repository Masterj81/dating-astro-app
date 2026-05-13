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

## Phase D — in progress: `messages.match_id` retirement

Validation queries were run against production on 2026-05-13. Results:

| # | Query                                                                                                                  | Result |
|---|------------------------------------------------------------------------------------------------------------------------|--------|
| 1 | `SELECT count(*) FROM public.messages WHERE conversation_id IS NULL;`                                                  | **5**  |
| 2 | `SELECT count(*) FROM public.messages WHERE match_id IS NOT NULL AND conversation_id IS NULL;`                          | **5**  |
| 3 | RLS policies referencing `match_id`                                                                                    | 2 rows |
| 4 | Triggers on `swipes` / `matches` / `messages`                                                                          | 11 rows (Phase A dropped only the three creation/notification triggers; see §Triggers below) |
| 5 | FK referencing `matches`                                                                                                | 1 row: `public.messages.messages_match_id_fkey` |

Q2 = 5 → the Phase D pass-1 RLS rewrite is **gated** on a backfill of
those 5 rows. Pass-1 cannot ship while any row has `match_id IS NOT NULL
AND conversation_id IS NULL`, because removing the legacy `match_id`
OR-branch would silently hide them from their participants.

Q3 also surfaced a second policy that still references `match_id`:
`"Users can view match messages"`. Its `USING` clause is `EXISTS (SELECT
1 FROM matches WHERE matches.id = messages.match_id AND ...)` — i.e.,
pure match-based read with no conversation_id branch at all. That
policy must also be dropped during Phase D pass-1 (not just rewritten),
because it has no value once the OR-branch on the canonical conversation
policy is removed.

### Phase D pre-step — shipped (2026-05-13)

`supabase/migrations/20260513000004_phase_d_backfill_legacy_match_only_messages.sql`

The pre-step backfills the 5 orphan messages where possible and
diagnoses each remaining bucket via `RAISE NOTICE`:

- Salvageable: match has `user1_id <> user2_id` AND both profiles still
  exist → INSERT into `conversations` (ordered pair, ON CONFLICT DO
  NOTHING) and UPDATE `messages.conversation_id`.
- Self-match (`user1_id = user2_id`) → unsalvageable; violates the
  `conversations_ordered_users` CHECK constraint.
- Orphan-user (one or both `profiles` rows deleted) → unsalvageable;
  violates the conversations → profiles FK.
- No-match (`match_id IS NULL` or referenced row gone) → defensive
  bucket; should always be 0 given the `messages_match_id_fkey`
  RESTRICT constraint.

The migration explicitly does NOT touch:
- `messages.match_id` column (pass-2)
- any RLS policy (pass-1)
- the `matches` table (Phase E)
- `notification_preferences.newMatches`
- any unsalvageable row (operator-only decision)

### Phase D — what runs next (operator playbook)

After applying `20260513000004_phase_d_backfill_legacy_match_only_messages.sql`
to production:

1. Re-run validation Query 2:
   ```sql
   SELECT count(*) AS messages_match_only
   FROM public.messages
   WHERE match_id IS NOT NULL AND conversation_id IS NULL;
   ```
   - If `0`: Phase D pass-1 (RLS rewrite below) is unblocked.
   - If `> 0`: those rows are by construction unsalvageable (self-match
     or orphan-user). Inspect with the diagnostic SQL below, decide
     whether to delete them or accept silent unreachability, then
     re-check Query 2.

2. Diagnostic SQL — inspect what (if anything) remains unsalvageable:
   ```sql
   SELECT
     msg.id          AS message_id,
     msg.match_id    AS legacy_match_id,
     msg.sender_id   AS sender_id,
     msg.created_at  AS created_at,
     left(msg.content, 80) AS preview,
     m.user1_id      AS match_user1,
     m.user2_id      AS match_user2,
     (m.user1_id = m.user2_id) AS is_self_match,
     (NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user1_id)) AS user1_deleted,
     (NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user2_id)) AS user2_deleted
   FROM public.messages msg
   LEFT JOIN public.matches m ON m.id = msg.match_id
   WHERE msg.conversation_id IS NULL
   ORDER BY msg.created_at;
   ```

3. (Optional) Delete unsalvageable rows. Only do this if the operator
   has confirmed the rows are self-match / orphan-user and will never
   be readable through the modern conversation_id path:
   ```sql
   BEGIN;
     -- Confirm the count before deleting (must match Step 2 output).
     SELECT count(*) FROM public.messages WHERE conversation_id IS NULL;
     DELETE FROM public.messages WHERE conversation_id IS NULL;
   COMMIT;
   ```

4. Run Phase D pass-1 (RLS rewrite — see sketch below). The pass-1
   migration must drop BOTH `"Users can view match messages"` (legacy
   single-branch policy) AND the OR-branch of `"Users can view messages
   in their conversations"` per Q3 results.

5. After pass-1 has been live in production for one release cycle with
   no chat read regressions, schedule Phase D pass-2 (column drop).

### Phase D pass-1 migration sketch (RLS rewrite, column kept) — UNSHIPPED

Ship this once Step 1 above returns 0. It is purely subtractive on the
RLS layer and leaves the `match_id` column, FK, and indexes intact. The
sketch below incorporates the Q3 finding that two policies must change:

```sql
begin;

-- Drop the legacy single-branch policy entirely. It has no value once
-- the canonical conversation_id-based path is the only one.
DROP POLICY IF EXISTS "Users can view match messages" ON public.messages;

-- Rewrite the canonical policy without the match_id OR-branch.
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
```

Rollback: re-create both policies with the OR-branch and the legacy
single-branch policy as defined in
`supabase/migrations/20260428000002_conversations_first.sql` §4 plus
`supabase/migrations/00000000000000_full_schema.sql` (look for the
original `"Users can view match messages"` definition).

### Triggers still wired on `messages` / `matches` (Q4 result)

| Table     | Trigger                                       | Notes |
|-----------|-----------------------------------------------|-------|
| matches   | `trigger_notify_new_match` (AFTER INSERT)     | Phase A dropped the *function*; this row in the audit is stale or the trigger was re-created elsewhere. Re-verify on prod: `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'matches';` and drop any survivor. |
| matches   | `trigger_notify_new_match_on_activate` (AFTER UPDATE) | Same — Phase A did not drop this UPDATE variant. Candidate for Phase E preamble (drop along with `update_match_message`). |
| matches   | `trigger_send_match_email` (AFTER INSERT)     | Phase A dropped this. If still present, re-verify and drop. |
| matches   | `trigger_send_match_email_on_activate` (AFTER UPDATE) | Same as above; Phase A did not target the UPDATE variant. |
| messages  | `trigger_activate_requested_match_on_reply` (BEFORE INSERT) | Legacy; activates a pending match when a reply lands. With `match_id` now nullable and the new INSERT path never setting it, this no-ops on conversation-first messages. Candidate for Phase E preamble. |
| messages  | `trigger_message_rate_limit` (BEFORE INSERT)  | LIVE — keep. |
| messages  | `trigger_notify_new_message` (AFTER INSERT)   | LIVE — keep. |
| messages  | `trigger_update_conversation_last_message` (AFTER INSERT) | LIVE — keep (conversation-first). |
| messages  | `trigger_update_match_message` (AFTER INSERT) | Updates `matches.last_message_at`. Harmless when `match_id IS NULL` (UPDATE matches no rows). Candidate for Phase E preamble. |
| swipes    | `trigger_check_match` (AFTER INSERT)          | Phase A dropped this. If still present, re-verify and drop. |
| swipes    | `trigger_swipe_rate_limit` (BEFORE INSERT)    | Defensive guard — keep until `swipes` table itself is retired. |

Action: Re-run Q4 after deploying the latest Phase A migration to prod
(`20260513000002_retire_unreachable_match_triggers.sql`). If `notify_new_match`,
`send_match_email`, or `check_match` rows reappear, they're from a
fork or partial deploy and need a forward fix. The two `_on_activate`
variants and the two messages-side `trigger_*_match*` triggers are
separately tracked as Phase E preamble items.

### Phase D audit attempt — 2026-05-12 (superseded by the 2026-05-13 prod queries above)

A Phase D-pass-1 attempt — limited to *only* rewriting the
`messages` SELECT policy to drop the legacy `match_id` OR-branch
(without touching the column, FK, or indexes) — was evaluated and
**deferred** for the same root-cause reason that blocks the full
column drop.

Audit confirmed (all live as of this date):

- **Only one** RLS branch on `public.messages` references
  `match_id`: the second OR-branch inside the SELECT policy
  `"Users can view messages in their conversations"`
  (`20260428000002_conversations_first.sql` lines 161-165).
- The matching INSERT policy
  `"Users can send conversation messages"` is already
  `match_id`-free and requires `conversation_id IS NOT NULL`. No
  rewrite needed there.
- App INSERT call sites do **not** write `match_id`:
  - `apps/mobile/app/chat/[id].tsx:247-251` →
    `{ conversation_id, sender_id, content }`.
  - `apps/web/src/components/ChatThread.tsx:365` →
    `{ conversation_id, ... }`.
- App SELECT call sites filter by `conversation_id` only
  (`apps/mobile/app/chat/[id].tsx:99,172,198`,
  `apps/web/src/components/ChatThread.tsx:260-261`).
- `apps/mobile/services/blockingService.ts:58-61, 184-202` still
  runs `UPDATE matches SET status = ...` — Phase E concern only,
  not affected by Phase D RLS work.

Why deferred even for the RLS-only rewrite:

The `20260428000002_conversations_first.sql` migration's own
inline comments (lines 78-83, 95-98) state that orphan / self /
deleted-user matches are deliberately **skipped** by the backfill
and their messages stay readable *via the legacy `match_id`
branch of the SELECT policy*. Removing that branch — even without
dropping the column — would silently hide those rows from their
participants whenever Query 2 below returns > 0.

That outcome is indistinguishable locally from "safe subtractive
change" without production row counts. Per the conservative-wins
rule, we ship documentation only this pass and gate even the
column-keeping RLS rewrite on Query 2 returning 0.

Self-review answers (must all be GREEN before shipping
`<YYYYMMDDHHMMSS>_phase_d_drop_legacy_match_id_messages_rls.sql`):

1. Will any visible message become invisible after this RLS
   change? — UNKNOWN locally. Depends on Query 2 result.
2. Is the migration rollbackable? — YES (re-`CREATE POLICY` with
   the OR-branch restores prior behaviour).
3. Does it touch the `matches` table? — NO.
4. Does it touch `notification_preferences.newMatches`? — NO.
5. Does it touch chat send/read code paths in apps? — NO.
6. Is Phase E (drop table) still independent? — YES.

Blocker: Q1 cannot be answered without prod row counts. **Run
Query 1 + Query 2 below against prod; if both return 0, ship the
RLS-only rewrite from "Phase D pass-1 migration sketch (RLS only,
column kept)" below in a new forward-only migration.**

Superseded note: the original single-policy pass-1 sketch that lived
here is now replaced by the comprehensive sketch in the in-progress
section near the top of this Phase D block, which drops BOTH the
legacy single-branch `"Users can view match messages"` policy AND the
OR-branch on the canonical `"Users can view messages in their
conversations"` policy (per Q3).

### Required validation SQL (re-run after Phase D pre-step applies)

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

-- Step 1: rewrite SELECT policy on messages to drop the match_id
-- legacy branch. Conversation_id must be NOT NULL by this point.
-- Defensively also drop the legacy single-branch policy in case
-- pass-1 was skipped.
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

## Deployment order (Phase D pre-step, this commit)

1. Apply `20260513000004_phase_d_backfill_legacy_match_only_messages.sql`
   against staging first. Capture the `RAISE NOTICE` output (Supabase
   CLI streams it; the Studio SQL Editor surfaces it in the result
   pane).
2. Verify on staging:
   - The post-state count from the NOTICE matches the sum of the
     three "remaining" buckets (self-match + orphan-user + no-match)
     — i.e., the `OK` reconciliation NOTICE printed, not the `WARNING`.
   - `SELECT count(*) FROM public.messages WHERE match_id IS NOT NULL
     AND conversation_id IS NULL;` returns the expected residual (0 if
     all five were salvageable, or the unsalvageable subset otherwise).
   - Send a new chat message and verify it lands in the modern
     conversation_id path (sanity check for the conversation-first RLS,
     not changed by this migration).
3. Promote to production. Re-run Query 2 against prod.
4. If Query 2 returns 0 → Phase D pass-1 RLS rewrite is unblocked
   (use the sketch in the in-progress section of Phase D above).
5. If Query 2 returns > 0 → use the diagnostic SQL in the "what runs
   next" section to inspect the unsalvageable rows. Decide row-by-row
   whether to delete or accept silent unreachability, then re-check
   Query 2 before scheduling pass-1.
