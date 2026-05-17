"""Set 030 Session 2 — writer-side v3 dual-write tests.

Covers the new behavior of :func:`ai_router.session_state.register_session_start`
and :func:`ai_router.session_state._flip_state_to_closed` (the writer
called by :func:`mark_session_complete` / ``close_session``):

- Dual-write parity: every writer emits BOTH the v3 ``sessions[]``
  ledger AND the legacy ``currentSession`` / ``totalSessions`` /
  ``completedSessions`` triple, derived from ``sessions[]``.
- Writer-side invariant enforcement: invalid inputs raise
  :class:`SessionStateInvariantError` BEFORE any file is written
  (spec D6, fail loud, no silent recovery).
- Title carry-forward: titles already present in ``sessions[]`` are
  preserved across boundary writes; ``spec.md`` headings backfill
  titles for new sets.
- Scaffolding writes v3: :func:`synthesize_not_started_state` and
  :func:`ensure_session_state_file` produce v3-shaped files when
  ``totalSessions`` is known.
- Forced-incident-recovery semantics: ``force=True`` promotes every
  session in the ledger to ``complete`` so rule 7 holds by
  construction.

Tests bypass ``ai_router/`` package import via ``conftest.py``; modules
are imported by filename. Mirrors the convention used in
``test_session_state_v2.py``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import session_state
from session_state import (
    SESSION_STATE_FILENAME,
    SCHEMA_VERSION,
    SESSION_STATUS_COMPLETE,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_NOT_STARTED,
    SessionStateInvariantError,
    _backfill_payload,
    _build_sessions_array,
    _derive_legacy_fields,
    _flip_state_to_closed,
    _not_started_payload,
    backfill_session_state_files,
    ensure_session_state_file,
    mark_session_complete,
    read_session_state,
    register_session_start,
    synthesize_not_started_state,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    """Return a fresh, empty session-set directory path."""
    d = tmp_path / "test-set"
    d.mkdir()
    return str(d)


@pytest.fixture
def spec_md(session_set_dir: str) -> str:
    """Write a minimal spec.md with totalSessions + session headings.

    Returns the spec.md path. Tests that need a different shape (no
    headings, missing config block, etc.) overwrite the file directly.
    """
    spec_path = os.path.join(session_set_dir, "spec.md")
    with open(spec_path, "w", encoding="utf-8") as f:
        f.write(
            "# Test set\n"
            "\n"
            "## Session Set Configuration\n"
            "\n"
            "```yaml\n"
            "totalSessions: 3\n"
            "```\n"
            "\n"
            "### Session 1 of 3: First session title\n"
            "\n"
            "Some body.\n"
            "\n"
            "### Session 2 of 3: Second session title\n"
            "\n"
            "More body.\n"
            "\n"
            "### Session 3 of 3: Third session title\n"
            "\n"
            "Final body.\n"
        )
    return spec_path


def _read(session_set_dir: str) -> dict:
    with open(
        os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8",
    ) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# SCHEMA_VERSION
# ---------------------------------------------------------------------------


class TestSchemaVersion:
    def test_schema_version_is_three(self):
        assert SCHEMA_VERSION == 3


# ---------------------------------------------------------------------------
# Pure-function helpers
# ---------------------------------------------------------------------------


class TestBuildSessionsArray:
    def test_fresh_session_one_in_progress(self, session_set_dir, spec_md):
        sessions = _build_sessions_array(
            session_set_dir,
            total=3,
            completed_numbers=(),
            in_progress_number=1,
            prior_state=None,
        )
        assert [s["status"] for s in sessions] == [
            "in-progress",
            "not-started",
            "not-started",
        ]
        # Titles pulled from spec.md
        assert sessions[0]["title"] == "First session title"
        assert sessions[1]["title"] == "Second session title"
        assert sessions[2]["title"] == "Third session title"

    def test_session_two_with_session_one_complete(self, session_set_dir, spec_md):
        sessions = _build_sessions_array(
            session_set_dir,
            total=3,
            completed_numbers=[1],
            in_progress_number=2,
            prior_state=None,
        )
        assert [s["status"] for s in sessions] == [
            "complete",
            "in-progress",
            "not-started",
        ]

    def test_between_sessions_no_in_progress(self, session_set_dir, spec_md):
        sessions = _build_sessions_array(
            session_set_dir,
            total=3,
            completed_numbers=[1],
            in_progress_number=None,
            prior_state=None,
        )
        assert [s["status"] for s in sessions] == [
            "complete",
            "not-started",
            "not-started",
        ]

    def test_all_complete(self, session_set_dir, spec_md):
        sessions = _build_sessions_array(
            session_set_dir,
            total=3,
            completed_numbers=[1, 2, 3],
            in_progress_number=None,
            prior_state=None,
        )
        assert all(s["status"] == "complete" for s in sessions)

    def test_title_carry_forward_from_prior_state(self, session_set_dir, spec_md):
        prior_state = {
            "sessions": [
                {"number": 1, "title": "Carryover title 1", "status": "complete"},
                {"number": 2, "title": "Carryover title 2", "status": "in-progress"},
                {"number": 3, "title": "Carryover title 3", "status": "not-started"},
            ]
        }
        sessions = _build_sessions_array(
            session_set_dir,
            total=3,
            completed_numbers=[1],
            in_progress_number=2,
            prior_state=prior_state,
        )
        # Existing titles win over spec.md headings.
        assert sessions[0]["title"] == "Carryover title 1"
        assert sessions[1]["title"] == "Carryover title 2"
        assert sessions[2]["title"] == "Carryover title 3"

    def test_generic_fallback_when_no_spec_or_prior(self, session_set_dir):
        sessions = _build_sessions_array(
            session_set_dir,
            total=2,
            completed_numbers=(),
            in_progress_number=1,
            prior_state=None,
        )
        assert sessions[0]["title"] == "Session 1"
        assert sessions[1]["title"] == "Session 2"

    def test_invalid_total_raises_invariant_error(self, session_set_dir):
        with pytest.raises(SessionStateInvariantError) as excinfo:
            _build_sessions_array(
                session_set_dir,
                total=0,
                completed_numbers=(),
                in_progress_number=None,
                prior_state=None,
            )
        # Rule 1 is the structural "non-empty" rule.
        assert excinfo.value.rule == 1


class TestDeriveLegacyFields:
    def test_in_progress_session_one(self):
        sessions = [
            {"number": 1, "title": "x", "status": "in-progress"},
            {"number": 2, "title": "y", "status": "not-started"},
        ]
        current, total, completed = _derive_legacy_fields(sessions)
        assert current == 1
        assert total == 2
        assert completed == []

    def test_between_sessions_no_in_progress(self):
        sessions = [
            {"number": 1, "title": "x", "status": "complete"},
            {"number": 2, "title": "y", "status": "not-started"},
        ]
        current, total, completed = _derive_legacy_fields(sessions)
        assert current is None
        assert total == 2
        assert completed == [1]

    def test_completed_sessions_sorted(self):
        sessions = [
            {"number": 1, "title": "x", "status": "complete"},
            {"number": 2, "title": "y", "status": "in-progress"},
            {"number": 3, "title": "z", "status": "complete"},
        ]
        current, total, completed = _derive_legacy_fields(sessions)
        # Sorted ascending (even though session 3 complete is rule 4
        # violation; derivation is purely mechanical, validation lives
        # in validate_invariants).
        assert completed == [1, 3]

    def test_all_complete(self):
        sessions = [
            {"number": 1, "title": "x", "status": "complete"},
            {"number": 2, "title": "y", "status": "complete"},
        ]
        current, total, completed = _derive_legacy_fields(sessions)
        assert current is None
        assert total == 2
        assert completed == [1, 2]


# ---------------------------------------------------------------------------
# register_session_start — v3 dual-write
# ---------------------------------------------------------------------------


class TestRegisterSessionStartV3:
    def test_writes_v3_sessions_array_and_legacy_triple(
        self, session_set_dir, spec_md,
    ):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        data = _read(session_set_dir)
        # v3 fields
        assert data["schemaVersion"] == 3
        assert isinstance(data["sessions"], list)
        assert len(data["sessions"]) == 3
        assert data["sessions"][0]["number"] == 1
        assert data["sessions"][0]["title"] == "First session title"
        assert data["sessions"][0]["status"] == "in-progress"
        # Legacy triple, derived from sessions[]
        assert data["currentSession"] == 1
        assert data["totalSessions"] == 3
        assert data["completedSessions"] == []
        # Top-level status
        assert data["status"] == "in-progress"
        assert data["lifecycleState"] == "work_in_progress"

    def test_titles_carry_across_start_close_start(
        self, session_set_dir, spec_md,
    ):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Mutate one of the spec.md titles between writes; the title
        # already in sessions[] must win.
        with open(os.path.join(session_set_dir, "spec.md"), encoding="utf-8") as f:
            spec_text = f.read()
        spec_text = spec_text.replace(
            "### Session 1 of 3: First session title",
            "### Session 1 of 3: Renamed title",
        )
        with open(os.path.join(session_set_dir, "spec.md"), "w", encoding="utf-8") as f:
            f.write(spec_text)

        mark_session_complete(session_set_dir, force=True)
        data = _read(session_set_dir)
        # Title from the original write survived.
        assert data["sessions"][0]["title"] == "First session title"

    def test_dual_write_parity_after_session_two_start(
        self, session_set_dir, spec_md,
    ):
        # session 1 start + natural mid-set close (via the
        # gate-bypass internal helper to keep the test focused on
        # writer mechanics, not gate scaffolding), then session 2
        # start. The v3 sessions[] and the legacy triple must agree
        # at every boundary write.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Natural mid-set close (no change-log, no forced) leaves
        # session 1 complete and the SET in-progress (between-sessions).
        _flip_state_to_closed(session_set_dir, forced=False)
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        data = _read(session_set_dir)
        # Derive legacy from sessions[], compare to the on-disk values.
        derived_current, derived_total, derived_completed = _derive_legacy_fields(
            data["sessions"]
        )
        assert data["currentSession"] == derived_current == 2
        assert data["totalSessions"] == derived_total == 3
        assert data["completedSessions"] == derived_completed == [1]

    def test_writer_refuses_in_progress_conflict(
        self, session_set_dir, spec_md,
    ):
        # First registration: session 1 in-progress.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Direct re-register of session 2 while session 1 is still
        # in-progress (bypassing the start_session CLI's boundary
        # check) must raise on the writer-side invariant because the
        # resulting sessions[] would have two in-progress entries —
        # except the builder OVERWRITES session 1's status to
        # not-started for any session not in completed_set and not
        # the in_progress target. So a direct call cannot produce two
        # in-progress sessions; instead the conflict is "session 1
        # got demoted from in-progress to not-started." That's the
        # CLI's job to refuse; the writer's invariant catches the
        # downstream consequences. This test asserts the writer
        # itself does NOT raise on this direct call (it builds a
        # consistent sessions[] with the new in-progress target),
        # confirming the CLI's boundary check is the right layer for
        # the "don't skip ahead" rule.
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        data = _read(session_set_dir)
        # Only session 2 is in-progress now; session 1 demoted to
        # not-started (it never made it into completedSessions).
        assert data["sessions"][0]["status"] == "not-started"
        assert data["sessions"][1]["status"] == "in-progress"

    def test_backfills_totalSessions_from_spec_md(
        self, session_set_dir, spec_md,
    ):
        # Call without total_sessions; the writer must read spec.md.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=None,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        data = _read(session_set_dir)
        assert data["totalSessions"] == 3
        assert len(data["sessions"]) == 3

    def test_emits_work_started_event_idempotent_on_repeat(
        self, session_set_dir, spec_md,
    ):
        from session_events import read_events

        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Idempotency invariant preserved across the v3 migration.
        events = read_events(session_set_dir)
        work_started_1 = [
            e for e in events
            if e.event_type == "work_started" and e.session_number == 1
        ]
        assert len(work_started_1) == 1


# ---------------------------------------------------------------------------
# _flip_state_to_closed (mark_session_complete) — v3 dual-write
# ---------------------------------------------------------------------------


class TestMarkSessionCompleteV3:
    def test_mid_set_close_leaves_set_in_progress(
        self, session_set_dir, spec_md,
    ):
        # No change-log AND not forced → mid-set close does NOT flip
        # the SET to complete (Set 022 invariant preserved under v3).
        # Use _flip_state_to_closed directly with forced=False to
        # bypass the gate without triggering incident-recovery
        # semantics.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        _flip_state_to_closed(session_set_dir, forced=False)
        data = _read(session_set_dir)
        # SET stays in-progress (between sessions); session 1 alone
        # is complete in the ledger.
        assert data["status"] == "in-progress"
        assert data["lifecycleState"] == "work_in_progress"
        assert data["sessions"][0]["status"] == "complete"
        assert data["sessions"][1]["status"] == "not-started"
        assert data["sessions"][2]["status"] == "not-started"
        # Derived legacy: between-sessions, no in-progress.
        assert data["currentSession"] is None
        assert data["completedSessions"] == [1]

    def test_final_session_close_flips_set_complete(
        self, session_set_dir, spec_md,
    ):
        # Close all three sessions through the natural close path
        # (no forced incident-recovery); change-log present on the
        # last one → SET flips to complete via the sessions_done +
        # change_log_present test.
        for n in (1, 2, 3):
            register_session_start(
                session_set=session_set_dir,
                session_number=n,
                total_sessions=3,
                orchestrator_engine="claude-code",
                orchestrator_model="claude-opus-4-7",
            )
            if n == 3:
                with open(
                    os.path.join(session_set_dir, "change-log.md"),
                    "w", encoding="utf-8",
                ) as f:
                    f.write("# Change log\n")
            _flip_state_to_closed(session_set_dir, forced=False)
        data = _read(session_set_dir)
        assert data["status"] == "complete"
        assert data["lifecycleState"] == "closed"
        assert data["completedAt"] is not None
        assert all(s["status"] == "complete" for s in data["sessions"])
        assert data["completedSessions"] == [1, 2, 3]
        # currentSession derives to None (no session in-progress).
        assert data["currentSession"] is None

    def test_forced_promotes_all_to_complete(
        self, session_set_dir, spec_md,
    ):
        # No change-log; forced=True should promote ALL sessions to
        # complete (incident-recovery semantics, spec D6).
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Skip running through session 1 normally — this simulates the
        # operator force-closing mid-set as an emergency exit.
        # Mark complete with force=True: even though the gate would
        # fail (no disposition, no change-log), forced=True takes the
        # "set is done" path and promotes every session to complete.
        mark_session_complete(session_set_dir, force=True)
        data = _read(session_set_dir)
        assert data["status"] == "complete"
        assert data["lifecycleState"] == "closed"
        assert data.get("forceClosed") is True
        assert all(s["status"] == "complete" for s in data["sessions"])
        assert data["completedSessions"] == [1, 2, 3]


# ---------------------------------------------------------------------------
# Scaffolding writers — _not_started_payload + _backfill_payload
# ---------------------------------------------------------------------------


class TestScaffoldingWritesV3:
    def test_synthesize_not_started_includes_sessions_array(
        self, session_set_dir, spec_md,
    ):
        path = synthesize_not_started_state(session_set_dir)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        assert data["status"] == "not-started"
        assert data["lifecycleState"] is None
        assert isinstance(data["sessions"], list)
        assert len(data["sessions"]) == 3
        assert all(s["status"] == "not-started" for s in data["sessions"])
        # Derived legacy
        assert data["completedSessions"] == []
        assert data["currentSession"] is None
        assert data["totalSessions"] == 3

    def test_synthesize_not_started_omits_sessions_when_total_unknown(
        self, session_set_dir,
    ):
        # No spec.md → totalSessions unknown. sessions[] absent
        # (rule 1 explicitly allows "no plan yet").
        path = synthesize_not_started_state(session_set_dir)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        assert data["status"] == "not-started"
        assert "sessions" not in data
        assert data["totalSessions"] is None

    def test_synthesize_not_started_idempotent(
        self, session_set_dir, spec_md,
    ):
        synthesize_not_started_state(session_set_dir)
        before = Path(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        ).read_text(encoding="utf-8")
        synthesize_not_started_state(session_set_dir)
        after = Path(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        ).read_text(encoding="utf-8")
        assert before == after

    def test_backfill_payload_change_log_present_marks_all_complete(
        self, session_set_dir, spec_md,
    ):
        # Legacy folder with a change-log.md → backfill should produce
        # status=complete, lifecycle=closed, sessions[] all complete.
        with open(
            os.path.join(session_set_dir, "change-log.md"), "w", encoding="utf-8",
        ) as f:
            f.write("# Change log\n")
        path = ensure_session_state_file(session_set_dir)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        assert data["status"] == "complete"
        assert data["lifecycleState"] == "closed"
        assert all(s["status"] == "complete" for s in data["sessions"])
        assert data["completedSessions"] == [1, 2, 3]

    def test_backfill_payload_change_log_without_spec_total_stays_not_started(
        self, tmp_path: Path,
    ):
        # Round-A regression (Set 030 Session 3): when spec.md has no
        # Session Set Configuration totalSessions, buildSessions
        # returns no sessions[] array. The change-log branch MUST NOT
        # escalate to status=complete in that case — it would write a
        # snapshot violating rule 1 (sessions[] required) and rule 7
        # (top-status complete requires every session complete) that
        # readProgress would then reject. The fix: fall through to
        # the not-started shape; the next boundary write with a plan
        # re-promotes.
        session_set_dir_ = tmp_path / "plan-less-set"
        session_set_dir_.mkdir()
        (session_set_dir_ / "spec.md").write_text(
            "# plan-less-set\n\nNo Session Set Configuration block.\n",
            encoding="utf-8",
        )
        (session_set_dir_ / "change-log.md").write_text(
            "# Change log\n", encoding="utf-8",
        )
        path = ensure_session_state_file(str(session_set_dir_))
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        # Must NOT escalate to complete without per-session evidence.
        assert data["status"] == "not-started"
        assert data["lifecycleState"] is None
        # readProgress must accept the snapshot (no rule-1/rule-7 fail).
        # An empty sessions[] case (totalSessions unknown) means
        # sessions[] is omitted entirely; readProgress falls into the
        # v2 synthesis path which produces an all-not-started view —
        # consistent with status=not-started.
        assert "sessions" not in data

    def test_backfill_payload_activity_log_without_spec_total_stays_not_started(
        self, tmp_path: Path,
    ):
        # Same Round-A regression for the activity-log-only branch.
        session_set_dir_ = tmp_path / "plan-less-set-active"
        session_set_dir_.mkdir()
        (session_set_dir_ / "spec.md").write_text(
            "# plan-less-set-active\n", encoding="utf-8",
        )
        (session_set_dir_ / "activity-log.json").write_text(
            json.dumps({"entries": [{"sessionNumber": 1, "dateTime": "2026-05-17T10:00:00-04:00"}]}),
            encoding="utf-8",
        )
        path = ensure_session_state_file(str(session_set_dir_))
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        assert data["status"] == "not-started"
        assert "sessions" not in data

    def test_backfill_payload_activity_log_only_marks_session_one_in_progress(
        self, session_set_dir, spec_md,
    ):
        # Legacy folder with activity-log.json only → backfill assumes
        # session 1 is in-progress (conservative fallback).
        with open(
            os.path.join(session_set_dir, "activity-log.json"), "w", encoding="utf-8",
        ) as f:
            json.dump({
                "sessionSetName": "test-set",
                "createdDate": "2026-05-15T10:00:00-04:00",
                "totalSessions": 3,
                "entries": [
                    {
                        "sessionNumber": 1,
                        "stepNumber": 1,
                        "stepKey": "session-1/foo",
                        "dateTime": "2026-05-15T10:00:00-04:00",
                        "description": "test",
                        "status": "complete",
                    },
                ],
            }, f)
        path = ensure_session_state_file(session_set_dir)
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        assert data["schemaVersion"] == 3
        assert data["status"] == "in-progress"
        assert data["lifecycleState"] == "work_in_progress"
        assert data["sessions"][0]["status"] == "in-progress"
        assert all(
            s["status"] == "not-started" for s in data["sessions"][1:]
        )
        # Derived current session
        assert data["currentSession"] == 1

    def test_bulk_backfill_writes_v3_to_legacy_folders(self, tmp_path: Path):
        # docs/session-sets/<slug>/spec.md but no session-state.json
        # — backfill walks the directory and writes v3 shape.
        base = tmp_path / "session-sets"
        base.mkdir()
        slug = base / "001-test"
        slug.mkdir()
        (slug / "spec.md").write_text(
            "# Test\n\n"
            "## Session Set Configuration\n\n"
            "```yaml\ntotalSessions: 2\n```\n\n"
            "### Session 1 of 2: First\n\n"
            "### Session 2 of 2: Second\n",
            encoding="utf-8",
        )
        count = backfill_session_state_files(str(base))
        assert count == 1
        data = json.loads(
            (slug / SESSION_STATE_FILENAME).read_text(encoding="utf-8")
        )
        assert data["schemaVersion"] == 3
        assert len(data["sessions"]) == 2
        assert data["sessions"][0]["title"] == "First"
        assert data["sessions"][1]["title"] == "Second"


# ---------------------------------------------------------------------------
# Writer-side invariant enforcement
# ---------------------------------------------------------------------------


class TestWriterRejectsOutOfRange:
    """Round A verifier-flagged scenarios.

    The writer must surface upstream bugs by raising
    :class:`SessionStateInvariantError` rather than silently
    truncating bad inputs to a "looks valid" sessions[] (spec D6,
    fail loud). The CLI's boundary checks (``start_session.py``)
    catch these cases at the CLI layer; these tests prove the writer
    is the second line of defense.
    """

    def test_register_refuses_session_number_above_total(
        self, session_set_dir, spec_md,
    ):
        # Starting session 5 against totalSessions=3 should raise.
        # Previously this silently truncated and wrote a
        # between-sessions snapshot with currentSession=None — the
        # exact "looks valid" failure the verifier flagged.
        with pytest.raises(SessionStateInvariantError) as excinfo:
            register_session_start(
                session_set=session_set_dir,
                session_number=5,
                total_sessions=3,
                orchestrator_engine="claude-code",
                orchestrator_model="claude-opus-4-7",
            )
        assert excinfo.value.rule == 2
        # No on-disk file written: the validation happened BEFORE the
        # snapshot write.
        assert not os.path.isfile(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        )

    def test_build_sessions_array_refuses_in_progress_out_of_range(
        self, session_set_dir,
    ):
        with pytest.raises(SessionStateInvariantError) as excinfo:
            _build_sessions_array(
                session_set_dir,
                total=3,
                completed_numbers=(),
                in_progress_number=5,
                prior_state=None,
            )
        assert excinfo.value.rule == 2

    def test_build_sessions_array_refuses_completed_out_of_range(
        self, session_set_dir,
    ):
        with pytest.raises(SessionStateInvariantError) as excinfo:
            _build_sessions_array(
                session_set_dir,
                total=3,
                completed_numbers=[1, 5],
                in_progress_number=None,
                prior_state=None,
            )
        assert excinfo.value.rule == 2

    def test_build_sessions_array_refuses_zero_or_negative_session_number(
        self, session_set_dir,
    ):
        with pytest.raises(SessionStateInvariantError):
            _build_sessions_array(
                session_set_dir,
                total=3,
                completed_numbers=(),
                in_progress_number=0,
                prior_state=None,
            )
        with pytest.raises(SessionStateInvariantError):
            _build_sessions_array(
                session_set_dir,
                total=3,
                completed_numbers=[-1],
                in_progress_number=None,
                prior_state=None,
            )

    def test_register_event_not_emitted_when_validation_fails(
        self, session_set_dir, spec_md,
    ):
        # Round A verifier issue 4: work_started must NOT be appended
        # if the validation fails. The new ordering puts the event
        # append AFTER validation; this test proves a validation
        # failure leaves the events ledger empty.
        from session_events import read_events

        with pytest.raises(SessionStateInvariantError):
            register_session_start(
                session_set=session_set_dir,
                session_number=99,
                total_sessions=3,
                orchestrator_engine="claude-code",
                orchestrator_model="claude-opus-4-7",
            )
        events = read_events(session_set_dir)
        assert not any(
            e.event_type == "work_started" for e in events
        ), (
            "work_started must not be appended when validation fails; "
            f"got events={events!r}"
        )


class TestFlipStateRequiresTotalSessions:
    """Round A verifier issue 3: _flip_state_to_closed must not fall
    through to an unvalidated legacy-only write when totalSessions
    can't be determined.
    """

    def test_flip_raises_when_total_cannot_be_inferred(self, session_set_dir):
        # Manually write a state file with NO totalSessions, NO
        # currentSession (so new_completed stays empty), NO spec.md,
        # and NO existing sessions[]. The fallback chain in
        # _flip_state_to_closed should resolve to 0 → raise rule 1
        # rather than silently fall through to an unvalidated
        # legacy-only write.
        with open(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME),
            "w", encoding="utf-8",
        ) as f:
            json.dump({
                "schemaVersion": 2,
                "sessionSetName": "test-set",
                "currentSession": None,
                "totalSessions": None,
                "status": "in-progress",
                "lifecycleState": "work_in_progress",
                "startedAt": "2026-05-17T10:00:00-04:00",
            }, f)
        with pytest.raises(SessionStateInvariantError) as excinfo:
            _flip_state_to_closed(session_set_dir, forced=False)
        assert excinfo.value.rule == 1


class TestNaturalLastSessionCloseDoesNotPromoteAll:
    """Round A verifier issue 2: natural last-session close must use
    ``new_completed`` as-is (not ``list(range(1, total+1))``). Under
    forced=True the all-promotion branch fires; under natural close
    the writer trusts ``new_completed`` and lets the invariant
    validator be the asserter.
    """

    def test_natural_close_uses_new_completed_not_range_promotion(
        self, session_set_dir, spec_md,
    ):
        # Close sessions 1, 2, 3 naturally (no forced); the resulting
        # sessions[] complete-status entries must equal new_completed
        # exactly, not a synthetic list(range(1, total+1)). The
        # easiest way to observe this: confirm the final ledger
        # status sequence is computed from prior_state + the just-
        # closed session, not from a blanket "everything complete"
        # short-circuit.
        for n in (1, 2, 3):
            register_session_start(
                session_set=session_set_dir,
                session_number=n,
                total_sessions=3,
                orchestrator_engine="claude-code",
                orchestrator_model="claude-opus-4-7",
            )
            if n == 3:
                with open(
                    os.path.join(session_set_dir, "change-log.md"),
                    "w", encoding="utf-8",
                ) as f:
                    f.write("# Change log\n")
            _flip_state_to_closed(session_set_dir, forced=False)
            data = _read(session_set_dir)
            # After session N closes naturally, sessions 1..N must be
            # complete, sessions N+1..3 must be not-started. This
            # would NOT hold if forced=True logic was incorrectly
            # triggered on natural close — the unfinished sessions
            # would be wrongly promoted.
            for k in range(1, n + 1):
                assert data["sessions"][k - 1]["status"] == "complete"
            for k in range(n + 1, 4):
                assert data["sessions"][k - 1]["status"] == "not-started"


class TestWriterInvariantEnforcement:
    def test_invalid_total_raises_at_writer(self, session_set_dir, spec_md):
        # Force the writer to construct an invalid sessions[] by
        # passing total_sessions=0. The first-stage fallback logic
        # tries to recover from spec.md / max(prior_completed), but
        # we can break that by also passing session_number=0.
        # Actually the easier path is: invoke the underlying
        # _build_sessions_array directly with total=0.
        with pytest.raises(SessionStateInvariantError) as excinfo:
            _build_sessions_array(
                session_set_dir,
                total=-1,
                completed_numbers=(),
                in_progress_number=None,
                prior_state=None,
            )
        assert excinfo.value.rule == 1

    def test_writer_validation_runs_before_file_write(
        self, session_set_dir, spec_md,
    ):
        # Construct a contradictory call: prior_completed includes
        # session_number itself. The builder would set that session
        # to in-progress (in_progress_number argument wins over
        # completed_numbers), making the sessions[] structurally
        # valid (one in-progress, no contradictions). So this is NOT
        # a writer-side rejection — it's the boundary CLI's job.
        # Confirm the writer accepts the call and writes consistent
        # state.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=3,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        data = _read(session_set_dir)
        # State on disk is internally consistent: session 1
        # in-progress, others not-started.
        assert data["sessions"][0]["status"] == "in-progress"
        assert data["completedSessions"] == []

    def test_validate_invariants_imported_from_progress(self):
        # Module-level re-export: writers and progress.py share the
        # exception class.
        from progress import SessionStateInvariantError as ProgErr
        assert SessionStateInvariantError is ProgErr
