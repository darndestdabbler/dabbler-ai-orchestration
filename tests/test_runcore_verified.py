"""The ``verified`` policy: one review before any finding, a remediation loop
that reviews only the fix, and the ceilings that hand the run back."""

import json

import pytest

from ai_router import journal
from tests.conftest import StubTransport, cli, reconfigure

REGISTER = (
    "run", "--register", "--set", "001-default", "--session", "2",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)

ISSUES = (
    "ISSUES FOUND\n\n"
    "Issue 1: the parser drops the trailing segment\n"
    "  Category: Correctness\n"
    "  Severity: Major\n"
    "  Evidence paths: app.py\n"
)

NITS_ONLY = (
    "ISSUES FOUND\n\n"
    "Issue 1: the comment wording is loose\n"
    "  Category: Completeness\n"
    "  Severity: Minor\n"
    "  Evidence paths: app.py\n"
)


@pytest.fixture
def verifier(monkeypatch, provider_keys):
    """A scripted cross-provider verifier on the direct-API transport."""
    stub = StubTransport([])
    from ai_router.transports.api import DirectApiTransport

    monkeypatch.setattr(
        DirectApiTransport, "dispatch",
        lambda self, **kw: stub.dispatch(**kw),
    )
    return stub


def _register():
    code, payload = cli(*REGISTER)
    assert code == 0, payload
    assert payload["policy"] == "verified"
    return payload


def _edit(repo, text="VALUE = 2\n"):
    (repo / "app.py").write_text(text, encoding="utf-8")


def _events(root, kind):
    return [
        e for e in journal.read_events(root)
        if e["event_type"] == kind
    ]


def test_a_clean_review_costs_exactly_one_dispatch(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nI drove the parser and could not "
                          "break it.\n"]
    started = _register()
    _edit(run_repo)

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["verdict"] == "VERIFIED"
    assert payload["state"] == "running"
    assert len(verifier.calls) == 1


def test_the_verifier_is_never_the_run_s_own_provider(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nchecked\n"]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])

    request = _events(journal.control_root(), "verification.dispatched")[0]
    assert request["payload"]["excluded_providers"] == ["anthropic"]
    result = _events(journal.control_root(), "verification.result")[0]
    assert result["payload"]["effective_provider"] != "anthropic"
    assert result["payload"]["verdict"] == "VERIFIED"


def test_a_request_that_drops_the_exclusion_is_refused_at_dispatch(
    run_repo, run_config, verifier
):
    from ai_router import verifyjob
    from ai_router.runcore import Refusal

    view = type("V", (), {"provider": "anthropic"})()
    with pytest.raises(Refusal) as caught:
        verifyjob.dispatch(
            {"excluded_providers": ["openai"]}, "prompt", view
        )
    assert caught.value.token == "provider-exclusion-missing"


def test_a_blocking_finding_opens_remediation_and_a_second_round(
    run_repo, run_config, verifier
):
    verifier.responses = [ISSUES, "VERIFIED\n\nthe fix holds\n"]
    started = _register()
    _edit(run_repo)

    code, first = cli("verify", "--run", started["run_id"])
    assert code == 0 and first["verdict"] == "ISSUES_FOUND"
    assert first["state"] == "remediating"
    assert len(first["blocking"]) == 1

    _edit(run_repo, "VALUE = 3\n")
    code, second = cli("verify", "--run", started["run_id"])
    assert code == 0 and second["round"] == 2
    assert second["verdict"] == "VERIFIED"
    assert len(verifier.calls) == 2

    root = journal.control_root()
    assert len(_events(root, "remediation.started")) == 1


def test_round_two_reviews_the_fix_delta_only(run_repo, run_config, verifier):
    verifier.responses = [ISSUES, "VERIFIED\n\nok\n"]
    started = _register()
    _edit(run_repo, "VALUE = 2\n")
    cli("verify", "--run", started["run_id"])
    _edit(run_repo, "VALUE = 3\n")
    cli("verify", "--run", started["run_id"])

    root = journal.control_root()
    dispatched = _events(root, "verification.dispatched")
    first_tree = dispatched[0]["payload"]["tree_digest"]
    second = dispatched[1]["payload"]["evidence_manifest"][0]
    assert second["base_commit"] == first_tree


def test_minor_only_findings_stop_the_loop(run_repo, run_config, verifier):
    verifier.responses = [NITS_ONLY]
    started = _register()
    _edit(run_repo)

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0
    assert payload["blocking"] == [] and len(payload["minor"]) == 1
    assert payload["state"] == "running"

    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished
    assert finished["verdict"] == "ISSUES_FOUND"


def test_final_full_runs_only_after_the_accepted_verification(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nok\n"]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])
    code, finished = cli("finish", "--run", started["run_id"])
    assert code == 0, finished

    root = journal.control_root()
    stages = [
        e["payload"]["stage"] for e in _events(root, "check.started")
    ]
    assert stages.count("final-full") >= 1
    first_full = stages.index("final-full")
    dispatch_seq = _events(root, "verification.dispatched")[0]["sequence"]
    full_seq = [
        e["sequence"] for e in _events(root, "check.started")
        if e["payload"]["stage"] == "final-full"
    ][0]
    assert stages[:first_full].count("targeted") >= 1
    assert full_seq > dispatch_seq


def test_finish_refuses_when_the_verified_tree_moved(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nok\n"]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])
    _edit(run_repo, "VALUE = 99\n")

    code, payload = cli("finish", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "verification-required"


def test_a_transport_failure_is_an_immutable_attempt_with_no_verdict(
    run_repo, run_config, verifier, monkeypatch
):
    from ai_router.route import DispatchError
    from ai_router.transports.api import DirectApiTransport

    monkeypatch.setattr(
        DirectApiTransport, "dispatch",
        lambda self, **kw: (_ for _ in ()).throw(
            DispatchError("upstream refused", provider="openai")
        ),
    )
    started = _register()
    _edit(run_repo)

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["verdict"] is None and payload["error_class"]
    assert payload["state"] == "running"

    root = journal.control_root()
    result = _events(root, "verification.result")[0]["payload"]
    assert result["attempt"] == 1 and result["round"] == 1
    assert result["error_class"].startswith("transport:")


def test_a_served_model_from_an_excluded_provider_yields_no_verdict(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nok\n"]
    verifier.served_model_id = "a-sonnet"  # the run's own provider
    started = _register()
    _edit(run_repo)

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0
    assert payload["verdict"] is None
    assert "served-provider" in payload["error_class"]


def test_the_round_cap_hands_the_run_to_the_operator(
    run_repo, run_config, verifier
):
    verifier.responses = [ISSUES, ISSUES, ISSUES]
    started = _register()
    for value in ("VALUE = 2\n", "VALUE = 3\n"):
        _edit(run_repo, value)
        cli("verify", "--run", started["run_id"])
    _edit(run_repo, "VALUE = 4\n")

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["state"] == "waiting"
    assert "round cap" in payload["paused"]
    assert len(verifier.calls) == 2


def test_extending_rounds_also_raises_the_dispatch_ceiling(
    run_repo, run_config, verifier
):
    verifier.responses = [ISSUES, ISSUES, "VERIFIED\n\nok\n"]
    started = _register()
    for value in ("VALUE = 2\n", "VALUE = 3\n"):
        _edit(run_repo, value)
        cli("verify", "--run", started["run_id"])
    _edit(run_repo, "VALUE = 4\n")
    cli("verify", "--run", started["run_id"])

    code, resumed = cli(
        "resume", "--run", started["run_id"], "--extend-rounds", "2",
        "--attest-operator",
    )
    assert code == 0, resumed
    assert resumed["round_limit"] == 4
    assert resumed["dispatch_limit"] == 5
    assert resumed["state"] == "running"

    code, third = cli("verify", "--run", started["run_id"])
    assert code == 0 and third["round"] == 3


def test_a_waiver_is_operator_attested_and_recorded(
    run_repo, run_config, verifier
):
    verifier.responses = [ISSUES]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])

    code, refused = cli(
        "finish", "--run", started["run_id"], "--waive", "shipping anyway"
    )
    assert code == 2 and refused["refused"] == "attestation-required"

    code, finished = cli(
        "finish", "--run", started["run_id"], "--waive", "shipping anyway",
        "--attest-operator",
    )
    assert code == 0, finished
    assert finished["verdict"] == "WAIVED"

    root = journal.control_root()
    payload = _events(root, "run.finished")[-1]["payload"]
    assert payload["waiver_reason"] == "shipping anyway"


def test_there_is_no_way_to_supply_a_verdict(run_repo, run_config):
    from ai_router.runcli import build_parser

    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args([
            "finish", "--run", "r0001-x", "--verdict", "VERIFIED"
        ])


def test_verify_refuses_on_a_fast_run(run_repo, run_config):
    code, started = cli(
        "run", "--register", "--set", "001-default", "--session", "1",
        "--engine", "claude-code", "--provider", "anthropic",
        "--model", "sonnet",
    )
    assert code == 0
    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "policy-fast"


def test_verification_is_blocked_while_selection_is_unknown(
    run_repo, run_config, verifier
):
    reconfigure(run_repo, run_config, testing={
        **run_config["testing"],
        "suites": [{
            **run_config["testing"]["suites"][0],
            "covers": ["app.py", "tests/", "conftest.py", "helper.py"],
        }],
    })
    started = _register()
    (run_repo / "helper.py").write_text("X = 1\n", encoding="utf-8")

    code, payload = cli("verify", "--run", started["run_id"])
    assert code == 2
    assert payload["refused"] == "selection-unknown"
    assert verifier.calls == []


def test_the_cost_of_each_dispatch_is_recorded(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nok\n"]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])

    root = journal.control_root()
    cost = _events(root, "run.cost_updated")[0]["payload"]
    assert cost["pricing_status"] in ("priced", "unpriced")
    assert cost["usage"]["output_tokens"] == 200

    code, status = cli("status", "--run", started["run_id"])
    assert code == 0
    assert status["run"]["cost"]["dispatches"] == 1


def test_a_later_correction_replaces_a_dispatch_cost_rather_than_adding(
    run_repo, run_config, verifier
):
    verifier.responses = ["VERIFIED\n\nok\n"]
    started = _register()
    _edit(run_repo)
    cli("verify", "--run", started["run_id"])

    root = journal.control_root()
    first = _events(root, "run.cost_updated")[0]["payload"]
    view_before = json.loads(
        journal.projection_path(root).read_text(encoding="utf-8")
    )
    journal.append(
        root, event_type="run.cost_updated", run_id=started["run_id"],
        attempt=1, actor=journal.actor("framework", "seat-cost"),
        summary="measured seat cost",
        payload={
            "dispatch_id": first["dispatch_id"], "cost_usd": 0.42,
            "pricing_status": "priced", "source": "seat-measurement",
        },
    )
    from ai_router import runproject

    after = runproject.write_projection(root)
    assert after["runs"][0]["cost"]["model_usd"] == 0.42
    assert len(view_before["runs"][0]["tasks"]) >= 1
