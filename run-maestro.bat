@echo off
REM Maestro E2E suite runner (flat, no subroutines, no inline if/else).
REM Passwords with `!` are preserved because DelayedExpansion is OFF.

setlocal DisableDelayedExpansion

set "TEST_USER_EMAIL=e2e_user1@example.com"
set "TEST_USER_PASSWORD=TestPassword123!"
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

set "ARGS=-e TEST_USER_EMAIL=%TEST_USER_EMAIL% -e TEST_USER_PASSWORD=%TEST_USER_PASSWORD% -e TEST_DELETABLE_EMAIL=%TEST_DELETABLE_EMAIL% -e TEST_DELETABLE_PASSWORD=%TEST_DELETABLE_PASSWORD%"

echo.
echo === Checking adb devices ===
"%ADB%" devices
"%ADB%" devices >> "%MASTER_LOG%" 2>&1

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

echo.
echo ============================================================
echo  Done. Master log: %MASTER_LOG%
echo  Per-flow debug  : %DEBUG_DIR%\
echo  (exit=0 means the flow passed)
echo ============================================================
endlocal
