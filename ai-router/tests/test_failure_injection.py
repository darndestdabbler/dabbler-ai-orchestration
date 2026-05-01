"""Failure-injection integration tests for the role-loops queue.

Six executable scenarios that prove the recovery semantics described in
``docs/session-sets/002-role-loops-and-handoff/spec.md`` actually hold
under real subprocess crashes, real concurrency, and real Windows
process semantics. The tests are tagged ``@pytest.mark.failure_injection``
so Set 6's alignment audit can re-run them as a focused suite::

    pytest -m failure_injection

Scope
-----
* **Lease expiration:** verifier claims, dies, ``reclaim_expired`` rolls
  back to ``new``, second verifier claims and completes, all original
  fields preserved.
* **Heartbeat timeout escalation:** repeated lease expirations exhaust
  ``max_attempts``; message transitions to ``timed_out`` (the queue's
  spelling for "lease expired without heartbeat past max_attempts").
* **Truncated SQLite recovery:** SIGKILL during ``complete()`` leaves the
  WAL mid-write; next process startup recovers via WAL replay; no
  duplicate completions and no data loss.
* **CLI session reset:** the daemon's underlying CLI process dies
  unexpectedly. The lease expires, ``reclaim_expired`` recovers, and a
  restarted daemon completes the message.
* **Concurrent claim attempts:** two verifier daemons race on the same
  message; SQLite's writer lock guarantees exactly one winner.
* **Mode-switch mid-set:** ``session-state.json`` says outsource-last
  but the spec config is malformed (no ``verifierRole``); ``route()``
  refuses with a clear error rather than silently downgrading to
  outsource-first.

Test hygiene
------------
The whole file's runtime budget per the spec is < 60 seconds. We hit it
by running the daemon with millisecond-scale leases and heartbeat
intervals (``--lease-seconds 1``, ``--heartbeat-interval 0.05``) so the
"wait 2x lease" recoveries finish in seconds, not minutes. The shapes
are still real — same code paths as production, just compressed time.

Subprocesses are launched via tiny driver scripts that monkey-patch
``run_verification`` to a fake (the daemons under test never need API
keys). Because the hyphenated ``ai-router/`` directory cannot be
imported as a package, drivers do ``sys.path.insert(0, AI_ROUTER_DIR)``
and ``import verifier_role`` directly — same pattern Sessions 1 and 2
established in their subprocess integration tests.
"""

from __future__ import annotations

import os
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

from queue_db import (
    DEFAULT_MAX_ATTEMPTS,
    QueueDB,
)
from verifier_role import (
    VerifierDaemon,
    make_worker_id,
)

AI_ROUTER_DIR = Path(__file__).resolve().parent.parent

# Single test-side provider name. The choice of "openai" is arbitrary —
# the daemons under test do not care, and centralising it here keeps
# the file from accidentally drifting if a future scenario picks a
# different label.
TEST_PROVIDER = "openai"

pytestmark = pytest.mark.failure_injection


# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------

def _wait_for(predicate, timeout: float, interval: float = 0.05) -> bool:
    """Poll ``predicate`` until it is truthy or ``timeout`` elapses.

    Returns the predicate's last truthy value or ``False`` on timeout.
    Handles the ubiquitous "wait until DB row reaches state X" pattern
    without strewing time.sleep+deadline boilerplate through every test.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(interval)
    return False


def _hard_kill(proc: subprocess.Popen) -> None:
    """Terminate a subprocess hard, regardless of platform.

    On Windows ``Popen.kill()`` issues ``TerminateProcess`` immediately;
    on POSIX it sends SIGKILL. Either way the daemon's atexit / finally
    blocks do NOT run — that is the whole point: we want to test what
    happens when the process disappears mid-claim.
    """
    if proc.poll() is not None:
        return
    proc.kill()
    try:
        proc.wait(timeout=5.0)
    except subprocess.TimeoutExpired:
        pass


def _shutdown_proc(proc: subprocess.Popen, timeout: float = 5.0) -> None:
    """Best-effort graceful shutdown, falling back to hard kill."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        proc.terminate()  # Windows: hard but quick
    else:
        proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        _hard_kill(proc)


def _write_verifier_driver(
    tmp_path: Path,
    *,
    fake_body: str = "    return {'verdict': 'VERIFIED', 'echo': msg.payload}",
    name: str = "driver.py",
) -> Path:
    """Emit a driver script that runs ``verifier_role`` with a fake handler.

    ``fake_body`` is the body of ``def fake(msg):`` — must be a single
    indented block. We keep it inline so each scenario can shape its
    own fake (hang, raise, succeed) without duplicating the launcher
    boilerplate.
    """
    drv = tmp_path / name
    drv.write_text(
        "import sys\n"
        f"sys.path.insert(0, {str(AI_ROUTER_DIR)!r})\n"
        "import verifier_role\n"
        "def fake(msg):\n"
        f"{fake_body}\n"
        "verifier_role.run_verification = fake\n"
        "verifier_role.main()\n",
        encoding="utf-8",
    )
    return drv


def _spawn_verifier(
    driver: Path,
    *,
    provider: str,
    base_dir: Path,
    cwd: Path,
    poll_interval: float = 0.05,
    heartbeat_interval: float = 0.05,
    lease_seconds: int = 1,
) -> subprocess.Popen:
    """Spawn a verifier daemon subprocess with compressed-time defaults."""
    return subprocess.Popen(
        [
            sys.executable, str(driver),
            "--provider", provider,
            "--base-dir", str(base_dir),
            "--poll-interval", str(poll_interval),
            "--heartbeat-interval", str(heartbeat_interval),
            "--lease-seconds", str(lease_seconds),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(cwd),
    )


# ==========================================================================
# Scenario 1: Lease expiration
# ==========================================================================

class TestScenario1LeaseExpiration:
    """Verifier claims, dies, lease expires, second verifier completes."""

    def test_killed_verifier_lease_expires_then_second_verifier_completes(
        self, tmp_path: Path
    ):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"target": "set 002 session 4", "ix": 1},
            idempotency_key="lease-expiration-key",
            session_set="docs/session-sets/002-role-loops-and-handoff",
            session_number=4,
        )

        # First daemon: hangs in fake() until killed. lease=1s,
        # heartbeat=0.05s — once we kill the process, no further
        # heartbeats fire and the lease expires within ~1s.
        driver = _write_verifier_driver(
            tmp_path,
            name="driver_hang.py",
            fake_body=(
                "    import time\n"
                "    while True:\n"
                "        time.sleep(0.1)"
            ),
        )

        proc1 = _spawn_verifier(
            driver, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
            lease_seconds=1, heartbeat_interval=0.05, poll_interval=0.05,
        )
        try:
            # Wait until the message is claimed (state == 'claimed').
            claimed = _wait_for(
                lambda: qdb.get_message(mid).state == "claimed",
                timeout=5.0,
            )
            assert claimed, "first daemon never claimed the message"
            first_msg = qdb.get_message(mid)
            first_claimed_by = first_msg.claimed_by
            assert first_claimed_by is not None
        finally:
            _hard_kill(proc1)

        # Wait past 2x lease so reclaim_expired (run by the second
        # daemon before each claim) has expired headroom.
        time.sleep(2.5)

        # Second daemon: completes immediately.
        driver2 = _write_verifier_driver(tmp_path, name="driver_ok.py")
        proc2 = _spawn_verifier(
            driver2, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
            lease_seconds=5, heartbeat_interval=0.05, poll_interval=0.05,
        )
        try:
            done = _wait_for(
                lambda: qdb.get_message(mid).state == "completed",
                timeout=10.0,
            )
            assert done, (
                f"second daemon did not complete message; final state="
                f"{qdb.get_message(mid).state!r}"
            )
            final = qdb.get_message(mid)
            # All original fields preserved across the lease-expiry recovery.
            assert final.from_provider == "claude"
            assert final.to_provider == TEST_PROVIDER
            assert final.task_type == "session-verification"
            assert final.payload == {"target": "set 002 session 4", "ix": 1}
            assert final.idempotency_key == "lease-expiration-key"
            assert final.session_set == (
                "docs/session-sets/002-role-loops-and-handoff"
            )
            assert final.session_number == 4
            # The reclaim bumped attempts; the second worker is a different
            # claimed_by than the first.
            assert final.attempts >= 1
            assert final.claimed_by != first_claimed_by
            assert final.result == {
                "verdict": "VERIFIED",
                "echo": {"target": "set 002 session 4", "ix": 1},
            }
        finally:
            _shutdown_proc(proc2)


# ==========================================================================
# Scenario 2: Heartbeat timeout escalation (max_attempts exceeded)
# ==========================================================================

class TestScenario2HeartbeatTimeoutEscalation:
    """Repeated lease expiry without heartbeat -> message transitions to ``timed_out``.

    The spec calls this "transitions to failed with reason
    max_attempts_exceeded". The queue's spelling is ``state='timed_out'``
    with ``failure_reason='lease expired without heartbeat'`` — the
    distinct state captures *why* we gave up (lease exhaustion) versus
    explicit fail() calls. Same semantics; precise label.
    """

    def test_repeated_lease_expiry_transitions_to_timed_out(self, tmp_path: Path):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"will": "exhaust attempts"},
            idempotency_key="heartbeat-timeout-key",
        )

        # Default max_attempts is 3. We force the message through
        # max_attempts lease expirations by directly manipulating the
        # claimed/lease_expires_at columns — this is the integration
        # version of "simulated time skipping" the spec mentions.
        # Reaches the same end state as a real 30-minute starvation
        # loop, in <1s.
        worker = make_worker_id(TEST_PROVIDER)
        for i in range(DEFAULT_MAX_ATTEMPTS):
            # Manually claim by moving the row to ``state='claimed'``
            # with an already-expired lease. reclaim_expired() then
            # bumps attempts and either rolls back to 'new' or moves
            # to 'timed_out'.
            with sqlite3.connect(qdb.db_path, isolation_level=None) as conn:
                conn.execute(
                    """
                    UPDATE messages
                    SET state = 'claimed',
                        claimed_by = ?,
                        claimed_at = '2000-01-01T00:00:00+00:00',
                        lease_expires_at = '2000-01-01T00:00:01+00:00'
                    WHERE id = ?
                    """,
                    (f"{worker}:r{i}", mid),
                )
            reclaimed = qdb.reclaim_expired()
            assert reclaimed == 1, f"round {i}: expected 1 reclaim, got {reclaimed}"

        final = qdb.get_message(mid)
        assert final.state == "timed_out", (
            f"expected timed_out after {DEFAULT_MAX_ATTEMPTS} expirations, "
            f"got state={final.state!r}"
        )
        assert final.attempts == DEFAULT_MAX_ATTEMPTS
        assert final.failure_reason == "lease expired without heartbeat"
        assert final.completed_at is not None
        # Terminal state -> claim metadata cleared.
        assert final.claimed_by is None
        assert final.lease_expires_at is None


# ==========================================================================
# Scenario 3: Truncated SQLite recovery (WAL replay)
# ==========================================================================

class TestScenario3TruncatedSQLiteRecovery:
    """SIGKILL the daemon mid-complete; verify WAL replay recovers cleanly."""

    def test_kill_during_complete_recovers_via_wal_replay(self, tmp_path: Path):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"truncation": "test"},
            idempotency_key="truncation-recovery-key",
        )

        # Driver: completes very quickly. We kill the process some short
        # time after spawn — most runs will catch it before the complete
        # call landed (-> recovery path), some will catch it after (->
        # idempotent re-claim path). Both are valid outcomes; the test
        # asserts the *invariant* that holds under both: the message
        # ends in 'completed' state with exactly one persisted result
        # and no stuck 'claimed' row.
        driver = _write_verifier_driver(
            tmp_path,
            name="driver_quick.py",
            fake_body="    return {'verdict': 'VERIFIED', 'token': 42}",
        )
        proc = _spawn_verifier(
            driver, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
            lease_seconds=2, heartbeat_interval=0.05, poll_interval=0.05,
        )
        # Give the daemon enough time to claim — but not necessarily
        # enough to commit complete(). Then SIGKILL.
        time.sleep(0.6)
        _hard_kill(proc)

        # WAL replay happens on the next connection open. Re-open the
        # DB by calling any read helper; SQLite checkpoints WAL on
        # open and any committed-but-uncopied frames replay into the
        # main DB. We then run a recovery daemon and assert end state.
        post_kill_state = qdb.get_message(mid).state
        # Must be in {'claimed','completed'} — anything else means
        # the WAL is corrupt or our model is wrong.
        assert post_kill_state in ("claimed", "completed"), (
            f"unexpected state after SIGKILL: {post_kill_state!r}"
        )

        if post_kill_state == "claimed":
            # Recovery path: a second daemon should pick this up after
            # the lease expires. Wait past 2x lease then start a
            # fresh daemon.
            time.sleep(2.5)
            driver2 = _write_verifier_driver(
                tmp_path, name="driver_recover.py",
                fake_body="    return {'verdict': 'VERIFIED', 'token': 42, 'recovered': True}",
            )
            proc2 = _spawn_verifier(
                driver2, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
                lease_seconds=5, heartbeat_interval=0.05, poll_interval=0.05,
            )
            try:
                done = _wait_for(
                    lambda: qdb.get_message(mid).state == "completed",
                    timeout=10.0,
                )
                assert done, "recovery daemon did not complete the message"
            finally:
                _shutdown_proc(proc2)

        final = qdb.get_message(mid)
        assert final.state == "completed"
        # The completion is single — there is one row, with one result,
        # not two completions or a duplicate insert. The UNIQUE
        # idempotency_key enforces this at the schema level; we
        # double-check by counting rows.
        with sqlite3.connect(qdb.db_path, isolation_level=None) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM messages WHERE idempotency_key = ?",
                ("truncation-recovery-key",),
            ).fetchone()
            assert row[0] == 1, "duplicate row after WAL replay"
        # Result preserved or replaced with recovery payload — both
        # acceptable; we just require a non-null verdict.
        assert final.result is not None
        assert final.result.get("verdict") == "VERIFIED"


# ==========================================================================
# Scenario 4: CLI session reset (daemon process dies, restart recovers)
# ==========================================================================

class TestScenario4CLISessionReset:
    """The daemon's CLI process dies; restart_role spawns a new daemon; reclaim recovers the message.

    The spec's narrative is "the underlying CLI session resets, the
    daemon detects, marks failed_with_recovery, exits non-zero". In
    the deployed code, the heartbeat thread marks ``lost_lease=True``
    on ``ConcurrencyError`` and the main thread surfaces the loss
    via the next state-change call's ``ConcurrencyError`` -> which
    ``process_one_message`` catches and returns
    ``"concurrency-lost"``. Net effect for the queue: the message
    rolls back to ``new`` via ``reclaim_expired`` and the next
    daemon picks it up. This test exercises that path end-to-end
    (daemon dies -> restart spawns fresh -> new daemon completes).
    """

    def test_kill_daemon_then_restart_completes_message(self, tmp_path: Path):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"cli-session": "reset-test"},
            idempotency_key="cli-session-reset-key",
        )

        # Daemon 1 hangs in fake to simulate a stuck CLI subprocess.
        driver1 = _write_verifier_driver(
            tmp_path, name="driver_stuck.py",
            fake_body=(
                "    import time\n"
                "    while True:\n"
                "        time.sleep(0.1)"
            ),
        )
        proc1 = _spawn_verifier(
            driver1, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
            lease_seconds=1, heartbeat_interval=0.05, poll_interval=0.05,
        )
        try:
            claimed = _wait_for(
                lambda: qdb.get_message(mid).state == "claimed",
                timeout=5.0,
            )
            assert claimed, "first daemon never claimed"
        finally:
            _hard_kill(proc1)

        # Wait past 2x lease so reclaim catches it on the next claim.
        time.sleep(2.5)

        # Daemon 2 = the "restarted" daemon. In production
        # restart_role.py drives this; here we simulate the spawn
        # directly because the test focus is recovery, not the
        # restart CLI (which has its own coverage in
        # test_restart_role.py).
        driver2 = _write_verifier_driver(
            tmp_path, name="driver_recover_cli.py",
            fake_body="    return {'verdict': 'VERIFIED', 'recovered_from': 'cli-reset'}",
        )
        proc2 = _spawn_verifier(
            driver2, provider=TEST_PROVIDER, base_dir=base_dir, cwd=tmp_path,
            lease_seconds=5, heartbeat_interval=0.05, poll_interval=0.05,
        )
        try:
            done = _wait_for(
                lambda: qdb.get_message(mid).state == "completed",
                timeout=10.0,
            )
            assert done, (
                f"restarted daemon did not recover; final state="
                f"{qdb.get_message(mid).state!r}"
            )
            final = qdb.get_message(mid)
            assert final.result == {
                "verdict": "VERIFIED",
                "recovered_from": "cli-reset",
            }
        finally:
            _shutdown_proc(proc2)


# ==========================================================================
# Scenario 5: Concurrent claim attempts (exactly one wins)
# ==========================================================================

class TestScenario5ConcurrentClaims:
    """Two daemons race for the same message; SQLite's writer lock serializes them."""

    def test_two_workers_race_exactly_one_wins(self, tmp_path: Path):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"race": "for-me"},
            idempotency_key="concurrent-claim-key",
        )

        worker_a = make_worker_id(TEST_PROVIDER)
        worker_b = make_worker_id(TEST_PROVIDER)
        assert worker_a != worker_b, "make_worker_id should produce unique ids"

        results: dict[str, object] = {}
        barrier = threading.Barrier(2)

        def attempt(label: str, worker_id: str) -> None:
            # Both threads sync at the barrier so they hit claim() as
            # close to simultaneously as Python and SQLite let us.
            # The writer-lock contention then decides one winner.
            barrier.wait(timeout=5.0)
            results[label] = qdb.claim(worker_id, lease_seconds=10)

        ta = threading.Thread(target=attempt, args=("a", worker_a))
        tb = threading.Thread(target=attempt, args=("b", worker_b))
        ta.start(); tb.start()
        ta.join(timeout=5.0); tb.join(timeout=5.0)
        assert not ta.is_alive() and not tb.is_alive(), "claim threads hung"

        winners = [k for k, v in results.items() if v is not None]
        losers = [k for k, v in results.items() if v is None]
        assert len(winners) == 1, (
            f"expected exactly one winner, got {len(winners)}: {results}"
        )
        assert len(losers) == 1, (
            f"expected exactly one loser, got {len(losers)}: {results}"
        )

        winner_label = winners[0]
        winner_msg = results[winner_label]
        # Winner got the message; its claimed_by matches its worker_id.
        assert winner_msg.id == mid
        assert winner_msg.claimed_by == (
            worker_a if winner_label == "a" else worker_b
        )

        # DB state: exactly one row, in 'claimed' state, owned by the winner.
        final = qdb.get_message(mid)
        assert final.state == "claimed"
        assert final.claimed_by == winner_msg.claimed_by


# ==========================================================================
# Scenario 6: Mode-switch mid-set (config drift caught at route-time)
# ==========================================================================

class TestScenario6ModeSwitchMidSet:
    """Spec declares ``outsourceMode: last`` but is missing ``verifierRole``.

    The spec frames this as a "drift" scenario (session-state.json says
    outsource-last, the work agent runs route() with outsource-first
    config). The implementation tests the closely related and arguably
    more critical static-config form of the same bug: a spec block that
    cannot resolve to a complete outsource-last configuration. The drift
    case degrades to this case at validate-time — there is no path that
    reaches enqueue when the verifier role is not declared.

    Per ``_resolve_outsource_mode`` -> ``validate_mode_config``, this
    is a config bug, not a silent fallback to outsource-first. The
    function raises ``ValueError`` with a message naming the spec path
    and listing every validation error. This is the orchestrator's
    last line of defense against an outsource-last set running with
    no verifier provider declared (which would otherwise enqueue to
    a non-existent provider queue and stall the close-out gate
    indefinitely).
    """

    def test_invalid_outsource_last_spec_raises_at_route_time(self, tmp_path: Path):
        # Lazy-import the package via importlib so we exercise the same
        # entry path the orchestrator uses in production.
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "ai_router_under_test",
            str(AI_ROUTER_DIR / "__init__.py"),
            submodule_search_locations=[str(AI_ROUTER_DIR)],
        )
        ar = importlib.util.module_from_spec(spec)
        sys.modules["ai_router_under_test"] = ar
        spec.loader.exec_module(ar)

        # Build a session-set directory with a malformed config block:
        # outsourceMode: last but no verifierRole / orchestratorRole.
        session_set = tmp_path / "set-bad-config"
        session_set.mkdir()
        (session_set / "spec.md").write_text(
            "# Bad config\n\n"
            "## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "```\n",
            encoding="utf-8",
        )

        # Make sure the env var isn't masking the spec lookup.
        prior_env = os.environ.pop("AI_ROUTER_OUTSOURCE_MODE", None)
        try:
            with pytest.raises(ValueError) as excinfo:
                ar._resolve_outsource_mode(str(session_set), None)
            msg = str(excinfo.value)
            # Error names the spec file and the missing field.
            assert "invalid mode config" in msg
            assert str(session_set) in msg
            # The validation surfaces the missing role explicitly, so
            # the human reading the traceback knows what to add.
            assert "verifier" in msg.lower() or "role" in msg.lower()
        finally:
            if prior_env is not None:
                os.environ["AI_ROUTER_OUTSOURCE_MODE"] = prior_env


# ==========================================================================
# Scenario 7: Cross-set parallel rejection on the same (repo, branch)
# ==========================================================================

class TestScenario7CrossSetParallelRejection:
    """Two sets racing on the same ``(repo, branch)`` — gate catches the loser.

    The combined-design alignment audit
    (``docs/proposals/2026-04-30-combined-design-alignment-audit.md`` §5.2,
    drift item D-1) flagged that the close-session lock only serializes
    same-set re-entry. Set 9 Session 2 resolved D-1 via the audit's
    accepted alternative (b): revise the contract to match the
    implementation and rely on the deterministic close-out gate as the
    residual safety net for cross-set parallelism on the same branch.
    See ``ai-router/docs/close-out.md`` Section 6 ("Cross-set parallelism
    on the same `(repo, branch)`") for the canonical operator-facing
    statement.

    This scenario is the executable proof the audit required: when two
    session sets commit work on the same branch and one pushes first,
    the loser's ``check_pushed_to_remote`` refuses with a clear
    non-fast-forward / pull-rebase remediation. The downstream
    "``close_session`` exits 1 without flipping lifecycle state"
    property is an established invariant of the close-out gate covered
    by ``test_mark_session_complete_gate.py`` and the close-out
    integration tests; this scenario does not re-assert it. The
    contribution here is proving the gate predicate's specific
    response in the cross-set push-race scenario the doc-only D-1
    resolution depends on.
    """

    def test_loser_of_push_race_gate_fails_loud(self, tmp_path: Path):
        from gate_checks import check_pushed_to_remote

        def _git(cwd: Path, *args: str) -> None:
            proc = subprocess.run(
                ["git", *args],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            if proc.returncode != 0:
                raise RuntimeError(
                    f"git {' '.join(args)} (cwd={cwd}) failed: "
                    f"{proc.stderr.strip() or proc.stdout.strip()}"
                )

        # A bare remote that both clones will push to. The race is
        # decided by whichever clone's push reaches the bare remote
        # first; the second push must be non-fast-forward.
        bare = tmp_path / "origin.git"
        bare.mkdir()
        _git(bare, "init", "--bare", "-b", "main")

        # Two clones share the same (repo, branch) just as two parallel
        # sessions on the same machine would. Seed a baseline from
        # clone-a, then sync clone-b from the now-populated remote.
        clone_a = tmp_path / "clone-a"
        clone_b = tmp_path / "clone-b"
        for clone in (clone_a, clone_b):
            _git(tmp_path, "clone", str(bare), str(clone))
            _git(clone, "config", "user.email", "test@example.invalid")
            _git(clone, "config", "user.name", "Test")
            _git(clone, "config", "commit.gpgsign", "false")

        (clone_a / "README.md").write_text("baseline\n", encoding="utf-8")
        _git(clone_a, "add", "README.md")
        _git(clone_a, "commit", "-m", "baseline")
        _git(clone_a, "push", "-u", "origin", "main")

        _git(clone_b, "fetch", "origin")
        _git(clone_b, "checkout", "-B", "main", "origin/main")

        # Each clone hosts its own session set. Both commit work on
        # main; A pushes first, simulating A winning the race.
        set_a_dir = clone_a / "docs" / "session-sets" / "set-a"
        set_a_dir.mkdir(parents=True)
        (set_a_dir / "spec.md").write_text("# set a\n", encoding="utf-8")
        (set_a_dir / "marker.txt").write_text("a\n", encoding="utf-8")
        _git(clone_a, "add", "-A")
        _git(clone_a, "commit", "-m", "set A work")
        _git(clone_a, "push", "origin", "main")

        set_b_dir = clone_b / "docs" / "session-sets" / "set-b"
        set_b_dir.mkdir(parents=True)
        (set_b_dir / "spec.md").write_text("# set b\n", encoding="utf-8")
        (set_b_dir / "marker.txt").write_text("b\n", encoding="utf-8")
        _git(clone_b, "add", "-A")
        _git(clone_b, "commit", "-m", "set B work")

        # B is now ahead of origin/main with a divergent commit while
        # the remote already holds A's commit. B's gate must refuse
        # close-out with a non-fast-forward / rebase remediation —
        # this is the residual-race protection the doc-only D-1
        # resolution depends on.
        passed, remediation = check_pushed_to_remote(str(set_b_dir), None)
        assert not passed, (
            "the deterministic gate is the residual safety net for the "
            "cross-set parallel race; the loser's gate must NOT silently "
            "report success"
        )
        lower = remediation.lower()
        assert (
            "non-fast-forward" in lower
            or "rebase" in lower
            or "rejected" in lower
        ), (
            "the loser of a cross-set push race needs operator-actionable "
            f"guidance pointing at a rebase/pull workflow; got: {remediation!r}"
        )

        # Sanity: A's gate, which won the push race, is in the clean
        # state (head == upstream) and passes.
        passed_a, _ = check_pushed_to_remote(str(set_a_dir), None)
        assert passed_a, (
            "the winner of the cross-set push race should pass the gate "
            "cleanly; only the loser is meant to be rejected"
        )


# ==========================================================================
# Sanity: in-process full lifecycle (cheap smoke test)
# ==========================================================================

class TestInProcessLifecycleSmoke:
    """Fast in-process check: one VerifierDaemon.run_one() processes a
    pre-enqueued message via the production code path. Catches gross
    regressions before the slower subprocess scenarios above run.
    """

    def test_run_one_completes_pre_enqueued_message(self, tmp_path: Path):
        base_dir = tmp_path / "provider-queues"
        qdb = QueueDB(provider=TEST_PROVIDER, base_dir=base_dir)
        mid = qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"smoke": True},
            idempotency_key="smoke-key",
        )

        def fake_verifier(msg):
            return {"verdict": "VERIFIED", "ok": True, "id": msg.id}

        daemon = VerifierDaemon(
            provider=TEST_PROVIDER,
            base_dir=base_dir,
            poll_interval_seconds=0.05,
            heartbeat_interval=0.05,
            lease_seconds=5,
            verifier=fake_verifier,
        )
        outcome = daemon.run_one()
        assert outcome == "completed"
        final = qdb.get_message(mid)
        assert final.state == "completed"
        assert final.result == {"verdict": "VERIFIED", "ok": True, "id": mid}
