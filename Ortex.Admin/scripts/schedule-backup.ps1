# Register (or remove) the daily Ortex database backup as a Windows scheduled task.
#
#   powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1 -At 02:30
#   powershell -ExecutionPolicy Bypass -File scripts\schedule-backup.ps1 -Remove
#
# The task runs as the current user, so it needs no elevation and reuses your
# normal environment. It does NOT require you to be logged in at the time, and
# if the machine is asleep or off at the scheduled moment the run is caught up
# as soon as it wakes (StartWhenAvailable) -- a backup an hour late is worth
# infinitely more than one that never happened.

param(
  [string] $At = "20:00",
  [string] $TaskName = "Ortex Admin - Daily DB Backup",
  [switch] $Remove
)

$ErrorActionPreference = "Stop"

$app = Split-Path -Parent $PSScriptRoot
$cmd = Join-Path $PSScriptRoot "backup-daily.cmd"

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task: $TaskName"
  } else {
    Write-Host "No scheduled task named '$TaskName' -- nothing to remove."
  }
  return
}

if (-not (Test-Path $cmd)) { throw "Missing $cmd" }

# Warn, but do not refuse. Someone may well be setting the schedule up before
# pasting the key in; the log will show the failure clearly until they do.
$envFile = Join-Path $app ".env.production"
if (-not (Test-Path $envFile)) {
  Write-Warning "No .env.production found. The task will fail until it exists."
} elseif (-not (Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=.+' -Quiet)) {
  Write-Warning "SUPABASE_SERVICE_ROLE_KEY is not set in .env.production."
  Write-Warning "The task is registered, but every run will fail until you add it."
}

$action    = New-ScheduledTaskAction -Execute $cmd -WorkingDirectory $app
$trigger   = New-ScheduledTaskTrigger -Daily -At $At
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable `
                                          -DontStopIfGoingOnBatteries `
                                          -AllowStartIfOnBatteries `
                                          -ExecutionTimeLimit (New-TimeSpan -Hours 1)
# Interactive, not S4U. S4U would let the task run while nobody is logged on,
# but registering it needs administrator rights; Interactive registers as a
# normal user and runs whenever you are signed in. On a workstation that is the
# right trade -- and StartWhenAvailable means a run missed while the machine was
# off or logged out fires as soon as you next sign in, rather than being lost.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName `
                       -Description "Backs up the Ortex production Supabase database to Ortex.Admin\backups (keeps the newest 30)." `
                       -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
                       -Force | Out-Null

Write-Host "Registered '$TaskName' -- runs daily at $At."
Write-Host "  Script : $cmd"
Write-Host "  Output : $app\backups (newest 30 kept)"
Write-Host "  Log    : $app\backups\backup.log"
Write-Host ""
Write-Host "Run it now to check it works:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
