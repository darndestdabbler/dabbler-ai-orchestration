# Close Preflight and Doc-Only Findings Spec

> **Purpose:** Two in five sessions fail close-out at least once, and the
> most expensive refusal spends a routed call to say something that was
> knowable minutes earlier. Meanwhile the verification loop spends its
> rounds on prose: in Set 116 Session 3 the code was clean at round 1 and
> stayed clean, and **two of the three Major findings that followed were
> introduced by fixing the previous one**. This set makes a close's
> obligations knowable before it runs, and stops documentation wording from
> opening a metered round.
>
> **Created:** 2026-08-10, from measurement.
> **Prerequisites:** Set 116 complete. Its Session 2 bounded the backstop and
> its Session 3 demoted five checks; both are load-bearing here.
> **Session Set:** `docs/session-sets/119-close-preflight-and-doc-only-findings/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Evidence document:**
> [`docs/proposals/2026-08-10-smaller-framework-target-state.md`](../../proposals/2026-08-10-smaller-framework-target-state.md)
> carries the phase timings, the close-out failure breakdown and the
> transport evidence quoted below.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. The deliverables are a CLI, a schema field and a severity rule — judged by tests and by a diff, not by eyes.
requiresE2E: false        # No rendering surface is touched. Layer 3 is neither changed nor invoked.
uatStyle: ad-hoc
prerequisites:
  - slug: 116-session-latency-and-verification-integrity
    condition: complete
```

> **`pathAwareCritique` is deliberately absent.** The authoring guide's
> default is `none` — *"a set that declares nothing pays nothing."* Set 116
> declared `required` because it was **removing** verification controls; in
> that session the critique cost **~$2.50 of the session's $4.75** and
> returned a Major that was a **false positive**, dismissed on operator
> adjudication with a passing test as the citation. This set adds one
> control, tightens one, and deletes only code nothing reaches. Session 1
> is the one place that argument is weakest, and it is covered instead by
> the operator attestation in S1 step 3.

---

## The measurements this set acts on

Measured 2026-08-10 from `session-events.jsonl` across **104 sets / 295
sessions**, and from `router-metrics.jsonl`. None is estimated.

**Close-out is not slow — it fails.** Median close-out
(`closeout_requested` → `closeout_succeeded`) is **0.1 min**. But **122 of
295 sessions (41%) fail at least once**, mean 1.6 attempts, max **9**.
Which check refuses, across 212 check-failures in 184 events:

| failed check | count | share | status today |
| :--- | ---: | ---: | :--- |
| `verification_backstop` | **78** | 37% | blocking — **each firing spends a routed call at close time** |
| `working_tree_clean` | 41 | 19% | blocking (precondition) |
| `activity_log_entry` | 30 | 14% | demoted, Set 116 S3 |
| `pushed_to_remote` | 29 | 14% | blocking (precondition) |
| `next_orchestrator_present` | 23 | 11% | demoted, Set 116 S3 |
| `change_log_fresh` | 8 | 4% | demoted, Set 116 S3 |
| `checklist_posted` | 3 | 1% | demoted, Set 116 S3 |

**Set 116 S3 already banked 64 of those 212 (30%)** by demoting four checks
to advisory. That reduction needs no further work and this set must not
re-do it. The remaining **148 are all knowable before close-out runs** —
the two git preconditions in milliseconds, and `verification_backstop` by
asking whether a stamped round exists for this session.

**The backstop's own recovery path is unreachable.** After a backstop-only
blocking round, the refusal message instructs the orchestrator to
*"remediate, then re-verify with `verify_session`"* — but `--phase
remediation-review` **fails closed** at `verify_session.py:2945-2954` with
`EXIT_USAGE`: *"no prior round of this session recorded a
`discoveryBaselineTree`."* Only findings-bearing discovery-family rounds
write that field (the locked Set 055 envelope invariant), so a **clean**
discovery round records no baseline and the backstop's own round records
none either. The orchestrator must spend a full **~$0.88** discovery round
to re-enter the sanctioned path.

**The loop spends its rounds on prose.** Set 116 S3: **13 routed calls,
$4.75**. The code was clean at round 1 and stayed clean; the session's one
real code defect was caught by the **test suite**, before verification ran.
Every Critical/Major after round 1 concerned the wording of
`docs/session-constitution.md`, and two of the three were *created by fixing
the previous one* — a document at 99% of a ceiling that ratchets down only
must evict a sentence to accept a clarification, and the evicted sentence
was the next round's finding.

**Severity is degenerate, and findings are unauditable.** Across **572
findings** in this repo's history: **520 Major (91%)**, 3 Critical, 21
Minor. A scale where 91% of findings block is not a scale. And no finding
carries a path: `docs/session-issues.schema.json` declares **no required
fields** on `issues[]`, and the pull surface's `submit_verdict` offers
exactly `{description, severity, category}` with `required: ["description"]`.
`category` cannot substitute — it is free text, and across all 572 findings
reads `docs` twice and `documentation` once.

**Five gate modules are unreachable from any close path:**
`contract_gate.py` (1,158), `floor_ratchet.py` (792),
`replacement_gate.py` (546), `spec_admission.py` (403) and
`routed_gate.py` (386 — **retired in Set 083**, always exits 0). Together
**3,285 LOC** and roughly 220 tests.

---

## Decisions already made — do not reopen

1. **No test-pruning campaign.** Measured twice: −233 tests bought 3.64s of
   957s (0.4%). Settled in Sets 112 and 116.
2. **No new blocking gate.** Set 116 reduced ten checks to three gates plus
   two write-integrity preconditions. A set about cheaper closes that adds
   a gate has failed on its own terms. The preflight **reports**; only the
   existing gates refuse.
3. **No re-arming of the five checks Set 116 S3 demoted.** They account for
   64 of the 212 historical failures precisely *because* they used to
   block. Re-arming them restores the cost this set exists to remove.
4. **Doc-ness is derived from paths, never self-declared.** A verifier
   asserting "this is only a doc issue" is the same laundering vector the
   `unknown severity blocks` rule exists to prevent, running in reverse.
5. **No lightweight tier.** Removed in Set 112 and guarded by 43 tests. Do
   not author `tier` or `verificationMode`.

## Non-goals

- **No artifact cap.** An earlier draft of the evidence document proposed
  one. Artifacts are *produced by* rounds; bounding rounds bounds
  artifacts, and a second mechanism for one effect is a second thing to
  maintain.
- **No Layer 3 or worker-policy change.** Set 117 owns that.
- **No preload or guidance restructuring.** That work depends on this set's
  doc-only cap landing first, and belongs to a later set.
- **No extension change.** Nothing here touches `tools/`.

---

## Sessions

### Session 1 of 3: Give findings a provenance, and stop prose opening rounds

The loop cannot tell a wording complaint from a defect, because a finding
carries no evidence of where it looked. This session gives findings a path,
then uses that path — not the verifier's opinion — to decide whether a
finding may open a metered round.

**Steps:**

1. Register.
2. **Add `evidencePaths` to the finding contract.** A list of
   repo-relative paths, **required on any finding whose severity is
   Critical or Major**, on **both** surfaces: the markdown parse in
   `ai_router/verification.py` and the structured `submit_verdict` tool
   schema in `ai_router/pull_verifier.py` (today `{description, severity,
   category}`, `required: ["description"]`). Update the reviewer templates
   so verifiers are asked for it. A blocking finding with no paths is
   **unknown**, and unknown still blocks — the anti-laundering default is
   unchanged.
3. **Operator decision, journaled — this is the hard carve-out.** Capping
   any finding's severity is a **verification reduction**;
   `decision_journal.py` refuses it under AI authority. Present the
   evidence (Set 116 S3's four rounds; 520 of 572 findings Major) and
   record the attestation with `authority="human"`,
   `rubric_line="verification-reduction"`, `verification_effect="reduces"`
   and a non-empty operator attestation. **No cap is implemented before
   this record exists.**
4. **Implement the cap at the one shared chokepoint.** In
   `is_blocking_issue` / `classify_blocking` — the surface-agnostic
   predicate both surfaces already consult — a finding whose
   `evidencePaths` are **all** documentation records at Minor and does not
   open a round. Ship the falsifiers `L-112-1` requires: one planting a
   doc-only finding and asserting it does **not** open a round, one
   planting a mixed doc-and-code finding and asserting it **does**.
5. Full pytest at close after freeze; verify, close.

**Creates:** the `evidencePaths` contract on both surfaces, the journaled operator attestation, the doc-only severity cap and its falsifiers
**Touches:** `ai_router/verification.py`, `ai_router/pull_verifier.py`, the reviewer templates, `docs/session-issues.schema.json`, `ai_router/decision_journal.py` (caller only), `decisions.jsonl`, `ai_router/tests/`
**Ends with:** every blocking finding names where it looked, and a wording complaint records as a nit instead of buying a round.
**Progress keys:** `evidencePaths`, `operatorAttestation`, `docOnlyCap`, `capFalsifiers`

> **Irony budget.** This session changes the severity machinery, so it will
> be verified by it. **Cap: 30 new test functions.** If the rule cannot be
> covered in 30, it is too clever — simplify the rule, not the budget.

---

### Session 2 of 3: Make the close's obligations knowable before it runs

Every one of the 148 remediable failures has the same shape: an obligation
the orchestrator did not know it had until a gate refused. Nothing here
changes what is required — only when you can find out.

**Steps:**

1. Register.
2. **Build `python -m ai_router.close_preflight`.** Runnable at any time
   against a session set and session number, with **no side effects and no
   routed call**. It evaluates the same predicates the close evaluates, by
   calling them rather than re-implementing them, and prints every unmet
   obligation in one pass, each with the command or action that satisfies
   it. Exit non-zero when anything blocking is unmet.
3. **Cover the expensive case.** The preflight must answer *"would the
   verification backstop fire?"* — does a stamped round exist for this
   session — **without** spending the round. That one line is 78 of the
   **148 still-blocking** historical failures (the other 64 of the 212
   belong to checks Set 116 S3 demoted, so pre-empting those is worth
   nothing now).
4. **Prove it against history.** Replay the preflight's predicates over the
   recorded failures in `session-events.jsonl` and report how many it would
   have pre-empted. The ~148-of-212 figure in this spec is a **prediction
   derived from a one-off query, not from an instrument.** The session
   records the measured number, and a discrepancy is a finding — **about
   the tool *or* about this spec's prediction, and the session must say
   which.**
5. Full pytest at close after freeze; verify, close.

**Creates:** `ai_router/close_preflight.py`, its report format, the historical replay measurement
**Touches:** `ai_router/close_preflight.py`, `ai_router/gate_checks.py` (callers only — no predicate changes), `ai_router/tests/`, `docs/`
**Ends with:** one command that names everything standing between "work done" and "closed", including the obligation that would otherwise cost a routed call.
**Progress keys:** `preflightCli`, `backstopPrediction`, `historicalReplay`

---

### Session 3 of 3: Restore the backstop's recovery path, and delete what nothing reaches

> **Deletion note.** `pricing.py` is **not** in the deletion list even
> though the operator has ruled cost calculations unnecessary for Copilot.
> It is load-bearing on the Direct API path. Only the rate-fetching CLI
> and the cost report go.

**Steps:**

1. Register.
2. **Record a baseline the recovery path can use.** A backstop round writes
   a `discoveryBaselineTree` alongside the ledger row Set 116 S2 already
   appends, so `--phase remediation-review` is reachable after a
   backstop-only blocking round instead of refusing with `EXIT_USAGE`.
   Include the case the current behaviour ignores: a **clean** discovery
   round writes no envelope at all, so it leaves no baseline either.
3. **Make the refusal message true.** `close_backstop`'s blocking text
   names `verify_session` as the sanctioned next step; after step 2 that
   instruction must actually work, and the message should name the phase to
   run. A test asserts the named command succeeds from the exact state the
   message is printed in.
4. **Delete what nothing reaches.** Two groups, same proof obligation.
   **(a) The unreachable gate machinery:** `contract_gate.py`,
   `floor_ratchet.py`, `replacement_gate.py`, `spec_admission.py`,
   `routed_gate.py` and their tests (**3,285 LOC, ~220 tests**).
   **(b) The cost surface that a Copilot seat cannot populate:**
   `pricing_proposal.py` and `cost_report.py` and their tests
   (**1,880 LOC, ~150 tests**) — across 83 routed calls every metrics row
   carries `billed_usage_unavailable: true` and `cost_usd: 0.0`.
   **`pricing.py` STAYS** — `models.py`, `pull_verifier.py`, `config.py`
   and `__init__.py` import it, and it feeds the api-profile verifier's
   `max_cost_multiplier` guard; deleting it breaks the Direct API path.
   Prove unreachability first for every module: no import from any close
   path, no console-script entry point, no reference in
   `router-config.yaml`. A module that turns out to be reachable **stays
   and is reported**, not forced.
5. Full pytest at close after freeze; verify, close.

**Creates:** the backstop baseline record, a truthful refusal message
**Touches:** `ai_router/close_backstop.py`, `ai_router/verify_session.py`, the seven deleted modules and their tests, `ai_router/__init__.py` (drop the `cost_report` re-exports), `pyproject.toml` (if entry points reference them), `ai_router/tests/`
**Ends with:** a backstop-blocked close can be remediated for ~$0.07 instead of ~$0.88, and 5,165 lines nothing reaches are gone.
**Progress keys:** `backstopBaseline`, `truthfulRefusal`, `unreachableDeleted`, `costSurfaceDeleted`

---

## Cross-set dependencies

**Set 117 is in progress** (Session 1 complete; Sessions 2–3 pending). It
owns `pytest.ini`, the Playwright worker policy and
`scripts/vscode-launch.js`. This set touches none of them. The only overlap
is that both sets run the full pytest suite at close — a shared *cost*, not
a shared *file*, needing no coordination.

**A later set** owns the preload collapse (`session-constitution.md`,
`project-guidance.md` and `lessons-learned.md` → executable code and
one-line instructions). It depends on Session 1's cap landing first,
because that work is precisely the documentation-wording churn the cap
exists to keep out of the metered loop.
