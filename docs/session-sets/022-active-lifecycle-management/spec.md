# Active session-set lifecycle management

> **Purpose:** Make session sets transition cleanly and visibly
> through their lifecycle — set appears in **In Progress** the
> moment the human says "start next session"; the fraction
> advances monotonically `0/N → 1/N → … → N/N`; the set moves
> to **Done** the moment the final session closes. Tier-symmetric:
> works equivalently for Full and Lightweight tiers. Augments the
> v0.13.11 defensive guards rather than replacing them.
>
> **Session Set:** `docs/session-sets/022-active-lifecycle-management/`
> **Created:** 2026-05-15
> **Workflow:** Full
> **Prerequisite:** v0.13.11 + ai_router 0.2.2 shipped (`7166754`).
> The mixed-mode-drift defensive guard and `--repair --apply` event
> backfill are this set's foundation; the work here is the *active*
> protocol so those guards become recovery tools, not the normal path.

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: medium
outsourceMode: first
```

> Rationale: code + doc changes touching `ai_router/`, the extension,
> and the workflow doc. No UI surface; no end-to-end browser testing.
> Cross-provider verification at end of each session.

---

## Problem statement

A session set today doesn't transition cleanly through its lifecycle
in the Session Set Explorer:

1. **At session start.** When the human says "start the next
   session", `session-state.json` often doesn't change for some
   time. The set may continue to appear in **Not Started** (or
   with a stale fraction like `0/4` even after session 1 has
   begun). The orchestrator AI starts working without first
   declaring "session N is in flight" on disk.

2. **At session close.** Indicators drift out of sync:
   `currentSession`, `completedSessions[]`, `status`,
   `lifecycleState`, activity-log entry counts, and events-ledger
   closeouts can disagree. On the final session, the set should
   transition to Done; today it sometimes doesn't, or does so
   with the wrong fraction.

3. **Fraction monotonicity.** The displayed fraction should
   advance `0/N → 1/N → 2/N → … → N/N` (Done). Off-by-one issues
   and stale values currently happen.

The mixed-mode drift fix that shipped in v0.13.11 (extension tree-view
guard) and ai_router 0.2.2 (`--repair --apply` event backfill) handles
*recovery* from drift. This set delivers the *prevention* layer: a
"state first, work second" protocol enforced by the orchestrator,
backed by a tier-symmetric writer mechanism, and made self-healing
via a shared reconciliation helper that runs on every boundary write.

---

## Decisions confirmed with the human (do not re-litigate)

These came from a design round on 2026-05-15 with GPT 5.4 (Codex) and
Gemini Pro. Both engines were given the same prompt; their proposals
overlapped heavily, and where they diverged GPT's framing won on
schema invariants and separation of concerns.

1. **`completedSessions[]` is the authoritative progress ledger** on
   both tiers, maintained on every session close (not just the final
   one). The schema doc's "currently optional but planned" status for
   Full tier becomes "always written."

2. **Mid-set `lifecycleState` stays `work_in_progress`.** Only the
   final close flips it to `closed` (alongside `status: complete`).
   This preserves the v2 schema's pairing rule and keeps the v0.13.11
   guard's semantics intact. Gemini's "flip to closed mid-set" was
   rejected — it would resurrect the exact drift class v0.13.11
   defends against.

3. **State invariant (load-bearing — every writer and reader follows
   this):**
   ```
   currentSession not in completedSessions[]              → session currentSession is in flight
   currentSession in completedSessions[] AND status="in-progress"  → between sessions
   status = "complete"                                    → set done
   ```
   The extension's bucketing rule and the orchestrator's
   "start/close" semantics both derive from this.

4. **`activity-log.json` is a step log only, not a count source.**
   GPT's stricter framing: the activity log records work steps the
   orchestrator took during a session — it must not be polluted with
   synthetic "session N started" entries, and the extension must
   stop using unique `sessionNumber`s in the activity log as a
   count-fallback path. This is a small refactor in
   `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts` that
   yields a cleaner invariant.

5. **Extension stays passive.** No "Start Session" / "Close Session"
   context-menu commands — those would make the IDE a hidden
   dependency. The extension reads state and refreshes when files
   change; it never writes lifecycle state itself.

6. **CLI-driven on Full tier; hand-write on Lightweight.** The
   orchestrator runs `python -m ai_router.start_session <slug>`
   (Full) or hand-writes the same shape to `session-state.json`
   (Lightweight). Same fields, same invariants, different writer
   underneath.

7. **Fraction convention stays `sessionsCompleted / totalSessions`.**
   `1/4` means "one session fully closed, three remaining." UI
   localization can add a "Done" annotation (`1/4 Done`) if
   operator confusion warrants — but the math doesn't change.

8. **Failure mode: passive recovery.** A stranded session
   (`work_in_progress`, currentSession not in completedSessions[],
   no close event) is its own marker. The orchestrator resumes by
   re-reading state and continuing. No new daemon, no automatic
   sweeper for this case. The repair tool covers the manual
   forensic recovery.

---

## Architecture

### Writers

```
                  ┌──────────────────────────────────┐
                  │ compute_effective_completed_     │
                  │ sessions(session_set_dir)        │
                  │  - reads completedSessions[]     │
                  │  - cross-references events       │
                  │    ledger (Full tier)            │
                  │  - last-resort legacy heuristics │
                  └──────────────┬───────────────────┘
                                 │ shared helper called by every boundary write
       ┌─────────────────────────┼─────────────────────────┐
       ▼                         ▼                         ▼
  start_session (CLI)     close_session (CLI)         --repair --apply
  Full tier writer        Full tier writer            healing path
                                                       (backfills
                                                        completedSessions[]
                                                        and missing
                                                        closeout events)
```

Lightweight tier: the orchestrator writes the same fields by hand,
per the protocol below. No router code runs.

### Readers

```
  Extension tree view → fileSystem.ts:readSessionSets()
       │
       ├─ canonical status via readStatus()        (existing)
       ├─ isMidSetComplete() guard                 (v0.13.11)
       ├─ completedSessions.length                 (primary count)
       ├─ events-ledger closeout count             (fallback, Full only)
       └─ state file totalSessions                 (last-resort fallback)

  NOT a count source:
   - activity-log.json unique sessionNumbers ❌
```

### The protocol (tier-symmetric)

**Session start** (orchestrator does this *before any work*):

| Field                    | Value at start                                     |
|--------------------------|----------------------------------------------------|
| `currentSession`         | next session number (max(completedSessions)+1 or 1)|
| `status`                 | `"in-progress"`                                    |
| `lifecycleState`         | `"work_in_progress"`                               |
| `startedAt`              | now (only if previously null)                      |
| `completedAt`            | null (cleared if was set)                          |
| `verificationVerdict`    | null (cleared if was set)                          |
| `completedSessions[]`    | preserved from prior state                         |
| `orchestrator`           | refreshed for this session                         |
| **Events ledger** (Full) | append exactly one `work_started` for this session |
| **Activity log**         | nothing — first real step adds the first entry     |

**Session close** (after verification, before notify):

| Field                    | Value at close (non-final)                | Value at close (final)            |
|--------------------------|-------------------------------------------|-----------------------------------|
| `completedSessions[]`    | append currentSession (sorted, unique)    | append currentSession (sorted, unique) |
| `currentSession`         | unchanged (= just-closed session)         | unchanged (= totalSessions)       |
| `status`                 | `"in-progress"`                           | `"complete"`                      |
| `lifecycleState`         | `"work_in_progress"`                      | `"closed"`                        |
| `completedAt`            | null                                      | now                               |
| `verificationVerdict`    | latest verdict (Full) / unchanged         | latest verdict (Full) / unchanged |
| **Events ledger** (Full) | `closeout_requested` + `closeout_succeeded` for currentSession | same                              |

The "final" branch is reached when, *after appending currentSession*,
`len(completedSessions) == totalSessions`. This is the only place
`status` flips to `complete` and `lifecycleState` flips to `closed`.

---

## Sessions

### Session 1 of 3: ai_router writer changes
**Goal:** Promote `register_session_start` to a CLI, add the
healing helper, make `close_session` maintain `completedSessions[]`,
extend `--repair --apply` to backfill it.

**Steps:**
1. Add `ai_router/start_session.py` with a CLI entry point
   `python -m ai_router.start_session --session-set-dir <path>`.
   - Infers next session via `compute_effective_completed_sessions`.
   - Refuses to advance to N+1 while N is still open (raise / non-zero exit).
   - Idempotent: re-running for the same N is a no-op (no duplicate
     `work_started` event, no state regression).
   - Calls into existing `register_session_start` machinery for the
     event emission + state write; mostly a thin wrapper + boundary
     enforcement.
2. Add `compute_effective_completed_sessions(session_set_dir)` to
   `ai_router/session_state.py`. Read order:
   1. `completedSessions[]` from `session-state.json` (authoritative
      when present and non-empty).
   2. Distinct `closeout_succeeded` event session numbers from
      `session-events.jsonl` (Full tier fallback for older sets that
      pre-date this work).
   3. Legacy heuristics (current `currentSession - 1` fallback) —
      last resort, emits a warning to stderr.
   Returns a sorted list of ints. Both `start_session` and
   `close_session` call it; the result drives `completedSessions[]`
   backfill so the next boundary write heals older or mixed-mode sets.
3. Update `_flip_state_to_closed` in `session_state.py`:
   - On every successful close, append `currentSession` to
     `completedSessions[]` (sorted, unique). On Full tier this is the
     writer; the helper handles backfill from events if the array
     was empty.
   - The final-session detection now uses
     `len(completedSessions) == totalSessions` (post-append), not
     just `change-log.md` presence. Change-log presence stays as a
     belt-and-suspenders signal — both must indicate final session
     for the `status: complete` flip.
4. Extend `close_session --repair --apply` Case 1:
   - In addition to backfilling synthetic closeout events (current
     behavior), also backfill `completedSessions[]` from the events
     ledger using the helper. A drifted set with events for
     sessions 1-4 but a snapshot that claims session 5 done gets
     `completedSessions: [1,2,3,4]` + synthetic session-5 events
     (or whatever the helper resolves to).
5. Tests:
   - `test_start_session_*.py`: idempotency, refuses-N+1-while-N-open,
     correct currentSession inference, work_started event emission.
   - Extend `test_repair_detects_mixed_mode_drift` to assert
     `completedSessions[]` is backfilled.
   - Extend `test_close_session_*.py` final-vs-non-final tests to
     assert `completedSessions[]` is appended on every close and
     status/lifecycleState flip only on final.
6. Bump `ai_router` to 0.2.3 (pyproject.toml + `__init__.py`).

**Creates:** `ai_router/start_session.py`,
`ai_router/tests/test_start_session.py`

**Touches:** `ai_router/session_state.py`,
`ai_router/close_session.py`, `ai_router/tests/test_close_session_session4.py`,
`pyproject.toml`, `ai_router/__init__.py`

**Ends with:** All ai_router tests pass; new CLI works against a
fixture set; `compute_effective_completed_sessions` is the single
source of truth for "how many sessions closed."

**Progress keys:** `session-001/start-cli`,
`session-001/compute-helper`, `session-001/close-writer`,
`session-001/repair-backfill`, `session-001/tests`,
`session-001/version-bump`, `session-001/verification`

---

### Session 2 of 3: Extension reader changes
**Goal:** Make the tree view reflect the new invariant. Drop
activity-log as a count source. Add file watchers if missing.
Localize the fraction display.

**Steps:**
1. In `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`,
   remove the activity-log unique-sessionNumber path from
   `readSessionSets`. The count derivation order becomes:
   1. `completedSessions.length` (primary).
   2. Distinct `closeout_succeeded` session numbers from
      `session-events.jsonl` (Full tier fallback — new path; same
      logic the v0.13.11 `hasCloseoutEventForSession` helper uses,
      generalized to "count distinct sessions").
   3. State file `totalSessions` when `status === "complete"`
      (existing fallback).
   4. No more `currentSession - 1` fallback — the helper from
      Session 1 makes this unnecessary on the writer side, and
      removing the reader-side fallback eliminates an off-by-one
      class.
2. Verify `extension.ts` activation registers a
   `vscode.workspace.createFileSystemWatcher` for
   `**/session-state.json`, `**/session-events.jsonl`, and
   `**/CANCELLED.md` that fires `SessionSetsProvider.refresh()`.
   Add if missing; verify event coverage if present.
3. Update `progressText` in
   `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`:
   - For `state === "done"` rows: append " Done" annotation
     (`4/4 Done`).
   - For in-flight rows where `currentSession` is set and
     `currentSession not in completedSessions[]` (the helper's "in
     flight" predicate, computed in TypeScript): annotate the
     fraction (`0/4 · session 1 in flight`). This is the cosmetic
     fix for "0/4 looks stale during early session 1."
4. Tests:
   - Update existing fileSystem test fixtures that relied on
     activity-log counts to assert the new ordering.
   - Add a regression test: a set with no `completedSessions[]` but
     with `closeout_succeeded` events for sessions 1-3 reads as
     `sessionsCompleted: 3` (verifies the events-ledger fallback).
   - Add a UI-text regression test on `progressText` for the
     in-flight annotation and Done annotation.
5. Bump extension to v0.13.12 (package.json + package-lock.json +
   CHANGELOG.md + CLAUDE.md).
6. Compile + smoke-test against a real session set.

**Creates:** none

**Touches:** `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`,
`tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`,
`tools/dabbler-ai-orchestration/src/extension.ts` (if watcher add
needed), `tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/package-lock.json`,
`tools/dabbler-ai-orchestration/CHANGELOG.md`, `CLAUDE.md`

**Ends with:** Extension reflects the new invariant; tree view
auto-refreshes on any state-file change; in-flight rows visibly
distinguish "session 1 in flight" from "no work started yet."

**Progress keys:** `session-002/drop-activitylog-count`,
`session-002/file-watcher-verify`, `session-002/progress-text`,
`session-002/tests`, `session-002/version-bump`,
`session-002/smoke-test`, `session-002/verification`

---

### Session 3 of 3: Workflow doc + orchestrator protocol + cross-consumer verification
**Goal:** Encode the "state first, work second" protocol into the
workflow doc and orchestrator instructions so every consumer's AI
follows it. Verify end-to-end across all three consumers.

**Steps:**
1. Update `docs/ai-led-session-workflow.md`:
   - Step 1 ("Identify the Active Session Set and Register Session
     Start") gains the explicit protocol: orchestrator runs
     `python -m ai_router.start_session` (Full) *or* hand-writes the
     boundary fields (Lightweight) **before any other work in the
     session**. Pseudo-code for both tiers.
   - Step 8 gains the symmetric close-protocol detail: every close
     appends to `completedSessions[]`; only the final close flips
     status + lifecycleState.
   - The "do not skip close_session" warning added in commit
     `7166754` stays; cross-reference the new start-protocol.
2. Update `docs/session-state-schema.md`:
   - Promote `completedSessions[]` from "optional but planned" to
     "always written (Full tier) / always maintained (Lightweight)."
   - Add the GPT three-line invariant as the canonical state
     interpretation rule.
   - Note the new "in flight" predicate
     (`currentSession not in completedSessions[]`) and how the
     extension uses it.
3. Update `ai_router/docs/close-out.md`:
   - Add a "Session-boundary writes" subsection covering both
     `start_session` and `close_session`, with a table mirroring
     the protocol above.
   - Extend the `--repair --apply` description to mention
     `completedSessions[]` backfill.
4. Verify across consumers (each verification is read-only —
   identify any drifted sets that need `--repair --apply` after this
   set lands; do not run repairs from this session set):
   - `dabbler-platform`: walk `docs/session-sets/` and confirm
     state files are compatible with the new invariant.
   - `dabbler-access-harvester`: same.
   - `dabbler-homehealthcare-accessdb` (Lightweight tier candidate):
     confirm the protocol is hand-executable.
   - For each consumer, list any session sets whose
     `completedSessions[]` would be backfilled differently from
     their current state — these are the "next start_session /
     close_session call will heal them" candidates and the
     verification record for this session set's success.
5. Cross-provider verification.

**Creates:** none

**Touches:** `docs/ai-led-session-workflow.md`,
`docs/session-state-schema.md`, `ai_router/docs/close-out.md`,
verification notes in `change-log.md`

**Ends with:** Workflow doc + schema doc + close-out doc are
consistent with the new invariant; verification confirms no
consumer-repo set will break on next boundary write.

**Progress keys:** `session-003/workflow-doc`,
`session-003/schema-doc`, `session-003/close-out-doc`,
`session-003/consumer-verification-platform`,
`session-003/consumer-verification-harvester`,
`session-003/consumer-verification-accessdb`,
`session-003/cross-provider-verification`, `session-003/change-log`

---

## Risks

- **Existing consumer drift.** Some consumer-repo sets predate
  `completedSessions[]` and will have it backfilled by their next
  boundary write. The helper handles this idempotently, but a
  set that's currently in a "between sessions" limbo could have
  its progress jump visibly when its next session starts.
  Mitigation: the consumer-verification step in Session 3 surfaces
  these sets in advance.
- **Activity-log count removal** is mildly breaking for any
  hand-maintained Lightweight-tier set that *didn't* carry
  `completedSessions[]` and relied on the activity-log fallback.
  Mitigation: the events-ledger fallback covers Full tier; for
  Lightweight tier without an events ledger, the user already needs
  to maintain `completedSessions[]` per the schema doc — this set
  ratifies that expectation.
- **Extension version skew.** Consumers running v0.13.10 or older
  won't see the in-flight annotation but the underlying state will
  still be correct (just less expressive). Mitigation: none needed;
  Marketplace auto-update handles it.

---

## Routing notes

- **Effort-medium** for orchestrators: code changes are small but
  invariant-sensitive. A wrong off-by-one in `compute_effective_*`
  would resurrect old drift classes. Cross-provider verification
  at end of each session is mandatory.
- **Session 1** (ai_router Python): Claude or GPT-5.4 — both have
  the context for Python writers and event ledgers.
- **Session 2** (extension TypeScript): Claude or GPT-5.4 — the
  fileSystem.ts file is small and well-commented; either engine
  handles it.
- **Session 3** (doc + verification): Claude preferred — the doc
  voice should match `close-out.md` and the workflow doc's
  existing tone.

---

## Success criteria

After this set closes:

1. Running `python -m ai_router.start_session <slug>` on a Not
   Started set immediately bucket-flips it to In Progress in the
   tree view (within the watcher's debounce).
2. The fraction monotonically advances `0/N → 1/N → … → N/N` for
   every session set going forward.
3. The set bucket-flips to Done the moment the final session's
   `close_session` returns success — no manual refresh, no
   intermediate stale display.
4. A drifted set (sessions 1-(N-1) through router, session N
   hand-authored) is healed on its next `start_session` or
   `close_session` call without operator action.
5. The v0.13.11 defensive guards never fire in normal operation —
   they remain as recovery defense-in-depth for unforeseen drift.
