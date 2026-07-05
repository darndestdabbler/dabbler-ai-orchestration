- **Issue** → The new async `taskkill` fallback path is untested.  
  **Location** → `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts` `makeRefreshChildSpawner().kill`; `tools/dabbler-ai-orchestration/src/test/suite/copilotSeatSetup.test.ts` kill/dispatch coverage.  
  **Fix** → Add a seam for the spawned `taskkill` child (or extract a small launcher helper) and a unit test that emits the taskkill child’s `"error"` event and asserts the fallback `child.kill()` runs.

- **Issue** → `skip-install-incomplete` honesty tests still pin only the positive half of the invariant.  
  **Location** → `tools/dabbler-ai-orchestration/src/test/suite/copilotSeatSetup.test.ts`, `describeSkipInstallIncompleteHonesty` suite.  
  **Fix** → Add reciprocal negative assertions: keyless should `doesNotMatch(/api profile working/)`, keyed should `doesNotMatch(/not functional/)`.