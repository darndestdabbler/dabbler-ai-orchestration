"""Tests for ``ai_router/progress.py`` — Set 030 Session 1.

Covers:
- v3 happy paths: fresh, in-flight, between-sessions, complete, cancelled
- v2 read synthesis: each shape a v2 file can take in the wild
- the 8 invariant validators each producing an actionable error
- edge cases: empty sessions, duplicates, out-of-order, complete before
  in-progress, multiple in-progress, alias canonicalization
- title extraction from spec.md (regex path)

The test conventions mirror ``test_session_state_v2.py``: bypass
package import via ``conftest.py`` and import modules by filename.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import progress
from progress import (
    LIFECYCLE_STATE_CLOSED,
    LIFECYCLE_STATE_WORK_IN_PROGRESS,
    SCHEMA_VERSION_V3,
    SESSION_STATUS_CANCELLED,
    SESSION_STATUS_COMPLETE,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_NOT_STARTED,
    ProgressView,
    SessionRecord,
    SessionStateInvariantError,
    canonicalize_status,
    extract_session_titles_from_spec,
    get_progress,
    read_progress,
    synthesize_v3_from_v2,
    validate_invariants,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _v3_state(sessions, *, top_status, lifecycle_state=None):
    return {
        "schemaVersion": SCHEMA_VERSION_V3,
        "sessionSetName": "test-set",
        "status": top_status,
        "lifecycleState": lifecycle_state,
        "sessions": sessions,
    }


def _session(number, status, title=None):
    return {"number": number, "title": title or f"Session {number}", "status": status}


# ---------------------------------------------------------------------------
# get_progress: happy paths
# ---------------------------------------------------------------------------


class TestGetProgressHappyPath:
    def test_fresh_set_all_not_started(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED), _session(2, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        view = get_progress(state)
        assert view.total_sessions == 2
        assert view.completed_sessions == ()
        assert view.current_session is None
        assert view.next_session == 1
        assert view.is_between_sessions is False

    def test_in_flight_session_2_of_4(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_IN_PROGRESS),
                _session(3, SESSION_STATUS_NOT_STARTED),
                _session(4, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
            lifecycle_state=LIFECYCLE_STATE_WORK_IN_PROGRESS,
        )
        view = get_progress(state)
        assert view.total_sessions == 4
        assert view.completed_sessions == (1,)
        assert view.current_session == 2
        assert view.next_session == 3
        assert view.is_between_sessions is False

    def test_between_sessions(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
            lifecycle_state=LIFECYCLE_STATE_WORK_IN_PROGRESS,
        )
        view = get_progress(state)
        assert view.current_session is None
        assert view.completed_sessions == (1,)
        assert view.next_session == 2
        assert view.is_between_sessions is True

    def test_all_complete(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_COMPLETE),
                _session(3, SESSION_STATUS_COMPLETE),
            ],
            top_status=SESSION_STATUS_COMPLETE,
            lifecycle_state=LIFECYCLE_STATE_CLOSED,
        )
        view = get_progress(state)
        assert view.total_sessions == 3
        assert view.completed_sessions == (1, 2, 3)
        assert view.current_session is None
        assert view.next_session is None
        assert view.is_between_sessions is False

    def test_cancelled_set(self):
        # Set-level cancellation: top-level status 'cancelled' pairs
        # with lifecycleState 'closed'. Session-level statuses aren't
        # constrained by rule 5/6/7 for cancelled top-level state.
        # NOTE: per-session 'cancelled' is rejected (reserved for
        # future schema); only top-level 'cancelled' is exercised here.
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_CANCELLED,
            lifecycle_state=LIFECYCLE_STATE_CLOSED,
        )
        view = get_progress(state)
        assert view.total_sessions == 3
        assert view.completed_sessions == (1,)
        assert view.current_session is None

    def test_to_dict_round_trip(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_IN_PROGRESS), _session(2, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        view = get_progress(state)
        d = view.to_dict()
        assert d["totalSessions"] == 2
        assert d["currentSession"] == 1
        assert d["nextSession"] == 2
        assert d["completedSessions"] == []
        assert d["sessions"][0]["status"] == SESSION_STATUS_IN_PROGRESS


# ---------------------------------------------------------------------------
# Invariant violations: each rule produces an actionable error
# ---------------------------------------------------------------------------


class TestInvariantViolations:
    def test_rule_1_missing_sessions(self):
        state = {
            "schemaVersion": 3,
            "sessionSetName": "x",
            "status": SESSION_STATUS_NOT_STARTED,
        }
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 1

    def test_rule_1_empty_sessions(self):
        state = _v3_state([], top_status=SESSION_STATUS_NOT_STARTED)
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 1

    def test_rule_2_duplicate_numbers(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED), _session(1, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "duplicate" in str(exc.value).lower()

    def test_rule_2_non_sorted_numbers(self):
        # [2, 1] also fails contiguous-from-1 (first entry should be 1).
        state = _v3_state(
            [_session(2, SESSION_STATUS_NOT_STARTED), _session(1, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "contiguous" in str(exc.value).lower()

    def test_rule_2_skipped_numbers_rejected(self):
        # [1, 3] silently passed in earlier drafts; now rule 2 enforces
        # contiguous-from-1 per spec D12 ("Skipped sessions: Not
        # supported in v3 ... Strict sequential invariant").
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED), _session(3, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "contiguous" in str(exc.value).lower()

    def test_rule_2_must_start_at_1(self):
        # Even an in-order sequence starting at 2 is invalid.
        state = _v3_state(
            [_session(2, SESSION_STATUS_NOT_STARTED), _session(3, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "expected 1" in str(exc.value).lower()

    def test_rule_2_session_level_cancelled_rejected(self):
        # Per-session "cancelled" is reserved for a future schema and
        # must be rejected by validators today (top-level "cancelled"
        # is still accepted — see test_cancelled_set).
        state = _v3_state(
            [_session(1, SESSION_STATUS_CANCELLED)],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "unknown status" in str(exc.value).lower()

    def test_rule_2_unknown_top_level_status_reports_rule_2(self):
        # Unknown top-level status is a shape/enum error, not a
        # violation of rules 5/6/7 specifically. Verifier flagged the
        # original rule-5 label as misleading.
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED)],
            top_status="bogus-top-status",
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2
        assert "top-level status" in str(exc.value).lower()

    def test_rule_2_zero_session_number(self):
        state = _v3_state(
            [_session(0, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2

    def test_rule_2_negative_session_number(self):
        state = _v3_state(
            [_session(-1, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2

    def test_rule_2_unknown_status(self):
        state = _v3_state(
            [_session(1, "bogus-status")],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 2

    def test_rule_3_multiple_in_progress(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_IN_PROGRESS),
                _session(2, SESSION_STATUS_IN_PROGRESS),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 3

    def test_rule_4_complete_after_not_started(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_NOT_STARTED),
                _session(2, SESSION_STATUS_COMPLETE),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 4

    def test_rule_4_complete_after_in_progress(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_IN_PROGRESS),
                _session(2, SESSION_STATUS_COMPLETE),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 4

    def test_rule_5_not_started_with_started_session(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_IN_PROGRESS),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_NOT_STARTED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 5

    def test_rule_6_in_progress_with_no_in_flight_and_no_complete(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED)],
            top_status=SESSION_STATUS_IN_PROGRESS,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 6

    def test_rule_7_complete_with_not_started_session(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_COMPLETE,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 7

    def test_rule_8_closed_lifecycle_with_in_progress_status(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_IN_PROGRESS)],
            top_status=SESSION_STATUS_IN_PROGRESS,
            lifecycle_state=LIFECYCLE_STATE_CLOSED,
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(state)
        assert exc.value.rule == 8

    def test_rule_8_fires_even_when_top_status_is_none(self):
        # Earlier draft skipped rules 5-8 entirely when top_status was
        # None, so lifecycleState='closed' with no top-level status
        # bypassed rule 8 silently. Rule 8 now fires regardless.
        sessions = [SessionRecord(1, "a", SESSION_STATUS_NOT_STARTED)]
        with pytest.raises(SessionStateInvariantError) as exc:
            validate_invariants(sessions, top_status=None, lifecycle_state=LIFECYCLE_STATE_CLOSED)
        assert exc.value.rule == 8


# ---------------------------------------------------------------------------
# v2 -> v3 synthesis
# ---------------------------------------------------------------------------


SPEC_BODY = """\
# Some session set

## Sessions

### Session 1 of 3: First session title
content here

### Session 2 of 3: Middle session — has unicode dashes
more content

### Session 3 of 3: Final session
"""


@pytest.fixture
def spec_with_headings(tmp_path: Path) -> Path:
    p = tmp_path / "spec.md"
    p.write_text(SPEC_BODY, encoding="utf-8")
    return p


@pytest.fixture
def spec_missing(tmp_path: Path) -> Path:
    return tmp_path / "missing-spec.md"


class TestSynthesizeV3FromV2:
    def test_v2_not_started(self, spec_with_headings):
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": None,
            "totalSessions": 3,
            "status": "not-started",
            "lifecycleState": None,
            "completedSessions": [],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        assert out["schemaVersion"] == SCHEMA_VERSION_V3
        assert len(out["sessions"]) == 3
        for s in out["sessions"]:
            assert s["status"] == SESSION_STATUS_NOT_STARTED
        assert out["sessions"][0]["title"] == "First session title"
        assert "unicode dashes" in out["sessions"][1]["title"]
        # get_progress accepts the synthesized state
        view = get_progress(out)
        assert view.next_session == 1

    def test_v2_in_flight(self, spec_with_headings):
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 2,
            "totalSessions": 3,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [1],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        assert out["sessions"][0]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][1]["status"] == SESSION_STATUS_IN_PROGRESS
        assert out["sessions"][2]["status"] == SESSION_STATUS_NOT_STARTED
        view = get_progress(out)
        assert view.current_session == 2
        assert view.completed_sessions == (1,)

    def test_v2_between_sessions(self, spec_with_headings):
        # currentSession already in completedSessions[] → between sessions
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 1,
            "totalSessions": 3,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [1],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        # Session 1 closed; session 1 == currentSession so synthesizer
        # must NOT mark it in-progress (it's already in completedSessions[]).
        assert out["sessions"][0]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][1]["status"] == SESSION_STATUS_NOT_STARTED
        view = get_progress(out)
        assert view.is_between_sessions is True
        assert view.current_session is None
        assert view.next_session == 2

    def test_v2_complete_top_status_with_consistent_completed_sessions(self, spec_with_headings):
        # Internally-consistent v2: top-level complete AND every session
        # in completedSessions[]. Synthesizer marks all complete; get_progress
        # validates clean.
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 3,
            "totalSessions": 3,
            "status": "complete",
            "lifecycleState": "closed",
            "completedSessions": [1, 2, 3],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        for s in out["sessions"]:
            assert s["status"] == SESSION_STATUS_COMPLETE
        view = get_progress(out)
        assert view.completed_sessions == (1, 2, 3)

    def test_v2_complete_top_status_with_missing_completed_sessions_fails_loud(
        self, spec_with_headings
    ):
        # Hand-edited v2 inconsistency: top-level 'complete' but
        # completedSessions[] is short. Per Round-A verifier fix:
        # synthesizer no longer force-promotes; it leaves the
        # missing sessions as 'not-started' so rule 7 fires on the
        # next get_progress() call (fail loud, never silently recover).
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 3,
            "totalSessions": 3,
            "status": "complete",
            "lifecycleState": "closed",
            "completedSessions": [1, 2],  # missing 3
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        # The synthesizer reports what the v2 file SAYS, not what it
        # wishes were true. Session 3 stays not-started.
        assert out["sessions"][0]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][1]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][2]["status"] == SESSION_STATUS_NOT_STARTED
        # And get_progress() rejects the contradiction per rule 7.
        with pytest.raises(SessionStateInvariantError) as exc:
            get_progress(out)
        assert exc.value.rule == 7

    def test_v2_status_alias_done_canonicalized(self, spec_with_headings):
        # Lightweight-tier file hand-written with 'done' as top-level
        # status. Synthesizer should canonicalize to 'complete'.
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 3,
            "totalSessions": 3,
            "status": "done",
            "lifecycleState": "closed",
            "completedSessions": [1, 2, 3],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        assert out["status"] == SESSION_STATUS_COMPLETE
        view = get_progress(out)
        assert view.total_sessions == 3

    def test_v2_spec_missing_falls_back_to_generic_titles(self, spec_missing):
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "no-spec-set",
            "currentSession": 1,
            "totalSessions": 2,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [],
        }
        out = synthesize_v3_from_v2(v2, spec_missing)
        assert out["sessions"][0]["title"] == "Session 1"
        assert out["sessions"][1]["title"] == "Session 2"

    def test_v2_bool_currentSession_does_not_escalate(self, spec_with_headings):
        # Python treats bool as int — without the strict-int filter,
        # currentSession: True (rare but possible from a sloppy
        # programmatic writer) would silently mark session 1
        # in-progress. Per Round-A verifier fix: strict int only.
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": True,
            "totalSessions": 2,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        # Session 1 must stay not-started: True is not a positive int.
        assert out["sessions"][0]["status"] == SESSION_STATUS_NOT_STARTED
        assert out["sessions"][1]["status"] == SESSION_STATUS_NOT_STARTED

    def test_v2_bool_completedSessions_entries_ignored(self, spec_with_headings):
        # Same shape risk on the completedSessions[] side: True/1.0
        # would otherwise compare equal to session number 1.
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": None,
            "totalSessions": 2,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [True, 1.0],
        }
        out = synthesize_v3_from_v2(v2, spec_with_headings)
        # Neither True nor 1.0 should escalate session 1 to complete.
        assert out["sessions"][0]["status"] == SESSION_STATUS_NOT_STARTED

    def test_v2_pure_no_mutation(self, spec_with_headings):
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "test-set",
            "currentSession": 1,
            "totalSessions": 1,
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "completedSessions": [],
        }
        original = json.loads(json.dumps(v2))
        synthesize_v3_from_v2(v2, spec_with_headings)
        # synthesize_v3_from_v2 must not mutate its input
        assert v2 == original


# ---------------------------------------------------------------------------
# Title extraction
# ---------------------------------------------------------------------------


class TestExtractTitles:
    def test_parses_headings(self, spec_with_headings):
        titles = extract_session_titles_from_spec(spec_with_headings)
        assert titles == [
            (1, "First session title"),
            (2, "Middle session — has unicode dashes"),
            (3, "Final session"),
        ]

    def test_missing_file_returns_empty(self, spec_missing):
        assert extract_session_titles_from_spec(spec_missing) == []

    def test_no_headings_returns_empty(self, tmp_path: Path):
        p = tmp_path / "spec.md"
        p.write_text("# Title only\n\nNo session headings.\n", encoding="utf-8")
        assert extract_session_titles_from_spec(p) == []

    def test_handles_heading_without_of_n_segment(self, tmp_path: Path):
        # Older specs sometimes write "### Session 1: Title" without "of N"
        p = tmp_path / "spec.md"
        p.write_text("### Session 1: Just a title\n", encoding="utf-8")
        assert extract_session_titles_from_spec(p) == [(1, "Just a title")]


# ---------------------------------------------------------------------------
# Canonicalization helper
# ---------------------------------------------------------------------------


class TestCanonicalizeStatus:
    @pytest.mark.parametrize(
        "raw,canon",
        [
            ("complete", "complete"),
            ("completed", "complete"),
            ("done", "complete"),
            ("in-progress", "in-progress"),
            ("not-started", "not-started"),
            ("cancelled", "cancelled"),
            (None, None),
            ("unknown-future-value", "unknown-future-value"),
        ],
    )
    def test_maps_known_aliases(self, raw, canon):
        assert canonicalize_status(raw) == canon


# ---------------------------------------------------------------------------
# validate_invariants directly (no top-level status)
# ---------------------------------------------------------------------------


class TestValidateInvariantsDirect:
    def test_accepts_sessions_only_when_top_status_none(self):
        sessions = [
            SessionRecord(1, "a", SESSION_STATUS_COMPLETE),
            SessionRecord(2, "b", SESSION_STATUS_IN_PROGRESS),
            SessionRecord(3, "c", SESSION_STATUS_NOT_STARTED),
        ]
        # top_status=None skips rules 5-8; only structural rules 1-4 apply
        validate_invariants(sessions, top_status=None, lifecycle_state=None)


# ---------------------------------------------------------------------------
# read_progress wrapper: v2-or-v3 dispatch (Set 030 Session 3)
# ---------------------------------------------------------------------------


class TestReadProgress:
    """``read_progress`` is the application-reader entry point per D13.

    Branches v2 vs v3 internally so callers in close_session.py,
    gate_checks.py, and the extension tree provider never reach into
    the legacy progress triple themselves.
    """

    def test_v3_state_dispatches_to_get_progress(self, tmp_path: Path):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_IN_PROGRESS),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
            top_status=SESSION_STATUS_IN_PROGRESS,
            lifecycle_state=LIFECYCLE_STATE_WORK_IN_PROGRESS,
        )
        view = read_progress(state, tmp_path / "absent-spec.md")
        assert view.total_sessions == 3
        assert view.completed_sessions == (1,)
        assert view.current_session == 2
        assert view.next_session == 3

    def test_v2_state_synthesizes_then_validates(self, tmp_path: Path):
        spec = tmp_path / "spec.md"
        spec.write_text(
            "### Session 1 of 3: Alpha\n"
            "### Session 2 of 3: Beta\n"
            "### Session 3 of 3: Gamma\n",
            encoding="utf-8",
        )
        v2_state = {
            "schemaVersion": 2,
            "sessionSetName": "legacy",
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "currentSession": 2,
            "totalSessions": 3,
            "completedSessions": [1],
        }
        view = read_progress(v2_state, spec)
        assert view.total_sessions == 3
        assert view.completed_sessions == (1,)
        assert view.current_session == 2
        assert view.sessions[0].title == "Alpha"
        assert view.sessions[1].title == "Beta"

    def test_v3_state_ignores_spec_md(self, tmp_path: Path):
        # On v3 inputs the spec.md path is unused; missing files must
        # not cause an error or affect the returned view.
        state = _v3_state(
            [_session(1, SESSION_STATUS_COMPLETE), _session(2, SESSION_STATUS_COMPLETE)],
            top_status=SESSION_STATUS_COMPLETE,
            lifecycle_state=LIFECYCLE_STATE_CLOSED,
        )
        view = read_progress(state, tmp_path / "does-not-exist.md")
        assert view.total_sessions == 2
        assert view.completed_sessions == (1, 2)

    def test_v2_invariant_violation_raises(self, tmp_path: Path):
        # v2 with status=complete but completedSessions=[] synthesizes
        # to all-not-started; rule 7 fail-louds on the contradiction.
        v2_state = {
            "schemaVersion": 2,
            "status": "complete",
            "currentSession": None,
            "totalSessions": 3,
            "completedSessions": [],
        }
        with pytest.raises(SessionStateInvariantError) as exc:
            read_progress(v2_state, tmp_path / "no-spec.md")
        assert exc.value.rule == 7

    def test_none_state_raises(self):
        with pytest.raises(TypeError):
            read_progress(None, Path("/tmp/spec.md"))  # type: ignore[arg-type]
