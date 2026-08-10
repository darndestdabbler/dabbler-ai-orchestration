<#
.SYNOPSIS
    Benchmark the ai_router pytest suite on a quiet machine.

.DESCRIPTION
    Answers four questions that the framework currently cannot answer about
    its own test cost, because `docs/session-sets/*/test-runs.jsonl` records
    the test COMMAND and OUTCOME but no duration, and CONTRIBUTING.md's
    published figures ("Layer 1 ~30s", "Layer 3 ~90s for ~10 scenarios") are
    stale by more than an order of magnitude:

      1. How long does collection take vs. execution?
         (Collection cost is the precondition for any targeted-test-selection
         rule: selecting is only worth it if identifying tests is much cheaper
         than running them.)
      2. How long does the full suite actually take, uncontended?
      3. Is the time spread evenly across ~3,800 tests, or concentrated in a
         few slow ones? These have OPPOSITE fixes -- parallelise vs. fix a
         handful of tests -- and no one has measured which it is.
      4. Does parallelism actually help? If `-n auto` barely moves the number,
         the suite is I/O- or subprocess-bound (this suite shells out to real
         CLIs), and buying more cores will not fix it.

    RUN THIS ON A QUIET MACHINE. Concurrent test runs invalidate the result --
    three overlapping full-suite runs on one box is what prompted this script.

.PARAMETER WithXdist
    Also install pytest-xdist into the venv and time a parallel run.
    This MUTATES the virtualenv, so it is opt-in.

.PARAMETER OutFile
    Where to write the report. Defaults to test-suite-benchmark-<host>.txt in
    the repo root (gitignored territory -- send the file contents back rather
    than committing it).

.EXAMPLE
    .\scripts\benchmark-test-suite.ps1
    .\scripts\benchmark-test-suite.ps1 -WithXdist
#>
[CmdletBinding()]
param(
    [switch]$WithXdist,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "No venv at $python. Run: python -m venv .venv; .venv\Scripts\pip install -e ."
}

if (-not $OutFile) {
    $OutFile = Join-Path $repoRoot "docs\test-suite-benchmark-$env:COMPUTERNAME.txt"
}

$lines = New-Object System.Collections.Generic.List[string]
function Emit([string]$s) {
    Write-Host $s
    $lines.Add($s) | Out-Null
}

Emit "=============================================================="
Emit " ai_router test-suite benchmark"
Emit "=============================================================="
Emit "generated      : $(Get-Date -Format o)"
Emit "machine        : $env:COMPUTERNAME"
Emit "logical CPUs   : $env:NUMBER_OF_PROCESSORS"
try {
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
    Emit "RAM (GB)       : $ramGB"
} catch { Emit "RAM (GB)       : (unavailable)" }
Emit "git SHA        : $(git rev-parse --short HEAD)"
Emit "git branch     : $(git rev-parse --abbrev-ref HEAD)"
Emit "git dirty      : $((git status --porcelain | Measure-Object).Count) changed path(s)"
Emit "python         : $(& $python --version 2>&1)"
Emit ""

# --- Warn about competing load -------------------------------------------
$busy = Get-Process -Name python, node -ErrorAction SilentlyContinue
if ($busy) {
    Emit "WARNING: $($busy.Count) python/node process(es) already running."
    Emit "         A contended run is NOT a valid measurement. Consider stopping them."
    Emit ""
}

# --- 1. Collection only ---------------------------------------------------
Emit "--- [1/3] Collection only (how cheap is it to IDENTIFY tests?) ---"
$sw = [Diagnostics.Stopwatch]::StartNew()
$collect = & $python -m pytest ai_router/tests -q --collect-only 2>&1 | Select-Object -Last 2
$collectSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
$collect | ForEach-Object { Emit "  $_" }
Emit "  COLLECT seconds: $collectSec"
Emit ""

# --- 2. Full suite + slowest tests ---------------------------------------
Emit "--- [2/3] Full suite, serial, with the 25 slowest tests ---"
$sw = [Diagnostics.Stopwatch]::StartNew()
$full = & $python -m pytest ai_router/tests -q --durations=25 2>&1
$fullSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
$full | Select-Object -Last 40 | ForEach-Object { Emit "  $_" }
Emit "  FULL SUITE seconds: $fullSec  ($([math]::Round($fullSec/60,2)) min)"
Emit ""

# --- 3. Parallel ----------------------------------------------------------
Emit "--- [3/3] Parallel run (-n auto) ---"
$xdistPresent = (& $python -c "import importlib.util,sys; sys.stdout.write('1' if importlib.util.find_spec('xdist') else '0')" 2>&1) -eq '1'
if (-not $xdistPresent -and $WithXdist) {
    Emit "  installing pytest-xdist (venv mutation, -WithXdist was passed)..."
    & $python -m pip install --quiet pytest-xdist 2>&1 | Out-Null
    $xdistPresent = $true
}
if ($xdistPresent) {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $par = & $python -m pytest ai_router/tests -q -n auto 2>&1
    $parSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
    $par | Select-Object -Last 12 | ForEach-Object { Emit "  $_" }
    Emit "  PARALLEL seconds: $parSec  ($([math]::Round($parSec/60,2)) min)"
    if ($fullSec -gt 0) {
        Emit "  SPEEDUP: $([math]::Round($fullSec/[math]::Max($parSec,0.01),2))x"
        Emit "  (A speedup well below the CPU count means the suite is I/O- or"
        Emit "   subprocess-bound, not CPU-bound -- more cores will not fix it.)"
    }
} else {
    Emit "  SKIPPED: pytest-xdist not installed. Re-run with -WithXdist to install and measure."
}
Emit ""

Emit "=============================================================="
Emit " SUMMARY"
Emit "=============================================================="
Emit "  collection : $collectSec s"
Emit "  full serial: $fullSec s  ($([math]::Round($fullSec/60,2)) min)"
if ($xdistPresent -and $parSec) {
    Emit "  full -n auto: $parSec s  ($([math]::Round($parSec/60,2)) min)"
}
Emit ""
Emit "Send the whole of this file back for analysis:"
Emit "  $OutFile"

$lines | Set-Content -Path $OutFile -Encoding UTF8
Write-Host ""
Write-Host "Report written to $OutFile" -ForegroundColor Green
