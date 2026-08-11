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

### Session 4 of 4: The checklist tells the truth about what remains

> **⚠ DO NOT RUN AS WRITTEN.** Three findings recorded 2026-08-11 in
> [`step-ledger-findings.md`](step-ledger-findings.md), any one of which
> is disqualifying on its own:
>
> **1. It would render corrupt data.** The step-status field has no
> validated vocabulary; ~10% of step entries carry an unrecognised token.
> Nothing this session builds renders correctly until a status allowlist
> lands at the writer — a **router** change, out of this set's scope.
>
> **2. It contains a contradiction** (independent review, GPT-5.6 Sol):
> it requires showing *outstanding lifecycle phases* while *rendering only
> what is recorded, never what is planned.* Before verification,
> disposition, remediation or close happens there is no record, and
> absence cannot distinguish pending from not-applicable from
> not-yet-knowable from corrupt. It therefore cannot deliver its own
> "fully ticked means actually finished" promise without synthesising
> expected obligations from policy — which it forbids itself.
>
> **3. Its motivating measurement needs rebaselining.** The 57-minute
> figure below is a **mean**, and wall-clock spans include operator-away
> time — Set 116's spec had already ruled that *"the median is the honest
> signal and the maxima are not effort,"* and the operator has since
> confirmed the 402-minute outlier cited below was waiting on a human.
> Measured from `session-events.jsonl` across 104 sets / 295 sessions,
> **close-out execution is 0.1 min median.** The phenomenon the operator
> observed is real — a ticked checklist can hide remaining work — but its
> magnitude, and therefore this session's budget, is unestablished.
>
> **Also unresolved:** Sol's sixth precondition asks for *evidence that
> operators keep the session node expanded and act on it.* The tree is
> lazy and its rows are collapsed by default, so "persistent" does not
> establish "watched at the moment intervention matters."
>
> **And the architecture may make this session smaller.** The same
> derivation exists twice — 1,680 lines of Python against 1,830 of
> TypeScript, guarded by 110 TS tests plus a parity harness that exists
> only because there are two implementations. Computing the projection
> once in Python and serialising it (the operator's 2026-08-11 proposal)
> would reduce this session to a renderer.
>
> **Re-author after the prerequisites in `step-ledger-findings.md` §7, or
> drop this session and ship Sessions 1–3.**

The operator's observation, 2026-08-10: *"you can have all tasks checked
off and there is still a lot of outstanding work to be done (e.g., a final
test run) and other close out steps."*

**Measured:** across sets 108-114, a mean of **57 minutes — 18% of a
session — elapses after the last box ticks**, and in six sessions it was
45% or more (402 min in 111 S4, 246 in 111 S2, 200 in 108 S4).

**Cause:** Set 114 seeds the checklist from `spec.md`'s steps, and every
spec compresses the lifecycle into one trailing step. Set 114 S3's own
seeded plan ended `plan-step | verify-close` — a single box standing for
the discovery round, the supplementary round, remediation,
remediation-review, the final full suite, `disposition.json`,
`change-log.md`, the Step 9 review, the path-aware critique, commit, push
and `close_session`. The checklist therefore reads 5/5 at the moment
verification *begins*.

**Steps:**

1. Register.
2. **Render the lifecycle, not just the plan.** Extend the checklist model
   so close-out phases are rows in their own right: verification rounds,
   remediation, the final applicable suite, disposition, close. The spec's
   steps remain what they are — the *implementation* plan — and stop being
   mistaken for the whole session.
3. **Derive them from ledgers that already exist** — `sN-rounds.jsonl`
   (phase, verdict, `endedLoop`), `sN-remediation-round-*.md`,
   `test-runs.jsonl`, `disposition.json`, `session-state.json`. **No new
   writer and no new artifact**; the data is on disk and only the renderer
   is wrong. Keep Set 114's discipline: render what is *recorded*, never
   what is merely planned.
4. **Ship it in `ai_router/session_checklist.py` first**, so consumers who
   install from PyPI and have no extension get it, then render the same
   model in the tree. Same reasoning as every other decision in this set:
   the CLI is the portable surface. **While in the step rows, fix the
   in-flight glyph**: `stepDescriptor` derives its icon from `row.status`
   alone, so the row the session is actually on shows `<- here` in the
   description and **no in-progress icon** — a logged step reads `complete`
   (it is recorded after it happens) and the planned row ahead reads
   `not-started`. Nothing is missing but the wiring: `glyphStatusOf`
   already maps `in-progress`, and `ICON_FILES["in-progress"]` already
   resolves `in-progress.svg`, which session rows use. Let `isHere` reach
   the icon.
5. **Walk it, then close.** This set's UAT is the guided look across all
   four sessions — titles, left-click, both menu actions, the empty states,
   and a checklist that still shows work outstanding when work is
   outstanding. Full matrix once at the release boundary; verify, close;
   `change-log.md`, Step 9 review, advisory path-aware critique. Coordinate
   the extension version bump with whatever is unpublished at that point.

**Creates:** the lifecycle-aware checklist model, the CLI renderer, the tree rendering, this set's walk, `change-log.md`
**Touches:** `ai_router/session_checklist.py`, `tools/dabbler-ai-orchestration/src/providers/`, Layer 3 specs
**Ends with:** a fully-ticked checklist means the session is actually finished — and while close-out is running, the operator can see which phase it is in.
**Progress keys:** `lifecycleRows`, `derivedFromLedgers`, `cliFirst`, `inFlightGlyph`, `uatWalk`, `changeLog`


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

