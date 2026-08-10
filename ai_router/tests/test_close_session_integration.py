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
from session_checklist import record_post
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)
from stamp_fixtures import write_stamped_evidence


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


def _corroborate_api_close(
    set_dir: Path,
    session_number: int,
    monkeypatch,
    tmp_path: Path,
    *,
    verifier_provider: str = "openai",
) -> None:
    """Give an api-method close the evidence the Set 083/084 gate demands.

    Writes the ``sN-verification.md`` artifact, a one-row metrics file
    with a STAMPED cross-provider ``session-verification`` row (Set 084
    F3 — a bare row no longer corroborates, and settled evidence stands
    the close backstop down), and points ``AI_ROUTER_METRICS_PATH`` at
    it.
    """
    row = write_stamped_evidence(
        set_dir, session_number=session_number, provider=verifier_provider,
    )
    metrics = tmp_path / "router-metrics.jsonl"
    metrics.write_text(json.dumps(row) + "\n", encoding="utf-8")
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))


@pytest.fixture
def closeable_set(tmp_path: Path, monkeypatch) -> Path:
    """A session-set fixture where every gate naturally passes.

    Builds a real git repo, wires it to a bare remote, registers a
    non-final session, lands an activity-log entry, and writes a
    disposition with a valid ``next_orchestrator``. The set is then
    committed and pushed so the working tree is clean. The Set 083
    verification-integrity gate's evidence (verification artifact +
    cross-provider metrics row) is seeded too, since the api-method
    disposition's derived VERIFIED is a claimed verdict.
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
    # Set 114 S1: the session posted its step checklist, recorded by the
    # act of rendering it. Written through the shipping writer rather
    # than a hand-rolled line, so the fixture exercises the real path.
    record_post(str(set_dir), 1, [])
    _corroborate_api_close(set_dir, 1, monkeypatch, tmp_path)
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

def test_uncommitted_file_triggers_gate_failed(closeable_set: Path, monkeypatch):
    """An uncommitted file under the set triggers the working-tree gate.

    The Set 084 backstop is stood down here: a stray uncommitted file
    also (correctly) stales the freshness binding and would re-run the
    verification first — that behavior is covered in
    test_close_backstop.py; this test isolates the working-tree gate.
    """
    import close_backstop

    monkeypatch.setattr(
        close_backstop, "run_close_backstop",
        lambda *_a, **_kw: close_backstop.BackstopOutcome(
            status=close_backstop.STATUS_SKIPPED_EVIDENCE_PRESENT,
        ),
    )
    (closeable_set / "stray.txt").write_text("dirty\n", encoding="utf-8")
    args = _ns(close_session, session_set_dir=str(closeable_set))
    outcome = close_session.run(args)
    assert outcome.result == "gate_failed"
    assert outcome.exit_code == 1
    failed_names = {g.check for g in outcome.gate_results if not g.passed}
    assert "working_tree_clean" in failed_names


def test_missing_change_log_warns_but_does_not_block_the_final_session(
    tmp_path: Path, monkeypatch,
):
    """Set 116 S3: change_log_fresh warns; it no longer refuses a close.

    Until the operator's 2026-08-10 ruling this exact fixture was
    ``gate_failed``. The ruling demoted the check as bookkeeping --
    "worth a warning at the set boundary; not worth blocking on" -- so
    the close now SUCCEEDS while the check still runs, still reports,
    and is still marked failed-but-advisory. Losing the message would
    make this a deletion; losing the veto is the demotion.
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

    set_dir = root / "docs" / "session-sets" / "final-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=1,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "final-set",
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": 1,
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
        summary="last session",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    ))
    # Set 084: settle the verification evidence so the close backstop
    # stands down and change_log_fresh stays the gate under test.
    record_post(str(set_dir), 1, [])
    _corroborate_api_close(set_dir, 1, monkeypatch, tmp_path)
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land final set")
    _git(root, "push", "origin", "main")

    args = _ns(close_session, session_set_dir=str(set_dir))
    outcome = close_session.run(args)
    assert outcome.result == "succeeded", outcome.messages
    row = next(
        g for g in outcome.gate_results if g.check == "change_log_fresh"
    )
    assert row.passed is False
    assert row.blocking is False
    assert row.remediation
    assert any(
        "change_log_fresh WARNING" in m for m in outcome.messages
    ), outcome.messages

    # And the state flip actually happened. This half is the falsifier
    # for the sibling the demotion exposed: `_flip_state_to_closed` used
    # to require change-log.md to be PRESENT before it would call a
    # session the last one, mirroring the gate. Once the gate stopped
    # refusing, that mirror judged this close mid-set and wrote
    # top-status `in-progress` over a sessions[] where every session was
    # complete -- an invariant violation, so close_session RAISED rather
    # than closing. Asserting "succeeded" alone does not catch that;
    # asserting the resulting state does.
    state = json.loads(
        (set_dir / "session-state.json").read_text(encoding="utf-8")
    )
    assert state["status"] == "complete"
    assert [s["status"] for s in state["sessions"]] == ["complete"]


# ---------------------------------------------------------------------------
# Force still bypasses everything (regression check on the new lock path).
# Set 9 Session 3 (D-2) hard-scoped --force: tests now opt in via the
# env-var gate + a real --reason-file.
# ---------------------------------------------------------------------------

def _force_args(closeable_set: Path, tmp_path: Path):
    """Build a parsed-args namespace for the hard-scoped --force path."""
    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "incident-recovery: integration test exercising --force\n",
        encoding="utf-8",
    )
    return _ns(
        close_session,
        session_set_dir=str(closeable_set),
        force=True,
        reason_file=str(reason_path),
    )


def test_force_still_bypasses_gates_under_lock(
    closeable_set: Path, tmp_path: Path, monkeypatch
):
    """``--force`` skips the bookkeeping gates but still acquires the lock.

    Set 083: the verification-integrity check is NOT skipped under
    ``--force`` (force bypasses gates, not evidence) — it is the single
    gate row in the output, passing here because the fixture carries
    real corroborating evidence.
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    args = _force_args(closeable_set, tmp_path)
    outcome = close_session.run(args)
    assert outcome.result == "succeeded"
    assert [(g.check, g.passed) for g in outcome.gate_results] == [
        ("verification_integrity", True)
    ]
    assert any("WARNING" in m and "force" in m.lower() for m in outcome.messages)


def test_force_blocked_by_live_lock(
    closeable_set: Path, tmp_path: Path, monkeypatch
):
    """Even ``--force`` cannot break in while a live peer holds the lock."""
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    held = acquire_lock(str(closeable_set), worker_id="peer")
    try:
        args = _force_args(closeable_set, tmp_path)
        outcome = close_session.run(args)
        assert outcome.result == "lock_contention"
    finally:
        release_lock(held)
