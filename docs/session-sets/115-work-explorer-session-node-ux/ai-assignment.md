# AI assignment — Set 115

One block per session, appended at that session's Step 3.5.

---

## Session 1 — The titles both writers already know

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** The work is a two-language
consistency fix across a writer, two readers and a tree scan, with a
recorded architectural constraint (no additional disk read) that had to
be honoured while changing the very path that reads. That is
implementation and architecture, which the temporary policy window
(Sets 110-112, extended by the constitution's Delegation Discipline
pointer) assigns to the active orchestrator. Only `session-verification`
was routed, and it ran on a different effective provider
(`gpt-5.5`, with `anthropic` excluded automatically by registry lookup on
the orchestrator's model).

**What routing bought.** Three Major findings across two discovery lenses
and one supplementary pass — and every one of them was a defect I could
not see from inside the change:

- Two lenses independently found that removing the write-on-read had
  made the *read* expensive (four `spec.md` reads per spec-only set per
  scan). I had verified "no file is created" and asserted "no additional
  disk read" without counting.
- The supplementary pass found that the parity I had just **documented**
  between the extension's inference and the router's backfill did not
  hold for an empty `activity-log.json` — a divergence older than this
  session, made newly harmful by the claim.

Both are the same class: a claim about behaviour that reads as verified
because it is written down. That is what a cross-provider reader is for.

**Next orchestrator: continue.** Session 2 (session-node activation) is
the same surface — `providers/`, `commands/openFile.ts`, and the same
`readSessionSets` row model this session just restructured — and it
inherits live context about the reader's read-count budget and the new
`specTitles` threading. No blocker, no cost pressure, no capability gap.

**Next set: unchanged.** Set 115 continues to Session 2. Nothing this
session learned reorders the queue; the step-ledger findings that
disqualify Session 4 are recorded and untouched by this work
(`step-ledger-findings.md` §8 explicitly holds Sessions 1-3 independent).

---

## Session 2 — Left-click a session, land on its plan

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** Three of its four work steps are
implementation and design-decision work on a surface the previous session
had just restructured: the tree's command wiring, the file-opening
plumbing, and a parse rule that has to agree with a Python original. The
temporary verification-only policy window assigns those to the active
orchestrator. Only `session-verification` was routed, on a different
effective provider (`gpt-5.5`; `anthropic` excluded automatically by
registry lookup on the orchestrator's model).

**What routing bought.** Both discovery lenses returned VERIFIED with no
Critical/Major findings — the first zero-blocker round of this set. That
is a weaker signal than Session 1's three Majors, and worth reading
honestly: this session's change is small (one command, one pure module,
one optional argument threaded through an existing command) and it shipped
its falsifiers with it, including the fenced-sample case that would have
made the locator open a spec at its documentation template. The
failure-scenario lens explicitly reported trying to break the activation
path and finding nothing material.

The one nit is recorded and not fixed: when `spec.md` is **already open**
and scrolled elsewhere, the degradation path (`vscode.open`, no selection)
reveals the existing editor where it stands rather than forcing it to line
1. That is the same behaviour a set row's left-click has always had, and
matching the sibling surface is worth more than a literal reading of "at
the top" — the operator still ends up looking at the real file, which is
the rule the step is written to protect.

**Next orchestrator: continue.** Session 3 adds the session context menu
(run prompt + artifacts) on the node this session just made clickable, and
it reuses the same `openSpec` plumbing for the artifact QuickPick. The
live context that matters — the `contextValue` vocabulary, the menu-parity
test's forward/backward assertions, and why session-row menu entries are
*absent* rather than forgotten — is in this session's head. No blocker, no
cost pressure, no capability gap; verification stays cross-provider
regardless.

**Next set: unchanged.** Set 115 continues to Session 3.
`step-ledger-findings.md` still disqualifies Session 4 as written, and
nothing here touches that.

---

## Session 3 - The menu - the prompt, and the evidence

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** Every one of its three work steps
is implementation and design-decision work on the surface the previous
two sessions built: the `contextValue` vocabulary Session 1's parity test
guards, the `openSpec` plumbing Session 2 taught to take a session
argument, and the tree node Session 2 made clickable. The temporary
verification-only policy window assigns implementation, architecture and
test authoring to the active orchestrator. Only `session-verification`
is routed, on a different effective provider (`anthropic` excluded
automatically by registry lookup on the orchestrator's model).

Two decisions were journaled before any code was written, because both
are the kind that a reviewer cannot reconstruct from the diff:

- **The run prompt is gated to the session the phrase actually runs**,
  not to every non-terminal session. The framework's only documented run
  trigger is set-scoped, so a prompt copied from session 4 while session
  3 is next would start a different session than the row it came from.
- **The artifact entry is always shown and answered at click time.**
  Hiding it on an empty session would mean a directory listing per
  session row on the tree scan - the measured constraint Session 1 spent
  its verification rounds protecting.

**What routing bought.** _(recorded at close)_

---

## Session 4 - The checklist tells the truth about what remains

**Orchestrator:** github-copilot / anthropic / claude-opus-5, effort high.

**Why this session sat where it did.** Four of its five steps are
implementation and architecture on surfaces this set and Set 120 have
been building all week: a new CLI mode on `close_preflight`, a sixth
tree level, and the second half of a bug-class removal whose first half
Set 120 S3 authored. The temporary verification-only policy window
assigns implementation, architecture and test authoring to the active
orchestrator. Only `session-verification` is routed, on a different
effective provider.

Four decisions were journaled before any code was written, and three of
them are the kind a reviewer cannot reconstruct from the diff:

- **The projection is an ignored cache, not a tracked record.** Written
  mid-session by definition — which is *after* a verification round is
  stamped, every time — so a tracked file in the set directory would
  stale its own round and buy a metered backstop round at close, the
  failure Sets 111 S2, 112 S3 and 114 S1 each paid for. Putting it under
  the already-ignored `.dabbler/` makes the exemption structural rather
  than one more filename in a list.
- **Freshness is two questions, not one.** Two of the fourteen
  obligations read git, and committing changes no byte any content digest
  covers. A single freshness verdict would have to pick a lie: badge
  itself stale on every unrelated commit, or badge itself fresh while
  telling the operator to commit work they already committed.
- **The marker removal is the whole derivation, not the two lines the
  spec names.** The spec's letter named `HERE_MARKER` and its render
  site; its stated goal was L-069-1, in the same step. Deleting only the
  named sites would have left `markHere` computing a field nothing
  renders, still pinned by a corpus and by two Python guards protecting
  nothing.

**What routing bought.** _(recorded at close)_
