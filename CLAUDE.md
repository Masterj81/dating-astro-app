# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Development is on **Windows + PowerShell + npm**. No `&&` command chaining; use `;` or separate calls. Use `npm` (the repo's package manager is `npm@10.8.0`), never `pnpm`/`yarn`.

## Monorepo layout

npm workspaces driven by Turborepo (`turbo.json`). Three workspaces plus a Supabase backend and a standalone tool:

- `apps/mobile` (`@astro/mobile`) — Expo / React Native app, `expo-router` file-based routing under `app/`. This is the Android app; **iOS ships as the web PWA, not the App Store** (Apple rejected the dating+astrology binary).
- `apps/web` (`@astro/web`) — Next.js 15 App Router, `next-intl` i18n, Tailwind v4. Serves the marketing site, account management, billing, and the installable PWA.
- `packages/shared` (`@astro/shared`) — business logic shared by mobile + web. Currently the profile catalog/sanitizers (`src/profile/`) and shared types (`src/types/`). Source-only package (`main` points at `src/index.ts`); imported as `@astro/shared` / `@astro/shared/profile`.
- `supabase/` — Postgres schema (75+ ordered migrations), edge functions, seed data. The real backend; security posture is documented in `supabase/SECURITY.md` (read it before touching RLS or RPCs).
- `marketingagent/` — independent marketing-automation agent (its own `package.json`, not a workspace). Not part of the app build.

## Commands

Run from the repo root unless noted. Turbo fans tasks out across all workspaces.

```
npm run dev:mobile          # expo start (mobile)
npm run dev:web             # next dev (web)
npm run lint                # turbo run lint — eslint across workspaces
npm run typecheck           # turbo run typecheck — tsc --noEmit across workspaces
npm run test                # turbo run test --continue (see note below)
npm run build:web           # next build
npm run build:mobile:android / build:mobile:ios   # eas build
npm run validate:locales    # web + mobile locale parity (8 locales must stay in sync)
npm run validate:email-templates   # renders the lifecycle emails and asserts CTAs, tracking, unsubscribe, banned copy
```

Single-workspace work: `cd apps/web; npm run typecheck` (or `--workspace=@astro/web` from root). CI (`.github/workflows/ci.yml`) runs lint → typecheck → test on push/PR to `main`/`master`.

### Tests

There are **no unit tests** — every workspace's `test` script is a `"No tests yet"` echo. The real coverage is **Maestro E2E** for mobile (Android-first):

```
npm run test:e2e            # maestro test .maestro/   (needs a running Android emulator/device)
npm run test:e2e:studio     # maestro studio
```

Scenarios are numbered YAML flows in `.maestro/` (signup, login, discover/match, chat, premium gating, deep links). Setup details and prerequisites are in `docs/E2E.md`. To run one scenario: `maestro test .maestro/04-chat-send-message.yaml`.

## Architecture notes

### Mobile (`apps/mobile`)
- Routing: `expo-router` — screens live in `app/`, tabs in `app/(tabs)/`.
- Cross-cutting state via React contexts in `contexts/`: `AuthContext`, `PremiumContext`, `LanguageContext`.
- `services/` holds the integration layer — `supabase.ts` (client), astrology (`astrology.ts`, `astrologyCore.ts`, `lib/synastry.ts`, using `astronomy-engine`), `purchases.ts`/`subscriptionService.ts` (RevenueCat IAP), `notifications.ts` (Expo push), `pwa.ts`/`webPayments.ts` (web build paths).
- 8 locales in `locales/*.json`; keep them in parity (`npm run validate:mobile:locales`).
- **Conversation Guide** (`app/premium-screens/conversation-guide.tsx`) gates differently from every other premium screen, on purpose. It must **never** be wrapped in `PremiumGate`: that component decides at mount, which would spend the reader's daily free preview before they read anything and would then hide the free situation for the rest of the day. Instead the screen calls `enforcePremiumFeature` itself, once per mount, from a `useCallback`, on the first tap of a *locked* situation. Its free situation ("Start a conversation", 12 signs) never touches the server. It also must keep at least one entry point outside the Premium tab — `app/(tabs)/premium.tsx` renders a full-screen paywall for `tier === 'free'`, so the Cosmic Hub grid is invisible to exactly the accounts the feature is meant to convert. Both promises are asserted structurally by `npm run validate:coach-content`, which also lints the English corpus in `packages/shared/src/coach/` for promissory, deterministic, manipulative and clinical language. That corpus is **English-only in P0** and deliberately lives outside `locales/*.json`; only the UI chrome is translated.

### Web (`apps/web`)
- Next.js App Router under `src/app/`, locale-segmented (`[locale]/`). Marketing pages are grouped under `[locale]/(marketing)/`.
- API routes under `src/app/api/` (account deletion, billing prices, contact). Web payments go through **Stripe**; mobile uses **RevenueCat** — the two billing systems are reconciled in Supabase.
- 8 locales in `src/i18n/*.json` via `next-intl`; `middleware.ts` handles locale routing.
- **Onboarding (`AccountSetupForm.tsx`) carries five invariants**, all asserted by `npm run validate:web-onboarding` because each is one line to undo and silent when broken. (1) Every client-side `profiles` insert writes `email` — a row without one is skipped by `send-email` forever with `"No email on profile"`, and the reader never hears from JUNO again. (2) Only **name, gender and birth date** block the submit; birth time, birth city and the element filter are optional, because the web is the iOS channel and must not ask for more than the native app. (3) `rising_sign` is written **only** when a birth time exists — `calculate-chart` correctly returns `rising: null` without one, unlike the mobile wrapper (`services/astrology.ts:125`) which substitutes Aries and is why eleven mobile accounts in twelve are told the wrong rising sign. (4) The save does **not** redirect to `/app`: it renders the chart reveal, which is the whole payoff of the flow. (5) When no birth city is given, the device timezone is passed to sharpen the UTC instant, the stored chart is downgraded to `confidence: "low"` with a `timezone_guessed_from_device` warning, and `birth_latitude`/`birth_longitude` stay null rather than recording the Greenwich fallback as a birthplace.
- **`profiles.last_active` is written on web by `WebActivityTracker`**, mounted globally in `[locale]/layout.tsx` (not inside `AppShell` — a reader who returns to the marketing home and never opens `/app` is still a D+1 return). Best-effort and throttled to 5 minutes to match `apps/mobile/services/activity.ts`, so the two platforms produce comparable numbers. It beacons on mount, on auth change, on `visibilitychange`, and on `pageshow` with `persisted` — that last one matters because standalone iOS PWAs resume from bfcache and fire no `visibilitychange`.

### Supabase backend
- Migrations in `supabase/migrations/` are strictly ordered by timestamp prefix — add new ones, never edit shipped ones.
- Security model (see `supabase/SECURITY.md`): the `anon` role has **no SELECT** on business tables. Client-facing reads go through a small, audited set of `SECURITY DEFINER` RPCs each guarded by `auth.uid()`. Other users' natal/synastry data is only ever returned by the `get-profile-chart` edge function (sanitized; never raw birth fields). When adding an RPC, the default is **not** to expose it to `authenticated`.
- Edge functions in `supabase/functions/` cover payments webhooks (Stripe, RevenueCat), notifications, account deletion lifecycle, scheduled emails/horoscopes.
- **Lifecycle email:** copy and rendering live in `supabase/functions/send-email/templates.ts`, which imports nothing so the templates can be rendered and asserted outside Deno (`npm run validate:email-templates`); `index.ts` holds only auth, DB reads, token signing and the Resend call. Templates carry a `category` — `transactional` is never suppressible, `lifecycle` is opt-out via the `unsubscribe` function (HMAC token, RFC 8058 one-click) and the `notification_preferences.lifecycleEmails` key. CTA links must stay on the `/app` path prefix: `/en/app` would not match the Android App Link intent filter. Do not gate lifecycle mail on `notification_preferences.promotions` — it defaults to `false`.
- **`profiles.preferred_language`** records the locale an account reads in (one of the 8, or NULL = unknown → senders fall back to English). Written best-effort by `apps/web/src/components/PreferredLanguageSync.tsx` and `apps/mobile/services/preferredLanguage.ts`; both swallow failures because a preference must never interrupt a sign-in. The locale list is declared in seven places — `npm run validate:locale-contract` fails the build if they drift.
- **Edge functions cannot serve HTML.** Supabase downgrades any `text/html` response to `text/plain` and applies `nosniff` + a sandbox CSP, so a page rendered in a function reaches the reader as raw markup. `unsubscribe` therefore 303-redirects humans to `apps/web/src/app/[locale]/unsubscribe/page.tsx` carrying only a `status`, never a token; the `POST` one-click path must keep answering JSON or Gmail/Yahoo report the unsubscribe as failed. `cancel-account-deletion` still serves HTML and has the same defect.
- **Conversation-first messaging:** the legacy `matches` table has been fully retired (phases A–E, completed 2026-05) in favour of a `conversations` model — `conversations.user_a/user_b`, `messages.conversation_id`. The `matches` table and the `messages.match_id` column no longer exist; all messaging goes through `conversation_id`. `docs/legacy-matches-retirement-plan.md` is the historical record. Do not reintroduce `match_id` or `matches` references.

## Reference docs

- `docs/legacy-matches-retirement-plan.md` — phased `matches` → `conversations` retirement (completed 2026-05; historical record)
- `supabase/SECURITY.md` — RLS posture, accepted lint exceptions, why each `SECURITY DEFINER` RPC exists
- `docs/E2E.md` — Maestro setup and the mobile E2E suite
- `docs/retention-day2-audit-2026-08.md` — **current** Day 1 / Day 2 retention audit: reconstructed funnel, drop-off points, empty states, email/push lifecycle spec, premium & free-preview review, analytics plan, P0–P3 backlog
- `docs/retention-audit-2026-08.md` — earlier post-signup drop-off audit (24 Aug 2026), superseded by the above; historical record
- `docs/premium-free-preview.md` — how the server-authoritative free daily preview works and how to extend it to another feature
- `docs/conversation-coach-feature-plan-2026-08.md` — **Conversation Guide** product + technical plan (positioning, freemium split, situation taxonomy, content rules, P0–P2). Read §4.3 and §12.4 before touching the feature.
- `docs/conversation-coach-sign-concepts-2026-08.md` — the per-sign concept sheet the corpus was designed from. Non-protectable general axes only; see the copyright rules in §12.4 of the plan before adding content.
- `docs/conversation-guide-telemetry.md` — how to measure the Conversation Guide with no analytics SDK: the `premium_usage` SQL fallback, which of the requested events exist today, and the decision thresholds
- `docs/api-reference.md`, `docs/growth-plan.md`
