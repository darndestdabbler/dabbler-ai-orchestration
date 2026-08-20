import json
from pathlib import Path

import pytest

from ai_router.progress import (
    SessionStateInvariantError,
    build_projection,
    canonicalize_status,
    get_progress,
    heal_title,
    is_generic_title,
    normalize_to_v4_shape,
    read_session_state,
    step_icon_key,
    step_state,
)

CORPUS = Path(__file__).parent / "fixtures" / "corpus"


def v3_state(**overrides):
    state = {
        "schemaVersion": 3,
        "sessionSetName": "010-demo",
        "currentSession": None,
        "totalSessions": 2,
        "status": "complete",
        "startedAt": "2026-05-01T08:00:00-04:00",
        "completedAt": "2026-05-01T09:00:00-04:00",
        "verificationVerdict": "VERIFIED",
        "orchestrator": {"engine": "claude-code", "provider": "anthropic"},
        "sessions": [
            {"number": 1, "title": "One", "status": "complete"},
            {"number": 2, "title": "Two", "status": "complete"},
        ],
        "completedSessions": [1, 2],
    }
    state.update(overrides)
    return state


class TestCanonicalize:
    def test_alias_map_is_complete(self):
        assert canonicalize_status("completed") == "complete"
        assert canonicalize_status("done") == "complete"
        assert canonicalize_status(None) is None
        # Unknown values pass through for the validators to reject.
        assert canonicalize_status("Complete") == "Complete"


class TestNormalizeToV4:
    def test_v3_metadata_promotes_onto_sessions(self, tmp_path):
        out = normalize_to_v4_shape(v3_state(), tmp_path / "spec.md")
        last = out["sessions"][-1]
        assert last["completedAt"] == "2026-05-01T09:00:00-04:00"
        assert last["verificationVerdict"] == "VERIFIED"
        # Between/complete v3 snapshot keeps orchestrator reachable.
        assert last["orchestrator"]["engine"] == "claude-code"

    def test_v4_input_is_not_promoted(self, tmp_path):
        state = v3_state(schemaVersion=4)
        out = normalize_to_v4_shape(state, tmp_path / "spec.md")
        assert out["sessions"][-1]["verificationVerdict"] is None

    def test_v2_shape_synthesizes_sessions(self, tmp_path):
        state = {
            "schemaVersion": 2, "sessionSetName": "010-demo",
            "status": "in-progress", "currentSession": 2,
            "totalSessions": 3, "completedSessions": [1],
        }
        out = normalize_to_v4_shape(state, tmp_path / "spec.md")
        statuses = [s["status"] for s in out["sessions"]]
        assert statuses == ["complete", "in-progress", "not-started"]

    def test_strict_int_boundary(self, tmp_path):
        state = {
            "schemaVersion": 2, "sessionSetName": "x",
            "status": "in-progress", "currentSession": True,
            "totalSessions": 2, "completedSessions": [1.0],
        }
        out = normalize_to_v4_shape(state, tmp_path / "spec.md")
        # bool current and float completed are not ints: nothing escalates.
        assert all(s["status"] == "not-started" for s in out["sessions"])

    def test_derived_top_level_fields(self, tmp_path):
        state = v3_state(
            status="in-progress",
            sessions=[
                {"number": 1, "title": "One", "status": "complete"},
                {"number": 2, "title": "Two", "status": "in-progress"},
            ],
            completedSessions=[1], currentSession=2, completedAt=None,
        )
        out = normalize_to_v4_shape(state, tmp_path / "spec.md")
        assert out["currentSession"] == 2
        assert out["completedSessions"] == [1]
        assert out["completedAt"] is None  # mid-set: no set completion time


class TestTitleHeal:
    def test_generic_is_own_number_only(self):
        assert is_generic_title("Session 3", 3)
        assert not is_generic_title("Session 5", 3)  # drift, never healed
        assert is_generic_title("", 3)
        assert is_generic_title(None, 3)

    def test_heal_prefers_stored_real_title(self):
        assert heal_title("Real title", 1, {1: "Spec title"}) == "Real title"
        assert heal_title("Session 1", 1, {1: "Spec title"}) == "Spec title"
        assert heal_title("Session 1", 1, {}) == "Session 1"

    def test_heal_from_spec_on_read(self, tmp_path):
        (tmp_path / "spec.md").write_text(
            "### Session 1 of 1: The real name\n1. Register.\n",
            encoding="utf-8",
        )
        state = v3_state(
            totalSessions=1, completedSessions=[1],
            sessions=[{"number": 1, "title": "Session 1",
                       "status": "complete"}],
        )
        out = normalize_to_v4_shape(state, tmp_path / "spec.md")
        assert out["sessions"][0]["title"] == "The real name"


class TestInvariants:
    def test_duplicate_numbers_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "status": "complete",
                "sessions": [
                    {"number": 1, "title": "a", "status": "complete"},
                    {"number": 1, "title": "b", "status": "complete"},
                ],
            })

    def test_two_in_progress_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "status": "in-progress",
                "sessions": [
                    {"number": 1, "title": "a", "status": "in-progress"},
                    {"number": 2, "title": "b", "status": "in-progress"},
                ],
            })

    def test_complete_after_open_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "status": "in-progress",
                "sessions": [
                    {"number": 1, "title": "a", "status": "not-started"},
                    {"number": 2, "title": "b", "status": "complete"},
                ],
            })

    def test_between_sessions_is_legal(self):
        view = get_progress({
            "status": "in-progress",
            "sessions": [
                {"number": 1, "title": "a", "status": "complete"},
                {"number": 2, "title": "b", "status": "not-started"},
            ],
        })
        assert view.is_between_sessions
        assert view.next_session == 2


class TestStepVocabulary:
    def test_step_state_and_icon(self):
        assert step_state("pending") == "pending"
        assert step_state("blocked") == "blocked"
        assert step_state("weird prose") == "unknown"
        # blocked folds into the cancelled icon; unknown falls back.
        assert step_icon_key("blocked") == "cancelled"
        assert step_icon_key("weird prose") == "not-started"
        # Falsy statuses read as absent (the pyStr coercion contract).
        assert step_state(0) == "unknown"


class TestProjectionOverCorpus:
    def _projection(self, slug):
        return build_projection(CORPUS / slug)

    def test_v4_complete_set(self):
        p = self._projection("074-dabbler-provider-env-vars")
        assert p["set"]["status"] == "complete"
        assert p["set"]["schemaVersionOnDisk"] == 4
        assert p["sessions"][0]["verificationVerdict"] == "VERIFIED"

    def test_v3_set_normalizes_on_read(self):
        p = self._projection("028-drift-hotfix-harness-hardening")
        assert p["set"]["schemaVersionOnDisk"] == 3
        assert p["set"]["status"] == "complete"
        assert p["set"]["totalSessions"] == 3

    def test_cancelled_set(self):
        p = self._projection("040-codex-launch-adapter")
        assert p["set"]["status"] == "cancelled"
        assert p["set"]["iconKey"] == "cancelled"

    def test_in_progress_set_with_round_artifacts(self):
        p = self._projection("113-narrated-video-walkthroughs")
        assert p["set"]["status"] == "in-progress"
        # Between sessions: 1-7 complete, 8 not started.
        assert p["set"]["currentSession"] is None
        assert p["set"]["sessionsCompleted"] == 7

    def test_title_heal_case(self):
        p = self._projection("059-extension-activation-and-scaffold-fix")
        titles = [s["title"] for s in p["sessions"]]
        assert titles[0] != "Session 1"
        assert "activation" in titles[0].lower()

    def test_spec_only_folder_infers_not_started(self, tmp_path):
        (tmp_path / "spec.md").write_text("# X\n", encoding="utf-8")
        p = build_projection(tmp_path)
        assert p["set"]["status"] == "not-started"

    def test_read_session_state_permission_error_propagates(self, tmp_path):
        # Only FileNotFound/decode errors mean "no usable state".
        assert read_session_state(tmp_path) is None
        (tmp_path / "session-state.json").write_text("{not json",
                                                     encoding="utf-8")
        assert read_session_state(tmp_path) is None


class TestProjectionSteps:
    def test_steps_render_for_in_flight_session(self, tmp_path):
        (tmp_path / "session-state.json").write_text(json.dumps({
            "schemaVersion": 4, "sessionSetName": tmp_path.name,
            "status": "in-progress",
            "sessions": [{"number": 1, "title": "One",
                          "status": "in-progress"}],
        }), encoding="utf-8")
        (tmp_path / "activity-log.json").write_text(json.dumps({
            "sessionSetName": tmp_path.name, "entries": [
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "register",
                 "dateTime": "t", "description": "Register.",
                 "status": "pending", "kind": "plan-step"},
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "register",
                 "dateTime": "t2", "description": "Registered.",
                 "status": "complete"},
                {"sessionNumber": 1, "stepNumber": 2, "stepKey": "work",
                 "dateTime": "t", "description": "Do the work.",
                 "status": "pending", "kind": "plan-step"},
            ],
        }), encoding="utf-8")
        p = build_projection(tmp_path)
        steps = p["sessions"][0]["steps"]
        assert len(steps) == 2
        # Logged step claimed the planned register row.
        assert steps[0]["status"] == "complete"
        assert steps[0]["isPlanned"]
        assert steps[0]["startedAt"] == "t2"  # the logged time, not the seed
        # An unlogged planned row is not active, and does not borrow a start
        # time: only the record marks a step.
        assert not steps[1]["isActive"]
        assert steps[1]["box"] == "[ ]"
        assert steps[1]["status"] == "pending"  # the record is never edited
        assert steps[1]["startedAt"] is None

    def test_logged_start_survives_later_status_entries(self, tmp_path):
        # A step logged in-progress and later complete keeps the
        # in-progress entry's time as its start — the latest entry owns
        # the status, the first owns the start.
        (tmp_path / "session-state.json").write_text(json.dumps({
            "schemaVersion": 4, "sessionSetName": tmp_path.name,
            "status": "in-progress",
            "sessions": [{"number": 1, "title": "One",
                          "status": "in-progress"}],
        }), encoding="utf-8")
        (tmp_path / "activity-log.json").write_text(json.dumps({
            "sessionSetName": tmp_path.name, "entries": [
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "work",
                 "dateTime": "t0", "description": "Do the work.",
                 "status": "pending", "kind": "plan-step"},
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "work",
                 "dateTime": "t1", "description": "Working.",
                 "status": "in-progress"},
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "work",
                 "dateTime": "t2", "description": "Done.",
                 "status": "complete"},
            ],
        }), encoding="utf-8")
        p = build_projection(tmp_path)
        step = p["sessions"][0]["steps"][0]
        assert step["status"] == "complete"
        assert step["description"] == "Done."
        assert step["startedAt"] == "t1"

    def test_paraphrased_key_claims_planned_row_by_number(self, tmp_path):
        (tmp_path / "session-state.json").write_text(json.dumps({
            "schemaVersion": 4, "sessionSetName": tmp_path.name,
            "status": "in-progress",
            "sessions": [{"number": 1, "title": "One",
                          "status": "in-progress"}],
        }), encoding="utf-8")
        (tmp_path / "activity-log.json").write_text(json.dumps({
            "sessionSetName": tmp_path.name, "entries": [
                {"sessionNumber": 1, "stepNumber": 1, "stepKey": "register",
                 "dateTime": "t", "description": "Register.",
                 "status": "pending", "kind": "plan-step"},
                {"sessionNumber": 1, "stepNumber": 2,
                 "stepKey": "choose-the-schema-validation-tool-it",
                 "dateTime": "t", "description": "Choose the tool.",
                 "status": "pending", "kind": "plan-step"},
                {"sessionNumber": 1, "stepNumber": 2,
                 "stepKey": "choose-the-schema-validation-tool",
                 "dateTime": "t2", "description": "Chose jsonschema.",
                 "status": "complete"},
            ],
        }), encoding="utf-8")
        p = build_projection(tmp_path)
        steps = p["sessions"][0]["steps"]
        # The paraphrased key misses, but the stepNumber claims the row.
        assert len(steps) == 2
        assert steps[1]["status"] == "complete"
        assert steps[1]["isPlanned"]
        assert steps[1]["description"] == "Chose jsonschema."
