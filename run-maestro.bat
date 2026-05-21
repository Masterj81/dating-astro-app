@echo off
REM Maestro E2E suite runner.
REM
REM Modes (set ONE before invoking):
REM   (default) -> non-premium suite (04 chat-send, 07 forgot, 09 delete row)
REM   RUN_PREMIUM=1 -> premium suite (06 + 11..15) -- requires the seed in
REM                    .maestro\seed-matches.sql to have been run today.
REM   RUN_ALL=1 -> all 14 flows in numeric order.
REM
REM Three test accounts must exist in Supabase auth.users (Auto Confirm = on):
REM   e2e_user1@example.com    (premium_plus / Cosmic)  TEST_USER_*
REM   e2e_user2@example.com    (premium / Celestial)    TEST_CELESTIAL_*
REM   e2e_free@example.com     (free)                   TEST_FREE_*
REM
REM Passwords with `!` need DelayedExpansion off (this script does that).

setlocal DisableDelayedExpansion

set "TEST_USER_EMAIL=e2e_user1@example.com"
set "TEST_USER_PASSWORD=TestPassword123!"
set "TEST_CELESTIAL_EMAIL=e2e_user2@example.com"
set "TEST_CELESTIAL_PASSWORD=TestPassword123!"
set "TEST_FREE_EMAIL=e2e_free@example.com"
set "TEST_FREE_PASSWORD=TestPassword123!"
set "TEST_DELETABLE_EMAIL=e2e_deletable@example.com"
set "TEST_DELETABLE_PASSWORD=TestPassword123!"

set "MAESTRO=C:\Users\njoub\maestro\maestro\bin\maestro.bat"
set "ADB=C:\Users\njoub\AppData\Local\Android\Sdk\platform-tools\adb.exe"

set "LOG_DIR=.maestro\logs"
set "DEBUG_DIR=%LOG_DIR%\debug"
set "MASTER_LOG=%LOG_DIR%\last-run.log"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%DEBUG_DIR%" mkdir "%DEBUG_DIR%"
type nul > "%MASTER_LOG%"

set "ARGS=-e TEST_USER_EMAIL=%TEST_USER_EMAIL% -e TEST_USER_PASSWORD=%TEST_USER_PASSWORD% -e TEST_CELESTIAL_EMAIL=%TEST_CELESTIAL_EMAIL% -e TEST_CELESTIAL_PASSWORD=%TEST_CELESTIAL_PASSWORD% -e TEST_FREE_EMAIL=%TEST_FREE_EMAIL% -e TEST_FREE_PASSWORD=%TEST_FREE_PASSWORD% -e TEST_DELETABLE_EMAIL=%TEST_DELETABLE_EMAIL% -e TEST_DELETABLE_PASSWORD=%TEST_DELETABLE_PASSWORD%"

echo.
echo === Checking adb devices ===
"%ADB%" devices
"%ADB%" devices >> "%MASTER_LOG%" 2>&1

if "%RUN_PREMIUM%"=="1" goto premium_suite
if "%RUN_ALL%"=="1" goto all_suite
goto core_suite

:core_suite
echo.
echo === Mode: core (04, 07, 09) ===
echo === Mode: core === >> "%MASTER_LOG%"

echo.
echo === Running flow 04 chat-send-message ===
echo === Running flow 04 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\04-chat-send-message.yaml --debug-output "%DEBUG_DIR%\04-chat-send" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 04 (exit=%ERRORLEVEL%)
echo --- Finished flow 04 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 07 forgot-password ===
echo === Running flow 07 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\07-forgot-password.yaml --debug-output "%DEBUG_DIR%\07-forgot-pwd" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 07 (exit=%ERRORLEVEL%)
echo --- Finished flow 07 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 09 delete-account-grace ===
echo === Running flow 09 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\09-delete-account-grace.yaml --debug-output "%DEBUG_DIR%\09-delete-account" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 09 (exit=%ERRORLEVEL%)
echo --- Finished flow 09 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

goto done

:premium_suite
echo.
echo === Mode: premium (06, 11, 12, 13, 14, 15) ===
echo === Mode: premium === >> "%MASTER_LOG%"
echo (Make sure .maestro\seed-matches.sql has been re-run today.)

echo.
echo === Running flow 06 premium-paywall-free-user ===
echo === Running flow 06 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\06-premium-paywall-free-user.yaml --debug-output "%DEBUG_DIR%\06-paywall-free" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 06 (exit=%ERRORLEVEL%)
echo --- Finished flow 06 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 11 premium-free-denied ===
echo === Running flow 11 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\11-premium-free-denied.yaml --debug-output "%DEBUG_DIR%\11-free-denied" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 11 (exit=%ERRORLEVEL%)
echo --- Finished flow 11 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 12 premium-celestial-granted ===
echo === Running flow 12 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\12-premium-celestial-granted.yaml --debug-output "%DEBUG_DIR%\12-celestial-granted" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 12 (exit=%ERRORLEVEL%)
echo --- Finished flow 12 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 13 premium-celestial-on-cosmic-denied ===
echo === Running flow 13 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\13-premium-celestial-on-cosmic-denied.yaml --debug-output "%DEBUG_DIR%\13-celestial-cosmic-denied" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 13 (exit=%ERRORLEVEL%)
echo --- Finished flow 13 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 14 premium-cosmic-granted ===
echo === Running flow 14 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\14-premium-cosmic-granted.yaml --debug-output "%DEBUG_DIR%\14-cosmic-granted" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 14 (exit=%ERRORLEVEL%)
echo --- Finished flow 14 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

echo.
echo === Running flow 15 premium-cosmic-screens-smoke ===
echo === Running flow 15 === >> "%MASTER_LOG%"
call "%MAESTRO%" test .maestro\15-premium-cosmic-screens-smoke.yaml --debug-output "%DEBUG_DIR%\15-cosmic-smoke" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 15 (exit=%ERRORLEVEL%)
echo --- Finished flow 15 (exit=%ERRORLEVEL%) >> "%MASTER_LOG%"

goto done

:all_suite
echo.
echo === Mode: all (01..15 except 05) ===
echo === Mode: all === >> "%MASTER_LOG%"

call "%MAESTRO%" test .maestro\01-signup-happy-path.yaml --debug-output "%DEBUG_DIR%\01" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 01 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\02-login-logout.yaml --debug-output "%DEBUG_DIR%\02" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 02 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\03-discover-browse-message.yaml --debug-output "%DEBUG_DIR%\03" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 03 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\04-chat-send-message.yaml --debug-output "%DEBUG_DIR%\04" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 04 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\06-premium-paywall-free-user.yaml --debug-output "%DEBUG_DIR%\06" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 06 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\07-forgot-password.yaml --debug-output "%DEBUG_DIR%\07" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 07 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\08-reset-password-deeplink.yaml --debug-output "%DEBUG_DIR%\08" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 08 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\09-delete-account-grace.yaml --debug-output "%DEBUG_DIR%\09" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 09 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\10-deeplink-evil-rejected.yaml --debug-output "%DEBUG_DIR%\10" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 10 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\11-premium-free-denied.yaml --debug-output "%DEBUG_DIR%\11" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 11 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\12-premium-celestial-granted.yaml --debug-output "%DEBUG_DIR%\12" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 12 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\13-premium-celestial-on-cosmic-denied.yaml --debug-output "%DEBUG_DIR%\13" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 13 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\14-premium-cosmic-granted.yaml --debug-output "%DEBUG_DIR%\14" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 14 (exit=%ERRORLEVEL%)
call "%MAESTRO%" test .maestro\15-premium-cosmic-screens-smoke.yaml --debug-output "%DEBUG_DIR%\15" %ARGS% >> "%MASTER_LOG%" 2>&1
echo --- Finished flow 15 (exit=%ERRORLEVEL%)

:done
echo.
echo ============================================================
echo  Done. Master log: %MASTER_LOG%
echo  Per-flow debug  : %DEBUG_DIR%\
echo  (exit=0 means the flow passed)
echo ============================================================
endlocal
