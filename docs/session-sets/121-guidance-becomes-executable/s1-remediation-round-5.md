# Remediation — Set 121 Session 1, Round 5 (close backstop)

One Major, **ACCEPTED**. This one is a **false positive** in the guard,
not a false negative — the opposite direction from every earlier round,
and worth saying plainly because it is the failure mode a gate's author
is least likely to look for.

## The finding

`files = list(_sources())` was classified as **lazy** whenever
`_sources()` returned `ROOT.rglob(...)`. The Round 3 fix propagated
helper laziness through the call, but did not stop at the wrapper: a
materializing call around a lazy helper still inherited the helper's
laziness. So a **valid** corpus assertion — a real list, correctly
asserted — would have been reported as an offender.

## Why this matters as much as the false negatives

Rounds 1–3 were all false negatives: shapes the guard could not see. This
is the mirror image, and it is more corrosive. A gate that refuses
correct code teaches its authors that it is noise, and the next person
who hits it will reach for a suppression rather than an assertion. The
guard would then be worse than absent, because it would have trained
people to route around it.

It is also the same underlying error one more time: the Round 3 rule was
written for the shape in front of me (`files = _sources()`) and applied
to a shape I had not considered (`files = list(_sources())`).

## The fix

`ai_router/corpus_scan_guard.py` gains `_materializes()`, and **the
wrapper wins over what it wraps**:

- `_corpus_variables()` marks a variable lazy only when its value is
  *not* materialized — so `list(...)`, `set(...)`, `tuple(...)`,
  `sorted(...)`, `frozenset(...)` and any comprehension clear laziness
  regardless of the helper inside.
- `_lazy_returning_helpers()` applies the identical rule to `return`
  statements, so `def _sources(): return sorted(_walk())` is not a lazy
  helper even though `_walk()` is.

The rule is now stated once and used in both places, so the two cannot
disagree.

## Falsifiers added

`ai_router/tests/test_corpus_scan_guard.py`:

- `test_materializing_a_lazy_helper_at_the_call_site_is_accepted` — the
  exact shape the finding names.
- `test_a_helper_that_materializes_a_lazy_helper_is_not_lazy` — the same
  rule inside the helper chain.
- `test_a_comprehension_over_a_lazy_helper_is_not_lazy` — the
  comprehension form.

The three violation falsifiers from Round 3
(`test_a_lazy_walk_returned_through_a_helper_is_still_lazy`,
`test_laziness_crosses_two_helper_boundaries`,
`test_a_lazy_fixture_corpus_is_still_lazy`) all still pass, so the
correction did not simply switch the rule off — laziness still
propagates when nothing materializes it.

Guard reports **0 offenders across 144 test modules**; 28 falsifiers
green.
