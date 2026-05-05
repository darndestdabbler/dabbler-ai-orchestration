"""Tests for ai_router/worktree.py.

Uses real git via subprocess + tempfile.TemporaryDirectory fixtures
(no mocking) — matches the existing test pattern in this codebase.

Test groups follow the GPT-5.4-Medium tests-must-cover checklist
from the design synthesis (see Set 017 design.md):

- Primary-worktree resolution from inside a linked worktree
- Windows path-format handling
- Destructive-step ordering on close (worktree → remote → local)
- Error-message clarity (recovery commands embedded in errors)
- Edge states: missing origin/HEAD, detached HEAD, branch/path
  collisions, purely-local branch with no upstream
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import textwrap
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from typing import Iterator
from unittest.mock import patch

import pytest

# Bare-filename import is the test convention (per conftest.py)
import worktree
from worktree import (
    CloseabilityReport,
    WorktreeInfo,
    assess_closeability,
    canonical_worktree_path,
    default_branch,
    enumerate_worktrees,
    find_primary_worktree_root,
    main,
)


# ======================================================================
# Helpers + fixtures
# ----------------------------------------------------------------------

def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run git in a repo. Helper for fixture setup."""
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=check,
    )


def _init_repo(repo_path: Path, *, default_branch_name: str = "main") -> None:
    """Initialize a git repo with a single commit on `default_branch_name`."""
    repo_path.mkdir(parents=True, exist_ok=True)
    _git(repo_path, "init", "-b", default_branch_name)
    _git(repo_path, "config", "user.email", "test@example.com")
    _git(repo_path, "config", "user.name", "Test User")
    (repo_path / "README.md").write_text("seed\n")
    _git(repo_path, "add", "README.md")
    _git(repo_path, "commit", "-m", "seed")


def _init_repo_with_origin(
    repo_path: Path,
    bare_remote_path: Path,
    *,
    default_branch_name: str = "main",
) -> None:
    """Init a repo with a bare-clone remote at bare_remote_path. Pushes initial commit + sets origin/HEAD."""
    _init_repo(repo_path, default_branch_name=default_branch_name)
    bare_remote_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init", "--bare", str(bare_remote_path)],
        check=True, capture_output=True, text=True,
    )
    _git(repo_path, "remote", "add", "origin", str(bare_remote_path))
    _git(repo_path, "push", "-u", "origin", default_branch_name)
    # Set origin/HEAD so default_branch() can resolve it
    _git(repo_path, "remote", "set-head", "origin", default_branch_name)


@pytest.fixture
def tmp_repo() -> Iterator[Path]:
    """A primary worktree only, no remote."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = Path(tmp) / "myrepo"
        _init_repo(repo)
        yield repo


@pytest.fixture
def tmp_repo_with_origin() -> Iterator[Path]:
    """A primary worktree with a configured origin (bare clone in same parent)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        repo = tmp_path / "myrepo"
        bare = tmp_path / "myrepo.git"  # bare remote
        _init_repo_with_origin(repo, bare)
        yield repo


@pytest.fixture
def tmp_repo_with_canonical_worktree(tmp_repo_with_origin: Path) -> Path:
    """tmp_repo_with_origin + one canonical worktree at <repo>-worktrees/foo on session-set/foo."""
    repo = tmp_repo_with_origin
    container = repo.parent / f"{repo.name}-worktrees"
    target = container / "foo"
    container.mkdir(exist_ok=True)
    _git(repo, "worktree", "add", "-b", "session-set/foo", str(target), "main")
    return repo


@pytest.fixture
def tmp_repo_with_drift_worktree(tmp_repo: Path) -> Path:
    """tmp_repo + one drift worktree at .claude/worktrees/old-session."""
    drift_path = tmp_repo / ".claude" / "worktrees" / "old-session"
    drift_path.parent.mkdir(parents=True, exist_ok=True)
    _git(tmp_repo, "worktree", "add", "-b", "old-branch", str(drift_path), "main")
    return tmp_repo


# ======================================================================
# 1. find_primary_worktree_root
# ----------------------------------------------------------------------

class TestFindPrimaryWorktreeRoot:

    def test_from_primary_worktree(self, tmp_repo: Path) -> None:
        result = find_primary_worktree_root(tmp_repo)
        assert result.resolve() == tmp_repo.resolve()

    def test_from_canonical_linked_worktree(self, tmp_repo_with_canonical_worktree: Path) -> None:
        """The GPT-flagged edge case: invoking from inside a linked worktree must still resolve to the primary."""
        canonical = tmp_repo_with_canonical_worktree.parent / f"{tmp_repo_with_canonical_worktree.name}-worktrees" / "foo"
        result = find_primary_worktree_root(canonical)
        assert result.resolve() == tmp_repo_with_canonical_worktree.resolve()

    def test_from_drift_worktree(self, tmp_repo_with_drift_worktree: Path) -> None:
        """Drift worktrees still share the same primary; resolution must work."""
        drift = tmp_repo_with_drift_worktree / ".claude" / "worktrees" / "old-session"
        result = find_primary_worktree_root(drift)
        assert result.resolve() == tmp_repo_with_drift_worktree.resolve()

    def test_outside_repo_raises(self, tmp_path: Path) -> None:
        with pytest.raises(RuntimeError, match="Not in a git repository"):
            find_primary_worktree_root(tmp_path)


# ======================================================================
# 2. canonical_worktree_path
# ----------------------------------------------------------------------

class TestCanonicalWorktreePath:

    def test_basic(self) -> None:
        # Use a constructed path that's portable across Windows/POSIX
        primary = Path("repos") / "myrepo"
        result = canonical_worktree_path(primary, "foo")
        # The exact resolved form is OS-dependent; check structure instead
        assert result.name == "foo"
        assert result.parent.name == "myrepo-worktrees"
        assert result.parent.parent.name == "repos"

    def test_preserves_repo_name(self) -> None:
        primary = Path("/c/Users/dev/source/repos/dabbler-access-harvester")
        result = canonical_worktree_path(primary, "vba-symbol-resolution-session-1")
        assert result.name == "vba-symbol-resolution-session-1"
        assert result.parent.name == "dabbler-access-harvester-worktrees"


# ======================================================================
# 3. default_branch
# ----------------------------------------------------------------------

class TestDefaultBranch:

    def test_resolves_origin_head_when_set(self, tmp_repo_with_origin: Path) -> None:
        assert default_branch(tmp_repo_with_origin) == "main"

    def test_falls_back_to_local_main(self, tmp_repo: Path) -> None:
        # tmp_repo has no origin configured but does have a 'main' branch
        assert default_branch(tmp_repo) == "main"

    def test_falls_back_to_local_master(self, tmp_path: Path) -> None:
        repo = tmp_path / "master_repo"
        _init_repo(repo, default_branch_name="master")
        assert default_branch(repo) == "master"

    def test_raises_when_neither_main_nor_master_exists(self, tmp_path: Path) -> None:
        repo = tmp_path / "weird_repo"
        _init_repo(repo, default_branch_name="develop")
        with pytest.raises(RuntimeError, match="git remote set-head"):
            default_branch(repo)


# ======================================================================
# 4. enumerate_worktrees
# ----------------------------------------------------------------------

class TestEnumerateWorktrees:

    def test_main_only(self, tmp_repo: Path) -> None:
        worktrees = enumerate_worktrees(tmp_repo)
        assert len(worktrees) == 1
        wt = worktrees[0]
        assert wt.is_main
        assert wt.classification == "main"
        assert wt.branch == "main"
        assert wt.slug is None
        assert wt.issues == ()

    def test_canonical_worktree_classified(self, tmp_repo_with_canonical_worktree: Path) -> None:
        worktrees = enumerate_worktrees(tmp_repo_with_canonical_worktree)
        canonical = [w for w in worktrees if w.classification == "canonical"]
        assert len(canonical) == 1
        wt = canonical[0]
        assert wt.slug == "foo"
        assert wt.branch == "session-set/foo"
        assert wt.branch_matches_convention is True
        assert wt.issues == ()

    def test_drift_worktree_classified_with_issue(
        self, tmp_repo_with_drift_worktree: Path,
    ) -> None:
        worktrees = enumerate_worktrees(tmp_repo_with_drift_worktree)
        drift = [w for w in worktrees if w.classification == "drift"]
        assert len(drift) == 1
        wt = drift[0]
        assert wt.slug is None
        assert wt.branch == "old-branch"
        assert wt.branch_matches_convention is False
        assert any("Non-canonical path" in issue for issue in wt.issues)

    def test_canonical_worktree_with_wrong_branch_name_flagged(
        self, tmp_repo_with_origin: Path,
    ) -> None:
        """Canonical PATH but non-canonical BRANCH name should be flagged."""
        repo = tmp_repo_with_origin
        container = repo.parent / f"{repo.name}-worktrees"
        target = container / "bar"
        container.mkdir(exist_ok=True)
        _git(repo, "worktree", "add", "-b", "wrong-name", str(target), "main")

        worktrees = enumerate_worktrees(repo)
        canonical_bar = [w for w in worktrees if w.path == target.resolve()]
        assert len(canonical_bar) == 1
        wt = canonical_bar[0]
        assert wt.classification == "canonical"
        assert wt.slug == "bar"
        assert wt.branch_matches_convention is False
        assert any("does not match convention" in issue for issue in wt.issues)


# ======================================================================
# 5. assess_closeability
# ----------------------------------------------------------------------

class TestAssessCloseability:

    def test_clean_worktree_is_closeable(self, tmp_repo: Path) -> None:
        report = assess_closeability(tmp_repo, base_ref="main")
        assert report.closeable is True
        assert report.dirty is False
        assert report.unmerged is False
        assert report.unpushed is False
        assert report.has_upstream is False  # no origin in tmp_repo

    def test_dirty_blocks_close(self, tmp_repo: Path) -> None:
        (tmp_repo / "scratch.txt").write_text("uncommitted\n")
        report = assess_closeability(tmp_repo, base_ref="main")
        assert report.closeable is False
        assert report.dirty is True
        assert any("uncommitted" in r for r in report.blocking_reasons)

    def test_unmerged_commits_block_close(self, tmp_repo: Path) -> None:
        # Create a branch ahead of main
        _git(tmp_repo, "checkout", "-b", "feature")
        (tmp_repo / "feature.txt").write_text("new\n")
        _git(tmp_repo, "add", "feature.txt")
        _git(tmp_repo, "commit", "-m", "feature work")

        report = assess_closeability(tmp_repo, base_ref="main")
        assert report.closeable is False
        assert report.unmerged is True
        assert any("not merged into main" in r for r in report.blocking_reasons)

    def test_unpushed_commits_block_close_when_upstream_set(
        self, tmp_repo_with_origin: Path,
    ) -> None:
        repo = tmp_repo_with_origin
        # Make a commit AFTER the initial push so HEAD is ahead of upstream
        (repo / "extra.txt").write_text("more\n")
        _git(repo, "add", "extra.txt")
        _git(repo, "commit", "-m", "extra")

        report = assess_closeability(repo, base_ref="main")
        assert report.has_upstream is True
        assert report.unpushed is True
        assert report.closeable is False
        assert any("not pushed" in r for r in report.blocking_reasons)

    def test_no_upstream_fails_open_on_unpushed(self, tmp_repo: Path) -> None:
        """The fail-open semantics: purely-local branches aren't 'unpushed' by definition."""
        # tmp_repo has no origin → no upstream tracking → unpushed must be False
        report = assess_closeability(tmp_repo, base_ref="main")
        assert report.has_upstream is False
        assert report.unpushed is False
        # And closeable should be True (clean + zero unmerged + fail-open unpushed)
        assert report.closeable is True


# ======================================================================
# 6. CLI: open
# ----------------------------------------------------------------------

class TestOpenCommand:

    def _run_cli(self, args: list[str], cwd: Path) -> tuple[int, str, str]:
        """Run the CLI main() with cwd patched. Returns (exit_code, stdout, stderr)."""
        out = io.StringIO()
        err = io.StringIO()
        with patch("worktree.Path.cwd", return_value=cwd):
            with redirect_stdout(out), redirect_stderr(err):
                exit_code = main(args)
        return exit_code, out.getvalue(), err.getvalue()

    def test_open_creates_canonical_worktree(self, tmp_repo_with_origin: Path) -> None:
        repo = tmp_repo_with_origin
        exit_code, stdout, _ = self._run_cli(["open", "alpha"], cwd=repo)
        assert exit_code == 0

        target = repo.parent / f"{repo.name}-worktrees" / "alpha"
        assert target.exists()
        assert "Worktree opened" in stdout
        # Verify branch exists with canonical name
        branch_check = _git(repo, "branch", "--list", "session-set/alpha")
        assert "session-set/alpha" in branch_check.stdout

    def test_open_creates_container_dir(self, tmp_repo_with_origin: Path) -> None:
        repo = tmp_repo_with_origin
        container = repo.parent / f"{repo.name}-worktrees"
        assert not container.exists()
        self._run_cli(["open", "alpha"], cwd=repo)
        assert container.exists() and container.is_dir()

    def test_open_refuses_existing_target_path(self, tmp_repo_with_origin: Path) -> None:
        repo = tmp_repo_with_origin
        target = repo.parent / f"{repo.name}-worktrees" / "alpha"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.mkdir()  # pre-existing junk at target
        exit_code, _, stderr = self._run_cli(["open", "alpha"], cwd=repo)
        assert exit_code == 1
        assert "target path already exists" in stderr

    def test_open_refuses_existing_slug(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        # Slug 'foo' already has a canonical worktree in this fixture, so
        # both the path-exists check AND the registered-slug check would
        # fire. Either is a valid refusal; verify the error says so clearly.
        exit_code, _, stderr = self._run_cli(
            ["open", "foo"],
            cwd=tmp_repo_with_canonical_worktree,
        )
        assert exit_code == 1
        # Accept either message since both are correct (path exists OR slug already registered)
        assert (
            "already exists" in stderr
            or "already registered" in stderr
        )

    def test_open_with_explicit_base(self, tmp_repo_with_origin: Path) -> None:
        repo = tmp_repo_with_origin
        # Create a side branch to use as base
        _git(repo, "branch", "side", "main")
        exit_code, _, _ = self._run_cli(
            ["open", "from-side", "--base", "side"], cwd=repo,
        )
        assert exit_code == 0

    def test_open_when_branch_exists_attaches_rather_than_recreates(
        self, tmp_repo_with_origin: Path,
    ) -> None:
        repo = tmp_repo_with_origin
        # Pre-create the branch (but no worktree for it)
        _git(repo, "branch", "session-set/preexisting", "main")
        exit_code, _, _ = self._run_cli(["open", "preexisting"], cwd=repo)
        assert exit_code == 0
        target = repo.parent / f"{repo.name}-worktrees" / "preexisting"
        assert target.exists()


# ======================================================================
# 7. CLI: close
# ----------------------------------------------------------------------

class TestCloseCommand:

    def _run_cli(self, args: list[str], cwd: Path, stdin: str = "") -> tuple[int, str, str]:
        out = io.StringIO()
        err = io.StringIO()
        stdin_io = io.StringIO(stdin)
        with patch("worktree.Path.cwd", return_value=cwd):
            with patch("sys.stdin", stdin_io):
                with redirect_stdout(out), redirect_stderr(err):
                    exit_code = main(args)
        return exit_code, out.getvalue(), err.getvalue()

    def test_clean_close_removes_worktree_and_branch(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        exit_code, stdout, _ = self._run_cli(["close", "foo"], cwd=repo)
        assert exit_code == 0
        target = repo.parent / f"{repo.name}-worktrees" / "foo"
        assert not target.exists()
        # Branch should be gone
        branches = _git(repo, "branch", "--list", "session-set/foo").stdout.strip()
        assert branches == ""
        assert "Worktree removed" in stdout
        assert "Local branch deleted" in stdout

    def test_clean_close_removes_empty_container(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        container = repo.parent / f"{repo.name}-worktrees"
        assert container.exists()  # fixture pre-state
        self._run_cli(["close", "foo"], cwd=repo)
        # Container should be removed since it's empty after close
        assert not container.exists()

    def test_keep_branch_preserves_local_branch(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        exit_code, _, _ = self._run_cli(
            ["close", "foo", "--keep-branch"], cwd=repo,
        )
        assert exit_code == 0
        # Branch should still exist
        branches = _git(repo, "branch", "--list", "session-set/foo").stdout
        assert "session-set/foo" in branches

    def test_close_refuses_dirty_worktree_with_cancel_session_pointer(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        target = repo.parent / f"{repo.name}-worktrees" / "foo"
        # Dirty up the worktree
        (target / "scratch.txt").write_text("uncommitted\n")
        exit_code, _, stderr = self._run_cli(["close", "foo"], cwd=repo)
        assert exit_code == 1
        # Error message clarity check: must point to cancel_session
        assert "cancel_session foo" in stderr
        assert "uncommitted" in stderr.lower()

    def test_close_refuses_unmerged_worktree(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        target = repo.parent / f"{repo.name}-worktrees" / "foo"
        # Make a commit on the branch so it's ahead of main
        (target / "feature.txt").write_text("work\n")
        _git(target, "add", "feature.txt")
        _git(target, "commit", "-m", "feature work")
        # The unpushed check fails open since no upstream is configured.
        # Unmerged-vs-main remains the blocker.
        exit_code, _, stderr = self._run_cli(["close", "foo"], cwd=repo)
        assert exit_code == 1
        assert "not merged" in stderr.lower()

    def test_close_refuses_when_path_not_canonical_registered(self, tmp_repo: Path) -> None:
        # No canonical worktree exists; close should fail with helpful message
        exit_code, _, stderr = self._run_cli(["close", "nonexistent"], cwd=tmp_repo)
        assert exit_code == 1
        assert "no worktree at canonical path" in stderr.lower()

    def test_close_ordering_preserves_local_branch_on_remote_failure(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        """The Q4 ordering decision: worktree → remote → local. If remote fails, local survives.

        Simulated by running --delete-remote + answering 'yes' to confirm,
        then deleting the remote branch out from under the test BEFORE close runs
        — except git's "remote ref does not exist" should be treated as already-absent
        (silent success). So instead we test by detaching the remote.
        """
        repo = tmp_repo_with_canonical_worktree
        # Make foo's branch reachable from origin so we have something to "delete"
        target = repo.parent / f"{repo.name}-worktrees" / "foo"
        _git(target, "push", "-u", "origin", "session-set/foo")

        # Now break the remote URL so the push --delete will fail with auth/network-style error
        _git(repo, "remote", "set-url", "origin", "/nonexistent/path/remote.git")

        exit_code, stdout, stderr = self._run_cli(
            ["close", "foo", "--delete-remote"], cwd=repo, stdin="y\n",
        )
        # Expected: worktree removed, remote-delete fails, local branch preserved, exit=2
        assert exit_code == 2
        assert "[partial]" in stderr
        assert "local branch kept" in stderr.lower()
        # Local branch should STILL exist (the recovery anchor)
        branches = _git(repo, "branch", "--list", "session-set/foo").stdout
        assert "session-set/foo" in branches
        # Worktree removal should still have happened
        assert not target.exists()


# ======================================================================
# 8. CLI: list
# ----------------------------------------------------------------------

class TestListCommand:

    def _run_cli(self, args: list[str], cwd: Path) -> tuple[int, str, str]:
        out = io.StringIO()
        err = io.StringIO()
        with patch("worktree.Path.cwd", return_value=cwd):
            with redirect_stdout(out), redirect_stderr(err):
                exit_code = main(args)
        return exit_code, out.getvalue(), err.getvalue()

    def test_human_output_shows_main_only(self, tmp_repo: Path) -> None:
        exit_code, stdout, _ = self._run_cli(["list"], cwd=tmp_repo)
        assert exit_code == 0
        assert "[main]" in stdout
        assert "[canonical]" not in stdout
        assert "[drift]" not in stdout

    def test_human_output_uses_relative_paths(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        exit_code, stdout, _ = self._run_cli(["list"], cwd=repo)
        assert exit_code == 0
        # main shows as "."
        assert "[main]" in stdout
        # canonical shows as "../<repo>-worktrees/foo"
        assert f"../{repo.name}-worktrees/foo" in stdout
        # No absolute paths in human output
        assert "C:\\" not in stdout
        # The full primary_root absolute path shouldn't appear (sanity check)
        assert str(repo) not in stdout

    def test_human_output_flags_drift_with_summary(
        self, tmp_repo_with_drift_worktree: Path,
    ) -> None:
        exit_code, stdout, _ = self._run_cli(
            ["list"], cwd=tmp_repo_with_drift_worktree,
        )
        assert exit_code == 0
        assert "[drift]" in stdout
        assert "1 worktree(s) at non-canonical paths" in stdout

    def test_json_output_schema_v1(self, tmp_repo_with_canonical_worktree: Path) -> None:
        exit_code, stdout, _ = self._run_cli(
            ["list", "--json"], cwd=tmp_repo_with_canonical_worktree,
        )
        assert exit_code == 0
        payload = json.loads(stdout)
        assert payload["schema_version"] == 1
        # Top-level structure
        assert set(payload.keys()) == {"schema_version", "repo", "counts", "worktrees"}
        # repo block
        assert set(payload["repo"].keys()) == {
            "primary_root", "repo_name", "parent_dir", "canonical_worktrees_dir",
        }
        # counts has the three classifications
        assert set(payload["counts"].keys()) == {"main", "canonical", "drift"}
        assert payload["counts"]["main"] == 1
        assert payload["counts"]["canonical"] == 1
        # Each worktree entry has the full schema
        for wt in payload["worktrees"]:
            assert set(wt.keys()) == {
                "path", "head", "branch", "classification", "is_main",
                "slug", "expected_canonical_path", "branch_matches_convention",
                "locked", "detached", "prunable", "issues",
            }

    def test_json_output_uses_forward_slashes_for_cross_platform(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        exit_code, stdout, _ = self._run_cli(
            ["list", "--json"], cwd=tmp_repo_with_canonical_worktree,
        )
        payload = json.loads(stdout)
        # Path values should use forward slashes (Windows backslashes normalized)
        for wt in payload["worktrees"]:
            assert "\\" not in wt["path"]
        assert "\\" not in payload["repo"]["primary_root"]


# ======================================================================
# 9. Cross-cutting: error message clarity
# ----------------------------------------------------------------------

class TestErrorMessageClarity:
    """The Q6 tests-must-cover checklist: error messages contain
    specific recovery commands, not generic 'something failed' text."""

    def _run_cli(self, args: list[str], cwd: Path) -> tuple[int, str, str]:
        out = io.StringIO()
        err = io.StringIO()
        with patch("worktree.Path.cwd", return_value=cwd):
            with redirect_stdout(out), redirect_stderr(err):
                exit_code = main(args)
        return exit_code, out.getvalue(), err.getvalue()

    def test_close_dirty_error_contains_cancel_session_command(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        repo = tmp_repo_with_canonical_worktree
        target = repo.parent / f"{repo.name}-worktrees" / "foo"
        (target / "scratch.txt").write_text("uncommitted\n")
        _, _, stderr = self._run_cli(["close", "foo"], cwd=repo)
        assert "python -m ai_router.cancel_session foo" in stderr

    def test_open_existing_path_error_contains_remediation(
        self, tmp_repo_with_canonical_worktree: Path,
    ) -> None:
        # Adding `foo` again should fail with actionable guidance
        # (either pointing to `list` to inspect, `close` to clean up,
        # or naming the conflict directly).
        _, _, stderr = self._run_cli(
            ["open", "foo"], cwd=tmp_repo_with_canonical_worktree,
        )
        # Recovery guidance must be present: list, close, or "remove the stale dir"
        assert any(
            phrase in stderr
            for phrase in [
                "ai_router.worktree list",
                "ai_router.worktree close",
                "remove the stale dir",
                "already registered",
            ]
        ), f"Expected actionable recovery guidance in: {stderr!r}"
