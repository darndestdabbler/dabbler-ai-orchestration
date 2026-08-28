import json
from pathlib import Path

import pytest

from ai_router.approved_plan import new_plan, write_plan
from ai_router.ledger import (
    append_round,
    append_step_event,
    session_run_dir,
    step_execution_path,
)
from ai_router.progress import (
    SessionStateInvariantError,
    TaskRowsRefused,
    VerificationRefused,
    build_projection,
    build_task_rows,
    build_verification_view,
    canonicalize_status,
    get_progress,
    heal_title,
    is_generic_title,
    normalize_legacy_state,
    read_session_state,
    session_display_number,
    session_has_history,
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


class TestLegacyReader:
    def test_v3_metadata_promotes_onto_sessions(self, tmp_path):
        out = normalize_legacy_state(v3_state(), tmp_path / "spec.md")
        last = out["sessions"][-1]
        assert last["completedAt"] == "2026-05-01T09:00:00-04:00"
        assert last["verificationVerdict"] == "VERIFIED"
        # Between/complete v3 snapshot keeps orchestrator reachable.
        assert last["orchestrator"]["engine"] == "claude-code"

    def test_v4_input_is_not_promoted(self, tmp_path):
        state = v3_state(schemaVersion=4)
        out = normalize_legacy_state(state, tmp_path / "spec.md")
        assert out["sessions"][-1]["verificationVerdict"] is None

    def test_v2_shape_synthesizes_sessions(self, tmp_path):
        state = {
            "schemaVersion": 2, "sessionSetName": "010-demo",
            "status": "in-progress", "currentSession": 2,
            "totalSessions": 3, "completedSessions": [1],
        }
        out = normalize_legacy_state(state, tmp_path / "spec.md")
        statuses = [s["status"] for s in out["sessions"]]
        assert statuses == ["complete", "in-progress", "not-started"]

    def test_strict_int_boundary(self, tmp_path):
        state = {
            "schemaVersion": 2, "sessionSetName": "x",
            "status": "in-progress", "currentSession": True,
            "totalSessions": 2, "completedSessions": [1.0],
        }
        out = normalize_legacy_state(state, tmp_path / "spec.md")
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
        out = normalize_legacy_state(state, tmp_path / "spec.md")
        assert out["currentSession"] == 2
        assert out["completedSessions"] == [1]
        assert out["completedAt"] is None  # mid-set: no set completion time


class TestSessionDisplayNumber:
    def test_three_digits_padded_and_never_truncated(self):
        assert session_display_number(1) == "001"
        assert session_display_number(15) == "015"
        assert session_display_number(1234) == "1234"

    def test_a_value_that_is_not_a_session_number_is_not_invented_into_one(self):
        assert session_display_number(0) == "0"
        assert session_display_number(None) == "None"

    def test_the_projection_carries_the_written_name_beside_the_integer(
        self, tmp_path
    ):
        # One owner for the padding: the extension renders this rather
        # than re-deriving it, and sessions.json keeps the integer.
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [{"number": 7, "title": "Seven", "status": "not-started"}],
        }), encoding="utf-8")
        session = build_projection(tmp_path)["sessions"][0]
        assert session["number"] == 7
        assert session["displayNumber"] == "007"


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
        out = normalize_legacy_state(state, tmp_path / "spec.md")
        assert out["sessions"][0]["title"] == "The real name"

    def test_a_session_that_ran_keeps_its_title_over_a_recut_plan(self):
        # Re-cutting a plan moves sessions between numbers. What the plan
        # now says at a number a session already ran under describes
        # something else; what it says at a number nothing has reached is
        # the only claim there is.
        ran = {"number": 3, "title": "What actually happened",
               "status": "complete"}
        never_ran = {"number": 4, "title": "Whatever used to sit here",
                     "status": "not-started"}
        titles = {3: "Something else now", 4: "The plan's session 4"}
        assert heal_title(ran["title"], 3, titles,
                          has_history=session_has_history(ran)) == (
            "What actually happened")
        assert heal_title(never_ran["title"], 4, titles,
                          has_history=session_has_history(never_ran)) == (
            "The plan's session 4")

    def test_a_stamped_not_started_session_counts_as_history(self):
        # Registered and then reverted: not-started, but the record has
        # already said something about it.
        assert session_has_history(
            {"number": 2, "status": "not-started",
             "startedAt": "2026-08-28T04:00:00-04:00"})
        assert not session_has_history({"number": 2, "status": "not-started"})

    def test_projection_renders_a_moved_session_under_the_plan_title(
        self, tmp_path
    ):
        (tmp_path / "session-plan.md").write_text(
            "### Session 1 of 2: Ran already\n1. Register.\n"
            "### Session 2 of 2: The re-cut name\n1. Register.\n",
            encoding="utf-8",
        )
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [
                {"number": 1, "title": "Ran under this name",
                 "status": "complete"},
                {"number": 2, "title": "The name that moved away",
                 "status": "not-started"},
            ],
        }), encoding="utf-8")
        projection = build_projection(tmp_path)
        assert [s["title"] for s in projection["sessions"]] == [
            "Ran under this name", "The re-cut name",
        ]
        # A render, never a write.
        stored = json.loads(
            (tmp_path / "sessions.json").read_text(encoding="utf-8"))
        assert stored["sessions"][1]["title"] == "The name that moved away"


class TestInvariants:
    def test_duplicate_numbers_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "sessions": [
                    {"number": 1, "title": "a", "status": "complete"},
                    {"number": 1, "title": "b", "status": "complete"},
                ],
            })

    def test_two_in_progress_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "sessions": [
                    {"number": 1, "title": "a", "status": "in-progress"},
                    {"number": 2, "title": "b", "status": "in-progress"},
                ],
            })

    def test_complete_after_open_rejected(self):
        with pytest.raises(SessionStateInvariantError):
            get_progress({
                "sessions": [
                    {"number": 1, "title": "a", "status": "not-started"},
                    {"number": 2, "title": "b", "status": "complete"},
                ],
            })

    def test_between_sessions_is_legal(self):
        view = get_progress({
            "sessions": [
                {"number": 1, "title": "a", "status": "complete"},
                {"number": 2, "title": "b", "status": "not-started"},
            ],
        })
        assert view.is_between_sessions
        assert view.next_session == 2


class TestProjection:
    def test_the_projection_reports_the_repository_not_a_set(self, tmp_path):
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [
                {"number": 1, "title": "One", "status": "complete",
                 "verificationVerdict": "VERIFIED"},
                {"number": 2, "title": "Two", "status": "not-started"},
            ],
        }), encoding="utf-8")
        p = build_projection(tmp_path)
        assert "set" not in p
        assert p["repository"]["schemaVersionOnDisk"] == 5
        assert p["repository"]["totalSessions"] == 2
        assert p["repository"]["sessionsCompleted"] == 1
        assert p["repository"]["currentSession"] is None
        assert p["sessions"][0]["verificationVerdict"] == "VERIFIED"

    def test_a_cancelled_session_keeps_its_own_icon(self, tmp_path):
        (tmp_path / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [
                {"number": 1, "title": "One", "status": "complete"},
                {"number": 2, "title": "Two", "status": "cancelled"},
            ],
        }), encoding="utf-8")
        p = build_projection(tmp_path)
        assert p["sessions"][1]["iconKey"] == "cancelled"

    def test_an_empty_root_projects_no_sessions(self, tmp_path):
        p = build_projection(tmp_path)
        assert p["sessions"] == []
        assert p["repository"]["totalSessions"] == 0

    def test_read_session_state_returns_none_without_a_usable_file(
        self, tmp_path
    ):
        # Only FileNotFound/decode errors mean "no usable state".
        assert read_session_state(tmp_path) is None
        (tmp_path / "sessions.json").write_text("{not json",
                                                encoding="utf-8")
        assert read_session_state(tmp_path) is None


class TestASetUpButNeverRunRepository:
    """The two setup sessions exist in the plan until the first
    registration writes a ledger. Rendering them is what makes project
    setup visible to a repository that is not this one."""

    PLAN = (
        "# Session plan\n\n"
        "### Session 1: Author or import the project plan\n\n"
        "1. Register.\n\n"
        "### Session 2: Break the plan into numbered sessions\n\n"
        "1. Register.\n"
    )

    def test_the_plan_supplies_the_sessions_when_no_ledger_exists(
        self, tmp_path
    ):
        (tmp_path / "session-plan.md").write_text(self.PLAN, encoding="utf-8")
        p = build_projection(tmp_path)
        assert p["repository"]["sessionsSource"] == "plan"
        assert [s["number"] for s in p["sessions"]] == [1, 2]
        assert {s["status"] for s in p["sessions"]} == {"not-started"}
        assert p["sessions"][0]["title"] == "Author or import the project plan"
        # Rendering is not registering: the ledger still begins at the
        # first `session start`.
        assert not (tmp_path / "sessions.json").exists()

    def test_an_unreadable_ledger_is_a_fault_and_never_the_plan(self, tmp_path):
        (tmp_path / "session-plan.md").write_text(self.PLAN, encoding="utf-8")
        (tmp_path / "sessions.json").write_text("{not json", encoding="utf-8")
        p = build_projection(tmp_path)
        # A broken record replaced by a cheerful "nothing has run here"
        # is the stale-but-plausible failure this view exists to end --
        # and an empty repository says the same thing as a repository
        # with no sessions, so the fault is named instead.
        assert p["repository"]["sessionsSource"] == "ledger"
        assert p["sessions"] == []
        assert "could not be read" in p["repository"]["invariantViolation"]

class TestTaskRows:
    """The task level: plan order from ``approved-plan.json``, state from
    ``step-execution.jsonl``, and nothing from the activity log."""

    BASE = "a" * 40

    def _repo(self, tmp_path):
        sessions = tmp_path / "docs" / "sessions"
        sessions.mkdir(parents=True)
        (sessions / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": [{"number": 1, "title": "One",
                          "status": "in-progress"}],
        }), encoding="utf-8")
        return sessions

    def _plan(self, tmp_path, *step_ids):
        run_dir = session_run_dir(tmp_path, 1)
        run_dir.mkdir(parents=True, exist_ok=True)
        write_plan(run_dir, new_plan(1, "one", [
            {
                "step_id": step_id,
                "intent": f"Do {step_id}.",
                "file_envelope": [f"src/{step_id}.py"],
                "evidence_contract": [
                    {"description": "the targeted tests", "kind":
                     "deterministic"},
                ],
                "risk_flags": [],
            }
            for step_id in step_ids
        ]))

    def _open(self, tmp_path, step_id):
        append_step_event(tmp_path, 1, {
            "schema_version": 1, "event": "opened", "recorded_at": f"t-{step_id}",
            "session_number": 1, "step_id": step_id, "base_commit": self.BASE,
        })

    def _close(self, tmp_path, step_id):
        append_step_event(tmp_path, 1, {
            "schema_version": 1, "event": "closed", "recorded_at": f"c-{step_id}",
            "session_number": 1, "step_id": step_id, "base_commit": self.BASE,
            "closed_tree": "b" * 40,
            "envelope": {"inside": [f"src/{step_id}.py"], "outside": []},
            "deterministic": [
                {"kind": "targeted-tests", "status": "pass", "required": True},
            ],
        })

    def test_rows_fold_plan_order_against_the_execution_record(self, tmp_path):
        self._repo(tmp_path)
        self._plan(tmp_path, "first", "second", "third")
        self._close(tmp_path, "first")
        self._open(tmp_path, "second")

        rows = build_task_rows(tmp_path, 1)
        assert [r["stepId"] for r in rows] == ["first", "second", "third"]
        assert [r["state"] for r in rows] == ["done", "in flight", "pending"]
        assert [r["iconKey"] for r in rows] == [
            "complete", "in-progress", "not-started",
        ]
        # Exactly one row in flight, because that is what the fold returns.
        assert [r["isOpen"] for r in rows] == [False, True, False]
        assert rows[1]["startedAt"] == "t-second"
        assert rows[1]["intent"] == "Do second."

    def test_closing_the_open_step_leaves_nothing_in_flight(self, tmp_path):
        # The marker follows the record and is never carried forward: a
        # closed step with no successor opened is not still "current".
        self._repo(tmp_path)
        self._plan(tmp_path, "first", "second")
        self._open(tmp_path, "first")
        self._close(tmp_path, "first")

        rows = build_task_rows(tmp_path, 1)
        assert [r["state"] for r in rows] == ["done", "pending"]
        assert not any(r["isOpen"] for r in rows)

    def test_an_unreadable_execution_record_refuses(self, tmp_path):
        self._repo(tmp_path)
        self._plan(tmp_path, "first", "second")
        self._open(tmp_path, "first")
        # A row the schema rejects. The rows before it parsed fine, and
        # showing them would present a stale step as the current one.
        path = step_execution_path(tmp_path, 1)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"schema_version": 1, "event": "sideways",
                                "recorded_at": "t", "session_number": 1,
                                "step_id": "second"}) + "\n")
        with pytest.raises(TaskRowsRefused) as exc:
            build_task_rows(tmp_path, 1)
        assert "execution record" in str(exc.value)

    def test_a_plan_not_backed_by_a_sanctioned_write_refuses(self, tmp_path):
        self._repo(tmp_path)
        self._plan(tmp_path, "first")
        plan_file = session_run_dir(tmp_path, 1) / "approved-plan.json"
        raw = json.loads(plan_file.read_text(encoding="utf-8"))
        raw["steps"][0]["intent"] = "Do something else entirely."
        plan_file.write_text(json.dumps(raw), encoding="utf-8")
        with pytest.raises(TaskRowsRefused) as exc:
            build_task_rows(tmp_path, 1)
        assert "approved plan" in str(exc.value)

    def test_a_session_with_no_plan_has_no_tasks_and_is_not_a_refusal(
        self, tmp_path
    ):
        # The lifecycle does not require an approved plan; a session
        # without one is a leaf, not a fault.
        self._repo(tmp_path)
        assert build_task_rows(tmp_path, 1) == []

    def test_the_projection_carries_tasks_and_the_refusal_separately(
        self, tmp_path
    ):
        sessions = self._repo(tmp_path)
        self._plan(tmp_path, "first")
        self._open(tmp_path, "first")
        p = build_projection(sessions)
        assert p["sessions"][0]["tasks"][0]["state"] == "in flight"
        assert p["sessions"][0]["tasksRefused"] is None

        with open(step_execution_path(tmp_path, 1), "a", encoding="utf-8") as f:
            f.write("not json\n")
        p = build_projection(sessions)
        assert p["sessions"][0]["tasks"] == []
        assert "execution record" in p["sessions"][0]["tasksRefused"]


class TestVerificationView:
    """The unresolved-session view: one session's rounds ledger folded for
    reading at planning time. Which terminal state it reached is the
    record's answer, never a person's, and an unreadable ledger refuses."""

    CAP = 3
    MAJOR = {
        "description": "the suite command is guessed rather than declared",
        "severity": "major",
        "category": "Correctness",
        "failureScenario": "A Java repository gets `python -m pytest`.",
        "evidencePaths": ["ai_router/affected.py"],
        "blocking": True,
    }
    MINOR = {
        "description": "a docstring names the old module",
        "severity": "minor",
        "blocking": False,
    }

    def _sessions(self, tmp_path, *sessions):
        root = tmp_path / "docs" / "sessions"
        root.mkdir(parents=True, exist_ok=True)
        (root / "sessions.json").write_text(json.dumps({
            "schemaVersion": 5,
            "sessions": list(sessions) or [
                {"number": 1, "title": "One", "status": "in-progress"},
            ],
        }), encoding="utf-8")
        return root

    def _round(self, tmp_path, number, *, blocking=True, findings=None,
               **overrides):
        row = {
            "round": number,
            "phase": "full" if number == 1 else "fix-delta",
            "verdict": "ISSUES_FOUND" if blocking else "VERIFIED",
            "blocking": blocking,
            "verifier_model": "gpt-5-6-sol",
            "verifier_provider": "openai",
            "transport": "api",
            "findings": (
                findings if findings is not None
                else ([self.MAJOR] if blocking else [])
            ),
            "completion_tree": chr(ord("a") + number) * 40,
            "recorded_at": f"2026-08-28T0{number}:00:00-04:00",
        }
        if number > 1:
            row["previous_tree"] = chr(ord("a") + number - 1) * 40
        row.update(overrides)
        append_round(tmp_path, 1, row)
        return row

    def _remediated(self, tmp_path, after_round, fix_paths):
        append_round(tmp_path, 1, {
            "round": after_round + 1,
            "type": "remediated_at_cap",
            "verdict": "REMEDIATED_AT_CAP",
            "blocking": False,
            "findings": [],
            "remediated": {
                "reviewed_round": after_round,
                "findings": [self.MAJOR],
                "fix_paths": fix_paths,
            },
            "completion_tree": "f" * 40,
            "previous_tree": chr(ord("a") + after_round) * 40,
            "recorded_at": "2026-08-28T09:00:00-04:00",
        })

    def test_a_remediated_at_cap_row_is_that_terminal_state(self, tmp_path):
        self._sessions(tmp_path)
        for n in (1, 2, 3):
            self._round(tmp_path, n)
        self._remediated(tmp_path, 3, ["ai_router/affected.py", "tests/x.py"])

        view = build_verification_view(tmp_path, 1, self.CAP)
        assert view["terminal"] == "REMEDIATED_AT_CAP"
        assert view["headline"] == "remediated at the cap"
        assert view["clean"] is False
        # The vendor and the agency log come from the round that stopped
        # the session, not from the terminal row that disposed of it.
        assert (view["rounds"], view["stoppedAtRound"]) == (3, 3)
        assert view["verifierModel"] == "gpt-5-6-sol"
        assert view["verifierProvider"] == "openai"
        assert view["transport"] == "api"
        assert [f["disposition"] for f in view["findings"]] == [
            "fixed, unreviewed",
        ]
        assert view["findings"][0]["round"] == 3
        assert view["findings"][0]["evidencePaths"] == ["ai_router/affected.py"]
        assert view["fixPaths"] == ["ai_router/affected.py", "tests/x.py"]

    def test_a_blocking_round_is_unresolved_only_at_the_cap(self, tmp_path):
        self._sessions(tmp_path)
        self._round(tmp_path, 1, findings=[self.MAJOR, self.MINOR])

        below = build_verification_view(tmp_path, 1, self.CAP)
        assert below["terminal"] is None
        assert below["headline"] == (
            "blocking findings outstanding after round 1 of 3"
        )
        assert [f["disposition"] for f in below["findings"]] == [
            "outstanding", "noted",
        ]

        self._round(tmp_path, 2)
        self._round(tmp_path, 3)
        at_cap = build_verification_view(tmp_path, 1, self.CAP)
        assert at_cap["terminal"] == "ISSUES_FOUND"
        assert at_cap["headline"] == "unresolved at the cap"
        assert at_cap["clean"] is False
        # Without a cap there is no "reached": the same ledger is
        # outstanding, and the headline does not name a bound it never got.
        unbounded = build_verification_view(tmp_path, 1, None)
        assert unbounded["terminal"] is None
        assert unbounded["headline"] == (
            "blocking findings outstanding after round 3"
        )

    def test_a_verified_round_is_clean_and_carries_its_nits(self, tmp_path):
        self._sessions(tmp_path)
        self._round(tmp_path, 1, blocking=False, findings=[self.MINOR])
        view = build_verification_view(tmp_path, 1, self.CAP)
        assert (view["terminal"], view["headline"]) == ("VERIFIED", "verified")
        assert view["clean"] is True
        assert [f["disposition"] for f in view["findings"]] == ["noted"]

    def test_the_agency_log_is_read_from_the_stopping_round(self, tmp_path):
        self._sessions(tmp_path)
        self._round(tmp_path, 1, agency={
            "mode": "none",
            "reason": "this transport sends no tools",
        })
        self._round(tmp_path, 2, agency={
            "mode": "tools", "reads": 2, "searches": 1, "listings": 0,
            "transformed_reads": 1,
            "operations": [
                {"kind": "read", "target": "ai_router/checks.py",
                 "in_scope": True, "fidelity": "transformed"},
                {"kind": "search", "target": "spawn", "in_scope": True},
            ],
        })
        self._remediated(tmp_path, 2, ["ai_router/checks.py"])

        agency = build_verification_view(tmp_path, 1, self.CAP)["agency"]
        assert agency["mode"] == "tools"
        assert (agency["reads"], agency["searches"]) == (2, 1)
        assert agency["transformedReads"] == 1
        assert agency["operations"][0] == {
            "kind": "read", "target": "ai_router/checks.py",
            "fidelity": "transformed", "inScope": True,
        }
        # A round recorded before the agency log existed says nothing
        # either way, and is not rendered as a round that looked at nothing.
        self._sessions(tmp_path)
        rounds_file = session_run_dir(tmp_path, 1) / "rounds.jsonl"
        rounds_file.unlink()
        self._round(tmp_path, 1)
        assert build_verification_view(tmp_path, 1, self.CAP)["agency"]["mode"] is None

    def test_an_unreadable_rounds_ledger_refuses(self, tmp_path):
        sessions = self._sessions(tmp_path)
        self._round(tmp_path, 1)
        with open(session_run_dir(tmp_path, 1) / "rounds.jsonl", "a",
                  encoding="utf-8") as f:
            f.write("not json\n")
        with pytest.raises(VerificationRefused) as exc:
            build_verification_view(tmp_path, 1, self.CAP)
        assert "rounds ledger" in str(exc.value)
        # The projection carries the refusal as itself: the round that did
        # parse is not shown as the one that stopped the session.
        p = build_projection(sessions)
        assert p["sessions"][0]["verification"] is None
        assert "rounds ledger" in p["sessions"][0]["verificationRefused"]

    def test_the_projection_carries_the_view_for_every_session_with_rounds(
        self, tmp_path
    ):
        sessions = self._sessions(
            tmp_path,
            {"number": 1, "title": "One", "status": "complete"},
            {"number": 2, "title": "Two", "status": "not-started"},
        )
        self._round(tmp_path, 1, blocking=False)
        p = build_projection(sessions)
        first, second = p["sessions"]
        assert first["verification"]["terminal"] == "VERIFIED"
        assert isinstance(first["verification"]["cap"], int)
        assert (second["verification"], second["verificationRefused"]) == (
            None, None,
        )
