# Publish dabbler-ai-router to PyPI using the token in
# PYPI_AIROUTER_API_TOKEN. The token is passed to twine through its own
# environment variables and is never echoed or written to disk.
#
#   .\scripts\publish_pypi.ps1            # upload dist\*1.0.1*
#   .\scripts\publish_pypi.ps1 -Version 1.0.2

param(
    [string]$Version = "1.0.1"
)

$ErrorActionPreference = "Stop"

$token = $env:PYPI_AIROUTER_API_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Error "PYPI_AIROUTER_API_TOKEN is not set. Set it in this shell (or your profile) and re-run."
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }

$artifacts = Get-ChildItem (Join-Path $repoRoot "dist") -File |
    Where-Object { $_.Name -match [regex]::Escape($Version) -and $_.Extension -in ".whl", ".gz" }
if (-not $artifacts) {
    Write-Error "No $Version artifacts in dist\. Build first: $python -m build --wheel"
}

& $python -m pip install --quiet twine

# Token auth: username is the literal __token__; the token is the password.
$env:TWINE_USERNAME = "__token__"
$env:TWINE_PASSWORD = $token
try {
    # --skip-existing: re-running after a successful upload is a no-op
    # warning, not a 400 — PyPI never accepts the same file twice.
    & $python -m twine upload --non-interactive --skip-existing ($artifacts | ForEach-Object FullName)
    if ($LASTEXITCODE -ne 0) { Write-Error "twine upload failed (exit $LASTEXITCODE)" }
    Write-Host "Published (or already present) $($artifacts.Count) artifact(s) for $Version."
}
finally {
    # Do not leave credentials in the shell's environment after the run.
    Remove-Item Env:TWINE_USERNAME, Env:TWINE_PASSWORD -ErrorAction SilentlyContinue
}
