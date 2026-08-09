# `session-state.json` schema example

The committed example at
[`session-state-schema-example.json`](./session-state-schema-example.json)
is the canonical reference for the v3 `session-state.json` schema
written by each session set under `docs/session-sets/<slug>/`. Read
the schema doc at [`session-state-schema.md`](./session-state-schema.md)
first — this file shows shapes; the schema doc explains semantics.

## v3 is canonical; v2 read support is permanent

Set 030 replaced the legacy progress triple
(`currentSession` / `totalSessions` / `completedSessions`) with a
single canonical `sessions[]` ledger. **New writes are always v3.**
The committed example shows the v3 closed shape with the legacy
triple still present — that is the **dual-write steady state** the
Full-tier writers emit through Set 030 (per spec decision D5):
canonical `sessions[]` plus the legacy triple derived from it, so
consumer repos pinned to older readers keep working through the
migration.

A future set may flip "stop writing legacy" once every consumer has
confirmed v3-reader support. v2 read tolerance (via
`synthesize_v3_from_v2`) is permanent regardless.

## v2 → v3 side-by-side

A v2 closed-shape state file:

```json
{
  "schemaVersion": 2,
  "sessionSetName": "example-session-set",
  "currentSession": 2,
  "totalSessions": 4,
  "status": "complete",
  "lifecycleState": "closed",
  "startedAt": "2026-04-30T13:00:00-04:00",
  "completedAt": "2026-04-30T14:30:00-04:00",
  "verificationVerdict": "VERIFIED",
  "orchestrator": { "engine": "claude-code", "provider": "anthropic", "model": "claude-opus-4-7", "effort": "high" },
  "completedSessions": [1, 2, 3, 4]
}
```

The v3 equivalent (also the committed example, simplified):

```json
{
  "schemaVersion": 3,
  "sessionSetName": "example-session-set",
  "status": "complete",
  "lifecycleState": "closed",
  "startedAt": "2026-04-30T13:00:00-04:00",
  "completedAt": "2026-04-30T14:30:00-04:00",
  "verificationVerdict": "VERIFIED",
  "orchestrator": { "engine": "claude-code", "provider": "anthropic", "model": "claude-opus-4-7", "effort": "high" },
  "sessions": [
    { "number": 1, "title": "Inventory + scaffold", "status": "complete" },
    { "number": 2, "title": "Implement + verify",    "status": "complete" },
    { "number": 3, "title": "Migrate + bulk run",    "status": "complete" },
    { "number": 4, "title": "Migration UX + release","status": "complete" }
  ]
}
```

The narrative differences:

- **Single source of truth for progress.** In v2, you had to read
  three fields and combine them (and sometimes consult
  `session-events.jsonl`) to answer "what session is active?". In v3,
  every session's status is right there in `sessions[]`, and the
  reader contract (`get_progress()`) is the one path to derive
  everything else.
- **Per-session titles.** Cosmetic, copied from `spec.md`'s
  `### Session K of N: <title>` headings at scaffold time. Title
  drift is benign — `number` and `status` are authoritative for
  progress semantics.
- **No more N−1/N ambiguity.** The proposal's motivating drift
  (`status: "completed"` past-participle confusing the count
  derivation) doesn't recur in v3: `sessions[]` is read directly,
  with no aliasing on the per-session token.
- **Explicit between-sessions state.** In v2, "session 1 closed,
  session 2 not yet started" was inferred from
  `currentSession in completedSessions[]`. In v3, the state is
  directly visible: zero `"in-progress"` sessions, ≥1 complete, ≥1
  not-started. `isBetweenSessions` is a flag on the
  `ProgressView`, not a predicate readers re-derive.

## Lifecycle shapes (v3)

A `session-state.json` cycles through three shapes during a set's
lifetime. The committed example is the **complete** shape. The other
two — **not-started** (written when the folder is first scaffolded)
and **in-progress** (written by `start_session` at Step 1 of each
session) — are documented inline
below because they are the entry points consumers and hand-authors
most often need to reproduce.

### Not-started

Written when a session-set folder is first scaffolded. Every session
starts as `"not-started"`; `currentSession`/`startedAt`/`lifecycleState`/`orchestrator`
in the legacy triple (dual-write surface) are all `null`/empty.

```json
{
  "schemaVersion": 3,
  "sessionSetName": "<slug>",
  "status": "not-started",
  "lifecycleState": null,
  "startedAt": null,
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": null,
  "sessions": [
    { "number": 1, "title": "Discover sources",   "status": "not-started" },
    { "number": 2, "title": "Extract + normalize","status": "not-started" },
    { "number": 3, "title": "Load + verify",       "status": "not-started" }
  ],
  "currentSession": null,
  "totalSessions": 3,
  "completedSessions": []
}
```

### In-progress (mid-set)

Written when `start_session`
flips the next `sessions[]` entry to `"in-progress"`. Top-level
`status` becomes `"in-progress"`, `lifecycleState` becomes
`"work_in_progress"`, `startedAt` is set if previously null, and
`orchestrator` carries the engine/provider/model/effort of the driver.
`completedAt`, `verificationVerdict`, and `nextOrchestrator` (when
applicable) remain `null` until close-out.

```json
{
  "schemaVersion": 3,
  "sessionSetName": "<slug>",
  "status": "in-progress",
  "lifecycleState": "work_in_progress",
  "startedAt": "2026-05-17T05:00:00-04:00",
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": { "engine": "claude", "provider": "anthropic", "model": "claude-opus-4-7", "effort": "high" },
  "sessions": [
    { "number": 1, "title": "Discover sources",   "status": "complete" },
    { "number": 2, "title": "Extract + normalize","status": "in-progress" },
    { "number": 3, "title": "Load + verify",       "status": "not-started" }
  ],
  "currentSession": 2,
  "totalSessions": 3,
  "completedSessions": [1]
}
```

### Complete

The committed example
([`session-state-schema-example.json`](./session-state-schema-example.json))
is the form rendered by `close_session` after the final close.

## Regenerating

The v2 generator at
[`ai_router/dump_session_state_schema.py`](../ai_router/dump_session_state_schema.py)
still emits the v2 example shape; a v3 regenerator is planned for
Set 030 Session 4 alongside the bulk migrator. Until then, the v3
example is **hand-curated** — keep it in sync with
`ai_router/progress.py`'s `SCHEMA_VERSION_V3` constant and the v3
schema doc when either changes.

```bash
# Legacy v2 regenerator (still functional; emits v2 shape only)
python ai_router/dump_session_state_schema.py
```

## Workflow when the schema legitimately changes

1. Edit `ai_router/progress.py` (and `tools/dabbler-ai-orchestration/src/utils/progress.ts`
   in parallel — the two helpers MUST stay in lockstep).
2. Update `docs/session-state-schema.md` (the spec) and this file
   (the example) to match.
3. Update `docs/session-state-schema-example.json` by hand for now;
   the v3 generator lands in Set 030 Session 4.
4. Commit the helper change, the doc change, and the example in the
   same PR.

The drift check at
`python ai_router/dump_session_state_schema.py --check` still works
against the v2 portion of the example (the legacy triple); a v3
drift check will be added with the v3 generator.
