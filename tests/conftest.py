import copy
import shutil
import subprocess
from pathlib import Path

import pytest

SESSION_PLAN_MD = """# Demo repository

## Sessions

### Session 1 of 2: First things
1. Register.
2. **Build the widget.** Make it real.
   1. a nested sub-step that is not a top-level step
   - a nested bullet
3. Cross-provider verification.
4. Close-out.

**Creates:** `widget.py`

### Session 2 of 2: Second things
1. Register.
2. Polish the widget.
3. Cross-provider verification.
4. Close-out.
"""


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


# Every git spawn costs a process, and on this framework a test's seconds
# are almost entirely git spawns. Two rules keep them down without faking
# git (the loop is trust machinery; a fake that diverged from git's tree
# hashing would be the failure that matters most and shows least):
#
# - The suite runs under one pinned git configuration, so no spawn pays for
#   the host's (autocrlf, fsmonitor, gpg signing, gc, credential helpers),
#   and no repository needs its own identity or signing settings.
# - A seeded repository is built once per session and each test gets a
#   directory copy. A git repository is a directory; the remote is named by
#   a relative path, so a copied pair points at its own remote.

GIT_CONFIG = """[user]
	name = Test
	email = test@example.invalid
[init]
	defaultBranch = main
[core]
	autocrlf = false
	fsmonitor = false
[commit]
	gpgsign = false
[gc]
	auto = 0
"""


@pytest.fixture(scope="session", autouse=True)
def _git_env(tmp_path_factory):
    config = tmp_path_factory.mktemp("git-env") / "gitconfig"
    config.write_text(GIT_CONFIG, encoding="utf-8")
    patch = pytest.MonkeyPatch()
    patch.setenv("GIT_CONFIG_GLOBAL", str(config))
    patch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    yield
    patch.undo()


def _seed(repo, files: dict):
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text, encoding="utf-8")
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "seed")


@pytest.fixture(scope="session")
def _sandbox_template(tmp_path_factory, _git_env):
    base = tmp_path_factory.mktemp("sandbox")
    repo = base / "repo"
    _seed(repo, {
        "docs/sessions/session-plan.md": SESSION_PLAN_MD,
        ".gitignore": ".dabbler/\n",
    })
    subprocess.run(
        ["git", "init", "-q", "--bare", str(base / "remote.git")],
        capture_output=True,
    )
    _git(repo, "remote", "add", "origin", "../remote.git")
    _git(repo, "push", "-q", "-u", "origin", "main")
    return base


@pytest.fixture
def sandbox_repo(tmp_path, _sandbox_template):
    """A real git repo with one committed session plan and a bare
    upstream: the sandbox every gate and loop test runs in."""
    for name in ("repo", "remote.git"):
        shutil.copytree(_sandbox_template / name, tmp_path / name)
    repo = tmp_path / "repo"
    return repo, repo / "docs" / "sessions"


def record_preverify(repo, sessions_dir):
    """The sanctioned pre-verification evidence for whatever this tree
    currently changes: the selector's own command, run and recorded. A round
    cannot open without it, so every loop test needs the real thing rather
    than a hand-shaped row."""
    from ai_router.affected import (
        classify_preverify_command,
        load_selection_config,
        select_tests,
        targeted_command,
        working_tree_changes,
    )
    from ai_router.config import load_config
    from ai_router.test_evidence import (
        STAGE_PREVERIFY_TARGETED,
        load_suites_checked,
        record_run,
    )

    config = load_config()
    result = select_tests(
        repo, working_tree_changes(repo) or (),
        load_selection_config(config).config,
    )
    # EVERY expensive suite, not the first one. The pre-verification gate
    # demands a green targeted record per expensive suite, so a repository
    # that declares two needs two rows -- and this helper stands in for the
    # orchestrator, who would have run both.
    recorded = None
    for suite in load_suites_checked(config).suites:
        if not suite.expensive:
            continue
        mine = result.for_suite(suite.name)
        command = targeted_command(suite.command, mine,
                                   runs_whole=suite.runs_whole)
        if not command:
            # The selection named no test this suite runs, so the gate has
            # nothing to ask of it and there is no command to record.
            continue
        verdict = classify_preverify_command(command, mine)
        recorded = record_run(
            sessions_dir, suite, "passed", stage=STAGE_PREVERIFY_TARGETED,
            duration_seconds=1.0, command=command, policy=verdict.policy,
            policy_reason=verdict.reason,
            selected_tests=tuple((s.path, s.reason) for s in mine.selected),
        )
    return recorded


KEY_ENV = {
    "anthropic": "TEST_ANTHROPIC_KEY",
    "google": "TEST_GOOGLE_KEY",
    "openai": "TEST_OPENAI_KEY",
}

_PROVIDER_TEMPLATE = {
    "rate_limit": {"requests_per_minute": 1000, "tokens_per_minute": 1000000},
    "timeout_seconds": 30,
    "retry": {"max_retries": 1, "backoff_base_seconds": 0},
}

_BASE_CONFIG = {
    "providers": {
        "anthropic": {
            "api_key_env": KEY_ENV["anthropic"],
            "base_url": "https://fake.anthropic.test/v1/messages",
            **_PROVIDER_TEMPLATE,
        },
        "google": {
            "api_key_env": KEY_ENV["google"],
            "base_url": "https://fake.google.test/v1beta",
            **_PROVIDER_TEMPLATE,
        },
        "openai": {
            "api_key_env": KEY_ENV["openai"],
            "base_url": "https://fake.openai.test/v1",
            **_PROVIDER_TEMPLATE,
        },
    },
    "models": {
        "flash": {
            "provider": "google", "model_id": "g-flash",
            "max_context_tokens": 1000000, "max_output_tokens": 65536,
        },
        "pro": {
            "provider": "google", "model_id": "g-pro",
            "max_context_tokens": 1000000, "max_output_tokens": 65536,
        },
        "sonnet": {
            "provider": "anthropic", "model_id": "a-sonnet",
            "max_context_tokens": 200000, "max_output_tokens": 16000,
        },
        "opus": {
            "provider": "anthropic", "model_id": "a-opus",
            "max_context_tokens": 200000, "max_output_tokens": 32000,
        },
        "gpt": {
            "provider": "openai", "model_id": "o-gpt",
            "max_context_tokens": 272000, "max_output_tokens": 32000,
        },
        "gpt-mini": {
            "provider": "openai", "model_id": "o-mini",
            "max_context_tokens": 400000, "max_output_tokens": 16000,
            "is_enabled_as_verifier": False,
        },
        "ghost": {
            "provider": "anthropic", "model_id": "a-ghost",
            "is_enabled": False, "is_enabled_as_verifier": False,
        },
    },
    "roles": {
        "generator": {
            "prefer": ["g-flash", "g-pro", "a-opus"],
            "require_provider_in": ["anthropic", "openai", "google"],
        },
        "verifier": {
            "prefer": ["o-gpt", "a-sonnet"],
            "require_provider_in": ["anthropic", "openai", "google"],
        },
    },
    "escalation": {
        "enabled": True,
        "max_escalations": 2,
        "triggers": {
            "empty_response": True,
            "max_tokens_hit": True,
            "min_output_tokens": 30,
            "refusal_detection": True,
        },
        "refusal_phrases": ["i can't help with", "i'm unable to"],
    },
    "transports": {
        "copilot-cli": {
            "lockfile": "copilot-catalog.lock",
        },
    },
    "metrics": {"enabled": True},
}


def make_config(**overrides) -> dict:
    """A deep copy of the schema-valid test config, with top-level keys
    replaced by *overrides*."""
    config = copy.deepcopy(_BASE_CONFIG)
    config.update(overrides)
    return config


@pytest.fixture
def base_config():
    return make_config()


@pytest.fixture
def provider_keys(monkeypatch):
    for env_var in KEY_ENV.values():
        monkeypatch.setenv(env_var, "test-key")


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    """Reset process-level state and scrub routing-relevant env vars so no
    test observes another's environment or the operator's real keys."""
    import importlib

    # ai_router.route the ATTRIBUTE is the route() function (shadowed by the
    # package __init__); import_module returns the module itself.
    route = importlib.import_module("ai_router.route")
    runtime_mode = importlib.import_module("ai_router.runtime_mode")

    for var in (
        "DABBLER_NO_ROUTER", "DABBLER_TRANSPORT", "AI_ROUTER_CONFIG",
        "AI_ROUTER_METRICS_PATH", "COPILOT_AGENT_SESSION_ID",
    ):
        monkeypatch.delenv(var, raising=False)

    # This repository declares deterministic controls of its own, and
    # `load_config()` resolves from the WORKING DIRECTORY -- which under
    # pytest is this repository, whatever sandbox the test is driving. A
    # round run against a temp repository would otherwise execute commands
    # written for this tree against that one and fail on every row. The
    # config's repository and the tree's repository disagree only here, in
    # the harness; in production they are the same directory. A test that
    # wants controls declares them itself, and they survive this.
    config_module = importlib.import_module("ai_router.config")
    real_load_config = config_module.load_config
    own_config = Path(__file__).resolve().parent.parent / "dabbler.yaml"

    def load_without_this_repositorys_controls(*args, **kwargs):
        loaded = real_load_config(*args, **kwargs)
        declared = config_module.project_config_path(kwargs.get("project_dir"))
        if declared is None or Path(declared).resolve() != own_config:
            return loaded
        testing = dict(loaded.get("testing") or {})
        if "controls" not in testing:
            return loaded
        testing.pop("controls")
        return {**loaded, "testing": testing}

    monkeypatch.setattr(
        config_module, "load_config", load_without_this_repositorys_controls
    )
    for env_var in KEY_ENV.values():
        monkeypatch.delenv(env_var, raising=False)
    runtime_mode.reset_for_tests()
    route.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()
    route.reset_for_tests()


# --- Run-core sandbox --------------------------------------------------------

RUN_PLAN_MD = """# Default

## Sessions

### Session 1: First work session

Describe and complete one bounded change.

### Session 2: Review the parser

Policy: verified

Implement and test the bounded parser path.
"""


@pytest.fixture(scope="session")
def _run_template(tmp_path_factory, _git_env):
    base = tmp_path_factory.mktemp("run")
    _seed(base / "work", {
        "docs/sessions/session-plan.md": RUN_PLAN_MD,
        # FAIL is a test's failure sentinel. Ignored so it is not itself an
        # unmapped change in the candidate tree, which would confound the
        # selection and escalation assertions it exists to set up.
        ".gitignore": ".dabbler/\nFAIL\n",
        "app.py": "VALUE = 1\n",
    })
    return base


@pytest.fixture
def run_repo(tmp_path, _run_template, monkeypatch):
    """A committed git repository with one authored session plan, cwd'd into.

    The run core resolves its control root, repository id, and config from
    the working directory, so every run-core test needs a real repository
    rather than a temp directory that merely looks like one.
    """
    repo = tmp_path / "work"
    shutil.copytree(_run_template / "work", repo)
    monkeypatch.chdir(repo)
    return repo


@pytest.fixture
def run_config(run_repo, monkeypatch):
    """A schema-valid config for the scratch repository, with one declared
    suite and one control the run core can actually execute."""
    import sys

    import yaml

    interpreter = sys.executable.replace("\\", "/")
    config = make_config(
        testing={
            "suites": [{
                "name": "unit",
                "argv": [interpreter, "checkrunner.py"],
                "covers": ["app.py", "tests/", "conftest.py"],
                "test_roots": ["tests"],
                "test_glob": "test_*.py",
            }],
            "controls": [{
                "name": "lint",
                "kind": "lint",
                "argv": [interpreter, "-c", "import sys; sys.exit(0)"],
                "covers": ["app.py"],
                "required": True,
            }],
            "selection": {
                "repo_wide": ["conftest.py"],
                "smoke": ["tests/test_smoke.py"],
                "rules": [{"when": "app.py", "select": ["tests/test_app.py"]}],
            },
        },
        run_policy={"default": "fast", "verification_rounds": 2},
    )
    (run_repo / "checkrunner.py").write_text(
        "import pathlib, sys\n"
        "sys.exit(1 if pathlib.Path('FAIL').exists() else 0)\n",
        encoding="utf-8",
    )
    tests_dir = run_repo / "tests"
    tests_dir.mkdir(exist_ok=True)
    for name in ("test_app.py", "test_smoke.py"):
        (tests_dir / name).write_text("def test_ok():\n    pass\n", encoding="utf-8")
    _git(run_repo, "add", "-A")
    _git(run_repo, "commit", "-q", "-m", "declare checks")

    # Outside the repository: a config file inside it would be untracked
    # content and every run would refuse on a dirty worktree.
    path = run_repo.parent / "router-config.yaml"
    path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
    monkeypatch.setenv("AI_ROUTER_CONFIG", str(path))
    return config


@pytest.fixture
def no_model_calls(monkeypatch):
    """Fail the test on any dispatch through either transport.

    Asserted at the transport rather than at ``route`` so a call that
    reached the wire by another path still fails the test.
    """
    from ai_router.transports.api import DirectApiTransport
    from ai_router.transports.copilot import CopilotCliTransport

    def _forbidden(self, **kwargs):
        raise AssertionError("a framework model call was dispatched")

    monkeypatch.setattr(DirectApiTransport, "dispatch", _forbidden)
    monkeypatch.setattr(CopilotCliTransport, "dispatch", _forbidden)


class StubTransport:
    """A scripted verifier. Records every dispatch so a test can assert how
    many reviews a policy actually bought."""

    def __init__(self, responses, served_model_id=None):
        self.responses = list(responses)
        self.calls = []
        # None echoes back the id that was asked for, which is what an honest
        # provider does; a fixed value is how a test stages a lie about it.
        self.served_model_id = served_model_id

    def dispatch(self, *, model_id, system_prompt, user_message,
                 max_tokens=None, generation_params=None):
        from ai_router.transports.base import APIResult

        self.calls.append({"model_id": model_id, "user_message": user_message})
        content = self.responses.pop(0) if self.responses else "VERIFIED\n"
        return APIResult(
            content=content, input_tokens=100, output_tokens=200,
            stop_reason="end_turn",
            served_model_id=self.served_model_id or model_id,
        )


def reconfigure(run_repo, config, **overrides):
    """Rewrite the scratch repository's config with *overrides* merged over
    the top-level blocks."""
    import yaml

    merged = dict(config)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    (run_repo.parent / "router-config.yaml").write_text(
        yaml.safe_dump(merged, sort_keys=False), encoding="utf-8"
    )
    return merged
