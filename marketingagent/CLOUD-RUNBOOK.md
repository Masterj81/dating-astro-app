# Cloud-scheduled publishing — Step 1 runbook

Goal: queue marketing posts that get published **even when your laptop is off**.

The local dashboard (`npm run dashboard`) keeps working as a fallback. The two
paths are independent and won't double-publish.

## What's in place

| Component | Where | What it does |
|---|---|---|
| Table `public.marketing_posts` | [supabase/migrations/20260331_scheduled_marketing_posts.sql](../supabase/migrations/20260331_scheduled_marketing_posts.sql) | Holds rows with `status in (scheduled, posted, failed)` |
| Edge function `publish-scheduled-posts` | [supabase/functions/publish-scheduled-posts/index.ts](../supabase/functions/publish-scheduled-posts/index.ts) | Reads `status='scheduled' AND scheduled_for <= now()`, posts to Blotato, updates the row |
| `pg_cron` job `publish-scheduled-posts` | [supabase/migrations/20260413_publish_scheduled_posts_cron.sql](../supabase/migrations/20260413_publish_scheduled_posts_cron.sql) and [20260419000005_rotate_cron_secrets.sql](../supabase/migrations/20260419000005_rotate_cron_secrets.sql) | Hits the edge function every 5 minutes |
| Local push helper | [marketingagent/cloud-scheduler.ts](cloud-scheduler.ts) | `scheduleInCloud`, `listCloudQueue`, `syncCloudBackToLocal` |
| Local CLI | [marketingagent/agent.ts](agent.ts) | `cloud-schedule`, `cloud-list`, `cloud-sync` |

## One-time setup (Supabase project)

These are infra steps to run **once** by an operator with project access. Skip
this if your project is already in production — these were already deployed.

1. **Apply the migrations** (already in git): `supabase db push` (or via the
   Supabase Dashboard SQL editor).
2. **Set the edge function secrets** so the function can call Blotato:
   ```
   supabase secrets set \
     BLOTATO_API_KEY="..." \
     BLOTATO_FB_ACCOUNT_ID="..." \
     BLOTATO_IG_ACCOUNT_ID="..." \
     BLOTATO_FB_PAGE_ID="..." \
     SCHEDULED_POSTS_SECRET="$(openssl rand -hex 32)"
   ```
3. **Deploy the function**: `supabase functions deploy publish-scheduled-posts`
4. **Rotate the cron secret** in the vault (one-shot SQL — see header comment in
   [20260419000005_rotate_cron_secrets.sql](../supabase/migrations/20260419000005_rotate_cron_secrets.sql)).
5. **Verify pg_cron is registered**:
   ```sql
   select * from cron.job where jobname = 'publish-scheduled-posts';
   ```

## Daily use (you, the marketer)

### Required local env (`marketingagent/.env`)

In addition to your usual keys:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
```

The service role key only ever leaves your machine via direct Supabase
requests — the marketing agent doesn't expose it on a port.

### Schedule a post for cloud publishing

```bash
# Push post #21 into the Supabase queue at the next 11/12/19/20 slot.
npm run agent -- cloud-schedule 21 next

# Or pick an explicit time (local time on your machine).
npm run agent -- cloud-schedule 21 "tomorrow 19:00"
npm run agent -- cloud-schedule 21 "2026-04-25 11:00"
```

Behaviour:
- Inserts a row into `marketing_posts (status='scheduled')`.
- Marks the local post in `posts.json` with `scheduledServerId=<uuid>`.
- The dashboard now shows the post with a `☁️ cloud` badge and **disables
  the local "Publier maintenant" / "Planifier" buttons** — see the guard in
  [dashboard.html](dashboard.html) and the matching server-side 409 in
  [dashboard.ts](dashboard.ts).
- A second `cloud-schedule` on the same post will refuse (idempotency guard)
  unless you delete the local `scheduledServerId` first.

### Inspect the cloud queue

```bash
# 30 most recent rows.
npm run agent -- cloud-list

# Filter by status.
npm run agent -- cloud-list scheduled
npm run agent -- cloud-list posted
npm run agent -- cloud-list failed
```

### Pull cloud status back into the dashboard

`pg_cron` updates Supabase but not your local `posts.json`. Run:

```bash
npm run agent -- cloud-sync
```

…and the local statuses (`posted`, `failed`, `blotato.postedAt`,
`blotato.error`) catch up. Safe to run as often as you want — only touches
posts that have a `scheduledServerId`.

## How the two paths coexist

| Scenario | Path that handles it |
|---|---|
| Click "Planifier" in dashboard | Local — queues directly in Blotato (`useNextFreeSlot`) |
| Click "Choisir date et heure" in dashboard | Local — direct Blotato `scheduledTime` |
| Click "Publier maintenant" in dashboard | Local — direct Blotato POST |
| `npm run agent -- cloud-schedule …` | Cloud — Supabase + pg_cron |
| `npm run agent -- post …` | Local — direct Blotato POST |
| `npm run agent -- blotato-schedule …` | Local — direct Blotato `scheduledTime` |

A post that's been pushed to the cloud carries `scheduledServerId`. From that
moment:
- Dashboard UI hides local actions for it (with a `☁️ Géré par Supabase
  pg_cron` notice).
- Dashboard server endpoints `/publish-now`, `/schedule`, `/reschedule` return
  HTTP 409 if called for that post.
- The `setInterval` scheduler in `dashboard.ts` skips it (defense-in-depth —
  cloud-scheduled posts shouldn't be in `schedule.json` to begin with).

## Local dashboard — access control

Since the last security pass, `npm run dashboard` binds to `127.0.0.1:4200`
only. Nobody on your LAN / WiFi can reach it. Open it from the SAME machine
at `http://127.0.0.1:4200` (or `http://localhost:4200`).

For a second lock (useful on a shared machine), set
`DASHBOARD_TOKEN=<random-string>` in `marketingagent/.env`. The dashboard
then challenges every request with HTTP Basic Auth — the browser prompts
once, you type any username and the token as the password, and it caches
for the session. Leave `DASHBOARD_TOKEN` unset to disable.

## Falling back to local-only

If pg_cron / the edge function misbehaves, you have two clean fallbacks:

1. **Per-post**: in the Supabase Dashboard, set the row's `status='failed'`,
   then locally clear `scheduledServerId` in `posts.json` and re-publish via
   `npm run agent -- post <id>` or the local "Publier maintenant" button.
2. **Globally**: stop using `cloud-schedule`. Existing rows still publish, but
   no new ones enter the queue. Use the dashboard's Blotato scheduling buttons
   instead — quick schedule uses the next free slot, and manual scheduling lets
   you choose an explicit date and time.

You can also pause pg_cron from SQL:

```sql
select cron.unschedule('publish-scheduled-posts');
```

Re-enable by re-applying [20260413_publish_scheduled_posts_cron.sql](../supabase/migrations/20260413_publish_scheduled_posts_cron.sql).

## Debugging

| Symptom | Where to look |
|---|---|
| `cloud-schedule` says "SUPABASE_URL not set" | Add to `marketingagent/.env` |
| `cloud-schedule` succeeds but post never publishes | `cloud-list scheduled` → still scheduled? Check edge function logs in Supabase Dashboard → Functions → Logs |
| Edge function logs `BLOTATO_API_KEY not configured` | `supabase secrets set BLOTATO_API_KEY=...` and redeploy |
| Edge function logs `Unauthorized` | `SCHEDULED_POSTS_SECRET` mismatch between vault and edge function env. Re-apply the rotation migration and redeploy. |
| pg_cron job missing | `select * from cron.job` — re-apply the cron migration |
| Cloud post stuck for an hour | Worst case: pg_cron pause window. Check `select * from cron.job_run_details order by start_time desc limit 5;` |

## What this Step 1 deliberately does NOT do

- Does NOT replace the local dashboard. It's a fallback during validation.
- Does NOT migrate `posts.json` itself to Postgres. The CLI keeps writing
  there; only the publication path is cloud.
- Does NOT auto-sync. You run `cloud-sync` when you want the dashboard
  to reflect cloud state.
- Does NOT handle generation in cloud. Anthropic + Gemini calls stay local.
- Does NOT auto-clean orphan rows in `marketing_posts`. They stay forever
  unless you `delete from marketing_posts where created_at < now() - interval '90 days'`.

These are Step 2 / Step 3 concerns.
