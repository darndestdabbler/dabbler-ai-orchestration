Now I have full ground truth. Here is my verdict.

---

**VERDICT: ISSUES_FOUND**

---

## Findings

### Finding 1 — **Major** | False Confidence | `ai_router/tests/test_spec_admission_shape.py:430–443`

**Evidence paths:** `ai_router/tests/test_spec_admission_shape.py`, `ai_router/spec_admission.py:686–695`

**Description:**

**Violation.** The test's own docstring states *"A one-off command run proves that on the day; only a test keeps it true"* — but `test_no_unstarted_spec_in_the_repo_requires_restructuring` (lines 430–443) builds an `offenders` dict by iterating over `sa._discover_specs(str(repo_root))` **with no guard that the iterator returned anything**. If `_discover_specs` returns an empty list for any reason, `offenders` stays `{}` and `assert offenders == {}` passes without having checked a single spec.

**Impact.** This is the exact failure mode the entire `TestTheCheckFires` / L-112-1 apparatus was built to prevent: a gate that only ever passes is indistinguishable from one that checks nothing. A future refactor of `_discover_specs` (path change, schema filter, directory layout change) that silently returns `[]` for the real repo would give a green test while every unstarted spec in the corpus goes unchecked. The Set 127/112 incident recurs the moment a future author adds a non-conforming step and the corpus test fails to notice.

**The second test does not protect the first.** `test_that_scan_can_actually_fail` (line 445) calls `_discover_specs(str(tmp_path))`, not `_discover_specs(str(repo_root))`. The two calls are independent. The second test correctly asserts `assert specs, "the planted spec must be discovered at all"` — the first test has no such guard. The contrast makes the gap explicit: the pattern was present, it was not applied to the first test.

**Fix.** Collect the result of `_discover_specs` before the loop and assert it is non-empty:

```python
all_specs = sa._discover_specs(str(repo_root))
assert all_specs, (
    "_discover_specs returned nothing for the real repo; "
    "the corpus scan is vacuous — check the path"
)
for spec in all_specs:
    ...
```

---

## Nits (non-blocking)

- **Nit:** `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md` (re-read section, line ~149): the text says *"0.99 sits inside the 0.91–1.04 band the original series measured"*, but the ratio table above it tops out at **1.01** (May 26). The text says the series has twenty points of which only six appear in the table, so the 1.04 could come from a hidden row — but it cannot be verified from the file on disk. If 1.04 is rounded or invented, the claim *"0.99 is comfortably inside the band"* is still directionally true, but a reader who spot-checks against the table will find the ceiling unsupported.

- **Nit:** `change-log.md` (line ~67): *"12 functions / 19 cases"* for the Session 1 shape falsifiers. Counting the two FIRES/DOES_NOT_FIRE classes in the test file gives **14 function definitions** (9 + 5), not 12, with parametrize expansions producing more than 19 cases. The discrepancy suggests the count was taken mid-session before some tests were added, or excludes a class. Not a merge blocker; the tests themselves are present and correct.