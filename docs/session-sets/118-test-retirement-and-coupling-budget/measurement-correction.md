# Measurement correction — the coupling number this set is scoped against

> **Status:** finding recorded 2026-08-10, before Set 118 Session 1 runs.
> **Not a ruling.** It asserts a discrepancy and asks for re-derivation;
> it does not re-scope the set.
>
> **Why this file exists:** Session 1 step 4 of [`spec.md`](spec.md) says
> this set's numbers *"must fall out of `test_inventory`, not out of a
> one-off shell command. A discrepancy is a finding about the tool, not
> about the spec — chase it before proceeding."* This is that discrepancy,
> found early enough to re-scope the set rather than discover it in
> flight.

## What the spec claims

> **47 files carrying 1,485 tests (44% of all test functions) reach into
> the real repository tree** — via `Path(__file__)`, `parents[N]` or a
> repo-root constant — rather than a `tmp_path` fixture. Those are the
> tests that break on a rename, a doc move or a refactor, and they are
> where the change-amplification tax is actually paid.

## What re-measurement shows

Measured 2026-08-10 against the working tree, counting `def test_` the
same way the spec does:

| measure | files | test functions | share |
| :--- | ---: | ---: | ---: |
| Total | 119 | 3,397 | — |
| **Broad regex** (`Path(__file__)` \| `parents[N]` \| `REPO_ROOT` \| `repo_root`) | 43 | **1,326** | 39% |
| Derive any path from `__file__` | 30 | 899 | 26% |
| **Enumerate the real tree** (`__file__` **and** `glob`/`iterdir`/`rglob`) | **5** | **66** | **1.9%** |

The broad regex reproduces the spec's figure closely — 43 files / 1,326
functions here against 47 / 1,485 there, on a tree that has moved since.
That near-match is the evidence that the spec used this regex.

**The regex over-matches, in two distinct ways.**

**1. `repo_root` is an ordinary identifier.** It is a parameter name and a
keyword argument throughout the suite, in tests that are correctly
sandboxed:

```python
def _git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:   # a helper's parameter
run_of_record.record(..., repo_root=str(root))                          # root is tmp_path
pull_verifier.run(repo_root=str(sandbox), ref="HEAD")                   # an isolated sandbox
```

Passing a tmpdir to a parameter named `repo_root` is the *opposite* of
reaching into the real tree.

**2. `docs/...` appears as test data, not as a path that is opened.**
Every occurrence checked in the flagged files is a string literal:

```python
PreloadEntry(path="docs/planning/lessons-learned.md", ceiling_tokens=100)  # constructed entry
_disp(files_changed=["docs/notes.md"])                                     # fake change list
assert "docs/session-sets/gate-set" in expected                            # string comparison
# ...to the git repo root containing the set, NOT Path.cwd() ...           # a comment
```

**18 of the 43 files match the regex ONLY through these two mechanisms**
and never touch `__file__` at all. Each was checked individually; none
reads the real repository.

## What genuinely is repo-coupled

Two tiers, and they behave differently:

**Tier 1 — the repository IS the system under test (~4 files).**
`test_drift_guard.py`, `test_no_legacy_field_reads.py`,
`test_packaging_hygiene.py`, `test_production_imports.py`. These must read
the real tree; that is their purpose. A guard asserting *"no spec declares
`tier: lightweight`"* cannot be given a `tmp_path` fixture without
asserting nothing. **This is not coupling debt and must not be
"remediated."**

**Tier 2 — plausibly convertible (a handful).**
`test_orchestrator_identity.py`, `test_session_events.py`,
`test_session_state_backfill.py`, `test_spec_config.py`,
`test_verify_session_phases.py`.

Most of the remaining 30 that touch `__file__` use it only to locate the
package or a fixture directory. That is **weak** coupling — it breaks if
the directory depth changes, not on a rename or a doc move, which is the
failure mode the spec is concerned with.

## What this does and does not touch

**Premise A — coupling — is materially weakened.** The change-amplification
tax the set was scoped to attack appears to be paid by roughly **66 test
functions, not 1,485**.

**Premise B — guard accrual — is untouched and stands on its own.** It does
not depend on the coupling number:

> +29 test functions per day, sustained for 100 days. `test_lightweight_resurrection_guard.py` — 43 tests guarding a tier deleted in Set 112. `test_set111_close_gates.py` — 19 tests pinned to one historical set. **No set has ever removed one.**

That asymmetry is real, independently measurable, and is the stronger half
of the set's case.

## Recommended disposition

1. **Re-derive both numbers with `test_inventory`** (Session 1's own
   deliverable) before Session 2 rules on a retirement policy. Distinguish
   *derives a path from `__file__`* from *enumerates the real tree* from
   *mentions a repo-ish identifier*. The last is not coupling.
2. **Re-scope or retire the coupling half of the set** if re-derivation
   confirms this. A set whose premise is a measurement artifact should be
   re-authored, not executed.
3. **Keep the guard-expiry work regardless.** It is Premise B, and this
   finding does not touch it.

## Caveat, stated plainly

The exact command behind the spec's figure is not recorded, so this
compares a reconstruction against a result. The near-match (43/1,326 vs
47/1,485) makes the reconstruction likely but not certain.

The author of this note also made two over-counting errors of the same
family earlier in the same session — a regex matching module names inside
comments and strings, and this one — which is precisely why the
recommendation is *re-derive with the tool*, not *accept these numbers*.
