# Rolling Task List and In-Session Progress Visibility Spec

> **Purpose:** Finish the step-level progress surface. `session_checklist`
> shipped in Set 111 S4 and renders logged steps on demand; this set makes
> posting it **observable and enforced**, makes it show what is **coming**
> and not only what is done, puts it in the **Work Explorer** the operator
> already has open, and **defines** the cadence that Step 4 currently
> leaves to taste. The evidence basis and the four gaps are canonical in
> [`docs/proposals/2026-08-09-set-114-rolling-task-list.md`](../../proposals/2026-08-09-set-114-rolling-task-list.md)
> — **read it before Session 1; this spec executes it.**
> **Created:** 2026-08-09
> **Prerequisites:** Set 112 complete.
> **Session Set:** `docs/session-sets/114-rolling-task-list-and-progress-visibility/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # Session 3 puts steps in the Work Explorer; whether that is legible at a glance is an eyes question, not a diff question.
requiresE2E: true         # Session 3 touches the Explorer rendering surface, which the test policy names as a non-negotiable Layer 3 trigger.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 112-remove-lightweight-tier
    condition: complete
```

---

## Decisions already made — do not reopen

1. **The renderer keeps its one rule: render the record.** Set 111 S4
   decided against synthesizing plan rows at render time, because a
   checklist that disagrees with `activity-log.json` undermines the file
   close-out gates on. That decision **stands**. The forward view is
   achieved by writing the plan **into the ledger** at session start, not
   by teaching the renderer to invent rows.
2. **The ledger stays append-only.** Steps are collapsed by `stepKey` at
   render time, never rewritten on disk.
3. **Make the renderer the recorder.** A close gate cannot see a chat
   window, so producing the checklist must be what records that it was
   produced. Anything that asks the orchestrator to *separately* attest it
   posted the checklist is self-reported and will decay exactly as the
   prose obligation did.
4. **`session_checklist`'s existing CLI surface is not broken.** Plain,
   `--markdown` and `--verbose` keep working for consumer repos.

## Non-goals

- **No redesign of `activity-log.json`.** Its shape is load-bearing for
  close-out; this set adds entries, not a schema.
- **No new progress concept in `session-state.json`.** The state file owns
  set/session progress; steps live in the activity log.
- **No cost/metrics surfacing.** Different question, different set.

---

## Sessions

### Session 1 of 3: Make posting observable, then enforce it

**Steps:**

1. Register. Read the proposal, especially why a self-reported attestation
   is not acceptable here.
2. **Make the renderer record.** Rendering the checklist writes a durable,
   timestamped record (session number, step count, which step was `<- here`).
   Decide where it lives — an activity-log entry kind, or a sibling ledger —
   and state the reason, including the freshness consequence: whatever is
   chosen must NOT stale a verification evidence stamp, or the fix will
   itself become a reason to avoid posting (Set 111 S4 hit exactly that with
   `cite_lessons`).
3. **Define the cadence** in `session-constitution.md` Step 4 and the
   authoring guide: name the transitions that owe a post (session start,
   before/after a long-running command, at every operator stop, after
   verification, before close) so it is checkable rather than tasteful.
4. **Gate it.** A close check that compares posts against the transitions
   the record shows, with a remediation message that names the missing
   posts. Test the refusal, not just the pass.
5. Full pytest at close after freeze; verify, close.

**Creates:** the post record, the cadence definition, the close gate
**Touches:** `ai_router/session_checklist.py`, `ai_router/gate_checks.py`, `docs/session-constitution.md`, `docs/planning/session-set-authoring-guide.md`
**Ends with:** a session that never posted its checklist cannot close quietly.
**Progress keys:** `postRecord`, `cadenceDefined`, `checklistGate`

---

### Session 2 of 3: The forward half — a plan in the ledger

**Steps:**

1. Register.
2. **Seed the plan at session start.** `start_session` writes the session's
   spec steps into `activity-log.json` as `pending` entries with stable
   `stepKey`s. `ai_router.spec_admission` already parses those step lists to
   enforce the size cap — reuse it rather than writing a second parser
   (L-069-1: the duplicate-parser bug is this repo's most repeated defect).
3. **Reconcile plan against reality.** A step the orchestrator logs that the
   plan did not predict must appear; a planned step never executed must
   remain visibly `[ ]`. Neither may be silently dropped, and the collapse
   rule must not let a real step overwrite a planned one out of order.
4. **Handle the messy cases with tests:** a spec with no parseable steps, a
   session whose plan changed mid-flight, a re-registered session, and a
   consumer repo whose specs predate the format.
5. Full pytest at close after freeze; verify, close.

**Creates:** plan seeding in `start_session`, the reconciliation rule
**Touches:** `ai_router/start_session.py`, `ai_router/session_checklist.py`, `ai_router/spec_admission.py`
**Ends with:** the checklist shows what is coming, sourced from the record rather than invented at render time.
**Progress keys:** `planSeeded`, `reconciliation`, `edgeCases`

---

### Session 3 of 3: The surface the operator already has open

**Steps:**

1. Register.
2. **Work Explorer expansion:** an in-flight session node expands to show
   its steps, with the same status glyphs and the current step marked. This
   is the half Set 111 S4 recorded and deliberately did not build.
3. **Keep it honest under refresh:** the tree reflects the ledger as it
   changes during a session, and an unreadable or absent activity log
   degrades to no children rather than to a stale or invented list.
4. **Walk it.** Full Layer 3 after freeze (this session touches the
   rendering surface), then the UAT walk. **If Set 113 has landed, use the
   narrated-video format** — Set 111 S4's walk was waived because the old
   format is not worth the operator's time, and repeating it here would
   reproduce that outcome.
5. Verify, close. `change-log.md`, Step 9 review, advisory path-aware
   critique.

**Creates:** the tree expansion, this set's walk, `change-log.md`
**Touches:** `tools/dabbler-ai-orchestration/src/`, Layer 3 specs
**Ends with:** in-session progress is visible where the operator is already looking, and has been judged by eye.
**Progress keys:** `treeExpansion`, `refreshHonesty`, `walkDone`

---

## End-of-set deliverables

- Posting the checklist is recorded by the act of rendering it, and a close
  gate refuses a session that skipped its transitions.
- A named, checkable cadence in the constitution and the authoring guide.
- The session plan seeded into the ledger at start, so the checklist shows
  pending work without the renderer inventing anything.
- The Work Explorer renders an in-flight session's steps.
- A walked (not waived) UAT judgment on the result.

## Risks this set should expect

- **The gate can be gamed by posting mechanically.** A post record proves a
  render happened, not that a human saw it. That is an acceptable floor —
  it converts an invisible omission into a visible one — but the spec
  should not claim more than that.
- **Seeding the plan reverses a recorded decision.** Do it the way the
  original reasoning allows (write the plan into the record) rather than by
  overruling it, and say so in the change log.
- **Freshness interaction.** New writes during a session can stale a
  verification evidence stamp. Set 111 S4 lost a round to exactly this with
  `cite_lessons`; Session 1 must settle it deliberately, not discover it at
  close.
- **Noise.** A checklist posted too often is scrolled past like any other
  banner. The cadence should be the smallest set of moments that answer
  "where is this session", not every step.
