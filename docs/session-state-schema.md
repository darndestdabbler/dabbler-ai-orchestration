# session-state.json schema — `docs/session-sets/<slug>/session-state.json`

The machine-readable lifecycle file for every session set. The Session
Set Explorer extension, `ai_router`'s `close_session`, the cancel /
restore commands, and the cost dashboard all read it; on Full tier
`ai_router` writes it, on Lightweight tier the human (or AI orchestrator)
maintains it by hand.

The schema is **strict where machines parse**: a fixed field set with
canonical string values for `status` and `lifecycleState`. Field-name
drift or status-value drift causes silent display bugs in the
extension — the ctelr-spec 1/2 + 2/3 episode (2026-05-12) was a
hand-written file with `status: "completed"` (past participle) instead
of `"complete"`, which displayed as N−1/N until the count derivation
was canonicalized in extension v0.13.10.

## When this applies

Every directory under `docs/session-sets/<slug>/` that contains a
`spec.md`. The state file sits next to `spec.md`, `activity-log.json`,
and `change-log.md`. A directory with a spec but no state file is
lazy-synthesized on first read by `ensureSessionStateFile` (mirrored in
`ai_router/session_state.py` and `tools/.../utils/sessionState.ts`),
which infers the initial status from current file presence.

The schema applies to all four Dabbler consumer repos and to any new
repo adopted through the bootstrap prompt.

## State invariant (Set 022 — canonical)

Both writers (`start_session`, `close_session`) and all readers (the
extension tree view, the close-out gate checks, the reconciler) derive
their semantics from these three lines. When the snapshot's other
fields disagree, this invariant wins:

```
currentSession not in completedSessions[]                   → session currentSession is in flight
currentSession in completedSessions[] AND status="in-progress"  → between sessions (set is live but no session is active)
status = "complete"                                         → set done
```

The "in flight" predicate is what the extension uses to render
`0/N · session 1 in flight` (the fresh-set case) versus `1/4` plain
(the between-sessions case). The "between sessions" branch only
exists for a brief moment between `close_session` returning and the
human triggering the next session.

## Required fields

A conforming `session-state.json` is a JSON object with these fields:

```json
{
  "schemaVersion": 2,
  "sessionSetName": "<slug matching the directory name>",
  "currentSession": <int | null>,
  "totalSessions": <int | null>,
  "status": "not-started" | "in-progress" | "complete" | "cancelled",
  "lifecycleState": "closed" | "work_in_progress" | null,
  "startedAt": "<ISO 8601 timestamp | null>",
  "completedAt": "<ISO 8601 timestamp | null>",
  "verificationVerdict": "VERIFIED" | null,
  "orchestrator": { "engine": "...", "provider": "...", "model": "...", "effort": "..." } | null,
  "completedSessions": [<int>, ...]
}
```

### Field-by-field

| Field | Type | Purpose |
|---|---|---|
| `schemaVersion` | int (currently `2`) | Schema gate; bump when breaking. |
| `sessionSetName` | string | Must equal the parent directory's basename. |
| `currentSession` | int or null | 1-indexed; `null` only when status is `"not-started"`. |
| `totalSessions` | int or null | Planned session count. May be `null` if uncertain; the extension also reads `totalSessions` from spec.md's yaml block. |
| `status` | enum (see below) | Canonical lifecycle state. **Drives Done/Active bucketing and count derivation in the extension.** |
| `lifecycleState` | enum or null | Coarser-grained machine-readable lifecycle (close-out's view). |
| `startedAt` | ISO 8601 or null | First session start time. |
| `completedAt` | ISO 8601 or null | Final session completion time. |
| `verificationVerdict` | `"VERIFIED"` or null | Set by `close_session` after all gates pass. |
| `orchestrator` | object or null | Engine / provider / model that ran the set. Null for fully-hand-driven Lightweight runs. |

## Status — the canonical string

Exactly one of four values:

- `"not-started"` — no work yet; `currentSession` should be `null`.
- `"in-progress"` — at least one session has begun and not all are complete.
- `"complete"` — all sessions completed; close-out has run (or, on Lightweight, the human has confirmed).
- `"cancelled"` — set was cancelled mid-flight. See `## Cancel / restore` below.

**Aliases tolerated on read, never written:** the extension's `readStatus()`
and `ai_router.session_state` both canonicalize `"completed"` and `"done"`
to `"complete"` at the read boundary (`STATUS_ALIASES` in
`tools/dabbler-ai-orchestration/src/utils/sessionState.ts`). The
canonicalization keeps legacy files functional but **all new writes must
emit the canonical token**. Drift to `"completed"` or `"done"` is a bug
in the writer, not a valid alternate spelling.

## lifecycleState — the coarse machine view

Exactly one of:

- `null` — set is `not-started`; nothing to track.
- `"work_in_progress"` — at least one session has begun; the set is still
  live for close-out and queue routing.
- `"closed"` — final close-out has run. Pairs with `status: "complete"`
  or `status: "cancelled"` (via cancel-flow markers).

`lifecycleState: "done"`, `"active"`, `"finished"`, or any other value
is **not** canonical. The extension's bucketing uses `status` first
(via the alias map) and `lifecycleState` only as a tiebreaker; a mismatch
won't crash the UI but it surfaces in events-ledger audits and may
confuse other consumers.

### `completedSessions: number[]` (always written on Full; always maintained on Lightweight)

Array of 1-indexed session numbers that have been completed, sorted
ascending, no duplicates. **Schema v2's authoritative progress
ledger.** Set 022 promoted this field from "optional but planned" to
the canonical "X done out of N" signal on both tiers.

When present, the extension uses `completedSessions.length` directly
and computes the "in flight" predicate
(`currentSession not in completedSessions[]`) to drive the
`· session N in flight` annotation on early-session-1 rows. When
absent on legacy sets, the extension falls back to the events-ledger
count (distinct `closeout_succeeded` session numbers) and then to
`totalSessions` when `status === "complete"`. The
`currentSession − 1` fallback has been retired from the reader side
(extension v0.13.12) — the writer-side helper
`compute_effective_completed_sessions` makes it unnecessary, and
removing the reader fallback eliminates an off-by-one class.

Writer responsibility:

- **Full tier.** `close_session` appends `currentSession` to
  `completedSessions[]` on every successful close (non-final and
  final), backfilling the array from the events ledger if the legacy
  set was missing it. `start_session` preserves the existing array
  across its snapshot rewrite, also backfilling from events for
  pre-Set-022 sets.
- **Lightweight tier.** The orchestrator or human appends
  `currentSession` to `completedSessions[]` by hand on every close.
  Without a router-driven writer, this array is the only authoritative
  count signal — there is no events ledger to fall back to.

```json
{ ..., "completedSessions": [1, 2, 3] }
```

## Optional fields

### `forceClosed: boolean`

Set by `close_session --force` to record that gates were bypassed.
Observability only; doesn't change UI behavior.

### `orchestrator.effort`

Optional `"low"`, `"medium"`, or `"high"` hint carried through to the
provider.

## Cancel / restore

Cancellation is tracked by **file presence** (`CANCELLED.md` /
`RESTORED.md`), not by a `status: "cancelled"` field alone. The
extension's bucketing rule (per Set 008's spec) is filename-first:
`CANCELLED.md` present → tree state is Cancelled regardless of
`status`. The `cancelLifecycle` helpers in `ai_router` and the
extension keep `status` in lockstep with the markdown markers so the
two signals don't diverge; manual edits resolve via the file-presence
path.

## Lazy synthesis (file-absent branch)

A folder with `spec.md` but no `session-state.json` triggers
`ensureSessionStateFile`, which infers a starting shape from current
file presence:

| Files present | Inferred `status` | Inferred `lifecycleState` |
|---|---|---|
| `change-log.md` | `"complete"` | `"closed"` |
| `activity-log.json` (no change-log) | `"in-progress"` | `"work_in_progress"` |
| Neither | `"not-started"` | `null` |

Both the TS and Python writers must produce structurally identical
content — concurrent synthesis under a race resolves last-rename-wins
without confusion.

## Tier expectations

- **Full tier** (`Workflow: Full` in the spec frontmatter): `ai_router`
  writes the state file on every session boundary.
  - `start_session` (Set 022): writes the in-flight shape — `currentSession`,
    `status: "in-progress"`, `lifecycleState: "work_in_progress"`,
    `startedAt` (if previously null), clears `completedAt` and
    `verificationVerdict`. Preserves `completedSessions[]` from prior
    state (or backfills from the events ledger on a legacy set).
  - `close_session`: appends `currentSession` to `completedSessions[]`
    on every close; flips `status` to `"complete"` and
    `lifecycleState` to `"closed"` only on the final close (when
    `len(completedSessions) == totalSessions` post-append).
- **Lightweight tier** (`Workflow: Lightweight`): no router writes.
  The human or AI orchestrator maintains the file by hand on each
  session boundary, following the same field-by-field rules. **Always
  include and maintain `completedSessions[]`** — it is the only
  authoritative count signal under hand-maintenance.

## Worked examples

### Lightweight tier, all sessions complete

```json
{
  "schemaVersion": 2,
  "sessionSetName": "002-extraction-pipeline",
  "currentSession": 3,
  "totalSessions": 3,
  "status": "complete",
  "lifecycleState": "closed",
  "startedAt": "2026-05-12",
  "completedAt": "2026-05-12",
  "verificationVerdict": null,
  "orchestrator": null,
  "completedSessions": [1, 2, 3]
}
```

### Full tier, mid-set (session 2 in flight, session 1 closed)

```json
{
  "schemaVersion": 2,
  "sessionSetName": "021-developer-approachability",
  "currentSession": 2,
  "totalSessions": 4,
  "status": "in-progress",
  "lifecycleState": "work_in_progress",
  "startedAt": "2026-05-11T14:30:00-04:00",
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": {
    "engine": "claude-code",
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "effort": "normal"
  },
  "completedSessions": [1]
}
```

The invariant: `currentSession (2) not in completedSessions[]
([1])` → session 2 is in flight. The extension's tree view renders
this as `1/4 · session 2 in flight`.

### Not started

```json
{
  "schemaVersion": 2,
  "sessionSetName": "022-next-up",
  "currentSession": null,
  "totalSessions": 3,
  "status": "not-started",
  "lifecycleState": null,
  "startedAt": null,
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": null
}
```

## Parser cheat-sheet (for AI orchestrators and tooling)

Reading the canonical state of a folder:

1. Parse `session-state.json` as a JSON object.
2. Read `status`; canonicalize via the alias map (`"completed"` →
   `"complete"`, `"done"` → `"complete"`).
3. Read `completedSessions` if present; that's the authoritative count.
4. Else read `session-events.jsonl` and count distinct
   `closeout_succeeded` session numbers (Full-tier fallback for sets
   that pre-date Set 022 — extension v0.13.12 reader path, and what
   `ai_router.session_state.compute_effective_completed_sessions`
   uses to backfill the array on the next boundary write).
5. Else if canonical `status === "complete"`, count = `totalSessions`.
6. Do **not** fall back to `currentSession − 1`. The reader-side
   fallback was retired in extension v0.13.12; the writer-side helper
   keeps `completedSessions[]` correct, and removing the reader
   fallback eliminates an off-by-one class. Sets without either
   `completedSessions[]` or a closeout-events trail read as 0
   completed until the next boundary write heals them.

Computing the "in flight" predicate (used by the tree view to
distinguish a fresh-start row from a between-sessions row):

- If `completedSessions` is missing or null → unknown, fall back to
  count-only display.
- If `currentSession` is set and not in `completedSessions[]` →
  session `currentSession` is in flight.
- Else → between sessions (set is live but no session is active).

Bucketing in the Session Sets Explorer:

- `CANCELLED.md` present → Cancelled (filename wins).
- Else canonical `status === "complete"` and not mid-set → Done.
- Else canonical `status === "in-progress"` → Active.
- Else → Not Started.

## Migration

For consumer repos carrying pre-Set-7 drift:

1. Rewrite `status: "completed"` → `"complete"` and `status: "done"` →
   `"complete"`.
2. Rewrite `lifecycleState: "done"` / `"active"` / `"finished"` to the
   canonical `"closed"` (for terminal states) or `"work_in_progress"`
   (for live ones).
3. Add `completedSessions: [1, 2, ...]` listing every session that
   has completed. **Required on both tiers as of Set 022.** On Full
   tier the next `start_session` or `close_session` call backfills
   this automatically (via `compute_effective_completed_sessions`),
   so a hand-migration is optional but never harmful.
4. Leave timestamps and other observability fields alone unless
   demonstrably wrong.

The extension tolerates the unmigrated state files via the
read-boundary alias map (since v0.13.10) and the events-ledger
fallback (since v0.13.12), so this migration can be done at leisure
without breaking the UI. Migrate to keep the files self-describing
for non-extension readers and to make the count derivation cheap
(reading one JSON array beats parsing the full events ledger).
