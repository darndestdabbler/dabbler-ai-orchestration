---

**VERDICT: ISSUES_FOUND**

---

## Findings

### Minor — False Confidence / Completeness

**Severity:** Minor
**Category:** False confidence — vacuous-pass risk
**Location:** `ai_router/tests/test_spec_admission_shape.py:430–443`
**Evidence paths:** `ai_router/tests/test_spec_admission_shape.py`, `ai_router/spec_admission.py:686–695`

**Description:**

1. **Violation:** The class docstring asserts L-112-1 is honoured: *"only a test keeps it true."* The second test (`test_that_scan_can_actually_fail`) is the stated falsifier — it proves the discovery+check path can report an offender. But it uses `str(tmp_path)` as the root, while the first test uses the real `repo_root`. Neither test guards that `sa._discover_specs(str(repo_root))` returns a **non-empty list**. `_discover_specs` (line 688) returns `[]` immediately if `docs/session-sets` doesn't exist. If that happens, the loop body never executes, `offenders` is `{}`, and `assert offenders == {}` passes with zero specs examined.

2. **Impact:** If a future refactor moves specs, renames the directory, or changes the discovery path, `test_no_unstarted_spec_in_the_repo_requires_restructuring` gives a green result while scanning nothing — exactly "a gate that only ever passes is indistinguishable from one that checks nothing" (`L-112-1`). The second test would still pass because it plants into `tmp_path` at the correct `docs/session-sets/<slug>/spec.md` structure. The two tests share code but not root, so the falsifier doesn't close the vacuous-pass gap on the first test.

3. **Evidence:** `_discover_specs` at `spec_admission.py:688`: `if not os.path.isdir(base): return []`. The first test at `test_spec_admission_shape.py:432` starts the loop directly with no guard: `for spec in sa._discover_specs(str(repo_root)):`. An `assert specs` or `assert len(list(...)) > len(result.sessions)` line before the loop would close it.

**Concrete fix:** Add `discovered = sa._discover_specs(str(repo_root)); assert discovered, "corpus scan returned no specs — discovery path is broken"` as the first line of `test_no_unstarted_spec_in_the_repo_requires_restructuring`.

---

## Nits (non-blocking)

- **Nit:** `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md:83–86` (the original ratio table, 2026-08-10) shows `test LOC 52,868` and `prod LOC 54,768` (ratio 0.97), while the re-read table at line 135 shows `test LOC 60,188` and `prod LOC 62,103` for the same date. The spec correctly acknowledges "that table used a different line counter" and states the ratio is the load-bearing number — but readers will notice the absolute columns contradict each other for the same commit. The note's one sentence is easy to miss. Worth a bolded callout or a table caption naming the two counters.

- **Nit:** `decisions.jsonl` line 7 (the `sessionSizeException` ruling for 121 S2) carries `"authority": "ai"` with no `operator_attestation`. This is correct — declaring an exception is not a verification reduction and doesn't require human authority — but it's the only decision in the set without attestation, and its `rubric_line: "goal-over-letter"` is an unusual line for a structural size ruling. Not a defect, but a future reader may wonder why the shape/size exception wasn't bumped to the operator given the spec explicitly predicted "no exception is owed anywhere."

---

**What I actually read and checked:**

- `ai_router/run_of_record.py` (classify_changed_paths, lines 386–404) — confirmed the A4.1/deletion collision: the function classifies by path prefix against a `git diff --name-only` output, which *does* include deleted files. Deleted test paths would classify as `test-only`. The spec's analysis and remedy are correct.
- `ai_router/post_round_delta.py` (lines 1–220) — confirmed `classify_delta` delegates to `classify_changed_paths` and `DELTA_TEST_ONLY` does not trigger `owes_review`. Logic is consistent with the claims.
- `ai_router/tests/test_spec_admission_shape.py` (full file, 481 lines) — the two new tests at lines 430–474. Found the vacuous-pass gap above.
- `ai_router/spec_admission.py` (lines 1–80, 430–470, 686–695) — `restructuring_required`, `_discover_specs`, `_STARTED_STATUSES`. All consistent with documentation.
- `docs/session-sets/118/.../spec.md` (full), `113/.../spec.md` (full), `121/.../spec.md` (full), `122/.../spec.md` (lines 1–165) — verified step structures, `sessionSizeException` on 121 S2, folding of 113 S4 content.
- `docs/session-sets/128/.../decisions.jsonl` (all 8 lines), `change-log.md` (full) — numbers checked against spec. Ratios compute correctly. `+56/day` = 168÷3. `0.99` = 67,182÷67,634 = 0.993. Consistent.
- `docs/planning/session-step-skeleton-and-verification-cost.md` (full) — RESOLVED markers all name concrete deliverables; no stale "current behaviour" claim remains untagged.