from ai_router.bootstrap import (
    DECOMPOSITION_PROMPT,
    MANAGED_END,
    MANAGED_START,
    PLAN_PROMPT,
    ensure_gitignore,
    resolve_bootstrap_transport,
    write_instruction_files,
)


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
    def test_writes_both_files_with_managed_section(self, tmp_path):
        written = write_instruction_files(tmp_path, repo_name="acme-app")
        names = {p.name for p in written}
        assert names == {"AGENTS.md", "CLAUDE.md"}
        for path in written:
            text = path.read_text(encoding="utf-8")
            assert MANAGED_START in text and MANAGED_END in text
            assert "`acme-app`" in text
            assert "ai_router.verify" in text
            assert len(text.splitlines()) <= 150

    def test_engine_tails_differ(self, tmp_path):
        write_instruction_files(tmp_path, repo_name="x")
        claude = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
        agents = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
        assert "Claude Code" in claude
        assert "Copilot" in agents

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


class TestPrompts:
    def test_plan_prompt_shape(self):
        assert "project-plan.md" in PLAN_PROMPT
        assert "Import" in PLAN_PROMPT

    def test_decomposition_prompt_hard_rules(self):
        assert "NNN-kebab-title" in DECOMPOSITION_PROMPT
        assert "session-state.json" in DECOMPOSITION_PROMPT
        assert "never authored by hand" in DECOMPOSITION_PROMPT


class TestScaffoldBootstrapSets:
    def test_fresh_project_gets_both_sets_with_parseable_specs(
        self, tmp_path
    ):
        from ai_router.bootstrap import scaffold_bootstrap_sets
        from ai_router.session import parse_session_plans

        written = scaffold_bootstrap_sets(tmp_path)
        assert [p.parent.name for p in written] == [
            "001-default-plan", "002-default-decomposition",
        ]
        for spec in written:
            plans = parse_session_plans(spec.read_text(encoding="utf-8"))
            assert len(plans) == 1 and plans[0]["number"] == 1
            steps = plans[0]["steps"]
            assert steps[0].startswith("Register")
            assert any("verification" in s.lower() for s in steps)
            assert steps[-1].startswith("Close")

    def test_any_existing_set_skips_scaffolding_entirely(self, tmp_path):
        from ai_router.bootstrap import scaffold_bootstrap_sets

        existing = tmp_path / "docs" / "session-sets" / "001-user-auth"
        existing.mkdir(parents=True)
        (existing / "spec.md").write_text("# Mine\n", encoding="utf-8")
        assert scaffold_bootstrap_sets(tmp_path) == []
        sets = sorted(
            p.name for p in (tmp_path / "docs" / "session-sets").iterdir()
        )
        assert sets == ["001-user-auth"]  # nothing added beside it
        # A re-run after a successful scaffold is the same no-op.
        fresh = tmp_path / "fresh"
        fresh.mkdir()
        first = scaffold_bootstrap_sets(fresh)
        assert len(first) == 2
        assert scaffold_bootstrap_sets(fresh) == []
