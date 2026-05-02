"""Tests for the Set 3 Session 2 gate-check predicates.

Covers:

* :func:`gate_checks.check_working_tree_clean` — clean tree, untracked
  in-scope, ignored patterns, scoping by ``files_changed`` allowlist,
  not-a-git-repo failure.
* :func:`gate_checks.check_pushed_to_remote` — clean (no upstream
  drift), missing upstream, detached HEAD, ahead-of-upstream, push
  rejection (simulated via dry-run path mocking).
* :func:`gate_checks.check_activity_log_entry` — entry present, no
  state, no log, log without matching session number.
* :func:`gate_checks.check_next_orchestrator_present` — required for
  non-final, optional for final, missing on non-final, malformed.
* :func:`gate_checks.check_change_log_fresh` — non-final session
  (skip), final missing, final stale-by-mtime-and-content, final fresh
  by mtime, final fresh by content reference.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

import pytest

import gate_checks
from disposition import Disposition, write_disposition
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:
    """Run a git command in *repo_root*, raising on non-zero exit."""
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed: {proc.stderr.strip()}"
        )
    return proc


def _make_repo(root: Path) -> None:
    """Initialize a git repo at *root* with a baseline commit on ``main``."""
    root.mkdir(parents=True, exist_ok=True)
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")


def _make_bare_remote(root: Path) -> Path:
    """Init a bare repo to act as the remote and return its path."""
    bare = root.parent / (root.name + ".git")
    bare.mkdir(parents=True, exist_ok=True)
    _git(bare, "init", "--bare", "-b", "main")
    return bare


def _set_remote(root: Path, remote_url: str) -> None:
    """Wire 'origin' to *remote_url* and push so upstream tracking works."""
    _git(root, "remote", "add", "origin", remote_url)
    _git(root, "push", "-u", "origin", "main")


def _make_session_set(
    root: Path,
    *,
    name: str = "test-set",
    current_session: int = 1,
    total_sessions: int = 2,
    log_session: bool = True,
) -> Path:
    """Create a session-set folder under *root* with state + log + spec."""
    set_dir = root / "docs" / "session-sets" / name
    set_dir.mkdir(parents=True, exist_ok=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    register_session_start(
        session_set=str(set_dir),
        session_number=current_session,
        total_sessions=total_sessions,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    log_path = set_dir / "activity-log.json"
    if log_session:
        data = {
            "sessionSetName": name,
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": total_sessions,
            "entries": [
                {
                    "sessionNumber": current_session,
                    "stepNumber": 1,
                    "stepKey": f"session-{current_session}/work",
                    "dateTime": "2026-04-30T01:00:00-04:00",
                    "description": "did work",
                    "status": "complete",
                    "routedApiCalls": [],
                }
            ],
        }
    else:
        data = {
            "sessionSetName": name,
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": total_sessions,
            "entries": [],
        }
    log_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return set_dir


def _next_orc_dict() -> dict:
    """Return a valid next_orchestrator dict for disposition tests."""
    return {
        "engine": "claude-code",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "effort": "high",
        "reason": {
            "code": "continue-current-trajectory",
            "specifics": "stay on opus for the heavy lifting in the next set",
        },
    }


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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """An isolated git repo with no remote configured."""
    root = tmp_path / "repo"
    _make_repo(root)
    return root


@pytest.fixture
def repo_with_remote(tmp_path: Path) -> Path:
    """A git repo with origin/main wired to a bare remote and HEAD pushed."""
    root = tmp_path / "repo"
    _make_repo(root)
    bare = _make_bare_remote(root)
    _set_remote(root, str(bare))
    return root


@pytest.fixture
def set_dir_in_repo(repo_with_remote: Path) -> Path:
    """A session set inside the repo with remote tracking, committed clean.

    The set's bookkeeping files (spec.md, session-state.json,
    activity-log.json) are committed and pushed, so the working tree
    starts clean. Individual tests then dirty the tree as needed.
    """
    set_dir = _make_session_set(repo_with_remote)
    _git(repo_with_remote, "add", "-A")
    _git(repo_with_remote, "commit", "-m", "land session set")
    _git(repo_with_remote, "push", "origin", "main")
    return set_dir


# ---------------------------------------------------------------------------
# check_working_tree_clean
# ---------------------------------------------------------------------------

def test_working_tree_clean_passes_when_tree_is_clean(set_dir_in_repo):
    disp = Disposition(
        status="completed",
        summary="x",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    passed, remediation = gate_checks.check_working_tree_clean(
        str(set_dir_in_repo), disp,
    )
    assert passed
    assert remediation == ""


def test_working_tree_clean_fails_on_untracked_in_scope(set_dir_in_repo):
    """An untracked file *under* the session-set dir blocks the gate."""
    (set_dir_in_repo / "stray.txt").write_text("oops\n", encoding="utf-8")
    disp = Disposition(
        status="completed",
        summary="x",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    passed, remediation = gate_checks.check_working_tree_clean(
        str(set_dir_in_repo), disp,
    )
    assert not passed
    assert "stray.txt" in remediation


def test_working_tree_clean_ignores_universal_patterns(set_dir_in_repo):
    """``.DS_Store`` / editor swap files do not block the gate."""
    (set_dir_in_repo / ".DS_Store").write_bytes(b"\x00")
    (set_dir_in_repo / "notes.swp").write_text("x", encoding="utf-8")
    disp = Disposition(
        status="completed",
        summary="x",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    passed, _remediation = gate_checks.check_working_tree_clean(
        str(set_dir_in_repo), disp,
    )
    assert passed


def test_working_tree_clean_ignores_out_of_scope_paths(set_dir_in_repo, repo_with_remote):
    """An untracked file outside the session set tree does NOT block (when disposition is present)."""
    (repo_with_remote / "elsewhere.txt").write_text("orphan\n", encoding="utf-8")
    disp = Disposition(
        status="completed",
        summary="x",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    passed, _remediation = gate_checks.check_working_tree_clean(
        str(set_dir_in_repo), disp,
    )
    assert passed


def test_working_tree_clean_fails_outside_git_repo(tmp_path):
    not_a_repo = tmp_path / "loose"
    not_a_repo.mkdir()
    passed, remediation = gate_checks.check_working_tree_clean(
        str(not_a_repo), None,
    )
    assert not passed
    assert "git repository" in remediation


# ---------------------------------------------------------------------------
# check_pushed_to_remote
# ---------------------------------------------------------------------------

def test_pushed_to_remote_passes_when_no_drift(set_dir_in_repo):
    passed, remediation = gate_checks.check_pushed_to_remote(
        str(set_dir_in_repo), None,
    )
    assert passed, f"expected pass, got remediation={remediation!r}"


def test_pushed_to_remote_fails_with_no_upstream(repo, tmp_path):
    """A repo with no remote at all surfaces the upstream remediation."""
    set_dir = _make_session_set(repo)
    passed, remediation = gate_checks.check_pushed_to_remote(
        str(set_dir), None,
    )
    assert not passed
    assert "upstream" in remediation.lower()


def test_pushed_to_remote_fails_on_detached_head(repo_with_remote):
    """Detached HEAD surfaces the detached-HEAD remediation."""
    set_dir = _make_session_set(repo_with_remote)
    # Detach HEAD
    rev = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(repo_with_remote), capture_output=True, text=True, check=True,
    ).stdout.strip()
    subprocess.run(
        ["git", "checkout", "--detach", rev],
        cwd=str(repo_with_remote), check=True, capture_output=True,
    )
    passed, remediation = gate_checks.check_pushed_to_remote(
        str(set_dir), None,
    )
    assert not passed
    assert "detached" in remediation.lower()


def test_pushed_to_remote_surfaces_unpushed_commits(repo_with_remote):
    """A local commit that hasn't been pushed surfaces a 'run: git push' remediation."""
    set_dir = _make_session_set(repo_with_remote)
    (repo_with_remote / "new.txt").write_text("local change\n", encoding="utf-8")
    _git(repo_with_remote, "add", "new.txt")
    _git(repo_with_remote, "commit", "-m", "local commit")
    passed, remediation = gate_checks.check_pushed_to_remote(
        str(set_dir), None,
    )
    assert not passed
    assert "git push" in remediation


def test_pushed_to_remote_surfaces_non_fast_forward(repo_with_remote, tmp_path):
    """A non-fast-forward state surfaces a non-FF / rebase remediation."""
    set_dir = _make_session_set(repo_with_remote)
    # Push an unrelated commit to the remote from a fresh clone, then
    # diverge locally — that creates non-fast-forward state.
    fresh = tmp_path / "fresh-clone"
    bare = repo_with_remote.parent / (repo_with_remote.name + ".git")
    subprocess.run(
        ["git", "clone", str(bare), str(fresh)],
        check=True, capture_output=True,
    )
    _git(fresh, "config", "user.email", "fresh@example.invalid")
    _git(fresh, "config", "user.name", "Fresh")
    _git(fresh, "config", "commit.gpgsign", "false")
    (fresh / "remote-only.txt").write_text("remote\n", encoding="utf-8")
    _git(fresh, "add", "remote-only.txt")
    _git(fresh, "commit", "-m", "remote work")
    _git(fresh, "push", "origin", "main")

    # Now create a divergent commit locally (without pulling).
    (repo_with_remote / "local-only.txt").write_text("local\n", encoding="utf-8")
    _git(repo_with_remote, "add", "local-only.txt")
    _git(repo_with_remote, "commit", "-m", "local work")

    passed, remediation = gate_checks.check_pushed_to_remote(
        str(set_dir), None,
    )
    assert not passed
    # Could surface as non-fast-forward or rejected; both are acceptable.
    assert any(token in remediation.lower() for token in (
        "non-fast-forward", "rejected", "rebase", "git push",
    ))


# ---------------------------------------------------------------------------
# check_activity_log_entry
# ---------------------------------------------------------------------------

def test_activity_log_entry_passes_when_session_logged(set_dir_in_repo):
    passed, remediation = gate_checks.check_activity_log_entry(
        str(set_dir_in_repo), None,
    )
    assert passed, remediation


def test_activity_log_entry_fails_with_no_state(tmp_path):
    """Without session-state.json the check fails clearly."""
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    (set_dir / "activity-log.json").write_text(
        json.dumps({"entries": []}), encoding="utf-8",
    )
    passed, remediation = gate_checks.check_activity_log_entry(
        str(set_dir), None,
    )
    assert not passed
    assert "session-state.json" in remediation


def test_activity_log_entry_fails_when_log_missing(repo_with_remote):
    set_dir = _make_session_set(repo_with_remote)
    os.remove(set_dir / "activity-log.json")
    passed, remediation = gate_checks.check_activity_log_entry(
        str(set_dir), None,
    )
    assert not passed
    assert "activity-log.json" in remediation


def test_activity_log_entry_fails_when_no_matching_session(repo_with_remote):
    """A log with entries from a different session number is a fail."""
    set_dir = _make_session_set(
        repo_with_remote, current_session=2, total_sessions=4,
    )
    # Replace log with entries only from session 1.
    log = set_dir / "activity-log.json"
    data = json.loads(log.read_text(encoding="utf-8"))
    data["entries"] = [
        {
            "sessionNumber": 1,
            "stepNumber": 1,
            "stepKey": "session-1/work",
            "dateTime": "2026-04-30T01:00:00-04:00",
            "description": "old",
            "status": "complete",
            "routedApiCalls": [],
        }
    ]
    log.write_text(json.dumps(data, indent=2), encoding="utf-8")
    passed, remediation = gate_checks.check_activity_log_entry(
        str(set_dir), None,
    )
    assert not passed
    assert "session 2" in remediation


# ---------------------------------------------------------------------------
# check_next_orchestrator_present
# ---------------------------------------------------------------------------

def test_next_orchestrator_passes_for_final_session_without_field(repo_with_remote):
    """The final session legitimately has no next orchestrator."""
    set_dir = _make_session_set(
        repo_with_remote, current_session=4, total_sessions=4,
    )
    disp = Disposition(
        status="completed",
        summary="last",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    )
    passed, remediation = gate_checks.check_next_orchestrator_present(
        str(set_dir), disp,
    )
    assert passed, remediation


def test_next_orchestrator_fails_on_nonfinal_without_field(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=2, total_sessions=4,
    )
    disp = Disposition(
        status="completed",
        summary="ok",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    )
    passed, remediation = gate_checks.check_next_orchestrator_present(
        str(set_dir), disp,
    )
    assert not passed
    assert "next_orchestrator" in remediation


def test_next_orchestrator_fails_on_malformed_field(repo_with_remote):
    """A next_orchestrator with too-short specifics is rejected."""
    set_dir = _make_session_set(
        repo_with_remote, current_session=2, total_sessions=4,
    )
    bad = NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="too short",
        ),
    )
    disp = Disposition(
        status="completed",
        summary="ok",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=bad,
        blockers=[],
    )
    passed, remediation = gate_checks.check_next_orchestrator_present(
        str(set_dir), disp,
    )
    assert not passed
    assert "specifics" in remediation


def test_next_orchestrator_passes_with_valid_field(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=2, total_sessions=4,
    )
    disp = Disposition(
        status="completed",
        summary="ok",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    passed, remediation = gate_checks.check_next_orchestrator_present(
        str(set_dir), disp,
    )
    assert passed, remediation


# ---------------------------------------------------------------------------
# check_change_log_fresh
# ---------------------------------------------------------------------------

def test_change_log_fresh_skips_for_nonfinal_session(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=2, total_sessions=4,
    )
    passed, remediation = gate_checks.check_change_log_fresh(
        str(set_dir), None,
    )
    assert passed
    assert remediation == ""


def test_change_log_fresh_fails_when_missing_on_final(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=4, total_sessions=4,
    )
    passed, remediation = gate_checks.check_change_log_fresh(
        str(set_dir), None,
    )
    assert not passed
    assert "change-log.md" in remediation


def test_change_log_fresh_passes_when_mtime_after_started_at(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=4, total_sessions=4,
    )
    cl = set_dir / "change-log.md"
    cl.write_text("# Change Log\nSomething\n", encoding="utf-8")
    # Force mtime well after the session startedAt.
    future = (datetime.now() + timedelta(hours=1)).timestamp()
    os.utime(cl, (future, future))
    passed, remediation = gate_checks.check_change_log_fresh(
        str(set_dir), None,
    )
    assert passed, remediation


def test_change_log_fresh_passes_via_session_reference(repo_with_remote):
    """An old-mtime change-log still passes if it references the session."""
    set_dir = _make_session_set(
        repo_with_remote, current_session=4, total_sessions=4,
    )
    cl = set_dir / "change-log.md"
    cl.write_text(
        "# Change Log\n\nSession 4 of 4 wrapped up the close-out machinery.\n",
        encoding="utf-8",
    )
    # Backdate to before startedAt to force the content path.
    past = (datetime.now() - timedelta(days=7)).timestamp()
    os.utime(cl, (past, past))
    passed, remediation = gate_checks.check_change_log_fresh(
        str(set_dir), None,
    )
    assert passed, remediation


def test_change_log_fresh_fails_when_stale_and_no_reference(repo_with_remote):
    set_dir = _make_session_set(
        repo_with_remote, current_session=4, total_sessions=4,
    )
    cl = set_dir / "change-log.md"
    cl.write_text(
        "# Change Log\nThis is leftover content from session 1.\n",
        encoding="utf-8",
    )
    past = (datetime.now() - timedelta(days=7)).timestamp()
    os.utime(cl, (past, past))
    passed, remediation = gate_checks.check_change_log_fresh(
        str(set_dir), None,
    )
    assert not passed
    assert "session 4" in remediation


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def test_gate_checks_registry_order_is_stable():
    """The skeleton's documented gate order must be preserved."""
    assert tuple(name for name, _fn in gate_checks.GATE_CHECKS) == (
        "working_tree_clean",
        "pushed_to_remote",
        "activity_log_entry",
        "next_orchestrator_present",
        "change_log_fresh",
    )
