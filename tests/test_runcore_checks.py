"""Targeted selection, the full-suite exceptions, and the escalation
triggers that read a change's shape."""


import pytest

from ai_router import journal
from ai_router.checks import CheckConfigError, load_checks
from tests.conftest import cli, reconfigure

REGISTER = (
    "run", "--register", "--set", "001-default", "--session", "1",
    "--engine", "claude-code", "--provider", "anthropic", "--model", "sonnet",
)


def _register():
    code, payload = cli(*REGISTER)
    assert code == 0, payload
    return payload


def _commands(root, stage):
    return [
        e["payload"]["command"] for e in journal.read_events(root)
        if e["event_type"] == "check.started"
        and e["payload"]["stage"] == stage
    ]


def _escalations(root):
    return [
        e["payload"]["trigger"] for e in journal.read_events(root)
        if e["event_type"] == "escalation.triggered"
    ]


def test_targeted_runs_only_the_tests_the_change_maps_to(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0, payload
    assert [s["path"] for s in payload["selection"]["selected"]] == [
        "tests/test_app.py"
    ]
    suite = [c for c in _commands(journal.control_root(), "targeted")
             if "checkrunner.py" in c]
    assert suite and suite[0].endswith("tests/test_app.py")


def test_a_declared_control_runs_at_the_targeted_stage(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert {c["check_id"] for c in payload["checks"]} == {"unit", "lint"}


def test_a_repository_wide_change_proves_the_whole_suite_affected(
    run_repo, run_config
):
    started = _register()
    (run_repo / "conftest.py").write_text("# shared\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert payload["selection"]["allTestsAffected"] is True
    suite = [c for c in _commands(journal.control_root(), "targeted")
             if "checkrunner.py" in c]
    assert suite and not suite[0].endswith(".py test")


def test_a_small_suite_may_run_complete_at_the_targeted_stage(
    run_repo, run_config
):
    reconfigure(run_repo, run_config, testing={
        **run_config["testing"],
        "suites": [{**run_config["testing"]["suites"][0], "small": True}],
    })
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert payload["selection"]["policy"] == "suite-declared-small"


def test_the_operator_override_needs_an_attestation(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli(
        "check", "--run", started["run_id"], "--allow-full", "one-off sweep"
    )
    assert code == 2
    assert payload["refused"] == "attestation-required"


def test_an_attested_override_journals_its_reason(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli(
        "check", "--run", started["run_id"], "--allow-full", "one-off sweep",
        "--attest-operator",
    )
    assert code == 0
    assert payload["selection"]["policy"] == "operator-override"


def test_a_fresh_green_check_is_not_paid_for_twice(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    cli("check", "--run", started["run_id"])
    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert sorted(payload["fresh"]) == ["lint", "unit"]
    assert payload["checks"] == []


def test_an_edit_invalidates_the_prior_check(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
    cli("check", "--run", started["run_id"])
    (run_repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert payload["fresh"] == []
    assert {c["check_id"] for c in payload["checks"]} == {"unit", "lint"}


def test_an_unmapped_path_runs_smoke_and_records_the_risk(
    run_repo, run_config
):
    started = _register()
    (run_repo / "helper.py").write_text("X = 1\n", encoding="utf-8")
    reconfigure(run_repo, run_config, testing={
        **run_config["testing"],
        "suites": [{
            **run_config["testing"]["suites"][0],
            "covers": ["app.py", "helper.py", "tests/"],
        }],
    })

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert [r["path"] for r in payload["selection"]["risks"]] == ["helper.py"]
    assert [s["path"] for s in payload["selection"]["selected"]] == [
        "tests/test_smoke.py"
    ]


def test_a_change_no_declared_check_covers_escalates(run_repo, run_config):
    started = _register()
    (run_repo / "README.md").write_text("# scratch\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0
    assert payload["policy"] == "verified"
    assert _escalations(journal.control_root()) == ["no-declared-check"]


def test_a_sensitive_path_escalates_once(run_repo, run_config):
    reconfigure(run_repo, run_config, run_policy={
        **run_config["run_policy"], "sensitive_paths": ["app.py"],
    })
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    cli("check", "--run", started["run_id"])
    (run_repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
    cli("check", "--run", started["run_id"])

    assert _escalations(journal.control_root()) == ["sensitive-path"]


def test_an_oversized_diff_escalates(run_repo, run_config):
    reconfigure(run_repo, run_config, run_policy={
        **run_config["run_policy"], "diff_limit_lines": 5,
    })
    started = _register()
    (run_repo / "app.py").write_text("X = 1\n" * 40, encoding="utf-8")

    cli("check", "--run", started["run_id"])
    assert "diff-limit" in _escalations(journal.control_root())


def test_an_uncertain_checkpoint_escalates(run_repo, run_config):
    started = _register()
    code, payload = cli(
        "checkpoint", "--run", started["run_id"], "--note", "unsure about the "
        "locking", "--uncertain",
    )
    assert code == 0
    assert payload["policy"] == "verified"
    assert _escalations(journal.control_root()) == ["agent-uncertain"]


def test_the_operator_can_escalate_and_it_fires_once(run_repo, run_config):
    started = _register()
    code, first = cli("escalate", "--run", started["run_id"])
    assert code == 0 and first["policy"] == "verified"
    cli("escalate", "--run", started["run_id"])

    assert _escalations(journal.control_root()) == ["operator-request"]


def test_final_full_before_verification_is_refused_on_a_verified_run(
    run_repo, run_config
):
    started = _register()
    cli("escalate", "--run", started["run_id"])
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")

    code, payload = cli(
        "check", "--run", started["run_id"], "--stage", "final-full"
    )
    assert code == 2
    assert payload["refused"] == "verification-required"


def test_a_repeated_check_failure_escalates(run_repo, run_config):
    started = _register()
    (run_repo / "app.py").write_text("VALUE = 2\n", encoding="utf-8")
    (run_repo / "FAIL").write_text("", encoding="utf-8")
    cli("check", "--run", started["run_id"])
    (run_repo / "app.py").write_text("VALUE = 3\n", encoding="utf-8")
    cli("check", "--run", started["run_id"])

    assert "repeated-check-failure" in _escalations(journal.control_root())


@pytest.mark.parametrize("entry, message", [
    ({"name": "a", "kind": "lint", "covers": []}, "neither"),
    (
        {"name": "a", "kind": "lint", "command": "x", "argv": ["y"],
         "covers": []},
        "both",
    ),
    ({"name": "a", "kind": "nope", "argv": ["y"], "covers": []}, "kind"),
    ({"name": "unit", "kind": "lint", "argv": ["y"], "covers": []}, "twice"),
])
def test_a_broken_check_declaration_is_refused_at_load(entry, message):
    config = {
        "testing": {
            "suites": [{"name": "unit", "command": "x", "covers": []}],
            "controls": [entry],
        }
    }
    with pytest.raises(CheckConfigError, match=message):
        load_checks(config)


def test_a_glob_in_covers_is_refused(run_repo, run_config):
    config = {"testing": {"suites": [
        {"name": "unit", "command": "x", "covers": ["src/**/*.py"]}
    ]}}
    with pytest.raises(CheckConfigError, match="glob"):
        load_checks(config)
