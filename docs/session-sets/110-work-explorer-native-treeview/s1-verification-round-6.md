ISSUES FOUND

Fix verdict: L1 startup-effect overclaim -- fix-accepted  
Fix verdict: L2 -- duplicate-of L1  
Fix verdict: L3 four-action spike extrapolation -- accepted-with-modification  
Fix verdict: L4 missing marker precedence -- fix-accepted  
Fix verdict: L5 required startup buckets remain unmeasured in a real host -- fix-rejected  
Fix verdict: L6 contradictory startup directives -- fix-accepted  
Fix verdict: L7 final density mapping and operator confirmation -- fix-accepted  
Fix verdict: L8 -- duplicate-of L5  

- **Issue 1: The remediation still does not measure real extension activation, real view resolution, or webview cold start to first paint**
  - **Category:** Completeness / Correctness
  - **Severity:** Major
  - **Failure scenario:** S2–S3 proceed and remove the existing webview before the session has captured the migration-specific baseline. S4 then discovers that real extension-host activation or renderer first-paint behavior differs materially from the stub figures, with no contemporaneous real-host baseline supporting comparison. This is probable because the renderer timing is wholly absent and VS Code API, extension-host, Electron, and IPC behavior are deliberately excluded from the other measurements.
  - **Details:**
    - **Violation:** Step 3 requires separate measurement of “extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint.” The adjudication further required “a real, cold extension activation time” using a fresh VS Code Extension Development Host. The decision nevertheless claims “three of the spec’s four buckets” are measured.
    - **Location:** `tools/dabbler-ai-orchestration/scripts/cold-activation.js`, `tools/dabbler-ai-orchestration/scripts/activation-harness.ts`, `s1-activation-baseline.json`, and `s1-migration-decision.md` §2.
    - **Evidence:** `cold-activation.js` launches fresh **Node** processes and explicitly installs `src/test/vscode-stub.js`; it never launches VS Code or an Extension Development Host. Its output admits that Electron, extension-host bootstrap, IPC, and the real VS Code API are excluded. `activation-harness.ts` likewise uses the stub and a fake `WebviewView`. The decision explicitly records renderer first paint as “still unmeasured” and substitutes payload bytes, which do not measure latency.
    - **Impact:** The session’s “measure before committing” objective remains unmet, and its assertion that three buckets are measured gives unsupported confidence in the GO baseline. This is the same unresolved defect underlying L5 and L8.
    - **Fix:** Run five genuinely cold Extension Development Host instances against the shipping extension. Measure activation through completion, time `resolveWebviewView` against the actual host/webview, and instrument the renderer to report first paint—for example, after layout plus `requestAnimationFrame`. Report medians separately and retain payload bytes only as supplementary evidence.

## NITS

- **Nit:** L3’s count mismatch is fixed by capping inline actions at two, but two actions were demonstrated only at default width. The document correctly records minimum-width validation as an S4 residual rather than claiming it was proven.
- **Nit:** `cold-activation.js` starts `moduleLoadMs` before loading the VS Code stub and configuring `workspaceFolders`, yet the JSON describes it as the time for `require()` of `dist/extension.js`. If retained as supplementary data, either move the timer immediately around `require(BUNDLE)` or rename the bucket to reflect everything included.