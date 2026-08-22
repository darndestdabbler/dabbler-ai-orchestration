"""Schema rejection, run-core configuration, budget ceilings, and the order
the two policies actually run their checks in."""

import copy

import pytest

from ai_router import journal, runproject, verifyjob
from ai_router.config import RUN_CORE_DEFAULTS, load_config
from tests.conftest import StubTransport, cli, make_config, reconfigure

REGISTER_VERIFIED = (
    "run", "--register", "--set", "001-default", "--session", "2",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)

ISSUES = (
    "ISSUES FOUND\n\n"
    "Issue 1: the loader mis-parses an empty segment\n"
    "  Category: Correctness\n"
    "  Severity: Major\n"
    "  Evidence paths: app.py\n"
)


@pytest.fixture
def verifier(monkeypatch, provider_keys):
    stub = StubTransport([])
    from ai_router.transports.api import DirectApiTransport

    monkeypatch.setattr(
        DirectApiTransport, "dispatch", lambda self, **kw: stub.dispatch(**kw)
    )
    return stub


# --- Schemas ----------------------------------------------------------------

VALID_REQUEST = {
    "schema_version": 1, "request_id": "id", "run_id": "r0001-x", "round": 1,
    "tree_digest": "t", "policy_version": "run-core-1",
    "orchestrator_identity": {
        "engine": "claude-code", "provider": "anthropic", "model": "sonnet",
        "identityProvenance": "direct",
    },
    "excluded_providers": ["anthropic"],
    "evidence_manifest": [{"kind": "ask", "inline": "do the thing"}],
    "output_contract": "verdict-v2", "timeout_seconds": 60,
    "budget": {
        "max_rounds": 3, "model_dispatches_remaining": 2,
        "model_usd_remaining": 1.0, "elapsed_seconds_remaining": 60,
    },
}

VALID_RESULT = {
    "schema_version": 1, "request_id": "id", "attempt": 1, "tree_digest": "t",
    "effective_provider": "openai", "requested_model": "o-gpt",
    "served_model_id": "o-gpt", "transport": "api", "verdict": "VERIFIED",
    "blocking_findings": [], "minor_findings": [], "doc_capped_findings": [],
    "usage": {
        "input_tokens": 1, "output_tokens": 2, "model_usd": None,
        "priced": False,
    },
    "raw_output_ref": "r.txt", "raw_output_digest": "sha256:x",
    "error_class": None,
}


@pytest.mark.parametrize("mutate, message", [
    (lambda d: d.pop("excluded_providers"), "excluded_providers"),
    (lambda d: d.update(excluded_providers=[]), "excluded_providers"),
    (lambda d: d.update(output_contract="verdict-v3"), "output_contract"),
    (lambda d: d.update(policy_version="v1"), "policy_version"),
])
def test_a_malformed_verification_request_is_refused(mutate, message):
    document = copy.deepcopy(VALID_REQUEST)
    mutate(document)
    with pytest.raises(ValueError, match=message):
        verifyjob._validate(
            document, "verification-request", "verification request"
        )


def test_a_result_may_not_carry_both_a_verdict_and_an_error():
    document = dict(VALID_RESULT, error_class="transport:boom")
    with pytest.raises(ValueError):
        verifyjob._validate(
            document, "verification-result", "verification result"
        )


def test_a_malformed_projection_is_refused(run_repo, run_config):
    projection = runproject.build_projection(journal.control_root())
    projection["organization_digest"] = "not-a-digest"
    with pytest.raises(ValueError, match="organization_digest"):
        runproject._validate(projection, "run-projection", "run projection")


def test_a_malformed_organization_document_is_refused():
    with pytest.raises(ValueError, match="slug"):
        runproject._validate(
            {
                "schema_version": 1, "diagnostics": [],
                "sets": [{
                    "slug": "Default", "position": 1, "title": "t",
                    "objective": "", "sessions": [],
                }],
            },
            "session-organization", "session organization",
        )


# --- Configuration ----------------------------------------------------------

def test_the_run_core_defaults_load_without_configuration(run_repo):
    config = load_config()
    assert config["run_policy"] == RUN_CORE_DEFAULTS["run_policy"]
    assert config["git"]["push_on_finish"] is False
    assert config["explorer"]["stale_after_minutes"] == 5


def test_a_declared_run_policy_overlays_the_defaults(run_repo, run_config):
    reconfigure(run_repo, run_config, run_policy={
        "verification_rounds": 5, "budgets": {"model_usd": None},
    })
    config = load_config()
    assert config["run_policy"]["verification_rounds"] == 5
    assert config["run_policy"]["budgets"]["model_usd"] is None
    # Nulling the dollar ceiling disables only that ceiling.
    assert config["run_policy"]["budgets"]["model_dispatches"] == 3
    assert config["run_policy"]["diff_limit_lines"] == 1500


@pytest.mark.parametrize("block, message", [
    ({"run_policy": {"verification_rounds": 0}}, "verification_rounds"),
    ({"run_policy": {"budgets": {"model_usd": 0}}}, "model_usd"),
    ({"run_policy": {"nonsense": 1}}, "nonsense"),
    ({"git": {"remote": ""}}, "remote"),
])
def test_an_invalid_run_core_limit_is_refused_at_config_load(
    run_repo, monkeypatch, tmp_path, block, message
):
    import yaml

    path = tmp_path / "bad-config.yaml"
    path.write_text(
        yaml.safe_dump(make_config(**block), sort_keys=False),
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_ROUTER_CONFIG", str(path))
    with pytest.raises(ValueError, match=message):
        load_config()


# --- Budgets ----------------------------------------------------------------

def test_a_dispatch_ceiling_pauses_instead_of_spending_again(
    run_repo, run_config, verifier
):
    reconfigure(run_repo, run_config, run_policy={
        **run_config["run_policy"],
        "verification_rounds": 5,
        "budgets": {"model_dispatches": 1},
    })
    verifier.responses = [ISSUES, ISSUES]
    code, started = cli(*REGISTER_VERIFIED)
    assert code == 0
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
    cli("verify", "--run", started["run_id"])

    (run_repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["state"] == "waiting"
    assert "model_dispatches" in payload["paused"]
    assert len(verifier.calls) == 1


def test_a_ceiling_pauses_a_fast_run_too(run_repo, run_config):
    reconfigure(run_repo, run_config, run_policy={
        **run_config["run_policy"],
        "budgets": {"elapsed_minutes": 0.0001},
    })
    code, started = cli(
        "run", "--register", "--set", "001-default", "--session", "1",
        "--engine", "claude-code", "--provider", "anthropic",
        "--model", "sonnet",
    )
    assert code == 0
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
    cli("checkpoint", "--run", started["run_id"], "--note", "slow going")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["state"] == "waiting"
    assert "elapsed_minutes" in payload["paused"]

    root = journal.control_root()
    waiting = [
        e for e in journal.read_events(root)
        if e["event_type"] == "run.waiting"
    ]
    assert waiting[-1]["payload"]["reason"] == "operator"


# --- Ordering ---------------------------------------------------------------

def test_remediation_runs_targeted_verify_fix_targeted_verify_final_full(
    run_repo, run_config, verifier
):
    verifier.responses = [ISSUES, "VERIFIED\n\nthe fix holds\n"]
    code, started = cli(*REGISTER_VERIFIED)
    assert code == 0
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
    cli("verify", "--run", started["run_id"])
    (run_repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
    cli("verify", "--run", started["run_id"])
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished

    order = []
    for event in journal.read_events(journal.control_root()):
        if event["event_type"] == "check.started":
            order.append(event["payload"]["stage"])
        elif event["event_type"] == "verification.dispatched":
            order.append("verify")
        elif event["event_type"] == "remediation.started":
            order.append("remediate")
    collapsed = [k for i, k in enumerate(order) if i == 0 or order[i - 1] != k]
    assert collapsed == [
        "targeted", "verify", "remediate",
        "targeted", "verify", "final-full",
    ]
