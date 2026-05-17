"""Set 022 Session 1 — ``ai_router.start_session`` CLI tests.

Covers the four behavioral contracts from the spec:

1. **Idempotency** — re-running for the same in-flight session is a
   no-op (no duplicate ``work_started`` events, no state regression).
2. **Boundary enforcement** — refuses to advance to N+1 while session
   N is still open (exits non-zero).
3. **Next-session inference** — when ``--session-number`` is absent,
   the CLI picks ``max(completedSessions) + 1`` or ``1`` for a
   not-started set.
4. **Event emission** — every fresh session emits exactly one
   ``work_started`` event; resumes do not duplicate it.

The fixture is intentionally smaller than the repair-fixture sets in
``test_close_session_session4.py`` because the CLI never touches git
state — it only writes ``session-state.json`` and appends to
``session-events.jsonl``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import start_session
from session_events import read_events
from session_state import (
    compute_effective_completed_sessions,
    read_session_state,
    register_session_start,
    synthesize_not_started_state,
)


def _fresh_set(tmp_path: Path, total_sessions: int = 3) -> Path:
    """Create a not-started session set directory with a spec.md.

    The minimal shape ``start_session`` expects: a directory with a
    ``spec.md`` (so the not-started synthesizer can read
    ``totalSessions`` from the config block) and a synthesized
    ``session-state.json`` carrying ``status: "not-started"``.
    """
    set_dir = tmp_path / "test-set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "```yaml\n"
        f"totalSessions: {total_sessions}\n"
        "requiresUAT: false\n"
        "requiresE2E: false\n"
        "uatStyle: ad-hoc\n"
        "effort: medium\n"
        "```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))
    return set_dir


def _args(set_dir: Path, **overrides) -> "start_session.argparse.Namespace":
    parser = start_session._build_arg_parser()
    base = [
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--effort", "medium",
        "--provider", "anthropic",
    ]
    if "session_number" in overrides:
        base.extend(["--session-number", str(overrides.pop("session_number"))])
    args = parser.parse_args(base)
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


# ---------------------------------------------------------------------------
# Group 1: next-session inference
# ---------------------------------------------------------------------------

def test_infers_session_1_on_not_started_set(tmp_path: Path):
    """A not-started set (no completedSessions[], no events) infers
    session 1 as the next session to start."""
    set_dir = _fresh_set(tmp_path)
    assert compute_effective_completed_sessions(str(set_dir)) == []

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    assert state.get("currentSession") == 1
    assert state.get("status") == "in-progress"
    assert state.get("lifecycleState") == "work_in_progress"


def test_infers_next_session_from_completed_sessions(tmp_path: Path):
    """With ``completedSessions: [1, 2]`` already on disk,
    inferred next session is 3."""
    set_dir = _fresh_set(tmp_path, total_sessions=3)
    # Simulate "session 1 and 2 closed, set between sessions."
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = [1, 2]
    state["currentSession"] = 2
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = "2026-05-15T08:00:00-04:00"
    state["orchestrator"] = {
        "engine": "claude", "provider": "anthropic",
        "model": "claude-opus-4-7", "effort": "medium",
    }
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state_after = read_session_state(str(set_dir)) or {}
    assert state_after.get("currentSession") == 3
    assert state_after.get("completedSessions") == [1, 2], (
        "completedSessions[] must be preserved across the snapshot "
        "rewrite (Set 022 invariant)"
    )


def test_infers_next_session_from_events_ledger(tmp_path: Path):
    """Pre-Set-022 set: no completedSessions[] field but
    closeout_succeeded events for sessions 1-2. The helper backfills
    from the ledger; inferred next session is 3."""
    set_dir = _fresh_set(tmp_path, total_sessions=3)
    # Append historical closeout events without setting
    # completedSessions[] on the snapshot.
    from session_events import append_event
    append_event(str(set_dir), "work_started", 1)
    append_event(str(set_dir), "closeout_succeeded", 1)
    append_event(str(set_dir), "work_started", 2)
    append_event(str(set_dir), "closeout_succeeded", 2)

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    state_after = read_session_state(str(set_dir)) or {}
    assert state_after.get("currentSession") == 3
    # The boundary write backfills completedSessions[] from the
    # events ledger so the snapshot agrees with the historical
    # record.
    assert state_after.get("completedSessions") == [1, 2]


# ---------------------------------------------------------------------------
# Group 2: idempotency
# ---------------------------------------------------------------------------

def test_idempotent_when_session_already_in_flight(tmp_path: Path):
    """Re-running start_session for the in-flight session is a no-op:
    no duplicate ``work_started`` events, no state regression."""
    set_dir = _fresh_set(tmp_path)
    start_session.run(_args(set_dir))

    events_before = read_events(str(set_dir))
    state_before = read_session_state(str(set_dir)) or {}

    # Re-run with the same in-flight session.
    rc = start_session.run(_args(set_dir, session_number=1))
    assert rc == start_session.EXIT_OK

    events_after = read_events(str(set_dir))
    work_started_for_1 = [
        e for e in events_after
        if e.event_type == "work_started" and e.session_number == 1
    ]
    assert len(work_started_for_1) == 1, (
        "register_session_start must dedupe work_started; re-running "
        "start_session for the same session must not append a "
        f"duplicate event (got {len(work_started_for_1)})"
    )
    state_after = read_session_state(str(set_dir)) or {}
    assert state_after.get("currentSession") == state_before.get(
        "currentSession"
    )
    assert state_after.get("status") == "in-progress"


# ---------------------------------------------------------------------------
# Group 3: boundary enforcement
# ---------------------------------------------------------------------------

def test_refuses_to_advance_past_in_flight_session(
    tmp_path: Path, capsys
):
    """Asking for session N+1 while N is still in flight exits
    non-zero with a clear message."""
    set_dir = _fresh_set(tmp_path)
    start_session.run(_args(set_dir))  # session 1 now in flight

    rc = start_session.run(_args(set_dir, session_number=2))
    assert rc == start_session.EXIT_BOUNDARY

    err = capsys.readouterr().err
    assert "refused" in err
    assert "session 1 is still in flight" in err
    assert "close_session" in err, (
        "the error must point operators at the close_session CLI"
    )


def test_refuses_to_reopen_closed_session(
    tmp_path: Path, capsys
):
    """Asking for a session already in completedSessions[] exits
    non-zero — start_session never re-opens a closed session."""
    set_dir = _fresh_set(tmp_path)
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = [1]
    state["currentSession"] = 1
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = "2026-05-15T08:00:00-04:00"
    state["orchestrator"] = {
        "engine": "claude", "provider": "anthropic",
        "model": "claude-opus-4-7", "effort": "medium",
    }
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    rc = start_session.run(_args(set_dir, session_number=1))
    assert rc == start_session.EXIT_BOUNDARY
    err = capsys.readouterr().err
    assert "already closed" in err


def test_missing_session_set_dir(tmp_path: Path, capsys):
    """Bad path → usage error, not boundary."""
    rc = start_session.run(_args(tmp_path / "does-not-exist"))
    assert rc == start_session.EXIT_USAGE
    assert "not found" in capsys.readouterr().err


def test_refuses_to_skip_ahead_on_fresh_set(tmp_path: Path, capsys):
    """A not-started set: --session-number 3 is rejected (gap).
    The contract is contiguous closure; the only legitimate first
    session is 1.
    """
    set_dir = _fresh_set(tmp_path)
    rc = start_session.run(_args(set_dir, session_number=3))
    assert rc == start_session.EXIT_BOUNDARY
    err = capsys.readouterr().err
    assert "not the next sequential session" in err
    assert "expected 1" in err


def test_refuses_to_skip_ahead_between_sessions(
    tmp_path: Path, capsys
):
    """Set has [1] closed and no session in flight: asking for
    session 3 is rejected (skips session 2)."""
    set_dir = _fresh_set(tmp_path, total_sessions=4)
    # Simulate "session 1 closed, between sessions".
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = [1]
    state["currentSession"] = 1
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state["startedAt"] = "2026-05-15T08:00:00-04:00"
    state["orchestrator"] = {
        "engine": "claude", "provider": "anthropic",
        "model": "claude-opus-4-7", "effort": "medium",
    }
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    rc = start_session.run(_args(set_dir, session_number=3))
    assert rc == start_session.EXIT_BOUNDARY
    err = capsys.readouterr().err
    assert "expected 2" in err


# ---------------------------------------------------------------------------
# Group 4: work_started event emission
# ---------------------------------------------------------------------------

def test_emits_work_started_for_session_1(tmp_path: Path):
    """Fresh session 1 emits exactly one ``work_started`` event."""
    set_dir = _fresh_set(tmp_path)
    start_session.run(_args(set_dir))

    events = read_events(str(set_dir))
    work_started = [e for e in events if e.event_type == "work_started"]
    assert len(work_started) == 1
    assert work_started[0].session_number == 1


def test_emits_work_started_for_each_new_session(tmp_path: Path):
    """A second start_session for session 2 emits a fresh
    ``work_started`` event for session 2 (not a duplicate for 1)."""
    set_dir = _fresh_set(tmp_path, total_sessions=3)
    # Simulate session 1 closed via the writer used by close_session
    # rather than hand-editing — keeps the test honest about the
    # boundary-write story.
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=3,
        orchestrator_engine="claude",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="medium",
        orchestrator_provider="anthropic",
    )
    # Mark session 1 closed on the snapshot (mimics
    # _flip_state_to_closed's effect without invoking the gate).
    # Under v3 (Set 030 Session 2 dual-write), the per-session
    # status in `sessions[]` is authoritative; the legacy
    # `completedSessions[]` is derived from it. Both must be flipped
    # to keep the snapshot internally consistent — otherwise the
    # v3 reader sees session 1 still in-progress and start_session
    # refuses to advance to session 2.
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = [1]
    state["currentSession"] = None
    for session in state.get("sessions", []):
        if session.get("number") == 1:
            session["status"] = "complete"
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    events = read_events(str(set_dir))
    by_session = {}
    for e in events:
        if e.event_type == "work_started":
            by_session.setdefault(e.session_number, []).append(e)
    assert sorted(by_session.keys()) == [1, 2]
    assert len(by_session[1]) == 1
    assert len(by_session[2]) == 1


# ---------------------------------------------------------------------------
# Group 5: main() entry point
# ---------------------------------------------------------------------------

def test_main_returns_zero_on_success(tmp_path: Path):
    """``python -m ai_router.start_session ...`` returns 0 on
    success — the convention the workflow doc relies on."""
    set_dir = _fresh_set(tmp_path)
    argv = [
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--effort", "medium",
    ]
    assert start_session.main(argv) == start_session.EXIT_OK


def test_main_returns_boundary_exit_on_violation(tmp_path: Path):
    """The boundary-violation exit code (3) propagates from
    run() through main() so shell callers can branch on it."""
    set_dir = _fresh_set(tmp_path)
    start_session.main([
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--model", "claude-opus-4-7",
    ])
    rc = start_session.main([
        "--session-set-dir", str(set_dir),
        "--engine", "claude",
        "--model", "claude-opus-4-7",
        "--session-number", "2",
    ])
    assert rc == start_session.EXIT_BOUNDARY
