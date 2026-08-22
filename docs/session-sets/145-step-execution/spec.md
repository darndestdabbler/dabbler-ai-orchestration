# Step execution: narrow context, deterministic first, one commit per step

> **Purpose:** Execute the approved plan one step at a time, with the
> smallest context that can answer the step's own question. This is where
> the cost saving actually comes from — not from cheaper models, but from a
> checker that reads one step's diff instead of the whole session bundle.
> Deterministic tools run first and free; a model is invoked only for the
> evidence a model has to judge; and the framework, not the author, decides
> what changed by committing each step itself.
> **Session Set:** `docs/session-sets/145-step-execution/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design;
> the skip path struck after set 144.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus sets 142–144.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-145-step-execution`. **Not** developed on
> `master`.
> **Prerequisite:** sets 142, 143, and 144 complete. There is nothing to
> execute without an approved plan.

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

**The framework commits. It never pushes.** Pushing is a session-boundary
act, once, at close. CI (`.github/workflows/test.yml`) runs a two-job
Windows matrix on `push` to `master` and on `pull_request` against it, so
a per-step push against an open PR would buy one full CI run per step for
work that is not finished. On this experiment branch with no PR open,
pushes do not trigger CI at all — which makes the policy free to adopt now
and expensive to retrofit later. The `pushed_to_remote` close gate already
expects the push at close and checks nothing before it.

One residual remains and session 3 pays it: after N step commits, the
session-level cross-provider verification sees an empty working tree, so
its round-1 baseline must resolve to the session's start ref rather than
`HEAD`. That is one change to baseline resolution — not a rewrite.

## Every step is reviewed, and what that buys instead

An earlier draft let a step skip its model check when every evidence item
was `deterministic` and green, policed by a changed-line coverage gate. Set
144 struck both. The saving was real but so was the attack surface: the
first two conditions are author-declared, so the coverage gate existed only
to stop an author buying an unreviewed change with weak criteria. Removing
the exemption removes the thing that had to be policed, and the coverage
machinery leaves with it.

**Every step gets its model check.** The saving in this design was never
skipping — it is *context*. A checker that reads one step's diff, its
evidence contract, and its authorized paths is answering a small question,
and a cheap model answers it. That is where the cost falls, and it survives
intact.

Note what this does *not* cost. Review spend is not a function of step
count: the diff is partitioned across steps, not duplicated, so seven
step-sized reviews come to roughly one session-sized review plus a constant
per call. Losing the skip costs exactly the reviews of the steps that would
have skipped — the all-deterministic, all-green ones — and nothing else.

The consequence that does bite is that nothing mechanical judges whether a
test is any good, so the reviewer's fixed checklist must ask it — *would
this evidence actually tell us the step worked* — as a question put to a
model, not a subsystem. Set 144's seven-step cap and file envelope still
matter here, but for their own reasons: the cap bounds what the plan
reviewer holds in view at approval, and the envelope is what the mechanical
outside-the-plan test compares against.

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
   it is not, exactly one at a time, and the record says which. Only the
   session's own steps are in the plan — set 144 keeps register,
   verification, the run of record, and close-out out of it — so there is no
   ceremony step to open an envelope for, review, or commit an empty diff
   against.
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
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.
10. Technical/educational documentation.

**Creates:** step open/close, envelope enforcement, the deterministic
pass, the manual-commit refusal. Est. 7 Python tests.

### Session 2 of 3: The step's model check, in the narrowest context

1. Register.
2. Build the step check as a narrow context: the step's diff, its evidence
   contract, and the authorized paths it may read — not the session bundle.
   Reuse set 141's check IR for the shape and its evidence verifier for the
   answers, so a `judgment` item arrives as a bounded check with a real
   evidence contract rather than an open question. Every step is checked;
   there is no skip to decide.
3. Put the evidence question in the fixed checklist — *would this evidence
   actually tell us the step worked* — so the reviewer judges the proof as
   well as the diff. Nothing mechanical asks this once coverage is gone.
4. Implement fix / disprove / escalate as the only three responses, with
   the two-attempt bound on fix and the red-green rule on disprove.
5. Have the framework commit the step once its evidence is satisfied, with
   a message naming the step and its evidence outcome. The author never
   commits, and **nothing pushes** — the push is one act at close.
   Writing the step record is the framework's job here too: the step is
   marked complete by the code that committed it, not by an agent
   remembering to log it afterwards. `start_session` already sets this
   precedent for the `register` step, and this is the same move for the
   rest of them.
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out.
10. Technical/educational documentation.

**Creates:** the narrow step check, the evidence question, the three
responses, framework-owned commits. Est. 7 Python tests.

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
6. Affected tests as preverify.
7. Cross-provider verification.
8. Full test suite, recorded as the `final-full` run of record.
9. Close-out, and the end-of-set `change-log.md`.
10. Technical/educational documentation.

**Creates:** session-start baseline resolution, the bisect report, the
`verify.py` extraction. Est. 5 Python tests.

---

## Acceptance criterion for the set

A step executes against its approved envelope, and a write outside that
envelope is refused rather than warned about. Deterministic evidence runs
before any model spend, and a red result returns to the author.

**Every step gets its model check**, because there is no skip to grant and
therefore nothing to police. An evidence contract that is all-deterministic
and all-green buys a cheaper review, not an absent one.

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

Sets 142–144 leave the count at **531**; session 1 spent **16** against a
forecast of 7, putting the suite at **547** of the 605 envelope. Sessions 2
and 3 forecast 7 and 5. Session 2 is the largest remaining allocation
because the step check is what every step's review rests on, and its
distinct outcomes — fix, disprove, escalate, and the two-attempt bound on
fix — each need their own test.

**Read the forecast as a floor.** Across 142–144 the estimates ran roughly
a third of actual spend, and session 1 of this set repeated it. Fifty-eight
slots remain against the 605 ceiling; they are the margin for being wrong,
not budget to spend down.
