ISSUES FOUND

- **Issue 1: Respecify still does not implement the specified rewrite-and-reregister workflow**
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts, docs/sessions/project-work-plan.md`
  - **Failure scenario:** Every operator invoking **Respecify Session** receives instructions to preserve the existing session block and create a new block in `docs/sessions/session-plan.md`, while the active session specification is in `docs/sessions/project-work-plan.md`. Following the generated prompt therefore edits the wrong plan—or creates a new unrelated file—and `session start` cannot register the intended rewritten specification. This is probable because the incorrect path and append-new-session instructions are emitted unconditionally on the action’s main path.
  - **Acceptance criterion:** JUDGMENT - Invoking Respecify must instruct the engine to rewrite the selected session through its canonical plan/specification path and execute the valid re-registration lifecycle, without hard-coding `docs/sessions/session-plan.md` or preserving the block the task requires rewritten.
  - **Details:**
    - **Violation:** The plan requires “**respecify it (rewrite the session's entry in this plan, then re-register it)**.” The implementation instead says the original block “stays as the record,” creates `Session ${next}`, and directs the edit to `docs/sessions/session-plan.md`.
    - **Impact:** The primary Respecify action still cannot reliably transition an unresolved session to a corrected registered specification, so the prior workflow defect remains merge-blocking.
    - **Evidence:** `planRespecifyPrompt()` hard-codes `docs/sessions/session-plan.md` and explicitly tells the engine to leave session N’s block unchanged, whereas the supplied active plan is `docs/sessions/project-work-plan.md`.
    - **Fix:** Use the repository/session’s canonical specification path rather than a hard-coded filename, and generate the actual rewrite-and-reregister sequence required by the lifecycle.

### NITS

- **Nit:** The prior historical-cap defect persists. `verificationDescriptor()` now avoids displaying impossible text such as “round 6 of 3,” but the fix delta does not change `build_verification_view()`’s use of the repository’s current cap to infer historical terminal status. Lowering or raising the configured cap can therefore still relabel an old session’s state.
- **Nit:** The prior nonterminal-action defect is resolved by requiring `view.terminal !== null` in `sessionNeedsReading()`.
- **Nit:** The prior agency-detail defect is resolved: tool-operation kinds, targets, fidelity, and scope are now shown, with overflow directed to the round ledger.