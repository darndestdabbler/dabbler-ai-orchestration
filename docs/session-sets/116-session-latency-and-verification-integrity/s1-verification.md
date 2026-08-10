ISSUES FOUND

- **Issue 1: The corrected timing documentation does not provide a timing for the command whose published timing was wrong**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A typical contributor consults the layered test instructions to estimate the cost of `python -m pytest -m e2e`. The former `~30s` estimate is gone, but the replacement describes the entire 3,774-test suite instead of that command, so the contributor still cannot determine the e2e layer’s cost. This is probable because the timing appears directly beneath that command and cost visibility is the session’s primary objective.
  - **Acceptance criterion:** `JUDGMENT - Does CONTRIBUTING.md state a measured timing for the documented python -m pytest -m e2e command, with a reviewable measurement source and commit, rather than substituting the full-suite timing?`
  - **Details:**
    - **Violation:** The plan requires “**Correct every published test timing**” and says to “**Cite the measurement and its commit so the next reader can re-derive it**.”
    - **Location:** `CONTRIBUTING.md`, immediately after `python -m pytest -m e2e`.
    - **Impact:** One of the two specifically identified incorrect timings remains unresolved rather than corrected, materially defeating the session’s “make its cost visible” deliverable.
    - **Evidence:** The replacement says the **full** suite takes approximately 14 minutes serial or 4 minutes parallel. It gives no measured duration for the preceding `-m e2e` command. The Playwright replacement likewise identifies dates and session-set ledgers but cites no commit.
    - **Fix:** Publish the measured duration for the exact e2e command and cite its raw measurement and commit. Add commit citations for the Playwright measurements as required.

## NITS

- **Nit:** `record_run()` accepts `NaN` and positive infinity because `duration_seconds <= 0` is false for `NaN` and does not reject infinity. `json.dumps()` can consequently emit non-standard `NaN` or `Infinity` values in `test-runs.jsonl`. Validate with `math.isfinite()` in `ai_router/run_of_record.py`.

- **Nit:** `duration_seconds` remains optional, and the tests explicitly preserve records without `durationSeconds`. Existing callers can therefore continue producing the free-text-only records that the plan sought to replace. Backward-compatible reading may remain optional, but new run-recording paths should normally supply the structured duration.

- **Nit:** The plan specifically calls for parallel execution in `run_of_record.py`’s recorded pytest command, but that command is not changed in the diff. It inherits `-n auto` indirectly from `pytest.ini`, which is runtime-equivalent in ordinary repository-root execution but leaves the recorded command itself unable to communicate the parallelism and dependent on pytest configuration discovery.