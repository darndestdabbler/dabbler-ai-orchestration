# Set 114 — The rolling task list, and in-session progress visibility

## What this set was for

Half of it already existed. Set 111 S4 shipped
`python -m ai_router.session_checklist`, which renders an in-flight
session's logged steps with the current one marked `<- here`, and
`session-constitution.md` told the orchestrator to post it "at every
transitional boundary".

That left four gaps, and the evidence for each was the very session that
shipped the checklist:

1. **Nothing enforced posting it.** The obligation was prose, and Set 111
   S4 ran for many hours across dozens of transitions and posted
   **once**. Nothing noticed, because a close gate cannot see a chat
   window.
2. **It was a rear-view mirror.** It rendered logged steps, so it showed
   what had been done and not what was coming — which is the half the
   operator's phrase "gets updated" was really asking for.
3. **The Work Explorer half was deferred**, explicitly and on the record:
   a terminal command you must remember to run is a worse surface than a
   panel already open on screen.
4. **"Transitional boundary" was undefined**, which is why gap 1 was
   invisible rather than merely unenforced.

The reservation record and the evidence basis are canonical in
[`docs/proposals/2026-08-09-set-114-rolling-task-list.md`](../../proposals/2026-08-09-set-114-rolling-task-list.md).

## What shipped

### Session 1 — posting is recorded by the act of posting, and gated

Rendering the checklist is now what records that it was rendered: every
CLI render appends one line to `checklist-posts.jsonl` beside the
activity log (session, timestamp, step count, which step carried
`<- here`, which surface). Nothing is self-attested — an attestation
would decay exactly as the prose obligation did.

The cadence stopped being a matter of taste. Seven named transitions
landed in `session-constitution.md` Step 4 and in the authoring guide's
table, and the new `checklist_posted` close gate compares the post ledger
against the transitions the session's **own** records already show:
`startedAt` in `session-state.json`, each `test-runs.jsonl` record, each
completed round in `sN-rounds.jsonl`, each human-authority row in
`decisions.jsonl`, and the newest `activity-log.json` entry. Each
transition needs its own post before the next one happens, so a single
post at the end does not launder a silent session.

Two limits are stated in the table rather than implied. **The two
"before X" moments are doctrine, not gates** — this framework's records
are all written *after* the thing they describe, so a gate can prove a
post followed an event and can never prove one preceded it. And **a post
proves a render, not a reader**; the floor it buys is that an omission
becomes visible.

The freshness question the spec named as a risk was settled deliberately
rather than discovered at close: `checklist-posts.jsonl` is
**freshness-exempt and evidence-visible**. A post written after a stamped
round does not stale that stamp (or posting would cost money, and the
orchestrator would stop posting), but the ledger stays in the verifier's
evidence bundle — freshness-exemption and evidence-exclusion are
different questions.

**The gate then refused the session that shipped it.** Two verification
rounds had gone by with no post, and a closed window cannot be
re-entered. Rather than `--force` (which bypasses every *other* gate
too), the operator authorized an attested-waiver escape mirroring the one
`uat_walk_recorded` already has: `disposition.checklist = {status:
"waived", attestation}`, refused when unattested or blank, and never
available to a session that posted nothing at all. The omission stays on
the record with a name against it.

### Session 2 — the forward half: a plan in the ledger

Set 111 S4 decided **against** synthesizing plan rows at render time,
because a checklist that disagrees with `activity-log.json` undermines
the file close-out gates on. That decision stands, and this session is
its remedy rather than its reversal: `start_session` now writes the
session's spec steps **into the ledger** as `pending` entries carrying
`kind: "plan-step"`, so the renderer keeps its one rule — render the
record.

Step texts come from `spec_admission.parse_step_texts`, the parser that
already enforces the session-size cap. A second parser for the same list
is the duplicate-parser defect this repo repeats most (L-069-1), and two
parsers that disagreed would mean the size a spec is admitted at is not
the plan the operator is shown.

The reconciliation rule, in one line: **the plan owns each row's
position, the logged step owns its content.** Claims are made in two
passes, **identity before ordinal** — a `stepKey` match asserts identity
and cannot be wrong; a `stepNumber` match is an inference that keeps the
common case clean. Nothing is dropped in either direction: a planned step
nobody logged stays a visible `[ ]` row carrying the spec's own words,
and a logged step the plan did not predict appends after the plan.

The ordinal pass is switched **off** when `spec.md` no longer says what
the seeded plan recorded. Rounds 2 and 3 of verification are why: insert
a step into the spec mid-session and an ordinal-only pass cascades until
the last planned row silently vanishes. Nothing inside the ledger
distinguishes that from a normal session — `spec.md` does.

Seeding happens **once** per session and is never re-applied, so an
idempotent re-registration writes nothing and no mid-session write can
stale a verification evidence stamp.

Seeded entries are activity-log entries, which meant
`check_activity_log_entry` would have passed for a session that had done
no work at all. That gate was fixed in the same pass — Set 114 S1 had
predicted this exact failure when it rejected an activity-log entry kind
for the post ledger, and a predicted consequence has to be paid rather
than inherited.

### Session 3 — the surface the operator already has open

The Work Explorer's tree went module → status bucket → session set →
session. It now has a fifth level: **an in-flight session expands to its
steps** — the seeded plan for what is coming, the logged steps for what
is done, the same authored lifecycle glyphs the other rows use, and
`<- here` on the row the session is on. It is the same list the CLI
prints, in the panel that is already open.

Three limits, each a decision rather than an omission:

- **Only the in-flight session expands.** Every other session row stays a
  leaf. The checklist answers "where is *this* session"; a finished one
  is answered by its own status glyph, and its steps stay one click away
  in the activity log. It also keeps the cost off the startup scan — a
  set that is not in progress does no extra work at all.
- **An absent, unreadable, or silent activity log degrades to no
  children.** Never a stale or invented list, and never a twisty that
  opens onto nothing.
- **No actions on step rows.** They are display-only, and the menu parity
  test asserts that no `when` clause targets them, so adding one later is
  a decision rather than a leak.

The rows come out of the ledger the scan already parses, so the feature
adds exactly one new disk read — a `spec.md` parse, on in-flight sets
only, for the single question the renderer asks the spec: has the plan
moved since registration?

## The one thing this set did that it was warned about

**The row-building rule now has two implementations.** The Explorer is
TypeScript and the checklist is Python, and Set 114 S2's own routed
`ai-assignment.md` named the hazard for Session 3 by name: a second
implementation in TypeScript is L-069-1 with a language boundary in the
way.

The alternative was to spawn `python -m ai_router.session_checklist` on
expand. That was rejected on the record (`decisions.jsonl`): it puts a
process spawn on the expand path of a tree that refreshes on every
watcher tick and a 30-second poll, and it makes a **display** feature
fail whenever the interpreter or the package is unresolvable — the exact
coupling `utils/migrateSessionState.ts` was written to remove.

So the duplication was taken deliberately, with the mitigation that same
assignment named: **port the rule with a shared fixture that proves the
two agree row-for-row.** That fixture is
`ai_router/tests/fixtures/session-step-parity.json` — twelve cases,
asserted by `ai_router/tests/test_step_row_parity.py` against the real
Python implementation and by
`tools/dabbler-ai-orchestration/src/test/suite/sessionStepModel.test.ts`
against the TypeScript mirror. Change either implementation alone and a
test fails; change the corpus alone and both fail. The corpus carries the
cases that are easy to get wrong: identity-before-ordinal claiming, a
plan that moved under the session, bookkeeping entries that must not
claim a planned row, an append-only log that logged the same step twice,
and a legacy set with no seeded plan at all.

It is a mitigation, not a cure, and the changelogs of both packages say
so at the point a maintainer would need to know it.

**And the mitigation had a hole, which a second lens found.** The
end-of-set path-aware critique (`gpt-5.5` + `gemini-3.1-pro-preview`, each
reading the repo) ran *after* the routed session verification returned
VERIFIED with zero findings — and found a real divergence the routed round
structurally could not, because the routed round reads a diff and the
defect was a semantic difference between two files neither of which
changed suspiciously. Python reads `kind` with `str(x or "")`; the mirror
used `String(x ?? "")`, so an entry carrying `kind: 0` or `kind: false`
read as *absent* in Python and as `"0"` / `"false"` in TypeScript —
flipping whether it could claim a planned row. It was reproduced, then
fixed as a **class** (one `pyStr` coercion at every field read, not one
patched site) and **pinned** with two new corpus cases. Two smaller
mirror divergences were fixed alongside it and one critic claim was
dismissed as factually wrong about the code. Full record:
[`s3-critique-remediation.md`](s3-critique-remediation.md).

## The regressions this set shipped and then caught

Running the **Layer 2** suite during that remediation — it is in
`CONTRIBUTING.md`'s canonical full pass, but Sessions 1 and 2 recorded
only pytest and Playwright — found `sampleProjectSmoke` unable to close a
sample project, broken by **this set's own new gates**: S2's
`check_activity_log_entry` no longer counted the smoke's single
`kind`-bearing entry, and S1's `checklist_posted` then refused the same
close because the sample session had never posted. Both would have hit a
consumer following the sample path. Fixed through the shipping writers
rather than hand-written ledger lines.

The lesson generalises and is worth stating plainly: **a gate that
changes what counts must be walked across every fixture that depended on
the old meaning** — and a suite that is in the contributing guide but not
in the recorded run set is a suite that will not notice.

## What this set deliberately did NOT do

- **No redesign of `activity-log.json`.** Its shape is load-bearing for
  close-out; this set adds entries, not a schema.
- **No new progress concept in `session-state.json`.** The state file
  owns set/session progress; steps live in the activity log.
- **No renderer that invents rows.** Set 111 S4's rule survives intact —
  the forward view exists because the plan is *in* the record, not
  because the renderer learned to guess.
- **No enforcement of the two "before" posts**, and the table says so
  rather than implying otherwise. Named residual, owned by this set.
- **No cost or metrics surfacing** in the tree. Different question,
  different set.
- **No UAT walk.** The set declares `requiresUAT: true` and Session 3
  owes one. The operator **waived it on 2026-08-10** — Set 113 (narrated
  video walkthroughs) has not landed, the old format was suspended once
  already (Set 077) and waived once already (Set 111 S4), and this set
  plus Set 115 need to ship before 113. The waiver is journaled under
  operator authority with attestation, and the judgments that genuinely
  need eyes are **itemized, not forgotten**:
  [`docs/planning/uat-improvement-notes.md`](../../planning/uat-improvement-notes.md)
  → *Deferred UAT — owed judgments, by set*. Ten entries, each naming
  what would decide it and the cheap remedy if the answer is "no". Two
  are worth flagging here because they are the ones most likely to be
  wrong: the seeded step **labels** can read as ungrammatical fragments
  (`"Work explorer expansion an in flight"`), and `blocked` / `failed`
  steps borrow the **cancelled** glyph, which may read as "this session
  was cancelled".

## Step 9 — the reorganization review (terminal session)

**Outcome: no guidance edits made. One recommendation for the operator.**

Both preload files are **at their ceilings** —
`project-guidance.md` 3,499/3,499 tokens (100%), `lessons-learned.md`
2,379/2,385 (100%), total 11,643/12,000 (97%). Ceilings ratchet down
only; raising one, or deleting/archiving guidance content to make room,
is an operator action. So the honest outcome is no edit, plus the
recommendation below — not a silent squeeze.

**Nothing new is owed as a lesson.** The two tactics this session leaned
on are already promoted doctrine, and they worked exactly as written:
L-069-1 (a bug is a bug *class* — fix every sibling site) is why the
`kind` coercion fix became one `pyStr` helper at five call sites rather
than one patched line, and L-112-1 (a gate that only ever passes proves
nothing) is why the fix shipped with two planted corpus cases. The
cross-language golden corpus is an *instance* of the existing
validator-parity convention, not new doctrine.

**Recommended addition, if the operator ever frees the budget** — a
Principles entry under *Orchestration and verification effort*, roughly:

> **A routed round reads a diff; a path-aware critique reads the repo.**
> They catch different defect classes, so a clean routed verdict is not
> evidence the path-aware stage would also be clean. A routed round is
> fed spec excerpt + `git status` + the diff, and reasons about *what
> changed*; it structurally cannot see a defect that lives in the
> relationship between two files neither of which changed suspiciously —
> a drifted cross-language mirror, a validator that no longer matches its
> schema twin, a fixture that silently stopped exercising the gate it
> names. Do not treat a VERIFIED routed round as a reason to skip an
> armed path-aware stage. And when a set changes what a gate *counts*,
> re-run every suite in `CONTRIBUTING.md`'s canonical full pass, not only
> the ones the session happens to record: a suite that is in the
> contributing guide but not in the recorded run set is a suite that will
> not notice.

Set 114 S3 is the worked example on both halves — the routed discovery
round returned VERIFIED with zero findings, and the path-aware critique
then found a real coercion divergence plus, via the Layer 2 re-run it
prompted, two close-gate regressions this same set had already shipped.
Set 065's bake-off is the original evidence; this is the same result on
ordinary work rather than on a designed experiment.

## Where the canonical detail lives

| Topic | Canonical |
|---|---|
| The cadence table, the post ledger, the `checklist_posted` gate | [`docs/planning/session-set-authoring-guide.md`](../../planning/session-set-authoring-guide.md) → *The step-checklist cadence* |
| Step 4's obligation, as preload | [`docs/session-constitution.md`](../../session-constitution.md) |
| The seeding + reconciliation rule | `ai_router/session_checklist.py` module docstring and `_reconcile` |
| Cross-language row parity | `ai_router/tests/fixtures/session-step-parity.json` (`_readme`) |
| Every judgment call this set made | `decisions.jsonl` in this directory |
| Release state of both packages | [`docs/repository-reference.md`](../../repository-reference.md) → *Current release status* |
