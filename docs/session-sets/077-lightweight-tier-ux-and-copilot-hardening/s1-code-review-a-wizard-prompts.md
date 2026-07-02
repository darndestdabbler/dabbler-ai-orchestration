# S1 code-review bundle a-wizard-prompts (raw, unedited)

> model: sonnet  tier: 2  cost_usd: 0.1825  total_cost_usd: 0.2085
> truncated: False  escalated: False
> verifier: gemini-pro  verdict: ISSUES_FOUND

---

## Pinned-finding triage

### A1 — PARTIAL

**Evidence:** `sessionGenPrompt.ts` ~99–104, ~131–137

```typescript
const exemplarTier: Tier = options.tier ?? "full";          // always "full" on palette invoke
...
const tierGuidance = options.tier                           // guarded: falsy when tier undefined
    ? `- **Tier.** The operator selected the **${options.tier}** tier in the Getting Started form…`
    : "";
```

The fallback to `"full"` is real and biases palette-command invocations toward Full exemplars. The "fabricated rationale" characterisation is imprecise: `tierGuidance` is gated on `options.tier` being defined, so the palette path emits no `"operator selected"` sentence. The actual defect is softer but still material: a Lightweight operator who uses the palette command directly (or whose Getting Started webview loses state after VS Code reload) receives Full exemplars with zero tier guidance, silently steering the decomposing AI toward Full session sets.

---

### A2 — CONFIRMED

**Evidence:** `copyPromptCommands.ts` `buildSpecReviewPrompt` ~87–101, `buildSessionAccomplishmentsPrompt` ~103–130, `buildSetAccomplishmentsPrompt` ~133–161; `externalVerification.ts` `openOrCreate` ~38–57.

All three review-prompt builders tell the AI to *flag* issues in its chat response but give no instruction to persist findings anywhere. `externalVerification.ts` creates `external-verification.md` as an intentional empty canvas yet no prompt text references that path. Findings exist only in the AI chat transcript unless the operator manually copies them; `external-verification.md` stays empty unless the operator knows to do so unprompted.

---

### A9 — CONFIRMED

**Evidence:** `copyPromptCommands.ts` `buildVerificationKickoffPrompt` ~186–222 (~35 lines, 6 procedural numbered steps) vs `buildSetAccomplishmentsPrompt` ~133–161 (~10 lines, no output-writing instruction).

Complexity is inverted: the verification kickoff carries a full procedure (including cross-provider confirmation, bounded-round rules, conditional remediation branch) while the review prompts—which also need an output landing target (A2)—are bare. The inversion is observable and confirmed.

---

## New findings

### [Major] Unguarded synchronous fs operations in `importPlanFromFile` will surface as unhandled rejections

**File:** `planImport.ts` ~82–86

```typescript
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
// ...
fs.copyFileSync(picked[0].fsPath, destPath);
```

**Defect:** Neither `fs.mkdirSync` nor `fs.copyFileSync` is wrapped in a try-catch. Both throw on EACCES (locked-down `docs/planning/` on a managed Windows machine), ENOSPC (disk full), or EPERM (antivirus holding the source file open—extremely common on Windows). An unhandled exception propagates through the `async` command handler as an unhandled promise rejection; VS Code surfaces a generic "command failed" notification with no actionable detail.

**Requirement violated:** The command is the primary plan-import surface for the corporate Lightweight team launching 2026-07-06; silent failure here blocks the entire wizard.

**Concrete impact:** Operator sees a non-descriptive VS Code error; `project-plan.md` is not written; no recovery path is suggested.

**Fix direction:** Wrap both calls in a try-catch; surface the error via `ui.showErrorMessage` with the `err.message` and the destination path:
```typescript
try {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(picked[0].fsPath, destPath);
} catch (err) {
  void ui.showErrorMessage(
    `Failed to write ${PLAN_DEST}: ${err instanceof Error ? err.message : String(err)}`
  );
  return false;
}
```

---

### [Major] Verification kickoff prompt embeds unquoted paths — broken on any workspace with spaces

**File:** `copyPromptCommands.ts` `buildVerificationKickoffPrompt` ~213, ~219

```typescript
`   \`python -m ai_router.start_session --session-set-dir ${setDirRel} --type verification --engine <your-engine>…\`\n`
`   \`python -m ai_router.start_session --session-set-dir ${setDirRel} --type remediation --handoff…\`\n`
```

**Defect:** `setDirRel` is interpolated bare into the command strings shown in the prompt. Windows workspace paths containing spaces (e.g. `docs/session-sets/001-user-auth` inside `C:\Users\John Doe\my project`) cause the shell to parse `my` and `project` as separate arguments; Python receives a truncated `--session-set-dir` value and fails with an opaque ENOENT or argparse error.

**Requirement violated:** The verification kickoff prompt is a mission-critical artifact for the dedicated-sessions flow (Set 062 S2); if the embedded command is structurally broken the operator cannot start the verified flow without manual diagnosis.

**Concrete impact:** Operator pastes the prompt, runs the command, gets a Python traceback referencing a path that doesn't exist; no indication the prompt itself is malformed.

**Fix direction:**
```typescript
const quotedDir = `"${setDirRel}"`;
// then use quotedDir in both command strings
`   \`python -m ai_router.start_session --session-set-dir ${quotedDir} --type verification…\``
```
Apply the same quoting to any `setDirRel` interpolation in both step 3 and step 5.

---

### [Minor] `defaultFileExists` wraps `fs.existsSync` in dead try-catch

**File:** `copyPromptCommands.ts` ~52–57

```typescript
function defaultFileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}
```

`fs.existsSync` never throws (it catches internally and returns `false`). The catch block is unreachable. This misleads readers into assuming the function has meaningful error-handling semantics and makes the injectable `BuildContext.fileExists` interface look more defensive than it is.

**Fix:** Remove the try-catch; return `fs.existsSync(filePath)` directly.

---

### [Minor] `reviewCriteriaTrailer` embeds operator criteria with no size limit

**File:** `copyPromptCommands.ts` `defaultReadReviewCriteria` ~60–70, `reviewCriteriaTrailer` ~72–85

`fs.readFileSync(candidate, "utf8")` reads the entire file unconditionally. An operator who accidentally saves a multi-MB asset as `docs/review-criteria/spec.md` silently bloats the clipboard payload on every spec-review copy. No truncation, no warning.

**Fix:** Add a size guard after the `existsSync` check:
```typescript
const stat = fs.statSync(candidate);
if (stat.size > 32_768) return null; // or warn and truncate
```

---

### [Minor] Floating promises without `void` in `copySessionSetGenPrompt`

**File:** `sessionGenPrompt.ts` ~163, ~175, ~180

```typescript
vscode.window.showErrorMessage("No workspace folder is open.");   // line ~163 — no void/await
// ...
vscode.window.showErrorMessage(`Could not load…`);               // line ~175 — no void/await
vscode.window.showInformationMessage("Session-set generation…");  // line ~180 — no void/await
```

The rest of the codebase consistently uses `void ui.showErrorMessage(…)` (planImport.ts) or `void vscode.window.showErrorMessage(…)` (setupVerification.ts). The missing `void` will cause strict no-floating-promises lint rules to flag these and may suppress future await-on-dialog patterns if the calls are later converted to decision points.

**Fix:** Prefix all three with `void`.

---

### [Minor] Hardcoded cost estimate in information toast will become stale

**File:** `sessionGenPrompt.ts` ~182

```
"Cost reminder: each session set typically costs $0.10–$2.00 depending on model and effort."
```

Model pricing changes frequently; this string has no configuration hook and no version tag. When the estimate becomes wrong it misinforms the Lightweight operators this review is targeting.

**Fix:** Either extract to a configuration value (`dabblerSessionSets.estimatedCostRangeHint`) with a default, or remove the dollar range and keep only the qualitative note (`"Review the generated specs before running all sessions."`).

---

## Hardening opportunities

1. **Link review prompts to `external-verification.md` (A2 follow-up):** Each review prompt builder knows `set.dir`; appending a one-line instruction—`Write your findings to \`${evRelPath}\` in the workspace.`—closes the gap between the reviewer's chat response and the durable record without changing the L1 no-embed contract.

2. **Validate Python interpreter existence before spawning (`setupVerification.ts` `runChangeWriter`):** Call `fs.existsSync(pythonPath)` before `cp.spawn`; surface a specific error (`"Python interpreter not found at ${pythonPath} — check dabblerSessionSets.pythonPath"`) rather than letting the `error` event fire a generic spawn-error string. Particularly relevant for the corporate Copilot team whose venv path may not resolve on first run.

3. **`importPlanFromFile` bypasses the `ui` abstraction for `vscode.Uri.file`** (`planImport.ts` ~88): `vscode.Uri.file(destPath)` is called directly in the exported function, not through `ui.executeCommand`. This makes the unit-testable path incomplete. Pass the URI through `ui.executeCommand("vscode.open", …)` (already present on the next line) and drop the bare `vscode` import dependency in the body.

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [? / ?]: s. However, it contains one false positive in its "Hardening opportunities" section, presented as actionable advice, which is based on a misunderstanding of the code's testing strategy.

-
**Issue 2** [False Positive / Major]: ** The third "Hardening opportunity" is a false positive that misidentifies a testability problem.
  - **Category:** False Positive
  - **Severity:** Major
  - **Details:**
    -   **Violation:** The review claims: "`importPlanFromFile` bypasses the `ui` abstraction for `vscode.Uri.file` ... This makes the unit-testable path incomplete." This finding is incorrect and violates the implicit requirement to only flag real issues.
    -   **Impact:** This incorrect advice would lead a developer to perform an unnecessary refactoring, adding a method for URI creation to the `PlanImportUi` interface. This complicates the dependency injection surface for no benefit and misdirects developer effort. Accepting this part of the review as valid would mean approving incorrect technical guidance.
    -   **Evidence:** The function `vscode.Uri.file()` is a pure utility function. It constructs a data object from a string and has no side effects or reliance on the VS Code host environment. The purpose of the `ui` abstraction is to mock *interactions* with the host (e.g., showing a dialog, writing to the clipboard, executing a command), not to mock pure data constructors. The existing code is fully unit-testable: a test can import `vscode` from the test stub, create a `Uri` object with `vscode.Uri.file()`, and then assert that the mocked `ui.executeCommand` was called with that object. The claimed testability gap does not exist.
