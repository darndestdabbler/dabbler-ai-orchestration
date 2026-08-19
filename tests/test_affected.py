"""Affected-test selection: the reasons, and the refusal to widen."""

from __future__ import annotations

import pytest

from ai_router.affected import (
    REASON_CONFIGURED_RULE,
    REASON_DEPENDENCY_EDGE,
    REASON_MODULE_OWNERSHIP,
    REASON_SMOKE,
    RISK_SELECTION_UNKNOWN,
    SelectionConfig,
    load_selection_config,
    select_tests,
)


@pytest.fixture
def tree(tmp_path):
    """A miniature package plus tests, with one real dependency edge:
    ``widget`` imports ``engine``, so a change to ``engine`` reaches
    ``test_widget`` without ``test_widget`` naming it."""
    pkg = tmp_path / "ai_router"
    pkg.mkdir()
    (pkg / "__init__.py").write_text("", encoding="utf-8")
    (pkg / "engine.py").write_text("VALUE = 1\n", encoding="utf-8")
    (pkg / "widget.py").write_text(
        "from .engine import VALUE\n", encoding="utf-8"
    )
    (pkg / "lonely.py").write_text("X = 2\n", encoding="utf-8")

    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "test_widget.py").write_text(
        "from ai_router.widget import VALUE\n", encoding="utf-8"
    )
    (tests / "test_engine.py").write_text(
        "from ai_router.engine import VALUE\n", encoding="utf-8"
    )
    (tests / "test_smoke.py").write_text("", encoding="utf-8")
    return tmp_path


@pytest.fixture
def selection():
    return SelectionConfig(
        test_root="tests",
        smoke=("tests/test_smoke.py",),
        repo_wide=("tests/conftest.py", "pytest.ini"),
        rules=(("docs/", ()), ("ai_router/router-config.yaml",
                               ("tests/test_engine.py",))),
    )


class TestReasons:
    def test_ownership_and_dependency_edges_each_name_their_reason(
        self, tree, selection
    ):
        result = select_tests(tree, ["ai_router/engine.py"], selection)
        by_path = {s.path: s for s in result.selected}

        assert by_path["tests/test_engine.py"].reason == (
            REASON_MODULE_OWNERSHIP
        )
        # test_widget never mentions engine; the edge through widget is what
        # selects it, and the record says so.
        assert by_path["tests/test_widget.py"].reason == (
            REASON_DEPENDENCY_EDGE
        )
        assert all(s.selected_by == "ai_router/engine.py"
                   for s in result.selected)
        assert not result.all_tests_affected
        # The unrelated smoke test is not pulled in by a mapped change.
        assert "tests/test_smoke.py" not in by_path

    def test_a_configured_rule_selects_what_convention_cannot(
        self, tree, selection
    ):
        result = select_tests(
            tree, ["ai_router/router-config.yaml"], selection
        )
        assert result.test_paths == ("tests/test_engine.py",)
        assert result.selected[0].reason == REASON_CONFIGURED_RULE
        assert not result.risks


class TestUncertaintyIsNotPermission:
    def test_an_unmapped_path_raises_risk_and_runs_smoke_only(
        self, tree, selection
    ):
        result = select_tests(tree, ["scripts/deploy.rb"], selection)

        assert result.unknown_paths == ("scripts/deploy.rb",)
        assert result.risks[0].kind == RISK_SELECTION_UNKNOWN
        # The whole point: uncertainty buys the smoke tests, not the suite.
        assert result.test_paths == ("tests/test_smoke.py",)
        assert result.selected[0].reason == REASON_SMOKE
        assert not result.all_tests_affected

    def test_an_uncollected_test_support_file_is_not_silently_mapped(
        self, tree, selection
    ):
        """Living under the test root is not a mapping. A shared helper that
        no rule covers must raise risk, not return a clean empty result."""
        (tree / "tests" / "helpers.py").write_text("X = 1\n", encoding="utf-8")
        result = select_tests(tree, ["tests/helpers.py"], selection)

        assert result.unknown_paths == ("tests/helpers.py",)
        assert result.test_paths == ("tests/test_smoke.py",)
        assert not result.all_tests_affected

    def test_an_empty_rule_target_is_a_mapping_not_an_unknown(
        self, tree, selection
    ):
        result = select_tests(tree, ["docs/plan.md"], selection)

        assert result.test_paths == ()
        assert result.risks == ()
        assert not result.all_tests_affected

    def test_only_a_declared_repo_wide_path_proves_every_test_affected(
        self, tree, selection
    ):
        result = select_tests(tree, ["tests/conftest.py"], selection)
        assert result.all_tests_affected
        assert "conftest" in result.all_affected_reason

        # A source change that touches many tests still is not "all".
        assert not select_tests(
            tree, ["ai_router/engine.py"], selection
        ).all_tests_affected


class TestDeclarationErrors:
    def test_a_malformed_rule_is_an_error_not_a_silent_drop(self):
        loaded = load_selection_config({"testing": {"selection": {
            "rules": [{"when": "ai_router/", "selct": ["tests/test_a.py"]}],
        }}})
        assert not loaded.ok
        assert any("select" in e for e in loaded.errors)
