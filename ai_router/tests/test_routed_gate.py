"""Tests for the Set 068 S6 per-session routed-verification gating predicate.

Pins the trigger logic (the Set 066 blast-radius core + the session-level
multi-module / breadth / build-ci-config triggers + the three operator
overrides), the bypass condition, the override-can-only-raise invariant,
ASCII-only output, and the CLI exit-code contract.
"""

from __future__ import annotations

import json

import routed_gate as rg  # conftest puts ai_router/ on sys.path


class TestBlastRadiusTrigger:
    def test_wiring_file_trips_blast_radius(self):
        # close_session.py is a WIRING signal in blast_radius -> p_set true.
        d = rg.evaluate_routed_gate(["ai_router/close_session.py"])
        assert d.required is True
        assert rg.TRIGGER_BLAST_RADIUS in d.triggers

    def test_schema_file_trips_blast_radius(self):
        d = rg.evaluate_routed_gate(["docs/path-aware-critique.schema.json"])
        assert d.required is True
        assert rg.TRIGGER_BLAST_RADIUS in d.triggers


class TestMultiModuleTrigger:
    def test_two_distinct_modules_trip(self):
        d = rg.evaluate_routed_gate(
            ["ai_router/metrics.py", "docs/quick-start.md"]
        )
        assert d.required is True
        assert rg.TRIGGER_MULTI_MODULE in d.triggers
        assert d.files == 2
        assert set(d.modules) == {"ai_router", "docs"}

    def test_two_files_same_module_no_multi_module(self):
        # Two files in one module, neither a coupling signal -> multi-module
        # does NOT fire; with no other trigger the diff bypasses.
        d = rg.evaluate_routed_gate(
            ["ai_router/foo_helper.py", "ai_router/bar_helper.py"]
        )
        assert rg.TRIGGER_MULTI_MODULE not in d.triggers
        assert d.required is False


class TestBreadthTrigger:
    def test_four_files_one_module_trips_breadth(self):
        paths = [f"pkg/mod/file_{i}.py" for i in range(4)]
        d = rg.evaluate_routed_gate(paths)
        assert d.required is True
        assert rg.TRIGGER_BREADTH in d.triggers
        # single module -> multi-module must NOT be the reason it tripped
        assert rg.TRIGGER_MULTI_MODULE not in d.triggers

    def test_three_files_below_default_threshold(self):
        paths = [f"pkg/mod/file_{i}.py" for i in range(3)]
        d = rg.evaluate_routed_gate(paths)
        assert rg.TRIGGER_BREADTH not in d.triggers
        assert d.required is False

    def test_breadth_threshold_is_tunable(self):
        paths = [f"pkg/mod/file_{i}.py" for i in range(3)]
        d = rg.evaluate_routed_gate(paths, breadth_threshold=3)
        assert rg.TRIGGER_BREADTH in d.triggers
        assert d.required is True

    def test_nonsensical_threshold_coerced_to_one(self):
        # A zero/negative threshold is meaningless; it is coerced to 1, so a
        # 1-file diff still trips breadth and an empty diff still does not.
        d1 = rg.evaluate_routed_gate(["pkg/leaf.py"], breadth_threshold=0)
        assert rg.TRIGGER_BREADTH in d1.triggers
        assert d1.required is True
        d0 = rg.evaluate_routed_gate([], breadth_threshold=-5)
        assert rg.TRIGGER_BREADTH not in d0.triggers
        assert d0.required is False


class TestBuildCiConfigTrigger:
    def test_github_workflow_trips(self):
        d = rg.evaluate_routed_gate([".github/workflows/test.yml"])
        assert d.required is True
        assert rg.TRIGGER_BUILD_CI_CONFIG in d.triggers

    def test_pyproject_trips(self):
        d = rg.evaluate_routed_gate(["pyproject.toml"])
        assert d.required is True
        assert rg.TRIGGER_BUILD_CI_CONFIG in d.triggers

    def test_isolated_router_config_trips_build_ci_config_directly(self):
        # A single config-only diff must trip the NAMED build-ci-config trigger
        # directly, not rely on the blast_radius INDEX signal to rescue it.
        d = rg.evaluate_routed_gate(["ai_router/router-config.yaml"])
        assert d.required is True
        assert rg.TRIGGER_BUILD_CI_CONFIG in d.triggers


class TestBypass:
    def test_single_probe_covered_file_bypasses(self):
        d = rg.evaluate_routed_gate(["ai_router/some_leaf_module.py"])
        assert d.required is False
        assert d.triggers == ()
        assert d.files == 1
        assert d.modules == ("ai_router",)

    def test_empty_diff_bypasses(self):
        d = rg.evaluate_routed_gate([])
        assert d.required is False
        assert d.files == 0
        assert d.modules == ()

    def test_dedupes_repeated_paths(self):
        d = rg.evaluate_routed_gate(
            ["ai_router/leaf.py", "ai_router/leaf.py"]
        )
        assert d.files == 1
        assert d.required is False


class TestOverridesRaiseOnly:
    def test_contract_uncovered_raises_a_bypass_diff(self):
        base = rg.evaluate_routed_gate(["ai_router/leaf.py"])
        assert base.required is False
        raised = rg.evaluate_routed_gate(
            ["ai_router/leaf.py"], contract_uncovered=True
        )
        assert raised.required is True
        assert rg.TRIGGER_CONTRACT_UNCOVERED in raised.triggers

    def test_high_blast_raises(self):
        d = rg.evaluate_routed_gate(["ai_router/leaf.py"], high_blast=True)
        assert d.required is True
        assert rg.TRIGGER_HIGH_BLAST in d.triggers

    def test_post_failed_loop_raises(self):
        d = rg.evaluate_routed_gate(
            ["ai_router/leaf.py"], post_failed_loop=True
        )
        assert d.required is True
        assert rg.TRIGGER_POST_FAILED_LOOP in d.triggers

    def test_overrides_cannot_lower_a_tripped_diff(self):
        # Enabling EVERY override on an already-REQUIRED diff must keep it
        # REQUIRED and preserve the diff's own triggers -- overrides only add.
        base = rg.evaluate_routed_gate(["ai_router/close_session.py"])
        assert base.required is True
        assert rg.TRIGGER_BLAST_RADIUS in base.triggers
        raised = rg.evaluate_routed_gate(
            ["ai_router/close_session.py"],
            contract_uncovered=True,
            high_blast=True,
            post_failed_loop=True,
        )
        assert raised.required is True
        # the original (blast-radius) trigger is still present...
        assert rg.TRIGGER_BLAST_RADIUS in raised.triggers
        # ...and the overrides only ADDED triggers (superset, never a subset).
        assert set(base.triggers).issubset(set(raised.triggers))


class TestTriggerOrderAndReasons:
    def test_triggers_in_exact_canonical_order(self):
        # Craft an input whose expected trigger SET is known, and assert the
        # exact tuple (set + order), not merely that it is sorted.
        d = rg.evaluate_routed_gate(
            [".github/workflows/test.yml", "ai_router/close_session.py"],
            high_blast=True,
        )
        assert d.triggers == (
            rg.TRIGGER_BLAST_RADIUS,      # close_session.py -> wiring
            rg.TRIGGER_MULTI_MODULE,      # ai_router + .github
            rg.TRIGGER_BUILD_CI_CONFIG,   # the workflow yml
            rg.TRIGGER_HIGH_BLAST,        # the override
        )

    def test_at_least_one_reason_per_tripped_trigger(self):
        d = rg.evaluate_routed_gate(
            ["ai_router/close_session.py", "docs/x.md"]
        )
        assert d.required is True
        # every tripped trigger must be substantiated by at least one reason;
        # reasons can exceed triggers (e.g. several build-config matches), so
        # the count is a floor, and each trigger name should be evidenced.
        assert len(d.reasons) >= len(d.triggers)
        assert rg.TRIGGER_BLAST_RADIUS in d.triggers
        assert rg.TRIGGER_MULTI_MODULE in d.triggers


class TestRenderAscii:
    def test_render_is_ascii_required(self):
        d = rg.evaluate_routed_gate(["ai_router/close_session.py"])
        text = d.render()
        text.encode("ascii")  # raises if any non-ASCII glyph
        assert "REQUIRED" in text

    def test_render_is_ascii_bypass(self):
        d = rg.evaluate_routed_gate(["ai_router/leaf.py"])
        text = d.render()
        text.encode("ascii")
        assert "SKIP" in text


class TestCli:
    """Set 083: the CLI is retired as a skip authority. It always answers
    REQUIRED (exit 0) regardless of the predicate; the predicate's verdict
    survives only as informational output (text + ``predicate_required``).
    """

    def test_cli_required_exits_zero(self, capsys):
        code = rg.main(["ai_router/close_session.py"])
        assert code == rg.EXIT_REQUIRED == 0
        out = capsys.readouterr().out
        assert "REQUIRED (always)" in out
        assert "verify_session" in out

    def test_cli_predicate_skip_still_exits_zero_required(self, capsys):
        # The 2026-07-06 incident shape: a diff the predicate would have
        # skipped (or an empty path list) must NOT authorize a skip.
        for argv in (["ai_router/leaf.py"], []):
            code = rg.main(argv)
            assert code == rg.EXIT_REQUIRED == 0
            out = capsys.readouterr().out
            assert "REQUIRED (always)" in out
            assert "mandatory" in out.lower()

    def test_cli_output_is_ascii(self, capsys):
        code = rg.main([])
        assert code == 0
        capsys.readouterr().out.encode("ascii")

    def test_cli_json_always_exits_zero(self, capsys):
        code = rg.main(["--json", "ai_router/leaf.py"])
        assert code == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["required"] is True
        assert payload["retired"] is True
        assert payload["predicate_required"] is False
        assert payload["files"] == 1
        assert payload["triggers"] == []

    def test_cli_json_required_payload(self, capsys):
        code = rg.main(["--json", "ai_router/close_session.py", "docs/x.md"])
        assert code == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["required"] is True
        assert payload["predicate_required"] is True
        assert rg.TRIGGER_BLAST_RADIUS in payload["triggers"]
        assert rg.TRIGGER_MULTI_MODULE in payload["triggers"]

    def test_cli_override_flag(self, capsys):
        code = rg.main(["--high-blast", "ai_router/leaf.py"])
        assert code == rg.EXIT_REQUIRED
        assert "high-blast" in capsys.readouterr().out
