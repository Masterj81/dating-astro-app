# E2E testing with Maestro

This document covers the AstroDating mobile E2E suite (Android first).
All ten scenarios live under `.maestro/` at the repo root. The web app
is NOT covered here -- add a separate Playwright or Cypress suite when
needed.

## Prerequisites

### 1. Install Maestro CLI

macOS / Linux:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Windows (WSL recommended):

```bash
iex "& { $(irm https://get.maestro.mobile.dev/windows) }"
```

Verify:

```bash
maestro --version
# Expect 1.38.x or later
```

Docs: https://maestro.mobile.dev/

### 2. Android dev environment

You need:

- Android Studio with at least one AVD (Pixel 7, API 34 is a good
  default). A physical device works too as long as it shows up in
  `adb devices`.
- `adb` in PATH (`%ANDROID_HOME%\platform-tools` on Windows).

Start the emulator headless:

```bash
emulator -avd Pixel_7_API_34 -no-snapshot-load
```

### 3. EAS CLI (if building through EAS)

```bash
npm install -g eas-cli
eas login
```

## Build an E2E-ready debug APK

Two options. Pick one.

### Option A -- Local debug build (fastest iteration)

From the repo root:

```bash
cd apps/mobile
npx expo run:android --variant debug --device <device-id>
```

This compiles the debug APK, installs it on the device, and leaves
metro running. You can re-deploy just the JS with `r` in the metro
terminal.

### Option B -- EAS development build

```bash
cd apps/mobile
eas build --profile development --platform android --local
```

Produces an `.apk` you can install with:

```bash
adb install path/to/build.apk
```

The EAS dev client includes the dev menu and hot-reload; production
builds will behave differently around deep links and splash screens,
so stick to development/debug for E2E.

## Environment variables

Flows rely on env vars read by Maestro from the shell (or pre-set in
`run-maestro.bat` for Windows). Three test accounts cover the three
subscription tiers driven by `apps/mobile/services/premiumUsage.ts`:

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"

# Premium Plus (Cosmic). Default test user for flows 02-09.
export TEST_USER_EMAIL="e2e_user1@example.com"
export TEST_USER_PASSWORD="TestPassword123!"

# Premium (Celestial). Used by premium flows 12 (granted) and 13 (Cosmic
# upgrade paywall), and as match partner for flow 04.
export TEST_CELESTIAL_EMAIL="e2e_user2@example.com"
export TEST_CELESTIAL_PASSWORD="TestPassword123!"

# Free tier. Used by flows 06 + 11. The seed pre-consumes
# premium_usage so first visits hit the denied state directly.
export TEST_FREE_EMAIL="e2e_free@example.com"
export TEST_FREE_PASSWORD="TestPassword123!"

# Dedicated throwaway for any future destructive flow. Flow 09 is
# hardened to never tap the delete row, but the var is kept for
# backward-compat.
export TEST_DELETABLE_EMAIL="e2e_deletable@example.com"
export TEST_DELETABLE_PASSWORD="TestPassword123!"
```

The `.maestro/config.yaml` file wires these into each flow via
`${VAR_NAME}` substitution. On Windows, `run-maestro.bat` sets all six
inline at the top — edit that file to change credentials.

## Test accounts

Create these in Supabase staging (Authentication → Users → Add user)
with **Auto Confirm = ON** so flows can log in immediately:

| Email                       | Tier         | Used by flows           |
|-----------------------------|--------------|-------------------------|
| `e2e_user1@example.com`     | premium_plus | 02, 03, 04, 05, 09, 14, 15 |
| `e2e_user2@example.com`     | premium      | 12, 13 (also match partner for 04/05) |
| `e2e_free@example.com`      | free         | 06, 11                  |
| `e2e_deletable@example.com` | (any)        | (legacy, optional)      |

All four use password `TestPassword123!` by convention.

After creating the auth users, run the seed once:

```bash
# Open the SQL Editor on your staging project and paste:
psql -f .maestro/seed-matches.sql   # or just copy/paste in the dashboard
```

The seed (`.maestro/seed-matches.sql`) is **idempotent** and provisions:

1. **Trigger fix** — repairs `notify_new_match()` and `send_match_email()`
   so any INSERT into `matches` works (real prod bug, see migration
   `20260423_fix_notify_new_match_search_path.sql`).
2. **Profiles** — fills name/age/sun/moon/gender, sets
   `onboarding_completed = TRUE`, clears any soft-delete markers.
3. **Subscriptions** — `premium_plus` for user1, `premium` for user2,
   no row for the free user.
4. **Match** — one active row between user1 and user2 (used by chat flows).
5. **`premium_usage` priming** — pre-consumes today's free trial on
   features that should hit the paywall, so flows 06/11/13 hit the
   denied state on first visit (no flaky "first request grants 1 trial"
   surprise). user1 (premium_plus) keeps its quota empty since the gate
   skips the trial path entirely.

**Re-run the seed at the start of each test day** — the trial counter
keys off `CURRENT_DATE` so yesterday's primed rows do not block today.

## Running the suite

### Windows / PowerShell

```powershell
# Core suite (04 chat-send, 07 forgot, 09 delete row).
.\run-maestro.bat

# Premium suite (06 + 11..15) — requires today's seed to be applied.
$env:RUN_PREMIUM=1; .\run-maestro.bat; Remove-Item Env:\RUN_PREMIUM

# Everything except 05 (which needs manual airplane-mode toggle).
$env:RUN_ALL=1; .\run-maestro.bat; Remove-Item Env:\RUN_ALL
```

Logs land in `.maestro\logs\last-run.log`; per-flow Maestro debug
artifacts under `.maestro\logs\debug\<flow>\`.

### macOS / Linux

```bash
# Single flow.
maestro test .maestro/01-signup-happy-path.yaml -e TEST_USER_EMAIL=... -e TEST_USER_PASSWORD=...

# Whole folder.
maestro test .maestro/

# Interactive UI for recording / debugging selectors.
maestro studio

# With verbose debug output on failure.
maestro test .maestro/ --debug-output /tmp/maestro-debug
```

Maestro retries each flow up to 2 times by default; pass
`--no-retry` to disable.

## Premium flow matrix

| Flow | Account | Screen | Expected gate state |
|------|---------|--------|---------------------|
| 06   | free    | natal-chart        | denied (paywall CTA) |
| 11   | free    | natal-chart        | denied (paywall CTA) |
| 12   | premium | natal-chart        | granted              |
| 13   | premium | daily-horoscope    | denied (Cosmic upgrade) |
| 14   | premium_plus | daily-horoscope | granted          |
| 15   | premium_plus | daily-horoscope, planetary-transits, retrograde-alerts, date-planner | granted (smoke) |

All premium flows assert one of two stable testIDs from
`apps/mobile/components/PremiumGate.tsx`:

- `premium-paywall-cta` — visible iff the gate denies access
- `premium-gate-granted` — visible iff the gate renders children

This avoids relying on i18n title strings or screen-specific content.

## Debugging tips

- `maestro studio` opens a web UI that mirrors the device screen and
  lets you tap visually while Maestro generates the YAML -- invaluable
  for figuring out labels and view hierarchies.
- Add `- takeScreenshot: name-here` between steps to save PNGs under
  `~/.maestro/tests/<flow>/screenshots/`.
- `maestro hierarchy` dumps the current view tree so you can discover
  testIDs that are present but not yet asserted.
- When a flow hangs on `extendedWaitUntil`, the selector is wrong. Use
  `maestro studio` to find the real label/testID rather than guessing.

## Offline-simulation caveat (flow 05)

Maestro has no primitive for toggling connectivity. Two workarounds:

1. Interactive run -- start the flow, toggle airplane mode manually when
   the flow pauses, toggle it back. Works for local debugging.
2. Wrap in a shell script for CI-like runs:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Start the login half of the flow, then pause.
maestro test .maestro/05-chat-offline-queue.yaml --partial --until "tap:chat-send-button" &
PID=$!
sleep 3

# Kill connectivity before the send.
adb shell svc wifi disable
adb shell svc data disable

wait $PID

# ...send the message...
adb shell svc wifi enable
adb shell svc data enable
```

This is manual plumbing and not wired into CI; see the
Actions-séparé-P3 TODO.

## iOS parity

Out of scope for this iteration. To add iOS later:

1. `eas build --profile development --platform ios`.
2. Open the `.app` in Simulator.
3. Run the same flows -- swap `appId` to `com.astrodating.app` in each
   YAML (or promote `appId` to `config.yaml` env) and re-run.

iOS-specific differences to watch for:
- Native pickers behave differently (flow 01 uses Android-style wheels).
- Alert button labels may differ between platforms.
- `NSCameraUsageDescription` prompts can interrupt flows.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "App Not Found: com.astrodatingapp.mobile" | Rebuild and install the debug APK on the emulator (`npx expo run:android`). Release builds use a different id. |
| Flow hangs on `extendedWaitUntil: <selector>` | The selector is stale. Run `maestro studio`, find the real one, update the YAML. |
| Flakiness on first run | Increase the `extendedWaitUntil` timeout (cold starts on CI can take 30s+). |
| "Element not clickable" | A splash or modal is covering the target. Add a `waitForAnimationToEnd` step before the tap. |
| Email verification blocks flow 01 | In Supabase staging, enable auto-confirm (`Authentication > Providers > Email > Confirm email = OFF`). Production still requires verification. |
| Flow 09 fails with 401 "Sign in again" | The edge function enforces a "recent auth" gate (<5 min). The login in the flow is fresh, so this happens only when Maestro pauses >5 min between login and the delete tap. |

## Future work (not in scope for this PR)

- GitHub Actions workflow to run the suite on each PR (use the
  `mobile-dev-inc/action-maestro-cloud` marketplace action or the
  self-hosted variant).
- iOS parity (see above).
- Tag-based flow selection -- pass `maestro test --tags smoke` once
  flows have tags.
- Detox / XCUITest parity if we ever need sub-second selectors that
  Maestro can't deliver.
