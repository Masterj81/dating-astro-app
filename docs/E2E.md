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

Flows rely on env vars read by Maestro from the shell. Define them in
your shell or a `.env.e2e` file that you source:

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"

# Primary test account (used by flows 02-08).
export TEST_USER_EMAIL="maestro-primary@astrodatingapp.test"
export TEST_USER_PASSWORD="MaestroTest!123"

# Second account (reserved for matching/chat flows where both sides
# need to exist). Not used by the baseline 10 flows but wire it in
# now so future flows don't need a config change.
export TEST_USER2_EMAIL="maestro-secondary@astrodatingapp.test"
export TEST_USER2_PASSWORD="MaestroTest!123"

# Dedicated account for the destructive delete flow (09).
# MUST be a throwaway -- soft-deleted at end of run.
export TEST_DELETABLE_EMAIL="maestro-deletable-$(date +%s)@astrodatingapp.test"
export TEST_DELETABLE_PASSWORD="MaestroTest!123"
```

The `.maestro/config.yaml` file wires these into each flow via
`${VAR_NAME}` substitution.

## Test accounts

Create these in Supabase staging (Auth > Users > Add user). For each,
mark email_confirmed_at as now() so the signup flow doesn't require a
manual verification step. Minimum profile shape (insert via SQL or the
Table Editor):

```sql
insert into profiles (
  id, name, birth_date, birth_time, birth_city,
  sun_sign, moon_sign, rising_sign,
  gender, looking_for,
  age, onboarding_completed
) values (
  '<auth.users.id>',
  'Maestro Primary',
  '1995-03-15', '14:30:00', 'Paris, France',
  'Pisces', 'Virgo', 'Cancer',
  'female', ARRAY['male','female','non-binary','other'],
  30, true
);
```

Make sure the `premium_subscription` row for this user is either absent
or tier='free', so flow 06 (paywall) produces the denied UI.

For flow 03 (swipe match), seed a second account that has already
swiped right on your primary test user. That way a right-swipe from
the primary user produces a match modal deterministically:

```sql
insert into swipes (swiper_id, swiped_id, action) values
  ('<secondary-user-id>', '<primary-user-id>', 'like');
```

## Running the suite

From the repo root:

```bash
# Full suite.
npm run test:e2e

# Single flow.
maestro test .maestro/01-signup-happy-path.yaml

# Interactive UI for recording / debugging selectors.
npm run test:e2e:studio

# With verbose debug output on failure.
maestro test .maestro/ --debug-output /tmp/maestro-debug
```

Maestro retries each flow up to 2 times by default; pass
`--no-retry` to disable.

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
