# Measure against the design it replaces, then enable

> **Purpose:** Decide whether the rewrite earns its place, against the only
> comparator that matters — the current pipeline, on the same work. Sets
> 142–144 built machinery in shadow; this set runs both designs over the
> same corpus, compares cost and recall with denominators attached, and
> either enables the new path or reports honestly that it did not earn it.
> It also closes the loop that keeps the framework from growing: a defect
> caught late becomes a test or a lint rule, and only becomes prose when it
> provably cannot be code.
> **Session Set:** `docs/session-sets/145-measure-then-enable/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus sets 142–144.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-145-measure-then-enable`. **Not** developed
> on `master`.
> **Prerequisite:** sets 142, 143, and 144 complete.

> **Note on rule 6:** operator-authorized exception, as sets 136–144.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## Cost is measured in tokens, because that is how the seat bills

GitHub Copilot bills **per token**, not per request with model multipliers:
input, cached input, cache write, and output are each priced per million
tokens, denominated in AI credits at $0.01 each. Two consequences bind this
set:

1. **`premium_request_weight` in the seat catalog is obsolete for costing.**
   It measures a unit the seat no longer bills in, and Set 139's `refresh`
   cost preview is built on it. Session 2 corrects that preview to token
   cost; nothing in this sequence may cost a run in premium requests.
2. **Model tier is the weaker lever; context size is the stronger one.**
   Opus input is priced the same as GPT-5.5 input and its output is
   cheaper, so tiering buys a fraction of what the old premium weights
   implied. The saving this rewrite claims comes from a checker that reads
   one step instead of a whole bundle. **Measure scope, not tier**, or the
   comparison will credit the wrong mechanism.

Cached input is a tenth of input and cache write is roughly a quarter more
than input, so a context pays for caching after about one reuse. That
matters most on the expensive paths — a premium model re-reading a large
context — and least on cheap per-step checks, which are output-bound.
Report the two separately rather than as one blended saving.

## What "earns it" means

The comparator is **the current pipeline on the same work**, not an
abstract baseline. For each corpus case, run both and report:

- **Cost per case**, in tokens and credits, split input / cached / output,
  and split per-step versus session-level.
- **Recall**, with numerator and denominator shown. Where the denominator
  is too small to support a claim, say so instead of rounding.
- **Ceremony** — time and tokens spent on plan writing, plan review,
  amendments, and bounces that produced no finding.
- **Amendment rate**, carried forward from set 143's replay. A design whose
  plans need constant amendment is paperwork wearing a constraint's
  clothes.
- **The completeness gap** — defects the current pipeline caught by reading
  the diff that no declared proof would have caught. This is the risk
  pre-registration cannot remove by construction, and it must be a number
  rather than a caveat.

## What this set does NOT do (do not reopen)

- **No waiver of session-level cross-provider verification.** It stays
  mandatory with no skip, under every enablement outcome. The step-level
  skip is a different granularity, has its own coverage gate, and is not a
  precedent for relaxing the session mandate.
- **No calibration, no auto-routing.** Weights and thresholds stay frozen
  through this set. There is no cost-driven routing.
- **No new checklist line admitted to demonstrate the mechanism.** An empty
  probation list is the correct end state.
- **No merge to `master` inside this set.** That is one operator decision
  on the complete branch diff, after the gates.

---

## Sessions

### Session 1 of 3: The corpus, and both designs over it

1. Register.
2. Build a versioned corpus of at least 30 defects across the severity
   vocabulary, drawn from this repository's own history where possible —
   sets 136–141 supply real findings with real trees, which is better
   evidence than invented ones. Reserve a holdout partition and record the
   rule that assigned it.
3. Extend `scripts/corpus_acceptance.py` for the new required fields while
   keeping legacy sets additive and tolerant. An existing corpus set that
   predates these fields must still pass.
4. Run **both** designs over the corpus: the current pipeline, and the
   plan-first path from sets 142–144 in shadow. Same cases, same trees,
   same provider mix. A comparison that changes two variables measures
   nothing.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out.

**Creates:** the corpus with its holdout, the extended acceptance script,
the paired shadow run. Est. 4 Python tests.

### Session 2 of 3: Token cost, honestly, and the obsolete preview

1. Register.
2. Record per-run token cost — input, cached input, cache write, output —
   against the published Copilot rates, split per-step versus
   session-level. Report the cache saving separately for cheap per-step
   checks and expensive session-level reads, because they behave
   differently and blending them hides which one paid.
3. Correct Set 139's `refresh` cost preview to project **token** cost. It
   currently projects premium requests, which the seat no longer bills in,
   so the one feature built to price a run before spending it is pricing in
   the wrong unit. Keep the unknown-cost honesty: an entry whose cost
   cannot be projected is reported unknown, never zero.
4. Produce the comparison report: cost per case, recall with denominators,
   ceremony share, amendment rate, and the completeness gap. State plainly
   where a denominator is too small to support a claim.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out.

**Creates:** token-cost recording, the corrected refresh preview, the
head-to-head comparison report. Est. 4 Python tests.

### Session 3 of 3: The decision, and learning cheaply

1. Register.
2. Evaluate enablement against the session 2 report and decide. If the new
   path is cheaper at no worse recall, make it explicitly selectable — a
   configuration an operator chooses, not a default. If it is not, keep it
   in shadow and name the specific remediation, or invoke the kill. A gate
   that almost passes has not passed.
3. Implement rollback as a configuration change, demonstrated in both
   directions, deleting and rewriting no machine evidence.
4. Implement learning cheaply: a defect caught late becomes a test or a
   lint rule wherever it can. It becomes a checklist line only if it
   provably cannot be code **and** the same miss has recurred or shows up
   when replayed against old plans. A checklist line carries its owner and
   the reason it is not executable, and an executable replacement deletes
   the prose in the same change.
5. Add the additive Python projection fields for plan state, step state,
   and unresolved findings, and the TypeScript parser and tree-descriptor
   tests that render them. Python decides; TypeScript renders; no rule
   crosses the boundary. **Deferred, not scheduled:** `progress.py`
   projects steps only for the in-flight session, so a completed session
   always renders an empty step list even though its activity log retains
   every row. Relaxing that guard would show step history on completed
   sets, and a set-level date stamp is derivable from the per-session
   `startedAt`/`completedAt` already in the projection. Neither is in this
   set's scope; both are recorded here so nobody re-derives them.
6. Report the envelope: final LOC, module count, Python tests, and TS
   tests against the +33% ceilings, and `verify.py`'s final size.
7. Cross-provider verification.
8. Affected tests before verification; the full suite once, after.
9. Close-out, the end-of-set `change-log.md`, and the merge recommendation
   for the operator's go/no-go on the complete branch diff.

**Creates:** the enablement decision, rollback, the learn-cheaply rule, the
projection fields, the envelope report. Est. 2 Python tests and 8
TypeScript tests.

---

## Acceptance criterion for the set

Both designs ran over the same corpus, and the comparison reports cost per
case in tokens and credits, recall with denominators and confidence
intervals, ceremony share, amendment rate, and the completeness gap. Where
a denominator is too small, the report says so.

The new path is enabled **only** if it is measurably cheaper at no worse
recall, and stays honestly off otherwise with the failing measure named.
Rollback is a configuration change proven in both directions, and it
destroys no evidence.

Session-level cross-provider verification is still mandatory, with no skip
and no waiver, under every outcome.

A late-caught defect becomes a test or a lint rule; a checklist line
requires proof it cannot be code plus recurrence or replay evidence, and
the probation list is empty at the end of this set.

The envelope report is published: LOC, modules, and tests against the +33%
ceilings, with `verify.py` below 1,200 lines. If the sequence exceeded any
ceiling, the report says by how much and why, rather than the ceiling
being quietly restated.

## Test budget

50 spent in sets 142–144; this set adds **10** (4, 4, 2), reaching **515 of
605**. Ninety slots remain unspent against the envelope, which is the
margin for being wrong — not budget to find a use for.
