# Session 1 — remediation of Round 1

One Major finding, from discovery call 2 (`failure-scenario` lens).
Accepted in full; not disputed.

---

## The finding

> The public component identifiers do not match the session's literal
> measurement-name contract.

`spec.md` step 2 named the three measurements `routed_call_cost`,
`routed_seat_cost` and `orchestrator_seat_cost`. `seat_cost.py`,
`seat-cost.md` and the `close-out.md` pointer all shipped `routed_api`,
`routed_seat` and `orchestrator_seat`.

**Why it is Major and not a nit.** These strings are not prose. They are
the values of `seat_cost.COMPONENTS`, the `component` key of every entry
`CostReport.to_dict()` emits, and — by the set's own plan — the keys
Session 3's `disposition.cost` will persist into a schema with a
validator and a schema doc. A vocabulary that is ambiguous *now* becomes
schema drift across three surfaces *later*, which is the exact
three-surface hazard L-064-8 describes and which Session 3 is already
carrying. The verifier found it in the one window where it costs a text
edit.

## The fix

**One vocabulary: the short names win.**

| public identifier | rejected spelling |
| :--- | :--- |
| `orchestrator_seat` | ~~`orchestrator_seat_cost`~~ |
| `routed_seat` | ~~`routed_seat_cost`~~ |
| `routed_api` | ~~`routed_call_cost`~~ |

The choice is not arbitrary. These sit under a `cost` parent in Session
3's `disposition.cost`, where `cost.routed_call_cost` stutters and
`cost.routed_api` does not. The alternative — renaming the code to the
spec's spelling — would have been equally consistent and produced a
worse key in the artifact that outlives this set.

Changes:

1. **`ai_router/docs/seat-cost.md`** gains a short section, *"These three
   strings are the public identifiers"*, immediately after the table that
   introduces them. It states that they are `seat_cost.COMPONENTS`, the
   `to_dict()` component key and the `disposition.cost` key, and names
   the reason the `_cost` suffix is refused.
2. **`docs/session-sets/130-orchestrator-seat-cost-capture/spec.md`**
   step 2 of Session 1 now uses the three public identifiers and says
   plainly that they are the public vocabulary Session 3 consumes.
3. **`ai_router/tests/test_seat_cost.py`** gains two tests that convert
   the finding's `JUDGMENT` acceptance criterion into a mechanical one.

No change to `ai_router/seat_cost.py` or to `ai_router/docs/close-out.md`
— both already used the winning spelling.

## Why the fix ships with falsifiers rather than a promise

The acceptance criterion was `JUDGMENT` ("all agree on the same public
measurement names"), and a judgment criterion re-opens the moment someone
renames something in a hurry. Both new tests were **proved to fire**, not
merely observed to pass:

- `test_public_component_identifiers_are_the_documented_ones` pins the
  tuple, asserts every identifier appears in `seat-cost.md`, and asserts
  none of the three rejected spellings does. Planting
  `"Legacy alias: routed_call_cost."` into the doc fails it with the
  exact diagnostic.
- `test_to_dict_emits_the_public_identifiers` asserts the same three
  strings **on the wire**, through `CostReport.to_dict()`, because that
  is the surface Session 3 actually consumes. A constant renamed without
  its doc, or a `to_dict()` that relabels components, fails there.

The doc assertion also guards against the empty-corpus shape L-112-1
warns about: it asserts the document is non-empty before searching it, so
a deleted or unreadable `seat-cost.md` cannot pass by having nothing to
find.

## Suite after remediation

`ai_router/tests/test_seat_cost.py` — **24 passed** (22 before, +2).
