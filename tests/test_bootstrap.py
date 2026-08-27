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
