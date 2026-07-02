"""Unit tests for Session 3 deliverables in ``session_state``:

- ``SessionLifecycleState`` enum
- v1 → v2 lazy migration on read; rewrite-as-v2-or-v3 on next write
- ``NextOrchestrator`` / ``NextOrchestratorReason`` dataclasses
- ``validate_next_orchestrator``

Set 030 Session 2 bumped ``SCHEMA_VERSION`` to 3 and made writers
dual-write (v3 ``sessions[]`` + legacy triple). Tests below were
updated to assert v3 output. The v3-specific dual-write parity tests
live in ``test_session_state_v3.py``; the assertions here are the
load-bearing v1→v2 lazy-migration tests plus NextOrchestrator
validator coverage that the v3 dual-write does not touch.

The tests bypass ``ai_router/`` package import via ``conftest.py`` adding
the package directory to ``sys.path``; modules are imported by filename.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

import session_state
from session_state import (    NEXT_ORCHESTRATOR_REASON_CODES,
    NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN,
    NextOrchestrator,
    NextOrchestratorReason,
    SCHEMA_VERSION,
    SessionLifecycleState,
    SESSION_STATE_FILENAME,
    mark_session_complete,
    read_session_state,
    register_session_start,
    validate_next_orchestrator,
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


def _write_v1_state(path: str, **overrides) -> None:
    state = {
        "schemaVersion": 1,
        "sessionSetName": "test-set",
        "currentSession": 1,
        "totalSessions": 5,
        "status": "in-progress",
        "startedAt": "2026-04-30T05:00:00-04:00",
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
        },
    }
    state.update(overrides)
    with open(os.path.join(path, SESSION_STATE_FILENAME), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# ---------------------------------------------------------------------------
# SessionLifecycleState
# ---------------------------------------------------------------------------

class TestSessionLifecycleState:
    def test_all_five_states_exist(self):
        assert SessionLifecycleState.WORK_IN_PROGRESS.value == "work_in_progress"
        assert SessionLifecycleState.WORK_VERIFIED.value == "work_verified"
        assert SessionLifecycleState.CLOSEOUT_PENDING.value == "closeout_pending"
        assert SessionLifecycleState.CLOSEOUT_BLOCKED.value == "closeout_blocked"
        assert SessionLifecycleState.CLOSED.value == "closed"

    def test_str_subclass_serializes_as_string(self):
        # str subclass means JSON serialization works without .value
        state = SessionLifecycleState.WORK_IN_PROGRESS
        assert json.dumps({"x": state.value}) == '{"x": "work_in_progress"}'
        assert state == "work_in_progress"


# ---------------------------------------------------------------------------
# Schema version + writer
# ---------------------------------------------------------------------------

class TestRegisterSessionStartV2:
    def test_writes_v3_with_lifecycle_state(self, session_set_dir):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=5,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="high",
            orchestrator_provider="anthropic",
        )
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        # Set 047 Session 4: writers now emit v4 on disk; the per-
        # session ledger is the canonical source. The shim-routed
        # read_session_state surfaces the derived legacy triple +
        # lifecycleState for downstream readers.
        assert data["schemaVersion"] == 4 == SCHEMA_VERSION
        assert data["status"] == "in-progress"
        assert isinstance(data["sessions"], list)
        assert len(data["sessions"]) == 5
        assert data["sessions"][0]["number"] == 1
        assert data["sessions"][0]["status"] == "in-progress"
        assert all(
            s["status"] == "not-started" for s in data["sessions"][1:]
        )
        # Shim-derived view: legacy triple + lifecycleState.
        derived = read_session_state(session_set_dir) or {}
        assert derived["lifecycleState"] == "work_in_progress"
        assert derived["currentSession"] == 1
        assert derived["completedSessions"] == []
        assert derived["totalSessions"] == 5

    def test_register_session_start_emits_work_started(self, session_set_dir):
        """Set 014 Session 1 (a): a fresh ``register_session_start`` call
        appends a single ``work_started`` event for the registered session.

        The event lands in ``session-events.jsonl`` with the right
        ``session_number`` and ``event_type``. Before Set 014, the
        orchestrator had to hand-append this event after every
        ``register_session_start`` so the close-out gate's idempotency
        check could see the current session's lifecycle correctly; the
        fix moves the emission into the registration call itself.
        """
        from session_events import read_events

        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=2,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )

        events = read_events(session_set_dir)
        work_started = [e for e in events if e.event_type == "work_started"]
        assert len(work_started) == 1, (
            f"expected exactly one work_started event, got {len(work_started)}"
        )
        assert work_started[0].session_number == 1
        assert work_started[0].event_type == "work_started"

    def test_register_session_start_idempotent_on_repeat(self, session_set_dir):
        """Set 014 Session 1 (a): calling ``register_session_start`` twice
        on the same session does not double-emit ``work_started``.

        Idempotency-on-retry is the load-bearing piece — orchestrator
        restarts (where the start step is re-run after a crash) must not
        produce two events for the same session number. The snapshot is
        overwritten on each call (timestamp refreshes), but the events
        ledger is append-only and dedupes the work_started event.
        """
        from session_events import read_events

        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=2,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=2,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )

        events = read_events(session_set_dir)
        work_started_for_1 = [
            e for e in events
            if e.event_type == "work_started" and e.session_number == 1
        ]
        assert len(work_started_for_1) == 1, (
            "register_session_start must dedupe work_started on repeat call"
        )

    def test_register_session_start_total_sessions_still_propagates(
        self, session_set_dir,
    ):
        """Set 014 Session 1 (a): the new event-emission step must not
        regress the existing ``totalSessions`` propagation into
        ``activity-log.json`` (the original behavior of
        ``_propagate_total_sessions``).
        """
        # Pre-create activity-log.json with totalSessions=0 so the
        # propagation path has something to update.
        log_path = os.path.join(session_set_dir, "activity-log.json")
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump({
                "sessionSetName": "test-set",
                "createdDate": "2026-05-04T00:00:00-04:00",
                "totalSessions": 0,
                "entries": [],
            }, f)

        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=7,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )

        with open(log_path, encoding="utf-8") as f:
            log_data = json.load(f)
        assert log_data["totalSessions"] == 7, (
            "register_session_start must still propagate total_sessions to "
            "activity-log.json after the work_started emission addition"
        )

    def test_register_session_start_emits_event_before_snapshot_write(
        self, session_set_dir, monkeypatch,
    ):
        """Set 014 Session 1 (a): the work_started event is appended
        BEFORE the snapshot file is written.

        Ordering matters: if the event is appended after the snapshot,
        an event-write failure would leave the snapshot already flipped
        to ``in-progress`` while the events ledger has no record. The
        documented invariant (mirroring ``mark_session_complete``) is
        event-before-mutation so a failed event leaves the snapshot
        un-flipped and the next call retries cleanly. We monkey-patch
        ``append_event`` to raise; the snapshot must NOT exist after
        the failed call.
        """
        import session_events
        from session_events import read_events

        boom = RuntimeError("simulated event-write failure")

        def fake_append_event(*_a, **_kw):
            raise boom

        monkeypatch.setattr(session_events, "append_event", fake_append_event)

        with pytest.raises(RuntimeError, match="simulated event-write failure"):
            register_session_start(
                session_set=session_set_dir,
                session_number=1,
                total_sessions=2,
                orchestrator_engine="claude-code",
                orchestrator_model="claude-opus-4-7",
            )

        # Snapshot must NOT exist — proves the event was attempted first
        # and the failure aborted the call before the snapshot write.
        snapshot_path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        assert not os.path.isfile(snapshot_path), (
            "snapshot must not be written when work_started event fails — "
            "ordering invariant violated"
        )
        # And the events ledger has no work_started either (the patched
        # append_event raised before writing).
        events = read_events(session_set_dir)
        assert not any(e.event_type == "work_started" for e in events)


class TestMarkSessionCompleteV2:
    def test_writes_closed_lifecycle_state(self, session_set_dir, monkeypatch):
        # This test asserts the snapshot flip mechanics, not gate
        # enforcement (covered separately in
        # test_mark_session_complete_gate.py) — stub the gate to
        # all-pass rather than using force=True. Set 077 S4: the
        # previous force=True mid-set close was a fixture bug — force's
        # documented semantic is "the SET is done", so it promoted
        # session 2 to complete, and the writer's new re-open refusal
        # (S1 bundle F) correctly rejects re-starting it.
        import close_session as _cs

        monkeypatch.setattr(
            _cs,
            "run_gate_checks",
            lambda *_a, **_kw: [],
        )
        # Register sessions 1 and 2 to mirror a real boundary write —
        # without session 1 already closed, the v3 invariant rule 4
        # would reject session 2 as complete-before-1.
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=2,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # First-session close. Pre-existing change-log presence drives
        # the SET to complete on the last session; for this mid-set
        # close we need change-log to be absent.
        mark_session_complete(
            session_set_dir, verification_verdict="VERIFIED",
        )
        register_session_start(
            session_set=session_set_dir,
            session_number=2,
            total_sessions=2,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        # Add change-log to satisfy is_last_session for the final
        # close (Set 022 belt-and-suspenders).
        with open(
            os.path.join(session_set_dir, "change-log.md"), "w", encoding="utf-8",
        ) as f:
            f.write("# Test change log\n")
        mark_session_complete(
            session_set_dir, verification_verdict="VERIFIED",
        )
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        # Set 047 Session 4: writers emit v4 on disk; per-session
        # metadata carries completedAt / verdict / orchestrator.
        assert data["schemaVersion"] == 4
        assert data["status"] == "complete"
        # Per-session metadata on the closed sessions.
        assert isinstance(data["sessions"], list)
        assert len(data["sessions"]) == 2
        assert all(s["status"] == "complete" for s in data["sessions"])
        assert all(s["completedAt"] is not None for s in data["sessions"])
        # Shim-derived view for the legacy triple.
        derived = read_session_state(session_set_dir) or {}
        assert derived["lifecycleState"] == "closed"
        assert derived["verificationVerdict"] == "VERIFIED"
        assert derived["completedAt"] is not None
        assert derived["completedSessions"] == [1, 2]
        assert derived["currentSession"] is None  # no session in flight


# ---------------------------------------------------------------------------
# Lazy migration v1 → v2
# ---------------------------------------------------------------------------

class TestLazyMigrationOnRead:
    def test_v1_in_progress_maps_to_work_in_progress(self, session_set_dir):
        _write_v1_state(session_set_dir, status="in-progress")
        state = read_session_state(session_set_dir)
        assert state is not None
        # Set 047 Session 4: read_session_state now routes through the
        # v4 shim, so v1 → v2 → v4 in-memory normalization. The
        # derived lifecycleState is computed from the canonical
        # top-level status by the shim.
        assert state["schemaVersion"] == 4
        assert state["lifecycleState"] == "work_in_progress"
        # Original status field preserved (consumers may still read it)
        assert state["status"] == "in-progress"

    def test_v1_complete_maps_to_closed(self, session_set_dir):
        _write_v1_state(
            session_set_dir,
            status="complete",
            completedAt="2026-04-30T06:00:00-04:00",
            verificationVerdict="VERIFIED",
        )
        state = read_session_state(session_set_dir)
        assert state is not None
        assert state["schemaVersion"] == 4
        assert state["lifecycleState"] == "closed"

    def test_read_does_not_rewrite_file(self, session_set_dir):
        """Lazy migration is in-memory only; file stays v1 until next write."""
        _write_v1_state(session_set_dir)
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        before = open(path, encoding="utf-8").read()
        read_session_state(session_set_dir)
        after = open(path, encoding="utf-8").read()
        assert before == after  # file unchanged

    def test_mark_complete_rewrites_v1_as_current_schema(self, session_set_dir):
        """Next legitimate write must produce a current-schema file from v1.

        Set 030 Session 2 incident-recovery semantics: ``force=True``
        means "operator asserts the SET is done"; the writer promotes
        every session in the resulting v3 ledger to ``complete`` so
        rule 7 (top-status complete ⟹ every session complete) holds
        by construction. The v2 writer left an inconsistent state on
        disk in this case (top-status complete + currentSession=1
        only); the v3 writer makes the operator's assertion explicit.
        """
        _write_v1_state(session_set_dir, status="in-progress", currentSession=1)
        # force=True bypasses the gate AND triggers incident-recovery
        # semantics (operator asserts the SET is done).
        mark_session_complete(
            session_set_dir, verification_verdict="VERIFIED", force=True,
        )
        with open(os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8") as f:
            data = json.load(f)
        # Set 047 Session 4: writers emit v4. Forced close → top-
        # status complete with every per-session record promoted to
        # complete. The derived top-level lifecycle / completedSessions
        # surface via the shim.
        assert data["schemaVersion"] == 4
        assert data["status"] == "complete"
        assert isinstance(data["sessions"], list)
        assert len(data["sessions"]) == 5
        assert all(s["status"] == "complete" for s in data["sessions"])
        # Forensic marker per Set 9 Session 3 / D-2 (passthrough under v4).
        assert data.get("forceClosed") is True
        # Shim-derived view: lifecycle + completedSessions triple.
        derived = read_session_state(session_set_dir) or {}
        assert derived["lifecycleState"] == "closed"
        assert derived["completedSessions"] == [1, 2, 3, 4, 5]

    def test_v3_file_passes_through_unchanged(self, session_set_dir):
        register_session_start(
            session_set=session_set_dir,
            session_number=1,
            total_sessions=5,
            orchestrator_engine="claude-code",
            orchestrator_model="claude-opus-4-7",
        )
        before = open(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8"
        ).read()
        state = read_session_state(session_set_dir)
        # Set 047 Session 4: writer now emits schemaVersion 4 directly.
        assert state["schemaVersion"] == 4
        # Reading the current-schema file should not perturb the
        # on-disk content either.
        after = open(
            os.path.join(session_set_dir, SESSION_STATE_FILENAME), encoding="utf-8"
        ).read()
        assert before == after

    def test_malformed_v1_status_falls_back_safely(self, session_set_dir):
        """Unknown status should not crash — defaults to work_in_progress."""
        _write_v1_state(session_set_dir, status="something-weird")
        state = read_session_state(session_set_dir)
        # The shim canonicalize_status returns None for unknown
        # statuses, so derived_lifecycle (None → no derivation) stays
        # at the in-memory v1→v2 default work_in_progress that
        # _migrate_v1_to_v2_inplace wrote.
        assert state["lifecycleState"] == "work_in_progress"
        assert state["schemaVersion"] == 4

    def test_malformed_json_returns_none(self, session_set_dir):
        path = os.path.join(session_set_dir, SESSION_STATE_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write("{not valid json")
        assert read_session_state(session_set_dir) is None

    def test_missing_file_returns_none(self, session_set_dir):
        assert read_session_state(session_set_dir) is None


# ---------------------------------------------------------------------------
# NextOrchestrator dataclasses + validator
# ---------------------------------------------------------------------------

def _good_next_orc(
    code: str = "continue-current-trajectory",
    specifics: str = "Session 3 mostly extends session_state.py with similar idioms.",
) -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(code=code, specifics=specifics),
    )


class TestValidateNextOrchestrator:
    def test_passes_with_good_value(self):
        passed, errors = validate_next_orchestrator(_good_next_orc())
        assert passed is True
        assert errors == []

    def test_passes_with_dict_form(self):
        passed, errors = validate_next_orchestrator({
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "reason": {
                "code": "switch-due-to-cost",
                "specifics": "Gemini Flash handled the prior session 30x cheaper.",
            },
        })
        assert passed is True
        assert errors == []

    def test_all_four_reason_codes_accepted(self):
        for code in NEXT_ORCHESTRATOR_REASON_CODES:
            passed, errors = validate_next_orchestrator(_good_next_orc(code=code))
            assert passed is True, f"{code} should be accepted: {errors}"

    @pytest.mark.parametrize(
        "field_name", ["engine", "provider", "model", "effort"]
    )
    def test_missing_top_level_field_fails(self, field_name):
        no = _good_next_orc()
        setattr(no, field_name, "")
        passed, errors = validate_next_orchestrator(no)
        assert passed is False
        assert any(field_name in e for e in errors)

    def test_unknown_reason_code_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(code="invent-a-new-code")
        )
        assert passed is False
        assert any("reason.code" in e for e in errors)

    def test_short_specifics_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="too short")
        )
        assert passed is False
        assert any("specifics" in e for e in errors)

    def test_specifics_at_minimum_length_passes(self):
        # Exactly 30 chars after strip
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="x" * NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN)
        )
        assert passed is True
        assert errors == []

    def test_specifics_one_char_below_min_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="x" * (NEXT_ORCHESTRATOR_SPECIFICS_MIN_LEN - 1))
        )
        assert passed is False

    def test_whitespace_only_specifics_fails(self):
        passed, errors = validate_next_orchestrator(
            _good_next_orc(specifics="   " * 20)  # all whitespace
        )
        assert passed is False

    def test_missing_reason_fails(self):
        no = _good_next_orc()
        no.reason = None  # type: ignore[assignment]
        passed, errors = validate_next_orchestrator(no)
        assert passed is False
        assert any("reason" in e for e in errors)

    def test_reason_must_be_object(self):
        passed, errors = validate_next_orchestrator({
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
            "reason": "just a string",
        })
        assert passed is False
        assert any("reason" in e for e in errors)

    def test_non_dataclass_non_dict_input_fails(self):
        passed, errors = validate_next_orchestrator("not a valid value")
        assert passed is False
        assert len(errors) == 1


# ---------------------------------------------------------------------------
# Mode config parsing


# ---------------------------------------------------------------------------
# Constants exposed for downstream consumers
# ---------------------------------------------------------------------------

class TestConstants:
    def test_reason_codes(self):
        assert NEXT_ORCHESTRATOR_REASON_CODES == {
            "continue-current-trajectory",
            "switch-due-to-blocker",
            "switch-due-to-cost",
            "other",
        }
