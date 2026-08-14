# Session Length, Causality, and Two Explorer Captions

> **Purpose:** Set 131 lifted a stale outsourcing pin and, in passing, produced
> two things this set exists to finish. First, a 220-session probe found that
> wall clock rises with declared step count while **minutes *per step* fall**
> — which falsifies the obvious "more slots invite more work" reading and
> leaves the real question (why does the p90 tail explode?) unanswered. Second,
> the probe exposed that the instrument itself is wrong in two ways, so the
> measurement cannot be trusted until the instrument is fixed. Alongside that,
> two small queued Work Explorer text changes ride here rather than paying
> per-set overhead of their own.
> **Created:** 2026-08-14
> **Session Set:** `docs/session-sets/132-session-length-and-explorer-captions/`
> **Prerequisite:** Set 131 (`condition: complete`). Session 3 cites the
> rotation write-up and survival contract that Set 131 Session 3 authors; the
> compaction-boundary reasoning is meaningless without it.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Numbering note

`C:\Users\adm.dennis.mitchell\source\set-131-reference\set-132-cost-report-spec.md`
is a **parked proposal** for a cost-report restoration set, not a created set.
When this spec was authored, nothing existed under `docs/session-sets/132-*`,
so it claimed **132** on the next-free-number rule and the operator moved it
into the repo under that number on 2026-08-14.

**Obligation that follows:** the parked cost-report proposal must be
renumbered to **133** (or the next free number at the time it is picked up)
before it is created. Its filename still says 132 and now collides with this
set.

---

## Why these are one set

The two halves are unrelated, and that is worth naming rather than hiding.

The Explorer text changes are two string edits. A set of their own would be
dominated by per-set overhead — registration, preload, a verification round,
close-out — which is the exact argument the authoring guide makes in *Other
sizing signals*: "a session with a single trivial step is dominated by
overhead. That is an argument for **merging tiny steps**, not for padding a
session toward the cap." They also both touch Explorer rendering, so they share
one expensive Layer 3 run instead of buying two.

They are deliberately **Session 1**, ahead of the research, so a queued
one-line UI fix does not wait behind a study that may generate follow-ups.

If a reviewer thinks the halves should be split, that is a reasonable
disagreement; split at authoring, not mid-set.

---

## Session Set Configuration

```yaml
requiresUAT: false        # Every user-visible change here is a static string
requiresE2E: true         # Both Session 1 changes are Explorer-rendering
uatStyle: ad-hoc
uatScope: none
pathAwareCritique: advisory
prerequisites:
  - slug: 131-outsourcing-policy-restoration
    condition: complete
```

> **`requiresUAT: false`, and why that is honest.** `project-guidance.md`
> requires that "any step automation can verify must be verified by automation
> (Playwright / Layer 3) BEFORE the checklist is offered to the human", leaving
> the human walk only what automation genuinely cannot check. Both Session 1
> changes are rendered strings that Layer 3 asserts directly. A guided-look
> walk would ask a human to confirm what a spec already proves. The operator
> will see the new caption on every launch regardless; that is feedback, not a
> gate.
>
> **`pathAwareCritique: advisory`, and why this set pays for one.** Set 131
> declined an end-of-set critique on the grounds that it authorized no skip.
> This set is different: Session 2 changes `ai_router/spec_admission.py`, the
> module that **enforces the session-size cap**, and the fix makes the parser
> count *fewer* steps. A change that makes an admission gate more permissive
> earns a second look, even when — especially when — the change is obviously
> correct to its author.

---

## Project Overview

### What Set 131 measured, and why it is not yet an answer

A probe over every schema-v4 session carrying both a parseable plan and
start/complete timestamps (n = 220) produced:

| N (authored work steps) | n | median min | p90 min | **min/step** |
| :--- | ---: | ---: | ---: | ---: |
| ≤2 | 89 | 52 | 199 | **41** |
| 3 | 61 | 49 | 132 | **16** |
| 4–5 | 63 | 86 | 366 | **19** |
| ≥6 | 7 | 114 | 591 | **14** |

`corr(N, total minutes) = +0.226`; `corr(N, minutes per step) = **−0.209**`.

Two readings were on the table when the operator raised this. **Parkinson's
law** — more available slots invite optional work. **Fixed-overhead
amortization** — preload reads, registration, the verification round and
close-out are per-*session* costs that divide across more steps.

The first analysis claimed the falling per-step number falsified Parkinson.
**It does not, and that claim was wrong.** Total time decomposes as
`total(N) = F + N·w̄(N)`, where `F` is per-session fixed overhead and `w̄` is
mean work minutes per work step, so:

```
per_step(N) = F/N + w̄(N)
```

`F/N` falls mechanically as N rises. `per_step` therefore falls whenever the
amortization term dominates, **whatever `w̄` is doing** — and Parkinson is
precisely a claim that `w̄(N)` rises. The metric buries the quantity under
test beneath a term guaranteed to decline, so it cannot separate the two
hypotheses. Amortization is real (the `N≤2` band's 41 min/step, and the
guide's own "a session with a single trivial step is dominated by overhead",
both point at it) but real does not mean sole.

A crude fit points the other way. From the median totals, N=3 → 49 min and
N≥6 → 114 min implies ~21.7 min per added step, hence `F ≈ 49 − 3(21.7) ≈
−16` minutes. Negative fixed overhead is impossible, so **constant `w̄` does
not fit the data** — it is more consistent with `w̄` rising, which is the
Parkinson reading. Medians across sets with genuinely different work make
this a hint, not evidence; it is recorded to stop the falsification claim
from being repeated, not to replace it with the opposite one.

The scope-inflation check has the same defect. Median **0.0** unplanned steps
and a logged/declared ratio of **1.00** over the 41 sessions since Set 128
says orchestrators do not log steps *beyond the plan*. Parkinson would appear
as **the plan itself being larger when N permits it**, which that check
cannot observe.

**None of this establishes causation, and the set must not pretend otherwise.**
The spec author chooses N *already knowing* how big the work is, so large work
produces both more steps and more minutes. And the finding that actually
matters is the one the descriptive table cannot explain: the **p90 tail** goes
132 → 366 → 591 while the median barely moves. The guide itself warns that step
count predicts the median, not the tail, and that the longest sessions on
record (591, 562, 544, 509 min) all declared 5–8 steps — within or barely over
the cap. **The cap is calibrated against the statistic that is not the
problem.**

### The instrument is wrong in two ways, and both were found by using it

Set 131 Session 1 declared **6** steps (N = 2, within the ratified budget of 3,
exactly as its own closing line claims). `spec_admission` counted **11** and
reported `OVER CAP`. Two independent defects produced that:

**D1 — nested ordered lists are hoisted to top level.** The five precedence
rules nested under step 2 are numbered `1.`–`5.`, and `parse_step_texts`
promotes them into top-level steps. Sessions 2 and 3 of the same spec contain
no nested numbered lists and both parse correctly at 6 steps. So the gate fires
on a compliant spec purely because of markdown shape, and — worse — `OVER CAP`
was printed while the command **exited 0**, so nothing blocked and
`start_session` seeded all 11 rows into `activity-log.json`. That session then
carried five plan rows that could never be logged as steps in their own right.

**D2 — `intents_named` matches on mention, not on role.** In the same parse,
steps 2–5 were tagged `[ceremony]`. Step 4 reads *"Independence requirement…
`session-verification`, code review, security review"* — a work step
classified as ceremony because the word "verification" appears in it. Only
steps 1, 9, 10 and 11 were genuinely ceremony.

D2 contaminates the table above: N was computed as "declared steps naming no
ceremony intent", so any work step that merely *mentions* verification,
registration or close-out was miscounted as ceremony, deflating N. The
direction of the finding is unlikely to flip, but the band boundaries are
noisier than they look, and **no causal claim should be built on the current
instrument.**

### The operator's second question

The operator also asked whether unnecessary work could be prevented directly —
"what is the risk (probability × impact) of not doing this work? If low, then
unnecessary." That is already this repo's severity rubric (L-095-1, promoted
into `project-guidance.md`: "grade severity by **consequence** — probability ×
impact"). Extending an existing rubric to a new decision point beats inventing
a parallel mechanism, and *Prefer removal over addition* applies.

### Compaction, and the coupling that makes this one study

Set 131 Session 3 documents transcript rotation as the largest measured cost
lever (conversation `a9f211a7`: 631K input → 54K after compaction, ~33–35
credits/inference → ~3.6–5.0, a ~7–8x reduction for a one-time 400 credits,
payback in ~14 inferences) and sets the trigger as **a token threshold, taken
at the first step boundary after it is crossed**. Step boundaries were never
rejected by anyone — they are the parked design, for the operator's own reason:
pre-step context is least likely to be needed afterwards, and mid-step
compaction risks dropping what the current step is holding.

The coupling: compaction has a **fixed** cost, so it must not fire at every
boundary — only threshold-crossing ones. More steps means more candidate
boundaries. Fewer steps means fewer chances to flush a transcript that is
growing anyway. **N and the compaction threshold cannot be tuned
independently**, which is why the step-budget question and the compaction
question are one study rather than two.

---

## Non-goals

- **No compaction *implementation*.** Set 131 already declared "no automatic
  compaction trigger" a non-goal; that holds here. This set decides the
  trigger's shape and threshold and proves the survival contract is checkable.
  Wiring a writer that flushes an orchestrator's transcript on its behalf is a
  later set.
- **No change to N without an operator decision.** The budget was ratified by
  the operator on 2026-08-12, who rejected their own opening suggestion of
  N = 4. Session 3 produces an education-mode brief and a recommendation; it
  does not move the number on its own authority.
- **The budget-varying experiment is DESIGNED here, not RUN here** (operator,
  2026-08-14: "I'm not saying that we need to do this experiment in this
  set"). Session 3 specifies the arms, the measure, the sample size and the
  threats to validity, so a later set can execute it without re-deciding any
  of that. Running it means many routed plan-generation calls across engines
  and is its own set with its own budget.
- **No retirement of any test.** The `vsix-first-run-walkthrough` flake is
  named as a residual below, not fixed here.
- **No cost gating.** Unchanged from Set 131.
- **No new `close_preflight` predicates.** The `cite_lessons` finding below is
  named, not fixed.

---

## Sessions

> **Authoring note, learned the hard way:** no step text below uses a nested
> **numbered** list, because D1 above proves that hoists into the step count.
> Sub-points are bullets or prose until D1 is fixed.

### Session 1 of 3: Two captions, said plainly

**Steps:**

1. Register.
2. **Rename the Work Explorer caption to "AI Work Explorer".** The current
   caption is **composed, not stored**: `package.json` contributes
   `viewsContainers.activitybar[0].title = "AI Orch"` and
   `views.dabblerSessionSetsContainer[0].name = "Work Explorer"`, and VS Code
   renders the header as `AI ORCH: WORK EXPLORER`. Set 123 Session 3 changed
   the container title *from* `"AI Work Explorer"` for a stated reason — the
   header then read **AI WORK EXPLORER: WORK EXPLORER**, the same words twice —
   so **restoring the old value alone reintroduces the defect that rename
   fixed**. Determine empirically which combination of container `title`, view
   `name` and `contextualTitle` makes VS Code render exactly `AI WORK EXPLORER`
   with no duplication, and assert the rendered header in Layer 3 rather than
   asserting the manifest fields. Fix every sibling site in the same pass
   (L-069-1): `package.json:48` and `:58`, and the aria-label substring
   selector in `src/test/playwright/electronLaunch.ts:814`
   (`.activitybar .action-label[aria-label*="AI Orch"]`), which is how the
   Layer 3 harness finds the activity bar icon at all and will silently fail to
   open the container if it is missed.
3. **Remove `not computed` from the close-out readiness row.** Operator
   ruling, 2026-08-14: the row already carries a timestamp when a projection
   exists, so **the presence or absence of the timestamp is the signal**, and
   the words sit in the gray slot where that timestamp appears. Keep the
   underlying `absent` state and its distinct glyph — Set 127 S2's rationale
   ("no answer" and "nothing remains" are opposite facts) is preserved by the
   empty timestamp, not by the phrase. Sites: `closeOutSummary` in
   `src/providers/workExplorerTreeModel.ts:1051`, the two assertions in
   `src/test/suite/workExplorerTreeModel.test.ts` (~1135, ~1346), and the
   README line describing the four states. The existing test *"absent is a
   state the operator is told about, not an empty row"* must be **rewritten,
   not deleted** — it becomes the assertion that an absent projection is still
   distinguishable, now by the absent timestamp and the glyph.
4. Cross-provider verification.
5. Required portion of the full test suite.
6. Close-out.

**Creates:** `tools/dabbler-ai-orchestration/changelog.d/` fragment
**Touches:** `tools/dabbler-ai-orchestration/package.json`, `src/providers/workExplorerTreeModel.ts`, `src/test/suite/workExplorerTreeModel.test.ts`, `src/test/playwright/electronLaunch.ts`, at least one Layer 3 spec, `tools/dabbler-ai-orchestration/README.md`
**Ends with:** the sidebar header reads `AI WORK EXPLORER` once, proven by a
Layer 3 assertion on the rendered text; the close-out readiness row shows no
`not computed`, and an unrun projection is still visibly distinct from a clean
one.
**Progress keys:** `captionRenders`, `noDuplication`, `harnessSelectorFollows`, `absentStillDistinct`

> **Both changes are Explorer-rendering, so L-064-12 applies:** the full
> `npm run test:playwright` runs after the last code change, not before.

---

### Session 2 of 3: Fix the instrument before trusting it

**Steps:**

1. Register.
2. **Fix D1 — nested ordered lists must not become steps.** `parse_step_texts`
   in `ai_router/spec_admission.py` counts a nested `1.`–`5.` sub-list as
   top-level steps, so a compliant spec is reported `OVER CAP`. Ship the fix
   with falsifiers on both sides (L-112-1): a spec whose nested sub-list must
   **not** inflate the count, and a genuinely oversized spec that must **still**
   be refused. Set 131's own `spec.md` is the natural regression fixture — it
   parses at 11 today and must parse at 6. Also close the second half of the
   defect: `--spec` printed `OVER CAP` and **exited 0**, so the gate announced
   a violation and permitted it. Decide deliberately whether `--spec` should
   exit non-zero, and if it stays 0, say why in the code.
3. **Fix D2 — classify ceremony by role, not by mention.** `intents_named`
   tags any step containing "verification", "register" or "close" as ceremony,
   so work steps that merely *reference* those things are miscounted. Fix the
   classifier and ship a falsifier built from the real sentence that exposed
   it: *"Independence requirement. Work whose value is an independent
   perspective is always routed: `session-verification`, code review, security
   review"* must classify as **work**. **This spec is a second ready-made
   fixture, and a harsher one:** run against it today, the classifier tags
   *"Remove `not computed` from the close-out readiness row"* (Session 1),
   *"classify ceremony by role, not by mention"* (this very step) and
   *"Design the causal question, with a cross-provider panel"* (Session 3) as
   ceremony — three of eight work steps, misread on the words they quote.
   Assert the corrected N for all three sessions of this set.
4. **Re-run the measurement on the fixed instrument.** Reproduce the Set 131
   probe with corrected N, publish the corrected table, and state plainly
   whether the direction held. Report **medians and the p90 tail**, and treat
   the tail as the primary result rather than a footnote.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `docs/session-sets/132-.../s2-measurement.md`, `ai_router/tests/test_spec_admission_step_counting.py` (or additions to the existing module)
**Touches:** `ai_router/spec_admission.py`, its existing tests, `docs/planning/session-set-authoring-guide.md` (the cap section, if the corrected numbers move it)
**Ends with:** Set 131's spec parses at its declared 6 steps; a work step that
names verification is classified as work; and the step-count/duration table is
rebuilt on an instrument that has falsifiers behind it.
**Progress keys:** `nestedListsNotHoisted`, `exitCodeDecided`, `ceremonyByRole`, `tableRebuilt`

> **Irony budget: this session declares 3 work steps.** If the fixed parser
> disagrees with that count, that is the deliverable working.

---

### Session 3 of 3: Why the tail, what N should be, and where compaction fires

**Steps:**

1. Register.
2. **Design the causal question, with a cross-provider panel.** The author
   chooses N knowing the work, so N and duration share a common cause and the
   correlation cannot settle it. This is oracle-free and genuinely divergent —
   the two conditions `project-guidance.md` sets for a panel to earn its cost —
   so consult at least two distinct providers on the identification strategy.
   **The leading candidate is already on the table and the panel's job is to
   attack it, not to reinvent it** (operator design, 2026-08-14): hold **one
   spec fixed**, vary only the declared step budget (N=3, N=5, N=unconstrained),
   have engines generate **only the plan** plus a per-step effort estimate, and
   compare planned scope across arms. Because the work is constant by
   construction, the author-chooses-N confound is broken — any scope difference
   is attributable to the budget. It is cheap because nothing is executed.
   Have the panel probe its weak points: estimate-vs-actual bias, whether a
   single spec generalizes, arm contamination if one engine sees all three
   budgets, and how many spec/engine pairs are needed to say anything.
   Alongside it, evaluate the observational fallback — estimate `F` from
   timestamped ceremony steps in `activity-log.json` and test `w̄(N)` directly,
   which only becomes possible once Session 2 fixes D2. **The descriptive
   question is not panel work** and must not be sent: it was answered
   deterministically for free, and asking advisors to opine on an
   unconditioned average is the exact error Set 131 named as trap T1. Focus
   the panel on the **p90 tail**, which the median-calibrated cap does not
   address.
3. **Answer the operator's prevention question inside the existing rubric.**
   The operator proposed gating unnecessary work by "probability × impact of
   *not* doing it". That is L-095-1's consequence rubric, already promoted into
   `project-guidance.md`. Extend the existing rubric to the plan-authoring
   moment rather than adding a parallel gate (*Prefer removal over addition*),
   and say explicitly whether anything is being added at all.
4. **Fix the compaction trigger to a threshold, and tie it to N.** Using Set
   131 Session 3's rotation section as the base, name the token threshold, keep
   the boundary rule (first step boundary after the threshold is crossed),
   and show the payback arithmetic that forbids firing at every boundary — the
   measured 400-credit cost against a ~14-inference payback. State the coupling
   in one place: N determines how many boundaries exist, the threshold
   determines which of them fire. Produce the **education-mode brief** on N
   (recommendation, confidence, and the default if the operator does not
   answer); the number moves only on the operator's word.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out, including the Step 9 reorganization review.

**Creates:** `docs/session-sets/132-.../s3-causality-and-compaction.md`, `change-log.md`, `ai_router/changelog.d/` fragment
**Touches:** `docs/ai-led-session-workflow.md` (rotation trigger + threshold), `docs/planning/session-set-authoring-guide.md` (the cap section), `docs/planning/project-guidance.md` (only if the rubric genuinely extends), `docs/planning/lessons-learned.md`
**Ends with:** a defensible answer to *why* long sessions are long that is not
"more steps"; a runnable experiment design that separates `w̄(N)` from `F/N`
rather than confounding them; a compaction threshold with arithmetic behind it;
and an N recommendation on the operator's desk with its evidence, not a changed
number.
**Progress keys:** `identificationStrategy`, `tailExplained`, `rubricNotDuplicated`, `thresholdNamed`, `operatorBriefed`

---

## Why three sessions

The dependency chain is **independent work first, then instrument, then
inference**. Session 1 shares nothing with the other two and goes first so a
queued UI fix is not held hostage to a study. Session 2 must precede Session 3
because a causal claim built on a miscounting parser is worse than no claim —
the current N is contaminated by D2 and the current cap fires on markdown shape
via D1. Session 3 is the only session that reasons, and it is the only one that
stops to the operator.

Each session holds at N = 2, 3 and 3 authored work steps respectively, against
the ratified budget of 3.

**And the instrument disagrees, which is the point.** Run
`spec_admission` against this spec today and the step *counts* are correct —
6, 7, 7, all `[ok]` — because no step below uses a nested numbered list. But
the work/ceremony split reads **N = 1, 2, 2**, because D2 misclassifies three
work steps on words they merely quote. The declared N above is the true one.
A set that cannot count its own steps is the argument for Session 2.

---

## Named residuals — found in Set 131, deliberately not fixed here

Both are real, both cost money on every session, and both are larger than this
set. Naming them makes each a **decision** rather than an oversight.

**R1 — `cite_lessons` stales the verification stamp, buying a routed round
every session.** The close sequence *requires* `cite_lessons` in the final
commit; it writes `last-used-set` into `docs/planning/lessons-learned.md`,
which is shipped content under no declared test surface, so `post_round_delta`
classifies the delta as `shipped-code` and A4 owes one more
`--phase remediation-review`. Set 131 Session 1 spent round 5 on a delta of two
bookkeeping files. Set 116 S2 already carved out exactly this shape for
`run_of_record` — "recording does not stale the verification that just passed"
— and `cite_lessons` looks like the same case, missed. Set 130 Session 1 also
carries an `s1-verification-round-5.md`, which suggests it is systemic rather
than local. Recommend a small set that either exempts the citation write or
brings `lessons-learned.md` under a declared surface.

**R2 — `vsix-first-run-walkthrough.spec.ts` is a chronic flake inside a close
gate.** It creates a real venv and network-installs the working tree, then
waits 300s for the scaffold. Under load in Set 131 it exhausted that budget;
run in isolation immediately afterward it passed in 57.6s. The operator
confirms it "often fails", and git history agrees (`cf8cb5f1`, *the CI legs are
losing a keystroke, not finding a defect*). A gate that fails spuriously stops
being read — the mirror of L-112-1's "a gate that only ever passes proves
nothing". Set 118 established this repo's test-retirement and coupling-budget
machinery; this is a candidate for it.
