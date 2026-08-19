# G0 facts, claims, and risk in shadow

> **Purpose:** Second of five sets implementing the verification pipeline
> v3 plan. Build the cheap deterministic inputs **before** paying models,
> and make the economical test path the mechanically accepted one. The
> repeated failure this set exists for is behavioural: orchestrators run
> the full suite before verification because prompt wording asked them
> not to, and prompt wording has never been enough. After this set, an
> unapproved full-suite run is not merely discouraged — it is invalid
> pre-verification evidence, and `verify` refuses to dispatch without
> targeted selection evidence. Risk scoring lands in the same set but
> stays advisory: it records what it *would* have routed while current
> verification behaviour stays authoritative.
> **Session Set:** `docs/session-sets/142-g0-facts-and-risk-shadow/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Plan of record:** `docs/verification-pipeline-v3-plan.md` (the
> Verification Pipeline Operationalization Plan, 2026-08-19), sections
> 2.4, 6, and 10.
> **Baseline commit:** `8be18fb8` on `master`, plus set 141.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-142-g0-risk`. **Not** developed on
> `master`.
> **Prerequisite:** set 141 complete. The frozen schemas, the machine-
> owned artifact paths, and the default-off configuration are all
> preconditions, and the 48-slot reservation must have survived its gate.

> **Note on rule 6:** operator-authorized exception, as sets 136–141.

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

## The lifecycle this set makes mechanical

```text
edit -> affected tests + cheap deterministic checks -> verification
     -> remediation -> affected tests + invalidated checks -> re-verification
     -> final verified tree -> full suite once -> record -> commit/close
```

The rules, in the order they bind:

1. **Pre-verification runs only selected tests.** Selection comes from
   changed paths, module ownership, dependency edges, and configured
   affected-test rules. Compile, typecheck, lint, and static checks run
   only when cheaper than the full suite and relevant to the changed
   surface.
2. **No speculative full suite.** A full-suite command is neither
   required nor accepted as ordinary G0 evidence. The verification
   command names the selected tests and the deterministic reason each was
   selected.
3. **Selection uncertainty is risk, not permission to run everything.**
   An unmappable changed path records `selection_unknown` and *raises*
   routing risk. Run the configured smoke/contract tests and let
   verification inspect the gap.
4. **Two repository-wide exceptions, both auditable.** A pre-verification
   full suite is permitted when the deterministic selector proves every
   test is affected (a test runner, shared bootstrap, or global build
   configuration changed), or when an operator supplies
   `--allow-full-preverify` with a non-empty reason. The artifact records
   which exception applied.
5. **After remediation, rerun the failed tests plus the tests the fix
   invalidated** — not all of them. A changed remediation tree
   invalidates the prior verification; it does not automatically widen
   test scope.
6. **The run of record comes last.** After the final verification
   succeeds and no code will change, the complete configured suite runs
   exactly once; its tree digest, commands, outcome, duration, and
   coverage where available are recorded, and only then commit and close.
7. **A failed run of record is not reusable proof.** Fix the defect,
   rerun affected tests, re-verify the changed tree, then rerun the full
   suite. The previous full run is stale.
8. **CI stays full.** Pull-request and release CI continue to run the
   complete Python and extension suites independently
   (`.github/workflows/test.yml` lines 21–79 are unchanged by this set).

Test evidence records gain exactly two stages: `preverify-targeted`
carries selected test IDs or files and the selection reasons;
`final-full` carries the declared complete suite and the verified tree
digest. The existing `test_run_fresh` close gate stays **evidence-only**
— it checks that required `final-full` records are passing and fresh for
the current surfaces, and it never launches a test command itself.

### What the framework can and cannot do

It cannot stop an agent from typing an arbitrary test command into a
shell. It can stop that waste from being the *prescribed* or *accepted*
workflow, and this set implements all four levers:

- generated instructions name the targeted command;
- G0 marks unapproved full-suite evidence `policy_violation`;
- `verify` refuses to start until targeted selection evidence exists;
- metrics record pre-verification full-suite duration as avoidable
  ceremony.

## What G0 is, and is not

G0 **normalizes outputs from configured repository executables**. It does
not reimplement any language's compiler, linter, coverage engine, or
security analyzer in Python. An unsupported check reports
`not_applicable` or `unknown` — **never** `pass`. An unknown high-value
control raises routing risk rather than manufacturing assurance. A red
required G0 result returns to the author *before* model spend.

## What this set does NOT do (do not reopen)

- **No routing change.** Risk scoring recommends `lite`, `standard`, or
  `deep` into the record only. Current verification behaviour stays
  authoritative until set 145's enablement gates pass.
- **No exemption beyond docs-only.** Comment-only, generated, lockfile,
  and format-only exemptions are deferred until measured false-positive
  savings exceed observed miss risk. Do not add them "since we are here".
- **No sixth close gate**, and no change to `gates.py`. G0 is a
  pre-review execution stage.
- **No model-judgment substitute for a missing perimeter control.**
  Sensitive-path and concurrency rules produce facts only where an
  executable rule is configured for that language and module. Elsewhere
  they are `unknown`, and `unknown` costs risk points.
- **No new Python module.** This fits `test_evidence.py`, `verify.py`,
  `selection.py`, `bootstrap.py`, and `config.py`.

---

## Sessions

### Session 1 of 3: Affected-test selection, the two record stages, and the refusal

1. Register.
2. Implement deterministic affected-test selection: changed paths, module
   ownership, dependency edges, and configured repository rules, each
   selection carrying the named reason that produced it. Record
   `selection_unknown` when a changed path maps to nothing, and treat it
   as a risk contribution rather than a licence to widen.
3. Extend `test_evidence.py` records with the closed stage vocabulary
   `preverify-targeted` and `final-full`. Freshness evaluation accepts
   only `final-full` as the close run of record; a `preverify-targeted`
   record can never satisfy `test_run_fresh`. The gate stays
   evidence-only and still launches nothing.
4. Normalize the configured compile, lint, coverage, boundary, API, and
   analyzer outputs plus the selected test command into
   `g0-summary.json`. Unsupported controls record `not_applicable` or
   `unknown`; nothing unsupported records `pass`.
5. Detect full-suite command fingerprints and reject them before
   verification, unless the selector proves all tests are affected or the
   operator recorded `--allow-full-preverify` with a non-empty reason.
   The artifact records which of the two exceptions applied. This is the
   `policy_violation` state, and it blocks dispatch rather than
   annotating it.
6. Update the managed orchestrator instructions and the verification
   refusal text through `bootstrap.py`: print the affected-test command
   before verification and the full-suite command only after the final
   verified tree. Remove every generic pre-verification phrase an agent
   can read as "run all tests" — including this repository's own current
   step wording.
7. Return red required G0 facts to the author before any model spend.
8. Cross-provider verification.
9. Required portion of the full test suite.
10. Close-out.

**Creates:** the selector, the two-stage evidence records,
`g0-summary.json` normalization, the full-suite refusal, the rewritten
instruction text. Est. 4–5 new Python tests.

### Session 2 of 3: Claims validated against mechanical facts, and a deletion bet

1. Register.
2. Validate `review-claims.json` against G0's uncovered changed lines and
   the other mechanical facts. A claim contradicted by a deterministic
   fact is refused at ingest; a claim about a surface G0 cannot see is
   recorded as unverifiable rather than accepted.
3. Pre-register the deletion bet for claims, in the record rather than in
   prose: claims survive only if, within four weeks or the pre-registered
   statistical power (whichever comes first), they demonstrably change a
   review outcome. Write down the numerator, the denominator, and the
   date the bet resolves, so the decision to delete is arithmetic and not
   an argument.
4. From this session on, the set's own sessions eat their own dogfood:
   the pre-verification run is the targeted selection this set emits, and
   the full suite runs once, after the final verified tree. If the
   selector cannot name the tests for this session's own change, that is
   a finding about the selector, not a reason to run everything.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out.

**Creates:** claim validation against G0 facts, the pre-registered
deletion bet with its resolution date. Est. 3 new Python tests.

### Session 3 of 3: Auditable risk scoring, in shadow

1. Register.
2. Implement the risk score in `selection.py` as a **pure deterministic
   function**. Every contribution is recorded by name, value, and the
   source fact that produced it — no aggregate number without its parts.
   Correlated signals stay individually visible so later calibration can
   group them rather than double-count them.
3. Classify the tier (`lite`, `standard`, `deep`) and the docs-only
   exemption in shadow. Record both the recommendation **and** the route
   actually taken, so the two can be compared later without re-running
   anything.
4. Prove the shadow boundary: with the recommendation set to every tier
   in turn, the verification that actually runs is identical, and close
   behaves identically. A recommendation that changed an outcome would be
   a defect in this set, not a feature.
5. Prove the negative case that gives this set its purpose: an ordinary
   change cannot satisfy pre-verification G0 with a full-suite run, while
   both repository-wide exceptions remain available and auditable.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** the deterministic risk score with per-signal provenance,
shadow tier and docs-only classification, the shadow-boundary proof.
Est. 3 new Python tests.

---

## Acceptance criterion for the set

Every risk point traces to a named deterministic fact, and the score is a
pure function of those facts. Unsupported G0 controls are visible as
`not_applicable` or `unknown` and never as `pass`. No exemption and no
tier recommendation changes production behaviour: with the recommendation
forced to each tier in turn, the verification that runs and the close
that follows are identical.

A normal change **cannot** satisfy pre-verification G0 with a full-suite
run. The two repository-wide exceptions still work, each records which
one applied, and an operator override without a reason is refused. The
`test_run_fresh` gate accepts only `final-full` records, still launches
nothing itself, and a `preverify-targeted` record can never satisfy it.

The generated orchestrator instructions name the targeted command before
verification and the full-suite command only after the final verified
tree — and sessions 2 and 3 of this set ran that way themselves.

## Test budget

Set 141 leaves 37 slots against the 480 ceiling. This set spends at most
**10** (4–5, 3, 3), leaving 27 for sets 143–145. The selector has many
inputs and few behaviours: one test per selection *reason*, not one per
path shape. The refusal has exactly three behaviours worth covering —
ordinary change refused, selector-proves-all-affected permitted, operator
override with reason permitted and without reason refused.
