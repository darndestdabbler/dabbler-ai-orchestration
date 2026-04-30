# Change Log — 003-closeout-script-and-deterministic-machinery

## Summary

Set 003 lands the **`close_session` script** as the sole synchronization
barrier between session work and session close-out. After this set, the
orchestrator can run `python -m ai_router.close_session` against any
session set and get a deterministic, auditable close-out with hardened
gate checks, queue-mediated verification waiting, a concurrency lock
model, a reconciler that recovers stranded sessions, and the
`--manual-verify` / `--repair` bootstrapping-window flags.

`mark_session_complete()` wiring is intentionally deferred to Set 4 —
this set ships the gate; the orchestrator's existing Step 8 path is
unchanged.

## Sessions

### Session 1 — `close_session` skeleton + flags + idempotency

- New module `ai-router/close_session.py` with full CLI (`--session-set-dir`,
  `--json`, `--interactive`, `--force`, `--allow-empty-commit`,
  `--reason-file`, `--manual-verify`, `--repair`, `--apply`,
  `--timeout`)
- Stable structured JSON output shape (`result`, `exit_code`,
  `session_set_dir`, `session_number`, `messages`, `gate_results`,
  `verification`, `events_emitted`)
- Exit-code table: 0 success | 1 gate failure | 2 invalid invocation |
  3 lock contention | 4 verification timeout | 5 repair drift
- Idempotency: re-running on a closed set is a no-op
- `closeout_requested` / `closeout_succeeded` / `closeout_failed`
  ledger event emission
- Gate-check skeleton (5 named stubs); verification-wait skeleton;
  `--repair` skeleton walk
- 26 unit tests (22 + 4 added during round-1 fixes)

### Session 2 — Hardened gate checks + concurrency lock

- New module `ai-router/gate_checks.py` with 5 deterministic gate
  predicates sharing a `(passed, remediation)` shape:
  - `check_working_tree_clean` — scoped to disposition's `files_changed`
    plus universal ignore patterns; uses `git status --porcelain -uall`
    to defeat directory collapse
  - `check_pushed_to_remote` — enumerates detached HEAD, missing
    upstream, ahead-of-upstream, non-fast-forward, and branch
    protection rejection
  - `check_activity_log_entry`
  - `check_next_orchestrator_present` — final-session shortcut
  - `check_change_log_fresh` — final-session-only; mtime ≥ session
    start OR session-number reference in body
- New module `ai-router/close_lock.py`: file-based concurrency lock
  with O_CREAT|O_EXCL atomic create, TTL stale-lock reclaim, and a
  cross-platform `_pid_running` (POSIX `os.kill(pid, 0)`; Windows
  `OpenProcess` via ctypes with proper error disambiguation)
- Wired the registry into `_run_gate_checks`; predicate exceptions
  become failed-gate remediations rather than crashing the flow
- Lock acquired around the main path AND the `--repair` branch
- 41 new tests (24 gate-check + 10 lock + 7 integration)

### Session 3 — Verification-wait + reconciler

- `_wait_for_verifications` in `close_session.py`: queue-mode polling
  against `queue_db` with discoverable per-provider queues, injectable
  `sleep` / `monotonic` for tests, `--timeout` honored, missing
  message ids treated as drift-fail, distinct outcomes for
  `completed` / `failed` / `timed_out` / `pending_at_deadline`
- Per-message `verification_completed` / `verification_timed_out`
  ledger events with `queue_provider` / `queue_state` /
  `failure_reason` payloads
- Result routing: timed-out → `verification_timeout` exit 4;
  failed/missing → `gate_failed` exit 1 with synthetic
  `verification_passed` gate
- New module `ai-router/reconciler.py`: walks `docs/session-sets`,
  derives lifecycle state via `current_lifecycle_state`, picks
  STRANDED_STATES (CLOSEOUT_PENDING / CLOSEOUT_BLOCKED) older than
  `DEFAULT_QUIET_WINDOW_MINUTES=5`, re-invokes `close_session.run()`
  per stranded set, captures per-set runner exceptions without
  aborting the sweep
- `register_sweeper_hook()` for orchestrator-startup invocation (Set 6
  wires the call site)
- CLI: `python -m ai_router.reconciler` for manual invocation
- 22 new tests (5 verification-wait + 17 reconciler)

### Session 4 — `--manual-verify`, `--repair`, full integration

- `--manual-verify` validation: now requires either `--interactive`
  (prompt for attestation on stdin) or `--reason-file` (file becomes
  the attestation); silent bypass would defeat the audit trail
- `_prompt_manual_attestation` helper for the interactive path
- Empty / aborted attestation rejected as `invalid_invocation`
- Attestation lands on `closeout_requested` (when sourced from
  prompt) and on a `verification_completed` event with
  `method=manual` + `attestation=<text>` + `verdict=manual_attestation`
  (rides on the existing event type because EVENT_TYPES is a frozen
  Set-1 enum, per Session 3 review rationale)
- `_run_repair` replaced the skeleton with a real drift walk:
  - **Case 1** — state-says-closed-but-no-event (bootstrapping legacy
    drift): auto-fixed with `--apply` by appending synthetic
    `closeout_requested` + `closeout_succeeded` carrying
    `repaired=true`
  - **Case 2** — closeout_succeeded-but-state-not-flipped: auto-fixed
    with `--apply` by calling `mark_session_complete`
  - **Case 3** — stranded mid-closeout (`closeout_requested` without
    terminal companion): reported only; recovery is the reconciler's
    job
  - **Case 4** — disposition references missing queue messages:
    reported only; refuses to fabricate verifier verdicts
- Idempotent under repeat `--apply` invocation; never modifies git
  state
- 17 new tests (14 in `test_close_session_session4.py`: manual-verify
  event/validation/empty-input rejected, four repair drift cases with
  diagnostic-and-apply paths, idempotency, four end-to-end scenarios;
  3 in `test_close_session_skeleton.py`: validation rule for the
  attestation-source requirement)
- Existing `test_manual_verify_skips_queue_wait` updated to pass
  `--reason-file` (new validation requires it)

## Test counts

| Session | Total tests | New tests |
|--------:|------------:|----------:|
| 1       |         374 |       +26 |
| 2       |         415 |       +41 |
| 3       |         437 |       +22 |
| 4       |         454 |       +17 |

All 454 tests pass on Windows.

## Acceptance criteria for the set

- [x] `close_session` runs as a CLI script with all flags
- [x] All 5 gate checks land with tests
- [x] Concurrency lock prevents corruption
- [x] Reconciler recovers a stranded session
- [x] All 4 integration scenarios pass on Windows
- [x] `--manual-verify` and `--repair` work as documented
- [x] **No wiring into `mark_session_complete()` yet** — Set 4 does that

## Risks called out and how this set addressed them

- **Git invariant edge cases.** Session 2's `check_pushed_to_remote`
  enumerates detached HEAD / missing upstream / non-fast-forward /
  branch-protection rejection deliberately rather than catch-all.
- **Verification-wait timeout calibration.** Default 60 minutes,
  override via `--timeout`. Timeout transitions the session to
  `closeout_blocked` with a structured reason; the reconciler picks
  it up on the next sweep.
- **`--repair --apply` masking deeper problems.** `--apply` is
  explicit (never the default). Repair logs `repaired=true` and
  `repair_reason` on every synthetic event so the audit trail is
  unambiguous.
- **Reconciler running during work.** Reconciler runs on a sweep
  schedule. Until Set 6 wires the orchestrator-startup hook, manual
  `python -m ai_router.reconciler` is the recovery path.

## Open follow-ups for Set 4

- Wire `mark_session_complete()` to invoke the gate
- Tighten the `--force` deprecation path
- Cost reporting changes
