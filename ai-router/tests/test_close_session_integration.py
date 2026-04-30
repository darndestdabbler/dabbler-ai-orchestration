"""Set 3 Session 2 integration tests for ``close_session`` end-to-end.

These tests exercise :func:`close_session.run` against realistic
fixtures — real git repos, real session-state, real disposition — to
confirm:

* The happy path closes a clean session set with all five gates passing.
* A concurrent invocation surfaces ``lock_contention`` / exit code 3.
* A stale lock is reclaimed and the close-out proceeds with a warning.
* A real gate failure (uncommitted in-scope file) lands ``gate_failed``
  / exit code 1 with the offending check named in the messages.

Unit-level gate predicate behavior is covered by ``test_gate_checks.py``;
the contract here is that the predicates are wired correctly and the
flow control around them works.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import close_session
from close_lock import LOCK_FILENAME, STALE_LOCK_TTL_SECONDS, acquire_lock, release_lock
from disposition import Disposition, write_disposition
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Helpers (subset of those in test_gate_checks; kept inline so the two
# files stay independently runnable)
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


def _ns(close_session_module, **overrides):
    parser = close_session_module._build_parser()
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
            specifics="stay on opus for the heavy lifting in the next set",
        ),
    )


@pytest.fixture
def closeable_set(tmp_path: Path) -> Path:
    """A session-set fixture where every gate naturally passes.

    Builds a real git repo, wires it to a bare remote, registers a
    non-final session, lands an activity-log entry, and writes a
    disposition with a valid ``next_orchestrator``. The set is then
    committed and pushed so the working tree is clean.
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
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="session 1 closed",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land set")
    _git(root, "push", "origin", "main")
    return set_dir


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_real_close_out_succeeds(closeable_set: Path):
    args = _ns(close_session, session_set_dir=str(closeable_set))
    outcome = close_session.run(args)
    assert outcome.result == "succeeded", outcome.messages
    assert outcome.exit_code == 0
    assert all(g.passed for g in outcome.gate_results), [
        (g.check, g.remediation) for g in outcome.gate_results
    ]


# ---------------------------------------------------------------------------
# Lock contention
# ---------------------------------------------------------------------------

def test_concurrent_invocation_returns_lock_contention(closeable_set: Path):
    """A live peer holding the lock blocks a second invocation."""
    held = acquire_lock(str(closeable_set), worker_id="peer")
    try:
        args = _ns(close_session, session_set_dir=str(closeable_set))
        outcome = close_session.run(args)
        assert outcome.result == "lock_contention"
        assert outcome.exit_code == 3
    finally:
        release_lock(held)


def test_stale_lock_is_reclaimed_during_close_out(closeable_set: Path):
    """A stale lock file from a dead PID lets close-out proceed with a warning."""
    lock_path = os.path.join(str(closeable_set), LOCK_FILENAME)
    with open(lock_path, "w", encoding="utf-8") as f:
        json.dump({
            "pid": 999_999,  # not running
            "worker_id": "ghost",
            "acquired_at": datetime.now().astimezone().isoformat(),
        }, f)

    args = _ns(close_session, session_set_dir=str(closeable_set))
    outcome = close_session.run(args)
    assert outcome.result == "succeeded", outcome.messages
    assert any("reclaimed stale lock" in m for m in outcome.messages)


# ---------------------------------------------------------------------------
# Real gate failure
# ---------------------------------------------------------------------------

def test_uncommitted_file_triggers_gate_failed(closeable_set: Path):
    """An uncommitted file under the set triggers the working-tree gate."""
    (closeable_set / "stray.txt").write_text("dirty\n", encoding="utf-8")
    args = _ns(close_session, session_set_dir=str(closeable_set))
    outcome = close_session.run(args)
    assert outcome.result == "gate_failed"
    assert outcome.exit_code == 1
    failed_names = {g.check for g in outcome.gate_results if not g.passed}
    assert "working_tree_clean" in failed_names


def test_missing_change_log_triggers_gate_failed_on_final_session(tmp_path: Path):
    """The final session of a set with no change-log.md fails change_log_fresh."""
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

    set_dir = root / "docs" / "session-sets" / "final-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    register_session_start(
        session_set=str(set_dir),
        session_number=2,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "final-set",
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 2,
                "stepNumber": 1,
                "stepKey": "session-2/work",
                "dateTime": "2026-04-30T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="last session",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    ))
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land final set")
    _git(root, "push", "origin", "main")

    args = _ns(close_session, session_set_dir=str(set_dir))
    outcome = close_session.run(args)
    assert outcome.result == "gate_failed"
    failed_names = {g.check for g in outcome.gate_results if not g.passed}
    assert "change_log_fresh" in failed_names


# ---------------------------------------------------------------------------
# Force still bypasses everything (regression check on the new lock path)
# ---------------------------------------------------------------------------

def test_force_still_bypasses_gates_under_lock(closeable_set: Path):
    """``--force`` skips gate execution but still acquires the lock."""
    args = _ns(close_session, session_set_dir=str(closeable_set), force=True)
    outcome = close_session.run(args)
    assert outcome.result == "succeeded"
    assert outcome.gate_results == []
    assert any("DEPRECATION" in m for m in outcome.messages)


def test_force_blocked_by_live_lock(closeable_set: Path):
    """Even ``--force`` cannot break in while a live peer holds the lock."""
    held = acquire_lock(str(closeable_set), worker_id="peer")
    try:
        args = _ns(
            close_session, session_set_dir=str(closeable_set), force=True,
        )
        outcome = close_session.run(args)
        assert outcome.result == "lock_contention"
    finally:
        release_lock(held)
