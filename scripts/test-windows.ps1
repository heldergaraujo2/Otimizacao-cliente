#requires -Version 5.1
<#
.SYNOPSIS
  Validates MU-REENGINEER on Windows and optionally starts the local playable preview.
.DESCRIPTION
  Run from any directory with:
    powershell -ExecutionPolicy Bypass -File .\scripts\test-windows.ps1
  Defaults to the real MU Red data folder at .\Cliente\Data when it exists.
  The script never edits or replaces the original game client or its data.
#>
[CmdletBinding()]
param(
  [string]$DataDir = "Cliente\Data",
  [switch]$SkipInstall,
  [switch]$NoPreview
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$reportDir = Join-Path $RepoRoot "test-results"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$reportPath = Join-Path $reportDir "windows-validation.txt"
Start-Transcript -Path $reportPath -Force | Out-Null

function Invoke-Check {
  param([string]$Label, [string]$Command, [string[]]$Arguments)
  Write-Host ""
  Write-Host "========== $Label ==========" -ForegroundColor Cyan
  Write-Host ("> {0} {1}" -f $Command, ($Arguments -join " "))
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE. See $reportPath"
  }
  Write-Host "PASS: $Label" -ForegroundColor Green
}

try {
  Write-Host "MU-REENGINEER Windows validation" -ForegroundColor Cyan
  Write-Host "Repository: $RepoRoot"
  Write-Host "Date: $(Get-Date -Format o)"
  Write-Host "Node: $(& node --version)"
  Write-Host "npm: $(& npm --version)"

  if (-not $SkipInstall) {
    Invoke-Check "Install dependencies" "npm" @("ci", "--no-audit", "--no-fund")
  }

  Invoke-Check "Build all workspaces" "npm" @("run", "build")
  Invoke-Check "Automated test suite" "npm" @("test")
  Invoke-Check "Browser production build" "npm" @("run", "build:browser", "-w", "@mu-reengineer/client")

  $resolvedDataDir = if ([IO.Path]::IsPathRooted($DataDir)) {
    $DataDir
  } else {
    Join-Path $RepoRoot $DataDir
  }

  $previewDataDir = "assets-local/demo-data"
  if (Test-Path -LiteralPath $resolvedDataDir -PathType Container) {
    $relativeDataDir = Resolve-Path -LiteralPath $resolvedDataDir -Relative
    $relativeDataDir = $relativeDataDir -replace "\\", "/"
    Write-Host ""
    Write-Host "Scanning real MU data: $resolvedDataDir" -ForegroundColor Cyan
    Invoke-Check "Inspect real data inventory" "npm" @("run", "cli", "--", "scan", $resolvedDataDir)
    $previewDataDir = $relativeDataDir
  } else {
    Write-Warning "Real data folder not found at '$resolvedDataDir'. The preview will use generated demo fixtures."
    Invoke-Check "Generate demo data" "node" @("scripts/make-demo-data.mjs")
  }

  Write-Host ""
  Write-Host "PASS: build, automated tests, and browser bundle are complete." -ForegroundColor Green
  Write-Host "Report: $reportPath"
  if (-not $NoPreview) {
    Write-Host ""
    Write-Host "Starting the preview using data directory: $previewDataDir"
    Write-Host "Open the URL printed below, log in with demo / demo, and test movement."
    Write-Host "Press Ctrl+C in this window to stop the preview."
    & node "scripts/dev-preview.mjs" "--data-dir" $previewDataDir
    if ($LASTEXITCODE -ne 0) {
      throw "Preview exited with code $LASTEXITCODE. See $reportPath"
    }
  }
} catch {
  Write-Host ""
  Write-Host "VALIDATION FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Diagnostic report: $reportPath"
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
