# Step execution: narrow context, deterministic first, one commit per step

> **Purpose:** Execute the approved plan one step at a time, with the
> smallest context that can answer the step's own question. This is where
> the cost saving actually comes from — not from cheaper models, but from a
> checker that reads one step's diff instead of the whole session bundle.
> Deterministic tools run first and free; a model is invoked only for the
> evidence a model has to judge; and the framework, not the author, decides
> what changed by committing each step itself.
> **Session Set:** `docs/session-sets/144-step-execution/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus sets 142 and 143.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-144-step-execution`. **Not** developed on
> `master`.
> **Prerequisite:** sets 142 and 143 complete. There is nothing to execute
> without an approved plan, and no way to skip a model check without
> changed-line coverage.

> **Note on rule 6:** operator-authorized exception, as sets 136–143.

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

## The commit sequence, and why it is this way round

The obvious reading of "each step becomes its own commit" breaks the
existing verifier. `verify` builds its round-1 evidence as `git diff HEAD`
plus untracked contents and refuses an empty bundle outright; rounds ≥2
diff a snapshotted tree against the working tree. Commit as you go and the
working tree equals `HEAD` at verification time, so `verify` correctly
reports that there is nothing to review.

The sequence that keeps both properties:

```text
begin step -> edit, uncommitted -> deterministic checks -> residual model check
           -> framework commits the step
```

The framework commits **after** the step's evidence is satisfied, never
before. A manual commit while a step is open is refused. This preserves
one-commit-per-step for localization *and* preserves the working-tree-vs-
`HEAD` model that the whole verifier is built on, so nothing in the
fix-delta or adjudication paths has to be rewritten.

One residual remains and session 3 pays it: after N step commits, the
session-level cross-provider verification sees an empty working tree, so
its round-1 baseline must resolve to the session's start ref rather than
`HEAD`. That is one change to baseline resolution — not a rewrite.

## When a model is not called, and the gate that makes that safe

If every item in the step's evidence contract is `deterministic` and every
one of them ran green, **no model reads the diff.** That is the largest
saving in the design and also its largest risk, because a step could
declare only mechanically-checkable evidence and buy itself an unreviewed
change.

Set 143's plan review is the first defence. **Changed-line coverage is the
second, and it is the mechanical one:** a step may skip its model check
only if the selected tests actually executed every changed line. An
uncovered changed line forces the model check regardless of what the
evidence contract said. An author cannot buy silence by writing weak
criteria, because the criteria do not decide — the coverage does.

This is the single rule that makes the skip defensible. It is not
negotiable and it is not configurable off.

## Three responses to a problem, and nothing else

- **Fix** — two attempts, then escalate. A fix reruns the step's own
  evidence and the checks its change invalidated; it does not re-widen to
  the whole plan.
- **Disprove** — an exact framework-verified quote, or a red-green test
  that fails against the pre-fix tree and passes against the fixed tree
  while targeting the cited behavior. A merely-new passing test proves
  nothing, and a quote proves provenance rather than correctness, so a
  quote closes a *provenance* finding only.
- **Escalate** — to the expensive model or the human, explicitly.

Set 141's evidence verifier is what makes "no arguing" mechanical: quotes
are re-read from the reviewed tree by digest, re-hashed, and matched
against the enclosing AST node chain; absence searches are re-run by the
framework; `blocked` is terminal.

## What this set does NOT do (do not reopen)

- **No change to session-level verification.** Cross-provider verification
  at the end of the session stays mandatory, with no skip and no waiver.
  The step-level skip is a different granularity and never touches it.
- **No commit-range rewrite of the verifier.** Session 3 changes baseline
  resolution only.
- **No blame attribution.** Per-step commits make a final-suite failure
  *bisectable*; they do not identify which step is responsible, because a
  failure can arise from interaction between steps. Report the bisect, not
  a culprit.
- **No new final-verdict channel.** Unresolved blocking findings go to the
  existing dispute and adjudication path.

---

## Sessions

### Session 1 of 3: Envelope enforcement and the deterministic pass

1. Register.
2. Open and close a step against the approved plan: a step is in flight or
   it is not, exactly one at a time, and the record says which.
3. Enforce the file envelope mechanically. A write outside the step's
   declared paths is refused at the boundary and surfaces as an amendment
   requirement, not a warning. The framework compares the tree against the
   envelope; no model is asked whether it stayed inside its own plan.
4. Run the step's deterministic evidence first and free — compile,
   typecheck, lint, analyzers, and the step's own targeted tests from set
   142. A red deterministic result returns to the author before any model
   spend.
5. Refuse a manual commit while a step is open, with a message naming the
   step and the command that closes it.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** step open/close, envelope enforcement, the deterministic
pass, the manual-commit refusal. Est. 7 Python tests.

### Session 2 of 3: The residual model check, and the coverage gate

1. Register.
2. Implement the skip decision, in this order and no other: every evidence
   item is `deterministic`, **and** every one ran green, **and**
   changed-line coverage shows the selected tests executed every changed
   line. All three, or the model check runs. Record which condition forced
   the check when one did.
3. Build the residual check as a narrow context: the step's diff, its
   evidence contract, and the authorized paths it may read — not the
   session bundle. Reuse set 141's check IR for the shape and its evidence
   verifier for the answers, so a `judgment` item arrives as a bounded
   check with a real evidence contract rather than an open question.
4. Implement fix / disprove / escalate as the only three responses, with
   the two-attempt bound on fix and the red-green rule on disprove.
5. Have the framework commit the step once its evidence is satisfied, with
   a message naming the step and its evidence outcome. The author never
   commits.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** the coverage-gated skip, the narrow residual check, the three
responses, framework-owned commits. Est. 8 Python tests.

### Session 3 of 3: The end of the session

1. Register.
2. Resolve the session-level verification baseline to the session's start
   ref rather than `HEAD`, so cross-provider verification sees the whole
   session's work after every step has been committed. Round-1 assembly
   changes; the fix-delta and adjudication paths do not.
3. Run the full suite exactly once, after the final verified tree, as the
   `final-full` run of record from set 142, bound to that tree digest.
4. On a full-suite failure, report the bisect across the step commits and
   name the candidate range — not a culprit step. Interaction between
   steps is a real cause and the report must be able to say so.
5. Extract step execution out of `verify.py` into its own module and bring
   `verify.py` below 1,200 lines. The module count may rise; this is the
   set where the extraction has to land, because it is the last one that
   adds substantial execution code.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** session-start baseline resolution, the bisect report, the
`verify.py` extraction. Est. 5 Python tests.

---

## Acceptance criterion for the set

A step executes against its approved envelope, and a write outside that
envelope is refused rather than warned about. Deterministic evidence runs
before any model spend, and a red result returns to the author.

**A step skips its model check only when all three conditions hold** — all
evidence deterministic, all green, and every changed line covered. A step
with one uncovered changed line gets the model check no matter what its
evidence contract declared, and the record says the coverage forced it.

The residual check reads one step's diff and its authorized paths, not the
session bundle. Fix is bounded at two attempts; disprove requires a
framework-verified quote or a red-green pair; everything else escalates.

The framework commits each step after its evidence is satisfied, and a
manual commit during an open step is refused. Session-level cross-provider
verification still sees the whole session's work and is still mandatory.

The full suite runs once, at the end, bound to the final verified tree. A
failure produces a bisect range rather than an accusation.

`verify.py` is below 1,200 lines.

## Test budget

30 spent in sets 142–143; this set adds **20** (7, 8, 5), reaching 505 of
the 605 envelope. Session 2 is the largest allocation in the sequence
because the coverage gate is the rule the whole cost saving rests on, and
its failure modes — all-deterministic-and-green but uncovered,
covered-but-not-green, judgment-item-present — each need their own test.
