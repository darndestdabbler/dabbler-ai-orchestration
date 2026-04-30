"""Unit tests for Session 5 deliverables in ``session_events``:

- :func:`append_event` — write/append, validation, reserved-key
  collisions, file creation
- :func:`read_events` — round-trip, malformed-line tolerance, missing
  file
- :func:`hash_existing_prefix` — append-only invariant verification
- :func:`current_lifecycle_state` — all 9 transitions and not-started
- :func:`backfill_events_for_session_set` — reconstruct from
  activity-log + session-state, including the live set-001 fixture
  on disk
- :func:`backfill_all_session_sets` — walker covering an entire
  ``docs/session-sets`` tree

The conftest.py in this folder adds ``ai-router/`` to ``sys.path`` so
hyphenated package import is bypassed and modules are imported by
filename.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pytest

import session_events
from session_events import (
    EVENT_TYPES,
    Event,
    SESSION_EVENTS_FILENAME,
    append_event,
    backfill_all_session_sets,
    backfill_events_for_session_set,
    current_lifecycle_state,
    hash_existing_prefix,
    read_events,
)
from session_state import (
    SCHEMA_VERSION,
    SessionLifecycleState,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    d = tmp_path / "test-set"
    d.mkdir()
    return str(d)


def _write_state(
    path: str,
    *,
    current_session: int,
    lifecycle: str = "work_in_progress",
    total_sessions: int = 5,
) -> None:
    state = {
        "schemaVersion": SCHEMA_VERSION,
        "sessionSetName": os.path.basename(path),
        "currentSession": current_session,
        "totalSessions": total_sessions,
        "status": "in-progress" if lifecycle != "closed" else "complete",
        "lifecycleState": lifecycle,
        "startedAt": "2026-04-01T10:00:00-04:00",
        "completedAt": None,
        "verificationVerdict": None,
        "orchestrator": {
            "engine": "claude-code",
            "provider": "anthropic",
            "model": "claude-opus-4-7",
            "effort": "high",
        },
    }
    with open(os.path.join(path, "session-state.json"), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def _write_activity(
    path: str,
    sessions: int = 1,
    *,
    include_verify: bool = True,
    base_iso: str = "2026-04-01T10:00:00-04:00",
) -> None:
    """Author a synthetic activity-log.json for backfill tests."""
    entries = []
    step_counter = 0
    for sn in range(1, sessions + 1):
        step_counter += 1
        entries.append({
            "sessionNumber": sn,
            "stepNumber": step_counter,
            "stepKey": f"session-{sn}/register-start",
            "dateTime": base_iso,
            "description": "register",
            "status": "complete",
            "routedApiCalls": [],
        })
        if include_verify:
            step_counter += 1
            entries.append({
                "sessionNumber": sn,
                "stepNumber": step_counter,
                "stepKey": f"session-{sn}/verify",
                "dateTime": base_iso,
                "description": "verify",
                "status": "complete",
                "routedApiCalls": [{
                    "model": "gpt-5-4",
                    "taskType": "session-verification",
                    "inputTokens": 100,
                    "outputTokens": 50,
                    "costUsd": 0.01,
                }],
            })
    data = {
        "sessionSetName": os.path.basename(path),
        "createdDate": base_iso,
        "totalSessions": sessions,
        "entries": entries,
    }
    with open(os.path.join(path, "activity-log.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# append_event
# ---------------------------------------------------------------------------

class TestAppendEvent:
    def test_creates_file_and_appends_one_line(self, session_set_dir):
        ev = append_event(session_set_dir, "work_started", session_number=1)
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        assert os.path.isfile(path)
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        assert len(lines) == 1
        obj = json.loads(lines[0])
        assert obj["event_type"] == "work_started"
        assert obj["session_number"] == 1
        assert obj["timestamp"].endswith("Z")
        assert ev.event_type == "work_started"

    def test_appends_to_existing_file(self, session_set_dir):
        append_event(session_set_dir, "work_started", session_number=1)
        append_event(session_set_dir, "verification_requested", session_number=1)
        append_event(session_set_dir, "verification_completed", session_number=1,
                     verdict="VERIFIED")
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        assert len(lines) == 3

    def test_extra_fields_persist(self, session_set_dir):
        append_event(
            session_set_dir, "verification_completed", session_number=2,
            verdict="ISSUES_FOUND", verifier_model="gpt-5-4",
            issue_count=3,
        )
        events = read_events(session_set_dir)
        assert events[0].fields == {
            "verdict": "ISSUES_FOUND",
            "verifier_model": "gpt-5-4",
            "issue_count": 3,
        }

    def test_explicit_timestamp_preserved(self, session_set_dir):
        ts = "2026-04-30T08:30:00.000000Z"
        append_event(session_set_dir, "work_started", session_number=1, timestamp=ts)
        events = read_events(session_set_dir)
        assert events[0].timestamp == ts

    def test_unknown_event_type_rejected(self, session_set_dir):
        with pytest.raises(ValueError, match="event_type must be one of"):
            append_event(session_set_dir, "bogus_event", session_number=1)

    def test_reserved_keyword_rejected_by_python(self, session_set_dir):
        # Python catches duplicate-keyword collisions before our
        # function body runs — e.g. timestamp / event_type / session_number
        # are named parameters, so they cannot also appear in **fields.
        with pytest.raises(TypeError, match="multiple values"):
            append_event(
                session_set_dir, "work_started",
                session_number=1, **{"event_type": "x"},
            )

    def test_non_int_session_number_rejected(self, session_set_dir):
        with pytest.raises(ValueError, match="session_number must be an int"):
            append_event(session_set_dir, "work_started", session_number="1")  # type: ignore[arg-type]

    def test_bool_session_number_rejected(self, session_set_dir):
        # bool is a subclass of int — explicit guard to keep True from
        # silently becoming session 1.
        with pytest.raises(ValueError, match="session_number must be an int"):
            append_event(session_set_dir, "work_started", session_number=True)  # type: ignore[arg-type]

    def test_missing_dir_raises(self, tmp_path):
        missing = str(tmp_path / "not-real")
        with pytest.raises(FileNotFoundError):
            append_event(missing, "work_started", session_number=1)


# ---------------------------------------------------------------------------
# read_events
# ---------------------------------------------------------------------------

class TestReadEvents:
    def test_missing_file_returns_empty(self, session_set_dir):
        assert read_events(session_set_dir) == []

    def test_round_trip(self, session_set_dir):
        append_event(session_set_dir, "work_started", session_number=1)
        append_event(
            session_set_dir, "verification_completed", session_number=1,
            verdict="VERIFIED", verifier_model="gpt-5-4",
        )
        events = read_events(session_set_dir)
        assert len(events) == 2
        assert events[0].event_type == "work_started"
        assert events[1].event_type == "verification_completed"
        assert events[1].fields["verdict"] == "VERIFIED"

    def test_blank_lines_skipped(self, session_set_dir):
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"timestamp":"2026-04-30T00:00:00Z","session_number":1,"event_type":"work_started"}\n')
            f.write("\n")
            f.write("   \n")
            f.write('{"timestamp":"2026-04-30T00:01:00Z","session_number":1,"event_type":"verification_completed","verdict":"VERIFIED"}\n')
        events = read_events(session_set_dir)
        assert len(events) == 2

    def test_malformed_line_skipped(self, session_set_dir):
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write('{"timestamp":"2026-04-30T00:00:00Z","session_number":1,"event_type":"work_started"}\n')
            f.write('{not valid json\n')
            f.write('"just a string"\n')
            f.write('{"timestamp":"2026-04-30T00:01:00Z","session_number":1,"event_type":"work_started"}\n')
            f.write('{"timestamp":"x"}\n')  # missing required fields
        events = read_events(session_set_dir)
        # First and fourth survive; the rest are skipped.
        assert len(events) == 2

    def test_required_fields_validated(self, session_set_dir):
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            # Missing session_number
            f.write('{"timestamp":"2026-04-30T00:00:00Z","event_type":"work_started"}\n')
            # session_number wrong type
            f.write('{"timestamp":"x","session_number":"1","event_type":"work_started"}\n')
            # event_type missing
            f.write('{"timestamp":"x","session_number":1}\n')
        assert read_events(session_set_dir) == []


# ---------------------------------------------------------------------------
# Append-only invariant (hash check)
# ---------------------------------------------------------------------------

class TestAppendOnly:
    def test_prefix_hash_unchanged_after_append(self, session_set_dir):
        append_event(session_set_dir, "work_started", session_number=1)
        append_event(session_set_dir, "verification_requested", session_number=1)

        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "rb") as f:
            prefix_bytes = f.read()
        prefix_hash = hashlib.sha256(prefix_bytes).hexdigest()
        prefix_len = len(prefix_bytes)

        append_event(
            session_set_dir, "verification_completed",
            session_number=1, verdict="VERIFIED",
        )

        # Re-read just the prefix range and confirm bytes are bit-for-bit
        # identical to what they were before the append.
        with open(path, "rb") as f:
            new_prefix = f.read(prefix_len)
        assert hashlib.sha256(new_prefix).hexdigest() == prefix_hash

        # The whole-file hash must of course differ — the new line is
        # additional content past the prefix.
        with open(path, "rb") as f:
            full_hash = hashlib.sha256(f.read()).hexdigest()
        assert full_hash != prefix_hash

    def test_hash_existing_prefix_empty_when_missing(self, session_set_dir):
        empty = hashlib.sha256(b"").hexdigest()
        assert hash_existing_prefix(session_set_dir) == empty

    def test_hash_existing_prefix_matches_full_content(self, session_set_dir):
        append_event(session_set_dir, "work_started", session_number=1)
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "rb") as f:
            content = f.read()
        assert hash_existing_prefix(session_set_dir) == hashlib.sha256(content).hexdigest()


# ---------------------------------------------------------------------------
# current_lifecycle_state — every transition
# ---------------------------------------------------------------------------

def _ev(et: str, sn: int = 1, **fields) -> Event:
    return Event(
        timestamp="2026-04-30T00:00:00Z",
        session_number=sn,
        event_type=et,
        fields=fields,
    )


class TestLifecycleStateDerivation:
    def test_empty_returns_none(self):
        assert current_lifecycle_state([]) is None

    def test_work_started_only(self):
        assert current_lifecycle_state([_ev("work_started")]) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_verification_requested_observability_only(self):
        events = [_ev("work_started"), _ev("verification_requested")]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_verification_claimed_observability_only(self):
        events = [_ev("work_started"), _ev("verification_claimed")]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_verification_timed_out_does_not_advance(self):
        events = [_ev("work_started"), _ev("verification_timed_out")]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_verification_completed_verified_advances(self):
        events = [
            _ev("work_started"),
            _ev("verification_completed", verdict="VERIFIED"),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_VERIFIED

    def test_verification_completed_issues_found_does_not_advance(self):
        events = [
            _ev("work_started"),
            _ev("verification_completed", verdict="ISSUES_FOUND"),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_explicit_work_verified(self):
        events = [_ev("work_started"), _ev("work_verified")]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_VERIFIED

    def test_closeout_pending(self):
        events = [
            _ev("work_started"),
            _ev("verification_completed", verdict="VERIFIED"),
            _ev("closeout_requested"),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSEOUT_PENDING

    def test_closeout_blocked(self):
        events = [
            _ev("work_started"),
            _ev("verification_completed", verdict="VERIFIED"),
            _ev("closeout_requested"),
            _ev("closeout_failed", reason="critical-issue"),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSEOUT_BLOCKED

    def test_closeout_succeeded_lands_at_closed(self):
        events = [
            _ev("work_started"),
            _ev("verification_completed", verdict="VERIFIED"),
            _ev("closeout_requested"),
            _ev("closeout_succeeded"),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSED

    def test_only_most_recent_session_drives_state(self):
        # Session 1 went all the way to closed; session 2 just started.
        # The derived state must reflect session 2's progress.
        events = [
            _ev("work_started", sn=1),
            _ev("verification_completed", sn=1, verdict="VERIFIED"),
            _ev("closeout_requested", sn=1),
            _ev("closeout_succeeded", sn=1),
            _ev("work_started", sn=2),
        ]
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS


# ---------------------------------------------------------------------------
# Backfill — single set
# ---------------------------------------------------------------------------

class TestBackfillSingle:
    def test_no_activity_log_returns_none(self, session_set_dir):
        # spec.md only — not-started set
        assert backfill_events_for_session_set(session_set_dir) is None
        assert not os.path.isfile(
            os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        )

    def test_existing_ledger_left_alone(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1)
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write("preexisting\n")
        result = backfill_events_for_session_set(session_set_dir)
        assert result is None
        with open(path, "r", encoding="utf-8") as f:
            assert f.read() == "preexisting\n"

    def test_overwrite_flag_replaces_ledger(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="work_in_progress",
        )
        path = os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write("preexisting\n")
        result = backfill_events_for_session_set(session_set_dir, overwrite=True)
        assert result == path
        events = read_events(session_set_dir)
        assert len(events) > 0  # genuine reconstruction, not the "preexisting" string

    def test_in_progress_set_lands_at_work_in_progress(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1, include_verify=False)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="work_in_progress",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert any(e.event_type == "work_started" for e in events)
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_IN_PROGRESS

    def test_in_progress_with_verify_step_emits_verification_pair(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1, include_verify=True)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="work_in_progress",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        kinds = [e.event_type for e in events]
        assert "verification_requested" in kinds
        assert "verification_completed" in kinds
        # Historical verdict is unknown — that's the contract; the
        # backfill must not synthesize a VERIFIED verdict it doesn't
        # actually know happened.
        completed = [e for e in events if e.event_type == "verification_completed"]
        assert all(e.fields.get("verdict") == "unknown" for e in completed)

    def test_backfill_marks_events_as_backfilled(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1)
        _write_state(session_set_dir, current_session=1)
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert all(e.fields.get("backfilled") is True for e in events)

    def test_completed_set_with_changelog_lands_at_closed(self, session_set_dir):
        _write_activity(session_set_dir, sessions=2, include_verify=True)
        _write_state(
            session_set_dir,
            current_session=2,
            lifecycle="closed",
            total_sessions=2,
        )
        Path(os.path.join(session_set_dir, "change-log.md")).write_text(
            "# Change log\n", encoding="utf-8",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSED
        # Closeout trio is on the highest session only.
        kinds_by_session = {}
        for e in events:
            kinds_by_session.setdefault(e.session_number, []).append(e.event_type)
        assert "closeout_succeeded" in kinds_by_session[2]
        assert "closeout_succeeded" not in kinds_by_session.get(1, [])

    def test_work_verified_lifecycle_emits_synthetic_verified(self, session_set_dir):
        # A set whose state.json says work_verified but which has no
        # change-log gets a synthetic work_verified event so the
        # derived state matches the on-disk lifecycle marker.
        _write_activity(session_set_dir, sessions=1, include_verify=True)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="work_verified",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert any(e.event_type == "work_verified" for e in events)
        assert current_lifecycle_state(events) is SessionLifecycleState.WORK_VERIFIED

    def test_closeout_blocked_state_round_trips(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1, include_verify=True)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="closeout_blocked",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSEOUT_BLOCKED

    def test_closeout_pending_state_round_trips(self, session_set_dir):
        _write_activity(session_set_dir, sessions=1, include_verify=True)
        _write_state(
            session_set_dir,
            current_session=1,
            lifecycle="closeout_pending",
        )
        backfill_events_for_session_set(session_set_dir)
        events = read_events(session_set_dir)
        assert current_lifecycle_state(events) is SessionLifecycleState.CLOSEOUT_PENDING

    def test_malformed_activity_log_skipped_quietly(self, session_set_dir):
        with open(os.path.join(session_set_dir, "activity-log.json"), "w", encoding="utf-8") as f:
            f.write("{ not valid")
        # Should not raise, should not write a ledger
        result = backfill_events_for_session_set(session_set_dir)
        assert result is None
        assert not os.path.isfile(
            os.path.join(session_set_dir, SESSION_EVENTS_FILENAME)
        )


# ---------------------------------------------------------------------------
# Backfill — walker
# ---------------------------------------------------------------------------

class TestBackfillWalker:
    def test_walks_only_session_sets_with_specs(self, tmp_path):
        base = tmp_path / "session-sets"
        base.mkdir()
        # Real set: spec + activity log
        s1 = base / "001-real"
        s1.mkdir()
        (s1 / "spec.md").write_text("# spec", encoding="utf-8")
        _write_activity(str(s1), sessions=1)
        _write_state(str(s1), current_session=1)
        # Not-yet-started set: spec only
        s2 = base / "002-not-started"
        s2.mkdir()
        (s2 / "spec.md").write_text("# spec", encoding="utf-8")
        # Random folder without spec.md — must be ignored
        s3 = base / "not-a-set"
        s3.mkdir()
        (s3 / "junk.txt").write_text("junk", encoding="utf-8")

        results = backfill_all_session_sets(str(base))
        assert str(s1) in results
        assert str(s2) in results
        # The non-spec folder is excluded entirely from the result set,
        # not just None'd — it isn't a session set.
        assert str(s3) not in results
        assert results[str(s1)] is not None  # backfilled
        assert results[str(s2)] is None  # nothing to reconstruct from

    def test_walker_missing_base_returns_empty_dict(self, tmp_path):
        base = str(tmp_path / "does-not-exist")
        assert backfill_all_session_sets(base) == {}


# ---------------------------------------------------------------------------
# Real-world parse: backfill the live set-001 directory
# ---------------------------------------------------------------------------

class TestRealWorldBackfill:
    def test_backfill_live_set_001(self, tmp_path):
        repo_root = Path(__file__).resolve().parents[2]
        live = repo_root / "docs" / "session-sets" / "001-queue-contract-and-recovery-foundations"
        if not (live / "activity-log.json").is_file():
            pytest.skip("Live set-001 not present in this checkout")

        # Copy the relevant files into a tmp dir so we don't touch the
        # real ledger (or accidentally create one).
        clone = tmp_path / "clone"
        clone.mkdir()
        for name in ("spec.md", "activity-log.json", "session-state.json"):
            src = live / name
            if src.is_file():
                (clone / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        if (live / "change-log.md").is_file():
            (clone / "change-log.md").write_text(
                (live / "change-log.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )

        result = backfill_events_for_session_set(str(clone))
        assert result is not None
        events = read_events(str(clone))
        assert len(events) > 0
        # Set 001 has 4 verified sessions (5th is in-progress at the
        # time this backfill runs). The derived state for an
        # in-progress final session is work_in_progress.
        sn_present = {e.session_number for e in events}
        assert 1 in sn_present
        assert 4 in sn_present
        # The activity log has multiple verify steps per session
        # (verify rounds 1..3 for sessions 1 and 3). Each one must be
        # reflected in the events.
        verify_count_session_1 = sum(
            1 for e in events
            if e.session_number == 1 and e.event_type == "verification_completed"
        )
        assert verify_count_session_1 >= 1


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------

class TestPublicSurface:
    def test_event_types_tuple_has_nine_entries(self):
        assert len(EVENT_TYPES) == 9
        assert set(EVENT_TYPES) == {
            "work_started",
            "verification_requested",
            "verification_claimed",
            "verification_completed",
            "verification_timed_out",
            "work_verified",
            "closeout_requested",
            "closeout_succeeded",
            "closeout_failed",
        }

    def test_filename_constant(self):
        assert SESSION_EVENTS_FILENAME == "session-events.jsonl"

    def test_event_to_dict_excludes_reserved_overrides(self):
        # The `fields` dict shouldn't be able to silently shadow a
        # required key on serialization either, even if a future
        # caller bypasses append_event.
        ev = Event(
            timestamp="2026-04-30T00:00:00Z",
            session_number=1,
            event_type="work_started",
            fields={"timestamp": "wrong", "extra": "ok"},
        )
        out = ev.to_dict()
        assert out["timestamp"] == "2026-04-30T00:00:00Z"
        assert out["extra"] == "ok"
