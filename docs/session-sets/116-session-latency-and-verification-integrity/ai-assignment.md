# AI assignment log — Set 116

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — Make the suite cheap, and make its cost visible

**Orchestrator:** `claude` / `anthropic` / `claude-sonnet-5` (Direct APIs
transport).

**Verification:** will route to a non-anthropic effective provider, as
the cross-provider rule requires.

**Why this session first, unmodified from the spec's own reasoning:**
the spec orders it first because it is self-funding — every minute cut
from the suite here is a minute Sessions 2 and 3 of this same set stop
paying. There is no judgment call to make about sequencing; the spec
already closed it ("Priority: Run before Sets 113 and 115... Session 1
is the cheapest, largest win and goes first").

**What Session 2 must not inherit uncritically** (recorded here so it
does not have to re-derive it): the xdist parity proof and the
`durationSeconds` field are Session 1's to build; Session 2 only
consumes the corrected numbers and the exclusion Session 1 must add to
`verification_stamp.py`'s bookkeeping list in *this* session (per spec
step 4) rather than deferring it to Session 2, which owns the reasoning
but must not be the one shipping a new un-excluded writer.

---

## Session 2 — Close the two holes in the verification loop

**Orchestrator:** `claude` / `anthropic` / `claude-opus-5`, effort
`high` (Direct APIs transport). Session 1's disposition recommended the
same engine and provider under `continue-current-trajectory`, on the
reasoning that S1's own verification loop lived the exact bug S2 fixes
(four rounds, the 2-cycle bound hit twice, and a close backstop that
would have been free to buy more). The model is opus rather than
sonnet — the operator's seat selection at session start, recorded as it
actually is rather than as recommended.

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**The session verifies the machinery that judges it.** The spec names
this as a risk, and it is the real one: Session 2 changes the round
budget while a round budget governs Session 2. Two consequences worth
recording before the fact rather than discovering after it:

- The new bound applies to **this** session's own close. If the loop
  runs long here, the backstop will refuse exactly as designed, and the
  correct response is the operator exit — not a code change to widen the
  cap, which would be self-authorizing a verification reduction.
- The ledger (`s2-rounds.jsonl`) is the artifact under change *and* the
  input to the arithmetic being changed. Expect to read it by hand at
  least once rather than trusting the count.

**Recommended next orchestrator (Session 3):** recorded at close in
`disposition.json`, not pre-committed here — Session 3 implements an
operator gate ruling and its needs depend on what this session's
verification surfaces.

---
