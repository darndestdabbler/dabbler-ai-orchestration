- **Issue → No new implementation defect found in the Set 059 S1 fix**
  - **Location →** `src/extension.ts`, `src/wizard/WizardPanel.ts`, `src/commands/gitScaffold.ts`, `webview/wizard.html`
  - **Fix →** None. The no-folder activation path is now provider/command-first and folder-defensive, and the wizard tier handoff is correct: `wizard.html` posts the selected tier, `WizardPanel.ts` forwards it, and `asTier()` safely narrows untrusted input and falls back to `promptTier()` when invalid or absent.

- **Issue → Remaining regression gap: the actual no-folder UX is not asserted**
  - **Location →** `src/test/suite/activationNoFolder.test.ts`
  - **Fix →** Extend the test to cover behavior, not just registration:
    1. capture the `registerWebviewViewProvider` callback/provider and resolve it once with `workspaceFolders = undefined` to prove the Session Sets view renders the intended empty state instead of only proving registration, and  
    2. stub `vscode.commands.executeCommand` to assert activation does not unexpectedly auto-trigger onboarding / `dabbler.getStarted` in a fresh no-folder window.  
    The existing `context.subscriptions` teardown is correct and should remain; it is the right fix for the poll timer leak.