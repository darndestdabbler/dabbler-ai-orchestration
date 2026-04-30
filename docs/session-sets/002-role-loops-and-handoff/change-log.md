# Change Log — Set 002: Role Loops + Mode-Aware Handoff

**Status:** Complete
**Sessions:** 4 of 4
**Started:** 2026-04-30
**Completed:** 2026-04-30

> Authored directly by the orchestrator (not routed). Per durable user
> instruction (memory: `feedback_ai_router_usage`), the AI router was
> restricted to end-of-session verification only across this set, so
> the routed change-log generation step was skipped.

---

## What landed

This set delivers the **producer/consumer machinery** that makes
outsource-last operating mode possible: a long-running verifier-role
daemon, a long-running orchestrator-role daemon, mode-aware `route()`
and `verify()` paths, stale-session detection, a restart command, and
six end-to-end failure-injection tests proving the recovery semantics
hold under real subprocess crashes and concurrency. **No close-out
gate, no enforcement** — that machinery is the next set's scope (Set
3). Outsource-first behavior is unchanged in every code path.

### Session 1 — Verifier-role daemon

- `ai-router/verifier_role.py`: `VerifierDaemon` class with `run_one`
  and `run_forever`; worker_id format
  `<hostname>:<pid>:<provider>:<8-hex>`; `FollowUpRequested` exception
  carrying clarification text.
- `process_one_message` owns the per-message lifecycle: starts a
  heartbeat thread, calls the pluggable verifier, persists the result
  via `complete`/`add_follow_up`/`fail`. Heartbeat thread runs every
  30s against a 600s lease (20× safety margin), exits silently on
  `ConcurrencyError` (lease loss), captures any other exception for
  the joiner to re-raise.
- `reclaim_expired` runs opportunistically before each `claim` so
  recovery proceeds without an external scheduler. Restart-safe:
  never steals a prior worker's active claim.
- SIGTERM/SIGINT install a graceful shutdown that lets the in-flight
  job finish before exiting.
- argparse CLI: `--provider`, `--base-dir`, `--poll-interval`,
  `--lease-seconds`, `--heartbeat-interval`.
- 23 unit + integration tests (`test_verifier_role.py`) including a
  real-subprocess CLI test that monkey-patches `run_verification` via
  a driver script and observes completion through SQLite.

### Session 2 — Orchestrator-role daemon

- `ai-router/orchestrator_role.py`: `OrchestratorDaemon` mirroring
  `VerifierDaemon`. Reuses `process_one_message` and `make_worker_id`
  from Session 1, so heartbeat / lease / reclaim / shutdown semantics
  are identical.
- Two task types: `verification_followup` and `verification_rejected`
  (constants `TASK_VERIFICATION_FOLLOWUP` / `TASK_VERIFICATION_REJECTED`,
  tuple `ORCHESTRATOR_TASK_TYPES`). `make_dispatch_verifier` routes by
  `msg.task_type`, raising `UnknownTaskTypeError` on unrecognized types
  so the queue's fail/retry/timeout machinery applies.
- Pluggable handlers via constructor injection (Session 3 wired the
  production acknowledged-and-completed defaults).
- 22 tests (`test_orchestrator_role.py`) including a multi-round
  dialogue round-trip (verifier → followup → orchestrator-reply →
  verifier-completion) and a real-subprocess test where both daemons
  run as separate processes against shared SQLite files.

### Session 3 — Mode-aware `route()` / `verify()` + role status + restart

- `ai-router/daemon_pid.py`: pid-file layout under
  `<base_dir>/<provider>/<role>.daemon-pid`, atomic `os.replace`
  write, tolerant read, `is_pid_alive` cross-platform (`os.kill(pid,
  0)` on POSIX; `OpenProcess`+`GetExitCodeProcess` via `ctypes` on
  Windows).
- `ai-router/role_status.py`: discovers running daemons by walking
  `provider-queues/`, computes health (`alive` / `unhealthy` /
  `stale` / `stopped`) using `STALE_HEARTBEAT_MULTIPLIER = 2.0`. ASCII
  text output (cp1252-safe) and JSON output. CLI: `--provider`,
  `--base-dir`, `--json`.
- `ai-router/restart_role.py`: cross-platform shutdown signal
  (`CTRL_BREAK_EVENT` → `SIGTERM` on Windows; plain `SIGTERM` on
  POSIX), pid-file polling for shutdown confirmation, optional
  `--start` to spawn a detached replacement (`CREATE_NEW_PROCESS_GROUP
  + DETACHED_PROCESS` on Windows; `start_new_session` on POSIX).
  Handles the Windows `TerminateProcess` fallback by removing the
  orphaned pid file post-shutdown so subsequent `role_status` is
  consistent.
- Mode-aware `route()` in `ai-router/__init__.py`:
  `_resolve_outsource_mode` precedence is explicit-arg > env var
  (`AI_ROUTER_OUTSOURCE_MODE`) > spec.md `ModeConfig` >
  `DEFAULT_OUTSOURCE_MODE`. Invalid env values warn-and-ignore;
  invalid spec configs raise (no silent fallback). On
  outsource-last + non-forced-sync task: builds payload, computes
  idempotency key as `sha256(session_set|session_number|task_type|
  content|context)`, enqueues, returns a `RouteResult` with
  `pending=True`, `message_id`, `queue_provider`, and zeroed cost
  fields. `_FORCE_SYNC_TASK_TYPES = {"session-verification"}`
  always runs synchronously so the close-out gate can never itself
  be outsource-last.
- `verify()` short-circuits to a pending `VerificationResult` when
  given a pending `RouteResult`.
- Production `run_verification` for the verifier daemon: filters
  models on `msg.to_provider` with `is_enabled` /
  `is_enabled_as_verifier`, picks the cheapest by
  `output_cost_per_1m`, builds the verification prompt, calls the
  model, parses verdict/issues, returns a result dict that the
  queue persists.
- 68 new tests across 4 files (`test_daemon_pid.py`,
  `test_role_status.py`, `test_restart_role.py`,
  `test_mode_aware_route.py`).
- Verified by gemini-pro in 2 rounds: round 1 caught a Critical
  completeness gap (`run_verification` was still a stub from Session
  1's deferral); round 2 verified after the production
  implementation landed.

### Session 4 — Failure-injection integration tests

- `ai-router/tests/test_failure_injection.py`: 7 tests across 7
  classes, all module-tagged `@pytest.mark.failure_injection` so
  Set 6's alignment audit can re-run them via
  `pytest -m failure_injection`.
- `pytest.ini` registers the `failure_injection` marker so the tag
  no longer triggers `PytestUnknownMarkWarning`.
- Helpers: `_wait_for` (deadline-bounded poller), `_hard_kill`
  (cross-platform SIGKILL / TerminateProcess that bypasses the
  daemon's finally block), `_shutdown_proc` (graceful with
  hard-kill fallback), `_write_verifier_driver` (parametrised
  driver-script emitter that monkey-patches `run_verification`),
  `_spawn_verifier` (compressed-time subprocess launcher).
- The six spec scenarios:
  1. **Lease expiration:** kill the claiming daemon, wait past 2×
     lease, second daemon completes — payload, idempotency_key,
     from_provider, to_provider, task_type, session_set,
     session_number all preserved across recovery; `attempts ≥ 1`
     and `claimed_by` differs from the first worker.
  2. **Heartbeat timeout escalation:** clamp `lease_expires_at` into
     the past via direct `sqlite3` connection over `MAX_ATTEMPTS`
     rounds, run `reclaim_expired` each time. Terminal state is
     `timed_out` (the queue's spelling for max-attempts lease
     exhaustion) with `failure_reason='lease expired without
     heartbeat'`, `attempts == MAX_ATTEMPTS`, claim metadata cleared.
  3. **Truncated SQLite recovery:** SIGKILL the daemon mid-complete;
     observed state is in `{claimed, completed}` only; if claimed,
     a recovery daemon completes it; `COUNT(*)` by idempotency_key
     stays at 1 (no duplicate insert).
  4. **CLI session reset:** spec narrative "the underlying CLI
     dies, the daemon detects, the restart picks up". Implemented as
     hung CLI subprocess + restart-driven recovery; new daemon
     completes with the recovery-marker payload.
  5. **Concurrent claim attempts:** two threads sync on a
     `threading.Barrier`, race `claim()` with distinct worker ids;
     SQLite's `BEGIN IMMEDIATE` writer lock guarantees exactly one
     winner.
  6. **Mode-switch mid-set:** session-set spec with
     `outsourceMode: last` but no `verifierRole`; `_resolve_outsource_mode`
     raises `ValueError` naming the spec path and the missing field —
     no silent fallback to outsource-first. (The drift case in the
     spec narrative degrades to this static-config case at
     validate-time.)
- Compressed-time defaults: `lease_seconds=1-2`,
  `heartbeat_interval=0.05`, `poll_interval=0.05`. Total runtime
  ~6.3s — well under the spec's 60s budget.
- Verified by gemini-pro in 2 rounds: round 1 raised three Minor
  refinements (one deferred as a Set-1 contract change with
  documented disagreement; two applied — `TEST_PROVIDER` constant
  and Scenario 6 docstring clarification); round 2 verified with the
  deferral explicitly approved.

---

## Test status at set close

`pytest`: **348 / 348 passing** in ~12s on Windows 11. Breakdown
relative to the start of the set:

- 222 tests carried over from Set 1
- +23 from Session 1 (verifier daemon)
- +22 from Session 2 (orchestrator daemon)
- +68 from Session 3 (daemon_pid + role_status + restart_role +
  mode-aware route + verifier `run_verification`)
- +13 from Session 3's `test_verifier_run_verification.py`
  consolidation (filtered into the 68 above; net new = 6 here)
- +7 from Session 4 (failure-injection scenarios + smoke)

The `failure_injection` marker isolates the slow real-subprocess
suite for the alignment audit; the other 341 tests stay in the
default fast path.

---

## What this set does **not** do

Per the spec's "Out of scope" list and confirmed at session close:

- **No close-out gate or enforcement.** That is Set 3's scope.
  Outsource-last sessions enqueue and continue; nothing yet blocks
  on queue completion. Acceptable per the spec's bootstrapping-window
  risk.
- **No cost reporting changes** (Set 4).
- **No capacity-signal writing** (Set 4).
- **No VS Code extension queue views** (Set 5).
- **No docs collapse** (Set 6).
- **No hybrid mode** — deferred per cross-provider review.
- **No behavior change for outsource-first sessions.** The default
  mode path is unchanged from pre-Set-002.

---

## Acceptance criteria — all met

- [x] Verifier daemon and orchestrator daemon both runnable
  (Sessions 1 + 2).
- [x] Mode-aware `route()` and `verify()` work in both modes
  (Session 3).
- [x] Restart command works (Session 3 — both real-subprocess and
  unit coverage).
- [x] All 6 failure-injection scenarios pass (Session 4).
- [x] No close-out machinery wired (deferred to Set 3 by design).
- [x] No behavior change for outsource-first sessions (verified by
  the test suite carrying over unchanged).

---

## Notable decisions and follow-ups

- **`failure_reason` precision deferral.** Session 4's verifier
  flagged that the queue's `failure_reason='lease expired without
  heartbeat'` for max-attempts timeouts is technically correct but
  less specific than `max_attempts_exceeded`. The fix would mutate
  Set 1's `queue_db.py`, which has been cross-provider VERIFIED
  twice. Deferred for human adjudication; the `state='timed_out'`
  column already encodes the max-attempts semantics.
- **Idempotency key shape.** `sha256(session_set | session_number |
  task_type | content | context)` makes a re-run of the same step
  within a session a no-op fetch rather than a duplicate enqueue.
  Set 3 should rely on this when the close-out gate retries.
- **Pluggable handler defaults.** Both daemons ship with
  acknowledged-and-completed default handlers so the daemons run
  end-to-end without operator wiring; substantive handlers are
  passed via constructor when needed.
- **The `session-verification` task type is the close-out
  synchronization barrier.** It is in `_FORCE_SYNC_TASK_TYPES` and
  always runs synchronously regardless of mode, because the
  close-out gate (Set 3) is what consumes outsource-last queue
  results.
