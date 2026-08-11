# AI assignment log — Set 119

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — Give findings a provenance, and stop prose opening rounds

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**This session changes the severity machinery, so it will be verified by
it.** The spec names that irony and bounds it at **30 new test functions**;
the session shipped exactly 30, in one module
(`ai_router/tests/test_doc_only_cap.py`). It also means the cap is live for
this session's own verification round: a finding whose cited evidence is
only this session's markdown will record as a nit rather than open a round.
That is the deliverable working, not the deliverable evading review — the
code surfaces (`verification.py`, `pull_verifier.py`,
`path_aware_critique.py`, `verification_stamp.py`) and the two JSON schemas
are all non-doc paths and block exactly as before.

**One change the spec did not list, and why it is not scope creep.** The
reviewer template `ai_router/prompt-templates/verification.md` is
**hash-pinned** by the verification-integrity gate: editing it under an
unbumped `TEMPLATE_ID` fails closed, by design, so that an operator
template revision can never be an accident. Adding the mandatory
`Evidence paths:` line is exactly such a revision, so `TEMPLATE_ID` moved
`session-verification-v7` → `v8` with a new pinned hash in the same change.
Sixteen tests in `test_verification_integrity_gate.py` failed until it did;
they are the protocol working.

Two further files outside the spec's Touches list were updated for the same
reason — a producer that emits a field its own artifact schema does not
declare is the schema↔validator drift `L-066-1` exists to prevent:
`docs/path-aware-critique.schema.json` declares `evidencePaths` and
`path_aware_critique.py` type-checks it, in both directions.

**What Session 2 inherits:**

1. **`evidencePaths` is contract now, but it is not yet enforced anywhere.**
   The templates ask for it and both parsers read it; nothing refuses a
   blocking finding that omits it, because refusing would make an
   uncited finding *cheaper* to raise, not dearer. If a later session wants
   enforcement, the honest form is a report, not a gate.
2. **The cap's blast radius is measurable and should be measured.** Session
   2 replays historical close-out failures; the same replay could count how
   many of the 520 historical Major findings cite only documentation. The
   spec's "148 of 212" is a prediction about the preflight; this is the
   parallel prediction about the cap, and neither is yet measured.
3. **`BEHAVIOURAL_MARKDOWN_PREFIXES` is a one-entry list and will need
   review, not growth.** It currently holds `ai_router/prompt-templates/`.
   If a second entry ever seems necessary, that is a signal the
   extension-based rule is being asked to carry a judgment it cannot —
   simplify the rule rather than lengthen the list (the same lesson Set 111
   S2 learned about test-asset classification, and Set 111 S2's decision
   journal about open-ended classifiers).

**Recommended next orchestrator (Session 2):** recorded at close in
`disposition.json`, not pre-committed here.

---

## Session 2 — Make the close's obligations knowable before it runs

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**One judgment call, journaled.** The spec's Touches list for this session
names `ai_router/close_preflight.py`, `ai_router/gate_checks.py` (callers
only), tests and docs — it does **not** name `close_backstop.py`. This
session edited it anyway, extracting `decide_backstop` (+
`BackstopDecision`) out of `run_close_backstop`, which now consumes it.
The reason is the same spec's step 2, which requires the preflight to
evaluate the close's predicates "by calling them rather than
re-implementing them". The backstop's skip-vs-run sequence is a
seven-branch decision with a load-bearing ORDER (the round bound is
checked *after* the settling-evidence skip, deliberately, so a session
that verified clean still closes). Copying that into the preflight would
have created exactly the two-spellings-of-one-rule drift `L-066-1` and
`L-069-1` name — and a preflight that disagrees with the gate is worse
than no preflight, because it teaches orchestrators to distrust it.
Goal over letter; `run_close_backstop`'s behaviour is byte-identical and
its 51 tests pass untouched.

**Two things the spec did not ask for, and why they are not scope creep.**

1. `_emit` (the print guard). The preflight relays remediation text
   authored by other modules, and `close_backstop`'s diff-base refusal is
   spelled with an em dash. cp1252 encodes that fine — but cp437 and
   cp850, still live Windows console codepages, do not. A **reporting**
   tool that dies mid-print is the worst possible failure mode, because
   it is invoked precisely when someone is trying to find out what is
   wrong (L-079-1). The first draft of this guard shipped with a
   docstring claiming cp1252 was the failing codepage; that was wrong,
   the test written against it passed vacuously, and both were corrected
   before the freeze.
2. The `session_number: 0` fix in the replay. Found by the step-4
   measurement itself, described below.

**Step 4's measurement, and the verdict the spec demanded.** The spec
predicted ~148 of 212 and required the session to say whether any
discrepancy was the tool's fault or the spec's. Measured today: 186
events, 214 check-failures, 64 demoted, **150 still blocking, 150
covered**. Filtering the ledger to before `2026-08-10T20:28Z` reproduces
the spec **to the digit** — 184 events, 212 failures, 148 still-blocking,
78 backstop, 122 sessions. The delta is exactly Set 117 Session 1's two
close-out failures, recorded ~2 hours before this set's Session 1 began.
**The spec's prediction was right; history grew.** The strong claim ("the
remaining 148 are all knowable before close-out runs") is confirmed
rather than merely asserted: coverage is 150/150.

Reconciling the session count is what found the one real instrument
defect: 123 vs the spec's 122, because a legacy Set 047 event carries
`"session_number": 0` and the tally counted it as a session. Session
numbers are 1-based everywhere here, so it is now excluded from the
session tally — while its check-failures still count, because a close
really did fail and really did name them — and discarded events are
surfaced as `unnumbered_events` rather than vanishing.

**What Session 3 inherits:**

1. **The preflight is discoverable, but only just.** The constitution is
   at 3,984 of its 4,000-token ceiling, and ceilings ratchet down only.
   The Step 8 pointer row was reworded to name the preflight *before*
   close (evicting nothing); the narrative lives in `close-out.md`
   Section 1 and the workflow doc. If Session 3 or the later preload set
   wants more than a pointer, that is an eviction decision, and the spec
   already warns where that road goes.
2. **`EvidenceTooLargeError` is the one pre-metered refusal the preflight
   does not predict.** It is raised by the evidence assembly *after*
   `decide_backstop` returns — the single expensive read in the sequence,
   deliberately not performed. Session 3 touches `close_backstop.py` for
   the baseline record and could fold it in cheaply, but should weigh the
   cost: assembling evidence on every preflight run would make a
   run-it-on-a-whim tool no longer cheap.
3. **`decide_backstop` is now the seam Session 3 wants.** Session 3 must
   make a backstop round write a `discoveryBaselineTree` so
   `--phase remediation-review` is reachable. The decision and the
   execution are now separated, so that change lands in the execution
   half without touching the seven-branch decision the preflight depends
   on.
4. **The doc-only cap's blast radius is still unmeasured.** Session 1
   named it as an owed residual and this session did not fold it in: the
   replay reads `session-events.jsonl` (close-out failures), while that
   question needs `sN-issues*.json` (findings), which is a different
   corpus and a different instrument. It remains owed.
5. **One Session 1 residual is closed here:** the whitespace-only
   `evidencePaths` schema/validator parity gap in
   `docs/path-aware-critique.schema.json`.

**Recommended next orchestrator (Session 3):** recorded at close in
`disposition.json`, not pre-committed here.

---
