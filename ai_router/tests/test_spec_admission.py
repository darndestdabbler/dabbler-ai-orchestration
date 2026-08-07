"""Tests for the authoring-time session-size admission test (Set 111 S4).

Covers the parser (what counts as a step), the exception mechanism, the
config loader's fail-safe behaviour, and the CLI's exit codes.
"""

from __future__ import annotations

import pytest

from ai_router import spec_admission as sa


SPEC_HEAD = """# Example Spec

> **Purpose:** example.

## Session Set Configuration

```yaml
tier: full
requiresUAT: false
```

## Sessions

"""


def _session(n: int, total: int, title: str, steps: int) -> str:
    body = "".join(f"{i}. Do the thing number {i}.\n" for i in range(1, steps + 1))
    return f"### Session {n} of {total}: {title}\n\n{body}\n"


def _write(tmp_path, *sessions: str, extra: str = "") -> str:
    path = tmp_path / "spec.md"
    path.write_text(
        SPEC_HEAD + "\n".join(sessions) + extra, encoding="utf-8"
    )
    return str(path)


class TestParseSessionPlans:
    def test_counts_top_level_steps_per_session(self, tmp_path):
        spec = _write(
            tmp_path,
            _session(1, 2, "Small", 3),
            _session(2, 2, "Big", 9),
        )
        plans = sa.parse_session_plans(
            open(spec, encoding="utf-8").read()
        )
        assert [(p.number, p.step_count) for p in plans] == [(1, 3), (2, 9)]
        assert plans[0].title == "Small"

    def test_nested_list_items_are_not_steps(self, tmp_path):
        """A 4-space-indented ordered item is a sub-step, not a step.

        Without this the guide's own nested-detail style would inflate
        every session past the cap and the check would be noise.
        """
        body = (
            "### Session 1 of 1: Nested\n\n"
            "1. Top level.\n"
            "    1. Nested detail.\n"
            "    2. More nested detail.\n"
            "2. Second top level.\n"
        )
        plans = sa.parse_session_plans(SPEC_HEAD + body)
        assert plans[0].step_count == 2

    def test_steps_inside_a_code_fence_are_ignored(self, tmp_path):
        """The authoring guide embeds a spec TEMPLATE in a fence.

        Counting the template's numbered lines as real steps would make
        every doc containing an example fail its own check.
        """
        body = (
            "### Session 1 of 1: Fenced\n\n"
            "1. A real step.\n\n"
            "```markdown\n"
            "1. Template step.\n"
            "2. Template step.\n"
            "3. Template step.\n"
            "4. Template step.\n"
            "5. Template step.\n"
            "6. Template step.\n"
            "```\n"
        )
        plans = sa.parse_session_plans(SPEC_HEAD + body)
        assert plans[0].step_count == 1

    def test_session_heading_without_of_total_still_parses(self):
        body = "### Session 3: No total\n\n1. One.\n2. Two.\n"
        plans = sa.parse_session_plans(SPEC_HEAD + body)
        assert [(p.number, p.step_count) for p in plans] == [(3, 2)]


class TestCheckSpec:
    def test_under_cap_passes(self, tmp_path):
        spec = _write(tmp_path, _session(1, 1, "Fine", 5))
        result = sa.check_spec(spec, max_steps=5)
        assert result.passed
        assert result.violations == []

    def test_over_cap_is_a_violation(self, tmp_path):
        spec = _write(tmp_path, _session(1, 1, "Too big", 6))
        result = sa.check_spec(spec, max_steps=5)
        assert not result.passed
        assert [p.number for p in result.violations] == [1]

    def test_declared_exception_converts_violation_to_excepted(self, tmp_path):
        spec = _write(
            tmp_path,
            _session(1, 1, "Too big", 9),
            extra="\nsessionSizeException: 1 - terminal ceremony session\n",
        )
        result = sa.check_spec(spec, max_steps=5)
        assert result.passed
        assert [p.number for p in result.excepted] == [1]
        assert "ceremony" in result.exceptions[1]

    def test_exception_without_a_reason_is_not_honoured(self, tmp_path):
        """An undocumented exception is indistinguishable from a typo."""
        spec = _write(
            tmp_path,
            _session(1, 1, "Too big", 9),
            extra="\nsessionSizeException: 1\n",
        )
        result = sa.check_spec(spec, max_steps=5)
        assert not result.passed
        assert [p.number for p in result.violations] == [1]

    def test_exception_for_a_different_session_does_not_transfer(self, tmp_path):
        spec = _write(
            tmp_path,
            _session(1, 2, "Too big", 9),
            _session(2, 2, "Also big", 9),
            extra="\nsessionSizeException: 2 - justified\n",
        )
        result = sa.check_spec(spec, max_steps=5)
        assert [p.number for p in result.violations] == [1]
        assert [p.number for p in result.excepted] == [2]

    def test_missing_file_reports_an_error_not_a_pass(self, tmp_path):
        result = sa.check_spec(str(tmp_path / "nope.md"))
        assert not result.passed
        assert result.error and "unreadable" in result.error

    def test_spec_without_session_headings_errors(self, tmp_path):
        path = tmp_path / "spec.md"
        path.write_text("# No sessions here\n", encoding="utf-8")
        result = sa.check_spec(str(path))
        assert not result.passed
        assert result.error and "Session" in result.error


class TestLoadMaxSteps:
    def test_reads_the_configured_cap(self):
        assert sa.load_max_steps({"authoring": {"max_steps_per_session": 8}}) == 8

    @pytest.mark.parametrize(
        "value",
        [0, -3, "5", 5.0, True, False, None],
        ids=["zero", "negative", "str", "float", "true", "false", "none"],
    )
    def test_a_bad_value_falls_back_rather_than_disabling_the_check(self, value):
        """A config typo must not silently set the cap to zero or infinity."""
        cfg = {"authoring": {"max_steps_per_session": value}}
        assert sa.load_max_steps(cfg) == sa.DEFAULT_MAX_STEPS

    def test_missing_block_uses_the_default(self):
        assert sa.load_max_steps({}) == sa.DEFAULT_MAX_STEPS
        assert sa.load_max_steps(None) == sa.DEFAULT_MAX_STEPS


class TestCli:
    def test_check_exits_nonzero_on_a_violation(self, tmp_path, capsys):
        spec = _write(tmp_path, _session(1, 1, "Too big", 9))
        assert sa.run(["--spec", spec, "--check", "--max-steps", "5"]) == 1
        assert "OVER CAP" in capsys.readouterr().out

    def test_check_exits_zero_when_clean(self, tmp_path, capsys):
        spec = _write(tmp_path, _session(1, 1, "Fine", 4))
        assert sa.run(["--spec", spec, "--check", "--max-steps", "5"]) == 0

    def test_without_check_a_violation_still_exits_zero(self, tmp_path):
        spec = _write(tmp_path, _session(1, 1, "Too big", 9))
        assert sa.run(["--spec", spec, "--max-steps", "5"]) == 0

    def test_no_target_is_a_usage_error(self, capsys):
        assert sa.run([]) == 2
        assert "--spec" in capsys.readouterr().err

    def test_nonpositive_max_steps_is_rejected(self, capsys):
        assert sa.run(["--spec", "x", "--max-steps", "0"]) == 2
        assert ">= 1" in capsys.readouterr().err

    def test_report_downconverts_non_ascii_titles(self, tmp_path, capsys):
        """L-079-1: the console text layer is cp1252 on Windows."""
        spec = _write(
            tmp_path, _session(1, 1, "Ceremony \u2014 artifacts", 2)
        )
        sa.run(["--spec", spec])
        out = capsys.readouterr().out
        assert "Ceremony - artifacts" in out
        out.encode("cp1252")  # must not raise
