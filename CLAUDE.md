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

### Web (`apps/web`)
- Next.js App Router under `src/app/`, locale-segmented (`[locale]/`). Marketing pages are grouped under `[locale]/(marketing)/`.
- API routes under `src/app/api/` (account deletion, billing prices, contact). Web payments go through **Stripe**; mobile uses **RevenueCat** — the two billing systems are reconciled in Supabase.
- 8 locales in `src/i18n/*.json` via `next-intl`; `middleware.ts` handles locale routing.

### Supabase backend
- Migrations in `supabase/migrations/` are strictly ordered by timestamp prefix — add new ones, never edit shipped ones.
- Security model (see `supabase/SECURITY.md`): the `anon` role has **no SELECT** on business tables. Client-facing reads go through a small, audited set of `SECURITY DEFINER` RPCs each guarded by `auth.uid()`. Other users' natal/synastry data is only ever returned by the `get-profile-chart` edge function (sanitized; never raw birth fields). When adding an RPC, the default is **not** to expose it to `authenticated`.
- Edge functions in `supabase/functions/` cover payments webhooks (Stripe, RevenueCat), notifications, account deletion lifecycle, scheduled emails/horoscopes.
- **Conversation-first messaging:** the legacy `matches` table has been fully retired (phases A–E, completed 2026-05) in favour of a `conversations` model — `conversations.user_a/user_b`, `messages.conversation_id`. The `matches` table and the `messages.match_id` column no longer exist; all messaging goes through `conversation_id`. `docs/legacy-matches-retirement-plan.md` is the historical record. Do not reintroduce `match_id` or `matches` references.

## Reference docs

- `docs/legacy-matches-retirement-plan.md` — phased `matches` → `conversations` retirement (completed 2026-05; historical record)
- `supabase/SECURITY.md` — RLS posture, accepted lint exceptions, why each `SECURITY DEFINER` RPC exists
- `docs/E2E.md` — Maestro setup and the mobile E2E suite
- `docs/api-reference.md`, `docs/growth-plan.md`
