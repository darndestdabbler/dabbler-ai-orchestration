# Session Set: Close-Out Script + Deterministic Machinery

## Summary

Build the **`close_session` script** as the **sole synchronization barrier** between session work and session close-out. After this set, the system has:
- `python -m ai_router.close_session` (non-interactive default + flags for partial automation)
- Deterministic gate checks (hardened git invariants, scoped paths, change-log freshness)
- Concurrency lock model
- Reconciler / sweeper that operates on the SQLite state machine from Set 1
- `--manual-verify` / `--repair` flags for the bootstrapping window
- Mode-aware verification path (consumes API results in outsource-first; blocks on queue completion in outsource-last)

**Still no enforcement** — `mark_session_complete()` is wired in Set 4 with the `--force` transitional flag.

---

## Why this set comes third

Sets 1 and 2 deliver the queue contract and the role-loops. This set is the **first consumer of those contracts**: `close_session` reads the queue state machine to decide whether verifications have completed, and the gate checks operate against well-defined data structures.

This is also where both reviewers' "non-blocking verify, blocking close-out" pattern is realized concretely. Set 2 made `verify()` non-blocking; this set makes `close_session` the sole point that waits for verifications to terminate.

---

## Scope

### In scope
- `python -m ai_router.close_session` runnable script
- Sole blocking sync point: waits for all queued verifications for the session to reach a terminal state (`completed` / `timed_out` / `failed`); honors a session-level timeout
- Hardened gate checks (working tree, push state, activity-log, nextOrchestrator presence, change-log freshness)
- Concurrency lock at `<session-set-dir>/.close_session.lock` with stale-lock cleanup
- Reconciler / sweeper that finds stranded sessions and retries close-out
- `--manual-verify` flag: skips queue blocking, lets the human attest verification was done out-of-band (used during bootstrapping window)
- `--repair` flag: walks a session set's state and corrects detectable drift (e.g., session-events.jsonl missing an event that `mark_session_complete` would have written)
- Mode-aware: in outsource-first, gate checks API verification result is captured; in outsource-last, gate confirms queue messages have terminated

### Out of scope
- Wiring `mark_session_complete()` to invoke the gate — Set 4
- Cost reporting changes — Set 4
- VS Code extension — Set 5
- Workflow doc changes — Set 6
- Fresh close-out turn routing — Set 6

---

## Sessions

### Session 1: `close_session` skeleton + flags + idempotency

**Goal:** Ship a runnable `python -m ai_router.close_session` with all flags and structured output. Gate checks are stubs (always pass) — Session 2 fills them in. Verification blocking is stubbed — Session 3 implements it.

**Deliverables:**
- New module `ai-router/close_session.py` with `__main__` block
- CLI flags:
  - `--session-set-dir <path>` (default: active session set in cwd)
  - `--json` — machine-readable output (for orchestrator or VS Code consumption)
  - `--interactive` — opt-in to interactive prompts (default: non-interactive)
  - `--force` — bypass all gate checks (emits DEPRECATION warning; transitional only)
  - `--allow-empty-commit` — permit sessions that produce no commits
  - `--reason-file <path>` — read narrative fields from a file
  - `--manual-verify` — skip queue verification blocking; treat verifications as completed by human attestation
  - `--repair` — diagnostic mode: walks session set state, reports drift, optionally fixes (with `--repair --apply`)
  - `--timeout <minutes>` — max time to wait for queued verifications (default: 60)
- Reads `disposition.json`; refuses without it (unless `--force` or `--repair`)
- Idempotency: detects "already closed" (state == `closed` in session-events.jsonl) and exits 0 with a "noop" message in JSON output
- Exit codes: 0 success | 1 gate failure | 2 invalid invocation | 3 lock contention | 4 timeout waiting on verification | 5 repair drift detected
- Calls `append_event(closeout_requested)` at start, `append_event(closeout_succeeded)` on success, `append_event(closeout_failed)` on failure
- Skeleton gate-check structure (Session 2 fills in checks)
- Skeleton verification-wait structure (Session 3 fills in)
- Unit tests: invocation, JSON output, --force bypass, idempotency, missing disposition.json, all flags parse correctly

**Acceptance:**
- `python -m ai_router.close_session --session-set-dir <fixture>` runs and produces JSON output
- Re-running on already-closed session is a no-op
- All flags accepted; combinations validated (e.g., `--force --interactive` rejected)

### Session 2: Hardened gate checks + concurrency lock

**Goal:** Implement the deterministic gate checks. This is the architecturally trickiest session.

**Deliverables:**
- Each gate check returns `(passed: bool, remediation: str)`:
  - **`check_working_tree_clean`**: scoped to `disposition.json::files_changed` allowlist + ignore patterns (`.DS_Store`, `*.swp`, `*~`, `Thumbs.db`); stricter than blanket `git status --porcelain`
  - **`check_pushed_to_remote`**: handles missing upstream (configuration error, surface clearly), detached HEAD, branch protection rejection (transient, retry-eligible), rebased branches; distinguishes "configuration error" from "transient block"
  - **`check_activity_log_entry`**: verifies entry exists for `currentSession` in `activity-log.json`
  - **`check_next_orchestrator_present`**: when `currentSession < totalSessions`, requires `nextOrchestrator` populated AND `validate_next_orchestrator()` passes
  - **`check_change_log_fresh`**: when `currentSession == totalSessions`, requires `change-log.md` exists AND was modified during the current session (mtime ≥ session `startedAt` OR file content references current session number)
- Concurrency lock at `<session-set-dir>/.close_session.lock` (PID + timestamp + worker_id)
- Stale-lock cleanup: lock older than 10 min OR PID not running → reclaim with WARNING
- All checks have unit tests for both pass and at least one failure case
- Integration tests against fixtures covering: clean tree, untracked file, missing upstream, push rejected, detached HEAD, stale change-log

**Acceptance:**
- All 5 gate checks land with tests
- Git checks correctly diagnose all failure modes
- Lock prevents two concurrent invocations; stale lock is reclaimed
- Final-session check correctly distinguishes fresh vs. stale `change-log.md`

### Session 3: Verification-wait (queue mode) + reconciler

**Goal:** Implement the close-out's blocking-wait for queued verifications, and the reconciler that recovers stranded sessions.

**Deliverables:**
- Verification-wait logic in `close_session.py`:
  - Read `disposition.json::verification_message_ids` (populated by Set 2's enqueue path)
  - For each message_id, poll `queue_db.get_message_state()` every N seconds (default 5)
  - Block until ALL message states are terminal (`completed`, `failed`, or `timed_out`)
  - Honor `--timeout` flag; if exceeded, transition the session to `closeout_blocked` with a structured reason and exit code 4
  - On ALL `completed`: append `verification_completed` event for each, then proceed with gate checks
  - On ANY `failed`: surface the failure reasons, return exit code 1 (gate failure: "verification failed: <reasons>")
  - On ANY `timed_out`: same as failed but distinct event type
  - For outsource-first: skip the wait; verification was synchronous and result is on disk
- Reconciler module `ai-router/reconciler.py`:
  - Function `reconcile_sessions(base_dir="docs/session-sets")`:
    - Walks all session sets
    - For each, computes lifecycle state from `session-events.jsonl`
    - For sessions in `closeout_pending` or `closeout_blocked` longer than 5 minutes, invokes `close_session.run(json_output=True)` and parses result
    - Transitions state in event log accordingly
  - Best-effort: per-session-set failures are logged but don't abort the sweep
  - Hook function `register_sweeper_hook()` for orchestrator-startup invocation (wired in Set 6)
  - CLI: `python -m ai_router.reconciler` for manual invocation
- Integration tests against fixtures:
  - Outsource-first close-out (verification result already on disk; gate runs immediately)
  - Outsource-last close-out (verifications still pending; close_session blocks; tests simulates verifier completing them; gate runs after)
  - Timeout case (verifications never complete within --timeout)
  - Reconciler recovers a stranded session

**Acceptance:**
- Outsource-first close-out completes without entering the queue-wait branch
- Outsource-last close-out blocks correctly until all queued verifications are terminal
- Timeout transitions session to `closeout_blocked` with clear reason
- Reconciler recovers a fixture with a stranded session

### Session 4: `--manual-verify`, `--repair`, full integration

**Goal:** Land the bootstrapping-window flags and run end-to-end integration tests against realistic fixtures.

**Deliverables:**
- `--manual-verify` implementation:
  - Skips queue blocking
  - Prompts (in interactive mode) or accepts via `--reason-file` an attestation that verification was done out-of-band
  - Records the attestation in the session-events.jsonl as `verification_manual` event
  - Used during bootstrapping window when the new queue path isn't fully available
- `--repair` implementation:
  - Diagnostic mode (default): walks the session set's state, compares session-events.jsonl + disposition.json + queue messages + git state, reports drift to stdout (or JSON)
  - With `--repair --apply`: corrects detectable drift (missing events, unset state fields, etc.); never modifies git state
  - Documents in close-out doc: "use --repair if you got into an inconsistent state during the bootstrapping window"
- End-to-end integration test fixtures: pre-built session set states (just-started, mid-work, verification-passed-but-not-closed, closeout-blocked, fully-closed) for both modes
- Test scenarios:
  - **Outsource-first happy path**: route() in first mode → verification on disk → close_session passes all gates → session closed
  - **Outsource-last happy path**: route() in last mode → enqueues to verifier daemon → verifier completes → close_session blocks then unblocks → gates pass → session closed
  - **Bootstrapping recovery**: session got stranded due to old close-out flow; `--repair --apply` brings it back to a known state
  - **Manual verify**: `--manual-verify` skips queue, gate still runs, session closes
- All tests pass on Windows

**Acceptance:**
- 4 integration scenarios pass on Windows
- `--repair` correctly identifies and (with `--apply`) fixes drift in fixture states
- `--manual-verify` is documented as the bootstrapping escape hatch

---

## Acceptance criteria for the set

- [ ] `close_session` runs as a CLI script with all flags
- [ ] All 5 gate checks land with tests
- [ ] Concurrency lock prevents corruption
- [ ] Reconciler recovers a stranded session
- [ ] All 4 integration scenarios pass on Windows
- [ ] `--manual-verify` and `--repair` work as documented
- [ ] **No wiring into `mark_session_complete()` yet** — Set 4 does that

---

## Risks

- **Git invariant edge cases.** Detached HEAD, missing upstream, protected branches, rebased branches — each fails differently. Session 2 must enumerate them deliberately rather than catch-all.
- **Verification-wait timeout calibration.** Default 60 minutes is generous but not infinite. Document override via `--timeout`.
- **`--repair --apply` could mask deeper problems.** Always require `--apply` to be explicit (not the default). Repair logs everything it changes.
- **Reconciler running during work.** Reconciler runs on a sweep schedule (Set 6 wires the orchestrator-startup hook). Until then, manual `python -m ai_router.reconciler` invocation is the recovery path.

---

## References

- Set 1: `001-queue-contract-and-recovery-foundations` (provides `queue_db.py`, `disposition.py`, `session_events.py`)
- Set 2: `002-role-loops-and-handoff` (provides the enqueue path in mode-aware `route()` / `verify()`)
- Original close-out reliability proposal: `docs/proposals/2026-04-29-session-close-out-reliability.md`
- Plan v2 synthesis: `C:\Users\denmi\.claude\plans\i-think-that-we-atomic-kazoo.md`

---

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
effort: high
outsourceMode: first
```
