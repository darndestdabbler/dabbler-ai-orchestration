# Outsourcing Policy Restoration Spec

> **Purpose:** On 2026-08-05 the operator narrowed outsourcing to
> `verification-only` as a **temporary** measure, naming Set 111 as the owner
> of the next routing-policy revision. Set 111 shipped the decision-rights
> rubric and never lifted the pin. Twenty session sets later it is still in
> force, and the workflow doc still carries a "Temporary verification-only
> policy (Set 110 S4 through Set 112)" heading that describes a window that
> closed. This set restores a delegation model — and, on the evidence
> gathered to author it, restores a **different** one than the operator asked
> for, because the measurement says the headline cost lever is not
> delegation at all.
> **Created:** 2026-08-14
> **Session Set:** `docs/session-sets/131-outsourcing-policy-restoration/`
> **Prerequisite:** Set 130 (`condition: complete`). This set consumes the
> seat-cost vocabulary (`routed_api`, `routed_seat`, `orchestrator_seat`) and
> the join keys (`orchestrator.seatSessionIds`,
> `metrics.transport_session_id`) that Set 130 shipped. Without them the
> policy this set writes cannot be measured against its own predictions.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Reference implementation (read this before Session 1)

A **complete, working implementation of this set already exists** at
`C:\Users\adm.dennis.mitchell\source\set-131-reference\` (outside the repo,
deliberately). It was authored, applied to the working tree, tested, and
then reverted so this set could be executed properly. Start there rather
than from scratch:

| file | use |
| :--- | :--- |
| `README.md` | provenance, what was verified, what was **not**, and the four embedded decisions to re-decide rather than inherit |
| `planned-edits.md` | the edits as old→new text blocks, organized by session — the primary working document |
| `modified-tracked-files.diff` | unified diff against baseline `d1720e08`; `git apply --check` it first |
| `new-files/` | the new test module and the changelog fragment, verbatim |
| `evidence.md` | every SQL query and result behind this spec, reproducible, with caveats |

**It is a reference, not a patch to trust.** It was produced in one ad-hoc
pass — which is precisely what the three-session split below exists to
prevent: the policy rewrite and the probe-metadata change landed together
and were never separated into their own verification rounds. Nothing in it
has been through cross-provider verification, close-out, or any workflow
gate. The broader test sweep reached ~95% under `-x` with no failures and
**was not run to completion**.

Two obligations that follow:

- **Each session still owns its verification round.** Inheriting the text
  does not inherit assurance.
- **The four decisions named in the README's *re-decide* section are
  decisions**, not findings — verifier-synthesis authority, the advisory
  child budget, the declined orchestrator downgrade, and the deliberately
  short `always_route_task_types`. A session that adopts them silently is
  laundering them. Journal them.

---

**Source of record:** every figure below was derived on 2026-08-14 from the
live seat store `~/.copilot/session-store.db`
(`assistant_usage_events`, 17,531 events, 335,062.2 credits), opened
`file:…?mode=ro` — **never** `immutable=1`, which skips the WAL and
undercounts (Set 130 spec, trap T4). Credits are
`SUM(total_nano_aiu)/1e9`; dollars are `/1e11`. Where a claim is a
reconstruction rather than a recorded fact, it says so.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. Config, docs and one probe-metadata guard.
requiresE2E: false        # Layer 3 untouched; nothing rendered changes.
uatStyle: ad-hoc
uatScope: none
```

> Rationale: `pathAwareCritique` is deliberately **absent** (the guide's
> default is `none`). This set does not reduce verification — it *widens* what
> may be routed, and every widening it authorizes is gated behind a rule that
> fails closed to "orchestrator does it". A set that authorizes no skip pays
> for no end-of-set critique.

---

## Project Overview

### The premise the operator brought, and what the measurement did to it

The operator's premise: a Copilot Enterprise seat bills interactive session
work with no upper limit, so an expensive chat model (Claude Opus 5) should
act as a coordinator and outsource everything it safely can to cheaper
models over the CLI transport. Default posture: *assume outsourcing is
acceptable unless there is strong justification otherwise, or unless
producing the justification costs more than doing the work.*

The premise is directionally right and the default posture is defensible.
The **mechanism** was wrong, and the first fact base assembled to support it
was wrong in a way that would have produced an expensive mistake.

#### The error, named up front

The obvious query — average credits per inference, grouped by model —
produces this:

| model | credits / inference | avg input tokens |
| :--- | ---: | ---: |
| claude-opus-5 | 22.40 | 270,346 |
| claude-sonnet-4.6 | 4.51 | 33,047 |
| gemini-3.1-pro-preview | 2.65 | 43,622 |

Read naively that is an 8.5x argument for swapping the orchestrator model.
It is **role/context confounding**, not a price comparison: `claude-opus-5`
is measured at 270K input *because it is the orchestrator*, and the others
at 33–45K *because they are children*. Controlling for input size collapses
the gap:

**Credits per inference, by input-context band** (the defensible comparison):

| input band | opus-5 | gpt-5.5 | gemini-3.1-pro | sonnet-4.6 |
| :--- | ---: | ---: | ---: | ---: |
| <25K | 9.70 (n=25) | 6.83 (n=338) | 1.72 (n=138) | 4.60 (n=51) |
| 25–75K | 7.65 (n=733) | 9.71 (n=1008) | 2.32 (n=211) | 4.40 (n=65) |
| 75–150K | 9.76 (n=1730) | 11.49 (n=1921) | 3.85 (n=47) | 5.46 (n=3) |
| 150–300K | 17.18 (n=5482) | 17.37 (n=979) | 26.71 (n=6, ignore) | — |
| >300K | **35.77** (n=4580) | 38.80 (n=12) | — | — |

Two results follow, and both contradict the naive read:

1. **At matched context, `claude-opus-5` and `gpt-5.5` cost the same per
   inference** (7.65 vs 9.71; 9.76 vs 11.49; 17.18 vs 17.37) — despite
   `request_multiplier` of 15.0 and 7.5. The premium-request axis and the
   credit axis are close to decoupled.
2. **The model-substitution lever is ~1.7–2x, not 8.5x.** The context lever,
   on the *same* model, is **4.7x** (7.65 → 35.77).

#### The dominant lever, measured directly

Conversation `a9f211a7` (1,148 inferences, $367.18 — the most expensive in
the store) ran a **compaction** at turn 75 on 2026-08-11T08:26:34Z. The
store records it as one event, `initiator='compaction'`, costing 400.01
credits. Immediately across it:

| | input tokens | credits / inference |
| :--- | ---: | ---: |
| the inference before | 631,304 | ~33–35 |
| the inference after | 54,119 | **~3.6–5.0** |

**A ~7–8x reduction, one-time cost 400 credits, payback in ~14 inferences.**
This is the single largest cost effect anywhere in the data, it is already
native to the Copilot CLI, and the repo's workflow says nothing about it.

#### The finding that tempers the operator's default posture

The operator's posture assumes an outsourced call is cheap. Measured against
**true sub-agent children** (`initiator='sub-agent'`, `parent_tool_call_id`
NOT NULL — 598 events across 11 child conversations, 4,508.1 credits):

| child model | children | inferences | **credits per child** | inferences per child |
| :--- | ---: | ---: | ---: | ---: |
| gpt-5.5 | 3 | 266 | **721.77** | 89 |
| gpt-5.6-sol | 5 | 117 | 350.75 | 23 |
| gemini-3.1-pro-preview | 6 | 103 | 70.19 | 17 |
| claude-haiku-4.5 | 2 | 68 | 47.06 | 34 |
| claude-sonnet-4.6 | 1 | 18 | 39.73 | 18 |
| gpt-5.4-mini | 1 | 26 | 34.10 | 26 |

A child's cost is driven by its **unbounded inference count**, not its rate.
A `gpt-5.5` child at 721.77 credits costs more than twenty orchestrator
inferences at the >300K band. **An unbounded agentic child can cost more
than the orchestrator doing the work**, which inverts the posture exactly
where the posture is most confident. The fix is not to abandon the posture
but to bound the child.

### The five traps

**T1 — Role/context confounding reads as a price signal.** Comparing
per-model averages across roles is the error that nearly bought a
verification-grade downgrade of the privileged seat. Any future cost claim
about a model must state the context band it was measured at.

**T2 — `premium_request_weight` is not a cost signal and is wrong besides.**
`ai_router/copilot-catalog.lock` records a probe-derived
`premium_request_weight`. It disagrees with the store's `request_multiplier`
for the **entire OpenAI family**:

| model | lock says | store bills at |
| :--- | ---: | ---: |
| gpt-5.5 | **0** | **7.5** |
| gpt-5.4 | 0 | 1.0 |
| gpt-5.3-codex | 0 | 1.0 |
| gpt-5.4-mini | 0 | 0.33 |
| gpt-5-mini | 0 | 0.0 ✓ |
| claude-haiku-4.5 | *absent* | 0.33 |
| claude-sonnet-4.6 / opus-4.5 / opus-4.8 / gemini-3.1-pro | 1 / 3 / 15 / 1 | 1.0 / 3.0 / 15.0 / 1.0 ✓ |

The field is populated from `result.transport_metadata["premium_requests"]`
on a one-shot probe (`copilot_catalog.py:399`) — that is *premium requests
consumed by that probe call*, not the model's rate. The name says "weight",
the value is a consumption count, and a non-int is coerced to `None`
(so `7.5` cannot land at all). **A cost-aware selector trusting this file
would pick `gpt-5.5` believing it free and pay the second-highest
multiplier on the seat.** Latent today because nothing reads it for
selection; live the moment this set widens delegation. Third-party
corroboration: both round-1 advisors independently flagged it as blocking.

**T3 — A weaker orchestrator is a confused deputy.** Routed children hold
read-only tools (`--available-tools` allowlist: `view`, `grep`, `glob`) on
the CLI transport, and no tools at all on the API transport. The
**orchestrator is the only actor with write, shell and network rights.**
Downgrading it to save money creates `repository content → child output →
privileged orchestrator → destructive or governance action`, and the
read-only sandbox does not close it. Both advisors judged the risk real and
not contained by the sandbox. Because the measurement shows rotation
captures more than substitution ever would, **this set does not trade
security for cost — it declines the trade.**

**T4 — "Don't spend more deciding than doing" is a hoarding licence.** The
operator's justification clause is sound economics and a poor instruction:
an orchestrator asked to estimate its own decision cost will reliably
conclude that doing the work itself is cheaper. That is the *"I'll just do
this directly"* trap the workflow doc already names. It survives only as a
**constant-time classification** — a fixed enum, no narrative, and if
deciding requires opening a file, the answer is route.

**T5 — Widening delegation must not widen authority.** Nothing here may move
a decision from human authority to AI authority, and synthesis of verifier
feedback must never become a second way to close a session. The
decision-rights rubric and the verification-reduction carve-out are checked
*before* any rule in this set applies.

### Non-goals

- **No cost gating or budget enforcement.** Set 130 established the
  measurement; this set writes policy against it. A set that *refuses* work
  on cost grounds is a later set with an operator attestation behind it.
- **No orchestrator model change.** On this evidence the substitution lever
  is ~1.7–2x and carries T3's security cost. Explicitly declined, with the
  reasoning recorded so a future set does not relitigate it from the naive
  table.
- **No automatic compaction trigger.** This set documents rotation and gives
  it a threshold and a survival contract. Wiring a writer that flushes an
  orchestrator's transcript on its behalf is not something to ship in the
  same set that first measures it.
- **No new store reads.** `seat_cost.py` is Set 130's and is not touched.
- **No change to the verifier-exclusion rule.** The cross-provider
  session-verification constraint is unchanged and is not weakened by
  anything here.
- **No VS Code extension surface.** Keeps `requiresUAT: false` honest.

---

## Sessions

### Session 1 of 3: The pin comes out, and the rule that replaces it

**Steps:**

1. Register.
2. **Write the delegation model, then encode it.**
   `docs/ai-led-session-workflow.md` → *Delegation Discipline* loses the
   "Temporary verification-only policy (Set 110 S4 through Set 112)" section
   and gains the replacement, in this precedence order — the order is the
   contract, not decoration:

   1. **Authority veto.** Decision-rights rubric first: the four
      human-required classes and the verification-reduction carve-out are
      checked before any economics. Never overridden by cost.
   2. **Independence requirement.** Work whose *value is* an independent
      perspective is always routed and must use a different effective
      provider: `session-verification`, code review, security review.
   3. **Risk gate (the operator's gate, made precise).** Work is
      outsourceable when its failure mode is caught by an oracle that is
      *already independent* of the producer — existing tests, static checks,
      schema validation, the cross-provider round. Tests authored by the
      same delegate are not an independent oracle.
   4. **Context-footprint trigger.** This replaces the "~50 lines of
      reasoned output" threshold, which measured the wrong end: output is
      not what gets re-billed, **retained input is**. Route when the work
      would add materially to the transcript — unbounded exploration,
      several files, large evidence bundles, output destined to be
      discarded.
   5. **Model choice, last.** Only after eligibility. Never a bare
      multiplier ratio: `gpt-5.6-sol` and `claude-sonnet-4.6` are both
      multiplier 1.0 and differ ~3x in observed credits.

   `ai_router/router-config.yaml`: `routing.outsourcing_mode` →
   `whenever-helpful`; the `delegation:` block loses the temporary-policy
   comment and gains `direct_work_reason_codes`, `child_budget`, and the
   transport-conditioned thresholds. `always_route_task_types` regains the
   independence-requirement entries and **only** those.
3. **Bound the child (T-new).** `delegation.child_budget` caps a routed
   child's inferences, with the measured justification in the comment. A
   child that would exceed its budget is a task that should have been split,
   not a task that should quietly cost 721 credits.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out.**

**Creates:** nothing new
**Touches:** `docs/ai-led-session-workflow.md`, `ai_router/router-config.yaml`, `ai_router/config.py` (validation of the new keys), `ai_router/tests/test_config*.py`
**Ends with:** the pin is gone, the replacement rule is written in
precedence order, and the two thresholds that were measured wrong
(output-lines, multiplier-ratio) are gone with it.
**Reference:** `planned-edits.md` Edits 1–3 (the `outsourcing_mode` line, the
`delegation:` block, and the Delegation Discipline replacement). Note Edit 3
also **deletes** the phantom `### Thresholds (human-tunable)` subsection —
defect 3, the two config keys that never existed. Config load was verified:
`load_config()` parses all four new keys.
**Progress keys:** `pinLifted`, `precedenceEncoded`, `footprintReplacesLines`, `childBudgetLands`

> **Irony budget: 9 new test functions.** Weighted to precedence: the tests
> that matter assert the authority veto is checked *before* the economics,
> because a rule list that validates but reorders is the failure that looks
> like success.

---

### Session 2 of 3: The number that is not a price

**Steps:**

1. Register.
2. **Disarm `premium_request_weight` (T2).** Rename it in the lockfile
   schema to what it is — per-probe premium-request *consumption*, not a
   rate — document that it is **not** a billing signal and must never be
   used for model selection, and make an absent or zero value read as
   *unknown* rather than *free* (L-112-1: fail-open zero is worse than no
   answer). The store's `request_multiplier` is named as the authoritative
   rate axis, and the credit axis is named as decoupled from it.
   `ai_router/copilot_catalog.py` and the lockfile writer move together with
   `ai_router/docs/` wherever the field is described.
3. **Falsify by planting, not by reading (L-112-1).** FIRES: a lockfile
   whose weight is `0` must not be selectable as "cheapest"; a probe
   returning a float (`7.5`) must not silently become `None`-then-`0`; a
   selector asked for cost must refuse the field outright. DOES NOT FIRE: a
   genuine `0.0` multiplier read from the *store* is a real zero.
   STRUCTURAL: the OpenAI-family disagreement is asserted as a regression
   fixture so the probe cannot re-acquire it silently.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out.**

**Creates:** `ai_router/tests/test_catalog_weight_not_a_price.py`
**Touches:** `ai_router/copilot_catalog.py`, `ai_router/copilot-catalog.lock`, `ai_router/tests/test_copilot_catalog.py`
**Ends with:** the one number in this repo that looks like a price and is
not can no longer be mistaken for one, and the mistake is held down by a
fixture rather than by a comment.
**Reference:** `planned-edits.md` Edit 6 and
`new-files/test_catalog_weight_not_a_price.py` (5 falsifiers; two plants
were proven to fire — a new field reader, and the default changed `None` →
`0`).

> **Correction to this session's plan, found during the reference pass:**
> the `floatSurvives` progress key is **already satisfied** by existing
> coverage. `test_copilot_catalog.py::test_discover_catalog_coerces_
> malformed_premium_weight_to_none` parametrizes `1.5` and asserts both the
> coercion to `None` and a clean lockfile round-trip. Do not re-author it.
> The genuinely new guarantees are the **prohibition** (no module outside
> `copilot_catalog.py` may mention the field), the **rationale surviving
> refactor**, and the **credit-axis decoupling** — the last being the
> subtle one, because a reader who learns only "the OpenAI numbers are
> wrong" will conclude that correcting them makes the field usable. It does
> not. Consider replacing `floatSurvives` with `noReaderOutsideCatalog`.

**Progress keys:** `fieldDisarmed`, `absentIsUnknown`, `floatSurvives`, `regressionFixtured`

> **Irony budget: 7 new test functions.** Six of them exist because the
> field's *name* was the defect; only one tests behaviour that changed.

---

### Session 3 of 3: Rotation, the lever that was never written down

**Steps:**

1. Register.
2. **Document transcript rotation as the dominant cost lever**, with the
   `a9f211a7` measurement as its evidence and a survival contract. What must
   survive a flush: the system prompt and engine bootstrap file, the
   session-set spec and the active step, `session-state.json`, the activity
   log, open findings from any verification round, and a dense
   carry-forward of what was tried and rejected and why. What must not be
   assumed to survive: anything discovered only in the transcript. **The
   failure mode is a session that repeats a path it already abandoned** —
   which is also the strongest argument against outsourcing stateful
   judgment (Session 1's rule 3), so the two sections cite each other.
   Trigger is a token threshold, not a vibe; step boundaries are where it is
   *cheapest*, so the guidance is "at the first step boundary after the
   threshold".
3. **Record the declined trade.** A short subsection stating that the
   orchestrator model was deliberately **not** downgraded, the matched-context
   table that justifies it, and T3's confused-deputy reasoning — so the next
   reader who finds the naive 8.5x table does not re-derive the wrong
   conclusion. Author `change-log.md` and the changelog fragment.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out**, including the Step 9 reorganization review of
   `project-guidance.md` / `lessons-learned.md` — this set produces at least
   two candidate lessons (role/context confounding; unbounded child cost).

**Creates:** `change-log.md`, `ai_router/changelog.d/` fragment
**Touches:** `docs/ai-led-session-workflow.md`, `docs/planning/orchestration-strategy.md` (rotation is a fourth currency-management lever beside its three), `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` (all three carry a Delegation Discipline pointer that currently states the temporary policy — L-064-8 three-surface drift by construction), `docs/planning/lessons-learned.md`
**Ends with:** the largest measured cost effect in the repo's history is
written down where an orchestrator will read it, and the decision *not* to
downgrade the privileged seat is on the record with its evidence.
**Reference:** `planned-edits.md` Edits 4 and 5 (the *Rotation, and the trade
we declined* section, and the three engine-file pointers made
byte-identical), plus
`new-files/0130-set-131-outsourcing-policy-restoration.md` for the changelog
fragment. The engine files had drifted from each other as well as from the
config — `AGENTS.md` carried a compressed variant while `CLAUDE.md` and
`GEMINI.md` still named Sets 110-112 as a live window.
**Progress keys:** `rotationDocumented`, `survivalContract`, `declinedTradeRecorded`, `enginePointersAgree`

> **Irony budget: 0 new test functions.** This session is documentation and
> three pointer files. A test asserting that prose exists is the ceremony
> this repo keeps deleting.

---

## Why three sessions

The dependency chain is **rule → number → narrative**. Session 1 must land
first because the catalog work in Session 2 only matters once delegation is
wide enough for a cost-aware selector to exist. Session 2 must land before
Session 3 because the rotation write-up cites the corrected cost vocabulary.
Folding 2 into 1 would put a probe-metadata change beside a policy rewrite
in the same verification round; folding 3 into 1 would put three
engine-bootstrap files beside the config change that makes them wrong. Each
session holds at N = 2 authored work steps against the ratified budget of 3.
