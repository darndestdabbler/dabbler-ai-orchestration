"""Tests for ``progress.normalize_to_v4_shape`` — Set 047 Session 2.

The shim is the reader-first phase of the v3→v4 schema migration. It
accepts v1/v2/v3/v4 input and returns a normalized v4 read-view dict
that carries BOTH per-session metadata (``startedAt``, ``completedAt``,
``orchestrator``, ``verificationVerdict`` on each ``sessions[i]``)
AND derived legacy top-level fields so existing readers keep working
transparently against v4 writes.

Test conventions mirror ``test_progress.py``: bypass package import
via ``conftest.py`` and import ``progress`` by bare filename.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from progress import (
    SCHEMA_VERSION_V3,
    SCHEMA_VERSION_V4,
    SESSION_STATUS_COMPLETE,
    SESSION_STATUS_IN_PROGRESS,
    SESSION_STATUS_NOT_STARTED,
    SessionStateInvariantError,
    normalize_to_v4_shape,
    read_progress,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


_ORCH = {
    "engine": "claude",
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "effort": "high",
    "chatSessionId": "abc-123",
}


def _v3_state(sessions, **overrides):
    base = {
        "schemaVersion": SCHEMA_VERSION_V3,
        "sessionSetName": "047-test-set",
        "status": "in-progress",
        "lifecycleState": "work_in_progress",
        "sessions": sessions,
    }
    base.update(overrides)
    return base


def _v4_state(sessions, **overrides):
    base = {
        "schemaVersion": SCHEMA_VERSION_V4,
        "sessionSetName": "047-test-set",
        "status": "in-progress",
        "sessions": sessions,
    }
    base.update(overrides)
    return base


def _session(number, status, title=None, **extra):
    out = {"number": number, "title": title or f"Session {number}", "status": status}
    out.update(extra)
    return out


def _missing_path() -> Path:
    return Path("/tmp/this-file-does-not-exist-spec.md")


# ---------------------------------------------------------------------------
# v3 input → v4 normalize
# ---------------------------------------------------------------------------


class TestV3InputNormalize:
    def test_v3_input_gets_schema_version_4(self):
        state = _v3_state([_session(1, SESSION_STATUS_NOT_STARTED)], status="not-started")
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["schemaVersion"] == SCHEMA_VERSION_V4

    def test_v3_input_preserves_session_set_name(self):
        state = _v3_state([_session(1, SESSION_STATUS_NOT_STARTED)], status="not-started")
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["sessionSetName"] == "047-test-set"

    def test_v3_input_sessions_get_v4_default_metadata(self):
        state = _v3_state([_session(1, SESSION_STATUS_NOT_STARTED)], status="not-started")
        out = normalize_to_v4_shape(state, _missing_path())
        sess = out["sessions"][0]
        for k in ("startedAt", "completedAt", "orchestrator", "verificationVerdict"):
            assert sess[k] is None, f"v3 session should default {k} to None"

    def test_v3_input_promotes_top_orchestrator_to_inprogress(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_IN_PROGRESS),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
            orchestrator=_ORCH,
            startedAt="2026-05-26T10:00:00-04:00",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        in_progress = next(s for s in out["sessions"] if s["status"] == "in-progress")
        assert in_progress["orchestrator"] == _ORCH
        assert in_progress["startedAt"] == "2026-05-26T10:00:00-04:00"

    def test_v3_input_promotes_top_completedat_to_last_completed(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_COMPLETE),
                _session(3, SESSION_STATUS_IN_PROGRESS),
            ],
            completedAt="2026-05-26T12:00:00-04:00",
            verificationVerdict="VERIFIED",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        last_complete = [s for s in out["sessions"] if s["status"] == "complete"][-1]
        assert last_complete["number"] == 2
        assert last_complete["completedAt"] == "2026-05-26T12:00:00-04:00"
        assert last_complete["verificationVerdict"] == "VERIFIED"

    def test_v3_input_no_inprogress_orchestrator_goes_to_last_completed(self):
        # Between-sessions snapshot: orchestrator block still on top
        # level but no in-progress session to attach it to. Goes to the
        # most-recently-completed session per the close-out semantic.
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
            status="in-progress",
            orchestrator=_ORCH,
        )
        out = normalize_to_v4_shape(state, _missing_path())
        last_complete = out["sessions"][0]
        assert last_complete["orchestrator"] == _ORCH

    def test_v3_input_top_level_status_canonicalized(self):
        # "completed" alias → "complete" canonical token.
        state = _v3_state(
            [_session(1, SESSION_STATUS_COMPLETE)],
            status="completed",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["status"] == "complete"

    def test_v3_input_derives_totalsessions_from_sessions_array(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_COMPLETE),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["totalSessions"] == 3
        assert out["completedSessions"] == [1, 2]
        assert out["currentSession"] is None  # between-sessions; no in-progress

    def test_v3_input_pure_passthrough_when_no_top_metadata(self):
        # Pure v3 with no top-level orchestrator/timestamps: per-session
        # metadata stays defaulted to None.
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
        )
        out = normalize_to_v4_shape(state, _missing_path())
        for s in out["sessions"]:
            assert s["orchestrator"] is None
            assert s["startedAt"] is None
            assert s["completedAt"] is None
            assert s["verificationVerdict"] is None
        assert out["orchestrator"] is None
        assert out["completedAt"] is None

    def test_v3_input_pre_cancel_status_preserved(self):
        # Cancellation reader depends on preCancelStatus passthrough.
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED)],
            status="cancelled",
            preCancelStatus="in-progress",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["status"] == "cancelled"
        assert out["preCancelStatus"] == "in-progress"

    def test_v3_input_force_closed_preserved(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_COMPLETE)],
            status="complete",
            forceClosed=True,
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["forceClosed"] is True


# ---------------------------------------------------------------------------
# v4 input → v4 normalize (per-session metadata is authoritative)
# ---------------------------------------------------------------------------


class TestV4InputNormalize:
    def test_v4_input_per_session_orchestrator_wins(self):
        # v4 writers drop top-level orchestrator; the per-session entry
        # carries it. Normalize must NOT overwrite per-session values
        # even if top-level junk is present.
        state = _v4_state(
            [
                _session(
                    1,
                    SESSION_STATUS_IN_PROGRESS,
                    orchestrator=_ORCH,
                    startedAt="2026-05-26T10:00:00-04:00",
                    completedAt=None,
                    verificationVerdict=None,
                ),
            ],
        )
        out = normalize_to_v4_shape(state, _missing_path())
        s = out["sessions"][0]
        assert s["orchestrator"] == _ORCH
        assert s["startedAt"] == "2026-05-26T10:00:00-04:00"

    def test_v4_input_derives_top_orchestrator_from_inprogress(self):
        state = _v4_state(
            [
                _session(1, SESSION_STATUS_COMPLETE, completedAt="2026-05-26T11:00:00-04:00"),
                _session(2, SESSION_STATUS_IN_PROGRESS, orchestrator=_ORCH, startedAt="2026-05-26T12:00:00-04:00"),
            ],
        )
        out = normalize_to_v4_shape(state, _missing_path())
        # Reader-compat: top-level fields are derived from sessions[].
        assert out["orchestrator"] == _ORCH
        assert out["startedAt"] == "2026-05-26T12:00:00-04:00"
        assert out["completedAt"] == "2026-05-26T11:00:00-04:00"
        assert out["currentSession"] == 2
        assert out["completedSessions"] == [1]

    def test_v4_input_derives_top_verdict_from_last_completed(self):
        state = _v4_state(
            [
                _session(1, SESSION_STATUS_COMPLETE, verificationVerdict="VERIFIED"),
                _session(2, SESSION_STATUS_COMPLETE, verificationVerdict="ISSUES_FOUND"),
            ],
            status="complete",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["verificationVerdict"] == "ISSUES_FOUND"

    def test_v4_input_no_top_promotion_even_with_top_values(self):
        # Hostile input: a v4 file with leftover top-level metadata
        # should leave per-session values alone (per-session is
        # authoritative on v4 inputs).
        state = _v4_state(
            [
                _session(
                    1,
                    SESSION_STATUS_IN_PROGRESS,
                    orchestrator={"engine": "codex", "provider": "openai"},
                ),
            ],
            orchestrator=_ORCH,  # stale top-level — should NOT win
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["sessions"][0]["orchestrator"]["engine"] == "codex"
        # Top-level orchestrator is derived from per-session, so it
        # mirrors the in-progress session's value, not the stale top.
        assert out["orchestrator"]["engine"] == "codex"


# ---------------------------------------------------------------------------
# v2 input → v4 normalize (via synthesize_v3_from_v2 first)
# ---------------------------------------------------------------------------


class TestV2InputNormalize:
    def test_v2_input_synthesizes_then_enriches_to_v4(self):
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "047-test-set",
            "status": "in-progress",
            "lifecycleState": "work_in_progress",
            "currentSession": 2,
            "totalSessions": 3,
            "completedSessions": [1],
            "orchestrator": _ORCH,
            "startedAt": "2026-05-26T10:00:00-04:00",
        }
        out = normalize_to_v4_shape(v2, _missing_path())
        assert out["schemaVersion"] == SCHEMA_VERSION_V4
        # synthesize_v3_from_v2 builds 3 sessions with statuses derived
        # from currentSession + completedSessions + topStatus.
        assert len(out["sessions"]) == 3
        assert out["sessions"][0]["status"] == "complete"
        assert out["sessions"][1]["status"] == "in-progress"
        assert out["sessions"][2]["status"] == "not-started"
        # Top-level orchestrator promoted to the in-progress session.
        assert out["sessions"][1]["orchestrator"] == _ORCH
        assert out["sessions"][1]["startedAt"] == "2026-05-26T10:00:00-04:00"

    def test_v2_input_with_no_top_metadata_normalizes_cleanly(self):
        # A pre-Set-022 v2 snapshot may have nothing but counts.
        v2 = {
            "schemaVersion": 2,
            "sessionSetName": "047-test-set",
            "status": "in-progress",
            "currentSession": 1,
            "totalSessions": 2,
            "completedSessions": [],
        }
        out = normalize_to_v4_shape(v2, _missing_path())
        assert len(out["sessions"]) == 2
        assert out["sessions"][0]["status"] == "in-progress"
        # No top-level orchestrator/timestamps → per-session metadata
        # is all None.
        for s in out["sessions"]:
            assert s["orchestrator"] is None


# ---------------------------------------------------------------------------
# Error / edge handling
# ---------------------------------------------------------------------------


class TestNormalizeErrors:
    def test_none_input_raises_typeerror(self):
        with pytest.raises(TypeError):
            normalize_to_v4_shape(None, _missing_path())

    def test_sessions_not_a_list_raises_invariant_error(self):
        state = {
            "schemaVersion": SCHEMA_VERSION_V3,
            "sessionSetName": "047-test-set",
            "status": "in-progress",
            "sessions": "not-a-list",
        }
        with pytest.raises(SessionStateInvariantError):
            normalize_to_v4_shape(state, _missing_path())

    def test_input_is_not_mutated(self):
        # The shim must be a pure function — caller's dict survives.
        state = _v3_state(
            [_session(1, SESSION_STATUS_IN_PROGRESS)],
            orchestrator=_ORCH,
            status="in-progress",
        )
        original_sessions = state["sessions"]
        original_session_0 = dict(state["sessions"][0])
        out = normalize_to_v4_shape(state, _missing_path())
        # Caller's session entry should not have gained per-session
        # metadata (the shim copied before enriching).
        assert state["sessions"] is original_sessions
        assert state["sessions"][0] == original_session_0
        # The output's session list is a different list, even though
        # the contents differ.
        assert out["sessions"] is not state["sessions"]


# ---------------------------------------------------------------------------
# read_progress is routed through normalize_to_v4_shape
# ---------------------------------------------------------------------------


class TestReadProgressRoutesThroughShim:
    def test_v3_file_still_reads_through_read_progress(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_IN_PROGRESS),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
        )
        view = read_progress(state, _missing_path())
        assert view.total_sessions == 3
        assert view.completed_sessions == (1,)
        assert view.current_session == 2

    def test_v4_file_reads_through_read_progress(self):
        # The whole point of the shim: a v4 file (per-session metadata)
        # reads identically to a v3 file.
        state = _v4_state(
            [
                _session(1, SESSION_STATUS_COMPLETE, completedAt="2026-05-26T11:00:00-04:00"),
                _session(2, SESSION_STATUS_IN_PROGRESS, orchestrator=_ORCH, startedAt="2026-05-26T12:00:00-04:00"),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
        )
        view = read_progress(state, _missing_path())
        assert view.total_sessions == 3
        assert view.completed_sessions == (1,)
        assert view.current_session == 2

    def test_v4_file_with_only_top_status_field_reads(self):
        # The spec-locked v4 shape: top-level has ONLY schemaVersion,
        # sessionSetName, sessions[], status. No legacy progress triple.
        # read_progress must still derive the ProgressView correctly.
        state = {
            "schemaVersion": SCHEMA_VERSION_V4,
            "sessionSetName": "047-test-set",
            "status": "in-progress",
            "sessions": [
                {"number": 1, "title": "First", "status": "complete"},
                {"number": 2, "title": "Second", "status": "in-progress"},
            ],
        }
        view = read_progress(state, _missing_path())
        assert view.total_sessions == 2
        assert view.completed_sessions == (1,)
        assert view.current_session == 2
        assert view.is_between_sessions is False


# ---------------------------------------------------------------------------
# Regression: cross-provider verifier flagged issues 1 and 2 in S2 review
# ---------------------------------------------------------------------------


class TestVerifierFix1PerSessionStatusAliasesCanonicalized:
    """Per-session ``status`` aliases ("completed" / "done") must
    canonicalize to "complete" inside the shim BEFORE the derivation
    step reads them. Otherwise a hand-edited file with the alias form
    would have its completed sessions silently dropped from
    ``completedSessions[]``.
    """

    def test_v3_session_with_completed_alias_lands_in_derived_completed(self):
        state = _v3_state(
            [
                _session(1, "completed", title="First"),
                _session(2, SESSION_STATUS_IN_PROGRESS, title="Second"),
            ],
            status="in-progress",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["sessions"][0]["status"] == "complete"
        assert out["completedSessions"] == [1]

    def test_v3_session_with_done_alias_lands_in_derived_completed(self):
        state = _v3_state(
            [
                _session(1, "done", title="First"),
                _session(2, SESSION_STATUS_IN_PROGRESS, title="Second"),
            ],
            status="in-progress",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["sessions"][0]["status"] == "complete"
        assert out["completedSessions"] == [1]

    def test_v4_session_with_completed_alias_canonicalizes(self):
        state = _v4_state(
            [
                _session(
                    1,
                    "completed",
                    title="First",
                    completedAt="2026-05-26T11:00:00-04:00",
                ),
            ],
            status="complete",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["sessions"][0]["status"] == "complete"
        assert out["completedSessions"] == [1]
        assert out["completedAt"] == "2026-05-26T11:00:00-04:00"


class TestVerifierFix2StartedAtPromotionAndDerivation:
    """Top-level ``startedAt`` must reach the most-recently-completed
    session when there is no in-progress session (v3 promotion), and
    the v4 derivation step must prefer the latest completed session's
    ``startedAt`` (not the earliest session's, which on a many-session
    set is typically the set's open time).
    """

    def test_v3_between_sessions_promotes_started_to_last_completed(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_NOT_STARTED),
            ],
            status="in-progress",
            startedAt="2026-05-26T10:00:00-04:00",
            orchestrator=_ORCH,
        )
        out = normalize_to_v4_shape(state, _missing_path())
        # The most-recently-completed session gets the startedAt
        # (was: lost entirely on v3 between-sessions input).
        assert out["sessions"][0]["startedAt"] == "2026-05-26T10:00:00-04:00"

    def test_v3_all_complete_promotes_started_to_last_completed(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_COMPLETE),
            ],
            status="complete",
            startedAt="2026-05-26T09:00:00-04:00",
            completedAt="2026-05-26T15:00:00-04:00",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        # The most-recently-completed session (session 2) gets the
        # startedAt promoted.
        assert out["sessions"][1]["startedAt"] == "2026-05-26T09:00:00-04:00"

    def test_v4_derives_top_started_from_last_completed_not_first(self):
        # Each session has its own startedAt. The derivation must
        # prefer session 2's (the most-recently-completed) rather than
        # session 1's (the earliest).
        state = _v4_state(
            [
                _session(
                    1,
                    SESSION_STATUS_COMPLETE,
                    startedAt="2026-05-26T09:00:00-04:00",
                    completedAt="2026-05-26T10:00:00-04:00",
                ),
                _session(
                    2,
                    SESSION_STATUS_COMPLETE,
                    startedAt="2026-05-26T11:00:00-04:00",
                    completedAt="2026-05-26T12:00:00-04:00",
                ),
            ],
            status="complete",
        )
        out = normalize_to_v4_shape(state, _missing_path())
        assert out["startedAt"] == "2026-05-26T11:00:00-04:00"
        assert out["completedAt"] == "2026-05-26T12:00:00-04:00"


class TestVerifierNiceToHaveIdempotence:
    """``normalize(normalize(x)) == normalize(x)`` for both v3 and v4
    inputs. This is the shim's idempotence guarantee — running it
    twice must produce the same dict structure (no compounding of
    per-session metadata, no schemaVersion drift, no derived-field
    instability).
    """

    def test_idempotent_on_v3_input(self):
        state = _v3_state(
            [
                _session(1, SESSION_STATUS_COMPLETE),
                _session(2, SESSION_STATUS_IN_PROGRESS),
                _session(3, SESSION_STATUS_NOT_STARTED),
            ],
            orchestrator=_ORCH,
            startedAt="2026-05-26T10:00:00-04:00",
            completedAt="2026-05-26T11:00:00-04:00",
            verificationVerdict="VERIFIED",
        )
        once = normalize_to_v4_shape(state, _missing_path())
        twice = normalize_to_v4_shape(once, _missing_path())
        assert once == twice

    def test_idempotent_on_v4_input(self):
        state = _v4_state(
            [
                _session(
                    1,
                    SESSION_STATUS_COMPLETE,
                    startedAt="2026-05-26T09:00:00-04:00",
                    completedAt="2026-05-26T10:00:00-04:00",
                    verificationVerdict="VERIFIED",
                ),
                _session(
                    2,
                    SESSION_STATUS_IN_PROGRESS,
                    orchestrator=_ORCH,
                    startedAt="2026-05-26T11:00:00-04:00",
                ),
            ],
        )
        once = normalize_to_v4_shape(state, _missing_path())
        twice = normalize_to_v4_shape(once, _missing_path())
        assert once == twice

    def test_idempotent_preserves_passthrough_fields(self):
        state = _v3_state(
            [_session(1, SESSION_STATUS_NOT_STARTED)],
            status="cancelled",
            preCancelStatus="in-progress",
            forceClosed=False,
        )
        once = normalize_to_v4_shape(state, _missing_path())
        twice = normalize_to_v4_shape(once, _missing_path())
        assert once == twice
        assert twice["preCancelStatus"] == "in-progress"
        assert twice["forceClosed"] is False
