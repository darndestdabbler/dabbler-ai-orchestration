ISSUES_FOUND

## Major

**Issue →** Session 2 Step 5 is not fully met: *“Layer 2 tests for the full happy path: sequencing order, seat-id/label derivation, progress reporting, and the config write.”*  
**Concrete impact →** The core wiring in `gitScaffold.ts` can regress without test failure: the refresh could move earlier than install/render, stop using `venvPython(outcome.venvPath)`, or lose the cancellable notification wrapper/disposal plumbing, and the added suite would still stay green. Given the in-session race fixes already needed in this area, leaving the final integration unpinned is a Major verification gap.  
**Evidence →** The new suite imports and exercises `copilotSeatSetup.ts` and `gettingStartedActions.ts`, but not `gitScaffold.ts`. There is no test that stubs/asserts:
- seat setup runs only after scaffold/install success,
- the spawned interpreter is `venvPython(installOutcome.venvPath)`,
- `vscode.window.withProgress` is used with notification location and `cancellable: true`,
- the VS Code-layer disposal registration is wired through the real build path.

**Location →** `tools/dabbler-ai-orchestration/src/test/suite/copilotSeatSetup.test.ts`; missing companion Layer-2 coverage for `tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts`.

**Fix →** Add Layer-2 tests around `buildProjectStructureNoPrompt` / `runCopilotSeatSetupWithProgress` that stub `scaffoldConsumerRepo`, `installAiRouter`, `venvPython`, `vscode.window.withProgress`, and `vscode.window.show*Message`, and assert:
1. no refresh before successful scaffold/install completion,  
2. refresh uses `venvPython(installOutcome.venvPath)`,  
3. progress is `ProgressLocation.Notification` with `cancellable: true`,  
4. the copilot path is skipped with the documented warning when install fails / `venvPath` is unavailable.

## NITS

- `rerunRefreshHint()` omits `--binary <resolved path>` even when an explicit `copilotCliPath` setting was used for the actual run; that makes the recovery command less faithful for custom-path users.

```json
{"verdict":"ISSUES_FOUND","issues":[{"severity":"Major","category":"tests","description":"Session 2 Step 5 required Layer-2 tests to pin sequencing order, venv-interpreter reuse, progress reporting, and the config write. The added suite covers seat-id/label derivation and the pure runner/config logic, but it does not exercise gitScaffold.ts or vscode.window.withProgress, so the critical integration wiring is not actually pinned."}]}
```