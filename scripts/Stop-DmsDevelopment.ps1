[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $repoRoot ".runtime"
$pidFile = Join-Path $runtimeRoot "dev-processes.json"

if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
    Write-Host "No DMS development PID file found; nothing was stopped."
    return
}

$entries = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
foreach ($entry in $entries) {
    $process = Get-Process -Id ([int]$entry.Id) -ErrorAction SilentlyContinue
    if (-not $process) {
        Write-Host "$($entry.Name) is already stopped."
        continue
    }
    $recorded = [DateTime]::Parse($entry.StartedAtUtc).ToUniversalTime()
    $actual = $process.StartTime.ToUniversalTime()
    if ([Math]::Abs(($actual - $recorded).TotalSeconds) -gt 5) {
        Write-Warning "Skipped PID $($entry.Id): process start time does not match the recorded DMS process."
        continue
    }
    Stop-Process -Id $process.Id
    Write-Host "Stopped $($entry.Name) (PID $($process.Id))."
}

Remove-Item -LiteralPath $pidFile -Force
