# Critique workers, managers, and dispositions

> **Purpose:** Third of five sets implementing the verification pipeline
> v3 plan, and the first that actually spends model budget on the new
> path. Sets 141 and 142 built artifacts and facts; this set executes
> bounded checks against them and records what the author did about each
> failure. Two constraints shape every step: a worker runs in a sandbox
> that **enforces** its authorized pulls rather than requesting them
> politely, and the current final-verdict path is untouched — unresolved
> blocking findings bridge into the existing dispute and adjudication
> machinery instead of opening a second channel to close.
> **Session Set:** `docs/session-sets/143-critique-workers-and-dispositions/`
> **Created:** 2026-08-19
> **Workflow:** Full
> **Plan of record:** `docs/verification-pipeline-v3-plan.md` (the
> Verification Pipeline Operationalization Plan, 2026-08-19), sections
> 4, 5.3, 7, and 10.
> **Baseline commit:** `8be18fb8` on `master`, plus sets 141 and 142.
> **Integration branch:** `experiment/verification-pipeline-v3`; child
> branch `verification-v3/set-143-workers`. **Not** developed on
> `master`.
> **Prerequisite:** sets 141 and 142 complete. Check IR v1 must be frozen
> and G0 facts must exist, because a worker with no deterministic floor
> beneath it is the expensive way to discover a lint error.

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

## The design checkpoint this set must not skip

`verify.py` is already 1,593 lines — the largest module in the router by
a wide margin. This set adds worker execution, manager authoring, IR
validation, and four disposition writers. Ground rule 1 forbids a new
module without deleting one; ground rule 8 says that when a module wants
to be twice its budget, the answer is to **reconsider the design**, not
to write a justification.

Session 1 therefore opens with an explicit checkpoint. The acceptable
outcomes are: the work fits the existing modules at a defensible size; or
a module is deleted or split so that the total count does not rise; or
the set stops and reports that the design does not fit. Growing
`verify.py` past 2,000 lines and calling it a target overrun is not one
of the outcomes.

## The three results, and nothing else

A worker returns exactly `pass`, `fail`, or `blocked`, validated against
that check's per-outcome evidence contract from set 141. Every report
carries an **engagement canary**; a canary failure invalidates the whole
report rather than becoming a finding, because a model that failed the
canary has not demonstrated it read anything.

`blocked` is a real, respectable outcome. The rule from set 141 stands
and this set is where it is tested under pressure: **a `blocked` result
may never become `pass` because the worker ran out of context or tools.**

## The four dispositions

For each failed check the author records exactly one:

- **`fix`** — link the patch and remediation tree, rerun affected tests
  and cheap G0 checks, then rerun **only** the failed or invalidated
  model checks. Not the whole check set.
- **`refute`** — a red-green test proof auto-closes the finding, and
  nothing weaker does. The test must fail against the pre-fix reviewed
  tree, pass against the remediation tree, and target the cited
  behaviour. A merely-new passing test proves nothing. Where replay is
  impossible or ambiguous, the refute routes to semantic adjudication.
- **`accept`** — severity, defect class, and ticket are all mandatory,
  and **independent triage happens before the finding enters CPCF**. An
  accepted finding that nobody else confirmed is a self-issued licence.
- **`escalate`** — invoke the manager path explicitly.

The six defect classes are fixed: `safety-data-loss`, `boundary-auth`,
`contract-compatibility`, `logic-state`, `reliability-performance`,
`maintainability-test`. Safety/data-loss, boundary/auth, and exposed
contract findings are **designated classes**: accepting rather than
fixing one requires human approval.

## What this set does NOT do (do not reopen)

- **No second final-verdict channel.** Manager check adjudication may
  resolve worker semantics, but only the existing verified, adjudicated,
  or human-waived ledger path unblocks close. Reuse the dispute and
  adjudication machinery set 136 shipped.
- **Shadow mode still cannot block close.** Everything this set adds is
  recorded, not enforced. Enforcement is set 145's decision, and only if
  its evidence gates pass.
- **Deep routing is an explicit experiment, never default.** It must
  preflight role feasibility against the refreshed catalog and must never
  silently collapse two required vendor families into one. If provider
  diversity is unavailable, report `blocked` or require a human — do not
  weaken the constraint to get a result.
- **No new IR operator on demand.** The v1 operator set is frozen. A
  check that repeatedly needs a new operator is evidence that it belongs
  in code, and the correct response is a candidate executable record.
- **No prompt-level scope.** Authorized pulls are enforced by the
  execution environment. A check that can read a path it did not declare
  has failed this set's acceptance criterion regardless of what it found.
- **No new playbook.** This set parameterizes one existing standing
  playbook into IR. Admission of new playbooks is set 145's probation
  machinery, and admitting one to demonstrate the mechanism is
  explicitly forbidden there.

---

## Sessions

### Session 1 of 3: One check, one sandboxed worker, and enforced pulls

1. Register.
2. Run the design checkpoint above before writing code: state where
   worker execution, IR validation, and disposition writing will live,
   with their expected sizes. If they do not fit the existing modules at
   a defensible size, stop and report rather than growing `verify.py`
   past 2,000 lines.
3. Parameterize **one** of the three standing playbooks into check IR v1,
   and treat the exercise as a test of the schema: an operator the
   playbook needs and the frozen IR lacks is a finding about the
   playbook's suitability, not a licence to extend the schema.
4. Execute one worker in a process or tool sandbox that **enforces**
   authorized pulls. An attempt to read outside the declared paths fails
   the check with a named refusal; it does not warn and continue. Enforce
   the resource bounds — file count, bytes, timeout — in the same layer.
5. Validate the returned report against its contract: the engagement
   canary first (a canary failure invalidates the entire report), then
   positive evidence through set 141's quote verifier, then negative
   evidence through the framework's own re-executed search, then the
   `blocked` shape.
6. Cross-provider verification.
7. Affected tests before verification; the full suite once, after.
8. Close-out.

**Creates:** one playbook in IR, the sandboxed worker executor with
enforced pulls and bounds, report validation including the canary. Est.
5 new Python tests.

### Session 2 of 3: Manager authoring, bounce-once, and the deep experiment

1. Register.
2. Add standard manager authoring: a manager proposes checks in IR, and
   invalid IR **bounces exactly once** with the validation error. A
   second invalid attempt is a terminal failure for that check, not a
   third try — an unbounded repair loop is how a review becomes an
   expense.
3. Add opt-in deep two-manager authoring with provider-role feasibility
   preflight against the refreshed seat catalog. Each manager may
   adjudicate the other's authored checks; **neither adjudicates its own
   contested check.** If the catalog cannot supply two distinct vendor
   families, report `blocked` — never collapse the roles.
4. Route framework-executable manager output to a **candidate executable
   record** rather than to a worker. Compilation, tests, lint, schema
   validation, exact AST queries, and arithmetic are not model work; a
   manager that proposes them is proposing code, and the record says so.
5. Cross-provider verification.
6. Affected tests before verification; the full suite once, after.
7. Close-out.

**Creates:** manager authoring, bounce-once IR validation, deep
two-manager preflight, the candidate executable record. Est. 4 new
Python tests.

### Session 3 of 3: The four dispositions, red-green, and the bridge

1. Register.
2. Add the `fix`, `refute`, `accept`, and `escalate` disposition writers,
   appending to `dispositions.jsonl` under the frozen schema. Exactly one
   disposition per failed check; a second is refused rather than
   overwriting the first.
3. Implement the red-green short-circuit for `refute`: the cited test
   must fail against the pre-fix reviewed tree and pass against the
   remediation tree. Anything less routes to semantic adjudication rather
   than auto-closing. Where replay is impossible, say so and route — do
   not approximate.
4. Enforce the `accept` requirements: severity, defect class, and ticket
   are mandatory, independent triage precedes CPCF entry, and a
   designated-class acceptance requires recorded human approval. An
   accept missing any of these is refused at the writer.
5. Make `fix` rerun the right things: affected tests plus cheap G0
   checks, then only the failed or invalidated model checks. Prove that a
   fix does not silently re-widen the check set.
6. Bridge unresolved blocking findings into the existing dispute and
   adjudication path, and prove the bridge is one-way: the new pipeline
   can raise a dispute, and only the existing verified, adjudicated, or
   human-waived ledger path can unblock close.
7. Cross-provider verification.
8. Affected tests before verification; the full suite once, after.
9. Close-out, and the end-of-set `change-log.md`.

**Creates:** four disposition writers, red-green replay, triage and
designated-class enforcement, the dispute bridge. Est. 4 new Python
tests.

---

## Acceptance criterion for the set

A seeded failing check can be fixed, refuted, accepted, or escalated, and
each path leaves an honest immutable record: one disposition per failed
check, a linked remediation attempt rather than a rewritten one, and no
route by which a record can be improved after the fact.

The worker sandbox refuses a read outside the declared authorized pulls,
by name and at the environment layer — not by the check declining to look.
A report whose engagement canary failed is discarded whole and produces
no finding. A `blocked` result stays `blocked`; there is no code path
that converts it to `pass` on context exhaustion.

A `refute` auto-closes only on red-green proof against both trees, and an
`accept` without severity, defect class, ticket, and independent triage
is refused at the writer. A designated-class accept without recorded
human approval is refused.

Shadow mode still cannot block close: with every new artifact present and
findings unresolved, `session close` behaves exactly as it did at
`8be18fb8`. The only channel that unblocks close is the existing one.

## Test budget

Sets 141–142 leave 27 slots against the 480 ceiling. This set spends at
most **13** (5, 4, 4), the largest allocation of the five, leaving 14 for
sets 144 and 145. The sandbox is one behaviour (an undeclared read is
refused), not one per path shape; the canary is one behaviour; each
disposition is one behaviour plus its refusal. If session 1's checkpoint
forces a design change, re-estimate before session 2 rather than
absorbing the difference silently.
