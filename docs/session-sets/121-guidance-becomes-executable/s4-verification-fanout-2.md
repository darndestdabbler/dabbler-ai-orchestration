ISSUES FOUND

- **Issue 1:** The doc-only-cap measurement overcounts verification rounds by counting authorization ledger rows as completed rounds.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/measure_doc_only_cap.py:97-111`, `docs/session-sets/121-guidance-becomes-executable/s1-rounds.jsonl:1-7`, `docs/session-sets/121-guidance-becomes-executable/s4-doc-only-cap.md:65-72`
  - **Failure scenario:** A typical set with an operator-authorized extra verification round has an `operator-authorization` row in `sN-rounds.jsonl`; this tool counts that row as another metered verification round. That already happened here: S1 has 6 `round-completed` rows plus 1 authorization row, but the report says 7 rounds. The required rounds/session comparison can therefore overstate loop cost and change the cap-effectiveness conclusion.
  - **Acceptance criterion:** `python ai_router/measure_doc_only_cap.py docs/session-sets/121-guidance-becomes-executable`
  - **Acceptance expectation:** exit 0, output contains `"rounds per session: {1: 6, 2: 5, 3: 4}"`
  - **Details:** **Violation:** Step 4 requires comparing “rounds/session,” and the module doc says `_round_counts` returns “Metered rounds per session.” **Impact:** the session’s primary measurement report contains false round-count data, so a reviewer cannot trust the evidence-backed comparison without fixing the counter. **Evidence:** `_round_counts` sums every nonblank ledger line; `s1-rounds.jsonl` line 6 is `operator-authorization`, not a completed round; the report repeats the inflated S1 count as 7.

NITS

- **Nit:** `s4-doc-only-cap-measurement.json` does not match the current module’s `--json` output shape (`rounds_per_session`/snake-case fields vs `roundsPerSession`, `medianRounds`, `preCapMedianRounds`, etc.), so it appears stale or hand-shaped rather than raw output from the shipped tool.
- **Nit:** `s4-doc-only-cap.md` says the mixed-only blocking rounds were all “late remediation-review” rounds, but `s2-issues-round-2.json` and `s3-issues-round-2.json` are supplementary rounds.
- **Nit:** The report and test docstring overclaim “across four sessions” while the checked table/JSON currently cover S1-S3 only; the file elsewhere acknowledges S4 verification cannot be appended until this review exists.
- **Nit:** The spec asked to delete the standing-authorization section from `docs/guidance-lifecycle.md`; the section remains, though rewritten as retired. The behavior is clear, but it does not literally perform the requested deletion.