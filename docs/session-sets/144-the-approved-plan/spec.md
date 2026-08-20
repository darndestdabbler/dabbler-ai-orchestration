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
> **Session Set:** `docs/session-sets/144-the-approved-plan/`
> **Created:** 2026-08-19
> **Revised:** 2026-08-19 — rewritten for the plan-first, step-wise design;
> resequenced after the language-neutrality set.
> **Workflow:** Full
> **Baseline commit:** `fa3c28c7`, plus sets 142 and 143.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-144-approved-plan`. **Not** developed on
> `master`.
> **Prerequisite:** sets 142 and 143 complete. 143 runs first on purpose:
> the evidence-contract vocabulary is frozen at v1 the moment it is hashed,
> and it must not be written around changed-line coverage that 143 removes.

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
step whose reviewer in set 145 can lean on results the framework executed
rather than on the author's word — which makes the plan review the only
thing standing between a weak criterion and a review with nothing behind it.
That is why session 2 spends its whole budget on judging proofs.

## What the plan contains, and how much of it

The plan carries the session's **own** steps and nothing else. Register,
the affected-test run, cross-provider verification, the run of record,
close-out and the documentation pass that follows it are the lifecycle, not
the work: they have no file envelope, no
evidence of their own to declare, and no diff for set 145 to review. Keeping
them out is structural rather than a flag — a step kind a supervisor sets is
a step kind a supervisor sets wrong, and a ceremony step that never enters
the plan cannot be opened, reviewed, or committed as one. The activity log
goes on seeding them for human-visible progress, which is the job it is good
at.

**A session declares at most seven such steps.** The bound is the schema's,
so it is refused at write time and no model is ever asked to count. Seven is
deliberately generous: every session pays the same fixed ceremony — register,
the affected-test run, cross-provider verification, the run of record,
close-out, documentation — and a tight cap does not remove that toll, it
makes the session
pay it more often. The bound is here to keep step-level review cost from
growing without limit, not to force decomposition. The sets planned so far sit between
three and six.

## What this set does NOT do (do not reopen)

- **No execution.** Nothing here runs a step or commits anything. The plan
  is written, checked, approved, and hashed; set 145 executes it.
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
   is invalid — the schema, not a reviewer, refuses it. So is a session
   declaring more than seven steps: the plan holds the session's own work
   only, never the lifecycle steps around it.
3. Give sessions and steps one **authored** slug each, so a single name
   addresses a step in `spec.md`, in `activity-log.json`, and as the plan's
   `step_id` — rather than three naming schemes that agree by accident. Sets
   already carry one in their directory name; a session declares its own in
   its heading and a step declares its own inline, and `parse_session_plans`
   and `parse_step_texts` read them. `plan_step_key`'s six-word truncation
   stays as the fallback for a spec that declares none, so every existing
   spec seeds exactly as it does today. The number remains the stable
   address and the slug is the readable label: `[a-z0-9-]`, unique within
   its session, short, and refused at write time like every other malformed
   field.
4. Write the plan through the machine-owned writers set 141 built: validate
   against the schema, then atomic replace. Hand-written or malformed plans
   fail closed, as every other artifact under the run directory does.
5. Hash the plan at approval and bind the hash into the record. After
   approval the plan is immutable: the only legal change is an appended
   amendment, and any edit that is not an appended amendment is detected on
   the next read rather than tolerated.
6. Derive risk flags mechanically from the file envelope and the repository
   manifest — public interface, integration module, sensitive path,
   dependency change. A supervisor does not declare its own risk.
7. Affected tests, recorded as the `preverify-targeted` evidence.
8. Cross-provider verification; then the full suite once, against the
   final verified tree.
9. Close-out.

**Creates:** `approved-plan.schema.json`, the machine-owned plan writer,
authored slugs as the one step identity, approval hashing, derived risk
flags. Est. 8 Python tests.

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
6. Affected tests, recorded as the `preverify-targeted` evidence.
7. Cross-provider verification; then the full suite once, against the
   final verified tree.
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
6. Affected tests, recorded as the `preverify-targeted` evidence.
7. Cross-provider verification; then the full suite once, against the
   final verified tree.
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

One authored slug addresses a step everywhere it appears — the spec, the
activity log, and the plan's `step_id`. A spec that declares none still
seeds exactly as it does today, and the number is still the stable address.

The 136–141 replay is published with its counts, and the operator has the
amendment rate in hand before set 145 builds execution on top of it.

## Test budget

Set 142 spent 22 and set 143 returned 1, leaving **476**; this set adds
**18** (8, 7, 3), reaching 494 of the
605 envelope. Session 2 carries the largest allocation because the cheap
reviewer's judgment is the load-bearing joint of the whole design — the
one place where a weak criterion either gets caught or gets blessed.
