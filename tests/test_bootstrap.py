import json

from ai_router.bootstrap import (
    MANAGED_END,
    MANAGED_START,
    SCOPE_MACHINE,
    SCOPE_USER,
    _manual_persist_hint,
    ensure_gitignore,
    main,
    persist_transport_preference,
    resolve_bootstrap_transport,
    write_instruction_files,
)


class TestPersistenceScope:
    """The preference is a property of the operator's account. A machine
    whose admin account is a different user gains nothing from a
    machine-scope write, and the account that runs the router never sees
    it — so user scope is the default and machine scope is opt-in."""

    def _record_writes(self, monkeypatch, *, machine_ok=False, user_ok=True,
                       elevated=True):
        calls = []

        def writer(name, value, *, machine):
            calls.append({"name": name, "value": value, "machine": machine})
            return machine_ok if machine else user_ok
        monkeypatch.setattr(
            "ai_router.bootstrap._persist_env_var_windows", writer
        )
        monkeypatch.setattr(
            "ai_router.bootstrap._persist_env_var_posix", writer
        )
        monkeypatch.setattr(
            "ai_router.bootstrap.is_elevated", lambda: elevated
        )
        return calls

    def test_default_is_user_scope(self, monkeypatch):
        calls = self._record_writes(monkeypatch)
        assert persist_transport_preference("copilot-cli") == SCOPE_USER
        assert [c["machine"] for c in calls] == [False]

    def test_elevated_machine_request_writes_machine_scope(self, monkeypatch):
        self._record_writes(monkeypatch, machine_ok=True, elevated=True)
        assert persist_transport_preference(
            "copilot-cli", machine=True
        ) == SCOPE_MACHINE

    def test_unelevated_machine_request_falls_back_to_user_scope(
        self, monkeypatch
    ):
        """A preference that landed for the operator beats one that landed
        nowhere; the caller reports the downgrade."""
        calls = self._record_writes(monkeypatch, elevated=False)
        assert persist_transport_preference(
            "copilot-cli", machine=True
        ) == SCOPE_USER
        assert [c["machine"] for c in calls] == [False]

    def test_failed_machine_write_falls_back_to_user_scope(self, monkeypatch):
        calls = self._record_writes(
            monkeypatch, machine_ok=False, elevated=True
        )
        assert persist_transport_preference(
            "copilot-cli", machine=True
        ) == SCOPE_USER
        assert [c["machine"] for c in calls] == [True, False]

    def test_failure_at_every_scope_reports_nothing_landed(self, monkeypatch):
        self._record_writes(monkeypatch, machine_ok=False, user_ok=False)
        assert persist_transport_preference(
            "copilot-cli", machine=True
        ) is None

    def test_the_current_process_sees_it_even_when_nothing_persists(
        self, monkeypatch
    ):
        monkeypatch.delenv("DABBLER_TRANSPORT", raising=False)
        self._record_writes(monkeypatch, user_ok=False)
        assert persist_transport_preference("copilot-cli") is None
        import os
        assert os.environ["DABBLER_TRANSPORT"] == "copilot-cli"

class TestBootstrapReporting:
    def _run(self, tmp_path, monkeypatch, capsys, *, scope, extra=()):
        monkeypatch.delenv("DABBLER_TRANSPORT", raising=False)
        monkeypatch.setattr(
            "ai_router.bootstrap.detect_copilot_seat", lambda *a, **k: "CLI 9.9"
        )
        monkeypatch.setattr(
            "ai_router.bootstrap.persist_transport_preference",
            lambda value, machine=False: scope,
        )
        main(["--project-dir", str(tmp_path), *extra])
        return capsys.readouterr()

    def test_success_names_the_scope_that_landed(
        self, tmp_path, monkeypatch, capsys
    ):
        out = self._run(tmp_path, monkeypatch, capsys, scope=SCOPE_USER)
        assert f"at {SCOPE_USER} scope" in out.out
        assert "DABBLER_TRANSPORT=copilot-cli" in out.out

    def test_failure_prints_the_unelevated_command(
        self, tmp_path, monkeypatch, capsys
    ):
        out = self._run(tmp_path, monkeypatch, capsys, scope=None)
        assert "could not be written" in out.err
        assert _manual_persist_hint("copilot-cli") in out.err

class TestTransportPreference:
    """The seat choice is a fact about the machine, remembered in a system
    environment variable — never a question asked twice."""

    def test_explicit_choice_wins(self, monkeypatch):
        monkeypatch.setenv("DABBLER_TRANSPORT", "api")
        value, _ = resolve_bootstrap_transport("copilot-cli")
        assert value == "copilot-cli"

    def test_existing_preference_is_never_overridden(self, monkeypatch):
        monkeypatch.setenv("DABBLER_TRANSPORT", "api")
        value, reason = resolve_bootstrap_transport(None)
        assert value is None
        assert "already set" in reason

    def test_detected_seat_sets_the_preference(self, monkeypatch):
        monkeypatch.delenv("DABBLER_TRANSPORT", raising=False)
        monkeypatch.setattr(
            "ai_router.bootstrap.detect_copilot_seat", lambda *a, **k: "CLI 9.9"
        )
        value, reason = resolve_bootstrap_transport(None)
        assert value == "copilot-cli"
        assert "9.9" in reason

    def test_no_seat_leaves_the_api_default(self, monkeypatch):
        monkeypatch.delenv("DABBLER_TRANSPORT", raising=False)
        monkeypatch.setattr(
            "ai_router.bootstrap.detect_copilot_seat", lambda *a, **k: None
        )
        value, _ = resolve_bootstrap_transport(None)
        assert value is None


class TestGitignoreRule:
    """Setup must establish the .dabbler/ ignore rule, not assume it: the
    run ledger is appended after the tree snapshot each round describes,
    so a tracked ledger permanently blocks the close gate."""

    def test_creates_file_with_rule(self, tmp_path):
        assert ensure_gitignore(tmp_path) is True
        assert ".dabbler/" in (
            tmp_path / ".gitignore"
        ).read_text(encoding="utf-8").splitlines()

    def test_appends_without_disturbing_existing_rules(self, tmp_path):
        path = tmp_path / ".gitignore"
        path.write_text("node_modules/\n*.log\n", encoding="utf-8")
        assert ensure_gitignore(tmp_path) is True
        lines = path.read_text(encoding="utf-8").splitlines()
        assert "node_modules/" in lines and "*.log" in lines
        assert ".dabbler/" in lines

    def test_is_idempotent(self, tmp_path):
        ensure_gitignore(tmp_path)
        first = (tmp_path / ".gitignore").read_text(encoding="utf-8")
        assert ensure_gitignore(tmp_path) is False
        assert (tmp_path / ".gitignore").read_text(encoding="utf-8") == first

    def test_existing_equivalent_rule_is_left_alone(self, tmp_path):
        path = tmp_path / ".gitignore"
        path.write_text(".dabbler\n", encoding="utf-8")
        assert ensure_gitignore(tmp_path) is False
        assert path.read_text(encoding="utf-8") == ".dabbler\n"

    def test_a_re_including_rule_is_not_blunted(self, tmp_path):
        """A project that ignores `.dabbler/*` and re-includes the run
        ledger meant it. Appending `.dabbler/` after that excludes the
        parent directory, and git cannot re-include through an excluded
        parent -- the tracked ledger would silently stop being added."""
        path = tmp_path / ".gitignore"
        body = ".dabbler/*\n!.dabbler/runs/\n"
        path.write_text(body, encoding="utf-8")
        assert ensure_gitignore(tmp_path) is False
        assert path.read_text(encoding="utf-8") == body


class TestInstructionFiles:
    def test_writes_three_files_with_managed_section(self, tmp_path):
        written = write_instruction_files(tmp_path, repo_name="acme-app")
        names = {p.name for p in written}
        assert names == {"AGENTS.md", "CLAUDE.md", "GEMINI.md"}
        for path in written:
            text = path.read_text(encoding="utf-8")
            assert MANAGED_START in text and MANAGED_END in text
            assert len(text.splitlines()) <= 150

    def test_only_agents_carries_the_body(self, tmp_path):
        # Copilot loads all three at once and de-duplicates nothing, so
        # exactly one file may hold the body; the other two import it.
        write_instruction_files(tmp_path, repo_name="acme-app")
        agents = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
        assert "`acme-app`" in agents and "ai_router.verify" in agents
        for name in ("CLAUDE.md", "GEMINI.md"):
            text = (tmp_path / name).read_text(encoding="utf-8")
            assert "@AGENTS.md" in text
            assert "ai_router.verify" not in text

    def test_engine_tails_differ(self, tmp_path):
        write_instruction_files(tmp_path, repo_name="x")
        claude = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
        agents = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
        gemini = (tmp_path / "GEMINI.md").read_text(encoding="utf-8")
        assert "Claude Code" in claude
        assert "Copilot" in agents
        assert "Gemini CLI" in gemini

    def test_existing_user_content_never_touched(self, tmp_path):
        target = tmp_path / "CLAUDE.md"
        target.write_text(
            "# My own rules\nNever delete this line.\n", encoding="utf-8"
        )
        write_instruction_files(tmp_path, repo_name="x")
        text = target.read_text(encoding="utf-8")
        assert "Never delete this line." in text
        assert MANAGED_START in text

    def test_refresh_replaces_only_the_fence(self, tmp_path):
        target = tmp_path / "AGENTS.md"
        target.write_text(
            "above\n" + MANAGED_START + "\nstale body\n" + MANAGED_END
            + "\nbelow\n",
            encoding="utf-8",
        )
        write_instruction_files(tmp_path, repo_name="fresh-name")
        text = target.read_text(encoding="utf-8")
        assert text.startswith("above\n")
        assert text.rstrip().endswith("below")
        assert "stale body" not in text
        assert "`fresh-name`" in text
        assert text.count(MANAGED_START) == 1


class TestScaffoldBootstrapSessions:
    def test_a_fresh_project_gets_two_parseable_setup_sessions(
        self, tmp_path
    ):
        from ai_router.bootstrap import scaffold_bootstrap_sessions
        from ai_router.session import parse_session_plans

        written = scaffold_bootstrap_sessions(tmp_path)
        assert [p.relative_to(tmp_path).as_posix() for p in written] == [
            "docs/sessions/session-plan.md",
        ]
        plans = parse_session_plans(written[0].read_text(encoding="utf-8"))
        assert [p["number"] for p in plans] == [1, 2]
        for plan in plans:
            steps = plan["steps"]
            assert steps[0].startswith("Register")
            assert any("verification" in s.lower() for s in steps)
            assert steps[-1].startswith("Close")

    def test_an_existing_plan_is_never_overwritten(self, tmp_path):
        from ai_router.bootstrap import scaffold_bootstrap_sessions

        existing = tmp_path / "docs" / "sessions"
        existing.mkdir(parents=True)
        (existing / "session-plan.md").write_text("# Mine\n", encoding="utf-8")
        assert scaffold_bootstrap_sessions(tmp_path) == []
        assert (existing / "session-plan.md").read_text(
            encoding="utf-8"
        ) == "# Mine\n"
        # A re-run after a successful scaffold is the same no-op.
        fresh = tmp_path / "fresh"
        fresh.mkdir()
        assert len(scaffold_bootstrap_sessions(fresh)) == 1
        assert scaffold_bootstrap_sessions(fresh) == []


class TestScaffoldProjectConfig:
    """The tracked `dabbler.yaml` a scaffolded repository declares itself
    in. Without it the project bootstrap just handed a lifecycle cannot
    reach step 4 of it: `test_evidence` refuses a suite the repository
    never declared, and there is nowhere tracked to declare one."""

    @staticmethod
    def _repo(tmp_path):
        """Config discovers the repository through git, so a scaffold is
        only readable from a real one."""
        import subprocess

        subprocess.run(
            ["git", "init", "-q"], cwd=str(tmp_path), capture_output=True,
        )
        return tmp_path

    def test_each_detected_ecosystem_becomes_its_own_suite(self, tmp_path):
        from ai_router.bootstrap import scaffold_project_config
        from ai_router.config import load_config
        from ai_router.test_evidence import load_suites_checked

        # Java and .NET at once is the case suites were made plural for.
        root = self._repo(tmp_path)
        (root / "pom.xml").write_text("<project/>", encoding="utf-8")
        (root / "App.csproj").write_text("<Project/>", encoding="utf-8")
        assert scaffold_project_config(root) == root / "dabbler.yaml"

        loaded = load_suites_checked(load_config(project_dir=str(root)))
        assert loaded.errors == ()
        assert [s.name for s in loaded.suites] == ["maven", "dotnet"]
        # Neither runner takes a list of test files, so neither can be
        # narrowed and both say so rather than being handed a subset.
        assert all(s.runs_whole and s.expensive for s in loaded.suites)

    def test_a_build_file_that_declares_no_test_command_declares_nothing(
        self, tmp_path
    ):
        """Where the runner is a script somebody had to write, the script
        has to be there. A generated suite whose command exits non-zero
        on the first run is worse than no suite: it is a standing red the
        lifecycle blocks on until a person repairs the declaration."""
        from ai_router.bootstrap import detect_ecosystems

        root = self._repo(tmp_path)
        # Python that does not use pytest, and a package with no test
        # script -- npm's own default for that case exits non-zero.
        (root / "pyproject.toml").write_text(
            '[project]\nname = "x"\n', encoding="utf-8")
        (root / "package.json").write_text(
            '{"name": "x", "scripts": {"build": "tsc"}}', encoding="utf-8")
        assert detect_ecosystems(root) == []

    def test_a_script_that_exists_in_order_to_fail_declares_nothing(
        self, tmp_path
    ):
        """`npm init` writes a test script whose whole purpose is to exit
        non-zero. A repository that has not replaced it has said the
        opposite of "my tests run this way", and a suite built around it
        is a standing red that blocks the lifecycle."""
        from ai_router.bootstrap import detect_ecosystems

        root = self._repo(tmp_path)
        placeholder = json.dumps({
            "name": "x",
            "scripts": {"test": 'echo "Error: no test specified" && exit 1'},
        })
        (root / "package.json").write_text(placeholder, encoding="utf-8")
        assert detect_ecosystems(root) == []
        # And the real thing is detected, so the rule is narrow.
        (root / "package.json").write_text(
            json.dumps({"name": "x", "scripts": {"test": "vitest run"}}),
            encoding="utf-8")
        assert [e.key for e in detect_ecosystems(root)] == ["node"]

    def test_a_manifest_that_parses_but_does_not_conform_is_not_a_crash(
        self, tmp_path
    ):
        """A shape error in someone else's file must leave node
        undetected, not end the bootstrap that was setting the project
        up."""
        from ai_router.bootstrap import detect_ecosystems

        root = self._repo(tmp_path)
        (root / "package.json").write_text(
            '{"name": "x", "scripts": ["test"]}', encoding="utf-8")
        assert detect_ecosystems(root) == []

    def test_a_build_file_below_the_root_declares_nothing(self, tmp_path):
        """A suite declares a command and no working directory, so
        `service/pom.xml` cannot become a runnable line -- `mvn -q test`
        at the root would simply fail. A multi-project repository
        declares its own suites."""
        from ai_router.bootstrap import detect_ecosystems

        root = self._repo(tmp_path)
        (root / "service").mkdir()
        (root / "service" / "pom.xml").write_text("<project/>", encoding="utf-8")
        assert detect_ecosystems(root) == []

    def test_a_committed_wrapper_is_the_entry_point_it_was_committed_to_be(
        self, tmp_path
    ):
        """A wrapper is checked in precisely so the build runs without the
        tool installed globally. `gradle test` on a machine that has only
        `gradlew` fails for a reason the repository already solved."""
        from ai_router.bootstrap import detect_ecosystems

        root = self._repo(tmp_path)
        (root / "build.gradle").write_text(
            "plugins { id 'java' }\n", encoding="utf-8")
        assert detect_ecosystems(root)[0].command == "gradle test"
        (root / "gradlew").write_text("#!/bin/sh\n", encoding="utf-8")
        assert detect_ecosystems(root)[0].command == "./gradlew test"

    def test_the_scaffold_maps_every_path_rather_than_none(self, tmp_path):
        from ai_router.bootstrap import scaffold_project_config
        from ai_router.checks import load_selection_config, select_tests
        from ai_router.config import load_config

        root = self._repo(tmp_path)
        (root / "pytest.ini").write_text("[pytest]\n", encoding="utf-8")
        scaffold_project_config(root)
        selection = load_selection_config(load_config(project_dir=str(root)))
        assert selection.ok
        # A repository with no mapping at all fails pre-verification
        # closed: every path is selection_unknown and no smoke fallback
        # exists, so nothing can be proved to have run for them. The
        # scaffold declares the one honest starting mapping instead --
        # every path is repository-wide, so the complete suite is what
        # the stage asks for, until the repository narrows it.
        result = select_tests(root, ["src/app.py"], selection.config)
        assert result.all_tests_affected
        assert result.risks == ()

    def test_an_existing_declaration_is_never_overwritten(self, tmp_path):
        from ai_router.bootstrap import scaffold_project_config

        mine = tmp_path / "dabbler.yaml"
        mine.write_text("schema_version: 1\n", encoding="utf-8")
        assert scaffold_project_config(tmp_path) is None
        assert mine.read_text(encoding="utf-8") == "schema_version: 1\n"

    def test_a_repository_that_says_nothing_declares_no_suite(self, tmp_path):
        from ai_router.bootstrap import detect_ecosystems, scaffold_project_config
        from ai_router.config import load_config
        from ai_router.test_evidence import load_suites_checked

        root = self._repo(tmp_path)
        (root / "README.md").write_text("# nothing yet\n", encoding="utf-8")
        assert detect_ecosystems(root) == []
        scaffold_project_config(root)
        # No suite is a declaration, not an omission: the alternative is
        # guessing a runner for an ecosystem nothing here names.
        loaded = load_suites_checked(load_config(project_dir=str(root)))
        assert loaded.errors == ()
        assert loaded.suites == ()


class TestRoundRefMigration:
    def test_rerunning_bootstrap_teaches_an_existing_clone_to_fetch_rounds(
        self, tmp_path
    ):
        """The fix only reaches the machine a session moves to once that
        clone fetches refs/dabbler/rounds/*, and clones made before the
        refs existed carry no such refspec. Bootstrap is re-run on
        existing projects, so it is the migration."""
        import subprocess

        from ai_router.evidence import ROUND_REFSPEC

        remote = tmp_path / "remote.git"
        subprocess.run(["git", "init", "-q", "--bare", str(remote)],
                       capture_output=True)
        repo = tmp_path / "clone"
        subprocess.run(["git", "clone", "-q", str(remote), str(repo)],
                       capture_output=True)
        assert main(["--project-dir", str(repo), "--no-transport-detect"]) == 0
        fetch = subprocess.run(
            ["git", "-C", str(repo), "config", "--get-all",
             "remote.origin.fetch"], capture_output=True, text=True,
        ).stdout.split()
        assert ROUND_REFSPEC in fetch
