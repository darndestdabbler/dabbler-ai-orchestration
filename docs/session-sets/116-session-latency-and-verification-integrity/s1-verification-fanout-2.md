ISSUES FOUND

- **Issue 1: The required serial/parallel parity proof and timing evidence are not substantiated**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The repository adopts `-n auto` by default, but a typical maintainer cannot verify that serial and parallel runs covered the same tree with identical results. This is probable because the supplied evidence contains only repeated assertions of “3,769 passed / 5 skipped”; the referenced benchmark contents and the excluded `test-runs.jsonl` are not provided. Merging without the required proof risks adopting a parallel default that silently changes or omits test behavior.
  - **Acceptance criterion:** JUDGMENT - checked-in evidence must show the serial and parallel commands, durations, and complete passed/skipped results from the same precisely identified tree, and the documentation must cite that evidence and reproducible revision.
  - **Details:**
    - **Violation:** The plan requires: “**Prove parity before adopting**: identical passed/skipped counts serial vs parallel, and record both timings,” and timing documentation must “Cite the measurement and its commit so the next reader can re-derive it.”
    - **Location:** `CONTRIBUTING.md`, `pyproject.toml`, and `pytest.ini` assert the result and cite `docs/test-suite-benchmark-DENICI.txt`; the supplied complete diff does not contain that artifact, while `test-runs.jsonl` is explicitly excluded and not inlined.
    - **Impact:** The core adoption gate cannot be independently audited, which materially changes whether enabling xdist globally is safe to merge.
    - **Evidence:** No raw commands, outputs, or serial/parallel records are in the response. Moreover, the cited commit identifies `HEAD` while the presented functional and test changes are uncommitted, so the response does not establish whether the counts describe the reviewed tree or the clean cited commit.
    - **Fix:** Include durable parity evidence for one exact tree, with both commands, counts, skip details, timings, and a revision/work-diff identity that reproduces that tree.

- **Issue 2: New run records can still omit `durationSeconds` by default**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Existing callers continue invoking `record_run` or the `record` CLI without the newly optional argument, which is the probable path because all old invocations remain valid and the CLI default is `None`. Those new records omit `durationSeconds`, leaving the framework unable to calculate testing cost and preserving the “sometimes there is no measurement” condition this session was meant to eliminate.
  - **Acceptance criterion:** JUDGMENT - every newly written test-run record must contain a finite positive `durationSeconds`, while reading legacy records without the field remains backward-compatible.
  - **Details:**
    - **Violation:** The plan requires: “**Record `durationSeconds` as a structured field** in `test-runs.jsonl`” so “the framework can report what testing costs it.”
    - **Location:** `ai_router/run_of_record.py` defines `duration_seconds: Optional[float] = None`, conditionally serializes it, and gives `--duration-seconds` a `None` default. `test_duration_is_omitted_when_not_given` explicitly preserves omission for newly written records.
    - **Impact:** The primary structured-measurement deliverable is opt-in rather than an invariant, so routine records remain unusable for cost reporting.
    - **Evidence:** `TestRunRecord.to_dict()` emits the field only when non-`None`; both `record_run()` and the CLI accept omission.
    - **Fix:** Require or automatically measure duration at the writer boundary. Keep only the reader tolerant of legacy records lacking the field.

## NITS

- **Nit:** `record_run()` accepts `NaN`, positive infinity, and `True` as durations. `json.dumps()` can consequently emit non-standard `NaN`/`Infinity`, while a boolean round-trip is discarded by `read_records()`. Validate a finite, non-boolean real number before writing.
- **Nit:** `read_records()` accepts negative, zero, `NaN`, and infinite numeric durations from existing or externally modified ledgers, potentially contaminating later statistics. Invalid measurements should be normalized to `None` or rejected.
- **Nit:** The timing following `python -m pytest -m e2e` is explicitly for the full suite “not just the `e2e`-marked subset.” Thus the old Layer 1 estimate was removed rather than replaced with a measurement of the documented command.
- **Nit:** The Playwright timing cites set files and dates but no commit, despite the instruction to cite the measurement’s commit.
- **Nit:** `run_of_record.py`’s recorded pytest command was not visibly updated to expose `-n auto`; the implementation instead relies on implicit `pytest.ini` discovery. This is behaviorally parallel in an ordinary repository-root invocation, but the recorded command is not self-contained and does not itself reveal the execution mode.