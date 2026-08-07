"""Tests for the step-level session checklist (Set 111 S4, operator-directed).

The checklist is the framework's only step-level progress surface, so the
load-bearing behaviours are: it reads the RECORD rather than the plan, it
marks the step actually in flight, and it never emits a character a
Windows cp1252 console cannot print.
"""

from __future__ import annotations

import json

import pytest

from ai_router import session_checklist as sc


def _write_set(tmp_path, entries, *, sessions=None, session_number=2):
    set_dir = tmp_path / "docs" / "session-sets" / "111-fixture"
    set_dir.mkdir(parents=True)
    (set_dir / "activity-log.json").write_text(
        json.dumps({"entries": entries}), encoding="utf-8"
    )
    (set_dir / "session-state.json").write_text(
        json.dumps(
            {
                "schemaVersion": 4,
                "sessionSetName": "111-fixture",
                "status": "in-progress",
                "sessions": sessions
                or [
                    {"number": 1, "status": "complete"},
                    {"number": session_number, "status": "in-progress"},
                ],
            }
        ),
        encoding="utf-8",
    )
    return str(set_dir)


def _entry(n, key, status, desc="", session=2):
    return {
        "sessionNumber": session,
        "stepNumber": n,
        "stepKey": key,
        "description": desc,
        "status": status,
    }


class TestBuildRows:
    def test_rows_follow_logged_order(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "register", "complete"),
                _entry(2, "execute", "complete"),
                _entry(3, "verify", "pending"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.step_key for r in rows] == ["register", "execute", "verify"]

    def test_only_the_requested_session_is_rendered(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "s1-work", "complete", session=1),
                _entry(1, "s2-work", "complete", session=2),
            ],
        )
        assert [r.step_key for r in sc.build_rows(set_dir, 2)] == ["s2-work"]

    def test_here_marks_the_first_unfinished_step(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "a", "complete"),
                _entry(2, "b", "in-progress"),
                _entry(3, "c", "pending"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.is_here for r in rows] == [False, True, False]

    def test_here_marks_the_last_row_when_everything_is_done(self, tmp_path):
        """A session whose steps are all complete sits at its final step."""
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "a", "complete"), _entry(2, "b", "complete")],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.is_here for r in rows] == [False, True]

    def test_exactly_one_row_is_here(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "a", "pending"),
                _entry(2, "b", "pending"),
                _entry(3, "c", "pending"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert sum(1 for r in rows if r.is_here) == 1

    def test_missing_log_yields_no_rows_rather_than_raising(self, tmp_path):
        set_dir = tmp_path / "empty"
        set_dir.mkdir()
        assert sc.build_rows(str(set_dir), 1) == []

    def test_malformed_log_yields_no_rows(self, tmp_path):
        set_dir = tmp_path / "bad"
        set_dir.mkdir()
        (set_dir / "activity-log.json").write_text("{not json", encoding="utf-8")
        assert sc.build_rows(str(set_dir), 1) == []

    def test_a_session_with_no_entries_yields_no_rows(self, tmp_path):
        set_dir = _write_set(tmp_path, [_entry(1, "a", "complete", session=1)])
        assert sc.build_rows(set_dir, 2) == []

    def test_a_relogged_step_collapses_to_its_latest_entry(self, tmp_path):
        """The activity log is append-only, so a step logged in-progress
        and later complete appears twice. Rendering both would duplicate
        the row and strand the marker on the stale entry."""
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "a", "complete"),
                _entry(2, "b", "in-progress"),
                _entry(2, "b", "complete"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.step_key for r in rows] == ["a", "b"]
        assert rows[1].status == "complete"

    def test_a_collapsed_step_keeps_its_first_position(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "a", "in-progress"),
                _entry(2, "b", "pending"),
                _entry(1, "a", "complete"),
            ],
        )
        assert [r.step_key for r in sc.build_rows(set_dir, 2)] == ["a", "b"]

    def test_here_follows_the_collapsed_status_not_the_stale_one(
        self, tmp_path
    ):
        """The dogfood defect: re-logging left `here` on a stale row."""
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "a", "in-progress"),
                _entry(2, "b", "pending"),
                _entry(1, "a", "complete"),
                _entry(2, "b", "in-progress"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [(r.step_key, r.is_here) for r in rows] == [
            ("a", False),
            ("b", True),
        ]

    def test_steps_without_a_key_are_not_collapsed_together(self, tmp_path):
        """Two anonymous steps are two steps, not one overwritten twice."""
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "", "complete", "first"),
                _entry(2, "", "complete", "second"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert len(rows) == 2
        assert [r.description for r in rows] == ["first", "second"]


class TestStatusBoxes:
    @pytest.mark.parametrize(
        "status,expected",
        [
            ("complete", "[x]"),
            ("done", "[x]"),
            ("in-progress", "[~]"),
            ("in_progress", "[~]"),
            ("pending", "[ ]"),
            ("not-started", "[ ]"),
            ("blocked", "[!]"),
            ("failed", "[!]"),
        ],
    )
    def test_known_statuses_map_to_boxes(self, status, expected):
        row = sc.ChecklistRow(1, "k", "d", status, False)
        assert row.box == expected

    def test_status_is_case_insensitive(self):
        assert sc.ChecklistRow(1, "k", "d", "COMPLETE", False).box == "[x]"

    def test_an_unknown_status_is_visibly_unknown(self):
        """Never silently render an unrecognised status as done."""
        assert sc.ChecklistRow(1, "k", "d", "weird", False).box == "[?]"


class TestCurrentSessionNumber:
    def test_prefers_the_in_flight_session(self, tmp_path):
        set_dir = _write_set(tmp_path, [])
        assert sc.current_session_number(set_dir) == 2

    def test_falls_back_to_the_latest_closed_session(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [],
            sessions=[
                {"number": 1, "status": "complete"},
                {"number": 3, "status": "complete"},
                {"number": 4, "status": "not-started"},
            ],
        )
        assert sc.current_session_number(set_dir) == 3

    def test_returns_none_without_state(self, tmp_path):
        assert sc.current_session_number(str(tmp_path)) is None


class TestRender:
    def test_uses_the_short_step_label_not_the_prose(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [
                _entry(
                    1,
                    "test-run-policy",
                    "complete",
                    "Shipped ai_router/run_of_record.py with a content digest "
                    "and a close gate and a great many other things besides.",
                )
            ],
        )
        out = sc.render(sc.build_rows(set_dir, 2), 2)
        assert "Test run policy" in out
        assert "run_of_record" not in out

    def test_verbose_uses_the_logged_description(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "k", "complete", "Shipped the thing; and more")],
        )
        out = sc.render(sc.build_rows(set_dir, 2), 2, verbose=True)
        assert "Shipped the thing" in out

    def test_the_here_marker_appears_exactly_once(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "a", "complete"), _entry(2, "b", "in-progress")],
        )
        out = sc.render(sc.build_rows(set_dir, 2), 2)
        assert out.count(sc.HERE_MARKER) == 1

    def test_output_is_cp1252_safe(self, tmp_path):
        """L-079-1: this prints to a Windows console."""
        set_dir = _write_set(
            tmp_path,
            [
                _entry(
                    1,
                    "ceremony-pass",
                    "complete",
                    "Ceremony \u2014 artifacts, \u201cquoted\u201d, caf\u00e9",
                )
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        sc.render(rows, 2).encode("cp1252")
        sc.render(rows, 2, verbose=True).encode("cp1252")
        sc.render_markdown(rows, 2, verbose=True).encode("cp1252")

    def test_empty_rows_say_so_rather_than_printing_a_bare_heading(self):
        out = sc.render([], 3)
        assert "no steps logged yet" in out

    def test_markdown_is_a_table_with_a_bolded_here_row(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "a", "complete"), _entry(2, "b", "in-progress")],
        )
        out = sc.render_markdown(sc.build_rows(set_dir, 2), 2)
        assert out.startswith("| | Session 2 step |")
        assert "| :--- | :--- |" in out
        assert "**B**" in out and sc.HERE_MARKER in out

    def test_markdown_empty_state_is_still_a_table(self):
        out = sc.render_markdown([], 1)
        assert out.count("|") >= 6


class TestCli:
    def test_renders_the_resolved_session(self, tmp_path, capsys, monkeypatch):
        set_dir = _write_set(
            tmp_path, [_entry(1, "register", "complete")]
        )
        assert sc.run(["--session-set-dir", set_dir]) == 0
        assert "Register" in capsys.readouterr().out

    def test_markdown_flag(self, tmp_path, capsys):
        set_dir = _write_set(tmp_path, [_entry(1, "register", "complete")])
        assert sc.run(["--session-set-dir", set_dir, "--markdown"]) == 0
        assert "| :--- | :--- |" in capsys.readouterr().out

    def test_unresolvable_set_is_a_usage_error(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        assert sc.run([]) == 2

    def test_unresolvable_session_number_is_a_usage_error(
        self, tmp_path, capsys
    ):
        d = tmp_path / "no-state"
        d.mkdir()
        assert sc.run(["--session-set-dir", str(d)]) == 2
        assert "could not resolve" in capsys.readouterr().err


def test_the_real_repo_renders_its_own_in_flight_session():
    """Dogfood: the module must work on this repo, right now."""
    import os

    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__)
    )))
    set_dir = os.path.join(
        repo_root,
        "docs",
        "session-sets",
        "111-verification-loop-and-ceremony-simplification",
    )
    if not os.path.isdir(set_dir):
        pytest.skip("set 111 not present")
    number = sc.current_session_number(set_dir)
    assert number is not None
    rows = sc.build_rows(set_dir, number)
    assert rows, "set 111 has logged steps; the checklist must show them"
    sc.render(rows, number).encode("cp1252")
