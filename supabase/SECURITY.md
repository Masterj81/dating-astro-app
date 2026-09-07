# Supabase security posture & accepted lint exceptions

Living document. Updated 2026-05-14 — added
`mark_conversation_messages_read` to the accepted `0029` exceptions.
Previously updated 2026-04-27 after Phase 1 → Phase 3-B closure of the
`public.profiles` data leak.

## Architecture in one paragraph

Anon role has no SELECT on any business table — `pg_graphql` no longer
introspects them, REST does not return them. Authenticated callers can
read `public.profiles` but only the public subset of columns; sensitive
fields (`email`, `birth_*`, `push_token`, `notification_preferences`,
`referred_by`) are blocked at the column level (Phase 3-C, gated). Self-
reads of those go through `public.get_my_full_profile()` (SECURITY
DEFINER, `auth.uid()` internal). Other-user views of natal/synastry data
go through the `get-profile-chart` edge function which reads the target
via service_role and returns a sanitized chart only — never raw birth
fields.

## Accepted exceptions

### Lint `0029_authenticated_security_definer_function_executable`

The `SECURITY DEFINER` functions below are intentionally callable by the
`authenticated` role via `/rest/v1/rpc/<name>`. Each one is the only
client-facing API for its capability and carries a strict `auth.uid()`
guard (or rejects when `auth.uid()` does not match the requested user).
Switching them to `SECURITY INVOKER` would force opening the underlying
tables to `authenticated`, which is exactly what we are protecting
against.

| Function | Guard | Why client-facing |
|---|---|---|
| `get_effective_subscription(uuid)` | `auth.uid() <> p_user_id → unauthorized` | Mobile/web subscription state |
| `get_user_tier(uuid)` | service_role bypass + uid match | Premium gating |
| `get_referral_stats(uuid)` | uid match | Account/referrals UI |
| `get_discoverable_profiles(uuid, int)` | uid match | Discover screen |
| `get_user_matches(uuid)` | uid match | Matches list |
| `increment_feature_usage(uuid, text)` | uid match | Premium feature counter |
| `enforce_premium_feature(text)` | uses `auth.uid()` (no param) | Atomic premium gate, called before each premium render |
| `can_use_premium_feature(text)` | uses `auth.uid()` | Read-only counterpart of above |
| `claim_push_token(uuid, text)` | strict `auth.uid() = p_user_id` | Legacy single-row push token |
| `claim_push_token_v2(text, text, text)` | uses `auth.uid()` | Per-device push token, primary path |
| `clear_push_token_v2(text)` | uses `auth.uid()` | Mobile logout |
| `mark_conversation_messages_read(uuid)` | conversation membership check (`auth.uid()` is `user_a`/`user_b`) | Chat read receipts — `messages` UPDATE stays locked down; the RPC writes only `is_read`/`read_at` on the *other* participant's rows |
| `can_view_profile_chart(uuid)` | **no viewer parameter** — the viewer is `auth.uid()` | May this reader open another profile's astrological reading? Called by the `get-profile-chart` edge function with the CALLER's JWT (added 2026-09-07, JUNO-02) |

`public.profile_chart_visible(uuid, uuid)` is the predicate behind that
wrapper and is **not** client-callable: it takes a viewer id as a parameter,
which is exactly the shape a caller must not be able to supply. It is shared
with `get_synastry_candidate_profiles` so the picker and the reader cannot
disagree about who is visible.

### Tables the clients only ever read

Revoking the privilege beats narrowing the policy: a policy is consulted only
when the privilege exists, so a REVOKE makes the whole class of mistake
unreachable rather than correctly handled. Enforced in the repository by
`npm run validate:rls-contract`, and provable on the live database with the
query that validator prints.

| Table | Client privileges | Why |
|---|---|---|
| `messages` | SELECT, INSERT | UPDATE/DELETE/TRUNCATE revoked 2026-09-07 (`20260907000002`, JUNO-08). The inherited UPDATE policy had no `WITH CHECK`, so a sender could rewrite the content of a message already delivered and read, or move it into another of their conversations. Read receipts go through `mark_conversation_messages_read`. |
| `conversations` | SELECT | Rows are created by `get_or_create_conversation`; `last_message_at` is kept by trigger. Revoked 2026-09-03 (`20260903000001`). |
| `discoverable_profiles` | SELECT | An auto-updatable view is a second write path to `profiles`. Revoked 2026-09-03. |
| `premium_usage` | SELECT | A quota its own subject can reset is not a quota. Revoked 2026-08-23 (`20260823000001`). |
| `product_events`, `security_posture_alerts` | none | RLS with no policies; written only by SECURITY DEFINER RPCs. |

`tier_at_least(text, text)` is `SECURITY INVOKER` and pure (no table
access); it stays callable by anon/authenticated as a string comparison
helper.

These exceptions are reviewed each time a new RPC is added. The
default for new RPCs is **not** to be exposed to `authenticated` — see
the `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE … FROM PUBLIC` in
`20260427000011_revoke_internal_functions_from_public.sql`.

## Phase 3-C — gated migration

`20260427000040_phase3c_revoke_sensitive_columns_PENDING.sql` revokes
column-level SELECT on the sensitive `profiles` columns from
`authenticated`. It is gated behind a deadman switch:

```sql
SET LOCAL app.phase3c_ready = 'true';
```

**Do not apply** until both web and mobile clients carrying the Phase
3-B refactor have been deployed and validated for at least 48h. Old
clients calling `from('profiles').select('email,...')` will hit
`permission denied for column …` after this migration.

Rollback (one statement):

```sql
GRANT SELECT (email, birth_date, birth_time, birth_latitude,
              birth_longitude, birth_chart, push_token,
              notification_preferences, referred_by)
  ON public.profiles TO authenticated;
```

## Operational checklist before applying 3-C

- [ ] Web build deployed (Vercel) with `apps/web/src/components/SynastryOverview.tsx`, `AccountSetupForm`, `AccountProfileWorkspace`, `NatalChartOverview`, `DatePlannerOverview` on the new RPC/edge function paths
- [ ] Mobile build released to App Store + Play Store, ≥ ~90% of active users updated (or version-gated kill switch in place)
- [ ] No errors with tag `auth-storage` in Sentry for at least 48h (rules out the SecureStore 2KB regression for accounts with large session payloads)
- [ ] Smoke test: discover → /match/[id] → date-planner → synastry, account/setup/onboarding, settings/notification preferences

## Known residual risks

1. **Mobile `profiles.push_token` legacy column still readable via UPDATE path** in `apps/mobile/services/notifications.ts`. Migration to `push_tokens` table via `claim_push_token_v2` is in progress; once the legacy code path is removed we can drop the column.
2. **Web localStorage tokens vulnerable to XSS**. Tracked as P2 — fix requires a Next.js BFF + httpOnly cookies session table. See comment in `apps/mobile/services/supabase.ts`.
3. **Provider token size on mobile**. iOS Keychain ~2KB per item. We now log to Sentry (`auth-storage` tag) when `SecureStore.setItem` fails. If the pattern shows up for real users, fall back to AsyncStorage for oversize sessions.
