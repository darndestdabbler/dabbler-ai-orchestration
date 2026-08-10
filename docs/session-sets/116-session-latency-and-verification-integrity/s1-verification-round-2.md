ISSUES FOUND

Fix verdict: L1 e2e timing provenance -- fix-rejected  
Fix verdict: L2 serial/parallel parity evidence -- fix-rejected  
Fix verdict: L3 mandatory structured duration -- fix-rejected

### Issue 1: The new e2e timing lacks the required measurement source and commit

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A contributor later attempts to re-derive the published 113.69s/63.47s figures after the suite changes. Because the documentation identifies neither the measured tree nor a reviewable output record, they cannot determine which code and test collection produced those values. This is probable because suite evolution is the reason the former timing became wrong, and reproducible timing documentation is a central session objective.
- **Acceptance criterion:** `JUDGMENT - Does CONTRIBUTING.md cite an immutable, reviewable measurement record and the exact commit or tree identity that produced the documented e2e serial and parallel timings?`
- **Details:** **Violation:** The specification requires, “Cite the measurement and its commit so the next reader can re-derive it,” and L1’s criterion requires a “reviewable measurement source.” **Location:** `CONTRIBUTING.md`, Layer 1 timing paragraph. **Impact:** The replacement timing remains unsubstantiated, so a reviewer cannot approve the promised correction as reproducible evidence. **Evidence:** The paragraph gives values, a date, and commands, but no commit and no link to recorded e2e output; commit `9277e104` is cited only for the separate old full-suite benchmark. This specifically challenges the Round 1 L1 remediation with evidence from its resulting hunk. **Fix:** Cite the e2e run records or raw outputs and identify the exact measured commit/tree.

### Issue 2: The parity proof is still assertion rather than reviewable evidence

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A maintainer reviewing the default adoption of `-n auto` cannot verify that serial and parallel execution actually collected and completed the same tests with identical results. This is probable because the only evidence presented in the reviewable delta is prose asserting counts, timings, and a digest; the linked JSONL contents and raw test outputs are excluded. That leaves the session’s explicit “prove parity before adopting” prerequisite unresolved.
- **Acceptance criterion:** `JUDGMENT - Does reviewable evidence show the actual current-tree serial and parallel full-suite outputs, identical passed and skipped counts, both timings, and a verifiable binding of both runs to the same measured tree?`
- **Details:** **Violation:** The specification requires, “Prove parity before adopting: identical passed/skipped counts serial vs parallel, and record both timings.” **Location:** `CONTRIBUTING.md`, “Same-tree parity proof.” **Impact:** A reasonable reviewer still cannot independently validate the prerequisite for changing pytest’s default execution mode. **Evidence:** The hunk supplies only prose values and a truncated digest. Its sole source is excluded `test-runs.jsonl`, whose contents are not in front of the reviewer. Moreover, an identical surface digest can establish matching recorded surfaces, but does not itself cryptographically prove that the asserted test counts came from those executions. This specifically challenges the Round 1 L2 remediation. **Fix:** Provide durable, reviewable serial and parallel run evidence containing the commands, complete results, timings, and same-tree identity.

### Issue 3: `record_run()` still writes records without `durationSeconds`

- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Existing programmatic callers invoke `record_run()` without `duration_seconds`, as they remain explicitly permitted to do, and create new records with no structured duration. This is probable because preserving those calls is an intentional part of the remediation, and it materially prevents the framework from reliably reporting testing cost.
- **Acceptance criterion:** `JUDGMENT - Does every record_run call that writes a new record reject an omitted, non-numeric, non-finite, boolean, zero, or negative duration while read_records continues accepting legacy records with no durationSeconds field?`
- **Details:** **Violation:** L3 requires “every newly written test-run record” to contain a finite positive `durationSeconds`. **Location:** `ai_router/run_of_record.py`, `record_run()` validation and the `--duration-seconds` help text. **Impact:** The primary writer API still preserves the exact missing-measurement state the session was required to eliminate. **Evidence:** Validation remains guarded by `if duration_seconds is not None`, and the help text explicitly says the Python API “keeps the parameter optional.” Requiring the CLI option fixes only one entrypoint, not the helper that writes records. This specifically challenges the Round 1 L3 remediation. **Fix:** Require a finite positive duration at `record_run()`’s write boundary and update internal callers to supply one; retain optionality only while reading legacy records.

### NITS

- **Nit:** `CONTRIBUTING.md` calls the current tree “3,813 tests” but then reports 3,813 passed plus 5 skipped, which totals 3,818.
- **Nit:** `math.isfinite(duration_seconds)` can raise `OverflowError` for an extremely large Python integer, contradicting `record_run()`’s documented `ValueError` contract; this is an unusual-input hardening issue rather than a blocker.