# Remediation — Set 121 Session 1, Round 2 (supplementary discovery)

One Major finding, **ACCEPTED**.

## The finding

**Pytest fixture-provided repo corpora bypass the guard entirely.** A
scan factored into a `@pytest.fixture` reaches its consumer purely by
**parameter name** — nothing in the test body calls it, walks a tree, or
names the fixture at all. The guard decided "does this test scan the
repo?" from direct walks and call-graph edges only, so the whole fixture
mechanism was a silent false negative.

## Why this is right

This is the same class as Round 1's finding 1, one level further out, and
the verifier is correct that it is *probable rather than speculative* in
this repo: fixtures are the suite's standard sharing mechanism, and
`ai_router/tests/conftest.py` already defines shared repo-shaped fixtures.
A maintainer factoring a corpus scan into a fixture is doing the ordinary
thing, and would have silently left the guard's coverage.

It also exposes a second, sharper hole the finding names in passing: a
fixture defined in **`conftest.py`** has *no* representation in the test
module at all. Even a guard that understood same-module fixtures would
see nothing — the test's parameter list is the only evidence that a
corpus was ever built.

## The fix

`ai_router/corpus_scan_guard.py`:

1. **Parameter-name matching.** A `test_*` function whose parameters
   intersect the module's corpus-building helper names is treated as
   scanning the repo, and the injected parameter is registered as the
   corpus variable — so `assert sources` in the consumer counts, and its
   absence is an offence. A `@pytest.fixture` needs no special case: it
   is simply a non-`test_` function, so one that walks the repo already
   lands in `self_rooted`.
2. **`conftest.py` is read.** `_conftest_corpus_fixtures()` parses the
   sibling `conftest.py` and contributes its corpus-building helper names
   to the same match. Absent or unparseable conftest is not an error —
   most directories have none.

The fixpoint from Round 1 was extended to cover fixtures depending on
fixtures, so a corpus fixture consumed by another fixture is promoted
too.

## Falsifiers added

`ai_router/tests/test_corpus_scan_guard.py`, planted into the corpus the
guard actually reads:

- `test_it_fires_on_a_fixture_injected_corpus` — the violation.
- `test_a_fixture_injected_corpus_that_is_asserted_is_accepted` — the
  look-alike, which must stay silent.
- `test_a_conftest_fixture_corpus_is_seen` — the cross-file case, where
  the fixture is defined in `conftest.py` and the test names only the
  parameter.

Guard reports **0 offenders across 144 test modules**; 91 tests green.

## Acceptance criterion

The Round 2 criterion has the same shell-escaping defect as Round 1's and
is proven equivalently; see the table in `s1-remediation-round-1.md`.
Pre-fix the fixture-injected plant was silent, post-fix it is flagged, and
the asserted look-alike stays silent on both trees.

