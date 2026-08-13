# Session Step Skeleton and Test Ordering Spec

> **Purpose:** The canonical order is *targeted tests → verify →
> remediate → full suites → close*, and Set 116 S3 established it after
> Set 112 S3 obeyed the old ordering into 15 runs and 186 minutes. Set 127
> Session 2 then did it again — its own spec compressed *"full suites;
> verify; close"* into one numbered step, in the wrong internal order, and
> the orchestrator followed the spec's letter over the policy that
> outranks it. The policy was never in doubt; **the shape a spec is
> allowed to declare its steps in** is what let a retired ordering be
> re-encoded in prose where nothing could check it. This set fixes the
> shape first, then writes the rules into it, then re-authors the one
> unstarted set that would otherwise be executed under the old
> assumptions.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/128-session-step-skeleton-and-test-ordering/`
> **Prerequisite:** Set 127 complete — its Session 3 edits
> `docs/session-constitution.md` and
> `docs/planning/session-set-authoring-guide.md`, which are two of this
> set's primary surfaces. Concurrent edits would race.
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Source of record:**
[`docs/planning/session-step-skeleton-and-verification-cost.md`](../../planning/session-step-skeleton-and-verification-cost.md)
— raised by the operator on 2026-08-12 during Set 127 Session 2, with the
measured cost, the two components, and the operator rulings A4.1 / A4.2
recorded verbatim. That note is the authority for the diagnosis; this
spec picks the decomposition and schedules it.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No UI surface. The deliverable is what a spec may declare and what runs when, neither of which renders.
requiresE2E: false        # Layer 3 is untouched. The extension is not a surface of this set.
uatStyle: ad-hoc
uatScope: none
pathAwareCritique: required   # Session 2 REDUCES verification (A4.1 / A4.2). Set 118 set the same flag for the same reason: a set that spends verification must itself be reviewed by critics that retrieve repo ground truth independently. End-of-set, so it costs once.
prerequisites:
  - slug: 127-the-active-step-shows-in-progress
    condition: complete
sessionSizeException: 1 - Seven steps, of which FOUR are the baked-in ceremony this set introduces (register + the three-step tail). Three are work. The set dogfoods its own skeleton -- project-guidance's rule that a shipping gate is armed against the set that ships it -- and the current cap of 5 counts ceremony the new cap deliberately will not. Sessions 1-3 all declare this for the same reason.
sessionSizeException: 2 - Seven steps, four of them the baked-in ceremony. Three are work. Same reason as session 1.
sessionSizeException: 3 - Six steps, four of them the baked-in ceremony. Two are work. Same reason as session 1.
```

> Rationale: `requiresUAT` is false because nothing an operator looks at
> changes — the deliverable is a parser check, two documents, and one
> re-authored spec. `pathAwareCritique: required` is the load-bearing
> flag: Session 2 makes a verification-reducing change, and the repo's
> standing answer to that (Set 118's own config block, and Set 116 before
> it) is an independent multi-provider review that reads the repo rather
> than a pasted diff.

---

## Project Overview

### The two components, and why they are separable

**Component A — the rules: what runs when, relative to verification.**
Half of this already exists in `docs/session-constitution.md` Steps 5/6/8
and was violated anyway. It gains two things it does not have today: the
path-aware critique explicitly ahead of any full suite, and an answer for
what a *post-suite* fix owes.

**Component B — the composition: which steps a session declares.** Every
session's steps become `Register` + the authored work + a fixed
three-step tail (`Cross-provider verification`, `Required portion of the
full test suite`, `Close-out`), enforced by the parser that already reads
those step texts.

**B ships before A.** A is prose until there is a shape it cannot be
compressed out of; `spec_admission` already parses every step text to
enforce the count, and a **shape** check beside the **count** check is
the cheapest possible home for it. Set 127's own spec argued that an
unenforced convention is the thing this repo keeps having to replace with
a gate, and then shipped a session plan that proved it.

### The baked-in steps

| position | step | baked in? |
| :--- | :--- | :--- |
| 1 | **Register** | yes |
| 2 … N+1 | the session's actual work | no |
| −3 | **Cross-provider verification** (session verification, plus the path-aware critique when armed) | yes |
| −2 | **Required portion of the full test suite** | yes |
| −1 | **Close-out** | yes |

The wording of the second-to-last step is the operator's, and it is
deliberate over a more precise alternative: *"`full (test) suite` is
often used by AI engines"*. The word **required** carries the fact that
`covers` is by path and not every session owes every suite; renaming the
step into something no engine recognises would trade a legible
instruction for a pedantic one.

### The budget is re-baselined, not merely re-counted

The cap is **5 top-level steps** (Set 111 S4, measured across 172
schema-v4 sessions): 1–5 steps ran a 42-minute median, 6–8 ran 84 with a
386-minute p90. That measurement was taken on specs whose five steps
**already absorbed the ceremony** — Set 127 S1 spent three of its six on
register / verify / close — so historical "5 declared" meant roughly
three to four real work steps.

Under the skeleton, `4 + N` declared steps contain only `N` work steps,
so the old bands do not transfer and the number cannot be carried over
unexamined. **Session 1 ratifies `N` before it writes the check.**

### What Set 118 has to do with it

`118-test-retirement-and-coupling-budget` is `not-started`, and its own
purpose paragraph cites the ordering this set tightens: *"Set 116 …
Session 3 moves the full-suite run to Step 8 and fixes what 'a fresh test
run' means; this set changes which tests exist and must not race that."*
It changes **which tests exist** and introduces a **coupling budget**,
both of which land directly on A1 (what "targeted" covers), A3 (what "the
required portion" means once tests are retired) and A4.2 (what a focused
remediation-review scopes to).

Authoring 118 against the old rules and this set against the new ones
would put two specs on one surface from different assumptions. Session 3
re-authors it while it is still unstarted — the cheapest that edit will
ever be. **Set 118 gains a prerequisite on this set at authoring time**,
so it cannot start first; that edit is made with this spec, not deferred
into Session 3, because a race that starts before Session 3 runs is
exactly what the prerequisite exists to prevent.

### Non-goals

- **No change to what verification COSTS or which provider runs it.**
  A4.2 routes a post-suite code fix to the *existing*
  `--phase remediation-review`; it does not invent a cheaper tier, and it
  does not touch fan-out, bounds, or the no-resurrection rule.
- **No retirement of the session-size cap.** The cap stays, enforced by
  the same config key; only what it counts is re-baselined.
- **No line-count criterion.** The operator's original formulation
  ("less than two lines") is superseded by A4.1 / A4.2 and must not be
  reintroduced: Set 127 S2 planted eight defects and six were two lines
  or fewer, every one a real correctness bug.
- **No retrofit of existing specs' step text.** Session 1 decides
  whether the shape check refuses or warns for the corpus that predates
  it; rewriting 40+ historical specs is not in scope and would be
  meaningless — their sessions are closed.
- **Set 118 is re-authored, not executed.** Its own three sessions run
  later, on their own terms.

### The one thing that must not regress

A spec must never again be able to declare a step that **compresses
verification and the full suite into one instruction**, in any order.
That is the exact shape that produced both the Set 112 S3 incident and
the Set 127 S2 repeat, and the check has to fire on it whatever words the
author chooses — which is why Session 1's falsifiers plant the
malformation rather than reading the regex (`L-112-1`).

---

## Sessions

### Session 1 of 3: The shape a session declares

**Steps:**

1. Register. **Journal the two ratifications first** — they are not
   self-authorizable and the session implements nothing before they
   exist. (a) The **work-step budget `N`**: 3 holds the measured
   42-minute median, 4 is the operator's opening suggestion and is a
   deliberate loosening; record the rejected value and why. (b)
   **Refuse or warn** for the existing non-conforming corpus, with
   new-sets-only as the third option. Silently grandfathering everything
   is not among them, because a check nothing can fail proves nothing.
2. **Add the shape check to `ai_router/spec_admission.py`,** beside the
   count check that already reads the same parsed step texts. It asserts
   the first step registers and the last three are the tail, in order,
   and it recognises them by intent rather than by exact prose — an
   author who writes "Close out" must not fail on a hyphen.
3. **Falsify in both directions** (`L-112-1`), by planting the
   malformation rather than reading the regex. FIRES: a spec that
   compresses verify + full suite into one step (the Set 127 S2 shape,
   verbatim); a tail in the wrong order; a missing tail step; work after
   close-out. DOES NOT FIRE: a conforming spec at the budget; a
   conforming spec with a declared `sessionSizeException`. STRUCTURAL:
   this spec's own three sessions pass their own check.
4. **Re-baseline the budget** — `authoring.max_steps_per_session` in
   `ai_router/router-config.yaml` and the *session-size cap* section of
   the authoring guide, which must say what the number now counts and
   carry the Set 111 S4 table with the re-reading beside it, so a future
   author does not compare the new number to the old bands.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the step-shape check and its falsifiers
**Touches:** `ai_router/spec_admission.py`, `ai_router/tests/test_spec_admission*.py`, `ai_router/router-config.yaml`, `docs/planning/session-set-authoring-guide.md`
**Ends with:** a spec that declares *"Full pytest and the Layer 3 run
recorded as runs of record; verify; close"* as one step is refused by the
same command that already sizes it — and this set's own three sessions
pass.
**Progress keys:** `shapeRatified`, `shapeCheckLands`, `plantedMalformationsCaught`, `budgetRebaselined`

> **Irony budget: 10 new test functions.** Most go to the negative
> direction — the malformations that must fire — because a shape check
> that only ever passes is indistinguishable from one that checks
> nothing.

---

### Session 2 of 3: The rules the shape protects

**Steps:**

1. Register. **Journal A4.1 and A4.2 as an operator-attested
   verification-reduction** — the constitution's hard carve-out, which
   `decision_journal` refuses to write without the attestation. Record
   the superseded line-count formulation as the rejected alternative,
   with the Set 127 S2 mutation evidence (six of eight two-line defects
   were real correctness bugs) as the reason it was dropped.
2. **Write A1–A3 into the constitution and the authoring guide.**
   Targeted runs only before verification; **no full suite before any
   cross-verification stage, including the path-aware critique** — which
   moves ahead of the suite rather than sitting inside close beside it;
   only *full* suites are pinned, so a targeted Layer 3 spec before a UAT
   walk stays legitimate; and "required portion" is carried by `covers`,
   not by running everything.
3. **Encode the mechanizable half of A4:** classify the diff since the
   recorded verification round as **test-only** or **touching shipped
   code**, reusing `run_of_record`'s surface digests rather than adding a
   second notion of "what changed". Test-only owes nothing; shipped code
   owes a `remediation-review` round and not an open re-verification.
4. **Falsify in both directions.** FIRES: a shipped-code fix after the
   recorded round is reported as owing a delta review. DOES NOT FIRE: a
   test-only fix owes nothing; a session with no post-round change is
   untouched. STRUCTURAL: nothing here weakens the existing bounds, the
   no-resurrection rule, or `verification_integrity` — assert that
   against a hand-built ledger.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the A4 diff classifier and its falsifiers
**Touches:** `docs/session-constitution.md`, `docs/planning/session-set-authoring-guide.md`, `ai_router/run_of_record.py`, `ai_router/gate_checks.py`, `ai_router/tests/test_run_of_record*.py`, `ai_router/tests/test_gate_checks*.py`
**Ends with:** a session that fixes a test after its full suite owes
nothing, a session that fixes code owes one delta review, and no session
can run a full suite before its verification — with the path-aware
critique named ahead of the suite rather than beside it.
**Progress keys:** `carveOutAttested`, `orderingWritten`, `diffClassifierLands`, `boundsUntouched`

> **Irony budget: 8 new test functions.** Small because the change is one
> classifier and two documents; the weight is on proving the carve-out
> cannot be widened by accident.

---

### Session 3 of 3: The unstarted corpus, re-authored under the new rules

**Steps:**

1. Register.
2. **Re-author `118-test-retirement-and-coupling-budget`'s spec** to the
   new skeleton and the new ordering: its sessions declare the baked-in
   steps, its retirement rule and coupling budget are stated in terms of
   A1 (what "targeted" covers) and A3 (what "the required portion" means
   once tests are retired), and its measurements are re-read rather than
   restated — the counts in it are from 2026-08-10 and are a floor. This
   is the **substantive** half: judgment, not text.
3. **Restructure the other three unstarted specs, then re-admit all
   four.** `113-narrated-video-walkthroughs`,
   `121-guidance-becomes-executable` and
   `122-module-lifecycle-to-python` need only the **mechanical** edit —
   all fourteen of their sessions carry the identical malformation, a
   five-step session whose last step compresses verify + full suite +
   close, most in the wrong internal order. Replacing that one step with
   three yields seven steps and exactly `N = 3` work steps, so no
   `sessionSizeException` is owed anywhere; re-measure rather than trust
   that sentence. Then the dogfood: `spec_admission` must pass on **four
   specs this set did not author**. Retire
   `docs/planning/session-step-skeleton-and-verification-cost.md` from
   "diagnosed, not fixed" to fixed, citing the sessions that closed it
   and naming the modules residual (A5) with its owner — **Set 129**,
   which the operator scheduled during Session 2 — and author
   `change-log.md`.
4. **Cross-provider verification.**
5. **Required portion of the full test suite.**
6. **Close-out**, including the Step 9 reorganization review of
   `project-guidance.md` / `lessons-learned.md`.

**Creates:** `change-log.md`
**Touches:** `docs/session-sets/118-test-retirement-and-coupling-budget/spec.md`, `docs/session-sets/113-narrated-video-walkthroughs/spec.md`, `docs/session-sets/121-guidance-becomes-executable/spec.md`, `docs/session-sets/122-module-lifecycle-to-python/spec.md`, `docs/planning/session-step-skeleton-and-verification-cost.md`, `docs/planning/project-guidance.md`, `docs/planning/lessons-learned.md`
**Ends with:** every unstarted set can be started by an orchestrator who
reads only its own spec and the preload, and gets the ordering right
without knowing this set existed — and `spec_admission --all --check`
has no non-conforming unstarted spec left to refuse.
**Progress keys:** `set118Reauthored`, `corpusRestructured`, `dogfoodAdmitted`, `noteRetired`

> **Irony budget: 2 new test functions.** The deliverable is four specs
> and two documents; the check that matters is `spec_admission` passing
> on specs this set did not write.
>
> **Scope note (operator, 2026-08-12, journalled in `decisions.jsonl`).**
> Session 3 was originally scoped to Set 118 alone. Session 1's check is
> **blocking for unstarted sets**, and the operator intends to run 122
> next, so 122 was blocked the moment Session 1 landed. The alternative
> considered and rejected was giving each unstarted set a new first
> session that restructures its own spec — self-defeating, because
> adding a session *is* a spec edit and the restructuring is the same
> edit, strictly smaller, and a session spends four ceremony steps to
> perform a text edit. Splitting step 2 (substantive) from step 3
> (mechanical) keeps `N = 3` and needs no new sessions anywhere.

---

## The open question this set does NOT close

**How "the required portion" resolves per module.** `run_of_record`'s
`covers` is a flat path list; a repo with a declared module tier
(`docs/modules.yaml`; Sets 087, 093, 100) may need a session's obligation
to resolve to *its module's* surfaces instead. Three sub-questions are
recorded in the source-of-record note: whether a module declares its own
`covers`; what a session owes when it touches a shared surface; and
whether A4.2's delta review scopes to the module or to the diff.

It is **out of scope here** and stays that way: this repo has one module
in practice, so the question is a consumer-repo problem first, and
answering it speculatively would ship a mapping nothing exercises.
Session 3 names it as a residual with an owner rather than leaving it
silent.

**Owner assigned, 2026-08-12 (operator, during Session 2).** A5 is now
**Set 129**, authored from a proposal the operator supplied and reviewed
independently by `gpt-5.6-sol` and `gemini-3.1-pro`. Both converged:
adopt the suite-owned *input set* abstraction (which `covers` already
almost is), reject the contract / mock / lock apparatus as premature for
a framework whose consumer repos have not demonstrated that
architecture, and reject the proposal's claim that skipping an
unaffected suite is *"provably redundant work"* rather than a risk
trade-off — real pytest / Electron / Playwright suites are not pure
functions of their declared inputs, and `covers` is a path prefix, not a
dependency graph. Session 3 cites 129 as the owner when it retires the
source-of-record note.

---

## End-of-set deliverables

- A spec cannot declare a step that compresses verification and the full
  suite into one instruction — refused by the same command that sizes it,
  with the Set 127 S2 shape planted as a falsifier.
- The step composition, the re-baselined budget, and what the number now
  counts, in the authoring guide.
- The ordering rules in the constitution, with the path-aware critique
  ahead of any full suite.
- A4.1 / A4.2 journalled as an operator-attested verification-reduction,
  keyed on what changed rather than on how many lines, with the
  mechanizable half encoded and falsified.
- Set 118 re-authored so it can be run correctly by someone who never
  read this set, and the other three unstarted specs (113, 121, 122)
  restructured to the skeleton so none of them is blocked by the check
  this set ships.
- The source-of-record note moved to fixed, with the modules residual
  named and owned by Set 129.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
