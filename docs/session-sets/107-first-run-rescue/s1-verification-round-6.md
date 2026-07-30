VERIFIED

The main path satisfies the bundle, repository-local identity, resumable install, lifecycle smoke, packaging, and versioning requirements. I found no substantiated Critical/Major defect, but several non-blocking recovery and coverage gaps remain.

#### NITS

- **Nit:** Issue → The required “Full suite incl. Layer 3” result is not established; all 28 Layer-3 specs failed in harness startup, and no successful CI result is present. Location → `s1-conventions.md`, `disposition.json`. Fix → Obtain a successful Layer-3 run locally or from CI before recording `suite-green`.

- **Nit:** Issue → `createSampleProject` still violates its “Never throws” contract: the post-step `writeMarker()` calls and `await deps.installRouter()` can reject outside a guard. Location → `src/utils/sampleProject.ts`. Fix → Catch these operations, sanitize the error, and return a recoverable `SampleProjectResult`.

- **Nit:** Issue → Resume-marker validation accepts arbitrary arrays, including unknown, duplicated, or non-prefix steps; this can skip required setup such as installation. Location → `classifyTargetFolder()` in `src/utils/sampleProject.ts`. Fix → Require `completedSteps` to be an exact prefix of `SAMPLE_STEPS`.

- **Nit:** Issue → **Start Over** can delete developer-added files under generated top-level directories, while failing to remove installer-owned `.venv` and `ai_router` artifacts. Incompatible-version markers are classified as generic non-empty folders and receive no Start Over option. Location → `sampleOwnedTopLevelEntries()` and `pickTargetFolder()`. Fix → Delete exact generated paths plus installer artifacts, detect unexpected files before deletion, and provide a distinct incompatible-sample recovery flow.

- **Nit:** Issue → Every step-3 failure is reported as “Git was not found,” including commit, signing, configuration, and filesystem failures. Location → `reportSampleFailure()` in `src/commands/trySampleProject.ts`. Fix → Reserve `GIT_MISSING_MESSAGE` for the availability probe and display the sanitized actual reason for later git failures.

- **Nit:** Issue → Steps 6–7 are not failure-recoverable: `globalState.update`, `vscode.openFolder`, clipboard access, or landing display failures can reject without an actionable explanation. Location → `runTrySampleProject()` and `showPendingSampleLanding()`. Fix → Catch these failures, report the completed folder path, and preserve or clear pending state deliberately.

- **Nit:** Issue → Step-5 manual commands are appended to a hidden output channel and become visible only if the user selects **Show Log**; returned installer messages are also not sanitized at the core boundary. Location → `reportSampleFailure()` and the install branch of `createSampleProject()`. Fix → Sanitize `outcome.message` and automatically reveal the commands or include the primary retry command in the visible failure message.

- **Nit:** Issue → The “existing start affordance” is duplicated as a literal rather than reused, so the two prompt builders can drift while the current test remains green. Location → `buildSampleStarterLine()` and its test. Fix → Import and call the canonical start-next-session prompt builder.

- **Nit:** Issue → The rendered README provides both platforms’ test commands but only the Windows command for running `main.py`. Location → `docs/templates/sample-project/files/README.md`. Fix → Add `.venv/bin/python main.py` for macOS/Linux.