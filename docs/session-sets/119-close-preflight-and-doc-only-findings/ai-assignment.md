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
6. **`cite_lessons` stales the verification stamp, and the backstop pays
   for it.** This session's own preflight found it, before a close
   attempt was spent. `WORK_DIFF_SET_BOOKKEEPING` excludes the per-set
   files the sanctioned flow writes after verification but **not** the
   repo-wide guidance files — and the constitution *mandates*
   `cite_lessons` in the final commit, which bumps `last-used-set`
   trailers in `lessons-learned.md` / `lessons-archive.md`. So every
   citing session stales its own stamp between verifying and closing.
   Nothing usually notices, because the backstop just runs a fresh round
   and re-stamps — meaning citing sessions may be **buying a routed round
   for a metadata trailer**, which is plausibly a real contributor to the
   79 `verification_backstop` firings this session measured. It surfaced
   here only because the round budget was spent, so the backstop refused
   instead of quietly paying. Session 3 already touches `close_backstop.py`
   and the stamp machinery; the fix is likely one entry in the exclusion
   list, and the measurement (how many of the 79 are this) is a query
   against `session-events.jsonl` and `router-metrics.jsonl`.
7. **The preflight does not model the already-closed short-circuit.**
   Found by dogfooding it against this session *after* the close.
   `close_session.run` checks `_is_already_closed` and returns
   `noop_already_closed` (exit 0) **before** any gate runs; the preflight
   walks the chain regardless and reports `would-refuse`. That is the
   same "reports a refusal the close would not make" class the
   verification loop caught three times here, so it should not be left
   standing on principle — even though its consequence is small, because
   preflighting an already-closed session is not the tool's use case.
   Deliberately **not** fixed in this session: the tree was frozen, the
   run of record taken, and the close already executed, so a code change
   would have staled both to fix a low-consequence edge. The fix is a
   few lines at the top of `evaluate` (report "already closed — nothing
   owed" and return), plus the falsifier pair.

**Recommended next orchestrator (Session 3):** recorded at close in
`disposition.json`, not pre-committed here.

---

## Session 3 — Restore the backstop's recovery path, and delete what nothing reaches

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**Set-terminal session.** It owes `change-log.md`, the Step 9 guidance
reorganization review, and the set-terminal close. `pathAwareCritique` is
deliberately absent from this set's configuration, so no critique artifact
is owed.

**Inherited residuals, and their disposition here.** Session 2 handed over
seven items. The spec's own residual table already took two
(`cite_lessons` stamp staleness → step 2; `EvidenceTooLargeError` sibling
sites → step 3c) and deferred two (the preflight's already-closed
short-circuit; the doc-only cap's blast radius). The remaining three are
observations rather than owed work: `decide_backstop` is the seam step 3a
lands in, the preflight's `EvidenceTooLargeError` blind spot is a
consequence of not assembling evidence (and step 3c makes the resulting
crash survivable rather than making the preflight predict it), and the
constitution's 3,984-of-4,000-token ceiling is a later set's eviction
decision.

**Recommended next session set:** recorded at close in `disposition.json`,
not pre-committed here.

**What actually happened, recorded at close.**

*The spec's deletion list was wrong about three of seven modules, and
saying so is the deliverable.* Step 4's proof obligation — no import from
a close path, no console-script entry point, no reference in
`router-config.yaml` — was discharged with a static import graph over all
78 `ai_router` modules before anything was deleted, and it overturned the
prediction. `contract_gate` is called by `close_session.run` as a live
close gate; `spec_admission` is called by `session_checklist` to seed the
plan the `checklist_posted` gate reads; `replacement_gate` is imported at
module scope and called by `dual_surface_verify`. All three stayed. The
spec's own rule made that the correct outcome rather than a shortfall —
*"a module that turns out to be reachable stays and is reported, not
forced"* — but it means the **`Ends with` figure of 5,165 lines is
wrong**. Measured: 3,483 module LOC + 3,012 test LOC (235 tests) across
four modules. The criterion that separates the two groups is journaled:
a module is reachable when a **surviving module calls it**, and an
`__init__` re-export is publication, not use.

*One design choice went beyond the spec's letter, and it went the
conservative way.* Step 2 asked for the freshness fix as a category, and
the obvious category is a path exclusion. Applied to
`docs/planning/lessons-learned.md` that would have been a **verification
reduction**: a post-verification rewrite of an always-loaded preload
document could then ride a passed round, and reductions are never
self-authorized. So the category carries two `bound` values — whole-file
for artifacts the close owns end to end, and a **normalizer** for
artifacts it owns only partly. `cite_lessons` declares a normalizer, the
digest compares normalized-current against normalized-at-base, and lesson
prose keeps binding exactly as before. The mechanism costs about thirty
lines more than the exclusion and reduces nothing.

*The full suite earned its place in the ordering.* The first full run
failed one test — `test_no_phase_envelope_carries_no_phase_fields` — and
it was a real finding, not a flake: the first cut of the baseline change
had widened the **Set 096 envelope contract** when only the round
**ledger** needed widening. The narrower fix landed and the suite was
re-run in full so the run of record postdates the last code change. A
targeted-only pass would have shipped a silent contract change.

*Two spec surfaces that are worth naming for whoever revises them.* The
step-2 prose says `WORK_DIFF_BASE_EXCLUDES` "already carries
`s*-rounds.jsonl`, `checklist-posts.jsonl` and `test-runs.jsonl`" — those
three live in `WORK_DIFF_SET_BOOKKEEPING`; `WORK_DIFF_BASE_EXCLUDES` holds
the repo-wide generated-bundle patterns. And the session-state title for
Session 3 ("Restore the backstop's recovery path…") differs from the
spec's heading ("Stop the backstop misfiring…"). Neither changed any
behaviour; both would mislead a reader.

*Verification.* One `--phase discovery` round, 2-call fan-out
(spec-conformance and failure-scenario lenses), both answered by
`gpt-5.5` with `anthropic` excluded by registry lookup on the
orchestrator's model. **VERIFIED, zero findings.** An up-front conventions
block (`s3-conventions.md`) declared the suite baseline, the release
contract, the five by-design exclusions and the consequence rubric
(L-064-10), which is the cheapest thing in the loop.

---
