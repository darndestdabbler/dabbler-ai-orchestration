"""Layer-1 unit tests for ai_router.narration."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from ai_router.narration import (
    MARKER_REGEX,
    ParsedMarker,
    detect_marker,
    project_state_for_template,
    render_template,
)


# ---------------------------------------------------------------------------
# Marker regex + parser.
# ---------------------------------------------------------------------------


class TestMarkerRegex:
    def test_canonical_marker_matches(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=045-log-harvest-implementation session=4 total=6]"
        m = MARKER_REGEX.search(text)
        assert m is not None
        assert m.group("ver") == "1"

    def test_marker_with_effort_matches(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=test session=1 total=1 effort=high]"
        m = MARKER_REGEX.search(text)
        assert m is not None

    def test_no_marker_returns_no_match(self):
        assert MARKER_REGEX.search("just talking") is None


class TestDetectMarker:
    def test_session_start_marker_returns_parsed_fields(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=045-log-harvest-implementation session=4 total=6 effort=high]"
        parsed = detect_marker(text)
        assert isinstance(parsed, ParsedMarker)
        assert parsed.marker_version == 1
        assert parsed.phase == "session-start"
        assert parsed.set_slug == "045-log-harvest-implementation"
        assert parsed.session == 4
        assert parsed.total == 6
        assert parsed.effort == "high"
        assert parsed.semantic_error is None
        assert parsed.incomplete is False
        assert parsed.skipped is False

    def test_empty_text_returns_none(self):
        assert detect_marker("") is None
        assert detect_marker(None) is None  # type: ignore[arg-type]

    def test_no_marker_returns_none(self):
        assert detect_marker("Hello, world.") is None

    def test_unknown_version_skipped(self):
        parsed = detect_marker("[DABBLER-NARRATION v9 phase=session-start set=x session=1 total=1]")
        assert parsed is not None
        assert parsed.skipped is True
        assert parsed.marker_version == 9
        # Unparsed body — fields stay None.
        assert parsed.phase is None

    def test_placeholder_leakage_detected(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=SET-SLUG session=1 total=1]"
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.semantic_error == "placeholder-leakage"

    def test_session_exceeds_total_detected(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=x session=7 total=6]"
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.semantic_error == "session-exceeds-total"

    def test_unknown_effort_enum_detected(self):
        text = "[DABBLER-NARRATION v1 phase=session-start set=x session=1 total=1 effort=fast]"
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.semantic_error == "unknown-effort-enum"

    def test_lenient_whitespace_around_equals(self):
        text = "[DABBLER-NARRATION v1 phase = session-start set = x session = 1 total = 1]"
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.semantic_error is None
        assert parsed.set_slug == "x"

    def test_case_insensitive_keys_but_case_sensitive_values(self):
        text = "[DABBLER-NARRATION v1 Phase=session-start SET=x Session=2 Total=3]"
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.phase == "session-start"
        assert parsed.set_slug == "x"
        assert parsed.session == 2
        assert parsed.total == 3

    def test_marker_inside_prose_detected(self):
        text = (
            "I'll start by emitting the marker.\n\n"
            "[DABBLER-NARRATION v1 phase=session-start set=test session=1 total=1]\n\n"
            "Now reading the spec."
        )
        parsed = detect_marker(text)
        assert parsed is not None
        assert parsed.set_slug == "test"


# ---------------------------------------------------------------------------
# Template render.
# ---------------------------------------------------------------------------


class TestRenderTemplate:
    def test_claude_template_substitutes_values(self):
        out = render_template(
            "claude",
            set_slug="045-log-harvest-implementation",
            session_number=4,
            total_sessions=6,
            effort="high",
        )
        assert "session=4" in out
        assert "set=045-log-harvest-implementation" in out
        assert "total=6" in out
        assert "effort=high" in out
        assert "SET-SLUG" not in out
        assert "SESSION-NUMBER" not in out

    def test_template_prose_obeys_defensive_phrasing_rules(self):
        """The canonical templates (sans set-slug substitution) must not
        carry the Q3 phrasing-trigger lexical family. Render against a
        neutral slug so any 'harvest' substring would be in the prose."""
        for kind in ("claude", "agents"):
            out = render_template(
                kind,  # type: ignore[arg-type]
                set_slug="example-project",
                session_number=1,
                total_sessions=1,
            )
            forbidden = re.compile(
                r"\b(harvest|harvester|harvesting|harvested|synthetic|smoke probe|NOT a real)\b",
                re.IGNORECASE,
            )
            assert forbidden.search(out) is None, f"defensive rule violated in {kind}: {forbidden.search(out)!r}"

    def test_agents_template_omits_effort_when_none(self):
        out = render_template(
            "agents",
            set_slug="test",
            session_number=1,
            total_sessions=1,
        )
        assert "effort=" not in out
        assert "session=1" in out
        assert "total=1" in out

    def test_rendered_marker_round_trips_through_detect(self):
        out = render_template(
            "claude",
            set_slug="test-set",
            session_number=2,
            total_sessions=3,
            effort="medium",
        )
        parsed = detect_marker(out)
        assert parsed is not None
        assert parsed.semantic_error is None
        assert parsed.set_slug == "test-set"
        assert parsed.session == 2
        assert parsed.total == 3
        assert parsed.effort == "medium"

    def test_rejects_placeholder_set_slug(self):
        with pytest.raises(ValueError):
            render_template("claude", set_slug="SET-SLUG", session_number=1, total_sessions=1)

    def test_rejects_non_positive_session_number(self):
        with pytest.raises(ValueError):
            render_template("claude", set_slug="x", session_number=0, total_sessions=1)

    def test_rejects_session_number_exceeding_total(self):
        with pytest.raises(ValueError):
            render_template("claude", set_slug="x", session_number=5, total_sessions=2)

    def test_rejects_invalid_effort(self):
        with pytest.raises(ValueError):
            render_template("claude", set_slug="x", session_number=1, total_sessions=1, effort="fast")


# ---------------------------------------------------------------------------
# project_state_for_template.
# ---------------------------------------------------------------------------


class TestProjectStateForTemplate:
    def _state(
        self,
        slug: str,
        current: int,
        total: int,
        *,
        effort: str | None = "high",
    ) -> dict:
        sessions = [
            {
                "number": n,
                "title": f"Session {n}",
                "status": (
                    "in-progress" if n == current
                    else ("complete" if n < current else "not-started")
                ),
            }
            for n in range(1, total + 1)
        ]
        payload: dict = {
            "schemaVersion": 3,
            "sessionSetName": slug,
            "sessions": sessions,
            "currentSession": current,
            "totalSessions": total,
            "completedSessions": [n for n in range(1, current)],
            "status": "in-progress",
        }
        if effort is not None:
            payload["orchestrator"] = {"effort": effort}
        return payload

    def test_reads_current_session_from_state(self, tmp_path: Path):
        state = tmp_path / "session-state.json"
        state.write_text(
            json.dumps(self._state("045-log-harvest-implementation", 4, 6)),
            encoding="utf-8",
        )
        proj = project_state_for_template(state)
        assert proj.set_slug == "045-log-harvest-implementation"
        assert proj.session_number == 4
        assert proj.total_sessions == 6
        assert proj.effort == "high"

    def test_drops_invalid_effort_value(self, tmp_path: Path):
        state = tmp_path / "session-state.json"
        state.write_text(
            json.dumps(self._state("x", 1, 2, effort="fast")),
            encoding="utf-8",
        )
        proj = project_state_for_template(state)
        assert proj.effort is None

    def test_missing_file_raises(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            project_state_for_template(tmp_path / "nope.json")

    def test_missing_current_session_raises(self, tmp_path: Path):
        state = tmp_path / "session-state.json"
        state.write_text(
            json.dumps({
                "schemaVersion": 3,
                "sessionSetName": "x",
                "sessions": [
                    {"number": 1, "title": "s1", "status": "not-started"},
                    {"number": 2, "title": "s2", "status": "not-started"},
                ],
                "totalSessions": 2,
                "completedSessions": [],
                "currentSession": None,
                "status": "not-started",
            }),
            encoding="utf-8",
        )
        with pytest.raises(ValueError):
            project_state_for_template(state)


# ---------------------------------------------------------------------------
# CLI integration (subprocess-free smoke test).
# ---------------------------------------------------------------------------


def test_cli_renders_from_state_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]):
    from ai_router.narration import _cli_main

    state = tmp_path / "session-state.json"
    state.write_text(
        json.dumps({
            "schemaVersion": 3,
            "sessionSetName": "045-log-harvest-implementation",
            "sessions": [
                {"number": n, "title": f"S{n}", "status": "in-progress" if n == 4 else "not-started"}
                for n in range(1, 7)
            ],
            "currentSession": 4,
            "totalSessions": 6,
            "completedSessions": [1, 2, 3],
            "status": "in-progress",
            "orchestrator": {"effort": "high"},
        }),
        encoding="utf-8",
    )
    rc = _cli_main(["--kind", "claude", "--state-file", str(state)])
    assert rc == 0
    captured = capsys.readouterr()
    assert "session=4" in captured.out
    assert "set=045-log-harvest-implementation" in captured.out


def test_cli_renders_to_output_file(tmp_path: Path):
    from ai_router.narration import _cli_main

    out_path = tmp_path / "rendered" / "CLAUDE.md"
    rc = _cli_main([
        "--kind", "claude",
        "--set-slug", "test-set",
        "--session", "1",
        "--total", "3",
        "--output", str(out_path),
    ])
    assert rc == 0
    assert out_path.exists()
    body = out_path.read_text(encoding="utf-8")
    assert "session=1" in body
    assert "total=3" in body
