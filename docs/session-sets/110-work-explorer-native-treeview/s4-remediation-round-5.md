# Session 4 - remediation of verification round 5

> Round 5 returned **ISSUES_FOUND** with one blocking Major:
> the extension-side Copilot seat setup still wrote `transport.profile:
> copilot-cli` into shared `ai_router/router-config.yaml`, the UI message
> still named that shared file, the docs still described the old target, and
> the extension schema validator rejected the new `local-overrides.yaml`
> transport override.
>
> Accepted in full.

## Fix

1. `performCopilotSeatSetup` now targets
   `ai_router/local-overrides.yaml` via `LOCAL_OVERRIDES_REL`, creating the file
   when missing, appending a `transport:` block when the local file exists but
   has no transport block, and using the existing anchored profile replacement
   only inside that local file.
2. The operator-facing setup success/failure text now names
   `ai_router/local-overrides.yaml` and no longer tells the operator that the
   profile was written to shared `router-config.yaml`.
3. The config editor schema now allows exactly
   `local-overrides.yaml -> transport.profile` with values `api` or
   `copilot-cli`, while still rejecting unknown nested transport keys.
4. `docs/concepts/tier-model.md` now documents guided and manual Copilot-seat
   activation as local-overrides-only.
5. The generated extension bundle was rebuilt so the packaged extension matches
   the TypeScript source.

## Acceptance checks

### Before/after source contract

Command:

```powershell
$copilotPath = 'tools/dabbler-ai-orchestration/src/utils/copilotSeatSetup.ts'
$schemaPath = 'tools/dabbler-ai-orchestration/src/configEditor/schemaValidator.ts'
function Read-HeadText($p) { git --no-pager show "HEAD:$p" | Out-String }
function Read-WorkText($p) { Get-Content ($p -replace '/', '\') -Raw }
function Test-State($label, $read) {
  $copilot = & $read $copilotPath
  $schema = & $read $schemaPath
  $checks = @(
    [pscustomobject]@{
      Check='seat setup writes local-overrides target'
      Pass=($copilot -match 'const configAbs = path\.join\(deps\.projectDir, LOCAL_OVERRIDES_REL\);')
    },
    [pscustomobject]@{
      Check='seat setup no longer targets shared router-config'
      Pass=($copilot -notmatch 'const configAbs = path\.join\(deps\.projectDir, ROUTER_CONFIG_REL\);')
    },
    [pscustomobject]@{
      Check='success message names ai_router/local-overrides.yaml'
      Pass=($copilot -match 'ai_router/local-overrides\.yaml')
    },
    [pscustomobject]@{
      Check='schema permits local transport.profile api/copilot-cli'
      Pass=($schema -match 'transport:\s*\{[\s\S]*?profile:\s*\{[\s\S]*?enum:\s*\["api", "copilot-cli"\]')
    }
  )
  $failed = @($checks | Where-Object { -not $_.Pass })
  Write-Output "[$label]"
  $checks | ForEach-Object {
    if ($_.Pass) { $status = 'PASS' } else { $status = 'FAIL' }
    Write-Output ($status + ' - ' + $_.Check)
  }
  if ($failed.Count -gt 0) {
    Write-Output "RESULT: FAIL ($($failed.Count) check(s) failed)"
  } else {
    Write-Output 'RESULT: PASS'
  }
  Write-Output ''
}
Test-State 'pre-fix HEAD' ${function:Read-HeadText}
Test-State 'fixed working tree' ${function:Read-WorkText}
```

Output:

```text
[pre-fix HEAD]
FAIL - seat setup writes local-overrides target
FAIL - seat setup no longer targets shared router-config
FAIL - success message names ai_router/local-overrides.yaml
FAIL - schema permits local transport.profile api/copilot-cli
RESULT: FAIL (4 check(s) failed)

[fixed working tree]
PASS - seat setup writes local-overrides target
PASS - seat setup no longer targets shared router-config
PASS - success message names ai_router/local-overrides.yaml
PASS - schema permits local transport.profile api/copilot-cli
RESULT: PASS
```

### Targeted extension unit coverage

Command:

```powershell
Push-Location tools\dabbler-ai-orchestration
npm run test:unit -- --grep "(performCopilotSeatSetup|describeSeatSetupOutcome|schemaValidator . local-overrides)"
Pop-Location
```

Output summary:

```text
35 passing
```

This covers the guided setup write target, missing-file creation, append-only
local transport block path, success/failure messages, and the
`local-overrides.yaml` schema allowlist/strict-closure behavior.

### Build and type-check

Command:

```powershell
Push-Location tools\dabbler-ai-orchestration
npm run compile
npx tsc --outDir out --pretty false
Pop-Location
```

Output summary:

```text
[esbuild] copied consumer-bootstrap template bundle -> dist\templates\consumer-bootstrap
[esbuild] copied sample-project bundle -> dist\templates\sample-project
```
