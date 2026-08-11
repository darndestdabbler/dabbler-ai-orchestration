# Strict Writer and One Projection Spec

> **Purpose:** The step ledger renders wrong because the field it renders
> has no vocabulary. "Done" is spelled four ways across this repo's
> activity logs, prose has been written into a status field, and two
> independent implementations disagree about what an unrecognised token
> means. This set makes the writer strict, decides what to do about the
> history already on disk, and computes the progress projection **once**
> so there is only one answer to render.
>
> **Created:** 2026-08-11, from measurement.
> **Prerequisites:** Set 119 complete.
> **Session Set:** `docs/session-sets/120-strict-writer-and-one-projection/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Evidence:**
> [`docs/session-sets/115-work-explorer-session-node-ux/step-ledger-findings.md`](../115-work-explorer-session-node-ux/step-ledger-findings.md)
> carries the full diagnosis, the cross-provider review that produced it,
> and the architecture argument. This set is that document's §7
> prerequisites, executed.

---

## Session Set Configuration

```yaml
requiresUAT: false        # No rendering surface changes here. The deliverable is a validated vocabulary and a serialized projection — judged by tests and a diff, not by eyes. The Explorer consumes this in a later set.
requiresE2E: false        # Layer 3 is neither changed nor invoked.
uatStyle: ad-hoc
prerequisites:
  - slug: 119-close-preflight-and-doc-only-findings
    condition: complete
```

> **`pathAwareCritique` is deliberately absent** — the guide's default is
> `none`, and *"a set that declares nothing pays nothing."* This set adds
> a constraint, migrates data under an operator ruling, and ships a
> derived file. It removes no verification control.

---

## The measurements this set acts on

Measured 2026-08-11 across every `activity-log.json` in the repo.

**The step-status field has no vocabulary.** Distinct values found:

| token | count | |
| :--- | ---: | :--- |
| `complete` | 2,412 | canonical |
| **`completed`** | **229** | drift |
| `pending` | 45 | canonical |
| **`done`** | **42** | drift |
| `in-progress` | 31 | canonical |
| `None` | 4 | drift |
| `blocked` | 3 | |
| `skipped` | 1 | |
| **`complete-with-known-failures`** | 1 | drift |
| **multi-paragraph prose** | ~6 | one ~1,000 words; another a JSON array of routing costs |

`SessionLog.log_step` accepts arbitrary strings
(`ai_router/session_log.py:165`). **Roughly 10% of step entries carry a
token no reader recognises.**

**It has visible consequences.** Set 119 S1 wrote `complete` and rendered
correctly; S2 wrote `completed` and rendered as not-started with `<- here`
stranded on step 1. The marker was not misbehaving:
`session_checklist.py:393` selects the first non-terminal row, and with
steps 1–4 unparseable, step 1 *is* first.

**The two readers disagree.** Python renders an unknown token as `[?]`
(`session_checklist.py:145`); the tree maps it to `not-started`
(`sessionStepModel.ts:94`) under a comment claiming the two match. One
surfaces a data-quality error; the other conceals it. Set 115's
`operator-notes.md` records the consequence: Set 116 S3 *"typed the bad
status token itself, saw the `[?]` in the CLI output, and moved on."*

**And the derivation exists twice** — 1,680 lines of Python against 1,830
of TypeScript, guarded by 110 TS tests plus `test_step_row_parity.py`,
which exists only to check the two agree. A parity test is a tax on
duplication.

---

## Decisions already made — do not reopen

1. **Readers stay lenient; the writer is strict.** Set 086 S1 established this for verdict tokens after a confabulated non-verdict was persisted. This set applies the same pattern to step status. Readers must keep tolerating what they find on disk.
2. **The tree is not the authority.** Both surfaces read the same files; a sanctioned writer proves provenance and shape, not semantic truth. This set produces *one computed answer*, which is a different claim.
3. **No extension changes.** Deleting the TypeScript derivation belongs to the extension carve, not here. This set ships the projection; consumption follows.
4. **No new blocking gate.** Set 116 reduced ten checks to three. The writer refuses bad input at the boundary — that is validation, not a gate.

## Non-goals

- **Not re-authoring Set 115 Session 4.** This set unblocks it; it does not decide its fate.
- **No change to what a step MEANS.** The vocabulary is drawn from the canonical tokens already in use, not invented.
- **No Layer 3, no worker policy, no verification-loop change.**

---

## Sessions

### Session 1 of 3: The writer refuses what it cannot mean

**Steps:**

1. Register.
2. **Define the vocabulary and enforce it at the writer.** Draw the legal
   set from the canonical tokens already in use (`complete`, `pending`,
   `in-progress`, `blocked`, `skipped` — confirm against the counts
   above; do not invent). `SessionLog.log_step` fails closed on anything
   else, exactly as `session_state.validate_verification_verdict` does
   for verdicts (Set 086 S1). **Readers are not touched** — they stay
   lenient, per standing decision 1.
3. **Audit every call site that writes a step status.** An allowlist at
   one entry point is worthless if another path writes the file directly
   (`L-069-1`: *fix every sibling site* — the lesson that failed to
   prevent two recurrences this week). Report any writer that bypasses
   `log_step`, and route or refuse it.
4. **Ship the falsifiers `L-112-1` requires:** one planting each drifted
   token (`completed`, `done`, `complete-with-known-failures`, a prose
   blob) and asserting the write is refused with a message naming the
   legal set; one asserting every canonical token is still accepted.
5. Full pytest at close after freeze; verify, close.

**Creates:** the step-status vocabulary, writer-side validation, the falsifier suite
**Touches:** `ai_router/session_log.py`, any sibling writer found in step 3, `ai_router/tests/`
**Ends with:** a status token that no reader recognises can no longer reach disk.
**Progress keys:** `vocabulary`, `writerValidation`, `siblingAudit`, `falsifiers`

---

### Session 2 of 3: What to do about the history already on disk

Making the writer strict does not fix the **~281 entries already
written**. Those are records of real sessions, and rewriting records is
not a decision an orchestrator may make alone.

**Steps:**

1. Register.
2. **Inventory the drift precisely** — per file, per token, with the
   session and set each belongs to. The counts in this spec came from a
   one-off query; reproduce them from a command so the ruling is made on
   current data. **A discrepancy is a finding about the query *or* about
   this spec, and the session must say which.**
3. **Operator decision, journaled.** Three options, and the operator
   picks: **(a)** normalise drifted tokens to their canonical equivalent
   (`completed`→`complete`, `done`→`complete`) and move prose into a
   `note` field; **(b)** leave history untouched and let readers show
   `[?]`, treating the logs as records — the precedent Set 116 S1 set when
   it *"deliberately left historical specs, changelogs, and the benchmark
   script alone"*; **(c)** normalise only the mechanical spellings and
   leave the prose entries. Record the ruling with `decision_journal`.
   **This is not a verification reduction** — it changes no gate — but it
   rewrites records, which is an operator call.
4. **Execute the ruling idempotently**, with a dry-run mode and a
   re-runnable result. If the ruling is (b), record that and skip.
5. Full pytest at close after freeze; verify, close.

**Creates:** the drift inventory command, the journaled ruling, the migration (or the recorded decision not to migrate)
**Touches:** `ai_router/`, `docs/session-sets/*/activity-log.json` (only under ruling (a) or (c)), `decisions.jsonl`, `ai_router/tests/`
**Ends with:** the history on disk is either canonical or deliberately preserved, and which one is recorded.
**Progress keys:** `driftInventory`, `operatorRuling`, `migrationExecuted`

---

### Session 3 of 3: Compute the projection once

**Steps:**

1. Register.
2. **Ship the projection.** One Python computation of session progress —
   steps, their statuses, the current step, what remains — serialised to
   **JSON** beside the artifacts it derives from. The repo's convention is
   JSON for machine-written state and YAML for human-authored config;
   this is state. **Mark it derived and regenerable**: a cache, never a
   source, so it can never go stale against its own inputs.
3. **Carry the states absence currently hides.** Explicit `unknown`,
   `stale` and `unreadable`. Today an unreadable ledger renders as an
   empty session row, so *"no work"* and *"cannot read evidence"* are
   indistinguishable — a defect both reviewers named independently.
4. **Prove parity against the Python renderer.** The projection must
   reproduce what `session_checklist` renders for the same inputs,
   including the `[?]` posture for unknown tokens. This is the check that
   makes it safe for a later set to delete the TypeScript derivation —
   **do not delete it here** (standing decision 3).
   **Drop the `<- here` marker in the same pass** (operator ruling,
   2026-08-11): `HERE_MARKER` (`session_checklist.py:158`), its rendering
   (`:555`, `:575`) and `markHere` (`:394`) go. The `in-progress` status
   token carries the fact directly, so nothing needs to be inferred —
   and the marker's single-valued design is what made it point
   confidently at the wrong row when the data was bad. Removing it also
   permits two steps in flight without requiring it, which `markHere`
   cannot represent.
5. Full pytest at close after freeze; verify, close.

**Creates:** the serialized progress projection, its schema, the parity proof
**Touches:** `ai_router/progress.py`, `ai_router/session_checklist.py`, `ai_router/tests/`, `docs/`
**Ends with:** one computation, one answer, a file the Work Explorer *and* an orchestrator can both read — and one fewer inferred value to be wrong about.
**Progress keys:** `projection`, `absenceStates`, `pythonParity`, `hereMarkerRemoved`

> **Irony budget.** This set adds tests to a framework already carrying
> ~3,900. **Cap: 40 new test functions across all three sessions.** If the
> vocabulary cannot be covered in that, it is too complicated — simplify
> the vocabulary, not the budget.

---

## What this unblocks

- **Set 115 Session 4** — currently blocked because it would render corrupt data. This set removes that objection; whether S4 is re-authored or dropped remains its own decision.
- **The extension carve** — the §6.5 deletion of ~1,200–1,500 TypeScript lines and ~110 tests depends on there being one authoritative computed answer to read.

Neither is scheduled here.
