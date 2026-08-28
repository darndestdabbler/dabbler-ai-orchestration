import copy
import subprocess

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


@pytest.fixture
def sandbox_repo(tmp_path):
    """A real git repo with one committed session plan and a bare
    upstream: the sandbox every gate and loop test runs in."""
    repo = tmp_path / "repo"
    sessions_dir = repo / "docs" / "sessions"
    sessions_dir.mkdir(parents=True)
    (sessions_dir / "session-plan.md").write_text(
        SESSION_PLAN_MD, encoding="utf-8"
    )
    (repo / ".gitignore").write_text(".dabbler/\n", encoding="utf-8")
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "config", "user.email", "test@example.invalid")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "config", "commit.gpgsign", "false")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "seed")
    remote = tmp_path / "remote.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(remote)], capture_output=True,
    )
    _git(repo, "remote", "add", "origin", str(remote))
    _git(repo, "push", "-q", "-u", "origin", "main")
    return repo, sessions_dir


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
    suite = next(s for s in load_suites_checked(config).suites if s.expensive)
    result = select_tests(
        repo, working_tree_changes(repo) or (),
        load_selection_config(config).config,
    )
    command = targeted_command(suite.command, result)
    verdict = classify_preverify_command(command, result)
    return record_run(
        sessions_dir, suite, "passed", stage=STAGE_PREVERIFY_TARGETED,
        duration_seconds=1.0, command=command, policy=verdict.policy,
        policy_reason=verdict.reason,
        selected_tests=tuple((s.path, s.reason) for s in result.selected),
    )


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


@pytest.fixture
def run_repo(tmp_path, monkeypatch):
    """A committed git repository with one authored session plan, cwd'd into.

    The run core resolves its control root, repository id, and config from
    the working directory, so every run-core test needs a real repository
    rather than a temp directory that merely looks like one.
    """
    repo = tmp_path / "work"
    sessions_dir = repo / "docs" / "sessions"
    sessions_dir.mkdir(parents=True)
    (sessions_dir / "session-plan.md").write_text(
        RUN_PLAN_MD, encoding="utf-8"
    )
    (repo / ".gitignore").write_text(
        ".dabbler/\n"
        # A test's failure sentinel. Ignored so it is not itself an unmapped
        # change in the candidate tree, which would confound the selection
        # and escalation assertions it exists to set up.
        "FAIL\n",
        encoding="utf-8",
    )
    (repo / "app.py").write_text("VALUE = 1\n", encoding="utf-8")
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "config", "user.email", "test@example.invalid")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "config", "commit.gpgsign", "false")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", "seed")
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


def cli(*argv) -> tuple:
    """``(exit_code, payload)`` for one run-core command."""
    import contextlib
    import io
    import json as _json

    from ai_router.runcli import main

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        code = main([*argv, "--json"] if "--json" not in argv else list(argv))
    text = buffer.getvalue().strip()
    return code, (_json.loads(text) if text else {})


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
