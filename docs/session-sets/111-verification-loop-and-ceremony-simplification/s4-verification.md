**ISSUES FOUND**

- **Issue 1:** The walk stager does not actually make the walk start itself.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical operator runs `npm run walk` and VS Code opens the fixture workspace, but the Dabbler view is not revealed because the reveal code only runs inside extension activation and nothing activates the extension at startup. This is probable for every fresh walk: `stage-walk.js` only sets `DABBLER_WALK=1`, `extension.ts` checks it inside `activate()`, and `package.json` has `"activationEvents": []`.
  - **Acceptance criterion:** `JUDGMENT - Running npm run walk from tools/dabbler-ai-orchestration must open the Extension Development Host with the Dabbler AI Orchestration view visible without the operator clicking the activity bar.`
  - **Details:** Violation: the plan requires “one entry point that launches the real Extension Development Host with a fixture so a walk starts itself.” Impact: the central UAT deliverable preserves the exact manual staging friction it was meant to remove. Evidence: `stage-walk.js` sets `DABBLER_WALK` in the spawned environment, `extension.ts` reveals the view only from inside `activate()`, and `package.json` provides no startup activation trigger.

- **Issue 2:** The stager duplicates, and regresses, Playwright VS Code binary discovery instead of reusing the launch machinery.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On macOS, after the Playwright harness has a valid `.vscode-test/vscode-darwin-.../Visual Studio Code.app/Contents/MacOS/Electron` cache, `npm run walk` still fails to find Code because `scripts/vscode-launch.js` never searches inside `.app` bundles. This is probable for every macOS walk using the standard `@vscode/test-electron` cache layout.
  - **Acceptance criterion:** `JUDGMENT - The walk stager must use the same VS Code binary-resolution behavior as the Playwright harness, including resolving macOS .app bundle caches.`
  - **Details:** Violation: the plan says to “reuse the Playwright `launchVSCode` machinery.” Impact: the walk stager fails on a supported platform even when the test harness would launch successfully. Evidence: `electronLaunch.ts` searches `.app/Contents/MacOS` via `resolveCodeExecutable`; `scripts/vscode-launch.js` only checks top-level `Code.exe`, `Contents/MacOS/Electron`, and `code`.

#### NITS

- **Nit:** The dogfood walk’s `run_of_record check` command currently reads the previous session’s disposition, so pre-close it reports the Playwright surface as untouched. If that step is meant to demonstrate S4 freshness, it should pass explicit `--files-changed` or wait until the S4 disposition exists.
- **Nit:** `ai_router/run_of_record.py` still says “A timestamp comparison does” even though the implementation intentionally uses content digests, which makes the rationale internally inconsistent.