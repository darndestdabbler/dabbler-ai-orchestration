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
