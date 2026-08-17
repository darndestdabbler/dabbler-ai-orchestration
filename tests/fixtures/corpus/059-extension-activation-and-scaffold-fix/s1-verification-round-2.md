- **Issue → Round-1 follow-up (1) remains open**
  - **Location →** `src/test/suite/activationNoFolder.test.ts`
  - **Fix →** Closed. The test now captures the registered `WebviewViewProvider`, calls `resolveWebviewView()` with a minimal fake `WebviewView`, and asserts a non-empty HTML shell is produced without throwing. That proves the no-folder view render path executes instead of merely proving registration.

- **Issue → Round-1 follow-up (2) remains open**
  - **Location →** `src/extension.ts`, `src/test/suite/activationNoFolder.test.ts`
  - **Fix →** Closed. The implementation now explicitly gates auto-onboarding on an open folder: `!hasSeenOnboarding && (workspaceFolders?.length ?? 0) > 0`, and the new test asserts `dabbler.getStarted` is not auto-executed in a no-folder window.

- **Issue → Onboarding-gate change could regress normal with-folder onboarding**
  - **Location →** `src/extension.ts`
  - **Fix →** No defect. The added guard only suppresses the empty-window case. In a real workspace window, the prior behavior is preserved: if onboarding has not been seen and no session sets exist under discovered roots, `dabbler.getStarted` still auto-runs. The no-folder entry points remain the view CTA and Command Palette, so the behavior change is sound and non-regressive for with-folder onboarding.