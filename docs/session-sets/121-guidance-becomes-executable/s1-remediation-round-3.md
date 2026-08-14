# Remediation — Set 121 Session 1, Round 3 (remediation-review)

Fix verdicts: **3 accepted, 1 rejected.** One new Major on the fix delta,
**ACCEPTED**.

## The finding

**Laziness was not propagated across the call boundary.** The Round 1
fix introduced the rule *"only a materialized corpus can be asserted by
bare truthiness"* — correct — but marked laziness only on the
**immediate right-hand side** of an assignment. So:

```python
def _sources():
    return ROOT.rglob("*.py")      # a generator

def test_scan():
    files = _sources()             # _is_lazy_walk() sees a plain Call
    assert files                   # accepted, and proves nothing
```

The guard classified `_sources` as a corpus helper, derived `files` as
the corpus, and then treated it as **solid** because the right-hand side
was a helper call rather than a visible walk.

## Why this is right, and why I introduced it

I made this trade-off knowingly and recorded the wrong reason for it. The
Round 1 fix assumed helper calls return materialized collections "because
helpers usually return a list", and accepted the residual rather than
following the value. That is precisely the reasoning `L-112-1` rejects:
the rule held for the corpus in front of me, and its failure mode was
invisible because no test in this repo returns a bare `rglob`.

It is also the worst of the three false-negative shapes, because it is
the one the guard's own documentation invites. The module tells authors
to factor corpora into helpers; `return ROOT.rglob("*.py")` is the
shortest way to do that, and the guard would have blessed the vacuous
assertion that follows.

## The fix

`ai_router/corpus_scan_guard.py`:

- **`_lazy_returning_helpers()`** — a fixpoint over the module's helpers
  that marks any whose `return` hands back an unmaterialized walk,
  directly, through a local variable already known to be lazy, or through
  another lazy helper. Depth is unbounded, so a two-hop chain
  (`_walk` → `_sources` → test) is caught.
- **`_corpus_variables()`** takes `lazy_helpers` and marks a variable
  assigned from such a call as lazy, so `_asserts_non_empty()` refuses
  bare truthiness over it exactly as it does inline.
- **Fixtures inherit it too.** An injected fixture parameter is marked
  lazy when the fixture is lazy-returning, and `_conftest_corpus_fixtures`
  now returns the conftest's lazy set alongside its helper set, so the
  cross-file case behaves identically.

## Falsifiers added

`ai_router/tests/test_corpus_scan_guard.py`:

- `test_a_lazy_walk_returned_through_a_helper_is_still_lazy` — the
  violation, exactly the shape the criterion names.
- `test_a_materializing_helper_is_accepted` — the look-alike, one
  `list()` apart, which must stay silent.
- `test_laziness_crosses_two_helper_boundaries` — the fixpoint, proving
  depth is not capped at one.
- `test_a_lazy_fixture_corpus_is_still_lazy` — the same defect arriving
  by injection.

## Acceptance criterion

The Round 3 criterion carries the same shell-escaping defect as Rounds 1
and 2, so it was proven equivalently — this time against the harness's
own recorded **round 2 fixed tree** (`652ce12580ee`), extracted with
`git show`, which is the exact pre-fix state the criterion targets:

| plant | pre-fix (round 2 tree) | post-fix |
| :--- | :--- | :--- |
| helper returns a bare `rglob` | silent | **flagged** |
| same helper wrapped in `list()` | silent | silent |

Fails pre-fix, passes post-fix, and the look-alike is silent on both —
the auto-close condition, met.

Guard reports **0 offenders across 144 test modules**; 25 falsifiers
green in the guard's own module.
