"""
Tests for Set 076 gate check: waive push requirement for local-only repos.

A "local-only" repo is identified by the presence of a marker file at
`.dabbler/local-only` in the repository root.

If this marker is present AND the repository has no remotes configured, the
`check_pushed_to_remote` gate check will be waived, allowing work to proceed
without pushing to a remote.

If a remote is configured, the marker is ignored, and the standard push/upstream
checks apply.
"""
import json
import os
import pathlib
import subprocess

import pytest

import gate_checks
from session_state import register_session_start


def _git(repo_root, *args):
    """Run a git command in repo_root, raising on error."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed with exit code {result.returncode}:\n"
            f"STDOUT: {result.stdout}\n"
            f"STDERR: {result.stderr}"
        )
    return result


def _make_repo(root: pathlib.Path) -> pathlib.Path:
    """Initializes a git repository with a baseline commit."""
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "tester@example.com")
    _git(root, "config", "user.name", "Tester")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")
    return root


def _make_session_set(
    root, name="test-set", current_session=1, total_sessions=2
) -> pathlib.Path:
    """Creates a session set directory structure and state files."""
    set_dir = root / "docs" / "session-sets" / name
    set_dir.mkdir(parents=True, exist_ok=True)
    (set_dir / "spec.md").write_text("Test spec")

    register_session_start(
        session_set=str(set_dir),
        session_number=current_session,
        total_sessions=total_sessions,
        orchestrator_engine="claude",
        orchestrator_provider="anthropic",
    )

    activity_log_path = set_dir / f"{current_session:02d}" / "activity-log.json"
    activity_log_path.parent.mkdir(exist_ok=True)
    log_data = {
        "session_id": "test-session-id",
        "session_number": current_session,
        "total_sessions": total_sessions,
        "events": [{"timestamp": "2023-01-01T00:00:00Z", "type": "test"}],
    }
    activity_log_path.write_text(json.dumps(log_data))

    return set_dir


def _add_local_only_marker(repo_root: pathlib.Path):
    """Creates the .dabbler/local-only marker file."""
    marker_dir = repo_root / ".dabbler"
    marker_dir.mkdir(exist_ok=True)
    (marker_dir / "local-only").touch()


def _make_bare_remote(root: pathlib.Path) -> pathlib.Path:
    """Creates a bare git repository alongside the working copy."""
    bare_repo_path = root.parent / (root.name + ".git")
    _git(root.parent, "init", "--bare", str(bare_repo_path.name))
    return bare_repo_path


def test_is_local_only_true_with_marker(tmp_path):
    repo_root = tmp_path
    _add_local_only_marker(repo_root)
    assert gate_checks.is_local_only(repo_root) is True


def test_is_local_only_false_without_marker(tmp_path):
    repo_root = tmp_path
    assert gate_checks.is_local_only(repo_root) is False


def test_is_local_only_falsy_root_returns_false():
    assert gate_checks.is_local_only(None) is False
    assert gate_checks.is_local_only("") is False


def test_check_pushed_to_remote_waived_for_local_only_repo(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    _make_repo(repo_root)
    _add_local_only_marker(repo_root)
    session_set_dir = _make_session_set(repo_root)

    passed, remediation = gate_checks.check_pushed_to_remote(session_set_dir, "passed")

    assert passed is True
    assert "local-only" in remediation
    assert "push gate waived" in remediation


def test_check_pushed_to_remote_not_waived_if_remote_exists(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    _make_repo(repo_root)
    bare_repo = _make_bare_remote(repo_root)
    _git(repo_root, "remote", "add", "origin", str(bare_repo))
    _add_local_only_marker(repo_root)
    session_set_dir = _make_session_set(repo_root)

    passed, remediation = gate_checks.check_pushed_to_remote(session_set_dir, "passed")

    assert passed is False
    assert "upstream" in remediation


def test_check_pushed_to_remote_fails_with_no_remote_and_no_marker(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    _make_repo(repo_root)
    session_set_dir = _make_session_set(repo_root)

    passed, remediation = gate_checks.check_pushed_to_remote(session_set_dir, "passed")

    assert passed is False
    assert "upstream" in remediation


def test_has_remote_helper(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    _make_repo(repo_root)

    assert gate_checks._has_remote(repo_root) is False

    bare_repo = _make_bare_remote(repo_root)
    _git(repo_root, "remote", "add", "origin", str(bare_repo))

    assert gate_checks._has_remote(repo_root) is True