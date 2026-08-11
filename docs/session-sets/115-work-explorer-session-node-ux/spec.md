# Work Explorer Session-Node UX Spec

> **Purpose:** Make the session node in the Work Explorer worth clicking,
> and make its checklist tell the truth. Today the node says `Session 3`
> and does nothing, and a fully-ticked checklist can still hide an hour of
> close-out — measured at a mean of 57 minutes, 18% of a session. After
> this set the node says what the session is *about*, opens the part of the
> plan that belongs to it, offers the prompt to run it and the files it
> produced, and the checklist stays honest about what remains.
>
> **Created:** 2026-08-10, from operator direction.
> **Prerequisites:** Set 114 complete — its Session 3 expands the session
> node to show *steps*, and this set touches the same node. Landing them in
> either order is fine; landing them **concurrently** is not.
> **Session Set:** `docs/session-sets/115-work-explorer-session-node-ux/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

> **Operator notes are required reading.**
> [`operator-notes.md`](operator-notes.md) carries three step-list
> defects the operator observed live in the Explorer on 2026-08-10
> — a completed step rendering as not-done, `<- here` on the wrong
> row, and an unplanned step ordered after a pending planned one —
> with root causes diagnosed from the session that produced them.
> Two are bugs; the third is a design question to decide, not patch.

> **⚠ Read [`step-ledger-findings.md`](step-ledger-findings.md) before
> starting this set.** Recorded 2026-08-11, after the same defects were
> observed live again during Set 119 Session 2 and traced to a single
> root cause the notes above predate: **the step-status field has no
> vocabulary.** "Done" is spelled four ways across the repo's
> activity logs (`complete` 2,412, `completed` 229, `done` 42,
> `complete-with-known-failures` 1), and ~6 entries carry
> multi-paragraph prose in the status field. Roughly **10% of all step
> entries are mis-rendered** as a result, and `<- here` is behaving
> correctly on corrupt data rather than misbehaving.
>
> **Sessions 1–3 are unaffected and stand as authored.** **Session 4
> should not run as written** — see the note at its heading.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # Every deliverable here is something the operator looks at and clicks. Whether it feels good is an eyes question, not a diff question.
requiresE2E: true         # Sessions 2 and 3 touch the Explorer rendering surface, which the test policy names as a non-negotiable Layer 3 trigger.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 114-rolling-task-list-and-progress-visibility
    condition: complete
```

---

## Why this set exists

Three of these items have been sitting in operator notes since Set 111,
recorded as *"just something to consider for a future enhancement"* and
deliberately deferred because Set 111 S4's artifact-necessity pass had not
yet run. It has. The deferral condition is discharged.

The immediate trigger is smaller and more embarrassing than "a missing
feature": **the framework resolves every session's real title correctly and
then a second writer overwrites it.** Measured 2026-08-10 while drafting
this spec:

- `ai_router/session_state.py::_build_sessions_array` documents and
  implements the resolution order *existing `sessions[]` → `spec.md` regex →
  `Session N`*. Called directly on this set's own folder it returns the real
  titles.
- The file it writes nonetheless lands on disk as
  `Session 1 / Session 2 / Session 3`. Deleting it and re-running the
  blessed Python writer reproduces the generic titles every time.
- The cause is a **second writer**:
  `tools/dabbler-ai-orchestration/src/utils/sessionState.ts` has its own
  `ensureSessionStateFile`, and its `buildSessions` hardcodes
  ``title: `Session ${n}` `` — in a file that **already imports
  `extractSessionTitlesFromSpec` and already calls it**. The extension
  watches `**/{spec.md,session-state.json,…}`, so its synthesizer wins.

Two consequences make this worth a session rather than a patch:

1. **Generic titles are sticky.** Because the resolution order puts the
   existing ledger first, once `"Session N"` is on disk every subsequent
   boundary write carries it forward. Nothing self-heals; that is why
   *every* set in the Explorer shows generic labels today.
2. **Two writers own one file**, which is exactly what writer discipline
   exists to prevent. Fixing the title without settling ownership leaves the
   race in place for the next field.

The fix costs **no additional disk read on either side**: the Python writer
already resolves titles at write time, and the TypeScript side already
computes the title map it fails to use.

## Decisions already made — do not reopen

1. **`spec.md` is not split into per-session files.** Operator-decided,
   2026-08-10, after the question was raised and the cost measured: roughly
   **80 Python modules** read `spec.md` (`spec_config`, `spec_admission`,
   `progress`, `session_state`, `close_session`, `close_backstop`,
   `gate_checks`, `verify_session`, `contract_gate`, `dual_surface_verify`,
   `orchestrator_identity`, `narration`, the migrators), the extension
   watches it, and every consumer repo has its own. It is a portable
   contract.
2. **Generated `spec-1.md` / `spec-2.md` sidecars are refused**, even as
   "redundant files referenced only from the menu." They would be a second
   copy of the truth that goes stale on every spec edit — the exact failure
   Set 113 exists to prevent — and "referenced nowhere else" decays: such
   files land in every session's git diff, in `verify_session`'s work-diff
   evidence bundle, and in reviewers' context.
3. **The per-session view is a read-time slice of the one real file.** The
   session's section is located by regex and *revealed* in `spec.md` itself,
   so the operator keeps context and can scroll to the config block. The
   extractor already exists on the Python side (`verify_session` returns the
   `### Session N of M` section; `progress._SESSION_HEADING_RE` finds the
   headings).
4. **Titles are resolved at write time, by the blessed writer, from the
   spec.** That is what the Python writer already does. This set does not
   move title resolution onto the read path: `normalize_to_v4_shape`,
   `read_status`, the close backstop and the tree scan are hot paths, and
   Set 110 S1 measured the tree's startup cost specifically so the fourth
   level would add **no disk read**. A per-set spec read on the scan would
   regress a measured constraint.
5. **Step rendering belongs to Set 114 S3, not here.** This set adds title,
   activation and menu to the session node. It does not draw step rows.

## Non-goals

- **No new artifact types.** The menu surfaces files that already exist.
- **No "start the session" automation.** Copying a prompt to the clipboard
  is the whole feature; what the operator pastes it into is their business.
  (Set 111's notes flagged that what "start" *means* at the
  extension/orchestrator seam is unsettled — it stays unsettled.)
- **No webview.** The native tree and VS Code's own editor and QuickPick do
  all of this.
- **No custom document scheme** unless Session 2 measures the plain reveal
  as insufficient — and then it is a recorded decision, not a reflex.

---

## Sessions

### Session 1 of 4: The titles both writers already know

**Steps:**

1. Register.
2. **Fix the TypeScript synthesizer.** `utils/sessionState.ts::buildSessions`
   hardcodes ``title: `Session ${n}` `` while the same module already
   imports and calls `extractSessionTitlesFromSpec`. Thread the map it
   already computes into the loop, applying the same resolution order the
   Python writer documents. **No new file read** — if the change adds one,
   it is the wrong change.
3. **Settle the sticky-generic problem, which is the actual bug.** Because
   resolution puts the existing ledger first, a `"Session N"` already on
   disk is carried forward by every boundary write and never heals. Decide
   and test the rule: a spec heading beats a **generic-shaped** stored title
   (`Session <own number>`), while a genuinely operator-authored title is
   still never overwritten. Every existing set must end up healed without a
   migration script.
4. **Settle which `ensureSessionStateFile` owns lazy synthesis.** Two
   writers — `ai_router/session_state.py` and
   `utils/sessionState.ts` — currently create the same file, and the
   extension's watcher makes the race real and observable. Record the
   ownership decision where writer discipline is documented; a
   Python↔TypeScript parity test for title resolution is the enforcement
   (precedent: the menu-parity test, and `sessionStepModel`'s regex, which
   is explicitly maintained as a mirror).
5. Full pytest and the Layer 2 tree-provider harness at close after freeze;
   verify, close.

**Creates:** the TS title fix, the heal rule, the writer-ownership record, the parity test
**Touches:** `tools/dabbler-ai-orchestration/src/utils/sessionState.ts`, `ai_router/session_state.py`, both test suites, writer-discipline docs
**Ends with:** every session row names what the session is about, existing sets heal themselves, and one writer owns the file.
**Progress keys:** `tsTitlesFixed`, `healRule`, `writerOwnership`, `parityTest`


---

### Session 2 of 4: Left-click a session, land on its plan

**Steps:**

1. Register.
2. **Add a session-scoped reveal**: activating a session node opens
   `spec.md` and reveals/selects that session's `### Session N of M:`
   block. Left-click on a **set** row already opens `spec.md`
   (`dabblerSessionSets.openSpec` via `planLeftClickActivation`) — this is
   the session-level sibling of a behaviour that exists, so reuse the
   plumbing rather than adding a parallel one.
3. **Degrade to the truth.** A malformed or missing heading opens `spec.md`
   at the top rather than erroring or showing nothing. The operator always
   ends up looking at the real file.
4. **Keep the decision honest about scope**: if the plain reveal reads as
   too unfocused when actually used, record that finding — a read-only
   virtual document on a custom scheme is the sanctioned next step, and it
   is a *recorded* decision with a reason, not a default.
5. Full Layer 3 at close after freeze; verify, close.

**Creates:** the session-node activation, the section locator, its Layer 3 coverage
**Touches:** `tools/dabbler-ai-orchestration/src/providers/`, `commands/openFile.ts`, Layer 3 specs
**Ends with:** clicking session 3 puts session 3's plan on screen, from the same file the framework reads.
**Progress keys:** `sessionActivation`, `sectionLocator`, `degradationTested`

---

### Session 3 of 4: The menu — the prompt, and the evidence

**Steps:**

1. Register.
2. **Add session-scoped context-menu actions** through the existing
   `ActionRegistry` and the `contextValue` vocabulary the session node
   already carries (`workExplorerTreeModel` emits `session-<status>`
   tokens), so menu parity stays enforced by the existing parity test
   rather than by hand.
3. **Copy the run prompt for that session.** Session-scoped sibling of the
   set-level L5 clipboard shortcut, and of the existing builders in
   `commands/copyPromptCommands.ts`. Gate on status the way
   `planLeftClickActivation` does — and **fail closed on an unrecognised
   status**, as that helper deliberately does.
4. **Open the artifacts for that session** — QuickPick when there is more
   than one, reusing the `openSpec` plumbing the registry already notes for
   this case. **Discover them by convention (`s<N>-*`), never by a
   hardcoded list**, so the menu survives artifact churn; show an honest
   empty state when a session has produced nothing yet.
5. Full Layer 3 at close after freeze; verify, close.

**Creates:** the session context menu, the prompt and artifact actions
**Touches:** `tools/dabbler-ai-orchestration/src/providers/ActionRegistry.ts`, `commands/`, `package.json` menus, Layer 3 specs
**Ends with:** a session row offers the prompt to run it and the files it produced, and says so plainly when there are none.
**Progress keys:** `menuWired`, `runPromptAction`, `artifactAction`

---

### Session 4 of 4: What still remains, in the surface you watch

> **Unblocked 2026-08-11.** This session previously carried a
> **⚠ DO NOT RUN AS WRITTEN** notice over three findings in
> [`step-ledger-findings.md`](step-ledger-findings.md). All three are now
> resolved, and resolving them **shrank this session to a renderer** —
> exactly as §6 of that document predicted.
>
> | original blocker | resolution |
> | :--- | :--- |
> | **1. Would render corrupt data** — no validated step vocabulary, ~10% unrecognised tokens | **Set 120 S1** made the writer strict; **120 S2** migrated the 271 lossless tokens. The vocabulary is `pending / in-progress / complete / blocked`. |
> | **2. The contradiction** — show outstanding lifecycle phases while rendering only what is recorded | **Dissolved, not argued away.** See below: `close_preflight` already *computes* the obligations, so the renderer renders a recorded computation rather than synthesising policy. |
> | **3. Motivating measurement was a mean** | Rebaselined: close-out execution is **0.1 min median** across 104 sets / 295 sessions. The 57-minute figure bundled operator-away time. |
>
> **Sol's six preconditions, re-checked 2026-08-11:** (1) a canonical
> applicability state machine — **already exists as `close_preflight`**;
> (2) validated vocabulary — **shipped, 120 S1**; (3) explicit semantics
> for absent / corrupt / stale — **shipped, 120 S3** (`unknown`, and
> `evidence: absent | unreadable | read`); (4) no criterion satisfiable by
> a false "complete" — **satisfied by construction**, because
> `close_preflight` derives from the same predicates `close_session` runs;
> (5) an audited prototype comparing files, Python and tree —
> `test_step_row_parity.py` and its fixture; (6) evidence operators watch
> the expanded session — **operator confirmed 2026-08-11: *"Often — I
> watch the expanded session while work is in flight."***

**Why the contradiction is gone.** The objection was that showing
outstanding lifecycle phases requires inventing obligations from policy,
because nothing is recorded before verification or close happens. But
`close_preflight` (Set 119 S2) *"reports every unmet close-out obligation
for a session, in one pass, with no side effects and no routed call,
runnable at any time."* Its JSON is already the render model:

```
obligations: [{ check, met, blocking, detail, action }],  would_close: bool
```

So this session renders **what a sanctioned Python component computed**,
which is Set 114's discipline intact — *render what is recorded* — with
the recording done by the component that owns the question.

**The constraint that shapes the build.** Measured 2026-08-11:
`close_preflight` takes **6.6 seconds** (git-backed predicates plus
interpreter startup). That is far too slow to call from a tree that
refreshes on file changes. It must therefore follow the pattern Set 120
S3 established: **compute to a serialized projection with an input
digest; the tree reads the file instantly and renders staleness
honestly.** Do not call the CLI from the renderer.

**A defect this session must fix, found while re-authoring.** Set 120 S3
removed `<- here` **from Python only**. In the committed tree today:

- `ai_router` — `HERE_MARKER` is gone, with a test asserting `not hasattr(sc, "HERE_MARKER")`
- `workExplorerTreeModel.ts:352` — `export const HERE_MARKER = "<- here";` **still defined**
- `workExplorerTreeModel.ts:660` — `description: row.isHere ? HERE_MARKER : undefined` **still rendered**

The operator's ruling was *drop the marker, show the in-progress icon
instead*. In the surface they actually watch, **neither half has
happened**: the marker still renders and the icon still does not, because
`stepDescriptor` derives its glyph from `row.status` alone
(`:645`). This is `L-069-1` — *a bug is a bug CLASS; fix every sibling
site* — with the Python site fixed and its TypeScript mirror missed.

**Steps:**

1. Register.
2. **Serialize the close-out obligations.** Add a `--write` projection to
   `ai_router/close_preflight.py` in the shape `session_projection.py`
   already uses — same digest-based staleness, same explicit absence
   states, no new vocabulary. **CLI first**, so consumers who install from
   PyPI and never use the extension get it too; that has been this set's
   rule throughout.
3. **Render the obligations under the expanded session node**, reading the
   projection file rather than shelling out. A stale projection renders as
   **stale**, never as truth — an obligation list that silently lags is
   worse than none, because it says "nothing remains" when something does.
   Absent and unreadable stay distinguishable, per 120 S3's vocabulary.
4. **Finish the marker removal in TypeScript.** Delete `HERE_MARKER` and
   its render site, and let the in-progress state reach the icon:
   `glyphStatusOf` already maps `in-progress` and
   `ICON_FILES["in-progress"]` already resolves `in-progress.svg`, which
   session rows use — only the wiring is missing. **Grep both languages
   for every sibling site before declaring it done** (`L-069-1`); this
   session exists partly because that step was skipped once already.
5. **Walk it, then close.** This set's UAT is the guided look across all
   four sessions — titles, left-click, both menu actions, the empty
   states, the in-progress icon on the current step, and an obligations
   list that still shows work outstanding when work is outstanding.
   `package.json` and the tree model are both in scope, so **`L-064-12`
   applies**: full `npm run test:playwright` after the last edit. Then
   full pytest, verify, close, `change-log.md`, Step 9 review. Coordinate
   the extension version bump with whatever is unpublished at that point.

**Creates:** the close-out obligation projection, its tree rendering, the finished marker removal, this set's walk, `change-log.md`
**Touches:** `ai_router/close_preflight.py`, `ai_router/tests/`, `tools/dabbler-ai-orchestration/src/providers/workExplorerTreeModel.ts`, Layer 3 specs
**Ends with:** while a session is in flight the operator can see, in the row they already watch, which step is current and what still stands between here and close.
**Progress keys:** `obligationProjection`, `obligationsRendered`, `stalenessHonest`, `markerRemovedInTs`, `inProgressGlyph`, `uatWalk`

> **Scope note.** The original Session 4 proposed a lifecycle-aware
> checklist model derived from six ledgers. That work is **not needed**:
> `close_preflight` already reads those predicates, so building a second
> derivation would recreate the duplication Set 120 spent a session
> removing. If this session finds an obligation the preflight does not
> cover, the fix belongs **in the preflight**, not in a parallel model in
> the renderer.

---

## End-of-set deliverables

- Session rows named for what they do, derived from `spec.md` at read time
  with no migration and no new writer.
- Session-scoped activation that reveals that session's plan inside the one
  real `spec.md`.
- A session context menu offering the run prompt and the session's
  artifacts, discovered by convention.
- Layer 3 coverage for each, and one operator walk of the whole row.

## Risks this set should expect

- **Set 114 S3 draws step rows on the same node.** Concurrent work on the
  session node is the likeliest source of conflict in this set; the
  prerequisite exists for that reason. If 114 is still open, stop.
- **Do not move title resolution onto a read path to "fix" it.**
  `normalize_to_v4_shape` is called by the status reader, the close
  backstop, `gate_checks`, `orchestrator_identity` and `session_lifecycle`;
  the tree scan walks every set. `extract_session_titles_from_spec` reads
  and regex-scans the **whole** spec per call and returns **all** titles at
  once — so calling it per session instead of per set turns one read into
  N. The write-time resolution that already exists costs nothing on either
  path; keep it there.
- **Title drift is a feature, not a bug.** A renamed heading should reach
  the row. The heal rule in Session 1 exists so drift resolves *toward* the
  spec; do not "stabilise" titles by making the stored value always win,
  which is precisely the behaviour that produced the current bug.
- **Two writers, one file.** Until Session 1 records ownership, the Python
  writer and the extension's synthesizer can both create
  `session-state.json`, and the extension's file watcher makes the race
  observable. Any session that edits state-writing code should re-read that
  record first.
- **The menu is where scope creep lands.** "While we're here" additions —
  start the session, rename, re-run verification — are not in this set. The
  seam they need is unsettled and Set 111 said so.

