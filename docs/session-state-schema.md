# session-state.json schema — `docs/session-sets/<slug>/session-state.json`

The machine-readable lifecycle file for every session set. The Session
Set Explorer extension, `ai_router`'s `close_session`, the cancel /
restore commands, and the cost dashboard all read it; on Full tier
`ai_router` writes it, on Lightweight tier the human (or AI
orchestrator) maintains it by hand.

The schema is **strict where machines parse**: a fixed field set with
canonical string values for `status`. Field-name drift or status-value
drift causes silent display bugs in the extension — the ctelr-spec
1/2 + 2/3 episode (2026-05-12) was a hand-written file with
`status: "completed"` (past participle) instead of `"complete"`, which
displayed as N−1/N until the count derivation was canonicalized in
extension v0.13.10.

## v4 is canonical; v1/v2/v3 read support persists through the transition

Set 047 (proposal at
`docs/proposals/2026-05-26-state-file-schema-v4-and-lightweight-parity/`)
collapses the v3 top-level lifecycle fields (`currentSession`,
`totalSessions`, `completedSessions`, `lifecycleState`, `startedAt`,
`completedAt`, `orchestrator`, `verificationVerdict`) into per-session
records inside `sessions[]`. **New writes always use v4.** v1/v2/v3
files keep working: progress / state-normalization readers route
through the `normalize_to_v4_shape(state, spec_md_path)` shim
(Python) and its TS mirror, which accept any prior shape and return
a v4 read-view with both per-session metadata and the historically-
derived top-level fields. (See **Reader contract** below for the
specific consumers that route through the shim vs. those — like
`readCancellationState` — that read raw status directly.)

Migration to v4 is **operator-initiated**: run
`python -m ai_router.migrate_v3_to_v4 --in-place` or right-click a
set in the Session Sets view → **Migrate to v4 schema**. The migrator
is idempotent and writes `session-state.v3.bak.json` alongside; see
[`v3-to-v4-rollback-procedure.md`](v3-to-v4-rollback-procedure.md)
for the rollback contract.

The reader-shim is the operational steady state through the
post-ship transition window so a mixed repo (some sets on v3, some
on v4) reads identically from both. Per the audit-locked spec §3.4,
the v3-shim is scheduled for removal in a future explicitly-scoped
set after v4 has shipped on a release and every consumer repo has
migrated; removal does NOT land in Set 047.

## When this applies

Every directory under `docs/session-sets/<slug>/` that contains a
`spec.md`. The state file sits next to `spec.md`, `activity-log.json`,
and `change-log.md`. A directory with a spec but no state file is
lazy-synthesized on first read (`ensureSessionStateFile` in the
extension; `ensure_session_state_file` in the router), which infers
the initial status from current file presence and writes a v4
skeleton.

The schema applies to all four Dabbler consumer repos and to any new
repo adopted through the bootstrap prompt.

---

## Reader contract — two layers, with one carve-out

Progress and state-normalization consumers route through a two-step
path; the cancellation reader is the documented carve-out.

### Layer 1 — the normalize shim

The shim returns a **dict** with both per-session metadata and
derived legacy top-level fields:

- **Python:** `from ai_router.progress import normalize_to_v4_shape`
  → call `normalize_to_v4_shape(state, spec_md_path)`.
- **TypeScript (extension):**
  `import { normalizeToV4Shape } from "../utils/progress";`
  → call `normalizeToV4Shape(state, specMdPath)`.

The shim:

- Accepts v1, v2, v3, or v4 input.
- Returns a NEW dict (does not mutate input).
- Canonicalizes per-session `status` aliases (`"completed"` → `"complete"`).
- For v1/v2/v3 input, **promotes** the top-level orchestrator /
  startedAt / completedAt / verificationVerdict onto the appropriate
  `sessions[]` entry (the in-progress session if any, else the
  most-recently-completed session) so per-session metadata is
  populated.
- For all input, **derives** the legacy top-level fields
  (`currentSession`, `totalSessions`, `completedSessions`,
  `orchestrator`, `startedAt`, `completedAt`, `verificationVerdict`,
  `lifecycleState`) — see the **Derived values** section below for
  the exact derivation rules.

### Layer 2 — the progress view

`get_progress(normalizedState)` (Python) /
`getProgress(normalizedState)` (TS) returns a `ProgressView` with
**only the progress-counting fields**: `sessions`, `total_sessions`,
`completed_sessions`, `current_session`, `next_session`,
`is_between_sessions`. It does NOT carry `startedAt`, `completedAt`,
`orchestrator`, or `verificationVerdict` — callers that want those
read them off the normalized dict (Layer 1) directly.

`get_progress()` validates the 8 v4 invariants and raises
`SessionStateInvariantError` on violation. **It requires `sessions[]`
to be present and non-empty** (rule 1), so plan-less carve-out
inputs (no `sessions[]` key) are handled at the shim layer and not
fed into `get_progress()`; callers consuming a plan-less state read
the normalized dict's derived fields directly instead.

The convenience wrapper `read_progress(state, spec_md_path)`
(Python) / `readProgress(state, specMdPath)` (TS) chains the two
layers for the common case.

### Layer 3 — the cancellation reader (carve-out)

[`readCancellationState(sessionSetDir)`](../tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts)
reads raw `state.status` directly (not through the shim) because the
bucketing decision is a status-only signal and intentionally avoids
the invariant validation that `get_progress()` performs. See
[§ Cancel / restore](#cancel--restore) for the full contract.

Readers **MUST NOT** read top-level `currentSession`, `totalSessions`,
or `completedSessions` directly off a raw `state` dict — those fields
exist for the shim to materialize, never as a source of truth on v4
writes.

---

## v4 schema shape

A conforming v4 `session-state.json` is a JSON object with these
fields:

```json
{
  "schemaVersion": 4,
  "sessionSetName": "<slug matching the directory name>",
  "status": "not-started" | "in-progress" | "complete" | "cancelled",
  "sessions": [
    {
      "number": 1,
      "title": "Schema doc + helper",
      "status": "complete",
      "startedAt": "2026-05-26T09:12:00-04:00",
      "completedAt": "2026-05-26T11:04:00-04:00",
      "orchestrator": {
        "engine": "claude",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "effort": "high",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-26T09:12:00-04:00",
        "lastActivityAt": "2026-05-26T11:04:00-04:00"
      },
      "verificationVerdict": "VERIFIED"
    },
    {
      "number": 2,
      "title": "Writers + scaffolding",
      "status": "in-progress",
      "startedAt": "2026-05-26T11:30:00-04:00",
      "completedAt": null,
      "orchestrator": { "engine": "claude", "provider": "anthropic",
                        "model": "claude-opus-4-7", "effort": "high",
                        "chatSessionId": null,
                        "checkedOutAt": "2026-05-26T11:30:00-04:00",
                        "lastActivityAt": "2026-05-26T11:42:00-04:00" },
      "verificationVerdict": null
    },
    {
      "number": 3,
      "title": "Reader migration",
      "status": "not-started",
      "startedAt": null,
      "completedAt": null,
      "orchestrator": null,
      "verificationVerdict": null
    }
  ]
}
```

### Top-level fields

| Field | Type | Purpose |
|---|---|---|
| `schemaVersion` | int (currently `4`) | Schema gate; bump when breaking. |
| `sessionSetName` | string | Must equal the parent directory's basename. |
| `status` | enum (see below) | Canonical top-level lifecycle state. Drives Done/Active bucketing in the extension. |
| `sessions` | array of objects | The canonical progress ledger AND the carrier for every per-session lifecycle field. See below. |

**Top-level fields that v3 carried but v4 drops** (now derived from
`sessions[]` via the reader shim):

- `currentSession`, `totalSessions`, `completedSessions` — derived
  from per-session `status`.
- `startedAt` — derived from the earliest non-null
  `sessions[].startedAt`.
- `completedAt` — derived from the latest non-null
  `sessions[].completedAt`.
- `orchestrator` — derived from the in-progress session's orchestrator
  block (or, when between sessions, null).
- `verificationVerdict` — derived from the most-recently-completed
  session's verificationVerdict.
- `lifecycleState` — derived from top-level `status` per the v3 rule
  (`work_in_progress` while in-flight; `closed` when complete or
  cancelled).

A v4 reader that calls these fields off `state` directly will see
`KeyError` / `undefined`. The shim's whole job is to derive them.

### `sessions[]` — the canonical lifecycle ledger

Each entry is an object with these fields:

| Field | Type | Purpose |
|---|---|---|
| `number` | positive int | 1-indexed session number. Unique within the array, sorted ascending. |
| `title` | string | Display title, copied from `spec.md`'s `### Session K of N: <title>` heading. Cosmetic — drift between `spec.md` and the state file is benign. |
| `status` | enum (see below) | Per-session lifecycle state. |
| `startedAt` | ISO 8601 or null | Set on `start_session`. Null until the session begins. |
| `completedAt` | ISO 8601 or null | Set on `close_session`. Null until the session closes. |
| `orchestrator` | object or null | Engine / provider / model / effort + chatSessionId + check-out timestamps for the holder of THIS session. Null when this session has not yet started; populated by `start_session`; **preserved across `close_session`** as historical attribution on closed sessions. See **Per-session orchestrator block** below. |
| `verificationVerdict` | string \| null | Set by `close_session` after gate checks. The two canonical tokens are `"VERIFIED"` and `"ISSUES_FOUND"`; the writer does not enforce an enum and operators have shipped extension tokens like `"ISSUES_FOUND_RESOLVED_IN_FLIGHT"` to capture mid-session disposition (see e.g. this set's S4 record). Readers should treat the field as a string and match on prefix when bucketing into VERIFIED vs ISSUES-FOUND buckets. |

The migration from v3 reorganized the lifecycle so that **per-session
attribution survives the set's full lifetime**: who ran each session
(orchestrator block), when it started, when it ended, and the
verification verdict are all preserved on the per-session record
instead of being overwritten by the next session's start.

### Per-session orchestrator block — historical attribution

A populated `sessions[N].orchestrator` block carries:

| Field | Type | Purpose |
|---|---|---|
| `engine` | string | Orchestrator engine name (`claude`, `gpt-5-4`, `gemini-pro`, `codex`, etc.). |
| `provider` | string \| null | Provider keying the API or IDE surface (`anthropic`, `openai`, `google`). Optional but always present in writes from the v4 writer. |
| `model` | string | Model id (`claude-opus-4-7`, `gpt-5.4`, etc.). |
| `effort` | string | Effort level: `low` / `medium` / `high` / `fast` / `normal` / `unknown`. |
| `chatSessionId` | string \| null | Per-chat identifier (Set 036 H4 holder-identity discriminator). See **Check-out / check-in** below. |
| `checkedOutAt` | ISO 8601 | When this orchestrator first claimed the session. |
| `lastActivityAt` | ISO 8601 | Bumped on every same-holder re-attach during the session. |

**A note on the `checkedOutAt` / `lastActivityAt` / `chatSessionId`
fields:** these three carry forward from v3's check-out / check-in
coordination layer (Sets 033 / 036). Hard enforcement of cross-holder
coordination is **off by default since mid-Set-046** (see CLAUDE.md);
the fields continue to be written for audit-history purposes but no
gate consults them in production. The longer-term cleanup is
scheduled as Set 049 (orchestrator-coordination-removal), which will
audit-then-spec dropping all three fields from new writes and reshape
the block to omit-null `engine` / `provider` / `model` / `effort`
only. Until then, v4 writers emit the full 7-field block and v4
readers tolerate both the full and the to-be-simplified form.

### Check-out / check-in (preserved from Set 033, enforcement disabled)

Each session's orchestrator block doubles as a check-out record for
the **lifetime of that session**. Two nested timestamp fields capture
the lifecycle:

| Field | Set on | Bumped on |
|---|---|---|
| `checkedOutAt` | `start_session` invocation (`sessions[N].orchestrator` flips `null → populated`). | Never bumped by a same-holder write — preserved across re-attach. |
| `lastActivityAt` | `start_session` invocation. Mirrors `checkedOutAt` on a fresh check-out. | Every same-holder `start_session` re-attach. `close_session` does NOT bump this field — the writer's only emission site is the shared `register_session_start` helper. |

**Holder identity (H4):** the equality predicate is the
`engine + provider + chatSessionId` composite (Set 036). Two
orchestrators with the same triple but different `model` (e.g.,
`claude-opus-4-7` and `claude-sonnet-4-6` both running through the
same Claude chat) are treated as the **same holder**; model and
effort are mutable fields inside the block and update in place on a
same-holder re-attach without resetting `checkedOutAt`.

**`chatSessionId`** is a per-chat identifier sourced at write time
in one of two ways:

- **Claude Code chats** — the SessionStart hook invoker
  (`scripts/claude-session-start-invoker.js`) extracts `session_id`
  from the hook payload and forwards it as `--chat-session-id` to
  `start_session` automatically.
- **All other orchestrators** (Codex CLI, Gemini Code Assist,
  GitHub Copilot, manual Lightweight) — the operator runs
  `python -m ai_router.new_chat_id --export --shell <bash|powershell|fish>`
  in their shell once per chat and sources the output.

**Tolerant-on-read.** A prior orchestrator block missing
`chatSessionId` entirely or with the key present and `null` is
treated as a match against any caller-supplied chatSessionId for
`engine + provider` equality. The first new write populates the
field strictly.

**Hard coordination (gated).** When
`DABBLER_ENFORCE_CHECKOUT_COORDINATION=1` is set in the environment,
`start_session` REFUSES to write when the existing orchestrator
block on the target session names a different
`engine + provider + chatSessionId` composite than the caller, unless
`--force` is set. Without the env var (the production default since
Set 046), the writer proceeds without coordination checks. See
CLAUDE.md "Hard-coordination enforcement (Sets 033 / 036) is OFF by
default" for the full context.

**Block-preserved-on-close (v4 historical-attribution contract):**
when `close_session` flips `sessions[N].status` from `"in-progress"`
to `"complete"`, the v4 writer **preserves** `sessions[N].orchestrator`
in place. Under v3 the top-level orchestrator block was cleared on
every close because the block doubled as a single global holder
lock; under v4 the per-session orchestrator on a closed session is a
historical record (who ran this session), NOT a check-out lock. The
operator-visible "released between sessions" semantic is preserved
by the reader shim: the derived top-level `orchestrator` is computed
ONLY from the in-progress session, so the Explorer and other
top-level consumers still see `orchestrator: null` between sessions
even while per-session blocks remain populated on closed entries.

The writer reads prior `sessions[]` back, preserves all per-session
metadata on prior-completed entries (including their orchestrator
blocks), and only mutates the current session's record. A session
record's orchestrator block is null only when (a) the session has
not yet started, OR (b) the session was closed by a v3 writer and
later migrated to v4 (the v3 close cleared the top-level block, so
the shim's promotion has nothing to attribute).

**Per-set lifecycle lock (Set 036 Q5).** Both `start_session` and
`close_session` acquire `<session-set-dir>/.lifecycle.lock` for the
duration of their read/check/write window so a hybrid migration —
one orchestrator opening a new session while another is mid-close-out
on the same set — never interleaves writes. `start_session` polls
for up to 30s on contention before exiting `EXIT_LOCK_CONTENTION=5`;
`close_session` keeps its existing immediate-failure contract
(exit 3) so a stuck close-out surfaces fast rather than blocking
under the poll window.

**Stranded-checkout recovery.** A session whose holder disappeared
(crashed orchestrator, abandoned workstation) before running
`close_session` ends up with a `sessions[N].orchestrator` block that
no live process is claiming. Recovery paths:

- `start_session --force` from the would-be next holder. Force-mode
  is an authority handoff — appends a single line to
  `~/.dabbler/orchestrator-writer.log` and proceeds with the write.
  Only meaningful when enforcement is on; otherwise the next call
  just succeeds.
- Manual edit of `sessions[N].orchestrator` to `null` if the operator
  is sure no live holder is present.

### Plan-less carve-out

A set whose plan has not yet been committed (`spec.md` lacks both a
`totalSessions:` in the configuration block AND `### Session N`
headings) writes a v4 file with **no `sessions[]` array** at all.
This is the Set 046 deliverable (a): the Explorer's `fractionFor()`
renders this as `0/?` and the row buckets as in-progress.

The plan-less carve-out keeps two top-level fields that the canonical
known-plan shape drops:

```json
{
  "schemaVersion": 4,
  "sessionSetName": "047-state-file-schema-v4-audit",
  "status": "in-progress",
  "startedAt": "2026-05-26T15:02:59-04:00",
  "orchestrator": {
    "engine": "claude", "provider": "anthropic",
    "model": "claude-opus-4-7", "effort": "high",
    "chatSessionId": null,
    "checkedOutAt": "2026-05-26T15:02:59-04:00",
    "lastActivityAt": "2026-05-26T15:02:59-04:00"
  }
}
```

The reader shim consults the top-level passthroughs when `sessions`
is absent so the in-flight session is still attributable. Once a
plan lands (`spec.md` configuration block populated, or
`--total-sessions N` passed to `start_session`), the next register or
close write emits the canonical v4 shape with `sessions[]` and the
top-level passthroughs are no longer written.

### Passthrough fields preserved across writes

Two fields written by orthogonal subsystems are opaque to the v4
schema but preserved by every v4 writer across rewrites:

- `forceClosed: true` — set by `close_session --force`; consumed by
  the extension's FORCED badge.
- `preCancelStatus: <status>` — captured by `cancelSessionSet` /
  `cancel_session_set` so a subsequent restore can recover the
  pre-cancel status (see **Cancel / restore** below).

---

## Status — the canonical glossary

### Top-level `status`

Exactly one of four values. The vocabulary mostly aligns with the
per-session ledger, EXCEPT set-level `"cancelled"` is not accepted
as a per-session value in v4 (per-session cancellation is reserved
for a future schema — see **Per-session `sessions[].status`** below):

- `"not-started"` — no session has begun.
- `"in-progress"` — at least one session has begun and not all are
  complete. **Includes the between-sessions state** (one session
  closed, the next not yet started).
- `"complete"` — every session in `sessions[]` is `"complete"`.
- `"cancelled"` — set was cancelled mid-flight. `status: "cancelled"`
  in this file is the **canonical signal** (Set 035, extending the
  H2 single-source-of-truth verdict from Set 033 Session 2). The
  `CANCELLED.md` marker continues to be written alongside as an
  audit-history artifact, but the bucketing read consults `status`
  first. See [§ Cancel / restore](#cancel--restore) below.

**Aliases tolerated on read, never written:** the canonicalizer in
the shim maps `"completed"` and `"done"` to `"complete"`. The
canonicalization keeps legacy files functional but **all new writes
must emit the canonical token**. Drift to `"completed"` or `"done"`
is a bug in the writer, not a valid alternate spelling.

### Per-session `sessions[].status`

Three accepted values today:

- `"not-started"` — this session has not begun.
- `"in-progress"` — this session is currently active. **At most one
  session may be in this state at a time** (invariant rule 3).
- `"complete"` — this session has closed successfully.

**Not accepted:** `"cancelled"` at the session level is reserved
for a future schema. v4 only exercises set-level cancellation
(`CANCELLED.md` filename marker plus top-level
`status: "cancelled"`). Validators raise
`SessionStateInvariantError(rule=2)` if a session entry uses it.

### `lifecycleState` (derived, never written)

The v4 reader shim derives `lifecycleState` so v3-era consumers keep
working:

- `null` — set is `"not-started"` OR `"cancelled"`. The cancellation
  signal lives in top-level `status` (per Set 035); the shim
  intentionally does NOT synthesize `"closed"` for cancelled v4
  inputs, matching the v3 writer's pre-Set-035 behavior of leaving
  `lifecycleState` on the on-disk file untouched at cancel time.
  Cancellation readers consult `status` (or
  `readCancellationState()`) and do not depend on lifecycleState.
- `"work_in_progress"` — top-level `status` is `"in-progress"`.
- `"closed"` — top-level `status` is `"complete"`.

V4 writers never emit `lifecycleState`; the field exists only in the
derived read-view.

---

## Derived values

### From the normalize shim (Layer 1)

`normalize_to_v4_shape(state, spec_md_path)` returns a dict carrying
the derived top-level fields:

```text
sessions            = canonicalized per-session records (Layer-1 dict)
status              = canonicalized top-level status
schemaVersion       = 4
currentSession      = the single session where s.status == "in-progress", else null
totalSessions       = sessions.length (or null for plan-less carve-out)
completedSessions   = [s.number for s in sessions if s.status == "complete"]
orchestrator        = in-progress session's orchestrator (or plan-less
                      top-level passthrough); null between sessions
                      and after final close
startedAt           = in-progress session's startedAt, else the
                      most-recently-completed session's startedAt
                      (scanned in reverse); for plan-less in-progress
                      sets, falls back to top-level passthrough
completedAt         = most-recently-completed session's completedAt
                      ONLY when set-level status == "complete";
                      mid-set closes keep this null (preserves v3's
                      "set-completion timestamp" semantic)
verificationVerdict = most-recently-completed session's
                      verificationVerdict
lifecycleState      = "work_in_progress" when status == "in-progress";
                      "closed" when status == "complete"; null
                      otherwise (including for cancelled sets — the
                      cancellation signal lives in top-level `status`
                      and not in lifecycleState)
```

### From the progress view (Layer 2)

`get_progress(normalizedState)` returns a `ProgressView` dataclass
carrying ONLY:

```text
sessions            = tuple of canonicalized SessionRecord values
total_sessions      = sessions.length
completed_sessions  = tuple of session numbers with status == "complete"
current_session     = the single in-progress session's number, else None
next_session        = first not-started session's number, else None
is_between_sessions = current_session is None
                      AND completed_sessions is non-empty
                      AND next_session is not None
```

The `is_between_sessions` predicate is what the extension's tree
view uses to distinguish a fresh-start row from a "set is live but
no session is active right now" row, and to decide whether to render
the "session N in flight" annotation. Callers that want the
historical attribution (`startedAt`, `completedAt`, `orchestrator`,
`verificationVerdict`) read those off the normalized dict (Layer 1)
or off individual `sessions[]` entries, not off `ProgressView`.

---

## Invariants — the 8 v4 rules

Writers and readers enforce these rules; violations raise
`SessionStateInvariantError` (Python) / `SessionStateInvariantError`
(TypeScript) with the violated rule number and an actionable message.
**Fail loud, never silently recover.** Recovery lives in explicit
repair tooling (`close_session --repair`, the migrator's validation
mode); the normal writers and the read-side validator never paper
over a violation.

1. **`sessions` is required and non-empty** for any set with a
   known plan. The plan-less carve-out (no `sessions[]` key)
   is the only exception.
2. **`sessions[].number` values are positive integers, unique, and
   contiguous starting at 1**. Each entry's `status` must be one of
   `"not-started"`, `"in-progress"`, or `"complete"` — **session-level
   `"cancelled"` is reserved for a future schema** and rejected today.
3. **At most one session may have `status: "in-progress"`.**
4. **No session may be `"complete"` if an earlier session is
   `"not-started"` or `"in-progress"`.** Complete sessions form a
   contiguous prefix.
5. **Top-level `status: "not-started"`** requires every session to
   be `"not-started"`.
6. **Top-level `status: "in-progress"`** allows either exactly one
   in-progress session OR a between-sessions state (≥1 complete, ≥1
   not-started, 0 in-progress).
7. **Top-level `status: "complete"`** requires every session to be
   `"complete"`. The shim is intentionally non-papering: a file with
   `status: "complete"` but an incomplete `sessions[]` ledger is
   surfaced as a rule-7 violation rather than coerced into a
   "consistent" shape.
8. **`sessions[N].orchestrator` is non-null whenever
   `sessions[N].status` is `"in-progress"`.** In-progress sessions
   always carry an orchestrator block (writer-side enforced by
   `start_session`'s `--engine` + `--model` requirement).
   Completed sessions written by the v4 writer carry their
   orchestrator block as historical attribution; completed
   sessions written by an earlier v3 writer (then migrated to v4)
   carry `null`. Not-started sessions always carry `null`.

> **Shape-vs-invariant errors.** Unknown top-level `status` values
> (typos, future tokens) raise `SessionStateInvariantError(rule=2)`
> as a structural/enum error, not rule 5/6/7 specifically — those
> rules are about consistency between top-level and per-session
> states, not about the top-level vocabulary itself.

---

## Lightweight tier — one-field-flip worked example

The Lightweight tier maintains `session-state.json` by hand. The v4
shape preserves the v3 single-field-flip property by keeping the
session transitions local to one `sessions[]` entry, plus an optional
top-level `status` flip on the first/last transition.

Starting state (fresh set, 3 sessions planned):

```json
{
  "schemaVersion": 4,
  "sessionSetName": "002-extraction-pipeline",
  "status": "not-started",
  "sessions": [
    { "number": 1, "title": "Discover sources",   "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null },
    { "number": 2, "title": "Extract + normalize", "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null },
    { "number": 3, "title": "Load + verify",       "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null }
  ]
}
```

### Start session 1

- Flip `sessions[0].status`: `"not-started"` → `"in-progress"`
- Set `sessions[0].startedAt` to today's ISO timestamp
- (Optional) populate `sessions[0].orchestrator` with the holder
  composite
- Flip top-level `status`: `"not-started"` → `"in-progress"`

(The top-level flip happens only on the first session's start.)

### Close session 1

- Flip `sessions[0].status`: `"in-progress"` → `"complete"`
- Set `sessions[0].completedAt` to today's ISO timestamp
- Leave `sessions[0].orchestrator` in place as historical
  attribution (do NOT clear it — v4 preserves the block on close)
- Set `sessions[0].verificationVerdict` to `"VERIFIED"` (or
  `"ISSUES_FOUND"` if the verifier round flagged unresolved issues)

That's it. No other edits required. The top-level `status` stays
`"in-progress"` because session 2 has not started yet — this is the
canonical between-sessions state.

### Start session 2

- Flip `sessions[1].status`: `"not-started"` → `"in-progress"`
- Set `sessions[1].startedAt`
- (Optional) populate `sessions[1].orchestrator`

### Close session 2

- Flip `sessions[1].status`: `"in-progress"` → `"complete"`
- Set `sessions[1].completedAt`
- Leave `sessions[1].orchestrator` in place
- Set `sessions[1].verificationVerdict`

### Start + close session 3 (final)

- Start: flip `sessions[2].status`: `"not-started"` →
  `"in-progress"`; set `startedAt`; populate `orchestrator`.
- Close: flip `sessions[2].status`: `"in-progress"` → `"complete"`;
  set `completedAt`; set `verificationVerdict`; leave
  `orchestrator` in place.
- Final-close additional flip: top-level `status` → `"complete"`.

Each transition is still local — usually 2 to 4 field edits on a
single `sessions[]` entry. The set's overall lifecycle continues to
be driven by per-session status, with top-level `status` flipping
once at the start and once at the final close. The reader shim
derives the operator-visible "released between sessions" semantic
(top-level `orchestrator: null` between sessions) from per-session
status alone, so leaving the per-session block in place does NOT
make the Explorer think a closed session is still in flight.

---

## Worked examples (v4)

### Not-started

```json
{
  "schemaVersion": 4,
  "sessionSetName": "022-next-up",
  "status": "not-started",
  "sessions": [
    { "number": 1, "title": "Plan",   "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null },
    { "number": 2, "title": "Build",  "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null },
    { "number": 3, "title": "Verify", "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null }
  ]
}
```

`get_progress()` returns
`currentSession=None`, `nextSession=1`, `isBetweenSessions=False`.

### Mid-set, session 2 in flight

```json
{
  "schemaVersion": 4,
  "sessionSetName": "021-developer-approachability",
  "status": "in-progress",
  "sessions": [
    { "number": 1, "title": "Pull together quick-start",
      "status": "complete",
      "startedAt": "2026-05-11T14:30:00-04:00",
      "completedAt": "2026-05-12T10:15:00-04:00",
      "orchestrator": {
        "engine": "claude",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "effort": "high",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-11T14:30:00-04:00",
        "lastActivityAt": "2026-05-12T10:15:00-04:00"
      },
      "verificationVerdict": "VERIFIED" },
    { "number": 2, "title": "Wire the wizard into onboarding",
      "status": "in-progress",
      "startedAt": "2026-05-12T11:00:00-04:00",
      "completedAt": null,
      "orchestrator": {
        "engine": "claude",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "effort": "high",
        "chatSessionId": "5d3e9c2b-1f47-4a8b-9c61-2e7d8f4a1b3c",
        "checkedOutAt": "2026-05-12T11:00:00-04:00",
        "lastActivityAt": "2026-05-12T16:42:18-04:00"
      },
      "verificationVerdict": null },
    { "number": 3, "title": "Marketplace launch checklist",
      "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null }
  ]
}
```

`get_progress()` returns `currentSession=2`, `nextSession=3`,
`completedSessions=[1]`, `isBetweenSessions=False`. The extension's
tree view renders this as `1/3 · session 2 in flight`. The shim's
derived top-level `orchestrator` reflects session 2's holder (the
in-progress session); session 1's per-session orchestrator stays in
place as historical attribution.

### Between sessions

Session 1 has closed; session 2 has not yet started. Top-level status
is still `in-progress` (the set is live), but no session is in
flight.

```json
{
  "schemaVersion": 4,
  "sessionSetName": "030-session-state-v3-sessions-ledger",
  "status": "in-progress",
  "sessions": [
    { "number": 1, "title": "Schema doc + get_progress() helper",
      "status": "complete",
      "startedAt": "2026-05-17T05:00:00-04:00",
      "completedAt": "2026-05-17T10:30:00-04:00",
      "orchestrator": {
        "engine": "claude",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "effort": "high",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-17T05:00:00-04:00",
        "lastActivityAt": "2026-05-17T10:30:00-04:00"
      },
      "verificationVerdict": "VERIFIED" },
    { "number": 2, "title": "Dual-write writers + scaffolding",
      "status": "not-started",
      "startedAt": null, "completedAt": null,
      "orchestrator": null, "verificationVerdict": null }
  ]
}
```

`get_progress()` returns `currentSession=None`, `nextSession=2`,
`completedSessions=[1]`, `isBetweenSessions=True`. The extension's
tree view renders this as `1/2` plain (no in-flight annotation).
The shim's derived top-level `orchestrator` is `null` (no in-progress
session); session 1's per-session block stays as historical
attribution.

### Complete

```json
{
  "schemaVersion": 4,
  "sessionSetName": "021-developer-approachability",
  "status": "complete",
  "sessions": [
    { "number": 1, "title": "Pull together quick-start",
      "status": "complete",
      "startedAt": "2026-05-11T14:30:00-04:00",
      "completedAt": "2026-05-12T10:15:00-04:00",
      "orchestrator": {
        "engine": "claude", "provider": "anthropic",
        "model": "claude-opus-4-7", "effort": "high",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-11T14:30:00-04:00",
        "lastActivityAt": "2026-05-12T10:15:00-04:00"
      },
      "verificationVerdict": "VERIFIED" },
    { "number": 2, "title": "Wire the wizard into onboarding",
      "status": "complete",
      "startedAt": "2026-05-12T11:00:00-04:00",
      "completedAt": "2026-05-13T16:00:00-04:00",
      "orchestrator": {
        "engine": "claude", "provider": "anthropic",
        "model": "claude-opus-4-7", "effort": "high",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-12T11:00:00-04:00",
        "lastActivityAt": "2026-05-13T16:00:00-04:00"
      },
      "verificationVerdict": "VERIFIED" },
    { "number": 3, "title": "Marketplace launch checklist",
      "status": "complete",
      "startedAt": "2026-05-13T17:00:00-04:00",
      "completedAt": "2026-05-13T18:45:00-04:00",
      "orchestrator": {
        "engine": "gpt-5-4", "provider": "openai",
        "model": "gpt-5.4", "effort": "medium",
        "chatSessionId": null,
        "checkedOutAt": "2026-05-13T17:00:00-04:00",
        "lastActivityAt": "2026-05-13T18:45:00-04:00"
      },
      "verificationVerdict": "VERIFIED" }
  ]
}
```

Each session's orchestrator block is preserved as historical
attribution — different sessions may have been run by different
orchestrators (here, sessions 1-2 by Claude, session 3 by Codex).
The shim's derived top-level `orchestrator` is `null` because no
session is in-progress. Sets migrated from v3 carry `null`
orchestrator on sessions that were closed by the v3 writer (whose
on-close clear of the top-level block left nothing to attribute).

---

## Cancel / restore

Cancellation is tracked by the **state file's `status` field**.
`status: "cancelled"` is the canonical signal; the extension's
bucketing read consults the state file first and routes the set to
the **Cancelled** tree group when it finds that value. This is the
Set 035 extension of the H2 single-source-of-truth verdict that
Set 033 Session 2 locked for orchestrator state.

The `cancelLifecycle` helpers (`cancelSessionSet` /
`restoreSessionSet`) continue to write a companion `CANCELLED.md` or
`RESTORED.md` audit-history markdown file at every cancel/restore
boundary. These files are **operator-readable audit artifacts**: the
prepend-formatted history they accumulate (`Cancelled on <iso>` /
`Restored on <iso>` entries with reasons) is the durable record of
what happened and when. They are no longer the bucketing signal,
but they are not retired.

### Canonical reader

The single entry point is
[`readCancellationState(sessionSetDir)`](../tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts)
in `tools/dabbler-ai-orchestration/src/utils/cancelLifecycle.ts`.
It returns one of four discrete values:

| Return | Meaning |
|---|---|
| `"cancelled"` | The state file declares `status: "cancelled"`. Bucket the set as Cancelled. |
| `"restored"` | The state file declares a non-cancelled status AND `RESTORED.md` is present on disk. History-aware: the set is live, but has been cancelled and restored in the past. |
| `"active"` | The state file declares a non-cancelled status AND no `RESTORED.md` is on disk. The common case. |
| `"unknown"` | No state file, unparseable JSON, or a state file with no usable `status` field. The caller must fall back to the legacy file-presence predicates (`isCancelled` / `wasRestored`). |

`readCancellationState` is the only function readers should call
for bucketing decisions. The legacy predicates remain exported for
the fallback path and for cross-engine parity comparisons against
the Python writer in `ai_router/session_lifecycle.py`, but they are
not the bucketing API. The wired-in call site is
[`fileSystem.ts:readSessionSets()`](../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts).

### Writer symmetry

The two canonical writers — `cancelLifecycle.ts` (TypeScript) and
`ai_router/session_lifecycle.py` (Python) — keep both signals in
lockstep at every cancel/restore boundary. Both writers route v1/v2/v3/v4
input through `normalizeToV4Shape` / `_to_v4_on_disk_shape` and emit
canonical v4 output:

- A successful `cancelSessionSet` / `cancel_session_set` writes the
  `CANCELLED.md` audit entry **and** sets `state.status =
  "cancelled"` with the prior status captured into
  `preCancelStatus` (an opaque passthrough field preserved across
  rewrites).
- A successful `restoreSessionSet` / `restore_session_set` renames
  `CANCELLED.md` to `RESTORED.md` (preserving history), prepends a
  new `Restored on <iso>` entry, **and** restores `state.status`
  from `preCancelStatus` (or, when `preCancelStatus` is missing,
  infers from file presence — see `inferStatusFromFiles`).
- **Re-cancel preserves the original `preCancelStatus`.** A
  cancel-on-an-already-cancelled set prepends a new audit entry
  but does NOT overwrite `preCancelStatus` with `"cancelled"` —
  that would lose the original status across the next restore.

Set 035 Session 2's writer-parity check confirmed the two writers
produce byte-equivalent on-disk output (LF newlines, UTF-8 no BOM,
local-time ISO-8601 with second precision and `±HH:MM` offset).
Set 047 Session 5 re-validated the parity on v4 emission.
A set cancelled on one platform reads identically when the same
repo is opened on another.

### Legacy-fallback path

The extension's reader keeps one fallback: if `session-state.json`
is missing, unparseable, or carries no usable `status` field (legacy
v1 snapshot, hand-edited shape, brand-new folder), and a
`CANCELLED.md` is present on disk, the set still buckets as
Cancelled. The fallback emits a `console.warn` so a diagnostic
trail exists if a state-file write bug ever masks a real
cancellation behind an inconsistent status. Modern v3 and v4 writes
from either writer always populate `status` correctly, so the
fallback branch is exercised only for legacy state and manually
edited files.

The state-file-first contract intentionally does NOT consult
`CANCELLED.md` presence when the state file declares a
non-cancelled `status`. A stray `CANCELLED.md` paired with
`status: "complete"` represents an operator-resolvable
inconsistency (likely a manual edit), not a signal to silently
override the state file.

Per-session cancellation is reserved for a future schema. v4
readers tolerate `"cancelled"` in `sessions[]` but no v4 writer
emits it.

### Layer-3 coverage

The state-file-first contract is pinned by a Layer-3 Playwright
smoke at
[`tools/dabbler-ai-orchestration/src/test/playwright/cancellation-state-file.spec.ts`](../tools/dabbler-ai-orchestration/src/test/playwright/cancellation-state-file.spec.ts).
Three scenarios cover both paths: (1) `status: "cancelled"` with
no `CANCELLED.md` on disk → Cancelled bucket (the new contract);
(2) no usable state file + `CANCELLED.md` present → Cancelled
bucket (the legacy fallback); (3) `status: "complete"` with a
stray `CANCELLED.md` is NOT bucketed as Cancelled (the state file
wins).

---

## Prerequisites — cross-set blocking

Set 047 ships a `prerequisites:` field on `spec.md`'s Session Set
Configuration block that declares which other sets must complete
before this one is workable. The Explorer cross-references each
set's prereqs against the target set's `status` and adds a
`blockedByPrereqs: boolean` derived property to the in-memory
`SessionSet` record. Blocked rows render a `[BLOCKED BY PREREQS]`
badge in the Explorer description.

### Spec-side declaration

```yaml
## Session Set Configuration

totalSessions: 4
requiresUAT: false
requiresE2E: false
prerequisites:
  - slug: 047-state-file-schema-v4-audit
    condition: complete
  - slug: 045-log-harvest
    condition: complete
```

The enum for `condition` is `"complete"` only today. The field is
typed as a string so a future spec can extend the enum.

### Parser semantics

`parsePrerequisites(specPath)` (TS) is a lightweight regex parser —
no YAML lib dependency — that:

- Strips trailing YAML `# comment` from scalar values before
  matching.
- Distinguishes "no `condition:` key present" (defaults to
  `"complete"`) from "key present but invalid" (drops the entry).
- Drops entries missing `slug`.
- Returns `null` when the field is absent entirely, `[]` when
  explicitly empty.

### Cross-reference semantics

`deriveBlockedByPrereqs(sets)` runs after `readSessionSets()` /
`readAllSessionSets()` builds the merged set list, so cross-root
prereq resolution works (a set in one workspace root can depend on
a set in another). The derivation rules:

- ANY unsatisfied prereq blocks the row.
- An unknown target slug (typo / missing set) keeps the row
  blocked — typos do NOT silently unblock.
- The `[BLOCKED BY PREREQS]` badge is suppressed on terminal-state
  rows (`complete` / `cancelled`) because once a set has closed,
  its dependency status is no longer actionable.

The `blockedByPrereqs` property is a derived in-memory boolean;
it is never persisted to the state file.

---

## Lazy synthesis (file-absent branch)

A folder with `spec.md` but no `session-state.json` triggers
`ensureSessionStateFile` (extension) / `ensure_state_file` (router),
which infers a starting shape from current file presence:

| Files present | Inferred `status` | `sessions[]` shape |
|---|---|---|
| `change-log.md` | `"complete"` | every session promoted to `"complete"`; per-session `completedAt` left `null` (the change-log mtime is a set-level heuristic, not a per-session boundary) |
| `activity-log.json` (no change-log) | `"in-progress"` | session 1 promoted to `"in-progress"`; `sessions[0].startedAt` set from the earliest activity-log timestamp |
| Neither | `"not-started"` | every session `"not-started"` |

Both writers also seed `sessions[]` by parsing `spec.md` headings
(`### Session K of N: <title>`) or its Session Set Configuration
block's `totalSessions:` value; when the spec has neither, they
write the plan-less carve-out shape (no `sessions[]` key, top-level
`status: "in-progress"` + `startedAt` + `orchestrator` passthroughs).

---

## Tier expectations

- **Full tier** (`Workflow: Full` in the spec frontmatter): `ai_router`
  writes the state file on every session boundary.
  - `start_session`: validates no other session is in-progress
    (invariant rule 3), flips `sessions[N-1].status` to
    `"in-progress"`, populates `sessions[N-1].startedAt` and
    `sessions[N-1].orchestrator`, sets top-level `status` accordingly.
    Always backfills `sessions[]` from `spec.md` if absent unless the
    plan-less carve-out fires.
  - `close_session`: validates `sessions[N-1].status` is
    `"in-progress"` (or already `"complete"` under idempotent
    retry), flips it to `"complete"`, sets `sessions[N-1].completedAt`,
    **leaves `sessions[N-1].orchestrator` in place** as historical
    attribution, sets `sessions[N-1].verificationVerdict`, then
    re-derives top-level status (rule 6/7).
- **Lightweight tier** (`tier: "lightweight"` in spec.md's Session
  Set Configuration block): the AI router writers DO operate, but
  under Set 048's `--no-router` mode the verification step is
  short-circuited to a manual attestation rather than a routed call.
  The Lightweight orchestrator follows the SAME process as Full for
  model/effort identification, session-set identification, session
  identification, and `session-state.json` updates at appropriate
  times — the difference is operational (no metered API calls, no
  auto-verification, copyable review prompts, suggested-not-required
  UAT/E2E), not structural (same writer code paths, same on-disk
  shape).
  - `start_session` under `--no-router`: identical write path; no
    LLM credentials needed (lazy imports per Set 048 §3.1 keep
    `anthropic` / `openai` / `google-generativeai` out of the
    Lightweight code path entirely).
  - `close_session` under `--no-router`: skips the routed
    verification call; records `verificationVerdict: "manual"` (or a
    free-text reason supplied via `--reason-file`). The
    `external-verification.md` soft gate (§3.5 of Set 048's spec)
    fires when the file is absent and the session is in-progress.
  - **Hand-maintained Lightweight state files** are still supported
    for consumers who can't or don't want to install
    `dabbler-ai-router`. For those, the one-field-flip recipe above
    applies; **always include and maintain `sessions[]`** — it is
    the canonical authoritative ledger under hand-maintenance. The
    per-consumer migrator `python -m
    ai_router.migrate_lightweight_to_canonical_v4` recognizes
    documented non-canonical Lightweight shapes (`sessionLog[]`
    alias, missing `schemaVersion`, status aliases) and rewrites
    them to canonical v4 with a `session-state.lwbak.json`
    one-cycle-rollback backup.

---

## Reading a v3 file (compat path)

Before v4 reaches every consumer repo, readers will still encounter
v3 files in the wild. The compat path is automatic: the reader shim
accepts any `schemaVersion` from 1 through 4 and returns a v4
read-view. Callers do not branch on schema version.

The shim's v3 → v4 promotion rules:

- Top-level `orchestrator` block (if present) is promoted to the
  in-progress session's `sessions[N].orchestrator` (or, when between
  sessions, to the most-recently-completed session).
- Top-level `startedAt` is promoted to the earliest in-progress or
  completed session's `sessions[N].startedAt`.
- Top-level `completedAt` is promoted to the most-recently-completed
  session's `sessions[N].completedAt`.
- Top-level `verificationVerdict` is promoted to the
  most-recently-completed session's `sessions[N].verificationVerdict`.

The promoted view is read-only — the shim does not mutate the
on-disk file. To convert a v3 file to v4 on disk, use the migrator
(see next section).

### v2 → v3 → v4 default-to-not-started rule

When the shim sees a v2 (or v1) input, it routes through
`synthesize_v3_from_v2(state, spec_md_path)` first to produce a
v3-shaped intermediate, then proceeds with the v3 → v4 promotion.
The v2 synthesizer follows the project's
`feedback_default_not_started_evidence_to_escalate` rule: every
session defaults to `"not-started"` and is only escalated when
concrete evidence is present:

- A session escalates to `"complete"` **only** if its number is
  present in v2's `completedSessions[]` as a strict positive integer.
- A session escalates to `"in-progress"` **only** if it equals v2's
  `currentSession` AND the top-level status is `"in-progress"` AND
  the session is not already complete.
- All other sessions stay `"not-started"`.

This biases conservatively: a hand-edited v2 file with ambiguous
fields reads as less progressed than it might be, which the operator
can fix by hand, rather than reading as more progressed and silently
producing wrong "X/N" counts.

**The shim does not "fix" contradictions.** A v2 file with top-level
`status: "complete"` but an incomplete `completedSessions[]` is
reported faithfully: the named-complete sessions are `"complete"`,
the rest are `"not-started"`, and the contradiction surfaces as a
rule-7 violation on the next `get_progress()` call. Per the "fail
loud, never silently recover" rule, the operator (or a repair tool)
is responsible for resolving the inconsistency.

---

## v3 → v4 migration

The migrator (Set 047 Session 3) converts v3 files on disk to
canonical v4 in place. Two surfaces invoke it:

### CLI

```bash
# Dry run (default) — shows what would change without writing.
python -m ai_router.migrate_v3_to_v4

# Apply mode — writes v4 in place; writes session-state.v3.bak.json
# alongside as the rollback artifact.
python -m ai_router.migrate_v3_to_v4 --in-place

# Single set:
python -m ai_router.migrate_v3_to_v4 --in-place --only <slug>
```

Properties:

- **Idempotent** — re-running on a v4 file is a no-op (the migrator
  detects `schemaVersion >= 4` and skips).
- **Validates before writing** — the resulting v4 state is checked
  against the 8 invariant rules; a `WOULD-VIOLATE` disposition
  refuses to write rather than producing a malformed file.
- **Writes the `.bak` before the new file** — so a partial write is
  always recoverable.
- **Per-set independence** — one set's failure does not block
  another set's migration. The CLI exits non-zero iff any set
  reported a hard error.

### VS Code right-click action

The Session Sets view's right-click menu offers **Migrate to v4
schema** on any v3 row. The action wraps the same migrator in
single-set mode and shows the result (and any rollback path) in a
VS Code notification.

### Rollback

See [`v3-to-v4-rollback-procedure.md`](v3-to-v4-rollback-procedure.md)
for the full trigger conditions, single-set / batch restore steps,
and post-rollback validation.

---

## Bucketing in the Session Sets Explorer (v4)

The extension's tree view buckets each row from `get_progress()` plus
filename signals:

- `status === "cancelled"` → **Cancelled** (state file wins,
  Set 035). Legacy fallback: if no usable state file is present and
  `CANCELLED.md` exists on disk, the set still buckets as
  Cancelled — see [§ Cancel / restore](#cancel--restore).
- Else top-level `status === "complete"` and `isBetweenSessions ===
  false` → **Complete** (the user-visible label that was "Done"
  through v0.13.x).
- Else top-level `status === "in-progress"` → **Active**.
- Else → **Not Started**.

The "not mid-set" guard (`isMidSetComplete` in
`tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`) consults
the same `sessions[]` ledger as `get_progress()`; v4 makes the guard
trivial since "every session complete" is directly readable. The
legacy `completedSessions[]` + events-ledger fallback paths described
in earlier versions of this doc are still tolerated for reading old
files but are not exercised by v4 writers.

A row whose set declares `prerequisites:` and has at least one
unsatisfied prereq target ALSO renders the `[BLOCKED BY PREREQS]`
badge in its description — the badge is suppressed on terminal-state
rows (Complete / Cancelled).

---

## Drift check

The v4 example file at `docs/session-state-schema-example.json` is
the canonical reference. A future drift check will regenerate it
from the live schema constants and fail-loud when the documented
example and the live writer disagree. Until then, keep them in sync
by hand when either changes.
