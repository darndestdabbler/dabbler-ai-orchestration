"""End-to-end-ish tests for capacity-signal wiring in role-loop daemons.

The role-loop daemons (verifier_role + orchestrator_role) share
``process_one_message`` from verifier_role.py. After ``queue.complete``
succeeds, ``process_one_message`` writes one capacity-signal record
to ``provider-queues/<provider>/capacity_signal.jsonl``. These tests
verify that wiring without spinning up a real role-loop process —
they call ``process_one_message`` directly with a fake verifier
callable, the same pattern as test_verifier_role.py.

Coverage:

* Verifier-shaped result -> signal is written, with token + model
  fields populated from the verifier-specific keys.
* Orchestrator default-handler-shaped result -> signal is still
  written, but token / model fields are null (the default handler
  has no model behind it).
* Failure path -> NO signal is written (the heartbeat is for
  successful completions only).
* Follow-up path -> NO signal is written (no completion happened).
* Verifier and orchestrator daemons share the same wiring.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import capacity  # noqa: E402
import orchestrator_role  # noqa: E402
import queue_db  # noqa: E402
import verifier_role  # noqa: E402
from capacity import CAPACITY_SIGNAL_FILENAME
from queue_db import QueueDB
from verifier_role import FollowUpRequested, process_one_message


@pytest.fixture
def base_dir(tmp_path: Path) -> Path:
    return tmp_path / "provider-queues"


@pytest.fixture
def qdb(base_dir: Path) -> QueueDB:
    return QueueDB(provider="openai", base_dir=base_dir)


@pytest.fixture
def worker_id() -> str:
    return "host:1234:openai:cafef00d"


def _enqueue(qdb: QueueDB, key: str = "k1", task_type: str = "verify") -> str:
    return qdb.enqueue(
        from_provider="claude",
        task_type=task_type,
        payload={"any": "payload"},
        idempotency_key=key,
    )


def _signal_records(base_dir: Path, provider: str) -> list[dict]:
    p = base_dir / provider / CAPACITY_SIGNAL_FILENAME
    if not p.is_file():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


# ====================================================================
# Happy-path wiring: verifier-shaped result
# ====================================================================

class TestVerifierShapedResultWritesSignal:
    def test_signal_written_with_token_fields_populated(
        self, qdb: QueueDB, base_dir: Path, worker_id: str,
    ):
        mid = _enqueue(qdb, task_type="session-verification")
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def verifier(msg):
            return {
                "verdict": "VERIFIED",
                "verified": True,
                "issues": [],
                "verifier_model": "gemini-pro",
                "verifier_provider": "google",
                "verifier_input_tokens": 1234,
                "verifier_output_tokens": 567,
                "verifier_cost_usd": 0.001,
            }

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=verifier,
            heartbeat_interval=5.0,
        )
        assert outcome == "completed"

        recs = _signal_records(base_dir, "openai")
        assert len(recs) == 1
        rec = recs[0]
        assert rec["provider"] == "openai"
        assert rec["task_type"] == "session-verification"
        assert rec["tokens_input"] == 1234
        assert rec["tokens_output"] == 567
        assert rec["model_name"] == "gemini-pro"


# ====================================================================
# Orchestrator default-handler shape
# ====================================================================

class TestOrchestratorShapedResultWritesSignal:
    def test_signal_still_written_token_fields_null(
        self, qdb: QueueDB, base_dir: Path, worker_id: str,
    ):
        mid = _enqueue(qdb, task_type="verification_followup")
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        # Orchestrator default-handler shape — no token counts, no
        # model behind it.
        def handler(msg):
            return {
                "acknowledged": True,
                "task_type": msg.task_type,
                "summary": "fake follow-up ack",
                "from_provider": msg.from_provider,
            }

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=handler,
            heartbeat_interval=5.0,
        )
        assert outcome == "completed"

        recs = _signal_records(base_dir, "openai")
        assert len(recs) == 1
        rec = recs[0]
        # Tokens / model are null since the handler did not provide them.
        # Heartbeat is still useful: timestamp + provider + task_type.
        assert rec["tokens_input"] is None
        assert rec["tokens_output"] is None
        assert rec["model_name"] is None
        assert rec["task_type"] == "verification_followup"


# ====================================================================
# Failure / follow-up path: NO signal
# ====================================================================

class TestFailureProducesNoSignal:
    def test_handler_exception_writes_no_signal(
        self, qdb: QueueDB, base_dir: Path, worker_id: str,
    ):
        _enqueue(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def boom(msg):
            raise RuntimeError("simulated handler failure")

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=boom,
            heartbeat_interval=5.0,
        )
        # 'new' (will be retried) or 'failed' (terminal) — both are
        # non-completed outcomes.
        assert outcome in ("new", "failed")
        assert _signal_records(base_dir, "openai") == []


class TestFollowUpProducesNoSignal:
    def test_followup_request_writes_no_signal(
        self, qdb: QueueDB, base_dir: Path, worker_id: str,
    ):
        _enqueue(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def asks_followup(msg):
            raise FollowUpRequested("please clarify X")

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=asks_followup,
            heartbeat_interval=5.0,
        )
        assert outcome == "awaiting_followup"
        assert _signal_records(base_dir, "openai") == []


# ====================================================================
# Signal write failure does not propagate
# ====================================================================

class TestSignalWriteIsBestEffort:
    def test_emit_capacity_signal_failure_does_not_fail_message(
        self, qdb: QueueDB, base_dir: Path, worker_id: str,
        monkeypatch,
    ):
        # If the capacity-signal writer raises (it shouldn't — the
        # function already swallows OSError — but just in case), the
        # surrounding belt+suspenders try/except in process_one_message
        # must prevent it from poisoning a successful completion.
        def boom(*args, **kwargs):
            raise RuntimeError("simulated signal-writer crash")

        monkeypatch.setattr(verifier_role, "write_capacity_signal", boom)

        _enqueue(qdb)
        msg = qdb.claim(worker_id, lease_seconds=60)
        assert msg is not None

        def verifier(msg):
            return {"verdict": "VERIFIED", "verified": True, "issues": []}

        outcome = process_one_message(
            qdb, msg, worker_id, verifier=verifier,
            heartbeat_interval=5.0,
        )
        assert outcome == "completed"
        # The completion happened; the signal log was not written.
        assert _signal_records(base_dir, "openai") == []
