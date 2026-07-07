"""Tests for the Set 057 blessed typed-session writer.

Covers :func:`session_state.register_typed_session_start` (append a typed
verification/remediation session, grow the runtime session count, preserve
the ``type`` field across boundary rewrites) and the
``start_session --type`` CLI path (typed-session branch + announcement
banner).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# conftest puts ai_router/ on sys.path
import session_state as ss  # noqa: E402
import start_session  # noqa: E402
from progress import (  # noqa: E402
    SESSION_STATUS_COMPLETE,
    SESSION_STATUS_IN_PROGRESS,
    SessionStateInvariantError,
    normalize_to_v4_shape,
)


def _write_set(tmp_path: Path, *, sessions, total=None, status="in-progress") -> Path:
    d = tmp_path / "057-fixture"
    d.mkdir()
    titles = "\n\n".join(
        f"### Session {s['number']} of {total or len(sessions)}: {s.get('title', 'S')}"
        for s in sessions
    )
    (d / "spec.md").write_text(titles + "\n", encoding="utf-8")
    state = {
        "schemaVersion": 4,
        "sessionSetName": d.name,
        "status": status,
        "sessions": sessions,
    }
    (d / "session-state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    return d


def _complete(number, title, *, type=None, verdict="VERIFIED"):
    e = {
        "number": number,
        "title": title,
        "status": SESSION_STATUS_COMPLETE,
        "startedAt": f"t{number}a",
        "completedAt": f"t{number}b",
        "orchestrator": {"engine": "claude-code", "provider": "anthropic"},
        "verificationVerdict": verdict,
    }
    if type:
        e["type"] = type
    return e


class TestRegisterTypedSessionStart:
    def test_appends_verification_session_and_grows_total(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[_complete(1, "Build"), _complete(2, "More")],
        )
        path, n = ss.register_typed_session_start(
            str(d), "verification", "gpt-5-4", orchestrator_provider="openai"
        )
        assert n == 3
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        assert len(out["sessions"]) == 3
        new = out["sessions"][2]
        assert new["type"] == "verification"
        assert new["status"] == SESSION_STATUS_IN_PROGRESS
        # Set 084 (F1): the shared block builder stamps identityProvenance
        # (gpt-5-4 is a single-vendor engine -> "direct").
        assert new["orchestrator"] == {
            "engine": "gpt-5-4",
            "provider": "openai",
            "identityProvenance": "direct",
        }
        # Derived totalSessions grows by exactly one.
        norm = normalize_to_v4_shape(out, d / "spec.md")
        assert norm["totalSessions"] == 3
        assert norm["currentSession"] == 3

    def test_default_title_is_typed_round_label(self, tmp_path):
        d = _write_set(tmp_path, sessions=[_complete(1, "Build")])
        path, _n = ss.register_typed_session_start(str(d), "verification", "x")
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        assert out["sessions"][-1]["title"] == "Verification round 1"

    def test_remediation_round_label_counts_prior(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _complete(2, "Verification round 1", type="verification"),
                _complete(3, "Remediation round 1", type="remediation"),
                _complete(4, "Verification round 2", type="verification"),
            ],
        )
        path, n = ss.register_typed_session_start(str(d), "remediation", "x")
        assert n == 5
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        assert out["sessions"][-1]["title"] == "Remediation round 2"

    def test_explicit_title_override(self, tmp_path):
        d = _write_set(tmp_path, sessions=[_complete(1, "Build")])
        path, _n = ss.register_typed_session_start(
            str(d), "verification", "x", title="Cross-provider IV&V"
        )
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        assert out["sessions"][-1]["title"] == "Cross-provider IV&V"

    def test_type_preserved_across_close_rebuild(self, tmp_path):
        d = _write_set(tmp_path, sessions=[_complete(1, "Build")])
        ss.register_typed_session_start(
            str(d), "verification", "gpt-5-4", orchestrator_provider="openai"
        )
        # Terminal close requires change-log.md present.
        (d / "change-log.md").write_text("done\n", encoding="utf-8")
        closed = ss._flip_state_to_closed(str(d), verification_verdict="VERIFIED")
        out = json.loads(Path(closed).read_text(encoding="utf-8"))
        assert out["status"] == SESSION_STATUS_COMPLETE
        # The verification type survives the close rebuild.
        assert out["sessions"][-1]["type"] == "verification"
        assert out["sessions"][-1]["verificationVerdict"] == "VERIFIED"

    def test_type_preserved_across_work_start_rebuild(self, tmp_path):
        # A later register_session_start (work path) must not drop an
        # existing verification entry's type.
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _complete(2, "Verification round 1", type="verification"),
            ],
        )
        # Re-register session 2 (idempotent-ish work rebuild via the
        # close writer path is the realistic case; here we exercise
        # _build_sessions_array's preservation through a flip).
        (d / "change-log.md").write_text("x\n", encoding="utf-8")
        closed = ss._flip_state_to_closed(str(d))
        out = json.loads(Path(closed).read_text(encoding="utf-8"))
        types = {s["number"]: s.get("type") for s in out["sessions"]}
        assert types[2] == "verification"
        assert types[1] is None  # work session keeps no type

    def test_refuses_bad_type(self, tmp_path):
        d = _write_set(tmp_path, sessions=[_complete(1, "Build")])
        with pytest.raises(ValueError):
            ss.register_typed_session_start(str(d), "work", "x")

    def test_refuses_when_session_in_flight(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                {
                    "number": 1,
                    "title": "Build",
                    "status": SESSION_STATUS_IN_PROGRESS,
                    "startedAt": "t",
                    "completedAt": None,
                    "orchestrator": {"engine": "x"},
                    "verificationVerdict": None,
                }
            ],
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            ss.register_typed_session_start(str(d), "verification", "x")
        assert exc.value.rule == 3

    def test_refuses_planless_set(self, tmp_path):
        d = tmp_path / "057-planless"
        d.mkdir()
        (d / "session-state.json").write_text(
            json.dumps(
                {
                    "schemaVersion": 4,
                    "sessionSetName": d.name,
                    "status": "in-progress",
                    "startedAt": "t",
                    "orchestrator": {"engine": "x"},
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            ss.register_typed_session_start(str(d), "verification", "x")
        assert exc.value.rule == 1

    def test_emits_work_started_event(self, tmp_path):
        d = _write_set(tmp_path, sessions=[_complete(1, "Build")])
        ss.register_typed_session_start(str(d), "verification", "x")
        events_path = d / "session-events.jsonl"
        assert events_path.exists()
        lines = [
            json.loads(ln)
            for ln in events_path.read_text(encoding="utf-8").splitlines()
            if ln.strip()
        ]
        started = [
            e
            for e in lines
            if e.get("event_type") == "work_started" and e.get("session_number") == 2
        ]
        assert len(started) == 1


def _in_progress(number, title, *, type):
    return {
        "number": number,
        "title": title,
        "status": SESSION_STATUS_IN_PROGRESS,
        "type": type,
        "startedAt": f"t{number}a",
        "completedAt": None,
        "orchestrator": {"engine": "gpt-5-4", "provider": "openai"},
        "verificationVerdict": None,
    }


class TestRegisterTypedSessionHandoff:
    def test_verification_to_remediation_atomic(self, tmp_path):
        # work(complete) + verification(in-flight) -> hand off to remediation.
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _in_progress(2, "Verification round 1", type="verification"),
            ],
        )
        path, closed, new = ss.register_typed_session_handoff(
            str(d),
            "remediation",
            "claude-code",
            orchestrator_provider="anthropic",
            verification_verdict="ISSUES_FOUND",
        )
        assert (closed, new) == (2, 3)
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        # Verification session closed with its verdict; remediation opened.
        assert out["sessions"][1]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][1]["verificationVerdict"] == "ISSUES_FOUND"
        assert out["sessions"][1]["completedAt"] is not None
        assert out["sessions"][2]["type"] == "remediation"
        assert out["sessions"][2]["status"] == SESSION_STATUS_IN_PROGRESS
        assert out["sessions"][2]["title"] == "Remediation round 1"
        # Exactly one in-progress session => rule 6 holds, set still in-progress.
        assert out["status"] == "in-progress"
        norm = normalize_to_v4_shape(out, d / "spec.md")
        assert norm["totalSessions"] == 3
        assert norm["currentSession"] == 3

    def test_remediation_to_reverification_round_label(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _complete(2, "Verification round 1", type="verification"),
                _in_progress(3, "Remediation round 1", type="remediation"),
            ],
        )
        path, closed, new = ss.register_typed_session_handoff(
            str(d), "verification", "gpt-5-4", orchestrator_provider="openai"
        )
        assert (closed, new) == (3, 4)
        out = json.loads(Path(path).read_text(encoding="utf-8"))
        assert out["sessions"][3]["type"] == "verification"
        # Second verification round labelled by prior same-typed count.
        assert out["sessions"][3]["title"] == "Verification round 2"

    def test_emits_handoff_close_and_start_events(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _in_progress(2, "Verification round 1", type="verification"),
            ],
        )
        ss.register_typed_session_handoff(
            str(d), "remediation", "claude-code", verification_verdict="ISSUES_FOUND"
        )
        lines = [
            json.loads(ln)
            for ln in (d / "session-events.jsonl")
            .read_text(encoding="utf-8")
            .splitlines()
            if ln.strip()
        ]
        closed_evt = [
            e
            for e in lines
            if e.get("event_type") == "closeout_succeeded"
            and e.get("session_number") == 2
        ]
        started_evt = [
            e
            for e in lines
            if e.get("event_type") == "work_started" and e.get("session_number") == 3
        ]
        assert len(closed_evt) == 1 and closed_evt[0].get("handoff") is True
        assert len(started_evt) == 1

    def test_refuses_bad_followon_type(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _in_progress(2, "V", type="verification"),
            ],
        )
        with pytest.raises(ValueError):
            ss.register_typed_session_handoff(str(d), "work", "x")

    def test_refuses_when_no_session_in_flight(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _complete(2, "Verification round 1", type="verification"),
            ],
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            ss.register_typed_session_handoff(str(d), "remediation", "x")
        assert exc.value.rule == 3

    def test_refuses_when_in_flight_is_work_session(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                {
                    "number": 1,
                    "title": "Build",
                    "status": SESSION_STATUS_IN_PROGRESS,
                    "startedAt": "t",
                    "completedAt": None,
                    "orchestrator": {"engine": "x"},
                    "verificationVerdict": None,
                }
            ],
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            ss.register_typed_session_handoff(str(d), "verification", "x")
        assert exc.value.rule == 3

    def test_refuses_planless_set(self, tmp_path):
        d = tmp_path / "057-planless-ho"
        d.mkdir()
        (d / "session-state.json").write_text(
            json.dumps(
                {"schemaVersion": 4, "sessionSetName": d.name, "status": "in-progress"},
                indent=2,
            ),
            encoding="utf-8",
        )
        with pytest.raises(SessionStateInvariantError) as exc:
            ss.register_typed_session_handoff(str(d), "remediation", "x")
        assert exc.value.rule == 1


class TestStartSessionCliTypedBranch:
    def test_cli_type_verification_appends_and_banners(self, tmp_path, capsys):
        d = _write_set(
            tmp_path,
            sessions=[_complete(1, "Build"), _complete(2, "More")],
        )
        rc = start_session.main(
            [
                "--session-set-dir",
                str(d),
                "--engine",
                "gpt-5-4",
                "--provider",
                "openai",
                "--type",
                "verification",
            ]
        )
        assert rc == 0
        err = capsys.readouterr().err
        assert "VERIFICATION session" in err
        assert "ai-led-session-workflow.md" in err
        out = json.loads((d / "session-state.json").read_text(encoding="utf-8"))
        assert out["sessions"][-1]["type"] == "verification"
        assert out["sessions"][-1]["number"] == 3

    def test_cli_type_work_is_normal_path(self, tmp_path):
        # --type work must NOT take the typed branch: starting session 2
        # of a 2-session set with session 1 complete is the normal next.
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                {
                    "number": 2,
                    "title": "More",
                    "status": "not-started",
                    "startedAt": None,
                    "completedAt": None,
                    "orchestrator": None,
                    "verificationVerdict": None,
                },
            ],
        )
        rc = start_session.main(
            [
                "--session-set-dir",
                str(d),
                "--engine",
                "claude-code",
                "--type",
                "work",
            ]
        )
        assert rc == 0
        out = json.loads((d / "session-state.json").read_text(encoding="utf-8"))
        # Still 2 sessions — no append; session 2 went in-progress.
        assert len(out["sessions"]) == 2
        assert out["sessions"][1]["status"] == SESSION_STATUS_IN_PROGRESS
        assert out["sessions"][1].get("type") is None

    def test_cli_typed_refusal_returns_boundary_exit(self, tmp_path):
        # In-flight session => typed append refused => EXIT_BOUNDARY (3).
        d = _write_set(
            tmp_path,
            sessions=[
                {
                    "number": 1,
                    "title": "Build",
                    "status": SESSION_STATUS_IN_PROGRESS,
                    "startedAt": "t",
                    "completedAt": None,
                    "orchestrator": {"engine": "x"},
                    "verificationVerdict": None,
                }
            ],
        )
        rc = start_session.main(
            [
                "--session-set-dir",
                str(d),
                "--engine",
                "x",
                "--type",
                "remediation",
            ]
        )
        assert rc == start_session.EXIT_BOUNDARY

    def test_cli_handoff_closes_inflight_and_opens_followon(self, tmp_path):
        # The sanctioned --handoff CLI: close the in-flight verification
        # session and open a remediation session in one write.
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _in_progress(2, "Verification round 1", type="verification"),
            ],
        )
        rc = start_session.main(
            [
                "--session-set-dir",
                str(d),
                "--engine",
                "claude-code",
                "--provider",
                "anthropic",
                "--type",
                "remediation",
                "--handoff",
                "--handoff-verdict",
                "ISSUES_FOUND",
            ]
        )
        assert rc == start_session.EXIT_OK
        out = json.loads((d / "session-state.json").read_text(encoding="utf-8"))
        assert out["sessions"][1]["status"] == SESSION_STATUS_COMPLETE
        assert out["sessions"][1]["verificationVerdict"] == "ISSUES_FOUND"
        assert out["sessions"][2]["type"] == "remediation"
        assert out["sessions"][2]["status"] == SESSION_STATUS_IN_PROGRESS

    def test_cli_handoff_with_no_inflight_returns_boundary(self, tmp_path):
        d = _write_set(
            tmp_path,
            sessions=[
                _complete(1, "Build"),
                _complete(2, "Verification round 1", type="verification"),
            ],
        )
        rc = start_session.main(
            [
                "--session-set-dir",
                str(d),
                "--engine",
                "x",
                "--type",
                "remediation",
                "--handoff",
            ]
        )
        assert rc == start_session.EXIT_BOUNDARY
