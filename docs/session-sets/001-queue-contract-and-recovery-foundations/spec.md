# Session Set: Queue Contract + Recovery Foundations

## Summary

Land the **SQLite-backed queue contract** with explicit job lifecycle (claim/lease/heartbeat/timeout/max-attempts), the new mode configuration schema additions, the disposition.json schema, and the session-events.jsonl lifecycle ledger. **No close-out machinery, no role-loops, no enforcement** — pure infrastructure that subsequent sets build on.

This set is the foundation of a combined redesign that adds **outsource-last operating mode** alongside the existing outsource-first mode AND fixes close-out reliability problems. Both reviewer rounds (close-out reliability proposal review + outsource-last plan review) converged on a single architectural conclusion: the queue must be a real durable state machine, not a thin file wrapper. This set delivers that.

---

## Why this set first

Per the cross-provider review of the outsource-last plan (Gemini Pro + GPT-5.4, both "Recommend with modifications"):

- **JSONL queues are too fragile for a correctness path.** Mid-write crashes on Windows leave truncated tail lines; mutable fields imply lost-update risk; cross-platform locking is unreliable. Both reviewers recommended SQLite or a spooldir pattern instead.
- **Job lifecycle must be explicit.** Without claim/lease/heartbeat/timeout, a verifier crash mid-job loses work permanently and the reconciler can't tell "slow" from "lost."
- **Set ordering matters.** Build the queue contract and lifecycle FIRST, before any close-out gate or role-loop builds against unstable semantics.

The data structures from the original close-out reliability proposal (`disposition.json`, `session-events.jsonl`, lifecycle states, `nextOrchestrator` rubric) are mode-agnostic by design and land here as part of the foundation.

---

## Scope

### In scope
- SQLite-backed queue (`ai_router/queue_db.py`) with per-message state machine
- Per-message states: `new`, `claimed` (with lease), `heartbeat_seen`, `completed`, `failed`, `timed_out`
- Idempotency keys per task; `complete()` is no-op on duplicate
- Per-CLI poll-loop primitives: `claim() → process → heartbeat() → complete()` (or `fail(reason)`)
- Schema migration v1 → v2 for `session-state.json` (lifecycle states, lazy migration)
- New `nextOrchestrator` field with rubric (`code` enum + `specifics` ≥ 30 chars)
- New mode config fields in spec.md `Session Set Configuration`: `outsourceMode`, `orchestratorRole`, `verifierRole`
- `disposition.json` schema (mode-aware: includes `verification_method: api | queue` field)
- `session-events.jsonl` append-only lifecycle ledger
- `--export-jsonl` command for git-trackable audit dumps from SQLite
- Backfill helper for any existing in-progress session sets

### Out of scope
- Role-loop daemons (`orchestrator_role`, `verifier_role`) — Set 2
- The `close_session` script and gate enforcement — Set 3
- `mark_session_complete()` wiring — Set 4
- Cost reporting changes — Set 4
- VS Code extension queue views — Set 5
- Workflow doc collapse — Set 6
- Hybrid mode (`tiebreakerFallback: api`) — deferred indefinitely (per review)

---

## Sessions

### Session 1: SQLite queue schema + state machine

**Goal:** Define the queue database schema and core state-transition operations.

**Deliverables:**
- New module `ai-router/queue_db.py`
- SQLite schema (per-provider DBs at `provider-queues/<provider>/queue.db`):
  ```sql
  CREATE TABLE messages (
      id TEXT PRIMARY KEY,                  -- UUID
      from_provider TEXT NOT NULL,          -- requester
      to_provider TEXT NOT NULL,            -- worker (this DB's owner)
      task_type TEXT NOT NULL,              -- e.g. session-verification
      session_set TEXT,
      session_number INTEGER,
      payload TEXT NOT NULL,                -- JSON-encoded task content
      idempotency_key TEXT NOT NULL UNIQUE, -- prevents duplicates
      state TEXT NOT NULL,                  -- new|claimed|completed|failed|timed_out
      claimed_by TEXT,                      -- worker process identifier
      claimed_at TEXT,                      -- ISO 8601
      lease_expires_at TEXT,                -- ISO 8601
      last_heartbeat_at TEXT,
      result TEXT,                          -- JSON-encoded result on completion
      failure_reason TEXT,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      enqueued_at TEXT NOT NULL,
      completed_at TEXT
  );
  CREATE TABLE follow_ups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL REFERENCES messages(id),
      from_provider TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
  );
  ```
- WAL mode enabled (`PRAGMA journal_mode=WAL`) for crash safety
- Core API:
  - `enqueue(provider, message) -> message_id` — atomic insert; rejects duplicate `idempotency_key`
  - `claim(provider, worker_id, lease_seconds=300) -> Optional[Message]` — atomic state transition `new → claimed`
  - `heartbeat(message_id, worker_id)` — extends lease; rejects if claim is from a different worker
  - `complete(message_id, worker_id, result)` — atomic transition `claimed → completed`; idempotent on already-complete
  - `fail(message_id, worker_id, reason)` — atomic; bumps attempts; transitions back to `new` if attempts < max_attempts, else `failed`
  - `reclaim_expired(provider) -> int` — finds `claimed` messages with `lease_expires_at < now()`, transitions back to `new`, returns count
- Unit tests: enqueue, claim, double-claim (second loses), heartbeat extends lease, complete idempotency, fail with retry, fail without retry (max_attempts), reclaim_expired
- Cross-platform sanity test: simulate worker crash by SIGKILL during transaction; verify WAL recovery on next open

**Acceptance:**
- All operations are atomic (verified by concurrent-process tests)
- Reclaim_expired correctly identifies and recovers crashed workers
- Schema is documented (one comment block at the top of `queue_db.py` summarizing each table and its invariants)

### Session 2: Message envelope + follow-up rounds

**Goal:** Define the high-level message API that role-loops will use, including multi-round follow-up dialogue.

**Deliverables:**
- Dataclass `QueueMessage` with all message fields + helpers
- `add_follow_up(message_id, from_provider, content)` — appends to the follow_ups table
- `read_follow_ups(message_id) -> List[FollowUp]`
- Configurable max-rounds (default 3); when exceeded, `fail(reason="max_followup_rounds_exceeded")` and surface for human escalation
- `--export-jsonl <provider>` CLI command — emits the full message history (including follow-ups) as JSONL for git-trackable audit
- `--import-jsonl <provider> <path>` CLI command — restores from a JSONL dump (for backup recovery)
- Unit tests: round-trip a message + 3 follow-ups, verify max-rounds enforcement, export-then-import round-trip

**Acceptance:**
- Multi-round dialogue is queryable in order
- `--export-jsonl` produces a deterministic format suitable for committing to git for audit purposes
- Max-rounds escalation produces a clear failure reason

### Session 3: Mode config schema additions + nextOrchestrator rubric

**Goal:** Extend the session-state.json schema and the spec.md Session Set Configuration block to be mode-aware.

**Deliverables:**
- Add `SessionLifecycleState` enum to `ai-router/session_state.py`: `work_in_progress`, `work_verified`, `closeout_pending`, `closeout_blocked`, `closed`
- Schema version bump in `session_state.py` from `schemaVersion: 1` to `schemaVersion: 2`
- Lazy migration on read: v1 `status: "in-progress"` → `work_in_progress`; v1 `status: "complete"` → `closed`. Rewrite as v2 on next write.
- New dataclasses in session_state.py:
  ```python
  NextOrchestratorReason: code (Literal[continue-current-trajectory|switch-due-to-blocker|switch-due-to-cost|other]) + specifics (str ≥ 30 chars)
  NextOrchestrator: engine + provider + model + effort + reason
  ```
- Validator `validate_next_orchestrator() -> (passed, errors[])`
- Read mode config from spec.md Session Set Configuration block:
  - `outsourceMode: first | last` (default: `first` for backward compat)
  - `orchestratorRole: claude | openai | gemini` (only used in `last`)
  - `verifierRole: claude | openai | gemini` (only used in `last`)
- Hybrid mode field (`tiebreakerFallback`) is **NOT** added; deferred per review.
- Unit tests: round-trip read-write, v1→v2 migration, malformed v1 file (graceful), nextOrchestrator validator pass/fail, mode-config defaults

**Acceptance:**
- All existing `mark_session_complete()` and `register_session_start()` flows continue to work unchanged
- A pre-existing v1 session-state.json reads correctly via lazy migration
- Mode config defaults to `outsourceMode: first` when not specified
- `validate_next_orchestrator()` returns `(False, [...])` for missing fields, short specifics, unknown enum values

### Session 4: disposition.json schema + writer

**Goal:** Define and implement the disposition.json artifact.

**Deliverables:**
- New module `ai-router/disposition.py`
- Dataclass `Disposition` with fields:
  - `status`: enum `["completed", "failed", "requires_review"]`
  - `summary`: str (narrative)
  - `files_changed`: List[str]
  - `verification_method`: enum `["api", "queue"]` — populated based on outsourceMode
  - `verification_message_ids`: List[str] — references to queue messages (only when method=queue)
  - `next_orchestrator`: Optional[NextOrchestrator] (required when status="completed" and not final session)
  - `blockers`: List[str] (must be non-empty when `next_orchestrator.reason.code == "switch-due-to-blocker"`)
- JSON Schema document at `ai-router/schemas/disposition.schema.json`
- `write_disposition(session_set_dir, disposition)` — atomic write via `os.replace`, idempotent
- `read_disposition(session_set_dir) -> Optional[Disposition]`
- `validate_disposition(disposition) -> (passed, errors[])` with cross-field rules
- Unit tests: round-trip, atomic-write under simulated mid-write interruption, all cross-field validation paths, mode-specific verification_method handling

**Acceptance:**
- Writing produces `<session-set-dir>/disposition.json`
- Reading round-trips losslessly
- Validation rejects malformed dispositions with specific, agent-readable messages
- File writes are atomic on Windows (uses `os.replace`)
- `verification_method: queue` requires `verification_message_ids` to be non-empty

### Session 5: session-events.jsonl ledger + backfill

**Goal:** Append-only lifecycle ledger that mirrors queue state for human audit; backfill existing in-progress sessions.

**Deliverables:**
- New module `ai-router/session_events.py`
- `append_event(session_set_dir, event_type, session_number, **fields)` appends one JSON line to `<session-set-dir>/session-events.jsonl`
- Event types: `work_started`, `verification_requested`, `verification_claimed`, `verification_completed`, `verification_timed_out`, `work_verified`, `closeout_requested`, `closeout_succeeded`, `closeout_failed`
- Each event includes: `timestamp` (UTC ISO 8601), `session_number`, `event_type`, plus per-event fields
- `read_events(session_set_dir) -> List[Event]`
- `current_lifecycle_state(events) -> SessionLifecycleState` derives current state from event log
- Backfill helper `backfill_events_for_session_set(session_set_dir)` reconstructs events from `session-state.json` and `activity-log.json` for any session set lacking `session-events.jsonl`
- Backfill walker `backfill_all_session_sets(base_dir="docs/session-sets")` runs across the workspace
- Unit tests: append, read, all 9 transitions, backfill from a sample fixture

**Acceptance:**
- File is append-only (verified by hash check on existing entries)
- Backfill produces correct event sequence for at least one real existing session set
- Lifecycle state derivation matches reality for: not-started, in-progress (pre-verification), in-progress (verified), complete

---

## Acceptance criteria for the set

- [ ] All five sessions complete with passing tests
- [ ] No existing session-set workflow breaks (verify via `print_session_set_status()`)
- [ ] Schema migration verified against at least one real-world existing session-state.json
- [ ] No new behavior wired in — data structures + queue infrastructure available, no enforcement
- [ ] Set 2 has all the primitives it needs (queue API, message envelope, follow-ups, ledger, schema)

---

## Risks

- **SQLite WAL mode interaction with antivirus on Windows.** WAL files (`-wal`, `-shm`) sometimes get scanned. Document workaround: exclude `provider-queues/` from antivirus scans or use `synchronous=NORMAL`.
- **Schema migration drift during the set itself.** New session sets created during this set's implementation may use the v1 schema. Lazy migration handles this; verify in Session 3.
- **JSON Schema vs. dataclass divergence.** Tests must validate dataclass-produced JSON against the JSON Schema document.
- **Backfill best-effort.** If activity-log.json or session-state.json for an existing session is malformed, log a warning and skip rather than fail the entire backfill.
- **Self-referential bootstrapping.** This set modifies the very tooling future close-out flows will use. Until Set 3 ships, close-out continues to use the old prose-driven path. Acceptable risk per prior alignment with the human.

---

## References

- Original close-out reliability proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- Plan v2 (post-cross-provider-review of outsource-last): `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
- Existing schema: `ai-router/session_state.py`
- Existing rate limiter (reused): `ai-router/utils.py::RateLimiter`
- Existing verifier selection (reused): `ai-router/verification.py::pick_verifier_model`

---

## Session Set Configuration

```yaml
totalSessions: 5
requiresUAT: false
requiresE2E: false
effort: high
outsourceMode: first
```
