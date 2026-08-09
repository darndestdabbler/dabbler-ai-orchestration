# Set 114 — the rolling task list, and in-session progress visibility (RESERVED)

> **Status:** proposed and reserved by the operator, 2026-08-09. Spec
> authored the same day at
> [`docs/session-sets/114-rolling-task-list-and-progress-visibility/spec.md`](../session-sets/114-rolling-task-list-and-progress-visibility/spec.md).
> **Execution waits for Set 112 to complete.** This document is the
> reservation record and the evidence basis; the spec executes it.

## The ask

> *"The idea is to see a task checklist that gets updated and rendered to
> the chat window at milestones/transitions within a given session."*

## What already exists — and what does not

Half of this shipped in **Set 111 Session 4**, on the operator's own
mid-session direction: `ai_router.session_checklist`.

```
python -m ai_router.session_checklist              # plain text, cp1252-safe
python -m ai_router.session_checklist --markdown   # table for a chat surface
python -m ai_router.session_checklist --verbose    # full logged descriptions
```

It resolves the in-flight set and session from `session-state.json` (never
from file presence), reads `activity-log.json`, collapses repeated
`stepKey` entries keeping the latest at the position the step first
appeared, renders `[x]` / `[~]` / `[ ]` / `[!]`, and marks the current step
with `<- here`. `session-constitution.md` Step 4 tells the orchestrator to
post it at every transitional boundary.

The set number appears **nowhere** in Sets 112 or 113. So the remaining
work is not "build a task list" — it is "finish the one that exists".

## The four gaps

### 1. Nothing enforces posting it, and it is already decaying

The Step 4 obligation is **prose**. `ai_router/gate_checks.py` contains
zero references to the checklist.

Set 111 S4's own canonized finding, in the authoring guide, is:

> *Prose does not survive end-of-session pressure, so the run of record is
> now recorded and checked.*

That session applied the principle to test runs and then left its own
checklist obligation as prose. **The evidence is that session itself:**
Set 111 S4 ran for many hours across dozens of transitions and posted the
checklist **once**, at the start. Nothing noticed, because nothing could.

The honest difficulty is that a close gate cannot observe a chat window.
The design that resolves it: **make the renderer the recorder.** If
producing the checklist is what records that it was produced, then posting
is intrinsically observable, and a gate can compare posts against
transitions instead of taking anyone's word.

### 2. It is a rear-view mirror, not a rolling task list

`build_rows` renders **logged** steps. Pending rows appear only when the
orchestrator happens to pre-log future steps — in Set 111 S4 they did, so
`[ ] Verify and close  <- here` rendered, but nothing required it. By
default the checklist shows what has been done, not what is coming, which
is the half the operator's phrase "gets updated" is really asking for.

**This is a deliberate prior decision and must be reversed carefully.**
Set 111 S4's operator notes state:

> *It renders **logged** steps, not planned ones. Synthesizing rows from
> the spec would produce a checklist that disagrees with the record, and
> the record is what close-out gates on.*

That reasoning is correct and stays. The resolution is **not** to
synthesize plan rows at render time. It is to write the plan **into the
ledger** at session start, so the record itself contains the plan and the
renderer keeps its one rule: render the record. `ai_router.spec_admission`
already parses each session's step list to enforce the size cap, so the
plan is available without new parsing.

### 3. The Work Explorer half was deferred, explicitly

From the same operator notes:

> *An in-flight session node could expand to show its logged steps, which
> is the same data in the surface the operator already has open. That is a
> `tools/dabbler-ai-orchestration` change and belongs to a session that is
> allowed to touch the rendering surface (and therefore owes a full Layer 3
> run). Recorded, not deferred silently.*

A terminal command you must remember to run is a worse surface than a
panel already open on screen.

### 4. "Milestone/transition" is undefined

Step 4 says "every transitional boundary" without saying what one is. An
undefined cadence cannot be followed consistently or checked at all, and
it is the reason gap 1 is invisible rather than merely unenforced.

## Why a set and not a patch

Gap 1 requires a recording mechanism and a gate; gap 2 changes what
`start_session` writes and reverses a recorded design decision; gap 3
touches the Explorer rendering surface and therefore owes a full Layer 3
run and a UAT walk; gap 4 is doctrine that must land in the constitution
and the authoring guide. That is a set.

## Sequencing note

Session 3 touches a UI surface and therefore owes a walk. If **Set 113**
(narrated video walkthroughs) has landed by then, that walk should use the
new format — Set 111 S4's walk was waived precisely because the old format
is not worth an operator's time. This is a preference, not a hard
prerequisite; the spec records it in Session 3 rather than blocking the
whole set behind 113.
