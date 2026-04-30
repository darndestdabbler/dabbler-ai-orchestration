"""Tests for ai-router/orchestrator_role.py — Session 2 of session set 002.

Same testing shape as ``test_verifier_role.py``: pluggable handlers
mean the daemon is testable without faking the AI router. The
integration test runs both daemons (verifier + orchestrator) as real
subprocesses against a shared file system to prove they coexist.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

import orchestrator_role  # type: ignore[import-not-found]
import queue_db  # type: ignore[import-not-found]
import verifier_role  # type: ignore[import-not-found]
from orchestrator_role import (  # type: ignore[import-not-found]
    ORCHESTRATOR_TASK_TYPES,
    OrchestratorDaemon,
    TASK_VERIFICATION_FOLLOWUP,
    TASK_VERIFICATION_REJECTED,
    UnknownTaskTypeError,
    make_dispatch_verifier,
)
from queue_db import QueueDB, QueueMessage  # type: ignore[import-not-found]
from verifier_role import (  # type: ignore[import-not-found]
    DEFAULT_POLL_INTERVAL_SECONDS,
    FollowUpRequested,
)


AI_ROUTER_DIR = Path(queue_db.__file__).resolve().parent


# ==========================================================================
# Fixtures
# ==========================================================================

@pytest.fixture
def orch_qdb(tmp_path: Path) -> QueueDB:
    """Queue addressed to the orchestrator (provider='claude' by convention)."""
    return QueueDB(provider="claude", base_dir=tmp_path / "provider-queues")


@pytest.fixture
def worker_id() -> str:
    return "host:42:claude:cafe1234"


def _enqueue_followup(qdb: QueueDB, key: str = "fu_k", *,
                      from_provider: str = "openai") -> str:
    """Enqueue a verification_followup message TO the orchestrator."""
    return qdb.enqueue(
        from_provider=from_provider,
        task_type=TASK_VERIFICATION_FOLLOWUP,
        payload={"question": "what does X mean?", "session": 1},
        idempotency_key=key,
    )


def _enqueue_rejection(qdb: QueueDB, key: str = "rej_k", *,
                       from_provider: str = "openai") -> str:
    return qdb.enqueue(
        from_provider=from_provider,
        task_type=TASK_VERIFICATION_REJECTED,
        payload={"reason": "missing test for path X", "session": 1},
        idempotency_key=key,
    )


# ==========================================================================
# Constants
# ==========================================================================

class TestTaskTypeConstants:
    def test_constant_values_are_canonical_strings(self):
        # Spec is verbatim about these names; a typo here would silently
        # mismatch the verifier-side enqueue path in Session 3.
        assert TASK_VERIFICATION_FOLLOWUP == "verification_followup"
        assert TASK_VERIFICATION_REJECTED == "verification_rejected"

    def test_orchestrator_task_types_tuple_covers_both(self):
        assert TASK_VERIFICATION_FOLLOWUP in ORCHESTRATOR_TASK_TYPES
        assert TASK_VERIFICATION_REJECTED in ORCHESTRATOR_TASK_TYPES
        assert len(ORCHESTRATOR_TASK_TYPES) == 2


# ==========================================================================
# Dispatch verifier — pure routing logic
# ==========================================================================

class TestDispatchRouting:
    def _msg(self, task_type: str, mid: str = "m1") -> QueueMessage:
        return QueueMessage(
            id=mid, from_provider="openai", to_provider="claude",
            task_type=task_type, payload={"x": 1}, idempotency_key=mid,
            state="claimed", enqueued_at="2026-04-30T00:00:00+00:00",
        )

    def test_followup_message_routes_to_followup_handler(self):
        called = {"name": None}

        def fu(_msg):
            called["name"] = "followup"
            return {"ok": True}

        def rej(_msg):
            called["name"] = "rejection"
            return {"ok": True}

        dispatch = make_dispatch_verifier(
            followup_handler=fu, rejection_handler=rej
        )
        result = dispatch(self._msg(TASK_VERIFICATION_FOLLOWUP))
        assert called["name"] == "followup"
        assert result == {"ok": True}

    def test_rejected_message_routes_to_rejection_handler(self):
        called = {"name": None}

        def fu(_msg):
            called["name"] = "followup"
            return {}

        def rej(_msg):
            called["name"] = "rejection"
            return {"acknowledged": True}

        dispatch = make_dispatch_verifier(
            followup_handler=fu, rejection_handler=rej
        )
        result = dispatch(self._msg(TASK_VERIFICATION_REJECTED))
        assert called["name"] == "rejection"
        assert result == {"acknowledged": True}

    def test_unknown_task_type_raises_unknown_task_type_error(self):
        dispatch = make_dispatch_verifier(
            followup_handler=lambda m: {},
            rejection_handler=lambda m: {},
        )
        with pytest.raises(UnknownTaskTypeError) as exc_info:
            dispatch(self._msg("session-verification", mid="strange"))
        assert exc_info.value.task_type == "session-verification"
        assert exc_info.value.message_id == "strange"

    def test_followup_requested_propagates_through_dispatch(self):
        # Ensures process_one_message's FollowUpRequested handling
        # works even though dispatch is the actual callable.
        def fu(_msg):
            raise FollowUpRequested("need more info")

        dispatch = make_dispatch_verifier(
            followup_handler=fu, rejection_handler=lambda m: {},
        )
        with pytest.raises(FollowUpRequested) as exc_info:
            dispatch(self._msg(TASK_VERIFICATION_FOLLOWUP))
        assert exc_info.value.content == "need more info"


# ==========================================================================
# OrchestratorDaemon: run_one — happy paths
# ==========================================================================

class TestRunOneFollowUp:
    def test_followup_handler_can_record_a_reply_and_complete(
        self, tmp_path: Path
    ):
        # The "completion" pattern: orchestrator decides the dialogue is
        # over after one exchange and returns a result, transitioning
        # the message to completed.
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: {
                "answer": "X means the contract field",
                "rounds": 1,
            },
            rejection_handler=lambda m: {"unused": True},
        )
        mid = _enqueue_followup(d.queue, key="fu_complete")
        outcome = d.run_one()
        assert outcome == "completed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.result == {
            "answer": "X means the contract field", "rounds": 1
        }

    def test_followup_handler_can_continue_dialogue_via_followup_requested(
        self, tmp_path: Path
    ):
        # The "continue dialogue" pattern: orchestrator answers the
        # verifier's question by appending its reply via
        # add_follow_up; the message stays claimed and the verifier
        # will re-claim through reclaim_expired or via lease return.
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: (_ for _ in ()).throw(
                FollowUpRequested("here is the answer to your question")
            ),
            rejection_handler=lambda m: {},
        )
        mid = _enqueue_followup(d.queue, key="fu_dialogue")
        outcome = d.run_one()
        assert outcome == "awaiting_followup"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "claimed"  # left for re-claim
        ups = d.queue.read_follow_ups(mid)
        assert len(ups) == 1
        assert ups[0].content == "here is the answer to your question"
        # The orchestrator's reply is recorded as coming from this
        # daemon's provider — that is the audit signal a verifier
        # needs to know who replied.
        assert ups[0].from_provider == "claude"


class TestRunOneRejection:
    def test_rejection_handler_acknowledges_and_completes(
        self, tmp_path: Path
    ):
        captured: dict = {}

        def rej(msg: QueueMessage) -> dict:
            captured["payload"] = msg.payload
            captured["from_provider"] = msg.from_provider
            return {
                "acknowledged": True,
                "planned_action": "revise_in_primary_session",
                "original_reason": msg.payload.get("reason"),
            }

        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: {},
            rejection_handler=rej,
        )
        mid = _enqueue_rejection(d.queue, key="rej1")
        outcome = d.run_one()
        assert outcome == "completed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.result == {
            "acknowledged": True,
            "planned_action": "revise_in_primary_session",
            "original_reason": "missing test for path X",
        }
        assert captured["payload"]["reason"] == "missing test for path X"
        assert captured["from_provider"] == "openai"


# ==========================================================================
# OrchestratorDaemon: run_one — failure modes
# ==========================================================================

class TestRunOneFailures:
    def test_unknown_task_type_routes_through_queue_fail_path(
        self, tmp_path: Path
    ):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: {},
            rejection_handler=lambda m: {},
        )
        # Enqueue a task type the orchestrator daemon does NOT handle.
        mid = d.queue.enqueue(
            from_provider="openai",
            task_type="session-verification",
            payload={"x": 1},
            idempotency_key="unknown_k",
            max_attempts=1,  # one shot, then permanent failure
        )
        outcome = d.run_one()
        assert outcome == "failed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "failed"
        # The reason carries the UnknownTaskTypeError class name
        # (process_one_message uses repr(exc), which starts with the
        # exception's qualified name).
        assert "UnknownTaskTypeError" in (stored.failure_reason or "")

    def test_handler_exception_transitions_to_new_with_attempts(
        self, tmp_path: Path
    ):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: (_ for _ in ()).throw(
                RuntimeError("transient blip")
            ),
            rejection_handler=lambda m: {},
        )
        mid = _enqueue_followup(d.queue, key="fu_blip")
        outcome = d.run_one()
        assert outcome == "new"  # retry remains
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "new"
        assert stored.attempts == 1
        assert "transient blip" in (stored.failure_reason or "")


# ==========================================================================
# OrchestratorDaemon: defaults are stubs (Session 3 wires real handlers)
# ==========================================================================

class TestDefaultHandlersAreStubs:
    def test_default_followup_handler_raises_not_implemented(
        self, tmp_path: Path
    ):
        # No injected handlers — the defaults should refuse and the
        # message ends up failed via process_one_message's fail path.
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
        )
        mid = d.queue.enqueue(
            "openai", TASK_VERIFICATION_FOLLOWUP, {}, "stub_fu",
            max_attempts=1,
        )
        outcome = d.run_one()
        assert outcome == "failed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert "NotImplementedError" in (stored.failure_reason or "")
        assert stored.id == mid

    def test_default_rejection_handler_raises_not_implemented(
        self, tmp_path: Path
    ):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
        )
        mid = d.queue.enqueue(
            "openai", TASK_VERIFICATION_REJECTED, {}, "stub_rej",
            max_attempts=1,
        )
        outcome = d.run_one()
        assert outcome == "failed"
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert "NotImplementedError" in (stored.failure_reason or "")


# ==========================================================================
# OrchestratorDaemon: run_one wiring (reclaim before claim)
# ==========================================================================

class TestRunOneOrdering:
    def test_run_one_calls_reclaim_before_claim(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: {"v": True},
            rejection_handler=lambda m: {"v": True},
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

    def test_run_one_returns_none_on_empty_queue(self, tmp_path: Path):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            heartbeat_interval=0.05,
            followup_handler=lambda m: {"v": True},
            rejection_handler=lambda m: {"v": True},
        )
        assert d.run_one() is None


# ==========================================================================
# OrchestratorDaemon: graceful shutdown
# ==========================================================================

class TestRunForeverShutdown:
    def test_idle_loop_exits_promptly_on_shutdown(self, tmp_path: Path):
        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            poll_interval_seconds=10.0,
            heartbeat_interval=0.05,
            followup_handler=lambda m: {"v": True},
            rejection_handler=lambda m: {"v": True},
        )
        thread = threading.Thread(target=d.run_forever, daemon=True)
        thread.start()
        time.sleep(0.1)
        d.request_shutdown()
        thread.join(timeout=2.0)
        assert not thread.is_alive(), (
            "run_forever did not exit within 2s of shutdown"
        )

    def test_in_flight_job_completes_before_shutdown_returns(
        self, tmp_path: Path
    ):
        handler_started = threading.Event()
        handler_proceed = threading.Event()

        def slow_followup(_msg):
            handler_started.set()
            handler_proceed.wait(timeout=5.0)
            return {"answer": "took a while", "graceful": True}

        d = OrchestratorDaemon(
            provider="claude",
            base_dir=tmp_path / "provider-queues",
            poll_interval_seconds=0.05,
            heartbeat_interval=0.05,
            followup_handler=slow_followup,
            rejection_handler=lambda m: {"v": True},
        )
        mid = _enqueue_followup(d.queue, key="graceful_orch")

        thread = threading.Thread(target=d.run_forever, daemon=True)
        thread.start()
        assert handler_started.wait(timeout=5.0), "handler never started"
        d.request_shutdown()
        # The in-flight job is still blocked; daemon must wait.
        time.sleep(0.2)
        assert thread.is_alive(), (
            "run_forever exited while a job was still in flight"
        )
        handler_proceed.set()
        thread.join(timeout=5.0)
        assert not thread.is_alive()
        stored = d.queue.get_message(mid)
        assert stored is not None
        assert stored.state == "completed"
        assert stored.result == {"answer": "took a while", "graceful": True}


# ==========================================================================
# CLI argument parser
# ==========================================================================

class TestCLIArgParser:
    def test_provider_is_required(self):
        parser = orchestrator_role._build_arg_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])

    def test_default_values(self):
        parser = orchestrator_role._build_arg_parser()
        args = parser.parse_args(["--provider", "claude"])
        assert args.provider == "claude"
        assert args.base_dir == "provider-queues"
        assert args.poll_interval == DEFAULT_POLL_INTERVAL_SECONDS
        assert args.lease_seconds == queue_db.DEFAULT_LEASE_SECONDS
        assert (
            args.heartbeat_interval
            == verifier_role.HEARTBEAT_INTERVAL_SECONDS
        )

    def test_overrides_propagate(self):
        parser = orchestrator_role._build_arg_parser()
        args = parser.parse_args([
            "--provider", "gemini",
            "--base-dir", "/tmp/q",
            "--poll-interval", "0.7",
            "--lease-seconds", "180",
            "--heartbeat-interval", "5",
        ])
        assert args.provider == "gemini"
        assert args.base_dir == "/tmp/q"
        assert args.poll_interval == 0.7
        assert args.lease_seconds == 180
        assert args.heartbeat_interval == 5.0


# ==========================================================================
# Multi-round dialogue: orchestrator-side + verifier-side daemons
# ==========================================================================

class TestMultiRoundDialogueIntegration:
    """Drive a full follow-up exchange across both daemons in-process.

    This is the spec's central acceptance criterion for Session 2:
    "A multi-round dialogue (verifier → follow-up → orchestrator
    response → verifier completion) works end-to-end."

    Two queues participate: ``provider-queues/openai/queue.db`` (the
    verifier's inbox — verifications and orchestrator replies arrive
    here) and ``provider-queues/claude/queue.db`` (the orchestrator's
    inbox — verifier follow-up requests arrive here).

    The flow:

    1. Verifier_role claims the verification message.
    2. Verifier handler raises FollowUpRequested → message stays
       claimed, follow-up persisted.
    3. Test simulates the orchestrator's reply by enqueuing a
       ``verification_followup`` message to the orchestrator's queue.
    4. OrchestratorDaemon claims it, replies via FollowUpRequested.
    5. Test releases the verifier's lease (simulating a re-claim
       cycle), the verifier's handler now sees the orchestrator's
       reply and completes.
    """

    def test_dialogue_round_trip_works_end_to_end(self, tmp_path: Path):
        base = tmp_path / "provider-queues"

        verifier_qdb = QueueDB(provider="openai", base_dir=base)
        orch_qdb = QueueDB(provider="claude", base_dir=base)

        # 1. Initial verification message arrives at the verifier's queue.
        verif_mid = verifier_qdb.enqueue(
            from_provider="claude",
            task_type="session-verification",
            payload={"session": 1, "files": ["a.py"]},
            idempotency_key="dial_verif",
        )

        # 2. Verifier first try: ask a clarifying question.
        clarify_calls = {"n": 0}

        def verifier_logic(msg: QueueMessage) -> dict:
            clarify_calls["n"] += 1
            if clarify_calls["n"] == 1:
                raise FollowUpRequested(
                    "What is the expected behavior in case Y?"
                )
            # Second pass: orchestrator's reply is now in follow_ups.
            ups = verifier_qdb.read_follow_ups(msg.id)
            orchestrator_replies = [u for u in ups if u.from_provider == "claude"]
            return {
                "verdict": "VERIFIED",
                "rounds": clarify_calls["n"],
                "saw_orchestrator_reply": len(orchestrator_replies) > 0,
            }

        v_daemon = verifier_role.VerifierDaemon(
            provider="openai", base_dir=base,
            heartbeat_interval=0.05, lease_seconds=2,
            verifier=verifier_logic,
        )
        outcome = v_daemon.run_one()
        assert outcome == "awaiting_followup"
        verif_after_q = verifier_qdb.get_message(verif_mid)
        assert verif_after_q is not None
        assert verif_after_q.state == "claimed"
        assert len(verifier_qdb.read_follow_ups(verif_mid)) == 1

        # 3. Test enqueues a follow-up message TO the orchestrator
        # carrying the verifier's question. (In production, the verifier
        # would do this as part of its FollowUpRequested handling. For
        # the dialogue test, simulate that step by hand.)
        question_text = verifier_qdb.read_follow_ups(verif_mid)[0].content
        orch_mid = orch_qdb.enqueue(
            from_provider="openai",
            task_type=TASK_VERIFICATION_FOLLOWUP,
            payload={
                "verifier_message_id": verif_mid,
                "question": question_text,
            },
            idempotency_key="dial_question",
        )

        # 4. OrchestratorDaemon picks it up and replies via
        # FollowUpRequested. The reply also gets appended to the
        # original verification message's follow_ups (the test
        # performs this side effect explicitly — production wiring is
        # Session 3's job, this test validates the daemon's ability
        # to express a reply).
        def followup_handler(msg: QueueMessage) -> dict:
            verifier_qdb.add_follow_up(
                msg.payload["verifier_message_id"],
                "claude",
                "Behavior in case Y is documented in section 3.2.",
            )
            return {
                "replied_to": msg.payload["verifier_message_id"],
                "rounds": 1,
            }

        o_daemon = OrchestratorDaemon(
            provider="claude", base_dir=base,
            heartbeat_interval=0.05, lease_seconds=2,
            followup_handler=followup_handler,
            rejection_handler=lambda m: {},
        )
        o_outcome = o_daemon.run_one()
        assert o_outcome == "completed"
        orch_stored = orch_qdb.get_message(orch_mid)
        assert orch_stored is not None
        assert orch_stored.state == "completed"
        assert orch_stored.result["replied_to"] == verif_mid

        # 5. Force the verifier's lease to expire so reclaim_expired
        # rolls the verification message back to 'new'. In production
        # the lease just naturally times out; in tests we accelerate it.
        import sqlite3
        conn = sqlite3.connect(verifier_qdb.db_path)
        try:
            conn.execute(
                "UPDATE messages SET lease_expires_at = ? WHERE id = ?",
                ("1970-01-01T00:00:00+00:00", verif_mid),
            )
            conn.commit()
        finally:
            conn.close()
        verifier_qdb.reclaim_expired()

        # 6. Verifier daemon re-claims and now sees the orchestrator's
        # reply in follow_ups. Verifier_logic returns VERIFIED.
        outcome2 = v_daemon.run_one()
        assert outcome2 == "completed"
        verif_after = verifier_qdb.get_message(verif_mid)
        assert verif_after is not None
        assert verif_after.state == "completed"
        assert verif_after.result == {
            "verdict": "VERIFIED",
            "rounds": 2,
            "saw_orchestrator_reply": True,
        }

        # 7. Both follow-ups recorded: verifier's question + orchestrator's reply.
        ups = verifier_qdb.read_follow_ups(verif_mid)
        assert len(ups) == 2
        assert ups[0].from_provider == "openai"
        assert ups[1].from_provider == "claude"


# ==========================================================================
# Subprocess integration: both daemons coexist
# ==========================================================================

class TestBothDaemonsCoexistAsSubprocesses:
    """Run the verifier daemon and orchestrator daemon as real OS
    subprocesses against shared SQLite files. Spec acceptance:
    "Orchestrator daemon and verifier daemon can run simultaneously
    in separate processes."
    """

    def test_both_daemons_run_in_separate_processes(self, tmp_path: Path):
        base = tmp_path / "provider-queues"

        # Pre-create both queues. Pre-enqueue one message in each so
        # both daemons have something to do on first poll.
        verifier_qdb = QueueDB(provider="openai", base_dir=base)
        orch_qdb = QueueDB(provider="claude", base_dir=base)

        verif_mid = verifier_qdb.enqueue(
            "claude", "session-verification",
            {"hello": "world"}, "subproc_verif_k",
        )
        orch_mid = orch_qdb.enqueue(
            "openai", TASK_VERIFICATION_REJECTED,
            {"reason": "missing test"}, "subproc_orch_k",
        )

        # Driver scripts: each replaces the daemon's default handler
        # with a simple stub that returns a predictable dict, so the
        # subprocess does not need API credentials.
        verifier_driver = tmp_path / "verifier_driver.py"
        verifier_driver.write_text(
            "import sys\n"
            f"sys.path.insert(0, {str(AI_ROUTER_DIR)!r})\n"
            "import verifier_role\n"
            "def fake(msg):\n"
            "    return {'verdict': 'VERIFIED', 'echo': msg.payload}\n"
            "verifier_role.run_verification = fake\n"
            "verifier_role.main()\n",
            encoding="utf-8",
        )

        orchestrator_driver = tmp_path / "orchestrator_driver.py"
        orchestrator_driver.write_text(
            "import sys\n"
            f"sys.path.insert(0, {str(AI_ROUTER_DIR)!r})\n"
            "import orchestrator_role\n"
            "def fake_fu(msg):\n"
            "    return {'replied': True}\n"
            "def fake_rej(msg):\n"
            "    return {'acknowledged': True, 'reason': msg.payload.get('reason')}\n"
            "orchestrator_role._default_followup_handler = fake_fu\n"
            "orchestrator_role._default_rejection_handler = fake_rej\n"
            "orchestrator_role.main()\n",
            encoding="utf-8",
        )

        v_proc = subprocess.Popen(
            [
                sys.executable, str(verifier_driver),
                "--provider", "openai",
                "--base-dir", str(base),
                "--poll-interval", "0.1",
                "--heartbeat-interval", "0.1",
                "--lease-seconds", "60",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(tmp_path),
        )
        o_proc = subprocess.Popen(
            [
                sys.executable, str(orchestrator_driver),
                "--provider", "claude",
                "--base-dir", str(base),
                "--poll-interval", "0.1",
                "--heartbeat-interval", "0.1",
                "--lease-seconds", "60",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(tmp_path),
        )
        try:
            deadline = time.time() + 15.0
            v_done = False
            o_done = False
            while time.time() < deadline and not (v_done and o_done):
                if not v_done:
                    v_stored = verifier_qdb.get_message(verif_mid)
                    if v_stored and v_stored.state == "completed":
                        v_done = True
                if not o_done:
                    o_stored = orch_qdb.get_message(orch_mid)
                    if o_stored and o_stored.state == "completed":
                        o_done = True
                time.sleep(0.1)

            assert v_done, "verifier subprocess did not complete its message"
            assert o_done, "orchestrator subprocess did not complete its message"

            v_final = verifier_qdb.get_message(verif_mid)
            o_final = orch_qdb.get_message(orch_mid)
            assert v_final is not None and v_final.state == "completed"
            assert v_final.result == {
                "verdict": "VERIFIED",
                "echo": {"hello": "world"},
            }
            assert o_final is not None and o_final.state == "completed"
            assert o_final.result == {
                "acknowledged": True,
                "reason": "missing test",
            }
        finally:
            for proc in (v_proc, o_proc):
                if os.name == "nt":
                    proc.terminate()
                else:
                    proc.send_signal(signal.SIGINT)
                try:
                    proc.wait(timeout=10.0)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5.0)
