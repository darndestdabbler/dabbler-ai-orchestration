ISSUES FOUND

- **Issue 1:** The gate enforces “after the test-run record is written,” not the documented “when the long-running command returns.”
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An orchestrator runs full pytest, posts the checklist immediately when pytest returns as documented, then runs `run_of_record record`. Close later fails with `test-run-recorded (...)` missing because the post is before the metadata record timestamp. This is probable because every session records long test runs, and the doc explicitly says to post “when it returns.”
  - **Acceptance criterion:** `JUDGMENT - A checklist post made after a long-running suite command returns must satisfy the documented after-command obligation even if the run-of-record metadata line is appended afterward, or the documented cadence must be changed to the actually enforced post-after-record contract.`
  - **Details:** **Violation:** `docs/planning/session-set-authoring-guide.md` says “Around a long-running command” posts happen “Before you start ... and again when it returns.” **Impact:** a doc-following session can be blocked at close and forced into redundant posting/bookkeeping despite satisfying the human-visible cadence. **Evidence:** `ai_router/run_of_record.py` sets `recorded_at=datetime.now()` when the metadata record is appended, while `ai_router/gate_checks.py` uses that `record.recorded_at` as the checklist transition timestamp and only accepts posts at or after it.

NITS

- **Nit:** `docs/session-constitution.md` accidentally merged the Step 5/8 and Step 7/8 pointer-table rows onto one line, corrupting the Markdown table.
- **Nit:** `ai_router/docs/close-out.md` still omits the new `checklist_posted` deterministic gate from its gate list, so the canonical close-out reference is stale.