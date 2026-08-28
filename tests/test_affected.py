"""Affected-test selection: the reasons, the refusal to widen, and the
policy a pre-verification command is held to."""

from __future__ import annotations

import pytest

from ai_router.affected import (
    REASON_CHANGED_TEST,
    REASON_CONFIGURED_RULE,
    REASON_SMOKE,
    RISK_SELECTION_UNKNOWN,
    SelectionConfig,
    SuiteScope,
    classify_preverify_command,
    load_selection_config,
    names_a_test,
    preverify_gate,
    select_tests,
    targeted_command,
)
from ai_router.test_evidence import (
    POLICY_ALL_TESTS_AFFECTED,
    POLICY_OPERATOR_OVERRIDE,
    POLICY_SUITE_WHOLE,
    POLICY_TARGETED,
    POLICY_VIOLATION,
)


@pytest.fixture
def tree(tmp_path):
    """A miniature repository: some source, some tests, and one file under
    the test root that is not itself a test."""
    pkg = tmp_path / "ai_router"
    pkg.mkdir()
    (pkg / "engine.py").write_text("VALUE = 1\n", encoding="utf-8")

    tests = tmp_path / "tests"
    tests.mkdir()
    (tests / "test_engine.py").write_text("X = 1\n", encoding="utf-8")
    (tests / "test_widget.py").write_text("X = 1\n", encoding="utf-8")
    (tests / "test_smoke.py").write_text("", encoding="utf-8")
    (tests / "helpers.py").write_text("X = 1\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def selection():
    return SelectionConfig(
        scopes=(SuiteScope("python", ("tests",), "test_*.py"),),
        smoke=("tests/test_smoke.py",),
        repo_wide=("tests/conftest.py", "pytest.ini"),
        rules=(
            ("docs/", ()),
            ("ai_router/router-config.yaml", ("tests/test_engine.py",)),
            ("ai_router/engine.py",
             ("tests/test_engine.py", "tests/test_widget.py")),
        ),
    )


class TestReasons:
    def test_what_counts_as_a_test_is_declared_not_guessed(
        self, tree, selection
    ):
        """A changed path is a test when the repository's own declaration
        says so -- under a declared root, matching the declared glob. A
        helper that sits beside the tests is not one: treating it as mapped
        would return clean targeted evidence for a change that can break
        every test using it."""
        result = select_tests(tree, ["tests/test_engine.py"], selection)
        assert result.test_paths == ("tests/test_engine.py",)
        assert result.selected[0].reason == REASON_CHANGED_TEST
        assert not result.risks

        helper = select_tests(tree, ["tests/helpers.py"], selection)
        assert helper.unknown_paths == ("tests/helpers.py",)
        assert helper.test_paths == ("tests/test_smoke.py",)
        assert not helper.all_tests_affected

    def test_a_configured_rule_is_the_only_route_from_source_to_test(
        self, tree, selection
    ):
        """No import graph and no naming convention: a source path reaches a
        test because the repository declared that it does, and the record
        names the path that did it."""
        result = select_tests(tree, ["ai_router/engine.py"], selection)

        assert result.test_paths == (
            "tests/test_engine.py", "tests/test_widget.py",
        )
        assert all(s.reason == REASON_CONFIGURED_RULE for s in result.selected)
        assert all(s.selected_by == "ai_router/engine.py"
                   for s in result.selected)
        assert not result.risks
        # The unrelated smoke test is not pulled in by a mapped change.
        assert "tests/test_smoke.py" not in result.test_paths


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


class TestSuitesDeclareWhatATestIs:
    """A repository that is Java and .NET at once has two test roots and two
    globs, so the declaration is per suite. One glob per repository could
    only ever describe the first ecosystem."""

    TWO_ECOSYSTEMS = {"testing": {"suites": [
        {"name": "maven", "command": "mvn -q test", "covers": ["src/"],
         "test_roots": ["src/test/java"], "test_glob": "*Test.java"},
        {"name": "dotnet", "command": "dotnet test", "covers": ["src/"],
         "test_roots": ["test"], "test_glob": "*Tests.cs"},
    ]}}

    def test_each_suite_s_own_convention_names_a_test(self):
        selection = load_selection_config(self.TWO_ECOSYSTEMS).config
        assert names_a_test("src/test/java/AdderTest.java", selection)
        assert names_a_test("test/AdderTests.cs", selection)
        # Each suite's glob is confined to that suite's roots: the .NET
        # convention under the Java root is not a test, and treating it as
        # one would offer a verifier a write nothing would run.
        assert not names_a_test("src/test/java/AdderTests.cs", selection)
        assert not names_a_test("src/main/java/Adder.java", selection)

    def test_the_declaration_is_read_without_any_selection_rules(self):
        """A repository with one suite and no mapping rules still knows what
        a test file looks like; the two declarations are independent."""
        selection = load_selection_config(self.TWO_ECOSYSTEMS).config
        assert selection.rules == ()
        assert selection.declares_tests
        assert selection.test_roots == ("src/test/java", "test")

    def test_a_root_with_no_glob_is_refused(self):
        """It would make a test of every file under the root, including the
        fixtures and helpers that live beside them."""
        loaded = load_selection_config({"testing": {"suites": [
            {"name": "maven", "command": "mvn -q test",
             "test_roots": ["src/test/java"]},
        ]}})
        assert not loaded.ok
        assert any("test_glob" in e for e in loaded.errors)

    def test_the_old_repository_wide_declaration_is_refused_by_name(self):
        """Left readable in testing.selection it would be a second answer to
        what a test is, and the two would disagree the first time a
        repository ran two ecosystems."""
        loaded = load_selection_config({"testing": {
            "suites": [{"name": "python", "command": "pytest",
                        "test_roots": ["tests"], "test_glob": "test_*.py"}],
            "selection": {"test_roots": ["spec"], "test_glob": "*_spec.py"},
        }})
        assert not loaded.ok
        assert any("testing.suites" in e for e in loaded.errors)

    def test_a_suite_that_runs_no_test_files_contributes_no_scope(self):
        """A suite may run something that is not a test file at all. Saying
        nothing is how a repository says so, and it must not be read as a
        root of "" that would make a test of anything anywhere."""
        loaded = load_selection_config({"testing": {"suites": [
            {"name": "smoke", "command": "python smoke.py"},
        ]}})
        assert loaded.ok
        assert loaded.config.scopes == ()
        assert not loaded.config.declares_tests


class TestPreverificationPolicy:
    def test_a_full_suite_run_is_not_pre_verification_evidence(
        self, tree, selection
    ):
        result = select_tests(tree, ["ai_router/engine.py"], selection)
        sanctioned = targeted_command("python -m pytest", result)

        # The whole set exists for this line: the habitual command, on an
        # ordinary change, buys nothing.
        verdict = classify_preverify_command("python -m pytest", result)
        assert verdict.policy == POLICY_VIOLATION
        assert not verdict.accepted
        assert set(verdict.missing) == set(result.test_paths)

        # Nor does pointing the runner at the directory they live in.
        assert classify_preverify_command(
            "python -m pytest tests/", result
        ).policy == POLICY_VIOLATION

        # The selector's own command passes, node ids included.
        assert classify_preverify_command(sanctioned, result).policy == (
            POLICY_TARGETED
        )
        assert classify_preverify_command(
            "python -m pytest tests/test_engine.py::TestX::test_y "
            "tests/test_widget.py",
            result,
        ).policy == POLICY_TARGETED

    def test_a_runner_that_takes_no_file_list_runs_whole_and_says_so(
        self, tree, selection
    ):
        """`mvn -q test src/test/java/AdderTest.java` reads the path as a
        lifecycle argument and `dotnet test` wants a project, so appending
        the selected files would emit a command nobody can run — under a
        policy name claiming it proved something. A suite that declares
        `runs_whole` is handed its own command instead, recorded under its
        own policy so a reader can still tell it from a narrowed run."""
        result = select_tests(tree, ["ai_router/engine.py"], selection)

        assert targeted_command(
            "mvn -q test", result, runs_whole=True
        ) == "mvn -q test"

        verdict = classify_preverify_command(
            "mvn -q test", result,
            runs_whole=True, declared_command="mvn -q test",
        )
        assert verdict.policy == POLICY_SUITE_WHOLE
        assert verdict.accepted

        # It sanctions that command and no other: `runs_whole` is a
        # statement about the runner, not permission to run anything.
        assert classify_preverify_command(
            "mvn -q test -DskipTests", result,
            runs_whole=True, declared_command="mvn -q test",
        ).policy == POLICY_VIOLATION

        # And it is not a back door for a runner that does take a file
        # list: undeclared, the bare command is still a violation.
        assert classify_preverify_command(
            "python -m pytest", result
        ).policy == POLICY_VIOLATION

    def test_a_proved_repo_wide_change_carries_its_own_exception(
        self, tree, selection
    ):
        result = select_tests(tree, ["tests/conftest.py"], selection)
        verdict = classify_preverify_command("python -m pytest", result)

        assert verdict.policy == POLICY_ALL_TESTS_AFFECTED
        assert verdict.accepted
        # Proved, not asserted: the record carries what proved it.
        assert "conftest" in verdict.reason
        assert targeted_command("python -m pytest", result) == (
            "python -m pytest"
        )

    def test_an_operator_override_is_an_exception_only_with_a_reason(
        self, tree, selection
    ):
        result = select_tests(tree, ["ai_router/engine.py"], selection)

        given = classify_preverify_command(
            "python -m pytest", result,
            override_reason="pytest plugin upgrade; selection is untrusted",
        )
        assert given.policy == POLICY_OPERATOR_OVERRIDE
        assert given.reason.startswith("pytest plugin upgrade")

        blank = classify_preverify_command(
            "python -m pytest", result, override_reason="   ",
        )
        assert blank.policy == POLICY_VIOLATION

    def test_a_change_affecting_no_test_asks_for_no_run_and_accepts_none(
        self, tree, selection
    ):
        """Zero selected tests is the most ordinary change there is. If it
        sanctioned the bare suite command, the policy would recommend the
        one run it exists to refuse."""
        result = select_tests(tree, ["docs/plan.md"], selection)
        assert not result.all_tests_affected and not result.test_paths

        assert targeted_command("python -m pytest", result) == ""
        assert classify_preverify_command(
            "python -m pytest", result
        ).policy == POLICY_VIOLATION


class TestTheGate:
    CONFIG = {"testing": {
        "suites": [{"name": "python", "command": "python -m pytest",
                    "covers": ["docs/"], "expensive": True,
                    "test_roots": ["tests"], "test_glob": "test_*.py"}],
        "selection": {"repo_wide": ["pyproject.toml"],
                      "rules": [
            {"when": "docs/", "select": []},
            {"when": "src/", "select": ["tests/test_thing.py"]},
        ]},
    }}

    def test_evidence_is_skipped_only_for_a_declared_empty_mapping(
        self, sandbox_repo
    ):
        """"Nothing is affected" and "nobody knows what is affected" look
        identical from the selected-test list and must never be treated
        alike: the second is the state the whole stage exists to surface."""
        repo, sessions_dir = sandbox_repo
        (repo / "docs" / "notes.md").write_text("x\n", encoding="utf-8")
        assert preverify_gate(repo, sessions_dir, self.CONFIG).ok

        (repo / "scripts").mkdir()
        (repo / "scripts" / "deploy.rb").write_text("x\n", encoding="utf-8")
        gate = preverify_gate(repo, sessions_dir, self.CONFIG)
        assert not gate.ok
        assert "scripts/deploy.rb" in gate.reason
        # No command is offered, because none would measure anything.
        assert gate.command == ""

        # And a mapped path alongside it does not cover for it: tests chosen
        # for one file say nothing about the file nothing chose tests for.
        (repo / "src").mkdir()
        (repo / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
        mixed = preverify_gate(repo, sessions_dir, self.CONFIG)
        assert not mixed.ok
        assert "scripts/deploy.rb" in mixed.reason

    def test_a_remediation_is_measured_by_the_fix_not_the_session(
        self, sandbox_repo
    ):
        """A repository-wide edit buys one full run, at the round that
        reviewed it. Judging later rounds against HEAD would re-buy it every
        time, which is how this stage would end up prescribing the very run
        it exists to delete."""
        from ai_router import ledger
        from ai_router.evidence import snapshot_worktree_tree
        from ai_router.session import register_session_start

        repo, sessions_dir = sandbox_repo
        register_session_start(sessions_dir, 1, engine="claude-code",
                               provider="anthropic")
        (repo / "pyproject.toml").write_text("[p]\n", encoding="utf-8")
        assert preverify_gate(repo, sessions_dir, self.CONFIG).command == (
            "python -m pytest"
        )

        ledger.append_round(repo, 1, {
            "round": 1, "verdict": "ISSUES_FOUND", "blocking": True,
            "findings": [], "recorded_at": "2026-08-19T18:00:00-04:00",
            "verifier_model": "m", "verifier_provider": "openai",
            "completion_tree": snapshot_worktree_tree(repo),
        })
        (repo / "src").mkdir()
        (repo / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")

        gate = preverify_gate(repo, sessions_dir, self.CONFIG)
        assert gate.command == "python -m pytest tests/test_thing.py"


class TestNextCommandMessages:
    """Every message that asks for pre-verification evidence names the whole
    recipe. Naming the run without the record, or the round without the run,
    leaves the reader one refusal short of where the message implied."""

    def test_the_preverify_recipe_names_the_run_and_the_record(self):
        from ai_router.affected import preverify_recipe

        text = preverify_recipe("docs/sessions", "python",
                                "python -m pytest tests/test_thing.py")
        assert "python -m pytest tests/test_thing.py" in text
        assert "--stage preverify-targeted" in text
        assert "--suite python" in text

    def test_the_remediation_recipe_routes_back_through_the_selector(self):
        """A blocking round that said only 're-run verify' would earn a
        refusal at the gate: the fix moved the surfaces, so the evidence the
        round was opened on no longer answers for them."""
        from ai_router.affected import remediation_recipe

        text = remediation_recipe("docs/sessions", "python")
        assert "ai_router.affected" in text
        assert "--stage preverify-targeted" in text
        assert "ai_router.verify" in text
