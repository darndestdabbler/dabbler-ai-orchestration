"""Tests for ai-router/queue_status.py — Set 005 / Session 1.

Coverage shape:
* The collect_status() shape (extension's JSON contract).
* Provider discovery vs. provider filtering.
* state_filter and limit honoring.
* mark_failed / force_reclaim semantics — refusal cases first
  (terminal state, wrong state) and then the happy paths.
* CLI smoke test via subprocess so the python -m ai_router.queue_status
  invocation is exercised end-to-end.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

import queue_db  # type: ignore[import-not-found]
import queue_status  # type: ignore[import-not-found]
from queue_db import QueueDB  # type: ignore[import-not-found]


AI_ROUTER_DIR = Path(queue_db.__file__).resolve().parent


@pytest.fixture
def base_dir(tmp_path: Path) -> Path:
    return tmp_path / "provider-queues"


@pytest.fixture
def populated(base_dir: Path) -> dict:
    """Three providers with a mix of message states."""
    qa = QueueDB(provider="anthropic", base_dir=base_dir)
    qo = QueueDB(provider="openai", base_dir=base_dir)
    QueueDB(provider="google", base_dir=base_dir)  # empty queue.db

    a_new = qa.enqueue(
        from_provider="codex",
        task_type="session-verification",
        payload={"k": 1},
        idempotency_key="a-1",
        session_set="my-feature",
        session_number=1,
    )
    a_claimed_id = qa.enqueue(
        from_provider="codex",
        task_type="code-review",
        payload={"k": 2},
        idempotency_key="a-2",
    )
    claimed_msg = qa.claim(worker_id="worker-1")
    assert claimed_msg is not None and claimed_msg.id == a_new
    # claim() picked the FIFO-oldest, so a_new is now claimed and a_claimed_id is still new.
    # Swap labels for clarity.
    a_claimed = a_new
    a_still_new = a_claimed_id

    o_id = qo.enqueue(
        from_provider="codex",
        task_type="documentation",
        payload={"k": 3},
        idempotency_key="o-1",
    )

    return {
        "a_claimed": a_claimed,
        "a_still_new": a_still_new,
        "o_id": o_id,
    }


# --------------------------------------------------------------------------
# collect_status: shape + discovery
# --------------------------------------------------------------------------

def test_collect_status_returns_empty_when_no_base_dir(tmp_path: Path):
    payload = queue_status.collect_status(base_dir=tmp_path / "nope")
    assert payload == {"providers": {}}


def test_collect_status_discovers_providers_with_queue_db(
    base_dir: Path, populated: dict
):
    payload = queue_status.collect_status(base_dir=base_dir)
    providers = payload["providers"]
    assert set(providers.keys()) == {"anthropic", "openai", "google"}
    for name, info in providers.items():
        assert "queue_path" in info
        assert info["queue_present"] is True
        # All five canonical states present in the counts dict.
        assert set(info["states"].keys()) == {
            "new", "claimed", "completed", "failed", "timed_out"
        }


def test_collect_status_state_counts(base_dir: Path, populated: dict):
    payload = queue_status.collect_status(base_dir=base_dir)
    a = payload["providers"]["anthropic"]["states"]
    assert a["new"] == 1
    assert a["claimed"] == 1
    assert a["completed"] == 0


def test_collect_status_message_summary_shape(
    base_dir: Path, populated: dict
):
    payload = queue_status.collect_status(base_dir=base_dir)
    msgs = payload["providers"]["anthropic"]["messages"]
    assert len(msgs) == 2
    sample = msgs[0]
    expected_keys = {
        "id", "task_type", "session_set", "session_number", "state",
        "claimed_by", "lease_expires_at", "enqueued_at", "completed_at",
        "attempts", "max_attempts", "from_provider",
    }
    assert set(sample.keys()) == expected_keys
    # payload/result are excluded from the tree-view summary.
    assert "payload" not in sample
    assert "result" not in sample


def test_collect_status_provider_filter_includes_missing(
    base_dir: Path, populated: dict
):
    payload = queue_status.collect_status(
        base_dir=base_dir, provider_filter="anthropic"
    )
    assert set(payload["providers"].keys()) == {"anthropic"}


def test_collect_status_provider_filter_missing_provider(
    base_dir: Path, populated: dict
):
    payload = queue_status.collect_status(
        base_dir=base_dir, provider_filter="nonexistent"
    )
    info = payload["providers"]["nonexistent"]
    assert info["queue_present"] is False
    assert info["messages"] == []
    # Counts are still all-zero so the extension can render a stable shape.
    assert all(v == 0 for v in info["states"].values())


def test_collect_status_state_filter(base_dir: Path, populated: dict):
    payload = queue_status.collect_status(base_dir=base_dir, state_filter="claimed")
    a_msgs = payload["providers"]["anthropic"]["messages"]
    assert len(a_msgs) == 1
    assert a_msgs[0]["state"] == "claimed"
    # state_filter limits the message LIST but not the state COUNTS — the
    # extension expects the full count dict regardless of which state's
    # messages it chose to fetch.
    assert payload["providers"]["anthropic"]["states"]["new"] == 1


def test_collect_status_invalid_state_raises(base_dir: Path):
    with pytest.raises(ValueError, match="unknown state"):
        queue_status.collect_status(base_dir=base_dir, state_filter="bogus")


def test_collect_status_invalid_limit_raises(base_dir: Path):
    with pytest.raises(ValueError, match="limit must be positive"):
        queue_status.collect_status(base_dir=base_dir, limit=0)


def test_collect_status_limit(base_dir: Path):
    qa = QueueDB(provider="anthropic", base_dir=base_dir)
    for i in range(5):
        qa.enqueue(
            from_provider="codex",
            task_type="x",
            payload={"i": i},
            idempotency_key=f"key-{i}",
        )
    payload = queue_status.collect_status(base_dir=base_dir, limit=3)
    assert len(payload["providers"]["anthropic"]["messages"]) == 3


# --------------------------------------------------------------------------
# get_payload
# --------------------------------------------------------------------------

def test_get_payload_returns_full_message(base_dir: Path, populated: dict):
    payload = queue_status.get_payload(
        base_dir=base_dir,
        provider="anthropic",
        message_id=populated["a_claimed"],
    )
    assert payload is not None
    assert payload["id"] == populated["a_claimed"]
    assert payload["payload"] == {"k": 1}
    assert payload["state"] == "claimed"


def test_get_payload_unknown_returns_none(base_dir: Path, populated: dict):
    payload = queue_status.get_payload(
        base_dir=base_dir,
        provider="anthropic",
        message_id="00000000-0000-0000-0000-000000000000",
    )
    assert payload is None


# --------------------------------------------------------------------------
# mark_failed
# --------------------------------------------------------------------------

def test_mark_failed_on_claimed(base_dir: Path, populated: dict):
    result = queue_status.mark_failed(
        base_dir=base_dir,
        provider="anthropic",
        message_id=populated["a_claimed"],
    )
    assert result == {"ok": True, "previous_state": "claimed"}
    qa = QueueDB(provider="anthropic", base_dir=base_dir)
    msg = qa.get_message(populated["a_claimed"])
    assert msg.state == "failed"
    assert msg.failure_reason == queue_status.MARK_FAILED_REASON
    assert msg.claimed_by is None


def test_mark_failed_on_new(base_dir: Path, populated: dict):
    result = queue_status.mark_failed(
        base_dir=base_dir,
        provider="anthropic",
        message_id=populated["a_still_new"],
    )
    assert result["ok"] is True
    assert result["previous_state"] == "new"


def test_mark_failed_refuses_terminal(base_dir: Path):
    qa = QueueDB(provider="anthropic", base_dir=base_dir)
    mid = qa.enqueue(
        from_provider="codex",
        task_type="x",
        payload={},
        idempotency_key="t-1",
    )
    claimed = qa.claim(worker_id="w-1")
    qa.complete(message_id=claimed.id, worker_id="w-1", result={"r": 1})
    result = queue_status.mark_failed(
        base_dir=base_dir, provider="anthropic", message_id=mid
    )
    assert result["ok"] is False
    assert "terminal state" in result["error"]


def test_mark_failed_unknown(base_dir: Path, populated: dict):
    result = queue_status.mark_failed(
        base_dir=base_dir,
        provider="anthropic",
        message_id="00000000-0000-0000-0000-000000000000",
    )
    assert result["ok"] is False
    assert "unknown" in result["error"]


# --------------------------------------------------------------------------
# force_reclaim
# --------------------------------------------------------------------------

def test_force_reclaim_on_claimed(base_dir: Path, populated: dict):
    result = queue_status.force_reclaim(
        base_dir=base_dir,
        provider="anthropic",
        message_id=populated["a_claimed"],
    )
    assert result["ok"] is True
    assert result["previous_state"] == "claimed"
    assert result["attempts"] == 1
    qa = QueueDB(provider="anthropic", base_dir=base_dir)
    msg = qa.get_message(populated["a_claimed"])
    assert msg.state == "new"
    assert msg.claimed_by is None
    # The next claim() should succeed and pick this message back up.
    reclaimed = qa.claim(worker_id="worker-2")
    assert reclaimed is not None


def test_force_reclaim_refuses_non_claimed(base_dir: Path, populated: dict):
    result = queue_status.force_reclaim(
        base_dir=base_dir,
        provider="anthropic",
        message_id=populated["a_still_new"],
    )
    assert result["ok"] is False
    assert "not 'claimed'" in result["error"]


def test_force_reclaim_unknown(base_dir: Path):
    qa = QueueDB(provider="anthropic", base_dir=base_dir)  # ensure DB exists
    result = queue_status.force_reclaim(
        base_dir=base_dir,
        provider="anthropic",
        message_id="00000000-0000-0000-0000-000000000000",
    )
    assert result["ok"] is False


# --------------------------------------------------------------------------
# CLI smoke
# --------------------------------------------------------------------------

def test_cli_json_format(base_dir: Path, populated: dict):
    proc = subprocess.run(
        [
            sys.executable, "-m", "queue_status",
            "--base-dir", str(base_dir),
            "--format", "json",
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(proc.stdout)
    assert "providers" in payload
    assert "anthropic" in payload["providers"]


def test_cli_text_format_runs(base_dir: Path, populated: dict):
    # Smoke-test only: text formatting is for human eyeballs and the
    # exact layout is intentionally underspecified.
    proc = subprocess.run(
        [
            sys.executable, "-m", "queue_status",
            "--base-dir", str(base_dir),
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
        check=True,
    )
    assert "anthropic" in proc.stdout


def test_cli_intervention_requires_provider(base_dir: Path, populated: dict):
    proc = subprocess.run(
        [
            sys.executable, "-m", "queue_status",
            "--base-dir", str(base_dir),
            "--mark-failed", populated["a_claimed"],
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert "requires --provider" in proc.stderr


def test_cli_mutually_exclusive_interventions(base_dir: Path, populated: dict):
    proc = subprocess.run(
        [
            sys.executable, "-m", "queue_status",
            "--base-dir", str(base_dir),
            "--provider", "anthropic",
            "--mark-failed", populated["a_claimed"],
            "--force-reclaim", populated["a_claimed"],
        ],
        cwd=str(AI_ROUTER_DIR),
        capture_output=True,
        text=True,
    )
    assert proc.returncode != 0
    assert "mutually exclusive" in proc.stderr
