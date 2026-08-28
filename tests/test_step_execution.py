import copy
import subprocess

import pytest

from ai_router import ledger
from ai_router.approved_plan import approve_plan, new_plan, write_plan
from ai_router.bootstrap import ensure_commit_guard
from ai_router.session import register_session_start
from ai_router.verify import (
    EXIT_BLOCKING,
    EXIT_OK,
    EXIT_USAGE,
    run_step_amend,
    run_step_close,
    run_step_guard_commit,
    run_step_open,
)

# The sandbox spec's one non-ceremony goal for session 1; a plan step that
# answered no goal would be refused by the plan reviewer, not by anything
# under test here.
STEP_ID = "build-the-widget"
OTHER_STEP_ID = "polish-the-widget"

_SELECTION = {
    "smoke": [],
    "repo_wide": [],
    "rules": [{"when": "widget.py", "select": ["tests/test_widget.py"]}],
}

# Where the tests are is a suite's declaration now, so a config that says
# nothing else still has to name a suite for a path to be a test at all.
_SCOPE_SUITE = {
    "name": "python",
    "command": 'python -c ""',
    "covers": ["tests/"],
    "test_roots": ["tests"],
    "test_glob": "test_*.py",
}


def config_with(**testing) -> dict:
    """A config declaring only what the step pass reads. The one suite exists
    because a test file is a test only if some suite says so; its command is
    a no-op, which is what keeps a test of the step boundary from running a
    real test suite."""
    testing.setdefault("suites", [copy.deepcopy(_SCOPE_SUITE)])
    return {"testing": {"selection": copy.deepcopy(_SELECTION), **testing}}


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def _step(step_id, envelope):
    return {
        "step_id": step_id,
        "intent": f"Do {step_id}.",
        "file_envelope": list(envelope),
        "evidence_contract": [
            {"description": "the widget's targeted tests pass",
             "kind": "deterministic"},
        ],
        "risk_flags": [],
    }


@pytest.fixture
def planned(sandbox_repo, monkeypatch):
    """A registered session whose approved plan declares two steps, and a
    config the deterministic pass can read without running anything."""
    repo, sessions_dir = sandbox_repo
    register_session_start(sessions_dir, 1, engine="claude-code",
                           provider="anthropic")
    run_dir = ledger.session_run_dir(repo, 1)
    write_plan(run_dir, new_plan(1, "first-things", [
        _step(STEP_ID, ["widget.py"]),
        _step(OTHER_STEP_ID, ["polish.py"]),
    ]), workspace_root=repo)
    approve_plan(run_dir)

    def use(config):
        monkeypatch.setattr(
            "ai_router.config.load_config", lambda *a, **k: config
        )

    use(config_with())
    return repo, sessions_dir, use


class TestOpen:
    def test_refuses_a_second_step_while_one_is_in_flight(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        assert run_step_open(sessions_dir, step_id=STEP_ID) == EXIT_OK
        assert run_step_open(sessions_dir, step_id=OTHER_STEP_ID) == EXIT_USAGE
        assert STEP_ID in capsys.readouterr().err
        assert ledger.open_step(repo, 1)["step_id"] == STEP_ID

    def test_refuses_a_step_the_plan_does_not_declare(self, planned, capsys):
        repo, sessions_dir, _ = planned
        assert run_step_open(sessions_dir, step_id="invent-a-step") == EXIT_USAGE
        assert "not declared" in capsys.readouterr().err
        assert ledger.open_step(repo, 1) is None

    def test_refuses_an_unapproved_plan(self, sandbox_repo, capsys):
        repo, sessions_dir = sandbox_repo
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        run_dir = ledger.session_run_dir(repo, 1)
        write_plan(run_dir, new_plan(1, "first-things",
                                     [_step(STEP_ID, ["widget.py"])]),
                   workspace_root=repo)
        assert run_step_open(sessions_dir, step_id=STEP_ID) != EXIT_OK
        assert "not approved" in capsys.readouterr().err


class TestEnvelope:
    def test_a_write_outside_the_envelope_refuses_the_close(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        (repo / "rogue.py").write_text("r = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        err = capsys.readouterr().err
        assert "rogue.py" in err
        assert "amendment requirement, not a warning" in err
        assert ledger.open_step(repo, 1)["step_id"] == STEP_ID

    def test_the_envelope_is_the_step_s_own_not_the_plan_s_union(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        run_step_open(sessions_dir, step_id=STEP_ID)
        # Declared by the plan -- but by the other step, which is not in
        # flight. A step that inherited its neighbours' reach would make a
        # seven-step plan one envelope with seven names.
        (repo / "polish.py").write_text("p = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "polish.py" in capsys.readouterr().err

    def test_an_approved_amendment_widens_the_envelope(
        self, planned, monkeypatch
    ):
        repo, sessions_dir, _ = planned
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        (repo / "helper.py").write_text("h = 1\n", encoding="utf-8")
        assert run_step_close(sessions_dir) == EXIT_BLOCKING

        monkeypatch.setattr(
            "ai_router.plan_review._default_dispatch",
            lambda prompt, **kw: _Reviewed(
                f"STEP: {STEP_ID}\nVERDICT: approve\nWHY: the widening is "
                "the work the goal asked for.\n"
            ),
        )
        assert run_step_amend(
            sessions_dir, reason="the widget needs a helper",
            added_files=["helper.py"],
        ) == EXIT_OK
        assert run_step_close(sessions_dir) == EXIT_OK
        assert ledger.open_step(repo, 1) is None

    def test_a_closed_step_s_paths_do_not_refuse_the_next_step(self, planned):
        repo, sessions_dir, _ = planned
        # Nothing commits between the two steps, so step B opens on the
        # same commit and sees step A's work still in the tree. A plan
        # whose second step is refused for its first step's files could
        # never execute past one step.
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        assert run_step_close(sessions_dir) == EXIT_OK

        run_step_open(sessions_dir, step_id=OTHER_STEP_ID)
        (repo / "polish.py").write_text("p = 1\n", encoding="utf-8")
        assert run_step_close(sessions_dir) == EXIT_OK

        closed = ledger.read_step_events(repo, 1)[-1]
        assert closed["envelope"]["inside"] == ["polish.py"]
        assert ledger.closed_step_ids(repo, 1) == [
            STEP_ID, OTHER_STEP_ID,
        ]

    def test_editing_a_closed_step_s_file_again_is_outside_this_envelope(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        assert run_step_close(sessions_dir) == EXIT_OK

        # An earlier step having declared widget.py is not a licence for
        # this one to keep editing it: the second edit is the open step's
        # work, and the open step never declared the path.
        run_step_open(sessions_dir, step_id=OTHER_STEP_ID)
        (repo / "polish.py").write_text("p = 1\n", encoding="utf-8")
        (repo / "widget.py").write_text("w = 2\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "widget.py" in capsys.readouterr().err
        assert ledger.closed_step_ids(repo, 1) == [STEP_ID]


class _Reviewed:
    """What a plan-review dispatch returns: content plus the attribution
    the round records."""

    def __init__(self, content):
        self.content = content
        self.model_name = "cheap"
        self.provider = "openai"
        self.transport = "api"


class TestDeterministicPass:
    def test_a_red_required_control_returns_before_the_step_closes(
        self, planned, capsys
    ):
        repo, sessions_dir, use = planned
        use(config_with(controls=[{
            "kind": "lint",
            "command": 'python -c "raise SystemExit(1)"',
            "required": True,
        }]))
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "lint" in capsys.readouterr().err
        assert ledger.open_step(repo, 1)["step_id"] == STEP_ID

    def test_the_closed_record_carries_the_step_s_own_targeted_run(
        self, planned
    ):
        repo, sessions_dir, use = planned
        use(config_with(suites=[{
            "name": "python",
            "command": 'python -c ""',
            "covers": ["widget.py"],
            "expensive": True,
        }]))
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_OK
        closed = ledger.read_step_events(repo, 1)[-1]
        assert closed["event"] == "closed"
        assert closed["envelope"]["inside"] == ["widget.py"]
        tests = [r for r in closed["deterministic"] if r["kind"] == "tests"]
        assert [r["status"] for r in tests] == ["pass"]
        assert "tests/test_widget.py" in tests[0]["command"]
        assert ledger.closed_step_ids(repo, 1) == [STEP_ID]

    def test_an_artifact_a_control_writes_outside_the_envelope_refuses(
        self, planned, capsys
    ):
        repo, sessions_dir, use = planned
        # The envelope is checked before these commands run, so a control
        # that drops a report into the repo would otherwise have its
        # artifact snapshotted into the record and inherited by the next
        # step as already accounted for.
        use(config_with(controls=[{
            "kind": "lint",
            "command": (
                'python -c "import pathlib; '
                "pathlib.Path('report.json').write_text('{}')\""
            ),
            "required": True,
        }]))
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "report.json" in capsys.readouterr().err
        assert ledger.closed_step_ids(repo, 1) == []

    def test_a_misdeclared_suite_refuses_the_close(self, planned, capsys):
        repo, sessions_dir, use = planned
        # A dropped suite and no suite at all are indistinguishable once
        # the pass has finished, so the step must not close on evidence
        # collected under a declaration nobody could read.
        use(config_with(suites=[{"name": "python", "coverz": ["widget.py"]}]))
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "testing.suites[0]" in capsys.readouterr().err
        assert ledger.open_step(repo, 1)["step_id"] == STEP_ID
        assert ledger.closed_step_ids(repo, 1) == []


class TestCommitBoundary:
    def test_a_commit_while_the_step_is_open_refuses_the_close(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        run_step_open(sessions_dir, step_id=STEP_ID)
        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "committed mid-step")

        assert run_step_close(sessions_dir) == EXIT_BLOCKING
        assert "HEAD moved" in capsys.readouterr().err

    def test_the_guard_refuses_a_commit_only_while_a_step_is_open(
        self, planned, capsys
    ):
        repo, sessions_dir, _ = planned
        assert run_step_guard_commit(repo) == EXIT_OK

        run_step_open(sessions_dir, step_id=STEP_ID)
        assert run_step_guard_commit(repo) == EXIT_BLOCKING
        err = capsys.readouterr().err
        assert STEP_ID in err
        assert "verify step close" in err

        (repo / "widget.py").write_text("w = 1\n", encoding="utf-8")
        assert run_step_close(sessions_dir) == EXIT_OK
        assert run_step_guard_commit(repo) == EXIT_OK


class TestGuardInstallation:
    def test_bootstrap_installs_the_guard_hook(self, sandbox_repo):
        repo, _ = sandbox_repo
        hook = ensure_commit_guard(repo)
        assert hook == repo / ".git" / "hooks" / "pre-commit"
        assert "ai_router.verify step guard-commit" in hook.read_text(
            encoding="utf-8"
        )

    def test_bootstrap_never_clobbers_a_hook_it_did_not_write(
        self, sandbox_repo
    ):
        repo, _ = sandbox_repo
        path = repo / ".git" / "hooks" / "pre-commit"
        path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")

        assert ensure_commit_guard(repo) is None
        assert path.read_text(encoding="utf-8") == "#!/bin/sh\nexit 0\n"
