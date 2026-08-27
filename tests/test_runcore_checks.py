"""Targeted selection, the full-suite exceptions, and the escalation
triggers that read a change's shape."""


import json

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
    # Both declarations are genuinely missing for this path, and each is
    # fixed in a different place, so both fire — in §5.3's order.
    assert _escalations(journal.control_root()) == [
        "no-declared-check", "selection-unknown",
    ]


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


def test_an_unmapped_path_escalates_a_fast_run(run_repo, run_config):
    """§5.2.1: unknown selection escalates `fast`. It is its own trigger —
    a suite covers the path, so `no-declared-check` is not the condition."""
    reconfigure(run_repo, run_config, testing={
        **run_config["testing"],
        "suites": [{
            **run_config["testing"]["suites"][0],
            "covers": ["app.py", "tests/", "conftest.py", "helper.py"],
        }],
    })
    started = _register()
    (run_repo / "helper.py").write_text("X = 1\n", encoding="utf-8")

    code, payload = cli("check", "--run", started["run_id"])
    assert code == 0, payload
    assert payload["policy"] == "verified"
    assert _escalations(journal.control_root()) == ["selection-unknown"]


@pytest.mark.parametrize("shell", [False, True])
def test_a_planted_secret_never_reaches_a_check_process(
    run_repo, run_config, monkeypatch, tmp_path, shell
):
    """The sentinel: a check command is repository configuration running on
    the operator's machine, and it must not be handed the operator's keys.
    Both spawn branches build the environment; neither inherits one."""
    import sys

    from ai_router.checks import Check, STAGE_TARGETED, execute
    from ai_router.evidence import snapshot_worktree_tree

    monkeypatch.setenv("DABBLER_ANTHROPIC_API_KEY", "sk-planted-sentinel")
    monkeypatch.setenv("GITHUB_TOKEN", "ghp-planted-sentinel")
    monkeypatch.setenv("HTTPS_PROXY", "http://user:pw@proxy.invalid:8080")
    monkeypatch.setenv("_JAVA_OPTIONS", "-javaagent:/tmp/evil.jar")
    monkeypatch.setenv("TEMP", str(tmp_path / "parent-temp"))

    argv = [
        sys.executable, "-c",
        "import json,os,sys; sys.stdout.write(json.dumps(dict(os.environ)))",
    ]
    check = Check(
        name="env-probe",
        command=" ".join(f'"{a}"' for a in argv) if shell else "",
        argv=() if shell else tuple(argv),
    )
    run = execute(
        run_repo, check, check.display_command(), stage=STAGE_TARGETED,
        tree_digest=snapshot_worktree_tree(run_repo), timeout_seconds=60,
    )
    assert run.exit_code == 0, run.output
    child = json.loads(run.output)
    assert "sk-planted-sentinel" not in json.dumps(child)
    for name in (
        "DABBLER_ANTHROPIC_API_KEY", "GITHUB_TOKEN", "HTTPS_PROXY",
        "_JAVA_OPTIONS",
    ):
        assert name not in child
    # TEMP is redirected to a scratch directory of the check's own, not
    # passed through, so a check reads neither the parent's temp contents
    # nor leaves anything there for the next one.
    assert child["TEMP"] != str(tmp_path / "parent-temp")
    assert "dabbler-check-" in child["TEMP"]
    assert child["TMP"] == child["TEMP"]
    # It is an allowlist, not a scrub: the toolchain still finds itself.
    assert child["PATH"]
