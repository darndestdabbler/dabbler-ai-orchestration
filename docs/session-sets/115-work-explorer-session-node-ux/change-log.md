# Set 115 — Work Explorer session-node UX

## What this set was for

The session node in the Work Explorer said `Session 3` and did nothing.
It was the row an operator looks at most and the row that told them
least: a generic label, no click target, no menu, and a checklist under
it that could read as finished while an hour of close-out remained.

The immediate trigger was smaller and more embarrassing than a missing
feature. **The framework resolved every session's real title correctly
and then a second writer overwrote it.** Measured 2026-08-10:
`ai_router/session_state.py::_build_sessions_array` implements the
documented resolution order and returns the real titles, while
`utils/sessionState.ts`'s `buildSessions` hardcoded ``title: `Session
${n}` `` — in a file that already imported `extractSessionTitlesFromSpec`
and already called it. The extension's watcher won, and because the
resolution order puts the stored ledger first, one generic title on disk
was copied forward by every later write. Nothing self-healed, which is
why *every* set in the Explorer showed generic labels.

Four decisions were locked before any session ran and none was reopened:
`spec.md` is not split into per-session files; generated per-session
sidecars are refused; the per-session view is a read-time slice of the
one real file; and titles are resolved at **write** time by the blessed
writer.

## What shipped

### Session 1 — the titles both writers already know

One writer owns the title. The extension's synthesizer stopped inventing
`Session N` and started using the title map it was already computing, and
`ai_router.progress` gained the heal rule that lets a `spec.md` heading
beat a **generic-shaped** stored title while never overwriting an
operator-authored one. The rule runs at every boundary write *and* in the
read view, because a closed set gets no further boundary write — the read
view is the only place its labels can heal.

**Routing bought three Major findings, and every one was a defect the
session could not see from the inside.** Two discovery lenses
independently found that removing the write-on-read had made the *read*
expensive — four `spec.md` reads per spec-only set per scan — after the
session had verified "no file is created" and asserted "no additional
disk read" without counting. A supplementary pass found that the parity
the session had just *documented* between the extension's inference and
the router's backfill did not hold for an empty `activity-log.json`. Both
are the same class: a claim about behaviour that reads as verified
because it is written down.

### Session 2 — left-click a session, land on its plan

Session rows became clickable. Activating one opens the set's real
`spec.md` positioned at that session's own `### Session N of M:` block,
through the **existing** `Open Spec` command rather than a parallel one,
so there is still exactly one answer to "which file is the spec". A spec
that cannot answer — no session headings at all, a malformed heading, a
ledger ahead of its spec, or a fenced sample full of numbered lines —
opens the real file at the top rather than erroring or doing nothing.

### Session 3 — the menu: the prompt, and the evidence

Right-clicking a session row now offers **Copy Run Prompt** and **Open
Session Artifacts**. Two decisions were journaled before any code was
written, because neither is reconstructible from the diff:

- **The run prompt is gated to the session the phrase actually runs.**
  The framework's only documented run trigger is set-scoped, so a prompt
  copied from session 4 while session 3 is next would start a different
  session than the row it came from.
- **The artifact entry is always shown and answered at click time.**
  Hiding it on an empty session would mean a directory listing per
  session row on every tree scan — the measured constraint Session 1
  spent its verification rounds protecting.

**The artifact entry did not survive the walk.** Looking at the finished
row, the operator ruled it out: one entry is enough on a session row, and
the artifacts are a folder away. Session 4 removed the command, its
manifest entries and its `s<N>-*` discovery helpers — it was hidden from
the Command Palette by design, so the menu was its only door and leaving
it registered would have left dead surface. What survives from S3 is the
reasoning that put the read on the *click* rather than the scan, which is
the same rule Session 4's projection reader follows.

### Session 4 — the checklist tells the truth about what remains

This session was re-authored before it ran. It had carried a **DO NOT RUN
AS WRITTEN** notice over three findings in `step-ledger-findings.md`, and
resolving them shrank it to a renderer:

| original blocker | how it was resolved |
| :--- | :--- |
| would render corrupt data (~10% unrecognised status tokens) | Set 120 S1 made the writer strict; 120 S2 migrated 271 lossless tokens |
| the contradiction — show outstanding lifecycle phases while rendering only what is recorded | **dissolved**: `close_preflight` already *computes* the obligations, so the renderer renders a recorded computation rather than synthesising policy |
| the motivating measurement was a mean | rebaselined: close-out execution is 0.1 min median across 104 sets |

**The close-out obligations, serialized.** `close_preflight --write`
writes its report to `<set>/.dabbler/close-obligations.json` and the Work
Explorer renders it as a **Close-out** row under the in-flight session.
The preflight itself takes 2–7 seconds — git-backed predicates plus
interpreter startup — so the renderer never calls it; the file is the
whole interface, exactly the pattern Set 120 S3 established.

Three properties are worth naming, because each is the difference between
a useful list and a lying one:

- **The digest map is the whole session-set directory.** Obligations
  derive from the disposition, the state file, the activity log, the
  spec, the change log, three ledgers and every `s<N>-*` verification
  artifact. A curated filename list would be one more thing to forget; a
  set that grows an artifact grows an input.
- **Two obligations cannot be digested at all.** `working_tree_clean` and
  `pushed_to_remote` read git, so *committing* — the very thing the
  preflight tells you to do — changes no byte any digest covers. Those
  rows carry `volatile: true`, the file records a git fingerprint beside
  the content digests, and the tree (which deliberately never spawns git)
  stamps them `as of HH:MM` rather than claiming to have re-checked them.
- **It is never committed.** `.dabbler/` is git-ignored and the writer
  drops a self-protecting `.gitignore` in the directory it creates, so a
  consumer repo is covered without editing its root ignore file. That is
  what keeps a mid-session write out of the verification stamp's work
  diff — structurally, rather than by adding one more filename to an
  exemption list.

**`<- here` is gone from both languages.** Set 120 S3 removed the marker
from the router under an operator ruling and could not touch the
extension; this session removed `HERE_MARKER`, its render site,
`markHere`, `TERMINAL_STATUSES` and the `StepRow.isHere` field, and the
shared parity corpus dropped the field with them. What an operator reads
instead is the in-progress glyph on the step whose **recorded** status is
`in-progress` — a fact the ledger states since Set 120 S1 made the writer
strict, where the marker was an inference that pointed confidently at
step 1 of Set 119 S2 when four statuses were unreadable. Two steps can
now be in flight at once, and none can, both of which the single-valued
marker could not represent.

## What this set changed about how the framework is used

- **A session row is a place to act, not a label.** Click it for the
  plan, right-click it for the prompt that runs it, expand it for the
  steps and for what still stands between here and close.
- **Close-out stopped being a surprise.** The obligations that fail two
  in five closes are visible while there is still time to fix them
  cheaply, on a surface that is already open.
- **One fewer inferred value.** Both the panel and the CLI now read what
  is in flight instead of deriving it, and the parity corpus that proves
  they agree carries nothing only one of them produces.

## What it deliberately did not do

- **No lifecycle model in the renderer.** The original Session 4 proposed
  deriving close-out obligations from six ledgers. `close_preflight`
  already reads those predicates, so an obligation the preflight does not
  cover is a bug **in the preflight**, not a reason for a parallel model.
- **No new gate.** The projection reports; only the existing gates
  refuse.
- **No scope creep in the menu.** Start the session, rename, re-run
  verification — the seam they need is unsettled, and Set 111 said so.
