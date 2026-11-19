[CmdletBinding()]
param(
    [switch]$IncludeMedical,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repoRoot "DiQuaMuaHaa\backend"
$frontendRoot = Join-Path $repoRoot "DiQuaMuaHaa\frontend\demothuattoanpro"
$runtimeRoot = Join-Path $repoRoot ".runtime"
$pidFile = Join-Path $runtimeRoot "dev-processes.json"

function Import-DotEnvFile([string]$Path, [string]$AllowedPrefix = "") {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $separator = $trimmed.IndexOf("=")
        if ($separator -lt 1) { throw "Invalid .env line in $Path" }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "Invalid environment variable name in $Path" }
        if ($AllowedPrefix -and -not $name.StartsWith($AllowedPrefix, [System.StringComparison]::Ordinal)) {
            throw "Only $AllowedPrefix variables are allowed in $Path"
        }
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
    Write-Host "Loaded local environment file without printing its values: $Path"
}

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Assert-LastExit([string]$Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

Import-DotEnvFile (Join-Path $backendRoot ".env")
Import-DotEnvFile (Join-Path $frontendRoot ".env.local") "VITE_"

Assert-Command "python"
Assert-Command "node"
Assert-Command "npm"

Write-Host "Runtime versions:"
python --version
Assert-LastExit "Python is installed but could not run."
node --version
Assert-LastExit "Node.js is installed but could not run."
npm --version
Assert-LastExit "npm is installed but could not run."

$viteEntry = Join-Path $frontendRoot "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $viteEntry -PathType Leaf)) {
    throw "Frontend dependencies are missing. Run: npm --prefix `"$frontendRoot`" ci"
}

Push-Location $backendRoot
try {
    python -B -c "import os, importlib, flask, flask_socketio, joblib, mediapipe, numpy, pymysql, sklearn; importlib.import_module('eventlet') if os.name != 'nt' else None"
    Assert-LastExit "Backend dependencies are incomplete. Install requirements.txt first."
} finally {
    Pop-Location
}

$dbBackend = if ($env:DB_BACKEND) { $env:DB_BACKEND.ToLowerInvariant() } else { "mysql" }
if ($dbBackend -notin @("mysql", "postgres")) { throw "DB_BACKEND must be mysql or postgres." }
if ($dbBackend -eq "postgres" -and -not $env:DATABASE_URL) { throw "DATABASE_URL is required when DB_BACKEND=postgres." }
if ($IncludeMedical -and (-not $env:MEDICAL_DATABASE_URL -or -not $env:JWT_SECRET_KEY)) {
    throw "IncludeMedical requires MEDICAL_DATABASE_URL and JWT_SECRET_KEY."
}

foreach ($artifact in @("landmark_model.pkl", "hand_model.pkl", "phone_yolo.onnx")) {
    $artifactPath = Join-Path $backendRoot "driver_training\models\$artifact"
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
        Write-Warning "Optional/runtime model is missing: $artifactPath"
    }
}

Write-Host "Preflight passed. No dependency installation or database migration was performed."
if ($CheckOnly) { return }

if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
    throw "A runtime PID file already exists. Run scripts\Stop-DmsDevelopment.ps1 or inspect $pidFile"
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$started = @()
try {
    $backendProcess = Start-Process -FilePath "python" -ArgumentList @("-B", "app.py") -WorkingDirectory $backendRoot -RedirectStandardOutput (Join-Path $runtimeRoot "dms-backend.out.log") -RedirectStandardError (Join-Path $runtimeRoot "dms-backend.err.log") -WindowStyle Hidden -PassThru
    $started += [PSCustomObject]@{ Name = "dms-backend"; Id = $backendProcess.Id; StartedAtUtc = $backendProcess.StartTime.ToUniversalTime().ToString("o") }

    if ($IncludeMedical) {
        $medicalProcess = Start-Process -FilePath "python" -ArgumentList @("-B", "len.py") -WorkingDirectory $backendRoot -RedirectStandardOutput (Join-Path $runtimeRoot "medical-backend.out.log") -RedirectStandardError (Join-Path $runtimeRoot "medical-backend.err.log") -WindowStyle Hidden -PassThru
        $started += [PSCustomObject]@{ Name = "medical-backend"; Id = $medicalProcess.Id; StartedAtUtc = $medicalProcess.StartTime.ToUniversalTime().ToString("o") }
    }

    $frontendProcess = Start-Process -FilePath "node" -ArgumentList @($viteEntry, "--host", "127.0.0.1") -WorkingDirectory $frontendRoot -RedirectStandardOutput (Join-Path $runtimeRoot "frontend.out.log") -RedirectStandardError (Join-Path $runtimeRoot "frontend.err.log") -WindowStyle Hidden -PassThru
    $started += [PSCustomObject]@{ Name = "frontend"; Id = $frontendProcess.Id; StartedAtUtc = $frontendProcess.StartTime.ToUniversalTime().ToString("o") }

    Start-Sleep -Seconds 2
    foreach ($entry in $started) {
        $process = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
        if (-not $process -or $process.HasExited) { throw "$($entry.Name) exited during startup. Check .runtime logs." }
    }

    $started | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
} catch {
    foreach ($entry in $started) { Stop-Process -Id $entry.Id -ErrorAction SilentlyContinue }
    throw
}

Write-Host "Development services started in hidden background processes:"
Write-Host "  Frontend:    https://127.0.0.1:5173"
Write-Host "  DMS backend: http://127.0.0.1:8000"
if ($IncludeMedical) { Write-Host "  Medical API: http://127.0.0.1:5000" }
Write-Host "Logs and PID metadata: $runtimeRoot"
Write-Host "Stop safely with: powershell -ExecutionPolicy Bypass -File scripts\Stop-DmsDevelopment.ps1"
