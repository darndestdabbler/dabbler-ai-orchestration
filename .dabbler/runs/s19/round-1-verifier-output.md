ISSUES FOUND

### Issue 1: The UI does not show what the verifier actually inspected
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `ai_router/progress.py`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts`
- **Location:** `agencyLines()` and `verificationDescriptor()` discard the projected `agency.operations` targets.
- **Failure scenario:** For every tool-enabled verification round, an operator sees only aggregate counts such as “2 reads” and “1 search,” not which files or searches produced the finding. This is probable on the normal cross-provider/tool-agency path and materially prevents the operator from judging whether a Major finding came from relevant evidence.
- **Acceptance criterion:** `JUDGMENT - A tool-agency verification row must visibly identify the recorded operation targets and distinguish transformed reads, rather than showing only aggregate operation counts.`
- **Details:**
  - **Violation:** The plan requires reporting “**what the verifier looked at from the agency log**” and whether relied-upon reads were transformed.
  - **Impact:** The principal purpose of the view—letting an operator weigh a finding based on the verifier’s agency—is impaired because relevant-file reads and unrelated reads look identical.
  - **Evidence:** Python projects `operations` with `kind`, `target`, `fidelity`, and scope, but TypeScript’s `agencyLines()` renders only counters and transformation totals. No child node or tooltip renders operation targets.
- **Fix:** Render the recorded operations, including target and fidelity, in the verification tooltip or dedicated child rows.

### Issue 2: The advertised planning actions do not implement the required existing-command workflows
- **Category:** Completeness
- **Severity:** Major
- **Evidence paths:** `tools/dabbler-ai-orchestration/src/commands/workExplorerTreeCommands.ts`, `tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts`, `tools/dabbler-ai-orchestration/src/providers/ActionRegistry.ts`
- **Location:** `dabbler.respecifySession` is only an alias for `activateSessionRow`; the remediated-at-cap branch of `planSendBackPrompt()` merely requests an informal review.
- **Failure scenario:** Every operator selecting **Respecify Session** only opens the session block; nothing rewrites it, presents or invokes the re-registration command, or guides completion of that transition. Likewise, sending back a remediated-at-cap session does not instruct the engine to run the command that records a new review result. These failures occur on every invocation of those core actions, leaving sessions unchanged despite action labels that promise lifecycle work.
- **Acceptance criterion:** `JUDGMENT - Each of the three surfaced actions must explicitly issue or hand the engine the exact pre-existing command that performs its named workflow, with Respecify covering plan rewrite plus re-registration and remediated-at-cap Send Back recording a renewed review-loop result.`
- **Details:**
  - **Violation:** The plan specifies “**Three actions, each a front-end over a command that already exists**” and defines respecification as “**rewrite the session's entry in this plan, then re-register it**.”
  - **Impact:** Two principal recovery paths are labels over navigation or prose rather than operational front ends, so the view does not deliver the promised recovery workflow. This would change a merge decision for the session’s main deliverable.
  - **Evidence:** The respecification command directly calls `activateSessionRow(arg)` and issues no lifecycle command. The remediated send-back prompt says only to “review that fix delta” and names no command that reruns or records the review.
- **Fix:** Wire both actions to the appropriate existing commands or command-bearing engine prompts. If the required command does not exist, record that as the earlier-session defect required by the plan rather than silently substituting navigation.

## NITS

- **Nit:** `verificationNodes()` and `sessionNeedsReading()` expose nonterminal, below-cap rounds because any `clean === false` view qualifies. That conflicts with the planning-time emphasis and can transiently offer Send Back/Respecify while the review loop is still running, though acting on the copied prompt still requires additional operator steps.
- **Nit:** `build_verification_view()` infers historical unresolved status from the repository’s current verification cap. Changing the configured cap later can relabel a session that ended at its original cap as an open loop, or display impossible text such as a stopping round greater than the displayed cap.