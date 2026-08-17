import subprocess

import pytest

from ai_router import ledger
from ai_router.route import DispatchError, NoCandidateError, RouteResult
from ai_router.session import register_session_start
from ai_router.verify import (
    EXIT_BLOCKING,
    EXIT_OK,
    EXIT_UNAVAILABLE,
    EXIT_USAGE,
    run_round,
)

BLOCKING_RESPONSE = """ISSUES FOUND

- **Issue 1:** the widget divides by zero on empty input
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** any empty batch crashes the run
"""

CLEAN_RESPONSE = (
    "VERIFIED — I attacked the diff (empty-input path, boundary counts) "
    "and could not break it."
)


def _git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
    )


def make_result(content, **overrides):
    defaults = dict(
        content=content, model_name="gpt-5-4", model_id="gpt-5.4",
        provider="openai", tier=3, input_tokens=1000, output_tokens=200,
        cost_usd=0.05, cost_status="measured", complexity_score=70,
        escalated=False, escalation_history=[], elapsed_seconds=1.0,
        transport="api", truncated=False,
    )
    defaults.update(overrides)
    return RouteResult(**defaults)


class FakeVerifier:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def __call__(self, content, **kwargs):
        self.calls.append({"prompt": content, **kwargs})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def flight(sandbox_repo, monkeypatch):
    """A registered session with uncommitted work, plus a hook to script
    the verifier."""
    repo, set_dir = sandbox_repo
    register_session_start(set_dir, 1, engine="claude-code",
                           provider="anthropic")
    (repo / "widget.py").write_text("def f(xs): return 1/len(xs)\n",
                                    encoding="utf-8")

    def install(outcomes):
        import importlib

        fake = FakeVerifier(outcomes)
        # ai_router.route the ATTRIBUTE is the function; patch the module.
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        return fake

    return repo, set_dir, install


class TestRoundOne:
    def test_blocking_round_records_and_exits_4(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir) == EXIT_BLOCKING
        rounds = ledger.read_rounds(repo, set_dir.name, 1)
        assert len(rounds) == 1
        assert rounds[0]["blocking"] is True
        assert rounds[0]["verdict"] == "ISSUES_FOUND"
        assert rounds[0]["findings"][0]["severity"] == "major"
        assert rounds[0]["verifier_provider"] == "openai"
        assert rounds[0]["orchestrator_provider"] == "anthropic"
        # Raw output saved before parsing, bytes unmodified.
        raw = ledger.raw_output_path(repo, set_dir.name, 1, 1)
        assert raw.read_text(encoding="utf-8") == BLOCKING_RESPONSE

    def test_evidence_carries_spec_status_and_untracked(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(set_dir)
        prompt = fake.calls[0]["prompt"]
        assert "First things" in prompt          # spec excerpt
        assert "git status --short" in prompt
        assert "def f(xs)" in prompt             # untracked content inlined

    def test_orchestrator_provider_excluded(self, flight):
        repo, set_dir, install = flight
        fake = install([make_result(CLEAN_RESPONSE)])
        run_round(set_dir)
        call = fake.calls[0]
        assert call["exclude_providers"] == ["anthropic"]
        assert call["task_type"] == "session-verification"

    def test_clean_round_stamps_verdict_and_change_log(self, flight):
        repo, set_dir, install = flight
        install([make_result(CLEAN_RESPONSE)])
        assert run_round(set_dir) == EXIT_OK
        from ai_router.progress import read_session_state

        state = read_session_state(set_dir)
        record = state["sessions"][0]
        assert record["verificationVerdict"] == "VERIFIED"
        assert record["verification"]["verifierProvider"] == "openai"
        text = (set_dir / "change-log.md").read_text(encoding="utf-8")
        assert "VERIFIED after 1 round(s)" in text

    def test_empty_evidence_refused(self, sandbox_repo, monkeypatch):
        repo, set_dir = sandbox_repo
        register_session_start(set_dir, 1, engine="claude-code",
                               provider="anthropic")
        # Commit everything: clean tree, no untracked work -> nothing to
        # review, and routing an empty bundle is refused.
        _git(repo, "add", "-A")
        _git(repo, "commit", "-q", "-m", "all committed")
        import importlib
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        assert fake.calls == []  # never routed

    def test_truncated_response_writes_nothing(self, flight):
        repo, set_dir, install = flight
        install([make_result(CLEAN_RESPONSE, truncated=True)])
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        assert ledger.read_rounds(repo, set_dir.name, 1) == []


class TestLoop:
    def test_round_two_is_fix_delta_with_prior_findings(self, flight):
        repo, set_dir, install = flight
        fake = install([
            make_result(BLOCKING_RESPONSE), make_result(CLEAN_RESPONSE),
        ])
        assert run_round(set_dir) == EXIT_BLOCKING
        # Remediate, then re-run continues automatically.
        (repo / "widget.py").write_text(
            "def f(xs): return 1 / len(xs) if xs else 0\n", encoding="utf-8"
        )
        assert run_round(set_dir) == EXIT_OK
        prompt = fake.calls[1]["prompt"]
        assert "FIX DELTA ONLY" in prompt
        assert "divides by zero" in prompt       # prior finding re-presented
        rounds = ledger.read_rounds(repo, set_dir.name, 1)
        assert rounds[1]["previous_tree"] == rounds[0]["completion_tree"]
        assert rounds[1]["phase"] == "fix-delta"

    def test_round_cap_suspends(self, flight):
        repo, set_dir, install = flight
        install([make_result(BLOCKING_RESPONSE)])
        assert run_round(set_dir, max_rounds=1) == EXIT_BLOCKING
        assert run_round(set_dir, max_rounds=1) == EXIT_USAGE
        # The bound refuses BEFORE any metered call: only one round exists.
        assert len(ledger.read_rounds(repo, set_dir.name, 1)) == 1


class TestVerifierSelectionFailures:
    def test_retry_excludes_failed_provider(self, flight):
        repo, set_dir, install = flight
        fake = install([
            DispatchError("boom", provider="openai", model="gpt-5-4"),
            make_result(CLEAN_RESPONSE, model_name="gemini-pro",
                        provider="google"),
        ])
        assert run_round(set_dir) == EXIT_OK
        second = fake.calls[1]
        assert sorted(second["exclude_providers"]) == ["anthropic", "openai"]

    def test_no_candidate_is_operator_only(self, flight, capsys):
        repo, set_dir, install = flight
        install([NoCandidateError("nothing survives")])
        assert run_round(set_dir) == EXIT_UNAVAILABLE
        err = capsys.readouterr().err
        assert "VERIFICATION UNAVAILABLE" in err
        assert ledger.read_rounds(repo, set_dir.name, 1) == []

    def test_second_failure_propagates_as_call_failed(self, flight):
        from ai_router.verify import EXIT_CALL_FAILED

        repo, set_dir, install = flight
        install([
            DispatchError("boom", provider="openai"),
            DispatchError("boom again", provider="google"),
        ])
        assert run_round(set_dir) == EXIT_CALL_FAILED


class TestAutoVerify:
    def test_route_result_verified_and_recorded(self, base_config,
                                                monkeypatch, tmp_path):
        from ai_router.verify import auto_verify

        base_config["_verification_template"] = ""
        monkeypatch.setenv(
            "AI_ROUTER_METRICS_PATH", str(tmp_path / "metrics.jsonl")
        )
        import importlib
        fake = FakeVerifier([make_result(CLEAN_RESPONSE)])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        generated = make_result("some answer", model_name="sonnet",
                                provider="anthropic")
        outcome = auto_verify(generated, "review this", "code-review",
                              base_config)
        assert outcome["verdict"] == "VERIFIED"
        assert not outcome["blocking"]
        assert fake.calls[0]["exclude_providers"] == ["anthropic"]
        from ai_router.metrics import load_metrics

        rows = load_metrics(base_config)
        assert rows and rows[-1]["call_type"] == "verify"
        assert rows[-1]["verifier_of"] == "sonnet"

    def test_router_error_degrades_to_none(self, base_config, monkeypatch):
        from ai_router.verify import auto_verify

        base_config["_verification_template"] = ""
        import importlib
        fake = FakeVerifier([NoCandidateError("no cross-provider verifier")])
        monkeypatch.setattr(
            importlib.import_module("ai_router.route"), "route", fake
        )
        generated = make_result("answer", provider="anthropic")
        assert auto_verify(generated, "task", "code-review",
                           base_config) is None
