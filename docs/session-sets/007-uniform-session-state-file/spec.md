# Session Set: Uniform `session-state.json` Shape

## Summary

Today, "what state is this session set in?" is answered by a layered
file-presence check: `change-log.md` → done; otherwise
`activity-log.json` or `session-state.json` → in-progress; else →
not-started. The rules live in two places (`SessionSetsProvider.ts`
in the extension, and `print_session_set_status` in `ai-router/`) and
the same logic is re-derived by every consumer.

This set establishes one invariant: **every session-set folder under
`docs/session-sets/` has a `session-state.json`**, with `status`
always carrying the canonical state string. Readers stop branching
on file presence.

After this set:

- `register_session_start` is no longer the sole creator of the file
- Set bootstrap (creating a session-set folder) writes a
  `session-state.json` with `status: "not-started"`
- A one-shot backfill walks all existing sets and synthesizes the
  file based on current file-presence
- `find_active_session_set`, `print_session_set_status`,
  `current_lifecycle_state`, the close-out gate's idempotency check,
  the reconciler's stranded-session sweep, and the explorer's tree
  view all read `status` directly

This set ships **before Set 8** (cancelled status) so cancel/restore
can rely on "the file always exists."

---

## Why this set comes after Set 6

Set 6 is the redesign closer. This set is foundation-cleanup:
removing a piece of branching that newcomers would otherwise have
to learn ("why is state determined by so many things?"). It's
small but touches every state-reading site, so it goes after the
big foundations are stable.

Set 7 must precede Set 8 because Set 8's cancel/restore logic
captures the current `status` into `preCancelStatus` — which
requires the file to exist for not-started sets too.

---

## Scope

### In scope

#### Status field — canonical values
```
"not-started"   — folder exists, no session has started
"in-progress"   — at least one session has started, no change-log yet
"complete"      — change-log.md present and close-out succeeded
"cancelled"     — Set 8 will add this; reserved here only
```

The existing v2 schema's `lifecycleState` enum stays as-is for
mid-flight close-out granularity (`work_verified`,
`closeout_pending`, `closeout_blocked`, `closed`). `status` is the
coarse public-facing field; `lifecycleState` stays the close-out
machinery's internal field.

#### File invariant

- A `session-state.json` exists in every folder under
  `docs/session-sets/<slug>/` that has a `spec.md`
- `startedAt` is `null` for not-started sets
- `currentSession` is `null` for not-started sets
- `orchestrator` is `null` for not-started sets
- `totalSessions` is populated from the spec's
  `Session Set Configuration` block when the file is synthesized
  (parses YAML the same way the spec parser does today; falls back
  to `null` if the block is missing)

#### New functions in `ai-router/session_state.py`
- `synthesize_not_started_state(session_set_dir) -> str` — writes
  the not-started file, no-op if a file already exists
- `backfill_session_state_files(base_dir="docs/session-sets") -> int`
  — walks the tree, synthesizes for any folder with a `spec.md` but
  no `session-state.json`. For folders that *do* have a state file,
  preserves it untouched. Returns the count synthesized
- A CLI: `python -m ai_router.backfill_session_state` runs the
  backfill once and prints a summary

#### Reader collapses
Each of these gets simplified to "read `status` directly":
- `print_session_set_status` (ai-router/__init__.py)
- `find_active_session_set` (wherever it lives — needs grep)
- `current_lifecycle_state` (session_events.py) — keeps lifecycle
  granularity; only the coarse `status` reads collapse
- `SessionSetsProvider.ts` state detection
- The close-out gate's idempotency check
- The reconciler's stranded-session sweep

A short fallback path stays for safety: if a folder has a `spec.md`
but no `session-state.json` (e.g., user just created the folder by
hand), readers synthesize on the fly. This keeps the contract
"readers always see a status" without forcing users to run backfill.

#### Bootstrap path
- `dabbler.setupNewProject` (extension's project-setup wizard) and
  any session-set creation path writes `session-state.json` with
  `status: "not-started"` immediately
- The extension's "Generate Session-Set Prompt" flow doesn't itself
  create folders, so no change there
- Document the contract in `docs/ai-led-session-workflow.md` so
  human-authored session-set folders include the file

#### Backward compatibility
- v1 → v2 migration in `session_state.py` already exists; extend
  it to handle "v2 file with no `currentSession`" (the not-started
  shape) gracefully on read
- Lazy-synthesis fallback in readers (above) covers any folder that
  slips through backfill

### Out of scope
- Changing the `lifecycleState` field semantics
- Changing what `register_session_start` writes when a real session
  starts (it still flips `status` from `not-started` to
  `in-progress` and populates `currentSession`, `startedAt`,
  `orchestrator`)
- Cancel/restore plumbing — that's Set 8
- Migration of consumer repos (dabbler-access-harvester,
  dabbler-platform). Those repos pull this repo's ai-router copy via
  the consumer-update workflow; the backfill CLI runs on each repo
  once during their next sync

---

## Sessions

### Session 1: Schema + synthesizer + backfill CLI

**Goal:** Land the writes. Don't change any readers yet.

**Deliverables:**
- `synthesize_not_started_state(session_set_dir)` in
  `ai-router/session_state.py`. Pseudocode:
  ```
  if session-state.json exists: return its path  # no-op
  parse spec.md's Session Set Configuration block for totalSessions
  write {
    schemaVersion: 2,
    sessionSetName: basename(dir),
    currentSession: null,
    totalSessions: <parsed or null>,
    status: "not-started",
    lifecycleState: null,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    orchestrator: null,
  }
  ```
- `backfill_session_state_files(base_dir)` walks all folders with a
  `spec.md`. For each:
  - If `change-log.md` exists → status = "complete",
    lifecycleState = "closed", completedAt populated from
    change-log.md's mtime as a best-effort backfill (doc the
    approximation in the file's comment? — JSON has no comments;
    fine, just document in the function docstring)
  - Elif `activity-log.json` exists → status = "in-progress",
    lifecycleState = "work_in_progress", startedAt from
    activity-log's earliest entry timestamp
  - Else → not-started shape from `synthesize_not_started_state`
- CLI module `ai-router/backfill_session_state.py` with main():
  ```
  python -m ai_router.backfill_session_state
  python -m ai_router.backfill_session_state --base-dir <path>
  python -m ai_router.backfill_session_state --dry-run
  ```
  Prints the count synthesized and a list of paths
- Tests:
  - Synthesize on empty folder
  - Synthesize is idempotent (existing file unchanged)
  - Backfill: not-started, in-progress (activity-log only),
    in-progress (state file only), done (change-log), already-done
    (state file says complete, change-log present — leave alone)
  - CLI smoke test
- Run the backfill once on this repo and commit the resulting
  `session-state.json` files for sets 001–006 (and 008)

**Acceptance:**
- After backfill, every folder under `docs/session-sets/` with a
  `spec.md` has a `session-state.json`
- All existing tests still pass (no reader changes yet)
- New tests cover the synthesizer, backfill, and CLI

### Session 2: Reader collapses

**Goal:** Switch every reader from file-presence branching to
`status` reads, with a lazy-synthesis fallback for folders that
slipped through backfill.

**Deliverables:**
- Helper `read_status(session_set_dir) -> str` in
  `ai-router/session_state.py` that:
  - Reads `session-state.json` and returns its `status`
  - If the file doesn't exist, calls `synthesize_not_started_state`
    on the folder first, then re-reads (so the returned value is
    consistent with what's now on disk)
  - Returns one of `"not-started" | "in-progress" | "complete" |
    "cancelled"` (the last value is reserved for Set 8 but the
    type already accepts it)
- `print_session_set_status` collapsed to `read_status` calls
- `find_active_session_set` (locate via grep) collapsed
- `current_lifecycle_state`'s coarse-status reads collapsed; the
  lifecycle-event reads keep their existing logic
- Close-out gate idempotency check uses `read_status` instead of
  re-reading the file
- Reconciler stranded-session sweep uses `read_status`
- TypeScript parallel: a new `readStatus(folder: string): string`
  helper in
  `tools/dabbler-ai-orchestration/src/utils/sessionState.ts` that
  reads `session-state.json` and synthesizes lazily by shelling out
  to `python -m ai_router.backfill_session_state --target <folder>
  --no-dry-run` (or by reimplementing the synthesizer in TS — the
  extension already shells out to Python for queue/heartbeat work
  in Set 5, so the pattern is established)
- `SessionSetsProvider.ts` state detection collapsed to
  `readStatus`
- Tests for each reader: confirm the new path produces the same
  output as the old one across the test fixtures

**Acceptance:**
- Every state-reading site goes through `read_status` (Python) or
  `readStatus` (TypeScript)
- All existing extension and ai-router tests pass
- New tests cover the lazy-synthesis fallback path

### Session 3: Bootstrap, docs, cross-provider review

**Goal:** Ensure new session sets are born with the file, document
the new invariant, and run the cross-provider check.

**Deliverables:**
- `dabbler.setupNewProject` (extension's wizard) writes the
  not-started file when scaffolding a new session-set folder
- The "Generate Session-Set Prompt" flow's prompt template includes
  a note telling the AI to create the not-started file as part of
  the spec-folder scaffold
- `docs/ai-led-session-workflow.md`:
  - New section "Session-set lifecycle and state file"
  - Documents the canonical `status` values
  - Documents the `session-state.json` invariant ("every folder
    has one")
  - Documents the lazy-synthesis fallback for human-authored
    folders
- `docs/session-state-schema-example.md` updated with the
  not-started shape
- Update `tools/dabbler-ai-orchestration/README.md` if it discusses
  the file shape
- Cross-provider review (Gemini Pro) of:
  - The schema additions (`startedAt: null`, `orchestrator: null`)
  - The lazy-synthesis fallback — is it correct under concurrent
    access? Two readers hitting the same not-yet-synthesized folder
    at the same instant
  - The backfill CLI's mtime-based `completedAt` for done sets — is
    this misleading enough to warrant `null` instead?
- Address verifier findings, file
  `session-reviews/session-003.md`
- Final test sweep

**Acceptance:**
- New session sets created via the wizard come with
  `session-state.json` from the start
- Workflow doc and schema example updated
- Cross-provider review filed
- All tests pass; no regressions

---

## Acceptance criteria for the set

- [ ] Every folder under `docs/session-sets/` with a `spec.md` has
      a `session-state.json` after backfill
- [ ] `status` is the single field every reader consults; no reader
      branches on file presence as the primary signal (lazy-synth
      fallback is a robustness measure, not the primary path)
- [ ] New session-set folders created via the extension wizard
      include the file from the start
- [ ] `register_session_start` keeps working unchanged for active
      sessions (only the file's pre-existence is new)
- [ ] No reader regresses: every state-reading test still passes
- [ ] Workflow doc explicitly tells human authors and AI agents to
      create the file when scaffolding by hand
- [ ] Cross-provider review filed

---

## Risks

- **Backfill writes wrong `status` for an edge-case folder.** A
  folder with `change-log.md` but a deleted `activity-log.json`
  would be backfilled as complete — correct. A folder with
  `activity-log.json` and no `change-log.md` and no
  `session-state.json` (legacy session-1-completed-but-set-was-
  abandoned) would be backfilled as in-progress — also correct,
  reflecting the actual state. Edge cases are vanishingly rare in
  this repo; we'll flag any that the backfill prints during the
  Session 1 dry-run.

- **Lazy-synthesis fallback masks corruption.** If a reader hits a
  folder with malformed `session-state.json`, the lazy path could
  overwrite a meaningful-but-broken file with a not-started shape.
  Mitigate: the fallback only triggers on file-absent, never on
  parse-error. Parse errors propagate, just like today.

- **Concurrent readers race during lazy synthesis.** Two readers
  hitting the same not-yet-synthesized folder at the same instant
  could both write the file. SQLite-style atomicity isn't available
  for plain-file writes, but a write-then-rename pattern (write to
  `.tmp` then `os.replace` to the final name) makes the race
  benign — both writes produce the same not-started shape.

- **Done-sets backfill loses orchestrator metadata.** A
  pre-this-set done set has no record of which model closed it
  out. The backfill writes `orchestrator: null` for these. Out of
  scope to recover that data; the activity-log already carries
  per-step model info for anyone who needs it.

- **Consumer repos haven't run backfill yet.** The
  dabbler-access-harvester and dabbler-platform repos pull
  ai-router via the consumer-update workflow. They'll have
  pre-this-set folders with no state files until they run
  `python -m ai_router.backfill_session_state`. The lazy-synth
  fallback covers them silently; document the optional one-shot
  CLI in the consumer-update notes.

- **TypeScript / Python writer drift.** The extension's
  `readStatus` lazy-synthesizer needs to write the same shape as
  Python's. Mitigate: TS shells out to Python for synthesis (the
  extension already shells out for queue/heartbeat in Set 5), so
  there's only one writer. Reads can be local TS for speed.

---

## References

- `ai-router/session_state.py` — current schema and writers
- `ai-router/__init__.py` — `print_session_set_status` (today's
  file-presence branching)
- `tools/dabbler-ai-orchestration/src/providers/SessionSetsProvider.ts`
  — extension's parallel branching
- `ai-router/session_events.py` — `current_lifecycle_state`
- `docs/session-state-schema-example.md` — canonical schema docs
- Set 8: `008-cancelled-session-set-status` — depends on this set's
  invariant

---

## Session Set Configuration

```yaml
totalSessions: 3
requiresUAT: false
requiresE2E: false
effort: normal
outsourceMode: first
```
