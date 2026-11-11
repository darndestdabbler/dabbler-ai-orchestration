### 1. Is the diagnosis right?

Yes. The Mechanic is structurally useless because it is only permitted to edit ordinary repository code, while almost no stops are caused by repository code. Looking at the 72 stops, the causes rank as follows:

1. **Its licence forbids touching the walls that matter (≈45/72 stops):** 29 `verification`, 6 `engine`, 3 `blocked`, 3 `close`, 3 `rejected-thrice`, 1 `land`. These live in `.dabbler/runs/`, router state, or provider responses. The Mechanic is forbidden from touching router files or weakening gates. In the `blocked` example, the fix was overwriting a router report—explicitly illegal for the Mechanic.
2. **The stops are outside the repository (25/72 stops):** 24 `publish` and 1 `funds` stop. A code-editing AI cannot fix npm/git credentials, network failures, or API billing.
3. **Code/test stops don't need a special persona (1/72 stops):** Only 1 stop was `tests`. The authoring AI already fixes code; if it fails, the operator resumes the session or amends the plan rather than opening a second constrained AI.
4. **Nobody opens it:** Because operators intuit #1 and #2, `mechanic-log.md` stays at zero.

### 2. What may be set aside, and what may never be

The line is the absolute distinction between **waiving a rule** and **falsifying the record**:
* **Waiving a rule:** The record states: *"Test suite X failed (exit 1). Operator waived gate `run-of-record` with reason: 'Flaky network test unrelated to diff'."* **Always allowed.**
* **Falsifying the record:** Writing `"status": "passed"` or forging a reviewer's `"verdict": "approve"`. **Never allowed.**

**Where the rule classes fall:**
* **Never set aside (Falsification):** Editing existing `.dabbler/runs/` history or ledger entries; forging a review verdict or test result.
* **Set aside via existing verbs (No waiver needed):** Cap on review rounds (`verify reopen`); step checks and file/scope accounting (`plan amend`, though a one-shot waiver is a good shorthand if you don't want to mutate the plan).
* **Waivable by human exception (The missing capability):**
  * **Bookkeeping gates & blocked reports:** Clearing a stale `blocked` state or state-machine mismatch.
  * **Step checks, failing tests, and run-of-record freshness:** Proceeding despite red or stale tests.
  * **Review verdict requirement:** Proceeding *without* an approval (the record shows `rejected` or `missing` + `waived`, never `approved`).
  * **Publish:** Closing the session locally when pushing/publishing fails.

### 3. The mechanism for an exception

**Do not use a free-form script.** If the framework executes an arbitrary bash/Node script to bypass a stop, that script can mutate `.dabbler/runs/` directly, violating *"The machine owns the record."* You would need a complex sandbox to police the script, violating *"No guard may guard another guard."*

Instead, use **named, one-shot waivers applied by the router**, paired with normal git working-tree edits:
* Add a person-only verb: `dabbler session waive --stop <id> --gate <gate-name> --reason "<text>"`.
* When the router runs with an active waiver for the current stop, the gate evaluates normally, records its actual result (`failed`, `stale`, `rejected`), sees the matching waiver, logs an `exception-applied` event (`rule`, `session`, `stop`, `reason`, `authorised_by`, `advisor_verdict`), and advances the state machine.
* If unblocking also requires code edits, the Mechanic makes ordinary working-tree edits alongside the waiver request.

### 4. The review ladder

**Cut it drastically.** A 5-call debate ladder (Mechanic → Reviewer → Mechanic dispute → Reviewer 2nd look → Auxiliary) violates *"adoption outranks rigour"* and *"no guard may guard another guard."* Waiting three minutes and burning tokens while stuck will make developers abandon Dabbler just as fast as a hard wall.

* **Advice, not a gate:** Because *"a human may override any rule,"* the reviewer's output is **advice** to inform the human, never a lock on the human's button.
* **Try, don't argue:** If the Reviewer names a valid within-rules path (e.g., *"Run `dabbler step answer` to clear the blocked report"*), the Mechanic or router should **immediately try or offer that command**, not argue about it.
* **The smallest honest ladder (1 reviewer call):**
  1. Mechanic diagnoses the stop and proposes either a within-rules command or a `waive` request.
  2. **One** independent Reviewer checks the proposal. It outputs either `BETTER_PATH: <exact command>` or `WAIVER_JUSTIFIED` / `WAIVER_UNSAFE: <1-sentence warning>`.
  3. If a `BETTER_PATH` is named, the UI highlights it as the primary button. Otherwise, the human sees the Mechanic's request, the Reviewer's 1-sentence take, and the **[Authorise Exception]** button.

### 5. Guarding against a lying or lazy AI

**What the Reviewer must read directly from disk (never from the Mechanic's summary):**
1. The raw stop event JSON from `.dabbler/runs/`.
2. `git diff` and `git status`.
3. The raw tail of the failing test output or review verdict that triggered the stop.
4. The exact plan step definition.

**What the person must be shown (the 30-second approval card):**
1. **The Gate Failed:** Plain text of the rule and actual failure (e.g., *"Gate `run-of-record`: 1 test failed in `auth.test.ts`"*).
2. **What This Lets Through:** The concrete blast radius (e.g., *"Commits current diff and closes session without a passing test run"*).
3. **Independent Check:** The Reviewer's independent 1-sentence verdict (or its suggested within-rules command).
4. **The Permanent Record:** The exact badge/line that will be written to the ledger.

### 6. What the record says afterwards

Use a neutral engineering tone—like a compiler warning or a documented build override—not a moral failure:
* **Ledger:** `status: "completed"`, `completion_mode: "with-waiver"`, plus a `waivers: [...]` array.
* **Transcript page:** Inline at the stop, render an amber (not red) callout box: **Gate Waived (`verification`)** — *Authorised by @user: "Provider API down for 2 hours; diff verified manually." Reviewer advice: Concurred.*
* **Work Explorer:** Completed sessions get a small `✓*` or amber dot badge (`Closed with 1 waiver`). It stays honest for audits without looking like a broken build.

### 7. "Is this a fair block?"

* **Reuse `dabbler triage`:** Do not build a second classifier. Upgrade `dabbler triage` so that instead of passive prose, it outputs a structured action: either the exact within-rules CLI command to run, or a pre-filled `dabbler session waive` command, plus a draft defect report if it's a `framework-defect`. Run it automatically (or via a single click) on any stop.
* **Detecting that a session is stuck:** Since stops and 30-minute stalls are already flagged, the missing signal is a **stop loop**: when a session hits the **same stop kind on the same step twice in a row** (like yesterday's `dabbler session next` re-reading the same `blocked` report), or accumulates **3+ total stops in one session**. When detected, auto-run `dabbler triage` and surface the Exception/Fair-Block card immediately.

### 8. Consumer repositories

Yes, the exception process works unchanged in consumer repos because **waivers live in the consumer's `.dabbler/runs/` data**, not in Dabbler's npm package code. A consumer doesn't need to wait for a Dabbler release to waive a broken gate.

**Reaching framework maintainers:** When a waiver is authorised (especially when `triage` classifies it as `framework-defect`), the router writes a sanitised `.dabbler/exception-reports/<id>.json` containing the Dabbler version, stop kind, state transition history, and waiver reason (stripping proprietary code/diffs). The CLI/UI then prints a one-click `gh issue create --repo <dabbler-repo>` link (or copies the markdown payload) so the operator can file the upstream bug in five seconds.

### 9. The simplest plan

**What to DELETE or REUSE:**
* **Delete** `mechanic-log.md` and the standalone `dabbler consult --mechanic` flow.
* **Reuse and upgrade** `dabbler triage` as the single diagnostic/reviewer brain.
* **Deprecate** `dabbler session close --force` in favour of explicit waivers (which close one gate, not the whole plan).

**Session 1 (Build this first if only one session is allowed): The Waiver Verb & Loop Breaker**
1. Fix the `blocked` stop bug: make `session next` prompt to clear or re-answer a `blocked` report, and print the exact command in the stop message.
2. Add `dabbler session waive --gate <kind> --reason <text>` (person-only) and record `waiver` events in `.dabbler/runs/`.
3. Update router gate evaluators (`verification`, `tests`, `publish`, `blocked`, `close`) to check for an active waiver for the current stop and advance if present.
4. Render the `with-waiver` badge and callout in the ledger, transcript, and Work Explorer.

**Session 2: Automated Triage & Single-Reviewer Advice**
1. Upgrade `dabbler triage` to read raw stop/diff artifacts and output structured JSON: classification, `within_rules_command`, or `recommended_waiver`.
2. Add a single independent Reviewer pass to `triage` that verifies whether a within-rules path exists before endorsing a waiver.
3. Add stop-loop detection (same step + same stop kind twice) to auto-trigger `triage`.
4. Wire the VS Code stop card to display the 30-second approval card and execute either the within-rules command or `dabbler session waive`.

**Session 3: Consumer Defect Reporting**
1. Generate a sanitised framework-defect bundle whenever a waiver is applied on a stop classified as `framework-defect`.
2. Add a "Report Rule Defect to Dabbler" button/link in the CLI and VS Code extension after a waiver is used.
3. Add tests verifying that engines cannot invoke `dabbler session waive` and that waivers never overwrite raw test/review statuses.

### 10. The one thing I would push back on

**Executing Mechanic-written scripts (and the 5-call AI tribunal built to police them).** Let the Mechanic edit repo code if needed, but never let an AI write a script to bypass framework state. If exceptions are declarative router waivers (`dabbler session waive`), the record cannot be corrupted, sandboxing is unnecessary, and you don't need a 5-call AI Supreme Court—just one independent reviewer check and a human clicking **Authorise**.