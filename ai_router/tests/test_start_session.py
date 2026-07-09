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
    read_raw_session_state,
    read_session_state,
    register_session_start,
    synthesize_not_started_state,
)


def _fresh_set(tmp_path: Path, total_sessions: int = 3) -> Path:
    """Create a not-started session set directory with a spec.md.

    The minimal shape ``start_session`` expects: a directory with a
    ``spec.md`` (so the not-started synthesizer can read
    ``totalSessions`` from the ``## Session Set Configuration``
    block) and a synthesized ``session-state.json`` carrying
    ``status: "not-started"``.

    Set 046 Session 2: the fixture now includes the canonical
    ``## Session Set Configuration`` heading so
    ``_read_total_sessions_from_spec`` picks up ``totalSessions``.
    Pre-Set-046 the fixture omitted the heading and the writer fell
    through to a ``max(spec_titles, completed, session_number)``
    fallback that has since been removed (the session_number branch
    was the operator-observed ``0/1`` bug Set 046 fixes).
    """
    set_dir = tmp_path / "test-set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "## Session Set Configuration\n\n"
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
    if "total_sessions" in overrides:
        base.extend(["--total-sessions", str(overrides.pop("total_sessions"))])
    args = parser.parse_args(base)
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def _planless_set(tmp_path: Path) -> Path:
    """Create a fresh "plan-less" session set: spec.md exists but has
    no ``## Session Set Configuration`` block and no ``### Session N``
    headings.

    Used by the Set 046 Session 2 coverage to exercise the
    ``totalSessions: null`` writer path Explorer renders as ``0/?``.
    """
    set_dir = tmp_path / "planless-set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# Plan-less stub\n\n"
        "The operator has not committed to a session breakdown yet.\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))
    return set_dir


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


def test_session_set_dir_accepts_bare_number(tmp_path: Path, monkeypatch):
    """Set 050 S4 (Feature 2): ``--session-set-dir 50`` resolves to the
    full ``050-...`` slug within the active repo's docs/session-sets."""
    sets_root = tmp_path / "docs" / "session-sets"
    sets_root.mkdir(parents=True)
    set_dir = _fresh_set(sets_root)  # default name "test-set"; rename below
    # _fresh_set names the dir; recreate under a numbered slug so the
    # resolver has something to match.
    numbered = sets_root / "050-schema-drift"
    set_dir.rename(numbered)
    monkeypatch.chdir(tmp_path)

    rc = start_session.main([
        "--session-set-dir", "50",
        "--engine", "claude",
        "--provider", "anthropic",
    ])
    assert rc == start_session.EXIT_OK
    state = read_session_state(str(numbered)) or {}
    assert state.get("status") == "in-progress"


def test_session_set_dir_bare_number_no_match_is_usage_error(
    tmp_path: Path, monkeypatch, capsys
):
    """A bare number with no matching set is a usage error naming the
    available numbers, not a bare 'directory not found'."""
    sets_root = tmp_path / "docs" / "session-sets"
    sets_root.mkdir(parents=True)
    (sets_root / "047-foo").mkdir()
    monkeypatch.chdir(tmp_path)

    rc = start_session.main([
        "--session-set-dir", "99",
        "--engine", "claude",
    ])
    assert rc == start_session.EXIT_USAGE
    assert "Available numbers" in capsys.readouterr().err


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


# ---------------------------------------------------------------------------
# Group 6: Set 046 Session 2 — plan-less in-progress + --total-sessions CLI
# ---------------------------------------------------------------------------

def test_planless_session_1_writes_totalsessions_null(tmp_path: Path):
    """A fresh stub (no ``## Session Set Configuration`` block, no
    ``### Session N`` headings) writes a plan-less in-progress shape:
    ``totalSessions: null``, ``currentSession: 1``,
    ``completedSessions: []``, no ``sessions[]``.

    This is Set 046 deliverable (a): the Explorer's ``fractionFor()``
    sees ``totalSessions == null`` and renders ``0/?`` instead of the
    pre-Set-046 ``0/1`` (which was driven by the now-removed
    ``max(spec_titles, completed, session_number)`` writer fallback
    inflating to ``session_number`` on a fresh Session 1).
    """
    set_dir = _planless_set(tmp_path)

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    # Raw on-disk shape: plan-less write omits sessions[] and keeps
    # orchestrator + startedAt at the top level as the documented v4
    # carve-out (Set 047 Session 4 — no per-session record to attach
    # them to when totalSessions is unknown).
    raw = read_raw_session_state(str(set_dir)) or {}
    assert raw.get("status") == "in-progress"
    assert raw.get("schemaVersion") == 4
    assert "sessions" not in raw, (
        "plan-less write must omit sessions[] entirely; the carve-out "
        "for 'no plan known' is the absent-key form, not "
        "present-with-null or present-with-empty-array"
    )

    # Shim-derived view: totalSessions stays null (Set 046's 0/? signal)
    # and currentSession reads as 1 via the plan-less fallback.
    state = read_session_state(str(set_dir)) or {}
    assert state.get("totalSessions") is None, (
        "plan-less write must keep totalSessions: null so the "
        "Explorer renders 0/? per Set 046 deliverable (a)"
    )
    assert state.get("completedSessions") == []
    assert state.get("status") == "in-progress"
    assert state.get("lifecycleState") == "work_in_progress"


def test_total_sessions_cli_arg_locks_count_without_spec(tmp_path: Path):
    """``--total-sessions N`` lets the operator lock the count on a
    plan-less stub without editing spec.md. The writer materializes a
    full ``sessions[]`` ledger of length N with session 1 in-progress
    and the rest not-started.
    """
    set_dir = _planless_set(tmp_path)

    rc = start_session.run(_args(set_dir, total_sessions=5))
    assert rc == start_session.EXIT_OK

    state = read_session_state(str(set_dir)) or {}
    assert state.get("totalSessions") == 5
    assert state.get("currentSession") == 1
    sessions = state.get("sessions")
    assert isinstance(sessions, list) and len(sessions) == 5
    assert sessions[0]["number"] == 1
    assert sessions[0]["status"] == "in-progress"
    assert all(s["status"] == "not-started" for s in sessions[1:])


def test_planless_refuses_session_number_above_1(tmp_path: Path):
    """The plan-less branch only accepts session 1 — without a known
    plan, there is no way to coherently start session 2 (no
    contiguous-from-1 invariant to satisfy).
    """
    set_dir = _planless_set(tmp_path)
    args = _args(set_dir, session_number=2)
    # The CLI's skip-ahead boundary refuses session 2 with no closed
    # sessions before it ever reaches the plan-less branch in the
    # writer, so we expect EXIT_BOUNDARY rather than the writer's
    # invariant-error path. The behavioral contract — "plan-less
    # Session 2 is refused" — holds either way.
    rc = start_session.run(args)
    assert rc == start_session.EXIT_BOUNDARY


def test_planless_writer_refuses_state_with_prior_completed(tmp_path: Path):
    """If a state file claims closed sessions but no
    ``totalSessions`` is resolvable, the writer refuses with a
    SessionStateInvariantError — that combination is incoherent and
    silently writing a plan-less snapshot would lose the closed-
    session history.
    """
    from progress import SessionStateInvariantError

    set_dir = _planless_set(tmp_path)
    # Hand-construct an inconsistent state: completedSessions=[1] but
    # totalSessions=null and no spec.md signal.
    state_path = set_dir / "session-state.json"
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["completedSessions"] = [1]
    state["currentSession"] = None
    state["status"] = "in-progress"
    state["lifecycleState"] = "work_in_progress"
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    with pytest.raises(SessionStateInvariantError) as excinfo:
        register_session_start(
            session_set=str(set_dir),
            session_number=2,
            total_sessions=None,
            orchestrator_engine="claude",
            orchestrator_model="claude-opus-4-7",
            orchestrator_effort="medium",
            orchestrator_provider="anthropic",
        )
    assert "plan-less" in str(excinfo.value)


def test_planless_state_round_trips_through_read_progress(tmp_path: Path):
    """The v3 reader's tolerant path (``read_progress`` raises rule 1
    for missing ``sessions[]``) is what makes the Explorer's
    ``fractionFor()`` see ``totalSessions: null`` and render ``0/?``.
    Lock down both the writer-produced shape and the read-side
    behavior so a regression in either layer shows up here.
    """
    from pathlib import Path as _Path
    from progress import SessionStateInvariantError, read_progress

    set_dir = _planless_set(tmp_path)
    start_session.run(_args(set_dir))

    # Raw on-disk shape: plan-less write omits sessions[] entirely
    # under v4 too (carve-out for "no plan known"). The shim view
    # adds an empty sessions[] for the canonical v4 read contract.
    raw = read_raw_session_state(str(set_dir)) or {}
    assert "sessions" not in raw
    state = read_session_state(str(set_dir)) or {}
    assert state.get("totalSessions") is None

    # Read side: the v3 synthesizer should NOT inflate total to 1
    # from currentSession alone (Set 046 Session 2 progress.py
    # change). With no sessions[], no headings, no closed sessions,
    # and totalSessions=null, the candidates set is empty and the
    # synthesized sessions[] is also empty — which trips rule 1.
    with pytest.raises(SessionStateInvariantError) as excinfo:
        read_progress(raw, _Path(set_dir) / "spec.md")
    assert excinfo.value.rule == 1


# ---------------------------------------------------------------------------
# Group: Set 053 — schema-drift advisory rides the session lifecycle
# ---------------------------------------------------------------------------


def _sub_current_sibling(tmp_path: Path, name: str = "999-old-set") -> Path:
    """Write a sub-current (v3) sibling set next to the active set so the
    lifecycle drift scan (which scans the parent dir) finds drift."""
    d = tmp_path / name
    d.mkdir()
    (d / "session-state.json").write_text(
        json.dumps({
            "schemaVersion": 3,
            "sessionSetName": name,
            "status": "complete",
            "currentSession": 1,
            "totalSessions": 1,
            "completedSessions": [1],
            "sessions": [{"number": 1, "title": "S1", "status": "complete"}],
        }),
        encoding="utf-8",
    )
    return d


def test_start_session_emits_drift_warning_but_stays_exit_ok(tmp_path: Path, capsys):
    """start_session prints the lifecycle drift advisory to stderr when a
    sibling set is sub-current, and the warning never changes the exit code."""
    set_dir = _fresh_set(tmp_path)
    _sub_current_sibling(tmp_path)

    rc = start_session.run(_args(set_dir))

    assert rc == start_session.EXIT_OK
    err = capsys.readouterr().err
    assert "[dabbler]" in err
    assert "below the current schema" in err


def test_start_session_silent_when_no_drift(tmp_path: Path, capsys):
    """No sub-current sibling -> no drift line on stderr when clean."""
    set_dir = _fresh_set(tmp_path)

    rc = start_session.run(_args(set_dir))

    assert rc == start_session.EXIT_OK
    err = capsys.readouterr().err
    assert "below the current schema" not in err


def test_start_session_full_mode_prints_step6_advisory(tmp_path: Path, capsys):
    """Full-tier starts teach that verify_session is mandatory (Set 083:
    no routed-gate step, no skip)."""
    set_dir = _fresh_set(tmp_path)

    rc = start_session.run(_args(set_dir))

    assert rc == start_session.EXIT_OK
    err = capsys.readouterr().err
    assert "mandatory" in err
    assert "no skip" in err
    assert "ai_router.verify_session" in err
    assert "ai_router.routed_gate" not in err


def test_start_session_drift_scan_error_is_non_fatal(tmp_path: Path, monkeypatch):
    """If the drift scan raises, start_session must still succeed (fail-open)."""
    set_dir = _fresh_set(tmp_path)

    def boom(*a, **k):
        raise RuntimeError("scan blew up")

    monkeypatch.setattr(start_session, "summarize_drift", boom)
    assert start_session.run(_args(set_dir)) == start_session.EXIT_OK


# ---------------------------------------------------------------------------
# Group: Set 070 — contractGate seed capture at set start
#
# Closes the Set 069 S6 gap: pre-Set-070 start_session captured the
# pathAwareCritique seed but NOT the contractGate seed, so the contractGate
# close-out gate silently no-op'd. These tests pin that start_session now
# captures the contractGate choice the same way (CLI flag wins; spec seed
# recorded once; immutable thereafter; never blocks the boundary write).
# ---------------------------------------------------------------------------

def _contract_gate_records(set_dir: Path) -> list:
    """Return the recorded contractGate (kind=='contract_gate') entries.

    Tolerates a missing activity-log.json: when nothing is seeded, the capture
    records nothing and never creates the file (strictly opt-in)."""
    log_path = set_dir / "activity-log.json"
    if not log_path.exists():
        return []
    log = json.loads(log_path.read_text(encoding="utf-8"))
    return [e for e in log.get("entries", []) if e.get("kind") == "contract_gate"]


def test_contract_gate_seed_recorded_from_spec(tmp_path: Path):
    """A spec declaring ``contractGate: advisory`` is captured at set start
    even with no ``--contract-gate`` flag (the Set 069 S6 gap)."""
    set_dir = tmp_path / "cg-set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "## Session Set Configuration\n\n"
        "```yaml\n"
        "totalSessions: 3\n"
        "requiresUAT: false\n"
        "requiresE2E: false\n"
        "contractGate: advisory\n"
        "```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    records = _contract_gate_records(set_dir)
    assert len(records) == 1
    assert records[0].get("choice") == "advisory"


def test_contract_gate_cli_flag_wins_over_spec(tmp_path: Path):
    """An explicit ``--contract-gate required`` overrides the spec seed."""
    set_dir = tmp_path / "cg-cli-set"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n"
        "## Session Set Configuration\n\n"
        "```yaml\n"
        "totalSessions: 3\n"
        "contractGate: advisory\n"
        "```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))

    rc = start_session.run(_args(set_dir, contract_gate="required"))
    assert rc == start_session.EXIT_OK

    records = _contract_gate_records(set_dir)
    assert len(records) == 1
    assert records[0].get("choice") == "required"


def test_contract_gate_no_seed_records_nothing(tmp_path: Path):
    """A spec with no ``contractGate`` field and no flag records nothing —
    the feature stays strictly opt-in (default ``none`` applies implicitly)."""
    set_dir = _fresh_set(tmp_path)  # fixture spec has no contractGate field

    rc = start_session.run(_args(set_dir))
    assert rc == start_session.EXIT_OK

    assert _contract_gate_records(set_dir) == []


def test_contract_gate_seed_immutable_after_first_record(tmp_path: Path):
    """Once recorded, a later start_session with a different choice is a
    no-op — a mid-set downgrade cannot silently disarm an armed gate."""
    set_dir = tmp_path / "cg-immutable"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntotalSessions: 3\ncontractGate: required\n```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))

    assert start_session.run(_args(set_dir)) == start_session.EXIT_OK
    # Re-run (idempotent resume of the in-flight session) asking for none.
    assert start_session.run(_args(set_dir, contract_gate="none")) == start_session.EXIT_OK

    records = _contract_gate_records(set_dir)
    assert len(records) == 1
    assert records[0].get("choice") == "required"


def test_contract_gate_capture_never_blocks_boundary_write(tmp_path: Path, monkeypatch):
    """If the contractGate capture raises, start_session must still succeed
    (best-effort, fail-open — same posture as the pathAwareCritique capture)."""
    set_dir = tmp_path / "cg-failopen"
    set_dir.mkdir()
    (set_dir / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntotalSessions: 3\ncontractGate: advisory\n```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(set_dir))

    import contract_gate as cg

    def boom(*a, **k):
        raise RuntimeError("capture blew up")

    monkeypatch.setattr(cg, "resolve_and_record_contract_gate", boom)
    assert start_session.run(_args(set_dir)) == start_session.EXIT_OK
    # The boundary write still landed even though capture failed.
    state = read_session_state(str(set_dir)) or {}
    assert state.get("status") == "in-progress"


# ---------------------------------------------------------------------------
# Set 086 S1 — Copilot-seat auth-preflight wiring
# ---------------------------------------------------------------------------

import ai_router.copilot_preflight as cp_pkg  # noqa: E402
from ai_router.copilot_preflight import PreflightResult  # noqa: E402


class _RecordingPreflight:
    """Stand-in for run_preflight that records kwargs and returns a fixed
    result — so wiring tests never touch the real CLI."""

    def __init__(self, ok: bool):
        self._ok = ok
        self.calls: list = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if self._ok:
            return PreflightResult(
                ok=True, stage="live-probe", error_class=None, message="ok"
            )
        return PreflightResult(
            ok=False, stage="live-probe", error_class="auth-class",
            message="blocked: run copilot login --host ...",
        )


def test_preflight_noop_for_direct_api_engine(tmp_path, monkeypatch):
    def _boom(**kwargs):  # must never be called for a single-vendor engine
        raise AssertionError("run_preflight called for a direct-API engine")

    monkeypatch.setattr(cp_pkg, "run_preflight", _boom)
    args = _args(_fresh_set(tmp_path))  # engine defaults to claude
    assert start_session._run_copilot_preflight_or_block(
        args, run_live_probe=True
    ) is None


def test_preflight_blocks_start_on_copilot_failure(tmp_path, monkeypatch):
    rec = _RecordingPreflight(ok=False)
    monkeypatch.setattr(cp_pkg, "run_preflight", rec)
    set_dir = _fresh_set(tmp_path)
    args = _args(set_dir, engine="copilot", model="claude-sonnet-4.6")
    rc = start_session.run(args)
    assert rc == start_session.EXIT_BOUNDARY
    assert rec.calls  # the preflight actually ran for the copilot seat
    # State must NOT have flipped to in-progress — start was blocked.
    state = read_session_state(str(set_dir)) or {}
    assert state.get("status") == "not-started"


def test_preflight_passes_lets_copilot_start(tmp_path, monkeypatch):
    rec = _RecordingPreflight(ok=True)
    monkeypatch.setattr(cp_pkg, "run_preflight", rec)
    set_dir = _fresh_set(tmp_path)
    args = _args(set_dir, engine="copilot", model="claude-sonnet-4.6")
    rc = start_session.run(args)
    assert rc == start_session.EXIT_OK
    state = read_session_state(str(set_dir)) or {}
    assert state.get("status") == "in-progress"
    # Fresh start probes live (run_live_probe defaults True at the call site).
    assert rec.calls[0]["run_live_probe"] is True


def test_preflight_probes_live_on_every_start_including_reentry(
    tmp_path, monkeypatch
):
    # Round-2 finding: repo state ("a session is in flight") is not proof the
    # seat is STILL authenticated, so the live probe must run on EVERY start,
    # including an idempotent re-entry — never skipped based on session state.
    rec = _RecordingPreflight(ok=True)
    monkeypatch.setattr(cp_pkg, "run_preflight", rec)
    set_dir = _fresh_set(tmp_path)
    args = _args(set_dir, engine="copilot", model="claude-sonnet-4.6")
    assert start_session.run(args) == start_session.EXIT_OK
    # Re-enter the same in-flight session (e.g. after a context reset).
    assert start_session.run(args) == start_session.EXIT_OK
    assert rec.calls[0]["run_live_probe"] is True  # fresh start: billed probe
    assert rec.calls[1]["run_live_probe"] is True  # re-entry: STILL probes


def test_preflight_fails_closed_for_copilot_when_identity_raises(
    tmp_path, monkeypatch
):
    # Round-1 finding: if the identity helper is unavailable, a copilot seat
    # must still be preflighted (fail closed via the seat-label fallback),
    # never waved through.
    import ai_router.orchestrator_identity as oi

    def _raise(engine):
        raise RuntimeError("boom")

    monkeypatch.setattr(oi, "is_multi_provider_engine", _raise)
    rec = _RecordingPreflight(ok=False)
    monkeypatch.setattr(cp_pkg, "run_preflight", rec)
    args = _args(_fresh_set(tmp_path), engine="copilot", model="claude-sonnet-4.6")
    rc = start_session._run_copilot_preflight_or_block(args, run_live_probe=True)
    assert rc == start_session.EXIT_BOUNDARY
    assert rec.calls  # preflight ran despite the broken identity helper


def test_preflight_direct_engine_unaffected_when_identity_raises(
    tmp_path, monkeypatch
):
    # The fail-closed fallback must NOT start blocking the common direct-API
    # path: a claude seat with a broken identity helper still proceeds.
    import ai_router.orchestrator_identity as oi

    def _raise(engine):
        raise RuntimeError("boom")

    monkeypatch.setattr(oi, "is_multi_provider_engine", _raise)

    def _boom(**kwargs):
        raise AssertionError("preflight ran for a direct-API engine")

    monkeypatch.setattr(cp_pkg, "run_preflight", _boom)
    args = _args(_fresh_set(tmp_path))  # engine defaults to claude
    assert start_session._run_copilot_preflight_or_block(
        args, run_live_probe=True
    ) is None
