ISSUES FOUND

- Fix verdict: L1 launcher interpreter probe -- fix-rejected
- Fix verdict: L2 dogfood full setup/default-module proof -- fix-rejected
- Fix verdict: L3 -- duplicate-of L1
- Fix verdict: L4 -- duplicate-of L2
- Fix verdict: L5 dogfood CI host interpreter provisioning -- fix-accepted

**Issue 1:** The new `launcherPython` is resolved before cold-start setup creates `.venv`, so the capability probe can target bare `python` while later module launchers would use the newly created venv.
- **Category:** Correctness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/src/commands/installAiRouterCommands.ts:62-68`, `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts:563-570`, `tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts:356-369`, `tools/dabbler-ai-orchestration/src/utils/pythonInterpreter.ts:120-126`
- **Failure scenario:** A typical fresh project has no explicit `dabblerSessionSets.pythonPath` and no existing `.venv`. The install command/scaffold computes `launcherPython` as bare `python`, then `installAiRouter` creates `<workspace>/.venv` and installs the router there, but `verifyRouterCapability` probes bare `python`. On a normal machine where global Python does not have `dabbler-ai-router`, setup reports install failure and skips default-module creation even though the actual launchers would resolve the new `.venv` after creation.
- **Acceptance criterion:** `JUDGMENT - In a fresh workspace with no explicit pythonPath and no existing .venv, the post-install capability probe must target the newly-created workspace .venv interpreter, while an explicit non-venv pythonPath must still be probed as the launcher interpreter.`
- **Details:** Violation: the task requires probing “the same venv interpreter the launcher will use.” Impact: this blocks the main cold-start setup path and would change the merge decision because the release gate can ship a setup that falsely reports router failure. Evidence: `resolvePythonInterpreter` returns bare `python` when no `.venv` exists, but it is called before `installAiRouter`; `verifyRouterCapability` then trusts that stale value instead of re-resolving after venv creation.

**Issue 2:** The remediation dogfood still bypasses the production setup path that Issue 1 breaks.
- **Category:** Completeness / False Positive
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/src/test/dogfood/routerFloorProvisioning.test.ts:168-178`, `tools/dabbler-ai-orchestration/src/test/dogfood/routerFloorProvisioning.test.ts:207-212`, `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts:563-570`
- **Failure scenario:** `npm run test:dogfood` can pass while real fresh setup fails: the dogfood calls `installAiRouter` directly without `launcherPython`, so the probe falls back to the venv, and it scaffolds the default module with an injected `resolveInterpreter: () => venvPy`. Production `buildProjectStructureNoPrompt` passes the pre-created stale `launcherPython`, causing the main setup path to fail before default-module scaffolding.
- **Acceptance criterion:** `JUDGMENT - The dogfood or equivalent coverage must exercise the production cold-start setup interpreter handoff, including the launcher interpreter value supplied by the scaffold/install command, and fail if that value is stale bare python instead of the created .venv.`
- **Details:** Violation: the dogfood was supposed to prove a clean project “finishes setup with ai_router.modules importable from the created venv and the default module present.” Impact: the lane remains false-green for the exact setup regression it is meant to release-gate. Evidence: the dogfood omits `launcherPython` and forces module creation through `venvPy`, while production supplies `launcherPython: resolvePythonInterpreter(projectDir)` before the install creates `.venv`.