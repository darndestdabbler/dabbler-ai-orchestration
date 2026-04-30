# Change Log — Set 001: Queue Contract + Recovery Foundations

**Status:** Complete
**Sessions:** 5 of 5
**Started:** 2026-04-30
**Completed:** 2026-04-30

> Authored directly by the orchestrator (not routed). Per durable user
> instruction (memory: `feedback_ai_router_usage`), the AI router was
> restricted to end-of-session verification only across this set, so
> the routed change-log generation step was skipped.

---

## What landed

This set delivers the **SQLite-backed queue contract**, the **mode-aware
session-state schema (v2)**, the **`disposition.json` artifact**, and
the **`session-events.jsonl` lifecycle ledger** — all of the data
structures and queue infrastructure that subsequent sets (role-loops in
Set 2, close-out machinery in Set 3) build on. **No close-out machinery,
no role-loops, no enforcement** were wired in this set; that scope is
deferred per the spec's "Out of scope" list.

### Session 1 — SQLite queue schema + state machine

- `ai-router/queue_db.py`: per-provider SQLite database with WAL mode,
  `messages` and `follow_ups` tables, atomic state transitions
  (`new → claimed → completed/failed/timed_out`).
- Core API: `enqueue`, `claim` (with lease), `heartbeat`, `complete`,
  `fail` (with attempt-bump and max-attempts handling), `reclaim_expired`.
- 41 unit tests (`test_queue_db.py`) covering all operations,
  double-claim races, lease extension, idempotent completion, retry
  bookkeeping, expired-claim recovery, and a `synchronous >= FULL`
  regression guard.

### Session 2 — Message envelope + follow-up rounds

- Extended `queue_db.py` with `FollowUp` dataclass and
  `add_follow_up`/`read_follow_ups`/`count_follow_ups`.
- `MaxFollowUpRoundsExceeded` raised on overflow; the message is
  durably transitioned to `failed` with
  `failure_reason="max_followup_rounds_exceeded"` before the
  exception propagates.
- `--export-jsonl` and `--import-jsonl` CLI subcommands for
  git-trackable audit dumps and recovery-from-backup; export is
  deterministic; import refuses non-empty targets.
- 21 additional unit tests (44 total).

### Session 3 — Mode config schema additions + nextOrchestrator rubric

- `session_state.py`: schema bumped to v2 with the
  `SessionLifecycleState` enum
  (`work_in_progress | work_verified | closeout_pending |
  closeout_blocked | closed`).
- v1 → v2 lazy migration on read; rewrite-as-v2 on next write.
- `NextOrchestrator` + `NextOrchestratorReason` dataclasses with the
  4-code rubric and a 30-char specifics minimum;
  `validate_next_orchestrator()`.
- `ModeConfig` parsed from a YAML fence inside the
  `Session Set Configuration` block of `spec.md`; defaults to
  `outsourceMode: first` for backward compat. `tiebreakerFallback` is
  not surfaced (deferred indefinitely per cross-provider review).
- 56 additional unit tests (120 total) including BOM tolerance,
  fence-aware section boundaries, yaml-labeled fence preference, and a
  real-world parse against the live spec.

### Session 4 — `disposition.json` schema + writer

- `ai-router/disposition.py`: `Disposition` dataclass with
  `status`/`summary`/`files_changed`/`verification_method`/
  `verification_message_ids`/`next_orchestrator`/`blockers` fields.
- `write_disposition` is atomic via tempfile + `os.replace` (Windows-
  safe); `read_disposition` is graceful on missing/malformed files.
- `validate_disposition` with cross-field rules:
  `verification_method=queue` requires non-empty `message_ids`,
  `verification_method=api` requires empty `message_ids`,
  `next_orchestrator` required when `status=completed` and not the
  final session, `blockers` required when reason code is
  `switch-due-to-blocker`.
- JSON Schema document at `ai-router/schemas/disposition.schema.json`
  with `allOf` conditional rules; tested for parity with the dataclass.
- 56 additional unit tests (176 total).

### Session 5 — `session-events.jsonl` ledger + backfill

- `ai-router/session_events.py`: append-only JSONL ledger with the
  nine event types from the spec
  (`work_started`, `verification_requested`, `verification_claimed`,
  `verification_completed`, `verification_timed_out`, `work_verified`,
  `closeout_requested`, `closeout_succeeded`, `closeout_failed`).
- `Event` dataclass (frozen); `append_event` (UTC-Z timestamps,
  non-int / unknown-event-type guards); `read_events` (malformed-line
  tolerant); `hash_existing_prefix` for the append-only invariant
  check.
- `current_lifecycle_state(events)` derives the most recent session's
  state; observability-only events (claimed / requested / timed_out)
  do not advance state; non-VERIFIED verdicts do not advance.
- `backfill_events_for_session_set` reconstructs from
  `activity-log.json` + `session-state.json`, marking each synthetic
  event with `backfilled: true`. The closeout trio fires only on the
  highest session and only when `change-log.md` is present (or the
  saved lifecycleState is past `work_verified`).
- `backfill_all_session_sets` walks `docs/session-sets/`.
- 46 additional unit tests (222 total) including a real-world parse
  that backfills a clone of the live set-001 directory.

## Test totals

| Session | Tests added | Cumulative | Verdict |
|---|---|---|---|
| 1 | 41 | 41 | VERIFIED (round 3) |
| 2 | 21 | 64 | VERIFIED (round 1) |
| 3 | 56 | 120 | VERIFIED (round 3) |
| 4 | 56 | 176 | VERIFIED (round 1) |
| 5 | 46 | 222 | VERIFIED (round 1) |

All 222 tests pass under Python 3.11 / Windows 11.

## Out-of-scope (deferred to later sets)

- Role-loop daemons (`orchestrator_role`, `verifier_role`) — Set 2
- `close_session` script and gate enforcement — Set 3
- `mark_session_complete()` wiring to `disposition.json` /
  `session-events.jsonl` — Set 4
- Cost reporting changes — Set 4
- VS Code extension queue views — Set 5
- Workflow doc collapse — Set 6
- Hybrid mode (`tiebreakerFallback: api`) — deferred indefinitely

## Acceptance check

- [x] All five sessions complete with passing tests
- [x] No existing session-set workflow breaks (verified via the
      `find_active_session_set()` and `print_session_set_status()`
      paths covered by the test suite, plus a live backfill against
      this set's own activity log)
- [x] Schema migration verified against at least one real-world
      session-state.json (the live set-001 file, exercised by the
      real-world parse test in Session 3)
- [x] No new behavior wired in — data structures + queue
      infrastructure are available, no enforcement
- [x] Set 2 has all the primitives it needs (queue API, message
      envelope, follow-ups, ledger, schema)

## Note on workflow deviations

Per durable user instruction (memory: `feedback_ai_router_usage`), the
AI router was restricted to end-of-session verification across the
entire set. The following routed-by-default workflow steps were
intentionally skipped session-by-session, with each skip recorded in
`activity-log.json`:

- Step 3.5 — `ai-assignment.md` authoring (sessions 1–5)
- Step 8 — next-orchestrator recommendation (sessions 1–5)
- Step 8 (last session) — next-session-set recommendation
- Step 8 (last session) — routed change-log generation (this file is
  authored directly instead)

End-of-session verification ran every session, as required by Rule #2
(never skip verification). Verifier was `gpt-5-4` for sessions 1–3 and
`gemini-pro` for sessions 4–5 (the latter per a per-session user
override).
