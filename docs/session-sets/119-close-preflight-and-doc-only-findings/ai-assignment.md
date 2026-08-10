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
