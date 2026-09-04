-- =============================================================================
-- Remove DML nobody uses from two read-only surfaces
-- =============================================================================
--
-- Found by the 3 Sep 2026 security audit. Both findings are the same shape:
-- Supabase's default `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
-- authenticated, service_role` handed out INSERT/UPDATE/DELETE that no client
-- code has ever used, and an RLS policy that was written to answer "can this
-- person see it?" ended up also answering "can this person rewrite it?".
--
-- -----------------------------------------------------------------------------
-- 1) public.conversations — a participant could rewrite the OTHER participant
-- -----------------------------------------------------------------------------
-- `20260428000002_conversations_first.sql:128` creates
--
--     CREATE POLICY "Participants can update conversations"
--       ON public.conversations FOR UPDATE
--       USING (auth.uid() = user_a OR auth.uid() = user_b);
--
-- with no WITH CHECK, so Postgres reuses USING as WITH CHECK. The new row only
-- has to keep the caller as a participant — the OTHER column is free. A
-- participant could therefore run
--
--     UPDATE conversations SET user_b = '<any uuid>' WHERE id = '<their convo>';
--
-- and, because `messages` RLS is gated purely on conversation membership
-- (`20260428000002:149`), hand a stranger the entire history of that thread
-- while evicting the person who actually wrote half of it. `user_a < user_b`
-- and the UNIQUE pair constraint narrow the target space; they do not close it.
--
-- Neither client ever writes here. Both only read:
--     apps/mobile/app/chat/[id].tsx:138   .select('id, user_a, user_b')
--     apps/web/src/components/ChatThread.tsx:249  .select("id, user_a, user_b")
-- Rows are created by `get_or_create_conversation` (SECURITY DEFINER) and
-- `last_message_at` is maintained by trigger — both run as the definer, so
-- neither needs the `authenticated` grant.
--
-- The policy is left in place rather than dropped: with no UPDATE privilege it
-- can never be reached, and deleting a policy makes the intent harder to read
-- later. The privilege is the thing that was wrong.
--
-- -----------------------------------------------------------------------------
-- 2) public.discoverable_profiles — DML on an auto-updatable view
-- -----------------------------------------------------------------------------
-- The view selects from a single table with no DISTINCT, GROUP BY or set
-- operation, which makes it AUTO-UPDATABLE in Postgres: INSERT/UPDATE/DELETE
-- pass through to `public.profiles` for the plain columns. `authenticated`
-- holds all three by default inheritance.
--
-- It is not a demonstrated hole — `security_invoker = true` means the caller's
-- own privileges and RLS on `profiles` still apply, and the profiles UPDATE
-- policy is `auth.uid() = id`. But it is a second, undocumented write path to
-- the most sensitive table in the product, and its safety rests entirely on a
-- layer underneath it. Every reader of this view is a SELECT.
--
-- anon keeps nothing here either: it already has no SELECT (Phase 1), and
-- TRUNCATE/REFERENCES/TRIGGER on a view are inert.
--
-- -----------------------------------------------------------------------------
-- 3) TRUNCATE, REFERENCES, TRIGGER — granted everywhere, and RLS cannot help
-- -----------------------------------------------------------------------------
-- The 2 Sep grants query on discoverable_profiles returned the full ALL set for
-- `authenticated` — SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
-- TRIGGER — even though the migration that created the view issues only
-- `GRANT SELECT ... TO authenticated`. The rest comes from Supabase's default
-- privileges on the `public` schema, which means every real table carries them
-- too. No migration in this repo has ever revoked TRUNCATE.
--
-- That matters more than it looks, because **RLS is not consulted for
-- TRUNCATE**. A policy cannot stop it. `DELETE FROM profiles` is filtered to
-- nothing by RLS; `TRUNCATE profiles CASCADE` would empty the product.
--
-- HOW BAD IS IT, ACTUALLY: not bad today, and the reason is worth writing down
-- so nobody re-derives it under pressure.
--
--   * PostgREST exposes GET/POST/PATCH/DELETE and RPC. There is no TRUNCATE
--     verb, so the privilege is not reachable through the API.
--   * `authenticated` is a NOLOGIN role assumed via JWT. Nobody connects to
--     Postgres as `authenticated` with a password.
--   * The only dynamic SQL in this repo lives in `DO $$` blocks inside
--     migrations, never in a client-callable function, so there is no
--     injection path into a SET ROLE context either.
--
-- So this is defence in depth, not a live hole — a granted capability with no
-- door to it today. It is revoked here anyway, on the two surfaces this file
-- already touches, because it costs nothing and because the door is one
-- careless `EXECUTE format(...)` in a future SECURITY DEFINER function away.
--
-- The same grant almost certainly sits on `profiles`, `messages` and every
-- other table in `public`. That sweep is NOT done here: revoking across the
-- whole schema needs a table-by-table check that nothing legitimate relies on
-- it, and this file is meant to be safe enough to paste today. See
-- docs/security-audit-2026-09.md for the enumeration query.
--
-- NOT DEPLOYED BY THIS FILE. Nine migrations are unrecorded in the remote
-- history while `docs/suivi-supabase-2026-09.md` states several are live, so
-- `supabase db push` would re-run data migrations. Apply this one statement by
-- statement in the SQL editor. See docs/security-audit-2026-09.md §Deployment.

begin;

-- 1) conversations: read-only for clients.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.conversations FROM anon;

COMMENT ON TABLE public.conversations IS
  'One row per pair, user_a < user_b. Client-facing access is SELECT only: rows are created by get_or_create_conversation (SECURITY DEFINER) and last_message_at is maintained by trigger. INSERT/UPDATE/DELETE revoked from authenticated on 2026-09-03 — the UPDATE policy had no WITH CHECK, so a participant could rewrite the other participant and hand a stranger the thread history.';

-- 2) discoverable_profiles: a read surface, not a write path.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.discoverable_profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.discoverable_profiles FROM anon;

commit;

-- Verification and regression checks are NOT commented out at the bottom of
-- this file, because a check you have to un-comment is a check that gets
-- skipped. They live in `docs/security-audit-2026-09.md` (§Vérifications) as a
-- block you can paste whole into the SQL editor and read the output of.
--
-- After applying this, all of these must still work: Discover lists profiles,
-- the conversation list loads, a thread opens, and SENDING A MESSAGE STILL
-- WORKS — that last one exercises the `last_message_at` trigger, which is
-- SECURITY DEFINER (20260428000002:196) and therefore unaffected by these
-- revokes. If sending breaks, that assumption was wrong and it is the finding.
