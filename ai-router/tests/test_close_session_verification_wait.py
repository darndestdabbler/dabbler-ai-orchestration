"""Set 3 Session 3 integration tests for close_session's verification-wait.

Covers:

* Outsource-first close-out (verification result is on disk; the wait
  branch should not run).
* Outsource-last close-out where verifications are still pending,
  then complete during the wait — close-out blocks, then unblocks,
  then runs gate checks.
* Timeout case — verifications never reach a terminal state within
  ``--timeout``; close-out exits with ``verification_timeout`` and
  emits a ``closeout_failed`` event.
* Verifier rejection — a queued message terminates in ``failed``;
  close-out surfaces it as ``gate_failed`` with a synthetic
  verification gate result.

The fixture builds a real git repo + bare remote so the deterministic
gates pass; the tests then drive the queue state directly via
:class:`queue_db.QueueDB` rather than running real verifier daemons.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

import pytest

import close_session
from disposition import Disposition, write_disposition
from queue_db import QueueDB
from session_events import read_events
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed: {proc.stderr.strip()}"
        )
    return proc


def _ns(**overrides):
    parser = close_session._build_parser()
    args = parser.parse_args([])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="stay on opus for the heavy lifting",
        ),
    )


@pytest.fixture
def closeable_set(tmp_path: Path) -> Path:
    """Set fixture identical to test_close_session_integration's, but local.

    Builds repo + bare remote, registers session 1 of 2, lands an
    activity-log entry, and commits a baseline so the working tree is
    clean and the gate checks naturally pass.
    """
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")

    bare = tmp_path / "repo.git"
    bare.mkdir()
    _git(bare, "init", "--bare", "-b", "main")
    _git(root, "remote", "add", "origin", str(bare))
    _git(root, "push", "-u", "origin", "main")

    set_dir = root / "docs" / "session-sets" / "test-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "test-set",
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-04-30T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    return set_dir


def _commit_and_push_set(set_dir: Path) -> None:
    """Stage, commit, and push everything currently under *set_dir*'s repo.

    Called after the test writes a disposition so the working tree
    gate sees a clean state at gate time.
    """
    repo_root = set_dir
    while not (repo_root / ".git").exists():
        repo_root = repo_root.parent
    _git(repo_root, "add", "-A")
    _git(repo_root, "commit", "-m", "land work")
    _git(repo_root, "push", "origin", "main")


def _enqueue_verification(
    queue_base_dir: Path, provider: str, *, idempotency_key: str,
) -> str:
    """Insert one ``new``-state verification message and return its id.

    The test then drives the message to a terminal state via the
    queue's normal complete / fail / reclaim_expired API, which is
    what real verifier daemons would do.
    """
    qdb = QueueDB(provider=provider, base_dir=str(queue_base_dir))
    return qdb.enqueue(
        from_provider="orchestrator",
        task_type="session-verification",
        payload={"task_type": "session-verification", "content": "x"},
        idempotency_key=idempotency_key,
    )


# ---------------------------------------------------------------------------
# Outsource-first: API verification — close-out should not enter the wait
# ---------------------------------------------------------------------------

def test_outsource_first_close_out_skips_queue_wait(closeable_set: Path):
    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="api-verified session",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    args = _ns(session_set_dir=str(closeable_set))
    outcome = close_session.run(args)

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "api"
    assert outcome.verification_wait_outcome == "not_run"
    assert outcome.verification_message_ids == []
    # No verification_completed events should have been emitted in the
    # api path — those are queue-mode artifacts.
    events = read_events(str(closeable_set))
    queue_events = [
        e for e in events if e.event_type in (
            "verification_completed", "verification_timed_out",
        )
    ]
    assert queue_events == []


# ---------------------------------------------------------------------------
# Outsource-last happy path: messages complete during the wait
# ---------------------------------------------------------------------------

def test_outsource_last_close_out_unblocks_when_messages_complete(
    closeable_set: Path, tmp_path: Path,
):
    queue_dir = tmp_path / "queues"
    mid = _enqueue_verification(queue_dir, "gpt-5-4-mini", idempotency_key="k1")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="queue-verified session",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    # The injected sleep is what drives the queue forward — it
    # simulates the verifier daemon completing the message between
    # close_session's poll cycles. First wake-up: claim. Second
    # wake-up: complete. Subsequent wake-ups: nothing more to do.
    qdb = QueueDB(provider="gpt-5-4-mini", base_dir=str(queue_dir))
    poll_calls = {"n": 0}

    def fake_sleep(_seconds: float) -> None:
        poll_calls["n"] += 1
        if poll_calls["n"] == 1:
            qdb.claim(worker_id="verifier-daemon")
        elif poll_calls["n"] == 2:
            qdb.complete(mid, "verifier-daemon", {"verdict": "VERIFIED"})

    args = _ns(session_set_dir=str(closeable_set), timeout=5)
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        poll_interval_seconds=0.001,
        sleep=fake_sleep,
    )

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "queue"
    assert outcome.verification_wait_outcome == "completed"
    assert outcome.verification_message_ids == [mid]
    # The wait should have looped at least until message reached
    # completed (poll #2). Three+ confirms the close-out actually
    # blocked rather than reading a synchronously-terminal state.
    assert poll_calls["n"] >= 2

    events = read_events(str(closeable_set))
    completed = [
        e for e in events
        if e.event_type == "verification_completed"
        and e.fields.get("message_id") == mid
    ]
    assert len(completed) == 1
    assert completed[0].fields.get("queue_state") == "completed"
    assert completed[0].fields.get("queue_provider") == "gpt-5-4-mini"


# ---------------------------------------------------------------------------
# Timeout: messages never reach a terminal state
# ---------------------------------------------------------------------------

def test_outsource_last_close_out_times_out(
    closeable_set: Path, tmp_path: Path,
):
    queue_dir = tmp_path / "queues"
    mid = _enqueue_verification(queue_dir, "gpt-5-4-mini", idempotency_key="k1")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="queue-verified session",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    # Inject a monotonic clock that jumps past the deadline on the
    # second read, so the wait loop terminates without sleeping in
    # real time. Fake sleep is a no-op (the verifier never advances
    # the message — that's the timeout case).
    monotonic_calls = {"n": 0}

    def fake_monotonic() -> float:
        # First call (initial deadline computation) returns 0.
        # Subsequent calls return a value past the deadline so the
        # wait loop bails on its next iteration.
        n = monotonic_calls["n"]
        monotonic_calls["n"] += 1
        return 0.0 if n == 0 else 10_000.0

    args = _ns(session_set_dir=str(closeable_set), timeout=1)
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        poll_interval_seconds=0.001,
        sleep=lambda _s: None,
        monotonic=fake_monotonic,
    )

    assert outcome.result == "verification_timeout"
    assert outcome.exit_code == 4
    assert outcome.verification_wait_outcome == "timed_out"
    assert outcome.verification_message_ids == [mid]
    assert any("verification timed out" in m for m in outcome.messages)

    events = read_events(str(closeable_set))
    timed_out_events = [
        e for e in events if e.event_type == "verification_timed_out"
    ]
    assert len(timed_out_events) == 1
    assert timed_out_events[0].fields.get("message_id") == mid

    closeout_failed = [
        e for e in events if e.event_type == "closeout_failed"
    ]
    assert len(closeout_failed) == 1
    assert closeout_failed[0].fields.get("reason") == "verification_timeout"


# ---------------------------------------------------------------------------
# Verifier rejection: message ends in 'failed' — gate_failed surface
# ---------------------------------------------------------------------------

def test_verifier_failed_terminates_with_gate_failed(
    closeable_set: Path, tmp_path: Path,
):
    queue_dir = tmp_path / "queues"
    mid = _enqueue_verification(queue_dir, "gpt-5-4-mini", idempotency_key="k1")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="queue-verified session",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    # Drive the message all the way to 'failed' before close_session
    # starts polling (max_attempts=1 path on the first fail).
    qdb = QueueDB(provider="gpt-5-4-mini", base_dir=str(queue_dir))
    qdb.claim(worker_id="verifier-daemon")
    # Default max_attempts is 3; force three consecutive fails to
    # exhaust the budget.
    qdb.fail(mid, "verifier-daemon", "verifier rejected: ISSUES_FOUND")
    qdb.claim(worker_id="verifier-daemon")
    qdb.fail(mid, "verifier-daemon", "verifier rejected: ISSUES_FOUND")
    qdb.claim(worker_id="verifier-daemon")
    qdb.fail(mid, "verifier-daemon", "verifier rejected: ISSUES_FOUND")
    assert qdb.get_message(mid).state == "failed"

    args = _ns(session_set_dir=str(closeable_set), timeout=1)
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        poll_interval_seconds=0.001,
        sleep=lambda _s: None,
    )

    assert outcome.result == "gate_failed"
    assert outcome.exit_code == 1
    assert outcome.verification_wait_outcome == "failed"
    assert any("verification failed" in m for m in outcome.messages)
    failed_names = {g.check for g in outcome.gate_results if not g.passed}
    assert "verification_passed" in failed_names

    events = read_events(str(closeable_set))

    # The failed message should still emit a per-message event with
    # the structured queue payload so downstream consumers can attach
    # the failure_reason to the audit trail.
    failed_message_events = [
        e for e in events
        if e.event_type == "verification_completed"
        and e.fields.get("message_id") == mid
        and e.fields.get("queue_state") == "failed"
    ]
    assert len(failed_message_events) == 1
    fr = failed_message_events[0].fields.get("failure_reason") or ""
    assert "ISSUES_FOUND" in fr

    closeout_failed = [
        e for e in events if e.event_type == "closeout_failed"
    ]
    assert len(closeout_failed) == 1
    assert closeout_failed[0].fields.get("reason") == "verification_failed"
    assert closeout_failed[0].fields.get("failed_checks") == [
        "verification_passed"
    ]


# ---------------------------------------------------------------------------
# Manual-verify: queue is not consulted
# ---------------------------------------------------------------------------

def test_manual_verify_skips_queue_wait(
    closeable_set: Path, tmp_path: Path,
):
    """``--manual-verify`` bypasses the queue wait entirely.

    Even if the disposition declares ``verification_method=queue`` with
    a still-pending message id, ``--manual-verify`` should let the
    close-out proceed to the gate checks without polling the queue.
    """
    queue_dir = tmp_path / "queues"
    mid = _enqueue_verification(queue_dir, "gpt-5-4-mini", idempotency_key="k1")
    # Deliberately leave the message in 'new' state — close_session
    # would block forever in queue mode, but --manual-verify must
    # short-circuit.

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="manually-verified session",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
        timeout=1,
    )

    def fail_on_sleep(_s: float) -> None:
        raise AssertionError(
            "--manual-verify must not enter the queue-poll wait"
        )

    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        sleep=fail_on_sleep,
    )

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "manual"
    assert outcome.verification_wait_outcome == "skipped_via_manual_verify"
