@echo off
rem Daily backup entry point for Windows Task Scheduler.
rem
rem Registered by scripts/schedule-backup.ps1. Run it by hand any time to check
rem the scheduled run will work:  scripts\backup-daily.cmd
rem
rem Everything it prints is appended to backups\backup.log, because a scheduled
rem task runs with no window: without a log, a run that started failing months
rem ago looks exactly like one that is working.

setlocal

rem Resolve the app directory from this script's own location (%~dp0 is
rem scripts\), so the task works regardless of the working directory the
rem scheduler hands us.
set "APP=%~dp0.."
set "LOG=%APP%\backups\backup.log"

if not exist "%APP%\backups" mkdir "%APP%\backups"

echo. >> "%LOG%"
echo ======================================================== >> "%LOG%"
echo Run started %DATE% %TIME% >> "%LOG%"

pushd "%APP%"
call npm run backup -- --keep 30 >> "%LOG%" 2>&1
set "CODE=%ERRORLEVEL%"
popd

if "%CODE%"=="0" (
  echo Run finished OK %DATE% %TIME% >> "%LOG%"
) else (
  echo *** FAILED with exit code %CODE% at %DATE% %TIME% >> "%LOG%"
)

endlocal & exit /b %CODE%
