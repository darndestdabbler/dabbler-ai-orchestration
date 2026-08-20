# Counterfactual Process for 144-01 Under Sets 145-147

## Scope and source status

This is an interpretation of the process specified by the not-yet-implemented
Sets 145-147, applied to the work of session 144-01. It is not part of the
as-run capture and does not claim these events occurred.

The directory order is treated as authoritative:

1. `docs/session-sets/145-step-execution/spec.md`
2. `docs/session-sets/146-measure-then-enable/spec.md`
3. `docs/session-sets/147-session-walkthroughs/spec.md`

The latter two specs contain stale internal identities: the Set 146 file calls
itself `145-measure-then-enable`, and the Set 147 file calls itself
`146-session-walkthroughs`. The process below refers to them by directory
number.

## Enablement condition

Set 146 does not predeclare that the new path wins. It runs the current and
plan-first designs on the same corpus and makes the new path selectable only
if it is measurably cheaper at no worse recall. Therefore two counterfactual
outcomes exist:

- **Enabled outcome:** an operator explicitly selects the plan-first path;
  the step process below governs the session.
- **Shadow outcome:** the current session-level process remains authoritative;
  the plan-first path records a comparison in shadow and cannot decide the
  session.

The unexecuted Set 146 corpus report is the named artifact that would choose
between them. Nothing currently in the repository determines its result.

## Enabled outcome: session 144-01

### 1. Registration and plan construction

1. The framework registers session 144-01 and seeds human-visible activity
   rows.
2. The framework also inserts the Set 147 walkthrough row immediately before
   close-out. This row is framework-written; the set spec does not need to
   remember it.
3. The supervisor creates a machine-owned plan before implementation. For the
   work described by 144-01, the plan would contain the five non-lifecycle
   work steps from the specification:
   - define the approved-plan schema;
   - add authored session/step slugs;
   - add machine-owned plan writers;
   - bind approval hashing and immutability;
   - derive risk flags.
4. Each step declares an intent, file envelope, and non-empty deterministic
   or judgment evidence contract. The test files required by deterministic
   evidence must be in the envelope; otherwise writing them would require an
   amendment.
5. The framework derives risk rather than accepting it from the supervisor.
   Envelopes containing top-level `ai_router/*.py` modules would acquire
   `public-interface`; the schema path would acquire `sensitive-path`. The
   exact flag-to-step assignment depends on envelopes that do not exist in
   the as-run trace.

### 2. Plan approval

1. Free checks verify goal coverage, non-empty envelopes, non-empty evidence,
   and mechanically derived risk.
2. A cheap model reviews each step against fixed checklist text, principally
   asking whether its evidence would establish the intent.
3. Any high-risk step goes to premium review. A cheap-review objection must be
   answered by changing the objected-to fields; an unchanged resubmission
   bounces without another model call.
4. Two rejected revisions escalate to the premium model or human.
5. Once accepted, the framework hashes the plan. Later changes may only be
   append-only amendments carrying added files or replacement evidence.

### 3. Step execution loop

For each of the five approved work steps, one at a time:

```text
open step
  -> edit uncommitted working tree
  -> compare changed paths with this step's effective envelope
  -> run declared deterministic evidence and selected tests
  -> run one cheap model check on this step's diff, evidence, and paths
  -> fix (maximum two attempts), disprove, or escalate if a problem exists
  -> framework marks the step complete and commits it
```

Specific consequences:

- A write outside the active envelope stops the step and requires an
  amendment. Only the amended step returns through plan checks.
- A red deterministic result returns before model spend.
- Every step receives a model check; deterministic green evidence reduces
  context but does not create a skip.
- A provenance finding may be disproved by a framework-verified quote. A
  behavioral finding needs a red-green test or escalation; a merely passing
  new test is insufficient.
- Fix receives two attempts before escalation.
- Manual commits while a step is open are refused. The framework commits only
  after evidence is satisfied, naming the step and outcome.
- No step commit is pushed. Push remains a single session-boundary action.

Instead of the as-run single implementation commit `1fc6b6c6`, the final Git
history would contain approximately five framework-authored step commits.
The exact number could differ if the approved plan combined or split the work
within its seven-step maximum.

### 4. Session-level completion

1. After the last step commit, session-level verification resolves its
   round-1 baseline to the session start ref, not `HEAD`. It therefore sees
   the cumulative session even though the working tree is clean.
2. Cross-provider verification remains mandatory and uses the existing
   remediation, dispute, adjudication, and waiver machinery. Step checks do
   not replace it.
3. The full suite runs once against the final verified tree and records a
   `final-full` digest.
4. If the full suite fails, the framework bisects the range of step commits
   and reports a candidate range. It does not identify a culprit because the
   failure may be an interaction among steps.
5. Set 146 accounting records input, cached input, cache-write, and output
   tokens separately for step and session-level review. It also records plan
   ceremony, amendments, recall, and completeness misses.
6. A late defect becomes an executable test or lint rule when expressible.
   Prose is admitted only under Set 146's recurrence/replay rule.

### 5. Walkthrough and close

1. Before close, `session walkthrough` creates
   `session-1-walkthrough.md`.
2. Its managed fence is generated from session state and activity records:
   orchestrator identity/provenance, verifier provider, transport, round
   count, ordered timestamped steps, exact router commands, and a relative
   link to `.dabbler/runs/144-the-approved-plan/s1/`.
3. The authored region records what was built, why the obvious alternative
   was rejected, and what to read next.
4. The walkthrough contains no verdict token. Re-running the command updates
   only the managed fence and preserves authored prose.
5. The extension projection reports walkthrough existence; the session row
   exposes an open action after the file exists.
6. The work is pushed once, the existing five gates run, and close commits
   and pushes lifecycle bookkeeping.

## Shadow outcome

If Set 146's comparison did not establish lower cost at no worse recall, the
authoritative path for 144-01 would remain the as-run session-level process:

1. edit the whole session in one working tree;
2. run selected tests;
3. run mandatory session verification and its remediation/adjudication loop;
4. run the final full suite;
5. commit, push, and close.

The approved plan and per-step machinery would record shadow results for the
same work but would not block, commit, or clear the session. Set 147's
walkthrough is independent of enablement and would still add the walkthrough
row, file, projection field, and session-row action.

## Points the forward specs leave unresolved for this counterfactual

| Question | Why it remains conditional |
| --- | --- |
| Was plan-first authoritative or shadow-only? | Set 146's paired corpus measurement has not run. |
| How many approved steps represented 144-01? | The future supervisor-authored plan is absent; five is the direct reading of work steps 2-6. |
| Which exact files belonged to each step envelope? | No counterfactual `approved-plan.json` exists. |
| Which steps triggered premium review? | Risk derives from those absent envelopes. Top-level router modules and the schema imply risk, but assignment is unknown. |
| How many fix iterations occurred at step level? | The as-run session has only a cumulative final commit and missing raw rounds. |
| Would the round-3 unclosed-slug finding have been caught earlier? | The future step evidence contracts and step-check output do not exist. |
| Is the Set 147 walkthrough row part of the approved plan? | Set 147 calls it a plan step, while Set 144 excludes lifecycle/documentation ceremony from `approved-plan.json`; its schema has no evidence/envelope for this framework-written row. The consistent executable reading is an activity-log row outside the approved-plan artifact, but the text does not state that explicitly. |
