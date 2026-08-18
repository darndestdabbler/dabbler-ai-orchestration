import datetime
import subprocess

import pytest

from ai_router import ledger
from ai_router.evidence import snapshot_worktree_tree
from ai_router.gates import GateResult, run_gates
from ai_router.session import register_session_start
from tests.conftest import make_config


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def _record_round(repo, set_dir, *, blocking=False, round_number=1,
                  previous_tree=None, verdict=None):
    row = {
        "round": round_number,
        "verdict": verdict or ("ISSUES_FOUND" if blocking else "VERIFIED"),
        "blocking": blocking,
        "verifier_model": "gpt-5-4",
        "verifier_provider": "openai",
        "findings": [],
        "cost_usd": 0.05,
        "completion_tree": snapshot_worktree_tree(repo),
        "recorded_at": datetime.datetime.now().astimezone().isoformat(),
    }
    if previous_tree:
        row["previous_tree"] = previous_tree
    ledger.append_round(repo, set_dir.name, 1, row)
    return row


@pytest.fixture
def close_ready(sandbox_repo):
    """A session in the state a clean close expects: registered, work
    committed and pushed, one non-blocking verification round recorded."""
    repo, set_dir = sandbox_repo
    register_session_start(set_dir, 1, engine="claude-code",
                           provider="anthropic")
    (repo / "widget.py").write_text("WIDGET = 1\n", encoding="utf-8")
    _git(repo, "add", "widget.py")
    _git(repo, "commit", "-q", "-m", "work")
    _git(repo, "push", "-q")
    _record_round(repo, set_dir)
    return repo, set_dir


def by_name(results):
    return {r.name: r for r in results}


class TestCleanClose:
    def test_all_five_gates_pass(self, close_ready):
        repo, set_dir = close_ready
        results = by_name(run_gates(set_dir))
        assert len(results) == 5
        for name, result in results.items():
            assert result.passed, f"{name}: {result.remediation}"


class TestVerificationClean:
    def test_no_rounds_blocks_with_verify_command(self, sandbox_repo):
        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        results = by_name(run_gates(set_dir))
        row = results["verification_clean"]
        assert not row.passed
        assert "ai_router.verify" in row.remediation

    def test_blocking_round_blocks(self, close_ready):
        repo, set_dir = close_ready
        tree = snapshot_worktree_tree(repo)
        _record_round(repo, set_dir, blocking=True, round_number=2,
                      previous_tree=tree)
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert not row.passed
        assert "blocking finding" in row.remediation

    def test_work_changed_after_verification_blocks(self, close_ready):
        repo, set_dir = close_ready
        (repo / "widget.py").write_text("WIDGET = 2\n", encoding="utf-8")
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert not row.passed
        assert "changed after verification" in row.remediation

    def test_set_bookkeeping_changes_are_allowed(self, close_ready):
        repo, set_dir = close_ready
        # verify writes verdict + change-log after its final snapshot.
        (set_dir / "change-log.md").write_text("## s1\n", encoding="utf-8")
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert row.passed, row.remediation

    def test_hand_edited_state_file_blocks(self, close_ready):
        repo, set_dir = close_ready
        state_path = set_dir / "session-state.json"
        state_path.write_text(
            state_path.read_text(encoding="utf-8").replace(
                "in-progress", "complete"
            ),
            encoding="utf-8",
        )
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert not row.passed
        assert "out of band" in row.remediation

    def test_tampered_ledger_blocks(self, close_ready):
        repo, set_dir = close_ready
        path = ledger.rounds_path(repo, set_dir.name, 1)
        path.write_text(
            path.read_text(encoding="utf-8").replace(
                '"VERIFIED"', '"manual-override-development"'
            ),
            encoding="utf-8",
        )
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert not row.passed
        assert "failing closed" in row.remediation

    def test_closes_in_repo_that_never_ignored_the_ledger(self, sandbox_repo):
        """A project whose .gitignore lacks the .dabbler/ rule must still
        close. The round is written after the tree it describes, so
        counting it as work made every verified session unclosable no
        matter how many times it was re-verified."""
        repo, set_dir = sandbox_repo
        (repo / ".gitignore").write_text("__pycache__/\n", encoding="utf-8")
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        (repo / "widget.py").write_text("WIDGET = 1\n", encoding="utf-8")
        _record_round(repo, set_dir)
        # The orchestrator commits and pushes; the untracked ledger goes
        # along with it, exactly as -A would take it.
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "work")
        _git(repo, "push", "-q")
        results = by_name(run_gates(set_dir))
        for name, row in results.items():
            assert row.passed, f"{name}: {row.remediation}"


class TestWorkingTreeClean:
    def test_uncommitted_work_blocks_with_preview(self, close_ready):
        repo, set_dir = close_ready
        (repo / "stray.py").write_text("x\n", encoding="utf-8")
        row = by_name(run_gates(set_dir))["working_tree_clean"]
        assert not row.passed
        assert "stray.py" in row.remediation

    def test_modified_tracked_bookkeeping_first_line_ignored(self, close_ready):
        repo, set_dir = close_ready
        # A worktree-modified tracked file renders as " M path"; the leading
        # space is column-significant even when it opens the status output,
        # so the file must be tracked and nothing else may sort ahead of it.
        (set_dir / "activity-log.json").write_text("[]\n", encoding="utf-8")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "track bookkeeping")
        (set_dir / "activity-log.json").write_text("[{}]\n", encoding="utf-8")
        row = by_name(run_gates(set_dir))["working_tree_clean"]
        assert row.passed, row.remediation

    def test_editor_noise_ignored(self, close_ready):
        repo, set_dir = close_ready
        (repo / "notes.swp").write_text("x", encoding="utf-8")
        row = by_name(run_gates(set_dir))["working_tree_clean"]
        assert row.passed, row.remediation


class TestPushedToRemote:
    def test_unpushed_commit_blocks(self, close_ready):
        repo, set_dir = close_ready
        (repo / "more.py").write_text("y\n", encoding="utf-8")
        _git(repo, "add", "more.py")
        _git(repo, "commit", "-q", "-m", "more")
        row = by_name(run_gates(set_dir))["pushed_to_remote"]
        assert not row.passed
        assert "git push" in row.remediation

    def test_local_only_marker_waives_missing_upstream(self, tmp_path):
        repo = tmp_path / "solo"
        set_dir = repo / "docs" / "session-sets" / "010-demo"
        set_dir.mkdir(parents=True)
        (set_dir / "spec.md").write_text("# x\n", encoding="utf-8")
        _git(repo, "init", "-q", "-b", "main")
        _git(repo, "config", "user.email", "t@e.invalid")
        _git(repo, "config", "user.name", "T")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "seed")
        marker = repo / ".dabbler" / "local-only"
        marker.parent.mkdir()
        marker.write_text("reason: air-gapped\n", encoding="utf-8")
        row = by_name(run_gates(set_dir))["pushed_to_remote"]
        assert row.passed
        assert "waived" in row.remediation


class TestTestRunFresh:
    def test_malformed_suites_block(self, close_ready):
        repo, set_dir = close_ready
        config = make_config(testing={"suites": [{"nam": "typo"}]})
        row = by_name(run_gates(set_dir, config=config))["test_run_fresh"]
        assert not row.passed
        assert "malformed" in row.remediation

    def test_no_expensive_suites_pass(self, close_ready):
        repo, set_dir = close_ready
        config = make_config(testing={"suites": [
            {"name": "lint", "command": "ruff", "covers": ["."],
             "expensive": False},
        ]})
        row = by_name(run_gates(set_dir, config=config))["test_run_fresh"]
        assert row.passed

    def test_missing_run_of_record_blocks(self, close_ready):
        repo, set_dir = close_ready
        config = make_config(testing={"suites": [
            {"name": "pytest", "command": "pytest", "covers": ["."],
             "expensive": True},
        ]})
        row = by_name(run_gates(set_dir, config=config))["test_run_fresh"]
        assert not row.passed
        assert "no run of record" in row.remediation

    def test_fresh_green_record_passes(self, close_ready):
        from ai_router.test_evidence import SuiteSpec, record_run

        repo, set_dir = close_ready
        suite = SuiteSpec(name="pytest", command="pytest", covers=(".",),
                          expensive=True)
        record_run(set_dir, suite, "passed", duration_seconds=1.5)
        config = make_config(testing={"suites": [
            {"name": "pytest", "command": "pytest", "covers": ["."],
             "expensive": True},
        ]})
        row = by_name(run_gates(set_dir, config=config))["test_run_fresh"]
        assert row.passed, row.remediation

    def test_stale_digest_blocks(self, close_ready):
        from ai_router.test_evidence import SuiteSpec, record_run

        repo, set_dir = close_ready
        suite = SuiteSpec(name="pytest", command="pytest", covers=(".",),
                          expensive=True)
        record_run(set_dir, suite, "passed", duration_seconds=1.5)
        (repo / "widget.py").write_text("WIDGET = 3\n", encoding="utf-8")
        config = make_config(testing={"suites": [
            {"name": "pytest", "command": "pytest", "covers": ["."],
             "expensive": True},
        ]})
        row = by_name(run_gates(set_dir, config=config))["test_run_fresh"]
        assert not row.passed
        assert "PREDATES" in row.remediation


class TestCloseCommit:
    def test_close_leaves_a_clean_tree_and_never_commits_the_lock(
        self, close_ready
    ):
        from ai_router.session import close

        repo, set_dir = close_ready
        assert close(set_dir) == 0
        # The close held .lifecycle.lock while committing its bookkeeping;
        # sweeping the lock into that commit left a tracked deletion
        # behind after release — every close ended on a dirty tree.
        committed = _git(repo, "show", "--name-only", "--format=", "HEAD")
        assert ".lifecycle.lock" not in committed.stdout
        assert "session-state.json" in committed.stdout
        status = _git(repo, "status", "--porcelain", "-uall")
        assert status.stdout.strip() == ""


class TestVerdictVocabulary:
    def test_invented_state_token_blocks(self, close_ready):
        # Incident replay: a confabulated token must never survive to a
        # close even if it somehow reached the state file.
        import json

        repo, set_dir = close_ready
        state_path = set_dir / "session-state.json"
        state = json.loads(state_path.read_text(encoding="utf-8"))
        state["sessions"][0]["verificationVerdict"] = (
            "manual-override-development"
        )
        state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
        row = by_name(run_gates(set_dir))["verdict_vocabulary"]
        assert not row.passed
        assert "closed vocabulary" in row.remediation


class TestDriver:
    def test_crashing_gate_fails_closed(self, close_ready, monkeypatch):
        import ai_router.gates as gates_mod

        repo, set_dir = close_ready

        def boom(_set_dir):
            raise RuntimeError("kaboom")

        monkeypatch.setattr(
            gates_mod, "GATE_CHECKS",
            (("verification_clean", boom),) + gates_mod.GATE_CHECKS[1:],
        )
        row = by_name(run_gates(set_dir))["verification_clean"]
        assert not row.passed
        assert "kaboom" in row.remediation

    def test_force_skips_bookkeeping_never_evidence(self, sandbox_repo):
        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        results = by_name(run_gates(set_dir, forced=True))
        assert results["working_tree_clean"].passed  # skipped
        assert "skipped" in results["working_tree_clean"].remediation
        assert not results["verification_clean"].passed  # still enforced

    def test_results_are_typed_rows(self, close_ready):
        repo, set_dir = close_ready
        assert all(isinstance(r, GateResult) for r in run_gates(set_dir))
