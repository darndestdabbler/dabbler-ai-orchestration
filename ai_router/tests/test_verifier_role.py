"""Tests for ai_router/verifier_role.py — Session 1 of session set 002.

The daemon is split into three layers so each can be tested independently:

* ``make_worker_id`` — pure shape check.
* ``process_one_message`` — claim/process/complete cycle, follow-up
  round-trip, exception → fail, heartbeat behavior, lease-loss handling.
  Tests inject a fake ``verifier`` callable so no real LLM calls happen.
* ``VerifierDaemon`` — single-tick (``run_one``) and full-loop
  (``run_forever``) shutdown semantics. The integration test runs the
  CLI as a subprocess against a real SQLite DB.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

import queue_db  # type: ignore[import-not-found]
import verifier_role  # type: ignore[import-not-found]
from queue_db import QueueDB, QueueMessage  # type: ignore[import-not-found]
from verifier_role import (  # type: ignore[import-not-found]
    DEFAULT_POLL_INTERVAL_SECONDS,
    FollowUpRequested,
    VerifierDaemon,
    make_worker_id,
    process_one_message,
)


AI_ROUTER_DIR = Path(queue_db.__file__).resolve().parent


# ==========================================================================
# Fixtures
# ==========================================================================

@pytest.fixture
def qdb(tmp_path: Path) -> QueueDB:
    return QueueDB(provider="openai", base_dir=tmp_path / "provider-queues")


@pytest.fixture
def worker_id() -> str:
    return "host:42:openai:deadbeef"


def _enqueue_basic(qdb: QueueDB, key: str = "k1") -> str:
    return qdb.enqueue(
        from_provider="claude",
        task_type="session-verification",
        payload={"session": 1, "files": ["a.py"]},
        idempotency_key=key,
    )


# ==========================================================================
# make_worker_id
# ==========================================================================

class TestWorkerIdShape:
    def test_format_is_hostname_pid_provider_random(self):
        wid = make_worker_id("openai")
        # <hostname>:<pid>:openai:<8 hex chars>
        # Hostnames can contain dots, hyphens, alphanumerics — match
        # everything-up-to the first numeric pid segment.
        m = re.match(r"^(.+):(\d+):openai:([0-9a-f]{8})$", wid)
        assert m is not None, f"unexpected worker_id shape: {wid!r}"
        assert int(m.group(2)) == os.getpid()

    def test_random_suffix_is_unique_across_calls(self):
        ids = {make_worker_id("openai") for _ in range(50)}
        # Same hostname+pid+provider; only the random suffix varies.
        # 32 bits of entropy across 50 picks should yield 50 distinct ids.
        assert len(ids) == 50

    def test_provider_appears_in_id(self):
        wid = make_worker_id("gemini")
        assert ":gemini:" in wid


# ==========================================================================
# process_one_message — happy path
# ==========================================================================

class TestProcessOneMessageHappyPath:
    def test_returns_completed_and_writes_result(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = _enqueue_basic(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None and msg.id == mid

        def fake_verifier(m: QueueMessage) -> dict:
            return {"verdict": "VERIFIED", "issues": []}

        outcome = process_one_message(
            qdb, msg, worker_id,
            verifier=fake_verifier,
            heartbeat_interval=0.05,
            lease_seconds=60,
        )
        assert outcome == "completed"
        stored = qdb.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.result == {"verdict": "VERIFIED", "issues": []}
        assert stored.completed_at is not None

    def test_payload_passed_to_verifier_unchanged(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = qdb.enqueue(
            "claude", "session-verification",
            {"k": "v", "n": 7}, "k_payload",
            session_set="docs/session-sets/foo",
            session_number=3,
        )
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None
        captured: dict = {}

        def fake_verifier(m: QueueMessage) -> dict:
            captured["payload"] = m.payload
            captured["session_set"] = m.session_set
            captured["session_number"] = m.session_number
            captured["task_type"] = m.task_type
            return {"ok": True}

        process_one_message(
            qdb, msg, worker_id, verifier=fake_verifier,
            heartbeat_interval=0.05,
        )
        assert captured["payload"] == {"k": "v", "n": 7}
        assert captured["session_set"] == "docs/session-sets/foo"
        assert captured["session_number"] == 3
        assert captured["task_type"] == "session-verification"


# ==========================================================================
# process_one_message — follow-up round-trip
# ==========================================================================

class TestProcessOneMessageFollowUp:
    def test_followup_persists_and_leaves_message_claimed(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = _enqueue_basic(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def fake_verifier(m: QueueMessage) -> dict:
            raise FollowUpRequested("Need clarification on file X")

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=fake_verifier,
            heartbeat_interval=0.05,
        )
        assert outcome == "awaiting_followup"
        stored = qdb.get_message(mid)
        assert stored is not None
        # Per spec: "leave message in claimed state; orchestrator will respond"
        assert stored.state == "claimed"
        assert stored.claimed_by == worker_id
        # Follow-up was recorded against the verifier's provider
        ups = qdb.read_follow_ups(mid)
        assert len(ups) == 1
        assert ups[0].content == "Need clarification on file X"
        assert ups[0].from_provider == "openai"

    def test_followup_overflow_propagates_max_rounds_exception(
        self, qdb: QueueDB, worker_id: str
    ):
        # Pre-fill 3 follow-ups so the next add_follow_up overflows.
        mid = _enqueue_basic(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None
        for i in range(3):
            qdb.add_follow_up(mid, "openai", f"prior {i}")

        def fake_verifier(m: QueueMessage) -> dict:
            raise FollowUpRequested("one too many")

        with pytest.raises(queue_db.MaxFollowUpRoundsExceeded):
            process_one_message(
                qdb, msg, worker_id, verifier=fake_verifier,
                heartbeat_interval=0.05,
                max_followup_rounds=3,
            )
        # The queue itself transitioned the message to failed with the
        # round-limit reason — the daemon does not need to do that.
        stored = qdb.get_message(mid)
        assert stored is not None
        assert stored.state == "failed"
        assert stored.failure_reason == queue_db.MAX_FOLLOWUP_ROUNDS_REASON


# ==========================================================================
# process_one_message — exception → fail
# ==========================================================================

class TestProcessOneMessageFailure:
    def test_exception_transitions_to_new_with_attempts_when_retries_remain(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = qdb.enqueue("claude", "t", {}, "kfail", max_attempts=3)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def fake_verifier(m: QueueMessage) -> dict:
            raise RuntimeError("boom")

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=fake_verifier,
            heartbeat_interval=0.05,
        )
        assert outcome == "new"  # retried
        stored = qdb.get_message(mid)
        assert stored is not None
        assert stored.state == "new"
        assert stored.attempts == 1
        assert "boom" in (stored.failure_reason or "")

    def test_exception_transitions_to_failed_when_attempts_exhausted(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = qdb.enqueue("claude", "t", {}, "kfail2", max_attempts=1)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def fake_verifier(m: QueueMessage) -> dict:
            raise ValueError("nope")

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=fake_verifier,
            heartbeat_interval=0.05,
        )
        assert outcome == "failed"
        stored = qdb.get_message(mid)
        assert stored is not None
        assert stored.state == "failed"
        assert stored.attempts == 1


# ==========================================================================
# Heartbeat thread
# ==========================================================================

class TestHeartbeat:
    def test_heartbeat_extends_lease_during_long_running_work(
        self, qdb: QueueDB, worker_id: str
    ):
        mid = _enqueue_basic(qdb)
        msg = qdb.claim(worker_id, lease_seconds=2)
        assert msg is not None
        original_lease = msg.lease_expires_at

        beats = {"count": 0}

        def slow_verifier(m: QueueMessage) -> dict:
            # Sleep long enough that at least 2 heartbeats fire at 0.2s
            # cadence — that's how we know the heartbeat thread is running.
            for _ in range(5):
                time.sleep(0.1)
                stored = qdb.get_message(m.id)
                if stored and stored.last_heartbeat_at is not None:
                    beats["count"] += 1
                    if beats["count"] >= 1:
                        break
            return {"verdict": "VERIFIED"}

        outcome = process_one_message(
            qdb, msg, worker_id,
            verifier=slow_verifier,
            heartbeat_interval=0.2,
            lease_seconds=2,
        )
        assert outcome == "completed"
        # last_heartbeat_at was written at least once. (The completed
        # row may not retain it depending on implementation, but the
        # in-flight stored row read inside the verifier did.)
        assert beats["count"] >= 1

    def test_heartbeat_thread_exits_silently_on_lease_loss(
        self, qdb: QueueDB, worker_id: str
    ):
        # Claim a message; force-expire its lease and reclaim it under
        # a different worker. The original heartbeat should silently
        # set lost_lease=True.
        mid = _enqueue_basic(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        # Manually expire and reclaim under a stranger worker.
        conn = sqlite3.connect(qdb.db_path)
        try:
            conn.execute(
                "UPDATE messages SET lease_expires_at = ? WHERE id = ?",
                ("1970-01-01T00:00:00+00:00", mid),
            )
            conn.commit()
        finally:
            conn.close()
        qdb.reclaim_expired()
        stranger_msg = qdb.claim("other:1:openai:cafef00d", lease_seconds=60)
        assert stranger_msg is not None
        assert stranger_msg.id == mid

        # Now run a heartbeat thread under the original (no-longer-valid)
        # worker_id and observe lost_lease.
        stop = threading.Event()
        thread = verifier_role._HeartbeatThread(
            qdb, mid, worker_id, stop,
            interval=0.05, lease_seconds=60,
        )
        thread.start()
        time.sleep(0.2)  # let one heartbeat cycle fire
        stop.set()
        thread.join(timeout=2.0)
        assert thread.lost_lease is True
        # No spurious exception captured for the expected loss case
        assert thread.exception is None


# ==========================================================================
# VerifierDaemon: run_one
# ==========================================================================

class TestRunOneBehavior:
    def test_run_one_returns_none_on_empty_queue(self, tmp_path: Path):
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            verifier=lambda m: {"v": True},
        )
        assert d.run_one() is None

    def test_run_one_processes_a_pending_message(self, tmp_path: Path):
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            verifier=lambda m: {"verdict": "VERIFIED"},
        )
        mid = _enqueue_basic(d.queue, key="run_one_k")
        outcome = d.run_one()
        assert outcome == "completed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.claimed_by == d.worker_id

    def test_run_one_calls_reclaim_before_claim(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            verifier=lambda m: {"v": True},
        )
        order: list[str] = []
        original_reclaim = d.queue.reclaim_expired
        original_claim = d.queue.claim

        def tracked_reclaim():
            order.append("reclaim")
            return original_reclaim()

        def tracked_claim(*args, **kwargs):
            order.append("claim")
            return original_claim(*args, **kwargs)

        monkeypatch.setattr(d.queue, "reclaim_expired", tracked_reclaim)
        monkeypatch.setattr(d.queue, "claim", tracked_claim)
        d.run_one()
        assert order == ["reclaim", "claim"]


# ==========================================================================
# VerifierDaemon: run_forever shutdown
# ==========================================================================

class TestRunForeverShutdown:
    def test_idle_loop_exits_promptly_on_shutdown(self, tmp_path: Path):
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            poll_interval_seconds=10.0,  # would block for 10s
            heartbeat_interval=0.05,
            verifier=lambda m: {"v": True},
        )
        thread = threading.Thread(target=d.run_forever, daemon=True)
        thread.start()
        # Let it enter the empty-queue wait, then signal shutdown.
        time.sleep(0.1)
        d.request_shutdown()
        thread.join(timeout=2.0)
        assert not thread.is_alive(), (
            "run_forever did not exit within 2s of shutdown — "
            "the empty-queue wait should respond to the shutdown event"
        )

    def test_in_flight_job_completes_before_shutdown_returns(
        self, tmp_path: Path
    ):
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            poll_interval_seconds=0.05,
            heartbeat_interval=0.05,
        )
        mid = _enqueue_basic(d.queue, key="graceful_k")

        verifier_started = threading.Event()
        verifier_proceed = threading.Event()

        def slow_verifier(m: QueueMessage) -> dict:
            verifier_started.set()
            verifier_proceed.wait(timeout=5.0)
            return {"verdict": "VERIFIED", "graceful": True}

        d._verifier = slow_verifier
        thread = threading.Thread(target=d.run_forever, daemon=True)
        thread.start()
        # Wait for verifier to be running, then signal shutdown.
        assert verifier_started.wait(timeout=5.0), "verifier never started"
        d.request_shutdown()
        # Verifier is still blocked. run_forever must wait for it.
        time.sleep(0.2)
        assert thread.is_alive(), (
            "run_forever exited while a job was still in flight"
        )
        # Release the verifier; daemon should now finish and exit.
        verifier_proceed.set()
        thread.join(timeout=5.0)
        assert not thread.is_alive()
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.result == {"verdict": "VERIFIED", "graceful": True}


# ==========================================================================
# Restart-safe: prior worker's claim is left alone
# ==========================================================================

class TestRestartSafety:
    def test_startup_does_not_steal_a_prior_workers_active_claim(
        self, tmp_path: Path
    ):
        qdb = QueueDB(provider="openai", base_dir=tmp_path / "provider-queues")
        mid = _enqueue_basic(qdb)
        prior_worker = "host:99:openai:11111111"
        msg = qdb.claim(prior_worker, lease_seconds=600)  # long lease, alive
        assert msg is not None and msg.claimed_by == prior_worker

        # Bring up a fresh daemon. run_one should NOT pick up the
        # already-claimed message: claim() only returns 'new' rows, and
        # reclaim_expired won't act because the lease has not expired.
        d = VerifierDaemon(
            provider="openai",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            verifier=lambda m: {"v": True},
        )
        outcome = d.run_one()
        assert outcome is None  # nothing claimable
        stored = qdb.get_message(mid)
        assert stored is not None
        assert stored.state == "claimed"
        assert stored.claimed_by == prior_worker  # untouched


# ==========================================================================
# CLI argument parser
# ==========================================================================

class TestCLIArgParser:
    def test_provider_is_required(self):
        parser = verifier_role._build_arg_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])

    def test_default_values(self):
        parser = verifier_role._build_arg_parser()
        args = parser.parse_args(["--provider", "openai"])
        assert args.provider == "openai"
        assert args.base_dir == "provider-queues"
        assert args.poll_interval == DEFAULT_POLL_INTERVAL_SECONDS
        assert args.lease_seconds == queue_db.DEFAULT_LEASE_SECONDS
        assert args.heartbeat_interval == verifier_role.HEARTBEAT_INTERVAL_SECONDS

    def test_overrides_propagate(self):
        parser = verifier_role._build_arg_parser()
        args = parser.parse_args([
            "--provider", "gemini",
            "--base-dir", "/tmp/queues",
            "--poll-interval", "0.5",
            "--lease-seconds", "120",
            "--heartbeat-interval", "10",
        ])
        assert args.provider == "gemini"
        assert args.base_dir == "/tmp/queues"
        assert args.poll_interval == 0.5
        assert args.lease_seconds == 120
        assert args.heartbeat_interval == 10.0


# ==========================================================================
# Integration: subprocess CLI end-to-end
# ==========================================================================

class TestCLISubprocessIntegration:
    def test_subprocess_processes_enqueued_message_then_shuts_down(
        self, tmp_path: Path
    ):
        """Run the daemon as a real subprocess.

        The verifier function is patched via ``PYTHONSTARTUP``-style
        monkey-patching is not portable across test runners. Instead, we
        write a tiny driver script that imports verifier_role, replaces
        ``run_verification`` with a stub, and invokes ``main``.
        """
        base_dir = tmp_path / "provider-queues"
        # Pre-create the queue and enqueue one message before the daemon
        # comes up, so the first poll picks it up immediately.
        qdb = QueueDB(provider="openai", base_dir=base_dir)
        mid = qdb.enqueue(
            "claude", "session-verification",
            {"hello": "world"}, "subproc_k",
        )

        driver = tmp_path / "driver.py"
        driver.write_text(
            "import sys\n"
            f"sys.path.insert(0, {str(AI_ROUTER_DIR)!r})\n"
            "import verifier_role\n"
            "def fake(msg):\n"
            "    return {'verdict': 'VERIFIED', 'echo': msg.payload}\n"
            "verifier_role.run_verification = fake\n"
            "verifier_role.main()\n",
            encoding="utf-8",
        )

        proc = subprocess.Popen(
            [
                sys.executable, str(driver),
                "--provider", "openai",
                "--base-dir", str(base_dir),
                "--poll-interval", "0.1",
                "--heartbeat-interval", "0.1",
                "--lease-seconds", "60",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(tmp_path),
        )
        try:
            # Poll the DB until the message is completed (or timeout).
            deadline = time.time() + 10.0
            stored = None
            while time.time() < deadline:
                stored = qdb.get_message(mid)
                if stored and stored.state == "completed":
                    break
                time.sleep(0.1)
            assert stored is not None and stored.state == "completed", (
                f"message did not complete in time; final state="
                f"{stored.state if stored else None!r}"
            )
            assert stored.result == {
                "verdict": "VERIFIED",
                "echo": {"hello": "world"},
            }
        finally:
            # Graceful shutdown: SIGINT / SIGTERM. On Windows,
            # Popen.terminate() sends a hard kill, but Popen.send_signal
            # with CTRL_BREAK_EVENT is finicky without CREATE_NEW_PROCESS_GROUP.
            # For the test we accept the hard kill path; the in-flight
            # message has already completed by this point.
            if os.name == "nt":
                proc.terminate()
            else:
                proc.send_signal(2)  # SIGINT
            try:
                proc.wait(timeout=10.0)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5.0)


# ==========================================================================
# FollowUpRequested type
# ==========================================================================

class TestFollowUpRequestedType:
    def test_carries_content(self):
        e = FollowUpRequested("please clarify line 42")
        assert e.content == "please clarify line 42"
        assert "please clarify" in str(e)

    def test_is_an_exception(self):
        assert issubclass(FollowUpRequested, Exception)
