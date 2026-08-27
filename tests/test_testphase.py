"""The tests phase: the verifier authors, the framework runs, and the exit
code is the fact the loop reads."""
import subprocess
import sys

import pytest

from ai_router import testphase
from ai_router.route import NoCandidateError, RouteResult
from ai_router.testphase import (PhaseError, author, build_prompt,
                                 run_authored)

INTERPRETER = sys.executable.replace("\\", "/")

A_TEST = """```test-write path=tests/test_value.py
from app import VALUE


def test_the_value_is_one():
    assert VALUE == 1
```
"""


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
            }],
            "selection": {"test_roots": ["tests"], "test_glob": "test_*.py"},
        },
    }
    base.update(overrides)
    return base


@pytest.fixture
def repo(tmp_path):
    """A repository that declares where its tests live and one suite that
    runs them. The suite echoes what it was asked to run and fails, so a run
    is legible without a real test framework in the sandbox."""
    root = tmp_path / "work"
    (root / "tests").mkdir(parents=True)
    (root / "app.py").write_text("VALUE = 1\n", encoding="utf-8")
    (root / "runner.py").write_text(
        "import sys\n"
        "sys.stdout.write(' '.join(sys.argv[1:]))\n"
        "sys.exit(3)\n",
        encoding="utf-8",
    )
    (root / ".gitignore").write_text(".dabbler/\n", encoding="utf-8")
    _git(root, "init", "-q", "-b", "main")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "seed")
    return root


@pytest.fixture
def artifact(repo):
    return str(repo / "app.py")


class FakeRouter:
    """Answers as one vendor, and refuses one it was told to exclude — the
    constraint the real ``route()`` enforces. ``honour_exclusion=False``
    reproduces the offline transport, which builds its candidate without
    reading the exclusion at all."""

    def __init__(self, provider, body, honour_exclusion=True,
                 transport="copilot-cli", simulated=False):
        self.provider = provider
        self.body = body
        self.honour_exclusion = honour_exclusion
        self.transport = transport
        self.simulated = simulated
        self.calls = []

    def __call__(self, content, task_type, role, exclude_providers, transport):
        self.calls.append({"content": content, "role": role,
                           "exclude": list(exclude_providers or [])})
        if self.honour_exclusion and self.provider in (exclude_providers or []):
            raise NoCandidateError(f"{self.provider} is excluded")
        return RouteResult(
            content=self.body, model_name=f"{self.provider}-model",
            model_id="x", provider=self.provider, input_tokens=1,
            output_tokens=1, escalated=False, escalation_history=[],
            elapsed_seconds=0.1, transport=self.transport,
            metadata={"simulated": True} if self.simulated else {},
        )


def _author(monkeypatch, repo, artifact, router, **kw):
    monkeypatch.setattr(testphase, "route", router)
    kw.setdefault("transport", "copilot-cli")
    return author(repo, "csv-demo", "plan", [artifact], config(), **kw)


class TestTheHandOff:
    def test_the_prompt_asks_for_files_and_refuses_a_claim_about_them(
            self, repo, artifact):
        """The split is the whole feature: a verifier that reports on the
        tests it wrote is scoring its own work, and the result stops being a
        fact the loop can branch on."""
        from ai_router import agency

        grant = agency.grant_for_transport(
            "copilot-cli", ("app.py",), 40, ("tests",), "test_*.py",
            allow_write=True,
        )
        prompt = build_prompt(
            "csv-demo", "plan", [(artifact, "VALUE = 1\n")], grant
        )
        assert "```test-write path=tests/test_example.py" in prompt
        assert "you must not say whether they pass" in prompt

    def test_the_author_of_the_code_never_writes_its_tests(
            self, monkeypatch, repo, artifact):
        router = FakeRouter("openai", A_TEST)
        _author(monkeypatch, repo, artifact, router,
                author_provider="anthropic")
        assert router.calls[0]["exclude"] == ["anthropic"]

    def test_one_vendor_answering_despite_exclusion_is_refused(
            self, monkeypatch, repo, artifact):
        """``route()`` builds the offline candidate without consulting the
        exclusion, so the guarantee has to be asserted at the answer too."""
        router = FakeRouter("anthropic", A_TEST, honour_exclusion=False)
        with pytest.raises(PhaseError, match="despite being excluded"):
            _author(monkeypatch, repo, artifact, router,
                    author_provider="anthropic")

    def test_the_phase_grants_the_write_a_review_round_withholds(
            self, monkeypatch, repo, artifact):
        """Session 7 built the boundary and left the grant off everywhere.
        This is the one round that turns it on, so the file has to land."""
        authoring, _ = _author(
            monkeypatch, repo, artifact, FakeRouter("openai", A_TEST)
        )
        assert authoring.written == ("tests/test_value.py",)
        assert (repo / "tests" / "test_value.py").read_text().startswith(
            "from app import VALUE"
        )

    def test_a_repository_that_declares_no_test_root_is_refused_up_front(
            self, monkeypatch, repo, artifact):
        """Every write would be refused for want of a root, after the call
        that produced them had already been paid for."""
        monkeypatch.setattr(testphase, "route", FakeRouter("openai", A_TEST))
        with pytest.raises(PhaseError, match="declares no test root"):
            author(repo, "csv-demo", "plan", [artifact],
                   config(testing={"suites": []}), transport="copilot-cli")

    def test_a_transport_with_no_tools_still_authors_tests(
            self, monkeypatch, repo, artifact):
        """The write costs no tool-use loop — it is a fenced block in an
        ordinary answer. Confining it to the seat would put a phase the
        lifecycle requires out of reach of the config this package ships."""
        monkeypatch.setattr(
            testphase, "route", FakeRouter("openai", A_TEST, transport="api")
        )
        authoring, _ = author(repo, "csv-demo", "plan", [artifact], config(),
                              transport="api")
        assert authoring.written == ("tests/test_value.py",)
        assert (repo / "tests" / "test_value.py").is_file()


class TestTheFrameworkRunsThem:
    def test_the_run_names_the_authored_tests_and_reports_the_exit_code(
            self, repo):
        run = run_authored(repo, config(), ["tests/test_value.py"])
        assert run.exit_code == 3
        assert run.green is False
        assert run.output.strip().endswith("tests/test_value.py")

    def test_a_test_no_declared_suite_covers_is_refused_rather_than_run(
            self, repo):
        """A runner invented here would be a second implementation of what a
        suite is, and a green from it would mean nothing."""
        with pytest.raises(PhaseError, match="no declared suite covers"):
            run_authored(repo, config(), ["elsewhere/test_stray.py"])

    def test_running_nothing_is_refused(self, repo):
        """A run of no tests exits zero, which is indistinguishable from a
        suite that passed."""
        with pytest.raises(PhaseError, match="no authored test to run"):
            run_authored(repo, config(), [])
