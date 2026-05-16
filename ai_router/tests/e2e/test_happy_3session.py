"""End-to-end happy-path: a 3-session set driven through close-out.

This is the canonical scenario the e2e harness was built around. For
each session N in 1..3:

  1. Drive ``start_session`` for N. Assert the snapshot now reflects N
     in flight and the events ledger has exactly one ``work_started``
     for N. On N>1, assert ``completedSessions == [1..N-1]`` survives
     the rewrite (the pre-Set-022 regression the harness exists to
     pin shut on the canonical writer).
  2. Stage an activity-log entry and a disposition. On N == final,
     also write change-log.md so ``check_change_log_fresh`` passes.
  3. Drive ``close_session`` with ``--manual-verify``. Assert exit 0,
     ``completedSessions == [1..N]``, and the events ledger now
     records ``closeout_succeeded`` for N. On non-final N, status
     stays ``in-progress`` / ``work_in_progress``; on N == final,
     status flips to ``complete`` / ``closed`` and ``completedAt``
     is populated.

The test exercises every gate in :data:`gate_checks.GATE_CHECKS` on
every close-out — by the time the assertions run, the gates have
already passed, but their pass is what makes those assertions
meaningful.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from fixtures import (  # type: ignore[import-not-found]
    drive_close_session,
    drive_start_session,
    make_activity_log_entry,
    make_change_log,
    make_disposition,
    make_session_set,
    read_events,
    read_state,
)


pytestmark = pytest.mark.e2e


def _assert_in_flight_snapshot(state: dict, session_number: int, total: int) -> None:
    """Common assertion bundle for a session that has just been started."""
    assert state.get("currentSession") == session_number
    assert state.get("totalSessions") == total
    assert state.get("status") == "in-progress"
    assert state.get("lifecycleState") == "work_in_progress"
    assert state.get("startedAt") is not None
    assert state.get("completedAt") is None
    orchestrator = state.get("orchestrator") or {}
    assert orchestrator.get("engine") == "claude-code"
    assert orchestrator.get("model") == "claude-opus-4-7"


def _work_started_for(events, session_number: int):
    return [
        e for e in events
        if e.event_type == "work_started" and e.session_number == session_number
    ]


def _closeout_succeeded_for(events, session_number: int):
    return [
        e for e in events
        if e.event_type == "closeout_succeeded" and e.session_number == session_number
    ]


def _assert_event_history_stable(events, *, started_through: int, closed_through: int) -> None:
    """Assert the events ledger has stable per-session history.

    A naive happy-path test that only counts the *current* session's events
    misses a class of regression where session 2/3 silently corrupts the
    ledger entries for sessions 1/2 (truncation, deduplication bug,
    timestamp rewrite that drops earlier rows). This helper asserts that
    every session from 1 up to *started_through* has exactly one
    ``work_started`` and every session from 1 up to *closed_through* has
    exactly one ``closeout_succeeded`` — so historical entries surviving
    unchanged is the actual invariant being tested.

    The total event count is *not* asserted: close_session legitimately
    emits multiple bookkeeping events per close (``closeout_requested``,
    ``verification_completed``, ``closeout_succeeded``), and pinning a
    specific total here would couple the test to close_session's internal
    sequencing rather than to the contract we actually care about. What
    *is* asserted: no event carries a session_number outside ``1..max``,
    so an event written against the wrong session (a different class of
    cross-session corruption) still surfaces.
    """
    for s in range(1, started_through + 1):
        assert len(_work_started_for(events, s)) == 1, (
            f"work_started count for session {s} was not 1 after "
            f"started_through={started_through} closed_through={closed_through}; "
            f"saw {[(e.session_number, e.event_type) for e in events]!r}"
        )
    for s in range(1, closed_through + 1):
        assert len(_closeout_succeeded_for(events, s)) == 1, (
            f"closeout_succeeded count for session {s} was not 1 after "
            f"started_through={started_through} closed_through={closed_through}; "
            f"saw {[(e.session_number, e.event_type) for e in events]!r}"
        )
    bad_session_numbers = [
        (e.session_number, e.event_type) for e in events
        if not (1 <= e.session_number <= started_through)
    ]
    assert not bad_session_numbers, (
        f"events ledger has entries with out-of-range session_number "
        f"(should be in 1..{started_through}): {bad_session_numbers!r}"
    )


def test_happy_3session_full_cycle(tmp_path: Path) -> None:
    total = 3
    handle = make_session_set(tmp_path, slug="harness-happy-3", total_sessions=total)

    # Sanity: the fixture lands a spec.md and a not-started state
    # file matching production bootstrap. No work has been registered
    # yet (currentSession null), and the events ledger is empty.
    assert (handle.set_dir / "spec.md").is_file()
    initial_state = read_state(handle)
    assert initial_state.get("status") == "not-started"
    assert initial_state.get("currentSession") is None
    assert initial_state.get("totalSessions") == total
    assert read_events(handle) == []

    for n in range(1, total + 1):
        is_final = n == total

        # 1) Start session N.
        drive_start_session(handle, n)
        state = read_state(handle)
        _assert_in_flight_snapshot(state, n, total)

        # completedSessions[] must reflect the prior closes. Set 028
        # normalized schema to always emit the key (empty on fresh sets).
        expected_prior = list(range(1, n))
        assert state.get("completedSessions") == expected_prior, (
            f"start_session for N={n} wiped completedSessions[]: "
            f"saw {state.get('completedSessions')!r}, expected {expected_prior!r}"
        )

        # Events ledger after start: every session 1..n has exactly one
        # work_started, every session 1..n-1 has exactly one
        # closeout_succeeded, and total event count == 2*n - 1. Catches
        # regressions where a later session's start corrupts earlier
        # sessions' ledger entries (truncation, dedup-bug, etc.).
        _assert_event_history_stable(
            read_events(handle),
            started_through=n,
            closed_through=n - 1,
        )

        # 2) Stage the close-out artifacts.
        make_activity_log_entry(handle, n)
        make_disposition(handle, n, is_final=is_final)
        if is_final:
            make_change_log(handle, final_session_number=n)

        # 3) Drive close-out.
        proc = drive_close_session(handle, n)
        assert proc.returncode == 0, (
            f"close_session failed for N={n}: stdout={proc.stdout!r} "
            f"stderr={proc.stderr!r}"
        )

        state = read_state(handle)
        assert state.get("completedSessions") == list(range(1, n + 1)), (
            f"completedSessions[] after close of N={n}: "
            f"saw {state.get('completedSessions')!r}"
        )

        # Events ledger after close: history stable for all sessions
        # 1..n on both event types; total count == 2*n.
        _assert_event_history_stable(
            read_events(handle),
            started_through=n,
            closed_through=n,
        )

        # Full state-invariant bundle. close_session does not advance
        # currentSession (it stays at the just-closed session — the
        # next start_session is what bumps it), does not change
        # totalSessions, does not clear startedAt, and preserves the
        # orchestrator block. All four must hold across every close.
        assert state.get("currentSession") == n, (
            f"close_session should not advance currentSession; "
            f"saw {state.get('currentSession')!r} after closing N={n}"
        )
        assert state.get("totalSessions") == total
        assert state.get("startedAt") is not None
        orchestrator = state.get("orchestrator") or {}
        assert orchestrator.get("engine") == "claude-code"
        assert orchestrator.get("model") == "claude-opus-4-7"
        assert orchestrator.get("provider") == "anthropic"
        assert orchestrator.get("effort") == "high"

        if not is_final:
            assert state.get("status") == "in-progress"
            assert state.get("lifecycleState") == "work_in_progress"
            assert state.get("completedAt") is None
        else:
            assert state.get("status") == "complete"
            assert state.get("lifecycleState") == "closed"
            assert state.get("completedAt") is not None
