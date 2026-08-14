# Remediation — Session 1, round 3 (remediation-review cycle 1)

Round 3 reviewed the fix delta from rounds 1 and 2 and **rejected both
fixes**, with two further Majors. Both were accepted without dispute.
Both are narrowing errors in the *replacement* for a detector this set
exists to criticise, which is the point worth carrying forward.

---

## 3.1 — `os.path` plumbing read as an enumeration

**Finding (Major, Correctness).** `_iterated_calls` treated any callee
named `join` as an iterable consumer — it was there for
`"\n".join(...)` — so `os.path.join(os.path.dirname(os.path.abspath(
__file__)), "fixtures", "x.json")` looked like a repo path handed to
something that walks it. That is how a large part of the suite builds a
fixture path: it **constructs**, it never walks.
`test_session_title_parity.py` and `test_step_row_parity.py` were
tiered `strong` on that basis.

**Fix.** `join` is out of the consumer set, and the whole `os.path`
family (`join`, `dirname`, `basename`, `abspath`, `realpath`,
`normpath`, `relpath`, `expanduser`, `splitext`) is in `_PATH_PLUMBING`
alongside `Path`/`str`, so passing a derived path through any of them
is normalisation rather than a reach into the tree.

**Falsifier.** `test_os_path_plumbing_is_not_an_enumeration` plants the
exact expression from the finding and asserts `D3` fires (a path *is*
derived from `__file__`) while `D4` does not.

**Result.** Strong at `ab47a3e7` moves **11 / 240 -> 9 / 222**; the two
parity files leave the tier. The eleven files that remain at the working
tree are the repo-scanning population and nothing else.

## 3.2 — the entry-point fix went silent on a supported interpreter

**Finding (Major, Correctness).** `pyproject.toml` declares
`requires-python = ">=3.10"`; `tomllib` is 3.11+, and no TOML backport
is a dependency. `_entry_point_modules()` returned `[]` when the parser
was missing, and the caller read "file mentions pyproject.toml" as
"handled" — so on Python 3.10 the round-1 defect came back **exactly as
it was**, with `report.py` reported uncovered and **no warning
anywhere**. A fix that only works on the interpreter its author happened
to run is not a fix.

**Fix — fail closed.** `_entry_point_modules()` now returns `None` for
*could not read the declaration* (no `pyproject.toml` on the corpus, no
`tomllib`, malformed TOML) and a list for *read it*. The distinction is
load bearing: `[]` means "there are no console scripts", `None` means
"this run cannot know". The caller credits declared targets only on a
non-empty list and otherwise records the file under
`soleCover.unresolvedDynamicImportFiles`. An interpreter that cannot
parse the declaration now produces a **visible hole** instead of a
confident zero.

Adding a `tomli` backport was rejected: a new runtime dependency is a
larger change than making the tool admit what it does not know, and the
admission is what the A1 map actually needs.

**Falsifier.**
`test_an_unreadable_pyproject_fails_closed_to_a_visible_hole` builds a
corpus that resolves, asserts no hole, then monkeypatches
`tomllib` to `None` — standing in for Python 3.10 — and asserts the same
corpus now reports the file as unresolved. Both directions.

---

## What this round says about the detector, and it is not flattering

`D4` has now been wrong three times, each time in a different
direction, and **not one of the three was found by reading the
predicate**:

| cut | reading | result at `ab47a3e7` |
| :--- | :--- | ---: |
| 1 | co-occurrence: derives from `__file__` AND an enumeration token anywhere | 7 / 167 — misses the scanners, counts `tmp_path` |
| 2 | any derived path passed as an argument | 39 / 1,128 — i.e. identical to D3, meaningless |
| 3 | argument to a call whose result is iterated | 11 / 240 — `os.path.join` reads as iteration |
| 4 | ...with `os.path` plumbing excluded | **9 / 222** |

This is the same shape as the spec's own coupling figure: a predicate
that sounds precise in prose, is defensible under several readings, and
disagrees with itself by a factor of four. The difference is that all
four readings here are written down, the current one is pinned by a test
against a real commit, and each narrowing carries a falsifier planting
the shape that broke it (L-112-1). **A detector is worth exactly the
falsifiers planted against it** — every one of these was found by a
verifier planting a real file shape, none by inspecting the regex or the
AST walk.

## What did not change, across all three rounds

Every volume figure still reproduces **exactly** at both historical
commits — 124 / 3,345 / 60,188 / 62,103 / 0.97 at `8fda8d85`, and 133 /
3,513 / 67,182 / 67,634 / 0.99 / 142 at `ab47a3e7` — and `D1`
(43 / 1,294 and 48 / 1,452), `D2` (48 / 1,497 and 55 / 1,711) and `D3a`
(5 / 66 and 7 / 167) are byte-identical to the figures Set 128 S3 and
the measurement correction published. Nothing in three rounds of
remediation moved a number this session claimed to reproduce.

Test count: 23 -> 25 functions, **exactly at** the spec's irony budget
of 25. No further test may be added to this session without declaring an
overrun.
