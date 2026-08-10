ISSUES FOUND

Fix verdict: L1 e2e timing still lacks reviewable measurement provenance -- fix-rejected  
Fix verdict: L2 serial/parallel parity remains unsubstantiated -- fix-rejected  
Fix verdict: L3 all new run records require a valid duration -- fix-accepted  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 -- duplicate-of L2  
Fix verdict: L6 -- duplicate-of L3

- **Issue 1: The e2e timings still have no measurement source or measured commit**
  - **Location:** `CONTRIBUTING.md`, Layer 1 timing paragraph; `docs/session-sets/116-session-latency-and-verification-integrity/test-runs.jsonl`
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A contributor attempts to re-derive the 113.69s/63.47s e2e figures after the suite changes. This is probable because suite growth already invalidated the previous timing. They cannot identify the measured commit or inspect an execution record for either e2e run, materially defeating the session’s timing-reproducibility objective.
  - **Acceptance criterion:** `JUDGMENT - Does CONTRIBUTING.md cite the measured commit and an immutable, reviewable execution record showing the exact serial and parallel python -m pytest -m e2e commands, results, and elapsed times that produced 113.69s and 63.47s?`
  - **Details:** **Violation:** The specification requires, “Cite the measurement and its commit so the next reader can re-derive it.” **Impact:** The published correction cannot be independently verified or associated with a particular tree, which would change a reasonable reviewer’s merge decision for a timing-evidence deliverable. **Evidence:** `CONTRIBUTING.md` gives only “2026-08-10 (Set 116 S1)” and re-derivation commands; it cites neither a commit nor an output record. Every visible `test-runs.jsonl` row is for the full `ai_router/tests` suite, not `-m e2e`. The round-2 remediation for L4 is therefore defective: making this ledger visible did not expose the missing e2e measurements.
  - **Fix:** Check in the e2e serial and parallel execution evidence and cite both that record and the measured commit from `CONTRIBUTING.md`.

- **Issue 2: The visible ledger still does not prove current-tree serial/parallel parity**
  - **Location:** `CONTRIBUTING.md`, “Same-tree parity proof”; `docs/session-sets/116-session-latency-and-verification-integrity/test-runs.jsonl`
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A maintainer reviewing adoption of `-n auto` attempts to confirm that the fixed tree collected and completed the same tests serially and in parallel. This is probable because parity is an explicit prerequisite to adopting the new default. They find only user-authored JSONL details for an older digest, not execution outputs for a current-tree pair, so they cannot verify the prerequisite.
  - **Acceptance criterion:** `JUDGMENT - Does checked-in reviewable evidence contain actual serial and parallel full-suite outputs from the same final fixed tree, showing the exact commands, passed/skipped counts, and elapsed times, with each output bound to that tree rather than asserted only in JSONL detail?`
  - **Details:** **Violation:** The specification requires, “Prove parity before adopting: identical passed/skipped counts serial vs parallel, and record both timings.” **Impact:** The evidence cannot establish that xdist preserves the suite’s collection and results on the tree being merged, undermining the prerequisite for changing the default. **Evidence:** Both parity rows store the same generic command, `.venv/Scripts/python.exe -m pytest ai_router/tests -q`; the serial `-n 0` and parallel `-n auto` variants and their counts exist only in free-text `detail`. `surfaceDigest` proves the tree when `record_run` was invoked, not that pytest produced the asserted result on that tree. Moreover, the claimed pair uses digest `b5db7d2d...` and 3,813 passed, while the later post-remediation current-tree row uses digest `fb690759...` and 3,814 passed and has no serial counterpart. The round-2 remediation for L5 is therefore defective: exposing the ledger made the assertions visible but did not turn them into current-tree execution evidence.
  - **Fix:** Preserve serial and parallel output records for the final fixed tree, including exact invocations and summaries, and bind both records to the same immutable tree identifier.

## NITS

- **Nit:** `CONTRIBUTING.md` calls the parity tree “3,813 tests” while reporting 3,813 passed plus 5 skipped; under the document’s prior total-test convention, that is 3,818 collected tests.