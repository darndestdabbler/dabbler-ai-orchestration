## [Unreleased] — the suite, as a query (Set 118)

### Added

- **(Set 118 S1) `python -m ai_router.suite_inventory` — the pytest
  suite as a query instead of a forensic exercise.** One record per test
  file: test-function count by *both* the historical line predicate and
  an AST cross-check, LOC, the production modules it imports, a coupling
  tier, guard status, an A1 sole-cover flag, and git first-seen /
  last-modified. Emits a human report and a versioned JSON contract.

  **It publishes the predicate behind every number, not only the
  number.** `PREDICATES` carries the rule for each figure, is rendered
  at the top of the report and is carried in the JSON. This is the whole
  point rather than a nicety: Set 128 S3's re-read of the Set 118 spec
  found that its headline coupling figure (47 files / 1,485 tests) could
  not be reproduced *under its own prose*, because the detector was
  never written down and the sentence describing it has at least three
  defensible readings that disagree by ~250 test functions. A count
  nobody can re-derive is not evidence.

  `--rev <commit>` reads the corpus out of git in a single
  `git cat-file --batch` pass, which is what makes a historical figure
  reproducible by command. Every figure in the spec's re-read table now
  falls out exactly at `ab47a3e7` — 133 files / 3,513 functions / 67,182
  test LOC / 67,634 production LOC / ratio 0.99 / 142 `parametrize` —
  and the counters were validated against the *earlier* commit first,
  reproducing 124 / 3,345 / 60,188 / 62,103 / 0.97 at `8fda8d85`. The
  clause that had been doing invisible work is now stated: a **test
  file** is one whose *basename* matches `test_*.py`, not every `*.py`
  under `ai_router/tests/`, which reads 131 files rather than 124.

  The working-tree corpus is enumerated from the **filesystem**, not
  from `git ls-files`: an inventory that reads only tracked files
  silently omits a test that exists but has not been committed
  (L-064-9).

- **(Set 118 S1) Coupling as named detectors and a tier, rather than one
  unnamed regex.** `D1-spec-prose` and `D2-bare-file` reproduce the two
  readings that bracket the spec's stated figure (43 / 1,294 and 48 /
  1,497 at `8fda8d85`), byte-for-byte with Set 128 S3, so the history
  stays checkable. `D3a-enumerates-anywhere` reproduces the measurement
  correction's own grep. `D4-enumerates-real-tree` is the answer, and it
  is a **dataflow** question: assignments are followed to a bounded
  fixpoint, a helper returning a `__file__`-derived path taints its
  callers, and the path must actually be enumerated — or handed to a
  call whose result is iterated. Strong coupling is **222 test functions
  at the spec's own commit, not 1,485**.

  `D4` was wrong three times before it was right — as a co-occurrence
  check it called a `tmp_path` `.iterdir()` "the real tree"; widened to
  any argument-passing it became numerically identical to `D3`; narrowed
  to iterated results it read `os.path.join(os.path.dirname(...))` as an
  enumeration. **Not one of the three was found by reading the
  predicate**; each was found by a cross-provider verifier planting a
  real file shape, and each narrowing ships the falsifier that broke it
  (L-112-1).

- **(Set 118 S1) Guard classification, marker-first and precision-tuned.**
  A `pytest.mark.guard` reader ships now so the Set 118 S2 convention
  only has to *apply* the marker; until then an evidence-carrying
  heuristic seeds it, and the report counts `by marker` against `by
  heuristic` so the migration is visible. Each guard reports its age in
  sets since the decision it pins.

  The published `guard.limits` predicate states what the heuristic
  **cannot** see, because a rule fed a noisy population is worse than
  one fed a small clean population. Bare `"resurrection"` is not a
  signal here — the verification loop uses it for a settled finding that
  reappears — and an *invariant pin* is mechanically indistinguishable
  from an ordinary behaviour test. That gap is the argument for the
  marker, not a defect in the heuristic.

- **(Set 118 S1) A1 sole-cover, with its holes made visible.**
  `soleCover` reports which production modules have exactly one covering
  test file, which is what stops a later retirement from silently making
  every subsequent session's targeted run cheaper. Dynamic imports are
  handled honestly: `importlib.import_module(<non-literal>)` cannot be
  resolved statically, and reading it as *imports nothing* had published
  `ai_router/report.py` as **uncovered when it is not** —
  `test_entry_points.py` imports every `[project.scripts]` target
  through a name read out of `pyproject.toml`. The map is now completed
  from the **declaration**, and any dynamic import that still cannot be
  resolved is counted per file and listed under
  `unresolvedDynamicImportFiles`. Reading the declaration **fails
  closed**: on an interpreter without `tomllib` (the package supports
  Python 3.10) an unreadable `pyproject.toml` produces a visible hole,
  never a confident zero.

### Notes

- The module is `suite_inventory`, **not** `test_inventory` as the Set
  118 spec names it. `test_packaging_hygiene.py` asserts every
  `test_*.py` under `ai_router/` lives in `ai_router/tests/`, which is
  what turns the wheel's `ai_router.tests*` exclude into a *proof* that
  no test module ships. The guard refused the spec's filename on the
  first targeted run, and a name is not worth widening a packaging
  invariant for.
