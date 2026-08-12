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


def _write_set(
    tmp_path, entries, *, sessions=None, session_number=2, started_at=None
):
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
                    {
                        "number": session_number,
                        "status": "in-progress",
                        "startedAt": started_at,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    return str(set_dir)


def _entry(n, key, status, desc="", session=2, at=None):
    entry = {
        "sessionNumber": session,
        "stepNumber": n,
        "stepKey": key,
        "description": desc,
        "status": status,
    }
    if at is not None:
        entry["dateTime"] = at
    return entry


def _plan(n, key, desc="", session=2, at="2026-01-01T09:00:00-05:00"):
    """A seeded ``plan-step`` row, exactly as ``seed_session_plan`` writes it.

    Its ``dateTime`` is REGISTRATION time — one timestamp shared by the
    whole plan — which is why the start-time derivation must never read
    it as a completion (operator ruling 3, 2026-08-12).
    """
    entry = _entry(n, key, sc.PLAN_STEP_STATUS, desc, session=session, at=at)
    entry["kind"] = sc.PLAN_STEP_KIND
    return entry


def _keys_of(rows):
    return [r.step_key for r in rows]


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
        the row and show a stale status beside the current one."""
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

    def test_a_collapsed_row_carries_the_latest_status_not_the_stale_one(
        self, tmp_path
    ):
        """The dogfood defect, restated without the removed marker.

        Re-logging used to leave ``<- here`` on a stale row; Set 120 S3
        removed the marker, but the underlying rule it depended on — the
        collapsed row shows the LATEST status — is still what makes the
        checklist current, so it keeps its own test.
        """
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
        assert [(r.step_key, r.status) for r in rows] == [
            ("a", "complete"),
            ("b", "in-progress"),
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


class TestTheDerivedActiveStep:
    """Set 127 S1: the middle frame, derived rather than written.

    Falsified in both directions (L-112-1). The FIRES case is one test;
    the rest plant the ways a derivation can produce a WRONG signal,
    which is the direction that matters — "no signal" is what this
    replaced, and a wrong one is strictly worse because the operator
    would have a reason to believe it.
    """

    def test_an_in_flight_session_derives_its_first_unlogged_planned_step(
        self, tmp_path
    ):
        """FIRES — and on a ledger that never wrote the token itself.

        This is the retroactive half of the design: nothing in these
        entries says ``in-progress``, and no writer ran to make it so.
        The record is asserted intact afterwards, because a derivation
        that edited the ledger to produce its own answer would be the
        writer this set exists not to add.
        """
        set_dir = _write_set(
            tmp_path,
            [
                _plan(1, "register"),
                _plan(2, "build"),
                _plan(3, "verify"),
                _entry(1, "register", "complete", at="2026-01-01T09:05:00-05:00"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.box for r in rows] == ["[x]", "[~]", "[ ]"]
        assert [r.is_active for r in rows] == [False, True, False]
        assert [r.status for r in rows] == ["complete", "pending", "pending"]
        assert rows[1].effective_status == sc.IN_PROGRESS_STATUS

        on_disk = json.loads(
            (tmp_path / "docs" / "session-sets" / "111-fixture"
             / "activity-log.json").read_text(encoding="utf-8")
        )
        assert [e["status"] for e in on_disk["entries"]] == [
            "pending", "pending", "pending", "complete",
        ]

    def test_a_closed_session_and_a_finished_plan_both_derive_nothing(
        self, tmp_path
    ):
        """DOES NOT FIRE — the two ways there is nothing to be running.

        A ``[~]`` on a session that closed months ago is the headline
        regression this set must not ship; a session whose every planned
        step is logged has no candidate row at all. Both must be silent,
        and they fail for different reasons, so both are planted.
        """
        entries = [
            _plan(1, "register"),
            _plan(2, "build"),
            _entry(1, "register", "complete", at="2026-01-01T09:05:00-05:00"),
        ]
        closed = _write_set(
            tmp_path / "closed",
            entries,
            sessions=[{"number": 2, "status": "complete"}],
        )
        assert not any(r.is_active for r in sc.build_rows(closed, 2))

        caught_up = _write_set(
            tmp_path / "caught-up",
            entries + [_entry(2, "build", "complete", at="2026-01-01T09:40:00-05:00")],
        )
        rows = sc.build_rows(caught_up, 2)
        assert [r.box for r in rows] == ["[x]", "[x]"]
        assert not any(r.is_active for r in rows)

    def test_a_logged_in_progress_or_blocked_row_stands_the_derivation_down(
        self, tmp_path
    ):
        """DOES NOT FIRE — the record wins, and wins for the whole session.

        Both plant the same defect from opposite ends: a row the ledger
        already boxes ``[~]`` or ``[!]`` means the record has answered
        "where is this session", and adding a derived ``[~]`` beside it
        would show two current rows — the exact failure the removed
        ``<- here`` marker produced, and the shape the parity corpus
        pins.
        """
        running = _write_set(
            tmp_path / "running",
            [
                _plan(1, "register"),
                _plan(2, "build"),
                _plan(3, "verify"),
                _entry(3, "verify", "in-progress", at="2026-01-01T09:30:00-05:00"),
            ],
        )
        rows = sc.build_rows(running, 2)
        assert [r.box for r in rows] == ["[ ]", "[ ]", "[~]"]
        assert not any(r.is_active for r in rows)

        blocked = _write_set(
            tmp_path / "blocked",
            [
                _plan(1, "register"),
                _plan(2, "build"),
                _plan(3, "verify"),
                _entry(1, "register", "blocked", at="2026-01-01T09:10:00-05:00"),
            ],
        )
        rows = sc.build_rows(blocked, 2)
        assert [r.box for r in rows] == ["[!]", "[ ]", "[ ]"]
        assert rows[0].status == "blocked"
        assert not any(r.is_active for r in rows)

    def test_an_unrecognised_status_is_evidence_of_nothing(self, tmp_path):
        """DOES NOT FIRE — the five legacy prose-in-``status`` rows.

        Planted in both directions, because "not read as evidence"
        cuts both ways: a prose token on a PLANNED row must not make it
        the active step (it is not a ``[ ]``), and a prose token on a
        LOGGED row must not stand the derivation down (it is not a
        ``[~]`` or ``[!]`` either). ``[?]`` is a question, not an answer.
        """
        planned_prose = _write_set(
            tmp_path / "planned-prose",
            [
                dict(_plan(1, "register"), status="Started the work, then..."),
                _plan(2, "build"),
            ],
        )
        rows = sc.build_rows(planned_prose, 2)
        assert rows[0].box == "[?]"
        assert [r.is_active for r in rows] == [False, True]

        logged_prose = _write_set(
            tmp_path / "logged-prose",
            [
                _plan(1, "register"),
                _plan(2, "build"),
                _entry(
                    1,
                    "register",
                    "Registered and then some prose nobody can parse",
                    at="2026-01-01T09:05:00-05:00",
                ),
            ],
        )
        rows = sc.build_rows(logged_prose, 2)
        assert rows[0].box == "[?]"
        assert [r.is_active for r in rows] == [False, True]

    def test_a_set_with_no_seeded_plan_renders_exactly_as_before(self, tmp_path):
        """DOES NOT FIRE — every set that started before Set 114 S2.

        With no ``plan-step`` rows there is no candidate, so a legacy
        set's checklist is byte-identical to what it printed before this
        change. Asserted on the rendered text, because that is what the
        operator would see change.
        """
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "register", "complete", at="2026-01-01T09:05:00-05:00"),
                _entry(2, "build", "pending"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert not any(r.is_active for r in rows)
        assert sc.render(rows, 2).count(sc.IN_PROGRESS_BOX) == 0

    def test_at_most_one_row_is_derived_whatever_the_log_contains(
        self, tmp_path
    ):
        """STRUCTURAL — the invariant, asserted however the rows are spelled.

        Six planned rows, several of them unlogged and out of order.
        Whatever the ledger holds, exactly one row may carry the derived
        flag; a rule that marked "every unlogged planned step" would pass
        every FIRES case above and fail here.
        """
        set_dir = _write_set(
            tmp_path,
            [_plan(n, f"step-{n}") for n in range(1, 7)]
            + [
                _entry(1, "step-1", "complete", at="2026-01-01T09:05:00-05:00"),
                _entry(4, "step-4", "complete", at="2026-01-01T09:45:00-05:00"),
            ],
        )
        rows = sc.build_rows(set_dir, 2)
        assert sum(1 for r in rows if r.is_active) == 1
        assert sc.render(rows, 2).count(sc.IN_PROGRESS_BOX) == 1


class TestTheDerivedStartTime:
    """Set 127 S1: when the step started, derived from the same rows."""

    def test_a_rows_start_is_the_previous_rows_completion(self, tmp_path):
        """FIRES — including the first row, and across a gap.

        Three boundaries in one ledger. Row 1 has no predecessor, so it
        starts when the SESSION started. Row 2 starts when row 1
        finished. Row 3 — the derived active step — starts when row 2
        finished, thirty-five minutes after row 2 itself started, and
        that gap stays INSIDE the elapsed time on purpose: it is the
        honest reading of "how long has this been running".
        """
        set_dir = _write_set(
            tmp_path,
            [
                _plan(1, "register"),
                _plan(2, "build"),
                _plan(3, "verify"),
                _entry(1, "register", "complete", at="2026-01-01T09:05:00-05:00"),
                _entry(2, "build", "complete", at="2026-01-01T09:40:00-05:00"),
            ],
            started_at="2026-01-01T09:00:00-05:00",
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.started_at for r in rows] == [
            "2026-01-01T09:00:00-05:00",
            "2026-01-01T09:05:00-05:00",
            "2026-01-01T09:40:00-05:00",
        ]
        assert rows[2].is_active is True

    def test_nothing_that_has_not_started_carries_a_time(self, tmp_path):
        """DOES NOT FIRE — and never the plan's own registration stamp.

        Rows 3 to 5 have not started, so they carry no time at all
        (operator ruling 3). The planted look-alike is that every seeded
        row DOES have a ``dateTime`` — the moment the whole plan was
        written, here deliberately a minute before the session began — so
        a derivation that reached for "this row's own timestamp" would
        hand every unstarted step a plausible-looking start. Row 1's
        start is the SESSION's ``startedAt``, not the plan's stamp, which
        is what separates the two. A legacy set with no state file cannot
        invent a first-row start either.
        """
        registered_at = "2026-01-01T08:59:00-05:00"
        set_dir = _write_set(
            tmp_path,
            [_plan(n, f"step-{n}", at=registered_at) for n in range(1, 6)]
            + [_entry(1, "step-1", "complete", at="2026-01-01T09:05:00-05:00")],
            started_at="2026-01-01T09:00:00-05:00",
        )
        rows = sc.build_rows(set_dir, 2)
        assert [r.started_at for r in rows] == [
            "2026-01-01T09:00:00-05:00",
            "2026-01-01T09:05:00-05:00",
            None,
            None,
            None,
        ]
        assert registered_at not in [r.started_at for r in rows]

        # The look-alike, planted where it can actually surface: a LOGGED
        # row whose predecessor is an unclaimed plan row. Its start is
        # "the previous step's completion", and the previous step never
        # completed — so the answer is None, not the registration stamp
        # sitting right there on the row above it.
        skipped = _write_set(
            tmp_path / "skipped",
            [
                _plan(1, "one", at=registered_at),
                _plan(2, "two", at=registered_at),
                _plan(3, "three", at=registered_at),
                _entry(3, "three", "complete", at="2026-01-01T09:30:00-05:00"),
            ],
            started_at="2026-01-01T09:00:00-05:00",
        )
        rows = sc.build_rows(skipped, 2)
        assert [r.is_planned for r in rows] == [True, True, False]
        assert [r.started_at for r in rows] == [
            "2026-01-01T09:00:00-05:00",
            None,
            None,
        ]

        stateless = tmp_path / "stateless"
        stateless.mkdir()
        (stateless / "activity-log.json").write_text(
            json.dumps({"entries": [_entry(1, "a", "complete", session=1)]}),
            encoding="utf-8",
        )
        assert sc.build_rows(str(stateless), 1)[0].started_at is None

    def test_a_bookkeeping_record_is_not_a_step_that_started_or_finished(
        self, tmp_path
    ):
        """Round 1 nit: a policy record has a ``dateTime`` and is not work.

        ``path_aware_critique`` / ``contract_gate`` / ``dual_surface_mode``
        / ``suggestion_disposition`` entries are written by machinery,
        usually at registration, and they RENDER as rows (Set 111 S4) —
        so a start-time rule keyed on "not a planned row" would both give
        one a start of its own and let its timestamp act as the previous
        step's completion for the row below it. Neither is true: it is a
        record about the session, not a step, which is the same reason it
        may not claim a planned row.
        """
        set_dir = _write_set(
            tmp_path,
            [
                _entry(1, "register", "complete", at="2026-01-01T09:05:00-05:00"),
                dict(
                    _entry(
                        1,
                        "session-001/path-aware-critique",
                        "complete",
                        at="2026-01-01T09:06:00-05:00",
                    ),
                    kind="path_aware_critique",
                ),
                _entry(2, "build", "complete", at="2026-01-01T09:50:00-05:00"),
            ],
            started_at="2026-01-01T09:00:00-05:00",
        )
        rows = sc.build_rows(set_dir, 2)
        assert _keys_of(rows) == [
            "register", "session-001/path-aware-critique", "build",
        ]
        assert [r.started_at for r in rows] == [
            "2026-01-01T09:00:00-05:00",
            None,
            "2026-01-01T09:05:00-05:00",
        ]

    def test_a_plan_less_state_file_still_dates_the_first_row(self, tmp_path):
        """Round 1 nit: the carve-out keeps its start at the top level.

        A set whose plan is not yet committed writes a v4 file with no
        ``sessions[]`` array and a top-level ``status`` / ``startedAt``
        instead. Read strictly per-session, that file answered "no start
        time" for every row, so the first row of such a set lost its
        start for no reason — the file says exactly when it began.

        The asymmetry is asserted in the same test: the carve-out
        contributes its ``startedAt`` and never an in-flight claim,
        because the file names no session number to attach a *current
        step* to. Nothing is lost by that refusal — a plan-less set has
        no spec headings, so no plan rows exist to derive onto.
        """
        set_dir = tmp_path / "planless"
        set_dir.mkdir()
        (set_dir / "activity-log.json").write_text(
            json.dumps(
                {
                    "entries": [
                        _entry(1, "a", "complete", session=1,
                               at="2026-01-01T09:20:00-05:00"),
                        _entry(2, "b", "pending", session=1),
                    ]
                }
            ),
            encoding="utf-8",
        )
        (set_dir / "session-state.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 4,
                    "sessionSetName": "planless",
                    "status": "in-progress",
                    "startedAt": "2026-01-01T09:00:00-05:00",
                }
            ),
            encoding="utf-8",
        )
        in_flight, started = sc.session_flight_facts(str(set_dir), 1)
        assert (in_flight, started) == (False, "2026-01-01T09:00:00-05:00")

        rows = sc.build_rows(str(set_dir), 1)
        assert [r.started_at for r in rows] == [
            "2026-01-01T09:00:00-05:00",
            "2026-01-01T09:20:00-05:00",
        ]
        assert not any(r.is_active for r in rows)


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
        row = sc.ChecklistRow(1, "k", "d", status)
        assert row.box == expected

    def test_status_is_case_insensitive(self):
        assert sc.ChecklistRow(1, "k", "d", "COMPLETE").box == "[x]"

    def test_an_unknown_status_is_visibly_unknown(self):
        """Never silently render an unrecognised status as done."""
        assert sc.ChecklistRow(1, "k", "d", "weird").box == "[?]"


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

    def test_no_rendered_surface_carries_a_here_marker(self, tmp_path):
        """The falsifier for the removal (Set 120 S3, operator ruling).

        Deleting a constant is invisible if something reintroduces the
        literal, so this asserts on the RENDERED text of both surfaces
        rather than on the absence of a name. The in-flight row is still
        identifiable — by its ``[~]`` box, which is the fact the ledger
        carries rather than a marker inferred from it.
        """
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "a", "complete"), _entry(2, "b", "in-progress")],
        )
        rows = sc.build_rows(set_dir, 2)
        for out in (sc.render(rows, 2), sc.render_markdown(rows, 2)):
            assert "<- here" not in out
            assert "here" not in out.lower().replace("where", "")
        assert not hasattr(sc, "HERE_MARKER")
        assert not hasattr(sc, "_mark_here")
        assert sc.render(rows, 2).count(sc.IN_PROGRESS_BOX) == 1

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

    def test_markdown_is_a_table_with_a_box_per_row(self, tmp_path):
        set_dir = _write_set(
            tmp_path,
            [_entry(1, "a", "complete"), _entry(2, "b", "in-progress")],
        )
        out = sc.render_markdown(sc.build_rows(set_dir, 2), 2)
        assert out.startswith("| | Session 2 step |")
        assert "| :--- | :--- |" in out
        assert "| [x] | A |" in out
        assert "| [~] | B |" in out

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
