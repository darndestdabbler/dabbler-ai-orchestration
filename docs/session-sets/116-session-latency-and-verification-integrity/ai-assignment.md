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

## Session 3 — Ten gates to three

**Orchestrator:** `claude` / `anthropic` / `claude-opus-5`, effort
`high` (Direct APIs transport) — matching Session 2's recorded
`continue-current-trajectory` recommendation exactly, on its stated
reasoning: Session 3 depends directly on S2's staleness fix for the
Step 5 → Step 8 reordering, and it edits the same `run_of_record`
freshness machinery S2 just regression-tested.

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires. This set's `pathAwareCritique: required`
also falls due here, at the set-terminal close.

**This session removes verification, which changes who decides.** The
whole of Step 3 sits inside the decision-rights hard carve-out, so the
authority is the operator's and `decision_journal` will refuse to write
it otherwise. The operator ruled on 2026-08-10 (`operator-notes.md`);
this session presents that ruling, confirms it still stands, and
journals the attestation *at the moment of implementation*. The notes
file is direction, never the attestation — it says so itself.

**Three things this session must not do**, recorded before the fact:

- **Not convert a demotion into a deletion.** The ruling deletes
  nothing, and the tidier code that would result from deleting a
  demoted check is exactly the pressure the spec names as a risk. A
  demoted check still runs, still prints, and still has its tests.
- **Not treat the two preconditions as survivors of a cull.**
  `working_tree_clean` and `pushed_to_remote` protect the *write* — a
  close computed against a dirty or unpushed tree records something
  that was never true. They are enforced for a different reason than
  the three gates, and the code should say which reason.
- **Not widen `test_run_fresh` beyond what the ruling asks.** The
  path-level scoping the operator asks for (a docs-only session owes
  no Playwright) already exists in `evaluate_freshness`. The actual
  defect is narrower and specific: `pytest` and `mocha` carry
  `expensive: False`, so the once-per-session rule never governed the
  suite that costs the time.

**Evidence this set generated for its own ruling.** Both prior sessions
of Set 116 closed on an operator-attested `checklist_posted` waiver
(S1 for 11 missed transitions during a four-round loop; S2 for a single
transition whose 5.6-second window closed while a verifier nit was
being fixed). Two waivers in two sessions, on the gate the ruling
demotes, are the strongest available argument that the veto — not the
signal — was the problem.

**Recommended next orchestrator:** none. Session 3 is set-terminal, so
`disposition.next_orchestrator` is legitimately absent and the
next-set recommendation goes in the Step 9 review and `change-log.md`.

---
