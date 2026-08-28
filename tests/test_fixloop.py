"""The complete suite and the fix loop a red one opens: the envelope is the
feature, and it is a boundary rather than a request."""
import subprocess
import sys

import pytest

from ai_router import agency, fixloop
from ai_router.affected import SelectionConfig, SuiteScope
from ai_router.fixloop import (Envelope, FixLoopError, build_envelope,
                               build_prompt, failures, fix, implicated_paths,
                               observations, run_suite)
from ai_router.route import RouteResult

INTERPRETER = sys.executable.replace("\\", "/")

SELECTION = SelectionConfig(
    scopes=(SuiteScope("python", ("tests",), "test_*.py"),)
)

RED = (
    "rootdir: /work\n"
    "configfile: pytest.ini\n"
    "============ FAILURES ============\n"
    "app.py:4: in add\n"
    "    return a - b\n"
    "E   assert 3 == 1\n"
    "FAILED tests/test_add.py::test_adds - assert 3 == 1\n"
)


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def config(**overrides) -> dict:
    base = {
        "run_policy": {"check_timeout_seconds": 60},
        "testing": {
            "suites": [{
                "name": "unit",
                "argv": [INTERPRETER, "runner.py"],
                "covers": ["app.py", "tests/"],
                "test_roots": ["tests"],
                "test_glob": "test_*.py",
            }],
        },
    }
    base.update(overrides)
    return base


@pytest.fixture
def repo(tmp_path):
    """A repository with one committed source file, one authored test, and a
    suite that fails the way a runner does."""
    root = tmp_path / "work"
    (root / "tests").mkdir(parents=True)
    (root / "app.py").write_text("def add(a, b):\n    return a - b\n",
                                 encoding="utf-8")
    (root / "runner.py").write_text(
        "import sys\n"
        f"sys.stdout.write({RED!r})\n"
        "sys.exit(1)\n",
        encoding="utf-8",
    )
    (root / ".gitignore").write_text(".dabbler/\n", encoding="utf-8")
    (root / "pytest.ini").write_text("[pytest]\n", encoding="utf-8")
    _git(root, "init", "-q", "-b", "main")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "seed")
    # The session's own work, uncommitted: the half of the envelope git
    # measures. `notes.md` is the unrelated file every real session has in
    # flight beside the code.
    (root / "tests" / "test_add.py").write_text(
        "from app import add\n\n\ndef test_adds():\n    assert add(2, 1) == 3\n",
        encoding="utf-8",
    )
    (root / "notes.md").write_text("scratch\n", encoding="utf-8")
    return root


class FakeRouter:
    def __init__(self, body, provider="anthropic", transport="copilot-cli",
                 simulated=False):
        self.body = body
        self.provider = provider
        self.transport = transport
        self.simulated = simulated
        self.calls = []

    def __call__(self, content, task_type, role, transport):
        self.calls.append({"content": content, "role": role})
        return RouteResult(
            content=self.body, model_name=f"{self.provider}-model",
            model_id="x", provider=self.provider, input_tokens=1,
            output_tokens=1, escalated=False, escalation_history=[],
            elapsed_seconds=0.1, transport=self.transport,
            metadata={"simulated": True} if self.simulated else {},
        )


def _envelope(repo):
    return build_envelope(repo, "HEAD", RED, SELECTION)


def _fix(monkeypatch, repo, body, **kw):
    monkeypatch.setattr(fixloop, "route", FakeRouter(body))
    return fix(repo, config(), failing=failures(RED, SELECTION), output=RED,
               envelope=_envelope(repo), transport="copilot-cli", **kw)


class TestWhatTheRunSaid:
    def test_the_suite_runs_whole_against_the_tree_with_the_authored_tests(
            self, repo):
        """Targeting it here would be a smaller claim wearing the same name:
        this stage is the complete suite by definition."""
        runs = run_suite(repo, config(), ["tests/test_add.py"])
        assert [r.command for r in runs] == [f"{INTERPRETER} runner.py"]
        assert runs[0].green is False

    def test_a_suite_run_before_any_test_was_authored_is_refused(self, repo):
        """It would be the suite as it stood before the verifier read
        anything, recorded as the run that included what it wrote."""
        with pytest.raises(FixLoopError, match="no authored test to include"):
            run_suite(repo, config(), [])

    def test_a_failure_is_a_declared_test_path_beside_a_word_meaning_failed(
            self):
        found = failures(RED, SELECTION)
        assert [(f.name, f.path) for f in found] == [
            ("tests/test_add.py::test_adds", "tests/test_add.py")
        ]

    def test_a_test_merely_mentioned_is_not_a_failure(self):
        """Every line of a verbose run names a test. Without the marker the
        parser would implicate the whole suite in one test's failure."""
        assert failures("tests/test_add.py::test_adds PASSED\n",
                        SELECTION) == ()


class TestTheEnvelope:
    def test_it_is_the_session_diff_plus_the_files_the_failures_implicate(
            self, repo):
        envelope = _envelope(repo)
        assert "tests/test_add.py" in envelope.session_paths
        assert "app.py" in envelope.implicated
        assert envelope.allows("app.py")

    def test_a_traceback_frame_implicates_the_file_it_points_at(self, repo):
        """Runners spell a position several ways, and a path several more —
        relative, POSIX-absolute, drive-lettered. Recognising one of them
        would leave the broken source file outside the envelope on an
        ordinary failure."""
        posix_abs = str(repo).replace("\\", "/")
        for frame in (
            'File "app.py", line 4, in add',
            f'File "{posix_abs}/app.py", line 4, in add',
            f'File "{str(repo / "app.py")}", line 4, in add',
            f"{posix_abs}/app.py:4: in add",
        ):
            assert implicated_paths(repo, frame + "\n") == ("app.py",), frame

    def test_a_file_the_runner_merely_mentions_is_not_implicated(self, repo):
        """A runner prints its own configuration beside the failures. Taking
        that as implicated would let a fix round reroute the run instead of
        repairing the code."""
        envelope = _envelope(repo)
        assert "pytest.ini" not in envelope.paths
        assert envelope.allows("pytest.ini") is False

    def test_a_path_the_output_names_that_is_not_in_the_repository_is_dropped(
            self, repo):
        """A vendored frame in a traceback must not put site-packages in the
        envelope."""
        found = implicated_paths(
            repo, "/usr/lib/python3/site-packages/pytest/main.py:11: in run\n"
        )
        assert found == ()

    def test_a_diff_git_cannot_answer_is_refused_rather_than_read_as_empty(
            self, repo):
        """An empty envelope refuses every write and reads afterwards as a
        model that proposed nothing."""
        with pytest.raises(FixLoopError, match="unmeasurable session diff"):
            build_envelope(repo, "0" * 40, RED, SELECTION)

    def test_a_write_outside_the_envelope_is_refused_before_bytes_are_written(
            self, monkeypatch, repo):
        """The whole feature: rejected by the framework, not requested
        against by the prompt."""
        body = (
            "```fix-write path=runner.py\n"
            "import sys\n"
            "sys.exit(0)\n"
            "```\n"
        )
        round_, _ = _fix(monkeypatch, repo, body)
        assert round_.written == ()
        assert round_.refused == ("runner.py",)
        assert "outside the envelope" in round_.writes[0].reason
        assert "sys.exit(0)" not in (repo / "runner.py").read_text()

    def test_a_write_inside_the_envelope_lands(self, monkeypatch, repo):
        body = (
            "```fix-write path=app.py\n"
            "def add(a, b):\n"
            "    return a + b\n"
            "```\n"
        )
        round_, _ = _fix(monkeypatch, repo, body)
        assert round_.written == ("app.py",)
        assert (repo / "app.py").read_text().endswith("return a + b\n")

    def test_a_test_write_block_is_not_a_fix_rounds_write(
            self, monkeypatch, repo):
        """Two rounds with different jobs get different labels, so a block
        lifted out of the tests phase is not silently honoured here."""
        body = (
            "```test-write path=tests/test_add.py\n"
            "def test_adds():\n"
            "    assert True\n"
            "```\n"
        )
        round_, _ = _fix(monkeypatch, repo, body)
        assert round_.writes == ()
        assert "assert True" not in (repo / "tests" / "test_add.py").read_text()


class TestTheFixRound:
    def test_the_round_is_shown_the_failures_the_output_and_the_envelope(
            self, repo):
        grant = agency.grant_for_transport(
            "copilot-cli", ("app.py",), 40, allow_write=True,
            write_envelope=("app.py",), write_label=agency.WRITE_LABEL_FIX,
        )
        prompt = build_prompt(
            failures(RED, SELECTION), RED,
            [("app.py", "def add(a, b):\n    return a - b\n")],
            Envelope(implicated=("app.py",)), grant,
        )
        assert "`tests/test_add.py::test_adds`" in prompt
        assert "```fix-write path=app.py" in prompt
        assert "No findings are wanted" in prompt

    def test_the_author_is_not_excluded_from_repairing_its_own_code(
            self, monkeypatch, repo):
        """The exclusion that makes a review cross-vendor is exactly wrong
        here: a second vendor would be answering for work it has not seen."""
        router = FakeRouter("```fix-write path=app.py\nx = 1\n```\n")
        monkeypatch.setattr(fixloop, "route", router)
        fix(repo, config(), failing=failures(RED, SELECTION), output=RED,
            envelope=_envelope(repo), transport="copilot-cli")
        assert router.calls[0]["role"] == "generator"

    def test_the_round_may_read_the_implicated_files_and_not_the_rest_of_the_diff(
            self, monkeypatch, repo):
        """The write envelope is wider than the read surface on purpose: a
        fix may need to land in a file the session already changed, and is
        still not invited to look at one the failures do not implicate."""
        router = FakeRouter("nothing to write here\n")
        monkeypatch.setattr(fixloop, "route", router)
        envelope = _envelope(repo)
        fix(repo, config(), failing=failures(RED, SELECTION), output=RED,
            envelope=envelope, transport="copilot-cli")
        scope = router.calls[0]["content"].split("**Scope**")[1].split(
            "**Budget**")[0]
        assert "app.py" in scope
        assert "notes.md" not in scope
        assert envelope.allows("notes.md")

    def test_a_round_with_no_named_failure_is_refused(self, repo):
        """A fix round with nothing to answer is a model invited to revise
        whatever it notices."""
        with pytest.raises(FixLoopError, match="no failing test to fix"):
            fix(repo, config(), failing=(), output="", envelope=_envelope(repo))

    def test_an_unrelated_observation_is_recorded_and_nothing_else(
            self, monkeypatch, repo):
        """Recorded because an erased finding leaves nothing anyone can
        overrule; acted on by nobody because this round answers a failure."""
        body = (
            "```fix-write path=app.py\ndef add(a, b):\n    return a + b\n```\n"
            "\n## OBSERVATIONS\n\n"
            "- `runner.py` swallows stderr.\n"
        )
        round_, _ = _fix(monkeypatch, repo, body)
        assert round_.observations == ("`runner.py` swallows stderr.",)
        assert round_.written == ("app.py",)

    def test_observations_stop_at_the_next_heading(self):
        text = "## OBSERVATIONS\n\n- one\n\n## Something else\n\n- two\n"
        assert observations(text) == ("one",)
