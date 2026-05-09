# Screenshot seed notes — two-profile strategy

Approved approach (2026-05-09). Marketing screenshots use **two distinct
seed profiles** so each shot can be tuned independently without touching
relational data:

| Shot | Surface | Profile | Why |
|---|---|---|---|
| `discover.png` | `/en/app/discover` | **Liam** (`d4105f3e-…`) | Beautiful card, no match required, surfaces top via `last_active` bump |
| `chat.png` | `/en/app/chat/<conv>` | **Elliot** = `e2e_user2` | Existing match + seeded conversation messages |
| `compatibility.png` | `/en/app/premium/celestial/synastry` | **Elliot** | Synastry overview between viewer and matched user |
| `premium-cosmic.png` | `/en/app/premium/cosmic` | n/a | Public premium index |
| `premium-celestial.png` | `/en/app/premium/celestial` | n/a | Public premium index |

**No `matches` rows are deleted, no swipes touched, no `messages.match_id`
cascade risked.** The only writes are profile-level UPDATEs and additive
INSERTs into `messages` for the existing Elliot match.

---

## Phase 0 — Upload curated photos to Supabase Storage

Two photos, both in the (already-public) `avatars` bucket. Reuploading
the same filename keeps the URL stable.

| Filename | Subject | Public URL |
|---|---|---|
| `e2e-user2-elliot.jpg` | Elliot (chat / compat) | `https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/e2e-user2-elliot.jpg` |
| `liam-discover.jpg` | Liam (discover) | `https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/liam-discover.jpg` |

Sanity check each URL by opening it in a browser tab — both should serve
the JPEG.

---

## Phase 1A — UPDATE `e2e_user2` profile → "Elliot"

Targets chat.png + compatibility.png. Idempotent.

```sql
UPDATE public.profiles
SET
  name                = 'Elliot',
  image_url           = 'https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/e2e-user2-elliot.jpg',
  images              = ARRAY['https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/e2e-user2-elliot.jpg'],
  bio                 = 'Leo sun, Pisces moon. Hiking, jazz, slow coffee, and real conversations.',
  relationship_intent = 'serious',
  personal_values     = ARRAY['Honesty','Adventure','Growth'],
  interests           = ARRAY['Hiking','Jazz','Coffee','Tarot'],
  looking_for_text    = 'Someone who reads charts and people the same way.',
  icebreaker_question = 'What''s the last book that changed how you see something?',
  prompts             = '[{"key":"My ideal Sunday","response":"Coffee, vinyl, hiking by 11."}]'::jsonb,
  last_active         = NOW()
WHERE id = (SELECT id FROM auth.users WHERE email = 'e2e_user2@example.com');
```

---

## Phase 1B — UPDATE Liam profile (Discover target)

Targets discover.png. Same shape as 1A. Hard-coded id because Liam is a
seed-migration profile (`d4105f3e-03f5-488d-948e-1f413ae34c5e`); no
auth.users coupling concerns since we're only touching `profiles`.

`last_active = NOW() + INTERVAL '10 minutes'` ensures Liam sorts above
Elliot in `get_discoverable_profiles` (which orders by
`last_active DESC NULLS LAST, created_at DESC`).

```sql
UPDATE public.profiles
SET
  image_url           = 'https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/liam-discover.jpg',
  images              = ARRAY['https://qtihezzbuubnyvrjdkjd.supabase.co/storage/v1/object/public/avatars/liam-discover.jpg'],
  bio                 = 'Virgo sun, Taurus moon. Coffee, books, slow Sunday hikes.',
  relationship_intent = 'serious',
  personal_values     = ARRAY['Honesty','Curiosity','Loyalty'],
  interests           = ARRAY['Coffee','Books','Hiking','Yoga'],
  looking_for_text    = 'Someone curious and kind, who reads people gently.',
  icebreaker_question = 'What''s a book that quietly changed how you live?',
  prompts             = '[{"key":"My ideal Sunday","response":"Coffee, light reading, hike before noon."}]'::jsonb,
  last_active         = NOW() + INTERVAL '10 minutes'
WHERE id = 'd4105f3e-03f5-488d-948e-1f413ae34c5e';
```

Constraint cross-checks (see
[supabase/migrations/20260430000001_add_profile_mvp_fields.sql](../../supabase/migrations/20260430000001_add_profile_mvp_fields.sql)):
- `relationship_intent` ∈ `{serious, exploring, casual, friends, unsure}` ✓
- `personal_values` cardinality ≤ 5 ✓ (3)
- `interests` cardinality ≤ 12 ✓ (4)
- `looking_for_text` ≤ 200 ✓
- `icebreaker_question` ≤ 80 ✓
- `prompts` shape `{key, response}` strings, ≤ 3 entries ✓

---

## Phase 2 — Seed conversation messages between e2e_user1 and Elliot

The chat UI reads from the new `conversations` table introduced in
[20260428000002_conversations_first.sql](../../supabase/migrations/20260428000002_conversations_first.sql).
Messages MUST carry `conversation_id` to surface; `match_id` alone is
invisible to the inbox.

```sql
DO $$
DECLARE
  v_match_id uuid;
  v_conv_id  uuid;
  v_user1_id uuid;
  v_user2_id uuid;
BEGIN
  SELECT id INTO v_user1_id FROM auth.users WHERE email = 'e2e_user1@example.com';
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'e2e_user2@example.com';

  SELECT id INTO v_match_id FROM public.matches
    WHERE user1_id = LEAST(v_user1_id, v_user2_id)
      AND user2_id = GREATEST(v_user1_id, v_user2_id)
    LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'match between e2e_user1 and e2e_user2 not found — run .maestro/seed-matches.sql first';
  END IF;

  SELECT id INTO v_conv_id FROM public.conversations
    WHERE user_a = LEAST(v_user1_id, v_user2_id)
      AND user_b = GREATEST(v_user1_id, v_user2_id)
    LIMIT 1;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'conversation row not found — the conversations-first migration should have backfilled it';
  END IF;

  INSERT INTO public.messages (match_id, conversation_id, sender_id, content, message_type, is_read, created_at)
  VALUES
    (v_match_id, v_conv_id, v_user2_id,
      'Mars in Leo? Bold choice for a hike opener.',
      'icebreaker', TRUE,  NOW() - INTERVAL '22 minutes'),
    (v_match_id, v_conv_id, v_user1_id,
      'Haha. What''s your sign btw — moon counts.',
      'text',       TRUE,  NOW() - INTERVAL '18 minutes'),
    (v_match_id, v_conv_id, v_user2_id,
      'Pisces moon. Explains the playlists.',
      'text',       FALSE, NOW() - INTERVAL '4 minutes');

  UPDATE public.conversations
  SET last_message_at = (
    SELECT MAX(created_at) FROM public.messages WHERE conversation_id = v_conv_id
  )
  WHERE id = v_conv_id;
END $$;
```

Notes:

- **Both `match_id` and `conversation_id`** are set so the row is readable
  via the legacy match-bound RLS path AND the new conversation-bound path.
- **Additive on purpose.** No `DELETE FROM messages` — old rows (if any)
  appear lower in the chat UI thanks to descending `created_at`.
- The first row uses `message_type='icebreaker'` so the chat UI can render
  its icebreaker chip distinctively.
- The third row is `is_read = FALSE` → triggers the unread badge on
  e2e_user1's chat list, which makes the screenshot feel alive.

### Phase 2-fix — patch existing rows missing `conversation_id`

Run once if you previously seeded messages with `match_id` only (e.g.
from an older draft of Phase 2). Idempotent — re-running just rebinds
0 rows once they're already set.

```sql
DO $$
DECLARE
  v_conv_id  uuid;
  v_user1_id uuid;
  v_user2_id uuid;
BEGIN
  SELECT id INTO v_user1_id FROM auth.users WHERE email = 'e2e_user1@example.com';
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'e2e_user2@example.com';

  SELECT id INTO v_conv_id FROM public.conversations
    WHERE user_a = LEAST(v_user1_id, v_user2_id)
      AND user_b = GREATEST(v_user1_id, v_user2_id)
    LIMIT 1;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'conversation between e2e_user1 and e2e_user2 not found';
  END IF;

  UPDATE public.messages
  SET conversation_id = v_conv_id
  WHERE conversation_id IS NULL
    AND content IN (
      'Mars in Leo? Bold choice for a hike opener.',
      'Haha. What''s your sign btw — moon counts.',
      'Pisces moon. Explains the playlists.'
    );

  UPDATE public.conversations
  SET last_message_at = (
    SELECT MAX(created_at) FROM public.messages WHERE conversation_id = v_conv_id
  )
  WHERE id = v_conv_id;
END $$;
```

---

## Phase 2.5 — One-off cleanup of stale E2E test messages

Old "E2E test message" / "E2E offline test" rows from earlier Maestro runs
on 2026-04-23 muddy the chat thread. Run this once if those rows exist
(idempotent, deletes 0 once cleaned):

```sql
DELETE FROM public.messages m
USING public.matches mt,
      auth.users u1,
      auth.users u2
WHERE u1.email = 'e2e_user1@example.com'
  AND u2.email = 'e2e_user2@example.com'
  AND mt.user1_id = LEAST(u1.id, u2.id)
  AND mt.user2_id = GREATEST(u1.id, u2.id)
  AND m.match_id  = mt.id
  AND m.content IN ('E2E test message', 'E2E offline test')
  AND m.created_at < '2026-04-24'::date;
```

---

## Phase 3 — Capture the 5 screenshots in a single run

### One-time local setup

`playwright` is intentionally **not** committed as a repo dependency
(the screenshot capture is an ad-hoc marketing tool, not part of the
test pipeline). Install it locally before the first run:

```bash
npm install -D playwright
npx playwright install chromium
```

Both commands are no-ops on subsequent runs.

### Run the capture

```bash
node scripts/capture-screenshots.mjs
```

Or with explicit env (Bash):

```bash
E2E_EMAIL=e2e_user1@example.com \
E2E_PASSWORD=TestPassword123! \
node scripts/capture-screenshots.mjs
```

PowerShell:

```powershell
$env:E2E_EMAIL = "e2e_user1@example.com"
$env:E2E_PASSWORD = "TestPassword123!"
node scripts/capture-screenshots.mjs
```

The script:
- neutralizes `Math.random` to make the client-side Fisher-Yates shuffle a
  no-op (so Discover always shows the top of the RPC sort = Liam)
- hides the InstallPrompt and StickyDownloadBar via injected CSS
- drills into the Elliot conversation by name match in the chat list
- scrolls the synastry score circle into view before the compatibility
  shot

Output (overwritten):

- `apps/web/public/screenshots/discover.png`
- `apps/web/public/screenshots/chat.png`
- `apps/web/public/screenshots/compatibility.png`
- `apps/web/public/screenshots/premium-cosmic.png`
- `apps/web/public/screenshots/premium-celestial.png`

`CAPTURE_ONLY` and `CAPTURE_SKIP` exist for partial reruns; not needed in
the standard flow.

---

## Phase 4 — Rollback (only if you need to revert)

Phase 1A / 1B / 2 are non-destructive: profile UPDATEs and additive
message INSERTs. Auth, matches, swipes, subscriptions, premium_usage —
all untouched.

```sql
-- Revert Elliot profile to .maestro/seed-matches.sql baseline.
UPDATE public.profiles
SET
  name                = 'E2E User 2',
  image_url           = NULL,
  images              = NULL,
  bio                 = NULL,
  relationship_intent = NULL,
  personal_values     = '{}'::TEXT[],
  interests           = NULL,
  looking_for_text    = NULL,
  icebreaker_question = NULL,
  prompts             = '[]'::jsonb,
  last_active         = NULL
WHERE id = (SELECT id FROM auth.users WHERE email = 'e2e_user2@example.com');

-- Revert Liam profile to its seed-migration baseline.
UPDATE public.profiles
SET
  image_url           = NULL,
  images              = NULL,
  bio                 = 'Detail-oriented Virgo and coffee enthusiast.',
  relationship_intent = NULL,
  personal_values     = '{}'::TEXT[],
  interests           = NULL,
  looking_for_text    = NULL,
  icebreaker_question = NULL,
  prompts             = '[]'::jsonb,
  last_active         = NULL
WHERE id = 'd4105f3e-03f5-488d-948e-1f413ae34c5e';

-- Drop only the three seeded marketing messages (matched by exact content).
DELETE FROM public.messages
WHERE content IN (
  'Mars in Leo? Bold choice for a hike opener.',
  'Haha. What''s your sign btw — moon counts.',
  'Pisces moon. Explains the playlists.'
);
```

Storage: removing `e2e-user2-elliot.jpg` / `liam-discover.jpg` from the
`avatars` bucket is manual via the Supabase dashboard.

---

## What is NEVER touched by this flow

- `public.matches` — match rows / compatibility scores intact
- `public.swipes` — no swipe history modified
- `public.subscriptions` — `e2e_user2` stays on `premium` (Celestial)
- `public.premium_usage` — paywall counters intact
- `auth.users` — auth state untouched (no new accounts created)
- `e2e_user1` profile — only its match relationships are read
- `e2e_free` profile — unchanged

---

## Known unrelated bug (do not block on this)

`compatibility.png` is captured on `/en/app/premium/celestial/synastry`,
which calls the `get-profile-chart` edge function. That function
currently fails in production, so the score renders as `--%`. Layout is
otherwise clean. Fixing the edge function is tracked separately.
