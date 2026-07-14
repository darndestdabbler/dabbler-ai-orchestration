ISSUES FOUND

Fix verdict: L1 legacy repositories with existing sets are no longer seeded with Default -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 prior VSIX/package and rendering remediation remains settled -- fix-accepted  
Fix verdict: L4 Work Explorer fresh and legacy end-state coverage was added -- fix-accepted  
Fix verdict: L5 mandatory packaged-VSIX walkthrough remains unperformed -- fix-rejected

- **Issue 1: The required locally built VSIX first-run walkthrough is still absent**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The session can close with `dogfood-pass` even though no test or recorded walkthrough invokes Build and completes Default → rename → delete → re-add through the packaged extension. Typical users always traverse the packaged activation, command-registration, and UI-action layers, while the replacement test bypasses those layers. A defect in that integration path can therefore reach every user despite the acceptance gate claiming success.
  - **Details:**
    - **Violation:** The specification explicitly requires: “walk Default → rename → delete → re-add a real module — the full first-run loop against the locally built VSIX.”
    - **Impact:** The mandatory main-path acceptance criterion remains unmet. This changes a reasonable merge decision because package activation, actual command dispatch through VS Code, and rename/delete/re-add UI integration remain unverified.
    - **Evidence:** The new test in `gitScaffoldCore.test.ts` replaces `vscode.commands.registerCommand` with a stub, captures its callback, and invokes that callback directly. It neither installs nor launches the locally packaged VSIX, uses `vscode.commands.executeCommand`, nor performs rename, delete, or re-add. The added third-party opinion also explicitly concludes that the prior evidence is “not sufficient” and recommends an Extension Host integration test; the implemented stub-level callback test is not that recommended test.
    - **Location:** `tools/dabbler-ai-orchestration/src/test/suite/gitScaffoldCore.test.ts`, suite `gitScaffold — dabbler.setupNewProject command wiring`.
    - **Fix:** Perform and record the specified walkthrough against an installed locally built VSIX. If native-dialog automation is impractical, use a real Extension Host integration test that invokes the registered commands through `vscode.commands.executeCommand`, stubs only the native input APIs, and verifies Build, rename, delete, and re-add filesystem and tree outcomes.