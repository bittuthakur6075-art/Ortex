# Updates the Tally connector on the server where TallyPrime runs, safely:
# backs up config.json, gets the new code, installs, runs the offline
# self-test and the config check, and restarts the connector only if both pass.
#
#   powershell -ExecutionPolicy Bypass -File .\update.ps1                 # update, then restart the task
#   powershell -ExecutionPolicy Bypass -File .\update.ps1 -SkipPull       # code already copied in by hand
#   powershell -ExecutionPolicy Bypass -File .\update.ps1 -InstallTask    # one time: start the connector with Windows
#
# Windows PowerShell 5.1. Nothing here talks to Tally or posts a voucher: the
# connector does that once it is started again.

param(
  [switch]$SkipPull,
  [switch]$InstallTask,
  [switch]$NoRestart,
  [string]$TaskName = "OrtexTallyConnector"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "x $text" -ForegroundColor Red; exit 1 }
function Run($exe, $argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { Fail "$exe $($argList -join ' ') failed (exit $LASTEXITCODE)." }
}

# 1. Keep the server's own settings (ledger names, the service key).
Step "Backing up config.json"
if (Test-Path "config.json") {
  $backup = "config.backup-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss")
  Copy-Item "config.json" $backup
  Write-Host "Saved $backup (git-ignored, holds the service key: keep it on this server)."
} else {
  Fail "config.json not found here. Copy config.example.json to config.json and fill it in first."
}

# 2. The new code. A git checkout pulls; a copied folder is updated by hand first.
if (-not $SkipPull) {
  Step "Getting the latest code"
  $repo = (& git -C $here rev-parse --show-toplevel 2>$null)
  if (-not $repo) { Fail "This folder is not a git checkout. Copy the new Ortex.Tally.Connector files in (keep config.json), then run again with -SkipPull." }
  Run "git" @("-C", $repo, "pull", "--ff-only")
}

# 3. Dependencies exactly as locked.
Step "Installing dependencies"
Run "npm.cmd" @("ci", "--omit=dev")

# 4. Offline self-test of the XML builders and the write-back (no Tally, no database).
Step "Running the self-test"
Run "npm.cmd" @("run", "fixture")

# 5. The server's config against the new example (never prints the key).
Step "Checking config.json"
Run "npm.cmd" @("run", "check-config")

# 6. One time: run the connector as a scheduled task that starts with Windows
#    and restarts itself if it stops.
if ($InstallTask) {
  Step "Registering the scheduled task '$TaskName'"
  $node = (Get-Command node -ErrorAction Stop).Source
  New-Item -ItemType Directory -Force -Path (Join-Path $here "logs") | Out-Null
  # No console window under a task: the connector's output goes to logs\connector.log.
  $cmdArgs = '/c ""{0}" src\index.js >> logs\connector.log 2>&1"' -f $node
  $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmdArgs -WorkingDirectory $here
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host "Registered. It starts with Windows (it needs TallyPrime running with the company open). Log: logs\connector.log"
}

# 7. Restart, only after everything above passed.
if (-not $NoRestart) {
  Step "Restarting the connector"
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Restarted task '$TaskName'."
  } else {
    Write-Host "No scheduled task '$TaskName'. If it runs in a console window, close it and run: npm start" -ForegroundColor Yellow
    Write-Host "Or register the task once with: powershell -ExecutionPolicy Bypass -File .\update.ps1 -InstallTask" -ForegroundColor Yellow
  }
}

Write-Host "`nDone. First sync after an update: try 'npm run dry-run' and check the XML in out\ before relying on it." -ForegroundColor Green
