# Session Set: Cancelled Status + Cancel/Restore Lifecycle

## Summary

Add a fourth lifecycle state — **Cancelled** — to the Session Set
Explorer, alongside the existing in-progress / not-started / done.
Surface it as a tree-view group that only appears when at least one
cancelled set exists, plus right-click `Cancel` and `Restore` actions
that maintain a markdown-file audit trail in the session-set folder.

The on-disk shape:

* **`CANCELLED.md`** — present means the set is currently cancelled.
* **`RESTORED.md`** — present (and `CANCELLED.md` absent) means the
  set was once cancelled and has been restored. Kept indefinitely as
  audit. A subsequent re-cancel renames `RESTORED.md` → `CANCELLED.md`
  and prepends a new "Cancelled on …" line, so the file accumulates
  the full toggle history.

`CANCELLED.md` always wins over any other state signal: a set with
both `change-log.md` (done) and `CANCELLED.md` shows as Cancelled,
not Done. The user may decide to cancel a partially-completed set
mid-stream, and that signal must dominate.

---

## Why this set comes after Set 7

Set 6 closes the redesign — docs collapse, fresh close-out turn,
alignment audit. Set 7 establishes a uniform `session-state.json`
shape (synthesized for not-started sets, backfilled for legacy
sets) so every reader can assume the file exists. This set rides
on top of Set 7's invariant: cancel/restore can always update
`session-state.json` without an "if file exists" branch.

This set is small, additive, and entirely UI- and file-shape-side.
None of the queue / role-loop / gate machinery from Sets 1–4 is
touched.

---

## Scope

### In scope
- New `Cancelled` lifecycle state in:
  - `tools/dabbler-ai-orchestration/src/types.ts` (`SessionState` union)
  - `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`
    (group rendering, state detection, context-value tagging)
  - `ai-router/__init__.py` (`print_session_set_status` parallel logic)
- `session-state.json` field plumbing (riding on Set 7's "file always
  exists" invariant):
  - On cancel, capture the current `status` value into a new
    `preCancelStatus` field, then set `status: "cancelled"`
  - On restore, read `preCancelStatus`, write it back to `status`,
    clear `preCancelStatus`
  - Two separate fields, not a composite `"cancelled @ in-progress"`
    string — readers that want a display label render
    `"Cancelled (was in-progress)"` from the pair
  - If `preCancelStatus` is missing (e.g., manually-edited file),
    fall back to file-presence detection
- Right-click commands `dabblerSessionSets.cancel` and
  `dabblerSessionSets.restore` with confirmation dialogs
- File-shape helpers in a new module
  `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts`:
  `cancelSessionSet(folder, reason?)` and `restoreSessionSet(folder)`
- The `Cancelled` tree group only renders when ≥ 1 cancelled set is
  present (parallels the spec's existing rule for not-started groups)
- Iconography: a new `cancelled.svg` glyph in
  `tools/dabbler-ai-orchestration/media/`
- Tests: file-shape unit tests + tree-rendering snapshot
- Workflow doc note in `docs/ai-led-session-workflow.md` describing
  when to cancel vs. when to mark a set done

### Out of scope
- Automatic cancellation triggered by router-side signals (e.g.
  "abandon set if no commits for 90 days"). Cancel/restore is a
  pure-operator action.
- Cancellation of an individual session within a set. Cancel
  applies to whole session sets only.
- `mark_session_complete` / close-out gate integration. The
  close-out gate refuses to run on a cancelled set, but does so via
  the existing "no `disposition.json`" path — no new gate check.
- Migration tooling for repos that already have ad-hoc `CANCELLED`
  files in non-standard shapes. The new shape is canonical going
  forward; pre-existing files (none known) would be hand-migrated.

---

## On-disk file shape

### `CANCELLED.md`

```markdown
# Cancellation history

Cancelled on 2026-05-14T11:23:07-04:00
<reason text — entered by the operator in the confirmation dialog,
or left blank for them to fill in later>

Restored on 2026-05-10T09:00:00-04:00
<earlier restore reason>

Cancelled on 2026-05-08T17:42:00-04:00
<earlier cancel reason>
```

The most recent action is at the top. The dialog seeds the new
entry but does not require the operator to type a reason — empty
reasons are valid. Future cancel/restore toggles prepend to the
existing file rather than overwriting.

### `RESTORED.md`

Same shape, same accumulated history. The filename signals the
*current* state; the content is identical regardless of which name
the file is currently using.

### Detection rules

```
if CANCELLED.md exists      -> state = "cancelled"   (highest precedence)
elif change-log.md exists   -> state = "done"
elif activity-log.json
     or session-state.json  -> state = "in-progress"
else                        -> state = "not-started"
```

`RESTORED.md` is **not** a separate state — once restored, the set
falls back to whichever of done / in-progress / not-started its
other files indicate. `RESTORED.md` is purely an audit artifact.

---

## Sessions

### Session 1: File-shape helpers + Python parallel + tests

**Goal:** Land the canonical shape on disk and the read/write helpers,
in both TypeScript (for the extension) and Python (for
`print_session_set_status` and any future close-out integration).

**Deliverables:**
- `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts`:
  - `isCancelled(folder: string): boolean`
  - `wasRestored(folder: string): boolean`
  - `cancelSessionSet(folder, reason?: string): Promise<void>`
    - If `RESTORED.md` exists, rename it to `CANCELLED.md` first.
    - If neither exists, create `CANCELLED.md` with header.
    - Prepend `Cancelled on <ISO-8601 local>\n<reason or "">\n\n`.
  - `restoreSessionSet(folder, reason?: string): Promise<void>`
    - Requires `CANCELLED.md` to exist; throws otherwise.
    - Rename `CANCELLED.md` to `RESTORED.md`.
    - Prepend `Restored on <ISO-8601 local>\n<reason or "">\n\n`.
- `ai-router/session_lifecycle.py` (new module):
  - Same three predicates and two write functions as TS.
  - Reused by `print_session_set_status` to render `[!]` for
    cancelled sets in the ASCII status table.
- Update `print_session_set_status` in `ai-router/__init__.py`:
  - Cancelled sets render with `[!]` glyph (mirrors `[~]` / `[ ]` /
    `[x]` for in-progress / not-started / done).
  - Cancelled sets sort to the bottom of the table.
- Unit tests in both languages covering:
  - First-time cancel (no prior file) creates `CANCELLED.md`
  - Cancel after restore renames `RESTORED.md` → `CANCELLED.md`
    with history preserved + new entry prepended
  - Restore renames + prepends
  - Restore without `CANCELLED.md` throws
  - Empty reason is valid
  - Multi-cycle (cancel → restore → cancel → restore) preserves all
    four history entries in order

**Acceptance:**
- File shape matches the documented format byte-for-byte (TS and
  Python both write the same line-ending, prefix, and timestamp
  format)
- All unit tests pass in both languages

### Session 2: Extension UI — tree view, icons, commands, dialogs

**Goal:** Wire the new state through the explorer view end-to-end.

**Deliverables:**
- `SessionState` type extended with `"cancelled"`
- `SessionSetsProvider.ts`:
  - State-detection function checks `CANCELLED.md` first (highest
    precedence), per the rules table above
  - `getChildren` returns four groups: In Progress, Not Started,
    Done, Cancelled
  - Cancelled group is only emitted when its array is non-empty
    (parallels the conditional rendering noted in the existing
    code for empty groups)
  - Context value for cancelled items uses `sessionSet:cancelled` so
    the right-click menus can target it specifically
- `media/cancelled.svg` icon (visually distinct from done — typical
  choice: muted grey with strikethrough or X glyph)
- `package.json`:
  - New commands `dabblerSessionSets.cancel` and
    `dabblerSessionSets.restore`
  - `view/item/context` entries:
    - `Cancel` visible on `sessionSet:(in-progress|not-started|done)`
    - `Restore` visible on `sessionSet:cancelled`
  - Both commands grouped at `9_lifecycle@1` and `9_lifecycle@2`
    so they sit below Open/Reveal/Copy entries
- Confirmation dialogs:
  - Cancel: `vscode.window.showInformationMessage` with `Cancel
    Set` (destructive-ish) and `Keep` buttons, plus an optional
    `showInputBox` for a reason that prefills the new history
    line. Reason is optional; an empty reason is allowed.
  - Restore: simpler "Restore '<slug>'?" Yes/No dialog. Reason
    input is optional and offered for symmetry but rarely used.
- After a successful cancel/restore, fire the existing tree
  `_onDidChangeTreeData.fire()` so the view refreshes immediately
- Unit/integration tests via the extension test harness covering:
  - Cancelling a not-started set moves it to the Cancelled group
  - Cancelling an in-progress set moves it to the Cancelled group
    (state precedence is correct)
  - Cancelling a done set moves it to the Cancelled group
  - Restoring returns the set to its underlying state (done if
    `change-log.md` is present, in-progress if activity-log only,
    not-started if neither)
  - The Cancelled group is hidden when there are no cancelled sets

**Acceptance:**
- All test scenarios pass
- Manual smoke test: cancel + restore cycle in a real workspace
  shows correct icon, group placement, and file shape
- The extension's existing functionality is unchanged for sets
  that have neither `CANCELLED.md` nor `RESTORED.md`

### Session 3: Workflow doc + cross-provider alignment + cleanup

**Goal:** Document the new lifecycle, run the cross-provider verifier
check, and tidy any drift.

**Deliverables:**
- New section in `docs/ai-led-session-workflow.md` titled "Cancelling
  and restoring a session set":
  - When to cancel (set was started in error, scope rolled into
    another set, requirement removed mid-flight, etc.)
  - When NOT to cancel (a successfully-completed set should be
    marked done via the close-out gate, not cancelled)
  - How the operator triggers it (right-click in explorer, or
    manually create/delete `CANCELLED.md`)
  - The `RESTORED.md` audit-only role
- Update `print_session_set_status`'s output legend to include the
  new `[!]` glyph
- Update `tools/dabbler-ai-orchestration/README.md` with screenshots
  of the new tree group and right-click menu
- Cross-provider review by **Gemini Pro** of the file-shape contract
  and state-precedence rules. Specifically asking the verifier to
  check: (a) does the precedence ordering have edge cases, (b) is
  the prepend-to-existing-file scheme robust against partial writes,
  (c) does the symmetric `Cancel` / `Restore` UI risk operator
  confusion in any state.
- Address verifier findings or document why each was rejected
- Final test sweep: full ai-router suite + extension test suite

**Acceptance:**
- Workflow doc covers the new lifecycle
- README screenshots reflect the new UI
- Cross-provider review filed in `session-reviews/session-003.md`
- All tests pass; no regressions

---

## Acceptance criteria for the set

- [ ] `Cancelled` is a first-class state in both the TypeScript
      `SessionState` type and the Python `print_session_set_status`
      logic, with `CANCELLED.md` taking precedence over all other
      signals
- [ ] Right-click `Cancel` and `Restore` commands work end-to-end,
      with confirmation dialogs and optional reason input
- [ ] The Cancelled tree group hides when empty
- [ ] `CANCELLED.md` and `RESTORED.md` accumulate history across
      multiple cancel/restore cycles; nothing is overwritten
- [ ] Restoring a previously-done set returns it to Done (not to
      In Progress) — the underlying-state fallback is correct
- [ ] Workflow doc and README updated; cross-provider review filed
- [ ] No regressions in existing extension or ai-router tests

---

## Risks

- **Race between two operator actions on the same set.** Two open VS
  Code windows could both invoke Cancel within the same second.
  Mitigate: the file-shape helpers use atomic rename + write where
  possible, and the prepend logic re-reads the file inside the
  write call so a parallel write produces a deterministic
  interleaving rather than a torn file. Worst case is two history
  lines instead of one — both correct.
- **Operator cancels a set with a queued outsource-last verifier
  message in flight.** The queue keeps running; the verifier
  daemon has no awareness of the cancel. This is intentional for
  this set — wiring cancel into the queue/gate machinery is out of
  scope and would be a much larger change. The operator can
  manually `--mark-failed` the queued message via the new Set 5
  `Provider Queues` view if they want it stopped.
- **Operator manually edits `CANCELLED.md` / `RESTORED.md` between
  toggles.** The prepend logic reads → modifies → writes, so manual
  edits are preserved. The format is markdown so even a malformed
  edit doesn't break detection (filename presence is what matters).
- **Cross-platform line-ending drift.** TypeScript and Python writers
  must agree on the on-disk shape so a set cancelled on Windows
  reads identically when the same repo is opened on macOS. Pin
  both writers to LF newlines and UTF-8 (no BOM).
- **`Cancel` is a reserved word in the right-click menu UX**. VS
  Code's existing `Esc` / `cancel` semantics are about dismissing
  modal dialogs. Mitigate: the command title is "Cancel Session
  Set" (full phrase), not "Cancel", so the right-click entry
  doesn't read ambiguously.

---

## References

- Existing extension: `tools/dabbler-ai-orchestration/`
- State-detection logic this set extends:
  - `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`
  - `tools/dabbler-ai-orchestration/src/types.ts:1` (SessionState union)
  - `ai-router/__init__.py` (`print_session_set_status`)
- Set 5: `005-vscode-extension-and-queue-views` (parallel pattern
  for "view group only when populated" — used by Heartbeats /
  Provider Queues)

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
