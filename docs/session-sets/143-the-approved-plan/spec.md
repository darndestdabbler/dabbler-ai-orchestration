# The approved plan, and proof locked before code

> **Purpose:** The move this whole rewrite turns on. Before any code
> exists, the supervisor writes down what each step will do, which files it
> may touch, and **what evidence will prove it was done correctly** — and
> that plan is approved, hashed, and made machine-owned before work
> begins. Locking the passing criteria up front is what stops anyone,
> author or checker, from bending the proof to fit whatever the code turned
> out to be. Reviewing a plan is also far cheaper than reviewing a diff: it
> is shorter, it is structured, and it is the last moment where a defect
> costs nothing to fix.
> **Session Set:** `docs/session-sets/143-the-approved-plan/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus set 142.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-143-approved-plan`. **Not** developed on
> `master`.
> **Prerequisite:** set 142 complete — the plan's evidence contracts refer
> to targeted test selection and changed-line coverage, which 142 builds.

> **Note on rule 6:** operator-authorized exception, as sets 136–142.

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

## Why the plan cannot live in `spec.md`

The repository already seeds plan rows: `seed_session_plan` parses the
spec's ordered lists into activity-log rows with a `stepKey` and a
`stepNumber`, and `session log` ticks them. That machinery is the right
shape and the wrong ownership. Two properties disqualify it as a proof
contract:

1. **`spec.md` is hand-editable**, and this repository's oldest rule is
   that nothing which decides an outcome may be hand-written.
2. **Seeding is one-shot by design** — *"Seed spec steps as plan rows —
   once per session, never re-applied. A spec edited mid-flight shows new
   work only when it is logged."* A spec edited after seeding silently
   diverges from the rows, which is exactly the drift a locked plan exists
   to prevent.

So the approved plan is a **new machine-owned artifact**, `approved-plan.json`,
written under the run directory by router code only, hashed at approval,
and amended append-only. The activity log keeps doing what it does well —
human-visible progress — and stops being asked to carry contractual weight.

## Why `review-claims.json` cannot carry it either

Set 141 froze `review-claims.schema.json` at v1, and it is the wrong
artifact for this job on three counts:

- **It has no evidence field.** A claim is a `claim_id`, a free-prose
  `statement`, and optional `kind`/`paths`. It records what the author
  *says*, not what would prove it.
- **It blesses saying nothing** — *"a change whose author claims nothing is
  a valid input"* — which is the exact inverse of pre-registration.
- **It is frozen shut.** `additionalProperties: false`, `schema_version`
  is `const: 1`, and a reader finding any other value refuses the record.

The resolution is not to bend v1. `review-claims` v1 stays exactly as it
is and keeps its job: the **step-completion claim** an author records about
work already done. The approved plan is a separate artifact with the
opposite default — **every step must declare its proof, and a step that
declares none is refused at approval.**

## What an approved step declares

- **Intent** — one sentence, imperative.
- **File envelope** — the paths it may create or modify. Nothing else.
- **Evidence contract** — what will prove it, each item marked
  `deterministic` (a test, compile, lint, or analyzer result the framework
  can execute) or `judgment` (needs a model to read something).
- **Risk flags** — derived, not declared: public interface, integration
  module, sensitive path, dependency change.

Evidence is the point. A step whose evidence is all `deterministic` is a
step no model will need to read in set 144 — which makes the plan review
the only thing standing between a weak criterion and an unreviewed change.
That is why session 2 spends its whole budget on judging proofs.

## What this set does NOT do (do not reopen)

- **No execution.** Nothing here runs a step or commits anything. The plan
  is written, checked, approved, and hashed; set 144 executes it.
- **No change to session-level verification.** Cross-provider verification
  remains mandatory with no skip. A plan is not a substitute for it.
- **No manager/worker hierarchy.** The old design's manager authoring,
  two-manager deep routing, and IR-bouncing negotiation are cut. A plan is
  reviewed once by a cheap model against a fixed checklist, with a bounded
  escalation — not negotiated between model roles.
- **No new severity or defect vocabulary.** `critical | major | minor`
  stands, as does the existing dispute and adjudication path.

---

## Sessions

### Session 1 of 3: The artifact, hashed and machine-owned

1. Register.
2. Define `approved-plan.schema.json` at v1: plan identity, per-step
   `step_id`, intent, file envelope, the evidence contract with each item
   typed `deterministic` or `judgment`, derived risk flags, and an
   append-only `amendments` array. A step with an empty evidence contract
   is invalid — the schema, not a reviewer, refuses it.
3. Write the plan through the machine-owned writers set 141 built: validate
   against the schema, then atomic replace. Hand-written or malformed plans
   fail closed, as every other artifact under the run directory does.
4. Hash the plan at approval and bind the hash into the record. After
   approval the plan is immutable: the only legal change is an appended
   amendment, and any edit that is not an appended amendment is detected on
   the next read rather than tolerated.
5. Derive risk flags mechanically from the file envelope and the repository
   manifest — public interface, integration module, sensitive path,
   dependency change. A supervisor does not declare its own risk.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** `approved-plan.schema.json`, the machine-owned plan writer,
approval hashing, derived risk flags. Est. 6 Python tests.

### Session 2 of 3: Checking the plan — free first, then cheap

1. Register.
2. Implement the free mechanical checks, which run before any model: does
   every session goal have at least one step; does every step declare an
   evidence contract; does every step declare a file envelope; do the
   envelopes collectively cover the goals; were risk flags derived. These
   are the dumb, valuable checks and they cost nothing.
3. Implement the cheap model review against a short fixed checklist,
   answering per step: **approve, amend, or send to a human**. Its
   assignment is the proof, not the prose — *would this evidence actually
   tell us the step worked?* — and the checklist is fixed text, not
   free-form critique.
4. Implement the anti-grind rules, mechanically: a revision that does not
   touch the fields the reviewer objected to **bounces automatically**
   without a model call, and after two rejected revisions the expensive
   model or the human takes over. A supervisor cannot resubmit its way to
   an approval.
5. Route to the expensive model only when a step carries a high risk flag,
   or when the cheap reviewer has objected twice. Record which trigger
   fired.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** the free plan checks, the cheap checklist review, the
auto-bounce and two-strike escalation, risk-triggered premium review.
Est. 7 Python tests.

### Session 3 of 3: Amendments, and the completeness question

1. Register.
2. Implement amendments: a new file outside the envelope, a new dependency,
   or a changed evidence criterion is a plan amendment. **Only the changed
   part** goes back through session 2's checks — re-approving an unchanged
   step is ceremony, and this design is trying to spend less of it.
3. Make the outside-the-plan test mechanical: the framework compares the
   working tree against the approved envelope and decides. There is no
   judgment call for a supervisor to exploit, and no model is asked whether
   it stayed inside its own plan.
4. Measure the completeness question this design cannot answer by
   construction: **pre-registration stops the proof from moving, but it
   does not prove the plan was complete.** Replay the activity logs and
   verification rounds of sets 136–141 and record, for each, whether the
   session's real file set would have needed an amendment, and whether each
   verification finding would have been caught by a declared proof. Publish
   the counts.
5. Act on what the replay says. A high amendment rate means the plan is
   paperwork rather than a constraint, and that is a finding for the
   operator — not something to absorb by loosening the envelope check.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out, and the end-of-set `change-log.md`.

**Creates:** the amendment flow, the mechanical envelope comparison, the
136–141 replay measurement. Est. 3 Python tests.

---

## Acceptance criterion for the set

A plan exists as a machine-owned, schema-validated, hashed artifact. A step
with no evidence contract cannot be written. After approval the plan is
immutable except by appended amendment, and an edit that is not an
amendment is detected on read.

The free checks run before any model is called. The cheap reviewer judges
proofs against a fixed checklist and answers approve / amend / human. A
revision that does not touch the objected-to fields bounces **without a
model call**, and two rejected revisions escalate. Premium review fires
only on derived high risk or repeated objection, and the record says which.

An amendment re-checks only the changed part.

The 136–141 replay is published with its counts, and the operator has the
amendment rate in hand before set 144 builds execution on top of it.

## Test budget

14 spent in set 142; this set adds **16** (6, 7, 3), reaching 485 of the
605 envelope. Session 2 carries the largest allocation because the cheap
reviewer's judgment is the load-bearing joint of the whole design — the
one place where a weak criterion either gets caught or gets blessed.
