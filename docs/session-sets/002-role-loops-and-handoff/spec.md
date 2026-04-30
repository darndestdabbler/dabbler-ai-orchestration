# Session Set: Role Loops + Mode-Aware Handoff

## Summary

Build the long-running CLI **role loops** (orchestrator-role and verifier-role) that drive outsource-last operating mode, plus the **mode-aware** `route()` and `verify()` paths in the AI router. After this set, two long-running CLI sessions can coordinate via the SQLite queue from Set 1. Verification becomes **non-blocking by default** — work-doing sessions enqueue and continue; close-out (Set 3) is the sole synchronization barrier.

This set delivers the producer/consumer machinery that makes outsource-last possible. **No close-out gate yet, no enforcement** — that's Set 3.

---

## Why this set comes second

The cross-provider review of the v1 plan identified a critical sequencing bug: the original Set 2 (close-out gate) was scheduled before the role-loops, meaning the gate would have been built against unstable queue semantics. Both reviewers (Gemini Pro + GPT-5.4) recommended swapping: queue contract + role-loops FIRST, then close-out gate that consumes a stable contract.

This set also implements the **non-blocking verification** pattern both reviewers converged on. Per GPT-5.4: *"only require a blocking wait at explicit close-out boundaries rather than on every artifact emission."* This is implemented here; close-out as the sole blocking point is implemented in Set 3.

---

## Scope

### In scope
- `python -m ai_router.orchestrator_role --provider <name>` daemon
- `python -m ai_router.verifier_role --provider <name>` daemon
- Heartbeat emission during long-running tasks
- Stale-session detection + restart command
- Mode-aware `route()` and `verify()` in `ai-router/__init__.py`:
  - `outsourceMode: first` → existing API-call path (unchanged)
  - `outsourceMode: last` → enqueue to queue, return immediately (non-blocking)
- Multi-round follow-up support (cap at 3 per Set 1)
- Failure-injection tests for crash, lease expiration, truncation recovery, CLI auth reset

### Out of scope
- Close-out script and gate enforcement — Set 3
- Cost reporting changes — Set 4
- Capacity-signal writing — Set 4
- VS Code extension queue views — Set 5
- Docs collapse — Set 6
- Hybrid mode — deferred per review

---

## Sessions

### Session 1: Verifier-role daemon

**Goal:** A long-running CLI worker that polls a queue, claims verification jobs, runs them via `pick_verifier_model` + `call_model`, and writes results back.

**Deliverables:**
- New module `ai-router/verifier_role.py` with `__main__` block
- CLI: `python -m ai_router.verifier_role --provider <name>` (e.g., `--provider openai`)
- Worker identity: `<hostname>:<pid>:<provider>:<random-suffix>` for `claimed_by` field
- Main loop:
  ```
  while not shutdown:
      msg = queue_db.claim(provider, worker_id, lease_seconds=600)
      if not msg:
          sleep(poll_interval); continue
      try:
          start_heartbeat_thread(msg.id)
          result = run_verification(msg)
          queue_db.complete(msg.id, worker_id, result)
      except FollowUpRequested as fu:
          queue_db.add_follow_up(msg.id, provider, fu.content)
          # leave message in claimed state; orchestrator will respond
      except Exception as e:
          queue_db.fail(msg.id, worker_id, str(e))
      finally:
          stop_heartbeat_thread(msg.id)
  ```
- Heartbeat thread: emits `queue_db.heartbeat(message_id, worker_id)` every 30s while a task is active; lease is 600s (10 min) so 20-30s heartbeat keeps it fresh
- Graceful shutdown on SIGTERM / SIGINT: finishes current job, releases lease, exits
- Restart-safe: on startup, if any messages are still `claimed` by a previous worker_id from this hostname+pid pattern, leave them — `reclaim_expired` will recover them after lease expiry
- Unit tests: claim → process → complete cycle, follow-up round-trip, exception → fail, graceful shutdown
- Integration test: run verifier_role in a subprocess, enqueue a verification message via SQLite directly, observe completion

**Acceptance:**
- A verifier daemon can be started and stopped cleanly
- A verification message is processed end-to-end: claimed, verified, completed
- Heartbeats prevent the lease from expiring during long jobs
- Failures (mocked exceptions) transition to `failed` state with reason recorded

### Session 2: Orchestrator-role daemon

**Goal:** A long-running CLI worker that operates in the *opposite* direction — it processes its own assignment queue (work the verifier has rejected back to it, or follow-up dialogue requests).

**Deliverables:**
- New module `ai-router/orchestrator_role.py` with `__main__` block
- CLI: `python -m ai_router.orchestrator_role --provider <name>` (e.g., `--provider claude`)
- Same shape as verifier_role, but consumes from its own provider's queue (assignments TO this orchestrator from other providers)
- Handles two message types:
  - `verification_followup`: a verifier asked for clarification; orchestrator responds via `add_follow_up` and the verifier re-claims
  - `verification_rejected`: a verifier returned `failed` because work needs revision; orchestrator must address the issues
- Documents: this daemon does NOT generate session work autonomously — that still happens via human-typed trigger phrases in the orchestrator's *primary* CLI session. The daemon handles only the asynchronous follow-up / rejection flow.
- Unit tests: follow-up dialogue round-trip, rejection handling, graceful shutdown
- Integration test: simulate a rejection from the verifier, observe orchestrator daemon picks it up

**Acceptance:**
- Orchestrator daemon and verifier daemon can run simultaneously in separate processes
- A multi-round dialogue (verifier → follow-up → orchestrator response → verifier completion) works end-to-end

### Session 3: Mode-aware `route()` and `verify()` + restart command

**Goal:** Wire the queue path into the AI router's public API. Add stale-session detection and a restart command.

**Deliverables:**
- Modify `ai-router/__init__.py::route()` and `verify()`:
  - Read `outsourceMode` from current session set's spec.md (or env var fallback `AI_ROUTER_OUTSOURCE_MODE`)
  - **outsource-first** (default): existing API path; behavior unchanged
  - **outsource-last**: enqueue a message to the verifier provider's queue with task_type, session_set, session_number, payload; return a `RouteResult` with `pending: true` and a `message_id` field; **do not block**
- New return type fields on `RouteResult`: `pending: bool`, `message_id: Optional[str]`
- Mode-aware `verify()` on a pending result: for outsource-last, return `pending: true` immediately; the close-out script (Set 3) will block until the result is available
- Stale-session detection:
  - `python -m ai_router.role_status [--provider <name>]` — reports each running daemon's last heartbeat, claimed messages, etc.
  - Detection of stale workers: if a worker hasn't heartbeated in 2× lease window, mark it stale; its claimed messages get reclaimed by `reclaim_expired`
- Restart command:
  - `python -m ai_router.restart_role --provider <name>` — gracefully signals the running daemon to exit, waits for shutdown, starts a new daemon
  - Uses a `<provider>.daemon-pid` file in `provider-queues/<provider>/` for tracking
- Unit tests: route in first mode (no change), route in last mode (enqueue + pending result), restart command, role_status reporting

**Acceptance:**
- A session running with `outsourceMode: first` shows no change in behavior
- A session running with `outsourceMode: last` enqueues verifications and returns immediately
- `role_status` reports running daemons accurately
- `restart_role` works on a running daemon

### Session 4: Failure-injection integration tests

**Goal:** Per GPT-5.4's review note, build executable failure-injection tests that prove recovery works. These tests are also reusable in Set 6 for the alignment audit.

**Deliverables:**
- Test fixtures: a minimal session set + queue DB seeded with messages in various states
- Test scenarios:
  1. **Lease expiration:** verifier claims work, dies (SIGKILL the subprocess), waits 2× lease window. `reclaim_expired` runs. New verifier claims and completes. Assert message ends in `completed` state with all original fields preserved.
  2. **Heartbeat timeout escalation:** verifier heartbeats for 30 minutes (simulated time) without completing. Eventually `attempts` exceeds `max_attempts`. Message transitions to `failed` with reason `max_attempts_exceeded`.
  3. **Truncated SQLite recovery:** corrupt the SQLite WAL file mid-write (simulated by SIGKILL during `complete()`). Verify next process startup recovers via WAL replay. Verify no duplicate completions.
  4. **CLI session reset:** verifier daemon's underlying CLI session exits unexpectedly (e.g., the `claude` CLI process dies). Daemon detects via heartbeat thread, marks the in-flight message `failed_with_recovery`, exits with non-zero. Restart command brings up a new daemon. Reclaim recovers the message.
  5. **Concurrent claim attempts:** two verifier daemons (different worker_ids) try to claim the same message simultaneously. Exactly one wins; the other's `claim()` returns None.
  6. **Mode-switch mid-set:** session-state.json says `work_in_progress` and outsource-last, but the work agent runs `route()` with outsource-first config. Mode validation catches the drift and refuses with a clear error.
- Tests use `pytest` + actual subprocesses (not mocks), since the value is in catching real concurrency / crash semantics
- Test runtime budget: < 60 seconds total (some scenarios use simulated-time skipping)

**Acceptance:**
- All 6 scenarios pass on Windows
- Each scenario produces a clear pass / fail with diagnostic output
- Tests are tagged so they can be re-run from Set 6's audit (e.g., `pytest -m failure_injection`)

---

## Acceptance criteria for the set

- [ ] Verifier daemon and orchestrator daemon both runnable
- [ ] Mode-aware `route()` and `verify()` work in both modes
- [ ] Restart command works
- [ ] All 6 failure-injection scenarios pass
- [ ] No close-out machinery wired (Set 3 does that)
- [ ] No behavior change for outsource-first sessions

---

## Risks

- **Subscription CLI durability is uncertain.** Per GPT-5.4: subscription CLIs may "expire auth, reset context, prompt interactively, or degrade after long idle periods." The verifier_role and orchestrator_role daemons operate the CLI subprocess; if the underlying CLI session resets, the daemon detects via heartbeat-thread error and reports `failed_with_recovery`. The two-CLI workflow doc (Set 6) must document this clearly.
- **Heartbeat thread reliability under load.** If the worker process is starved for CPU (e.g., heavy provider API call), heartbeats may be late. Mitigation: lease window is 10 minutes; heartbeats every 30 seconds. 20× safety margin should cover most starvation.
- **Truncation recovery on SQLite WAL.** Verified in Session 4 test 3; if it doesn't work cleanly on Windows, fall back to `synchronous=FULL` (slower but stronger durability).
- **Bootstrapping window.** This set's daemons can run, but until Set 3 ships, the close-out flow doesn't yet block on queue completions. So an outsource-last session is "verifiable" but not yet "gate-protected." Acceptable per prior risk acceptance.

---

## References

- Set 1: `001-queue-contract-and-recovery-foundations` (must complete first; this set imports `queue_db.py` heavily)
- Original close-out reliability proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- Plan v2 synthesis: `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`
- Reused: `ai-router/utils.py::RateLimiter` (each daemon instantiates its own per-provider)
- Reused: `ai-router/verification.py::pick_verifier_model` (verifier daemon re-runs the rule engine)
- Reused: `ai-router/providers.py::call_model` (verifier daemon uses for the actual API call)

---

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
effort: high
outsourceMode: first
```
