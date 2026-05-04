"""Set 014 Session 1 (b) — ``close_session`` success path flips the snapshot.

Two tests cover the long-deferred Set 4 wiring that Set 014 lands:

1. **``test_close_session_happy_path_flips_snapshot``** — a one-session
   set with disposition + commit + push runs ``close_session`` end-to-end
   and the resulting ``session-state.json`` reads
   ``lifecycleState: closed`` / ``status: complete`` without any
   ``--repair --apply`` follow-up. Before Set 014 the snapshot stayed at
   ``work_in_progress`` after a clean close-out (the orchestrator paid a
   manual ``--repair`` step every multi-session set since Set 010); the
   fix wires the snapshot flip into the success path.

2. **``test_close_session_multi_session_set_clean``** — two-session set
   where session 1 closes, session 2 is registered (which now auto-emits
   ``work_started`` per Set 014 (a) and rewrites the snapshot back to
   ``work_in_progress``), session 2 closes. Asserts no manual
   ``append_event`` and no ``--repair`` calls were needed end-to-end —
   the regression test that proves Set 014 fixes Set 013's papercut on
   the multi-session handoff.

The fixture mirrors ``test_close_session_session4.closeable_set``: real
git repo + bare remote so the deterministic gates pass without monkey-
patching ``_run_gate_checks``. Kept local rather than imported so the two
test files do not develop a fixture-sharing coupling.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

import close_session
from disposition import Disposition, write_disposition
from session_events import (
    SessionLifecycleState,
    current_lifecycle_state,
    read_events,
)
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    read_session_state,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} failed: {proc.stderr.strip()}"
        )
    return proc


def _ns(**overrides):
    parser = close_session._build_parser()
    args = parser.parse_args([])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="continuing on opus for the rest of the set",
        ),
    )


def _build_repo_with_set(
    tmp_path: Path, total_sessions: int,
) -> tuple[Path, Path]:
    """Build a real git repo + bare remote, then register session 1.

    Returns (repo_root, set_dir).
    """
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-b", "main")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Test")
    _git(root, "config", "commit.gpgsign", "false")
    (root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(root, "add", "README.md")
    _git(root, "commit", "-m", "baseline")

    bare = tmp_path / "repo.git"
    bare.mkdir()
    _git(bare, "init", "--bare", "-b", "main")
    _git(root, "remote", "add", "origin", str(bare))
    _git(root, "push", "-u", "origin", "main")

    set_dir = root / "docs" / "session-sets" / "test-set"
    set_dir.mkdir(parents=True)
    (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")

    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=total_sessions,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "test-set",
            "createdDate": "2026-05-04T00:00:00-04:00",
            "totalSessions": total_sessions,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-05-04T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    return root, set_dir


def _commit_and_push(repo_root: Path, message: str) -> None:
    _git(repo_root, "add", "-A")
    _git(repo_root, "commit", "-m", message)
    _git(repo_root, "push", "origin", "main")


# ---------------------------------------------------------------------------
# Test 1: happy-path snapshot flip (single-session set)
# ---------------------------------------------------------------------------

def test_close_session_happy_path_flips_snapshot(tmp_path: Path):
    """Set 014 Session 1 (b): ``close_session`` success path flips
    ``session-state.json`` to ``complete`` / ``closed`` without
    ``--repair`` after ``closeout_succeeded`` is appended.
    """
    _repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="single-session happy path",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    # Final session of the set must author change-log.md before close-out
    # (gate ``change_log_fresh``).
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(_repo, "land work")

    args = _ns(session_set_dir=str(set_dir))
    outcome = close_session.run(args)

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.exit_code == 0

    # The snapshot was flipped — no need for --repair --apply.
    state = read_session_state(str(set_dir))
    assert state is not None
    assert state["status"] == "complete", (
        f"expected status=complete, got {state.get('status')!r}; "
        "Set 014 (b) wires the success path to flip the snapshot"
    )
    assert state["lifecycleState"] == "closed", (
        f"expected lifecycleState=closed, got "
        f"{state.get('lifecycleState')!r}"
    )
    assert state["completedAt"] is not None

    # Outcome message names the flip explicitly.
    assert any(
        "_flip_state_to_closed" in m for m in outcome.messages
    ), (
        "outcome.messages should record the snapshot flip explicitly"
    )

    # The events ledger ordering: closeout_succeeded comes before the
    # flip (the ledger is the audit trail; the snapshot is the cache).
    events = read_events(str(set_dir))
    assert any(e.event_type == "closeout_succeeded" for e in events)
    assert current_lifecycle_state(events) == SessionLifecycleState.CLOSED


def test_close_session_emits_closeout_succeeded_before_flip(
    tmp_path: Path, monkeypatch,
):
    """Set 014 Session 1 (b) — Round 1 verifier follow-up: pin the
    ``closeout_succeeded``-before-snapshot-flip ordering invariant.

    If ``append_event`` for ``closeout_succeeded`` raises, the snapshot
    must NOT have been flipped. This is the same ordering invariant as
    ``register_session_start``'s event-before-snapshot rule: a future
    refactor that moved ``_flip_state_to_closed`` ahead of the event
    append would break this test, even though the existing tests would
    still pass. The test injects a targeted ``append_event`` failure
    that triggers only for the ``closeout_succeeded`` event so the
    earlier ``closeout_requested`` (and any verification events) are
    still emitted normally — only the success-path event we care about
    gets the failure-injection.
    """
    _repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="ordering-invariant probe",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(_repo, "land work")

    real_append_event = close_session.append_event

    def selective_failure(*args, **kwargs):
        # close_session._emit_event calls ``append_event(session_set_dir,
        # event_type, session_number, **fields)`` positionally for the
        # first three args.
        event_type = args[1] if len(args) > 1 else kwargs.get("event_type")
        if event_type == "closeout_succeeded":
            raise RuntimeError("simulated closeout_succeeded write failure")
        return real_append_event(*args, **kwargs)

    monkeypatch.setattr(close_session, "append_event", selective_failure)

    args_ns = _ns(session_set_dir=str(set_dir))
    with pytest.raises(RuntimeError, match="simulated closeout_succeeded"):
        close_session.run(args_ns)

    # The snapshot must NOT have been flipped — ordering invariant.
    state = read_session_state(str(set_dir))
    assert state is not None
    assert state["lifecycleState"] == "work_in_progress", (
        f"expected lifecycleState=work_in_progress (un-flipped), got "
        f"{state.get('lifecycleState')!r} — closeout_succeeded must "
        f"land before _flip_state_to_closed is called"
    )
    assert state["status"] == "in-progress"
    assert state["completedAt"] is None

    # And no closeout_succeeded event landed.
    events = read_events(str(set_dir))
    assert not any(
        e.event_type == "closeout_succeeded" for e in events
    ), "closeout_succeeded event must not be in the ledger when its append raises"


def test_close_session_force_path_records_force_closed_marker(
    tmp_path: Path, monkeypatch,
):
    """Set 014 Session 1 (b) — Round 1 verifier follow-up: ``--force``
    propagates ``forced=True`` into ``_flip_state_to_closed``, so
    ``session-state.json`` records ``forceClosed: true`` (the forensic
    marker the VS Code Session Set Explorer reads to surface a
    ``[FORCED]`` badge). Set 9 Session 3 (D-2) defined this contract;
    Set 014's success-path flip must honor it.
    """
    _repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
    # ``--force`` accepts a missing disposition, but the env-var gate +
    # ``--reason-file`` are mandatory (Set 9 Session 3, D-2 hard-scoping).
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")

    reason_path = tmp_path / "force_reason.md"
    reason_path.write_text(
        "incident-recovery: synthetic exercise for forceClosed marker test",
        encoding="utf-8",
    )

    args = _ns(
        session_set_dir=str(set_dir),
        force=True,
        reason_file=str(reason_path),
    )
    outcome = close_session.run(args)
    assert outcome.result == "succeeded", outcome.messages

    state = read_session_state(str(set_dir))
    assert state is not None
    assert state.get("forceClosed") is True, (
        "session-state.json must record forceClosed=true on the --force "
        "path (Set 9 Session 3 D-2 forensic marker; Set 014 Round 1 fix)"
    )
    assert state["lifecycleState"] == "closed"
    assert state["status"] == "complete"


def test_close_session_succeeds_when_state_file_missing(
    tmp_path: Path, monkeypatch,
):
    """Set 014 Session 1 (b) — Round 1 verifier follow-up: when
    ``_flip_state_to_closed`` returns ``None`` (no state file to flip),
    close-out still reports ``succeeded`` and surfaces a warning
    message. The events ledger is the canonical record; the snapshot is
    a consumer-readable cache, so a missing snapshot is a soft warning,
    not a close-out failure.
    """
    _repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="missing-snapshot probe",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(_repo, "land work")

    # Force the helper to return None without removing the actual state
    # file (the gate may read it).
    import session_state
    monkeypatch.setattr(
        session_state, "_flip_state_to_closed",
        lambda *_a, **_kw: None,
    )

    outcome = close_session.run(_ns(session_set_dir=str(set_dir)))

    assert outcome.result == "succeeded", outcome.messages
    assert any(
        "no session-state.json found to flip" in m
        for m in outcome.messages
    ), (
        f"expected warning about missing snapshot, got "
        f"messages={outcome.messages}"
    )


def test_close_session_happy_path_no_repair_needed(tmp_path: Path):
    """Set 014 Session 1 (b): a follow-up ``--repair`` pass on a freshly
    closed set should report no drift — the main success path now flips
    the snapshot itself, so the ledger and the snapshot agree from the
    start (rather than after a manual repair step).
    """
    _repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="single-session happy path",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(_repo, "land work")

    # Main close-out.
    close_session.run(_ns(session_set_dir=str(set_dir)))

    # --repair --apply on the closed set should report no drift.
    repair_outcome = close_session.run(
        _ns(session_set_dir=str(set_dir), repair=True, apply=True),
    )
    # When the closed-set idempotency short-circuit fires, the result is
    # noop_already_closed — that itself proves the snapshot is at closed.
    # Otherwise, the repair walk runs and reports no drift.
    if repair_outcome.result == "noop_already_closed":
        return
    assert repair_outcome.result == "succeeded", repair_outcome.messages
    assert any(
        "no drift detected" in m for m in repair_outcome.messages
    ), (
        f"expected 'no drift detected', got messages={repair_outcome.messages}"
    )


# ---------------------------------------------------------------------------
# Test 2: multi-session-set end-to-end (the regression test for Set 013)
# ---------------------------------------------------------------------------

def test_close_session_multi_session_set_clean(tmp_path: Path):
    """Set 014 Session 1 end-to-end: a 2-session set closes cleanly with
    no manual event appends and no ``--repair`` calls.

    This is the regression test that proves Set 014 fixes Set 013's
    multi-session papercut. It exercises both fixes:

    * (a) — session 2's ``register_session_start`` auto-emits
      ``work_started`` for session 2 (no orchestrator-side manual append
      needed).
    * (b) — session 2's ``close_session`` success path flips the snapshot
      to ``closed`` without ``--repair`` (no orchestrator-side
      ``--repair --apply`` corrective step needed).

    If either fix regresses, the assertions on the events ledger or the
    snapshot will fail.
    """
    repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=2)

    # ---- Session 1 close-out ----
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="session 1 work",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push(repo, "land session 1 work")

    s1_outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
    assert s1_outcome.result == "succeeded", s1_outcome.messages
    s1_state = read_session_state(str(set_dir))
    assert s1_state is not None
    assert s1_state["lifecycleState"] == "closed", (
        "session 1 snapshot must be flipped to closed by the success path "
        "(Set 014 (b))"
    )

    # The events ledger has a session-1 work_started (manually emitted
    # by the test fixture's register_session_start call — Set 014 (a))
    # and a session-1 closeout_succeeded.
    events_after_s1 = read_events(str(set_dir))
    s1_work = [
        e for e in events_after_s1
        if e.event_type == "work_started" and e.session_number == 1
    ]
    s1_close = [
        e for e in events_after_s1
        if e.event_type == "closeout_succeeded" and e.session_number == 1
    ]
    assert len(s1_work) == 1, (
        "expected exactly one session-1 work_started event, got "
        f"{len(s1_work)}"
    )
    assert len(s1_close) == 1, (
        "expected exactly one session-1 closeout_succeeded event, got "
        f"{len(s1_close)}"
    )

    # ---- Session 2 starts ----
    # Critical: register_session_start MUST auto-emit work_started for
    # session 2 (Set 014 (a)). Without this, the close-out gate's
    # idempotency check would see session 1's CLOSED lifecycle state on
    # the highest-numbered session in the ledger (still 1, because the
    # session 2 work_started has not been appended) and short-circuit
    # close-out as ``noop_already_closed`` for session 2.
    register_session_start(
        session_set=str(set_dir),
        session_number=2,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )

    events_after_s2_start = read_events(str(set_dir))
    s2_work = [
        e for e in events_after_s2_start
        if e.event_type == "work_started" and e.session_number == 2
    ]
    assert len(s2_work) == 1, (
        "session 2 register_session_start must emit exactly one "
        f"work_started event, got {len(s2_work)} — Set 014 (a) regression"
    )
    # And the snapshot rolled back to in-progress for session 2.
    s2_state_started = read_session_state(str(set_dir))
    assert s2_state_started is not None
    assert s2_state_started["currentSession"] == 2
    assert s2_state_started["lifecycleState"] == "work_in_progress"
    assert s2_state_started["status"] == "in-progress"

    # ---- Session 2 close-out ----
    # Append a session-2 entry to activity-log.json (gate
    # ``activity_log_entry`` requires at least one entry per session).
    activity_log_path = set_dir / "activity-log.json"
    log_data = json.loads(activity_log_path.read_text(encoding="utf-8"))
    log_data["entries"].append({
        "sessionNumber": 2,
        "stepNumber": 1,
        "stepKey": "session-2/work",
        "dateTime": "2026-05-04T10:00:00-04:00",
        "description": "did session 2 work",
        "status": "complete",
        "routedApiCalls": [],
    })
    activity_log_path.write_text(
        json.dumps(log_data, indent=2), encoding="utf-8",
    )

    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="session 2 work",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    # change-log.md is the standard close-out artifact for the LAST
    # session of a set. The gate checks include a change-log presence
    # check, so we author one.
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 + Session 2 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(repo, "land session 2 work")

    s2_outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
    assert s2_outcome.result == "succeeded", s2_outcome.messages

    # The session 2 snapshot is flipped to closed without a --repair step.
    s2_state_after = read_session_state(str(set_dir))
    assert s2_state_after is not None
    assert s2_state_after["lifecycleState"] == "closed", (
        "session 2 snapshot must be flipped to closed by the success "
        "path (Set 014 (b))"
    )
    assert s2_state_after["status"] == "complete"
    assert s2_state_after["currentSession"] == 2

    # The events ledger has a session-2 closeout_succeeded.
    events_after_s2 = read_events(str(set_dir))
    s2_close = [
        e for e in events_after_s2
        if e.event_type == "closeout_succeeded" and e.session_number == 2
    ]
    assert len(s2_close) == 1, (
        "expected exactly one session-2 closeout_succeeded event, got "
        f"{len(s2_close)}"
    )
    # Lifecycle derivation lands at CLOSED on the highest session.
    assert current_lifecycle_state(events_after_s2) == (
        SessionLifecycleState.CLOSED
    )
