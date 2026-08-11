# Set 119 — Close preflight, finding provenance, and what nothing reached

## What this set was for

Two in five sessions failed close-out at least once, and the most
expensive refusal spent a routed call to say something that had been
knowable minutes earlier. The set was authored from measurement, taken
2026-08-10 across **104 sets / 295 sessions** in `session-events.jsonl`
and from `router-metrics.jsonl`. None of it was estimated:

- Close-out is not slow — it **fails**. Median close-out is **0.1 min**,
  but **122 of 295 sessions (41%)** failed at least once, mean 1.6
  attempts, max **9**. Of 212 recorded check-failures,
  `verification_backstop` was **78 (37%)**, and *each firing spends a
  routed call at close time*.
- The verification loop spent its rounds on **prose**. Set 116 S3: 13
  routed calls, **$4.75**; the code was clean at round 1 and stayed
  clean; the session's one real code defect was caught by the **test
  suite** before verification ran. Every Critical/Major after round 1
  concerned the wording of one document, and **two of the three were
  created by fixing the previous one**.
- Severity was degenerate and findings were unauditable: of **572
  findings**, **520 were Major (91%)**, and no finding carried a path.
- The backstop's own recovery path was unreachable: its refusal said
  *"re-verify with `verify_session`"*, but `--phase remediation-review`
  failed closed unless a prior round had recorded a
  `discoveryBaselineTree` — which no round in that state ever had.

Five decisions were locked before any session ran and none was reopened:
no test-pruning campaign, **no new blocking gate** (the preflight
reports; only existing gates refuse), no re-arming of the checks Set 116
S3 demoted, doc-ness derived from paths and never self-declared, and no
lightweight tier.

## What shipped

### Session 1 — give findings a provenance, and stop prose opening rounds

Every finding now carries **`evidencePaths`**, the repo-relative paths
the verifier actually read, on **both** surfaces: the markdown parse in
`verification.py` and the structured `submit_verdict` tool in
`pull_verifier.py`. Both reviewer templates make it mandatory on a
Critical/Major finding, which is a hash-pinned template revision — so
`TEMPLATE_ID` moved `session-verification-v7` → `v8` with a new pinned
hash in the same change, and sixteen integrity-gate tests failed until it
did.

On that provenance rests the **doc-only cap**: a finding whose cited
paths are *all* documentation prose records at Minor and opens no round.
It is applied in `is_blocking_issue`, the one predicate both surfaces
consult, so push and pull inherit it identically. Capping severity is a
**verification reduction**, which no orchestrator may self-authorize, so
it was journaled first as an operator attestation with
`rubric_line="verification-reduction"` and no cap code was written before
that record existed. Three guards keep it from becoming a laundering
vector: doc-ness comes from paths only, a finding with **no**
`evidencePaths` is unchanged (unknown still blocks), and
`ai_router/prompt-templates/**` is explicitly *not* documentation —
those files are the verifier's own instructions.

Thirty test functions, exactly the spec's irony budget.

### Session 2 — make the close's obligations knowable before it runs

`python -m ai_router.close_preflight` evaluates the same predicates the
close evaluates — **by calling them**, not by re-implementing them — with
no side effects and no routed call, and prints every unmet obligation in
one pass with the command that satisfies it. Making that true required
extracting `decide_backstop` (+ `BackstopDecision`) out of
`run_close_backstop`: the backstop's skip-vs-run sequence is a
seven-branch decision with a load-bearing order, and a preflight carrying
its own spelling of it would drift from the gate it predicts. A preflight
that disagrees with the gate is worse than no preflight.

The prediction was then **measured against history** rather than
asserted. Replaying the predicates over the recorded failures: 186
events, 214 check-failures, 64 belonging to demoted checks, **150 still
blocking, 150 covered**. Filtering to before this set began reproduces
the spec to the digit — 184 events, 212 failures, 148 still-blocking, 78
backstop, 122 sessions. **The spec's prediction was right; history
grew.** Reconciling the session count found the one real instrument
defect: a legacy Set 047 event carrying `"session_number": 0` had been
counted as a session.

### Session 3 — restore the backstop's recovery path, delete what nothing reaches

**A close-mandated write no longer stales the verdict it just earned.**
The constitution *mandates* `cite_lessons` in the final commit, and its
`last-used-set` bump staled the stamp between verifying and closing — so
citing sessions were plausibly buying a routed round for a metadata
trailer, invisibly, because the backstop simply re-verified and
re-stamped. The freshness exclusions had an unstated **per-set** scope
and no concept of a close-mandated write outside it, and adding two more
filenames would have fixed the instance and left the class alive for the
third time. So the mechanism became a **category**: a writer declares a
module-level `CLOSE_MANDATED_WRITES` literal, and `verification_stamp`
discovers it by parsing the source with `ast` — no import, no side
effects, safe on the close path. A fifth close-mandated writer is exempt
the moment it says so, in either scope, with no list to edit.

The `bound` field is where the honesty lives. A per-set ledger is close
output end to end, so the whole file is exempt. A guidance file is
**not**: the close owns one trailer field and the lesson prose around it
is session work. Exempting the file wholesale would have let a
post-verification rewrite of a **preload** document ride a passed round —
a verification reduction, so not an option. `cite_lessons` therefore
declares a normalizer, and the digest compares normalized-current against
normalized-at-base.

**The backstop's recovery path works, and its failures are survivable.**
Every completed round now records the baseline it reviewed in
`sN-rounds.jsonl`, not only in the findings envelope — because the
envelope is written *only* on a findings-bearing round, so the two states
that most needed a baseline left none: a clean discovery round, and every
close-backstop round. `--phase remediation-review` is reachable from a
backstop-blocked close for **~$0.07 instead of ~$0.88**, and the refusal
message now names the phase. A test *parses* that message and executes
the command it names from the exact state it was printed in.
`EvidenceTooLargeError` became a **subclass** of `VerifySessionError`:
`close_backstop` caught the parent at four sites and the sibling at one,
so an oversized bundle took the close down with an unhandled traceback on
four paths. Fixing the type fixed all four — and the CLI's handler order
had to be reversed in the same change, because a subclass caught after
its parent is unreachable code.

**And 3,483 lines of module code plus 3,012 lines of tests (235 tests)
that nothing reached are gone**: `floor_ratchet`, `routed_gate`,
`pricing_proposal`, `cost_report`. Unreachability was **proven first**,
with a static import graph over all 78 `ai_router` modules, against the
spec's three criteria. That proof also overturned the spec: three of the
seven named modules turned out to be **reachable** and stayed, reported
rather than forced — `contract_gate` is a live close gate,
`spec_admission` seeds the plan the `checklist_posted` gate reads, and
`dual_surface_verify` calls `replacement_gate`. The line drawn and
journaled: a module is reachable when a surviving module **calls** it;
an `__init__` re-export is publication, not use. Nothing was edited to
manufacture unreachability.

## What this set deliberately did not do

- **No artifact cap.** Artifacts are produced *by* rounds; bounding
  rounds bounds artifacts, and a second mechanism for one effect is a
  second thing to maintain.
- **No preload or guidance restructuring.** It depends on the doc-only
  cap landing first and belongs to a later set. The constitution sits at
  3,984 of its 4,000-token ceiling, and ceilings ratchet down only.
- **No `pricing.py` deletion**, even though cost calculation is useless
  on a Copilot seat: four modules import it and it feeds the api-profile
  verifier's `max_cost_multiplier` guard.
- **No extension change, no Layer 3 change, no worker-policy change.**

## Owed residuals

| residual | owner |
| :--- | :--- |
| `evidencePaths` is contract but unenforced — nothing refuses a blocking finding that omits it, because refusing would make an uncited finding *cheaper* to raise. If enforcement is ever wanted, the honest form is a report, not a gate. | a later set |
| The doc-only cap's blast radius is unmeasured. The parallel question to Session 2's replay — how many of the 520 historical Major findings cite only documentation — needs a different corpus (`sN-issues*.json`, not `session-events.jsonl`) and a different instrument. | a later set |
| `close_preflight` reports "would-refuse" for an already-closed session: `close_session.run` short-circuits on `_is_already_closed` before any gate runs, and the preflight walks the chain regardless. Low consequence — preflighting a closed session is not the tool's use case — and the fix is a few lines at the top of `evaluate` plus a falsifier pair. | a later set |
| `BEHAVIOURAL_MARKDOWN_PREFIXES` is a one-entry list. A second entry would signal the extension-based rule is being asked to carry a judgment it cannot; simplify the rule rather than lengthen the list. | review, not growth |
| The spec's "5,165 lines nothing reaches are gone" figure was a prediction, and the measured deletion is smaller because three modules are reachable. The spec's `Ends with` line is wrong on that number. | recorded here |
