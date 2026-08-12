# The Active Step Shows In Progress Spec

> **Purpose:** The Work Explorer cannot distinguish *"step 5 has not been
> started"* from *"step 5 has been running for forty minutes"* — the exact
> question the in-progress icon exists to answer. The renderer is fine; the
> state is simply never on disk, because the two writers between them only
> ever produce `pending` and `complete`. This set **derives** the missing
> middle frame from rows both surfaces already read, in the one Python
> derivation and its TypeScript mirror, without adding a writer or a
> convention anybody has to remember — and then closes the same gap on the
> *other* surface that answers the same question, the step checklist, whose
> post at a verification-round boundary depends on an orchestrator
> remembering during a machine-driven sequence no human is watching.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/127-the-active-step-shows-in-progress/`
> **Prerequisite:** None (Sets 114, 115 and 120 shipped the plan seeding, the
> step rows, and the one computed projection this builds on; all are complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Source of record:**
[`docs/planning/work-explorer-in-progress-step-icon.md`](../../planning/work-explorer-in-progress-step-icon.md)
— reported by the operator on 2026-08-12 during Set 124 Session 2, diagnosed
with the on-disk evidence (`in-progress` is ~1.4% of every step status ever
written and appears in no current set), and deferred because it surfaced
mid-session in another set. That note is the authority for the diagnosis and
for the three options below; this spec picks one and schedules it.

**Why the checklist gate is in this set and not its own.** The note's own
framing is the reason: *"The step checklist and the Explorer are the
operator's window into where a session is."* Both answer one question —
**where is this session right now** — and both were failing it for the same
structural reason: a signal that depends on someone remembering to emit it.
Session 3 is scoped by that sentence, not by the module it happens to touch.

---

## Session Set Configuration

```yaml
requiresUAT: true         # The defect was reported by an operator looking at a tree, and it is closed when that same look returns the other answer. The walk is ONE item, pre-verified by Layer 3 first.
requiresE2E: true         # Session 2 changes an Explorer rendering surface, which the test policy names as a non-negotiable Layer 3 trigger (L-064-12).
uatStyle: ad-hoc
uatScope: per-set
sessionSizeException: 1 - Operator-authorized 6 steps, 2026-08-12, for the start-time step. The timestamp is derived from the same rows and by the same rule as the in-progress state, so it is one more assertion against an existing predicate rather than a second feature.
sessionSizeException: 2 - Operator-authorized 6 steps, 2026-08-12, same reason as session 1. The timestamp work is deliberately NOT deferred into session 3, which is a different surface (the checklist gate) with its own ratification requirement; moving two small additions there would neither shrink this session's risk nor fit that one's scope.
```

> Rationale: `requiresUAT` is true for one reason only — the reporter asked
> *"why is there no In Progress icon?"*, and a green Playwright assertion
> answers a different question than the operator's own eyes on their own
> in-flight session. Everything automation can check **is** checked first
> (project-guidance: *UAT is written for a stranger and pre-verified by
> automation*), so the human walk is a single guided look, not a tour.
> `pathAwareCritique` is deliberately absent (default `none`): the change is
> two mirrored pure functions with no new writer and no schema movement.

---

## Project Overview

### Scope

**Option 2 from the note — derive it.** The active step is the
lowest-numbered seeded `plan-step` row with nothing logged against it, in a
session `session-state.json` says is in flight. It requires **no writer
change and no orchestrator discipline**, it cannot drift out of sync because
it is computed from the same rows the tree already reads, and it fixes every
**historical** set retroactively — which options 1 and 3 cannot do at all.

The derivation lands in exactly two places, because that is how many
implementations of the row model exist:

1. `ai_router/session_checklist.py` — `build_rows()`, *"the one Python
   derivation of a session's step rows"* (Set 120 S3), which
   `ai_router.session_projection` serializes rather than recomputing.
2. `tools/dabbler-ai-orchestration/src/providers/sessionStepModel.ts` — the
   mirror the Work Explorer actually reads to build its tree.

A fix in one and not the other is not a fix: the CLI checklist and the tree
would then disagree about which step is running, which is a worse failure
than the silence it replaced.

### The second half: when did it start?

An in-progress glyph answers *which* step is running; the operator's next
question — the one that made them look in the first place — is *how long
has it been running*. Each step row therefore carries a **start time** in
the tree, rendered `12:06-` (hour and minute, trailing dash to mark it as a
start rather than a completion), in **grey at the end of the row** —
VS Code's dimmed `description` slot, which on step rows is empty today.

**There is no recorded start time on disk, and this set does not add one.**
`log_step` writes *after* a step finishes, so an entry's `dateTime` is that
step's **completion**. The start is derived the same way the active step is:
the previous step's completion, or the session's `startedAt` for the first
step. It is a wall-clock proxy — it includes any gap between steps — and
that is the honest and useful reading of "how long is this taking".

### Operator rulings on the timestamp — settled, do not reopen

Taken 2026-08-12, at authoring, and journalled at Session 1 registration:

1. **Start time only; no end time.** A finished step's end is the next
   row's start, one line below it. Rendering both would be duplicate data on
   every row for no added information.
2. **No date handling, and no special case for a session that crosses
   midnight.** It is rare in a working day, a reader is understanding of a
   UI that does not capture it perfectly, and the giveaway is already free:
   the next row's hour being *smaller* says the day rolled over. A date
   column would cost width on every row to disambiguate a case most sets
   never hit.
3. **A row that has not started shows no time.** A seeded plan row's
   `dateTime` is *registration* time, not a start, so rendering it would be
   a fresh wrong signal of exactly the kind this set exists to remove.

### The third surface: a post nobody was there to make

The same question — *where is this session right now* — is answered for the
operator's terminal by `python -m ai_router.session_checklist`, and
`gate_checks.check_checklist_posted` audits it: for transitions
t₁ < t₂ < … < tₖ, each tᵢ needs a post in the window `[tᵢ, tᵢ₊₁)`. The
positional windows are deliberate and stay — they are what stops one
catch-up post at the end from covering a whole session, which is exactly
how the prose version of this obligation decayed in Set 111 S4.

**One transition type cannot realistically be met, and it is failing
repeatedly.** A blocking discovery round forces `discovery →
supplementary → remediate → remediation-review` in immediate succession.
Those rounds are minutes apart, machine-driven, and no human is watching
the terminal during them; the orchestrator is mid-remediation. Set 126
Session 2 missed rounds 2 and 3 that way, and it is not the first:

```
12:08:17  ROUND 2 (discovery)      <- window closed at 12:21:17, unmet
12:21:17  ROUND 3 (supplementary)  <- window closed at 12:27:20, unmet
12:27:20  ROUND 4 (remediation-review)
12:27:37  POST                     <- could only be spent on round 4
```

A miss cannot be repaired (you cannot post into the past), so the only exit
is an operator-attested waiver — which means a recurring, structurally
predictable omission keeps landing on the operator's desk as paperwork.

**The fix is removal, not more discipline** (project-guidance: *prefer
removal over addition when fixing*): `verify_session` renders the checklist
itself at the end of each round, through the same code path that records a
post, so the record remains a genuine render to the operator's terminal —
the round output becomes *more* informative, not less. What the gate loses
is a failure mode, not a check: the other transition types (test-run
recorded, operator stop, last logged step) keep binding exactly as they do
now, and they are the ones a human can actually hit.

### The one decision Session 3 must have ratified before it starts

This touches how much a close-time gate can still catch, so it is **not**
self-authorizable — it is journalled at Session 3 registration with the
operator's answer, and the spec records the alternatives rather than
pretending there is only one:

1. **Auto-render inside `verify_session`** *(recommended)* — eliminates the
   failure mode; costs the verification-round transition its diagnostic
   value, since it can no longer be missed.
2. **Orchestrator discipline only** — keeps every transition diagnostic, and
   keeps failing on the exact sequence where no human is watching. The
   evidence says this decays.
3. **Re-arm the gate as blocking** (it is advisory by the Set 116 S3
   operator ruling) — strongest signal; would have refused Set 126 S2's
   close and forced a waiver for a paperwork miss during remediation.

### Non-goals

- **No new writer, and no orchestrator discipline.** Option 1 (log
  `in_progress` on entering a step) doubles every `log_step` call and relies
  on a convention this repo keeps having to replace with a gate; option 3
  (`start_session` stamps step 1) is option 1 with extra steps and is wrong
  from step 2 onward. Both are rejected on the note's own reasoning, and
  neither is re-opened mid-set.
- **No backfill of the five legacy prose-in-`status` entries.** They pre-date
  Set 120 S1's strict writer, nothing new can land that way, and rewriting
  historical records to flatter a renderer is the wrong direction. The
  obligation they create is the opposite one, and it is in scope: the
  derivation must **not trust the status field blindly**.
- **The glyph map is not touched.** `STATUS_GLYPHS` / `STATUS_BOXES` already
  map every reasonable spelling of in-progress to the right glyph. Nothing
  about this defect is in the renderer.
- **No change to `session-state.json`, its schema, or its writers.** This set
  *reads* which session is in flight; it never writes it.
- **The CLI checklist keeps its current text shape.** The start time is
  derived onto the shared row model in both languages so the two cannot
  disagree about it, but only the tree *renders* it — the checklist is a
  what-is-left list, not a timeline, and widening it is a separate question.
- **The checklist gate's positional windows are not touched.** Session 3
  removes a failure mode inside one transition type; it does not loosen the
  one-post-per-window rule, does not excuse any other transition, and does
  not change the waiver path. A spec that widened the windows would be
  re-opening the decay Set 111 S4 was written to end.
- **No synthetic post records.** Session 3's post is recorded *because a
  render happened*, through the existing writer. A gate satisfied by an
  entry nobody rendered is worse than a gate that fails.

### The one thing that must not regress

Exactly **one** row per session may be derived as in flight, and only while
that session is genuinely in flight. A derivation that marks a step
in-progress in a **closed** session, or marks several at once, replaces "no
signal" with "a wrong signal" — strictly worse, because the operator would
then have a reason to believe it. Both directions are falsified in both
languages (`L-112-1`).

---

## Sessions

### Session 1 of 3: The record can say a step is in flight

**Steps:**

1. Register. Journal the two decisions this set takes as authored: **derive,
   never write** (with options 1 and 3 recorded as the rejected
   alternatives), and **display-only** — the derived state changes no exit
   code, no `log_step` vocabulary, and nothing stored on disk. Journal the
   three operator rulings on the timestamp (start only, no date handling, no
   time on an unstarted row).
2. **Derive the active step in `build_rows()`.** The lowest-numbered seeded
   `plan-step` row with nothing logged against it, in the session
   `session-state.json` reports as in-progress. It must **never override what
   the record already says**: an explicitly logged status of any kind
   (including the 40 real `in-progress` writes, `blocked`, and `failed`)
   wins, and an *unrecognized* status token — the five legacy prose rows — is
   not read as evidence of anything.
3. **Falsify in both directions** (`L-112-1`). FIRES: an in-flight session's
   first unlogged planned step renders `[~]`, including retroactively on a
   historical set that never wrote the token. DOES NOT FIRE: a completed
   session marks nothing; a session whose planned steps are all logged marks
   nothing; a set with no seeded plan renders exactly as before; a `blocked`
   row is not overwritten. STRUCTURAL: at most one derived in-flight row per
   session, whatever the log contains.
4. **Confirm the projection agrees.** `session_projection` serializes what
   `build_rows()` returns, so assert the derived state reaches it — if it
   does not, there is a second implementation, which is the thing Set 120 S3
   removed.
5. Targeted pytest for the changed modules; verify; close.
6. **Derive the start time onto the row.** The previous step's completion,
   or the session's `startedAt` for the first step; `None` for a row that
   has not started, so nothing downstream can render a registration
   timestamp as a start. Falsify the boundaries (first step, a gap between
   steps, an unstarted row, a session with no seeded plan).

**Creates:** the derived in-flight state, the derived start time, and their falsifiers
**Touches:** `ai_router/session_checklist.py`, `ai_router/tests/test_session_checklist*.py`, `ai_router/tests/test_session_projection*.py`
**Ends with:** `python -m ai_router.session_checklist` prints `[~]` against the
step an in-flight session is actually on — for sets that closed months ago as
well as the live one — and nothing was written to disk to make it true; every
row that has started carries a derived start time the tree can render.
**Progress keys:** `activeStepDerived`, `noWriterChanged`, `projectionAgrees`, `startTimeDerived`

> **Irony budget: 10 new test functions.** The change is two predicates over
> the same rows; the risk is concentrated in the negative direction (never in
> a closed session, never twice, never over the record, never a time on a row
> that has not started), which is where most of the ten go.

---

### Session 2 of 3: The Explorer shows it

**Steps:**

1. Register.
2. **Mirror the derivation in `sessionStepModel.ts`,** the model the tree
   actually reads, then **enumerate every consumer of a row's status** before
   declaring it done (`L-069-1`, and the authoring guide's echo-pass
   anti-pattern): `stepDescriptor`'s glyph *and* its tooltip, which currently
   says `planned — not started` for any planned row and would otherwise call
   the running step not-started in prose while showing it as running in the
   icon.
3. **Falsify in TypeScript with the same both-direction pairs, and pin the
   parity.** A shared fixture drives both implementations and asserts they
   agree row-for-row — two mirrored derivations that no test compares are two
   derivations that will diverge.
4. **Layer 3 rendering smoke**, then the human look: assert the in-progress
   glyph renders on the active step of an in-flight fixture session, run the
   full `npm run test:playwright` **after the last code change** (L-064-12),
   and only then offer the one-item guided walk.
5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.
6. **Mirror the start time and render it `12:06-`.** Same derivation as
   Session 1, in the TS row model, displayed in the step row's **dimmed
   description slot** — `RowDescriptor.description`, which VS Code renders in
   grey immediately after the label, as session rows already do with
   `in flight`. Not concatenated into the label, which is narrow and already
   carries the step text plus its own label tests. That slot is currently
   **empty on every step row** and its own comment says why: it held the
   `<- here` marker until Set 115 S4 retired it. The timestamp reuses the
   slot that was vacated by a worse answer to the same question, so nothing
   is displaced. Local time, 24-hour, hour and minute only, trailing dash;
   the full timestamp goes in the tooltip, where width is free. A row with no
   derived start renders no description at all — the slot stays as empty as
   it is today.

**Creates:** the TypeScript mirror, the cross-language parity falsifier, and
`127-the-active-step-shows-in-progress-uat-checklist.json`
**Touches:** `tools/dabbler-ai-orchestration/src/providers/sessionStepModel.ts`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts`, `tools/dabbler-ai-orchestration/src/test/suite/sessionStepModel.test.ts`, the Layer 3 rendering spec
**Ends with:** the operator opens the Work Explorer on a live session and the
step it is on carries the in-progress glyph, says so in its tooltip, and shows
`12:06-` for when it started — the answer to the question that opened the note,
plus the follow-up question it raises — with the CLI checklist and the tree
provably deriving the same rows the same way.
**Progress keys:** `mirrorParityPinned`, `tooltipAgreesWithGlyph`, `renderingSmokeGreen`, `startTimeRendered`

> **Irony budget: 12 new test functions.** Larger than Session 1 because the
> parity fixture, the rendering assertion and the time-format cases are each
> their own pins; the derivations themselves are the same two predicates a
> second time.

---

### Session 3 of 3: The round sequence posts its own checklist

The third surface answering *where is this session right now* — and the one
whose signal depends on a human being at the terminal during a sequence no
human watches. Scope and rationale: **The third surface: a post nobody was
there to make**, above.

**Steps:**

1. Register. **Journal the ratified mechanism first** — the operator's
   answer among the three options above, with the two rejected ones and
   their consequences recorded. A session that starts before that answer
   exists is implementing an unratified change to what a gate can catch.
2. **Render the checklist at the end of every `verify_session` round**, in
   every phase, through the **existing** `record_post` path so the record
   still means "a render happened". Never on a round that did not complete:
   a refused round (past the bound), a routed-call failure, and `--dry-run`
   record nothing, because nothing was shown.
3. **Falsify in both directions** (`L-112-1`). FIRES: the Set 126 S2
   sequence — discovery → supplementary → remediation-review back to back —
   leaves one post inside each round's own window, and `check_checklist_posted`
   reports no unmet round transitions. DOES NOT FIRE: a refused or failed
   round records no post; the **other** transition types still bind, so a
   session that skips its test-run or last-step post is still reported
   exactly as it is today. STRUCTURAL: the gate's window rule itself is
   unchanged — assert it against a hand-built ledger, not by reading the
   new call site.
4. **Correct the cadence documentation to match the mechanism** — the
   constitution's Step 4 cadence sentence, the authoring guide's
   *step-checklist cadence* section, and `check_checklist_posted`'s own
   docstring, which currently teaches an obligation the tool will now
   discharge on the orchestrator's behalf for one transition type. An
   instruction that survives a change it describes is the defect family Set
   126 spent a session on.
5. Targeted pytest; verify; close; Step 9 review, `change-log.md`, and
   `disposition.json` (this is the set's final session).

**Creates:** the round-boundary auto-post and its falsifiers
**Touches:** `ai_router/verify_session.py`, `ai_router/tests/test_verify_session*.py`, `ai_router/tests/test_gate_checks*.py`, `docs/session-constitution.md`, `docs/planning/session-set-authoring-guide.md`, `ai_router/gate_checks.py` (docstring), `ai_router/CHANGELOG.md`, `docs/planning/work-explorer-in-progress-step-icon.md`
**Ends with:** a blocking-findings session that runs three rounds in ten
minutes closes with three posts on the record and no unmet round transition —
because the tool that ran the rounds showed the operator where the session
was, instead of asking someone mid-remediation to remember.
**Progress keys:** `roundPostsAutomatic`, `otherTransitionsStillBind`, `cadenceDocsMatch`

> **Irony budget: 8 new test functions.** Small because the change is one
> call at one boundary; most of the eight go to the negative direction — the
> rounds that must NOT record a post, and the transition types that must
> still fail when missed.

---

## End-of-set deliverables

- An active step that renders as in-progress in **both** surfaces, and a
  start time (`12:06-`) on every row that has started, derived from rows
  that already existed, with no writer changed and no orchestrator
  convention introduced.
- Falsifiers in both languages proving it fires on a live session and stays
  silent on a closed one, that no time appears on a row that has not
  started, plus a parity fixture that fails when the two implementations
  drift.
- A one-item UAT walk, attested by the operator who reported the defect.
- A verification-round boundary that posts its own checklist, so a
  blocking-findings session no longer owes the operator a waiver for
  paperwork it could not have filed — with every other transition type
  still binding exactly as it does today.
- `docs/planning/work-explorer-in-progress-step-icon.md` moved from
  **"diagnosed, not fixed"** to fixed, citing the sessions that closed it and
  recording the deliberate non-backfill of the five prose-status rows.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
