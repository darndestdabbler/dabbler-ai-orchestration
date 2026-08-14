# Remediation — Set 121 Session 1, Round 1 (discovery, both lenses)

Four Major findings, all **ACCEPTED**. Every one names a real shape that
walked straight through the new `corpus_scan_guard`, and one of them is a
shape **this session itself created**. Findings 1 and 4 share a root
cause and were fixed together.

## The findings, and the verdict on each

| # | Finding | Verdict |
| :--- | :--- | :--- |
| 1 | Repo scans hidden behind a second helper layer are missed — including the `_scan_for_violations()` → `_scanned_sources()` shape this session introduced | ACCEPTED |
| 2 | `assert files` where `files = ROOT.rglob(...)` is accepted as non-empty proof, though a generator is **always** truthy | ACCEPTED |
| 3 | A scan rooted at a local `root = Path(__file__).resolve().parent` is not detected at all | ACCEPTED |
| 4 | Helper detection is not transitive (same root cause as 1) | ACCEPTED |

## Why these are right, and why I did not see them

The guard was built and calibrated **against the corpus that exists
today**. That is precisely the mistake `L-112-1` describes, committed
while encoding `L-112-1`: I iterated until the offender list looked
correct on this repo, and read that as the guard being correct. It is not
the same claim. A gate calibrated to its current corpus is a gate whose
false negatives are invisible by construction, because nothing in the
corpus exercises them.

Finding 1 is the sharpest instance. Fixing
`test_no_legacy_field_reads.py` required extracting `_scanned_sources()`
so the assertion could use the gate's own corpus definition — which left
`_scan_for_violations()` calling it, a two-layer chain. The guard's own
`self_rooted` set only promoted helpers that touched the filesystem
**directly**, so the shape I had just written was one the guard could no
longer see. The falsifier I shipped covered a one-layer helper, so it
passed.

Finding 2 is a genuine defect in the encoded rule itself, not just its
coverage. The lesson being encoded is *"assert the input set is
non-empty."* `Path.rglob` returns a generator; `bool(generator)` is
`True` unconditionally. So the guard would have certified
`files = ROOT.rglob("*.py"); assert files` as compliant — a vacuous
assertion accepted by the anti-vacuity gate. That is worse than not
having the gate, because it launders the defect.

Finding 3 is scope drawn too tightly. I discriminated repo scans from
fixture scans by requiring a **module-level** path constant, on the
reasoning that a constant is minted from `__file__` at import time. The
reasoning was right; the implementation checked the wrong location. A
local `root = Path(__file__).resolve().parent` is minted from `__file__`
just as surely, and it is the more idiomatic spelling of the two.

## The fixes

All in `ai_router/corpus_scan_guard.py`.

1. **Transitive helper resolution** (findings 1, 4). `_corpus_helpers()`
   replaces the one-pass classification with a **fixpoint**: a helper is
   a corpus builder if it walks the repo itself, calls a helper that
   does, or receives one as a parameter. Depth is now unbounded rather
   than one.
2. **Materialization tracking** (finding 2). `_is_lazy_walk()` marks a
   corpus variable holding an unmaterialized walk (`rglob`/`glob`/
   `iterdir`/`os.walk`/a generator expression) as *lazy*, and
   `_asserts_non_empty()` refuses bare truthiness over a lazy name.
   `len(...)`, membership and the materialized forms (`list`, `set`,
   `tuple`, `sorted`, `frozenset`, comprehensions) still count — the rule
   removes only the shape that proves nothing.
3. **Local `__file__` roots** (finding 3). `_repo_path_names()` now also
   seeds from any in-function assignment whose value names `__file__`,
   so the local spelling is recognised as the repo.

## Falsifiers added

Each fix ships with a planted violation, and the two that could be
over-applied ship the paired look-alike as well
(`ai_router/tests/test_corpus_scan_guard.py`):

- `test_it_fires_on_a_layered_helper_chain` — the three-layer lint shape.
- `test_a_lazy_iterator_is_not_a_non_empty_proof` — the generator form.
- `test_the_same_scan_materialized_is_accepted` — its look-alike, one
  `list()` apart, which must stay silent.
- `test_it_fires_on_a_local_dunder_file_root` — the local root spelling.

## What the stronger guard then found

Re-running it surfaced **two more offenders** that the weaker version
could not see, which is the fix demonstrating itself:

- `test_spec_config.py::test_repo_session_sets_all_parse` — a **real**
  vacuous scan: it globbed `docs/session-sets/*/spec.md` and parsed each,
  with no assertion that any spec was found. Fixed by asserting the
  corpus.
- `test_start_session.py::test_the_environment_variable_is_spelled_in_exactly_one_module`
  — a **false positive**. It does assert `scanned`, but `scanned` is
  built by `append` inside the loop and never appears on the left of an
  assignment, so assignment-following alone could not see it as the
  corpus. Fixed in the guard (`_ACCUMULATOR_METHODS`), with
  `test_an_accumulated_corpus_counts_as_asserted` planted so the
  regression cannot return.

Guard now reports **0 offenders across 144 test modules**; 91 tests green
across the guard's own module and both affected modules.

## The acceptance criteria are unrunnable as generated — proven equivalently

`acceptance_harness --round 1` reports three criteria as *still failing*.
They are not failing on the substance. Each generated criterion is a
`python -c "exec('...')"` one-liner whose inner `\"` escapes lose a level
when the string reaches the shell, so it dies before it tests anything:

```
File "<string>", line 8
    ... if p in root.rglob("*.py") ...
SyntaxError: invalid syntax
```

The criteria are **raw verification artifacts and were not edited**.
Instead each one's *intent* was reproduced as a runnable equivalent that
plants the identical module and asserts the identical outcome, and run
against both trees. Pre-fix, the guard blob was taken from the git index
(`git show :ai_router/corpus_scan_guard.py`), which still held the
pre-remediation version.

| criterion | pre-fix | post-fix |
| :--- | :--- | :--- |
| R1 #0 judgment pair — violation (`_sources` -> `_scan` -> `test_*`) | silent | **flagged** |
| R1 #0 judgment pair — look-alike (same chain, corpus asserted) | silent | silent |
| R1 #1 lazy iterator (`files = ROOT.rglob(...)`; `assert files`) | silent | **flagged** |
| R1 #2 local `root = Path(__file__).resolve().parent` | silent | **flagged** |
| R1 #3 layered helper chain | silent | **flagged** |
| R2 #0 fixture-injected corpus | silent | **flagged** |

Every criterion discriminates exactly as the harness requires — fails on
the unchanged criterion pre-fix, passes post-fix — and the paired
look-alike is silent on both trees, so the fix is not over-applied. This
is the auto-close condition the harness would have recorded had the
generated commands been executable.

Each row is additionally pinned by a pytest falsifier in
`ai_router/tests/test_corpus_scan_guard.py`, so the evidence does not
depend on a one-off script.
