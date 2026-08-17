from ai_router.bootstrap import (
    DECOMPOSITION_PROMPT,
    MANAGED_END,
    MANAGED_START,
    PLAN_PROMPT,
    write_instruction_files,
)


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
