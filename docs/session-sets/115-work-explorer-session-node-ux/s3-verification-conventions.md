# Set 115 Session 3 — verification conventions

Read this before the change set. It states the agreed baseline so a round
spends its findings on real defects rather than on the ground truth.

## What this session shipped

**A session row's context menu: the prompt to run it, and the files it
produced.** Two entries, both reaching the menu through the existing
`contextValue` vocabulary rather than through hand-written `when` clauses.

1. **`SESSION_ACTIONS` in `providers/ActionRegistry.ts`** — a second
   registry beside `ROW_ACTIONS`, deliberately separate because a session
   action's `when` reads the SESSION and all twelve existing entries read
   only the set; widening `RowAction.when` would make every set action's
   signature lie about what it reads. What is *not* separate is the token
   seam: both lists mint tokens through the same `actionToken`, land in the
   same `viewItem =~ /;act-…;/` menus, and are held to the same forward and
   backward parity assertions. `sessionDescriptor` now emits the applicable
   tokens the same way `setDescriptor` has since Set 110.

2. **`dabbler.copySessionRunPrompt`** — copies
   `Start the next session of \`<slug>\`.`, the framework's own documented
   trigger phrase, verbatim from the existing
   `buildStartNextSessionPrompt`. The gate is
   `rowMenuHelpers.sessionOffersRunPrompt`: the set-level half **borrows**
   `planLeftClickActivation` (so the set row and the session row cannot
   drift on what a runnable set is), and the session-level half is
   `nextRunnableSessionNumber` — walk the ledger ascending, skip
   `complete` / `cancelled`, and the first survivor is runnable only if it
   is `in-progress` or `not-started`.

3. **`dabblerSessionSets.openSessionArtifacts`** — discovers a session's
   artifacts by convention (`^s<N>-`, case-insensitive, files only, top
   level of the set dir, sorted), opens one directly, offers a QuickPick
   for several, and reports an honest empty state naming the session, the
   set and the convention. It reuses `openIfExists` and the same
   three-way shape `openPrerequisiteSpec` already uses.

## Two journaled decisions this round should read as settled

Both are in `decisions.jsonl` (session 3), with options and consequences.
They are **decisions, not oversights** — please grade a disagreement as a
design dispute rather than as a defect.

- **The run prompt appears on ONE row per set, not on every non-terminal
  session.** Step 3 says "gate on status the way `planLeftClickActivation`
  does". Taken literally that puts the entry on session 4 while session 3
  is next — and the copied text is a SET-scoped phrase, so it would start
  a different session than the row it came from. The gate is therefore
  strictly narrower than the literal reading: the row that carries the
  phrase is the row that phrase resolves to. An unrecognised session
  status offers the prompt **nowhere** in that set rather than guessing
  which session is next; `step-ledger-findings.md` measured ~10% of step
  entries carrying unrecognised status tokens, so this input is real.
- **The artifact entry is unconditional and answered on the click.**
  Hiding it on an empty session would require a `readdir` per session row
  on the tree scan — the measured constraint spec decision 4 and Set 110
  S1 protect. "Nothing yet" is a sentence, not a missing menu entry.

## Deliberate scope — by design, not omissions

- **The Set 110 S2 rule "no menu entry targets a session row" is
  SUPERSEDED, not violated.** It was written so that a future addition
  would be a decision rather than a leak; this session is that decision.
  The assertion was **narrowed** rather than deleted — it still covers
  bucket and step rows — and a new Set 115 S3 parity suite records the
  replacement rule. Session 2's own conventions file states the old rule;
  it is a closed session's record and is not edited.
- **No new artifact types, no "start the session" automation, no
  webview.** The spec's non-goals. The menu surfaces files that already
  exist, and copying a prompt is the whole feature.
- **No session-scoped trigger phrase was minted.** `Start session N of
  <slug>` is not in `docs/ai-led-session-workflow.md` → Trigger Phrases,
  and an extension session is the wrong place to define an orchestrator
  contract no gate enforces.
- **No step-row or title/state-writer changes.** Set 114 S3 and Set 115
  S1 respectively; both closed.
- **No inline (icon) actions.** The two-inline cap is a module-row
  constraint from Set 110 S1's spike evidence; session actions stay in the
  context menu and a parity test asserts it.

## Suite baseline (measured this session, post-change)

- **Layer 2 (`npm run test:unit`): 1746 passing, 1 pending.** No failures.
  The pending one is pre-existing. Session 2's baseline was 1721; the
  delta is this session's 25 new assertions (20 in the new
  `sessionRowActions.test.ts`, 5 in the new menu-parity suite).
- **Layer 3: the new `session-menu.spec.ts` passes 3/3 in a real
  extension host** (48.7s). The full Layer 3 run of record is taken at
  close, after the last code change, per `project-guidance.md` → Build and
  Test.
- **Layer 1 (pytest): not re-run — no Python source changed.** The only
  Python-adjacent edits are this set's own session records
  (`activity-log.json`, `decisions.jsonl`, `checklist-posts.jsonl`,
  `session-events.jsonl`, `session-state.json`), all written by sanctioned
  writers. The close-time run of record confirms the standing baseline.

## Falsifier discipline (L-112-1)

The new parity assertions were **falsified before being trusted**: the
`when` clause for `dabbler.copySessionRunPrompt` was temporarily repointed
at another action's token, and
`workExplorerMenuParity.test.ts` failed with the exact
mismatch. The Layer 2 suite plants its own violations too — five
unrecognised status spellings (`completed`, `done`, `""`, `COMPLETE`,
`finished`), and an `s30-verification.md` decoy that a bare prefix test
would hand to session 3.

## Release contract

- **No version bump, deliberately.** The operator ruled on 2026-08-11 that
  the next Marketplace push happens once, after Set 120 S3 and Set 115
  Sessions 1–3 land. This session's entry lands in the CHANGELOG's
  `[Unreleased]` section, which is where that ruling says it belongs.
- **`dist/extension.js` and `dist/extension.js.map` are committed build
  artifacts** in this repo, regenerated by `npm run compile`. Their diff is
  generated output, not authored code, and `verify_session` excludes
  `dist` from the evidence bundle by default.
- **`README.md`'s "Row interactions" bullet was corrected in the same
  pass.** It described the retired webview QuickPick — a `Copy Eval ▸`
  submenu, an `Open Orchestrator Writer Log` entry retired in Set 049 S4,
  and `Dabbler: Copy …` Evaluate commands that `contributes.commands` no
  longer declares. It documents the exact surface this session extends, so
  leaving it while adding to it would have been the L-064-8 defect
  (authoritative-reading prose inherited from a superseded design).

## Severity rubric (L-095-1)

Grade by **consequence**: probability the stated failure scenario reaches a
real user × impact. Low probability **or** low impact is Minor. A finding
with no nameable failure scenario is a nit, not a Major. Please state the
scenario explicitly for anything graded Critical or Major.
