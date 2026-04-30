"""Set 3 Session 4 — ``--manual-verify``, ``--repair``, full integration.

Three test groups:

1. **``--manual-verify`` event emission and validation.** Beyond Session 3's
   "the queue wait is bypassed" check, Session 4 owns the attestation
   audit trail: a ``verification_completed`` event with
   ``method=manual`` and the operator's attestation text must land in
   ``session-events.jsonl``. Also covers the validation rule that
   ``--manual-verify`` requires either ``--interactive`` or
   ``--reason-file`` (no silent bypass) and rejects empty attestations.

2. **``--repair`` drift detection and ``--apply`` correction.** The
   four drift cases from ``_run_repair`` docs: state-says-closed-but-
   no-event, event-says-closed-but-state-not-flipped, stranded
   mid-closeout, and disposition-references-missing-queue-message.
   Each is exercised with both diagnostic (default) and ``--apply``
   modes so the idempotency story is visible.

3. **Four end-to-end scenarios from the Set 3 acceptance criteria.**
   Outsource-first happy path, outsource-last happy path, bootstrapping
   recovery via ``--repair --apply``, and ``--manual-verify`` skipping
   the queue. Sessions 1-3 already covered the first two at the unit
   level; here they run as the integration scenarios the spec calls
   out (clean fixture → run close_session → assert end state).

The fixture in this file matches the Session 3 wait fixture (real git
repo + bare remote so the deterministic gates pass) so test data
stays comparable across files.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import List, Optional

import pytest

import close_session
from disposition import Disposition, write_disposition
from queue_db import QueueDB
from session_events import (
    SessionLifecycleState,
    append_event,
    current_lifecycle_state,
    read_events,
)
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    mark_session_complete,
    read_session_state,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Helpers (mirrored from test_close_session_verification_wait.py — kept local
# so the two test files don't develop a fixture-sharing coupling)
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
            specifics="stay on opus for the heavy lifting",
        ),
    )


@pytest.fixture
def closeable_set(tmp_path: Path) -> Path:
    """Real git repo + bare remote + session 1-of-2, ready for close-out."""
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
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "test-set",
            "createdDate": "2026-04-30T00:00:00-04:00",
            "totalSessions": 2,
            "entries": [{
                "sessionNumber": 1,
                "stepNumber": 1,
                "stepKey": "session-1/work",
                "dateTime": "2026-04-30T01:00:00-04:00",
                "description": "did work",
                "status": "complete",
                "routedApiCalls": [],
            }],
        }, indent=2),
        encoding="utf-8",
    )
    return set_dir


def _commit_and_push_set(set_dir: Path) -> None:
    repo_root = set_dir
    while not (repo_root / ".git").exists():
        repo_root = repo_root.parent
    _git(repo_root, "add", "-A")
    _git(repo_root, "commit", "-m", "land work")
    _git(repo_root, "push", "origin", "main")


def _enqueue(queue_dir: Path, provider: str, *, idempotency_key: str) -> str:
    qdb = QueueDB(provider=provider, base_dir=str(queue_dir))
    return qdb.enqueue(
        from_provider="orchestrator",
        task_type="session-verification",
        payload={"task_type": "session-verification", "content": "x"},
        idempotency_key=idempotency_key,
    )


# ===========================================================================
# Group 1: ``--manual-verify`` event emission and validation
# ===========================================================================

def test_manual_verify_emits_attestation_event(
    closeable_set: Path, tmp_path: Path,
):
    """``--manual-verify --reason-file`` lands the operator's attestation
    in the events ledger as a ``verification_completed`` with
    ``method=manual``.
    """
    queue_dir = tmp_path / "queues"
    mid = _enqueue(queue_dir, "gpt-5-4-mini", idempotency_key="m1")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="manually-verified",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "verified out-of-band via paired live walkthrough on 2026-04-30",
        encoding="utf-8",
    )

    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
        reason_file=str(reason_path),
        timeout=1,
    )
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        sleep=lambda _s: pytest.fail(
            "manual-verify must not enter queue wait"
        ),
    )

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "manual"

    events = read_events(str(closeable_set))
    manual_completed = [
        e for e in events
        if e.event_type == "verification_completed"
        and e.fields.get("method") == "manual"
    ]
    assert len(manual_completed) == 1, (
        "expected exactly one manual verification_completed event"
    )
    assert manual_completed[0].fields.get("attestation") == reason_path.read_text(
        encoding="utf-8",
    )
    assert manual_completed[0].fields.get("verdict") == "manual_attestation"


def test_manual_verify_interactive_prompts_for_attestation(
    closeable_set: Path, tmp_path: Path,
):
    """``--manual-verify --interactive`` (no reason file) prompts on stdin
    and the prompted text becomes the attestation.
    """
    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="manually-verified",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    captured_prompts: List[str] = []

    def fake_prompt(message: str) -> str:
        captured_prompts.append(message)
        return "verified live by the human at 2026-04-30T17:00Z"

    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
        interactive=True,
    )
    outcome = close_session.run(args, prompt_fn=fake_prompt)

    assert outcome.result == "succeeded", outcome.messages
    assert len(captured_prompts) == 1
    assert "attestation" in captured_prompts[0].lower()

    events = read_events(str(closeable_set))
    request = next(
        e for e in events if e.event_type == "closeout_requested"
    )
    # Reason came from the prompt rather than a file, so it lands as
    # manual_attestation rather than reason on the request event.
    assert request.fields.get("manual_attestation") == (
        "verified live by the human at 2026-04-30T17:00Z"
    )


def test_manual_verify_requires_attestation_source(closeable_set: Path):
    """``--manual-verify`` without ``--interactive`` or ``--reason-file``
    is invalid invocation — silent bypass would defeat the audit trail.
    """
    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
    )
    outcome = close_session.run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any(
        "--manual-verify requires" in m for m in outcome.messages
    )


def test_manual_verify_empty_attestation_rejected(
    closeable_set: Path, tmp_path: Path,
):
    """Empty / aborted attestation is invalid invocation."""
    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="manually-verified",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))

    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
        interactive=True,
    )
    # Operator hits Enter without typing anything.
    outcome = close_session.run(args, prompt_fn=lambda _msg: "")

    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any(
        "non-empty attestation" in m for m in outcome.messages
    )


# ===========================================================================
# Group 2: ``--repair`` drift detection and ``--apply`` correction
# ===========================================================================

def test_repair_no_drift_clean_session(closeable_set: Path):
    """A freshly-started, never-closed session has no drift to report."""
    args = _ns(session_set_dir=str(closeable_set), repair=True)
    outcome = close_session.run(args)
    assert outcome.result == "succeeded"
    assert any("no drift detected" in m for m in outcome.messages)


def test_repair_detects_state_says_closed_but_no_event(
    closeable_set: Path,
):
    """Bootstrapping drift: state.json shows complete/closed but the
    events ledger has no ``closeout_succeeded``. Diagnostic mode reports
    drift; ``--apply`` appends synthetic events so the ledger and the
    snapshot agree.
    """
    # Simulate the old close-out path: orchestrator wrote
    # session-state.json complete but never emitted the closeout
    # ledger trio.
    mark_session_complete(str(closeable_set), verification_verdict="VERIFIED")

    # Diagnostic: drift surfaces, exit 5, ledger untouched.
    args = _ns(session_set_dir=str(closeable_set), repair=True)
    outcome = close_session.run(args)
    assert outcome.result == "repair_drift"
    assert outcome.exit_code == 5
    assert any(
        "session-state.json reports closed/complete" in m
        for m in outcome.messages
    )
    events_before = read_events(str(closeable_set))
    assert not any(
        e.event_type == "closeout_succeeded" for e in events_before
    )

    # --apply: ledger gets the synthetic events.
    args2 = _ns(
        session_set_dir=str(closeable_set), repair=True, apply=True,
    )
    outcome2 = close_session.run(args2)
    assert outcome2.result == "succeeded"
    events_after = read_events(str(closeable_set))
    repaired_succeeded = [
        e for e in events_after
        if e.event_type == "closeout_succeeded"
        and e.fields.get("repaired") is True
    ]
    assert len(repaired_succeeded) == 1
    assert (
        repaired_succeeded[0].fields.get("repair_reason")
        == "state_says_closed_but_no_closeout_event"
    )

    # Idempotent: a second --apply pass has nothing more to do.
    outcome3 = close_session.run(args2)
    assert outcome3.result == "succeeded"
    assert any(
        "no drift detected" in m for m in outcome3.messages
    )


def test_repair_detects_event_says_closed_but_state_lagging(
    closeable_set: Path,
):
    """Inverse drift: events ledger shows ``closeout_succeeded`` but
    ``session-state.json`` is still at ``work_in_progress``. ``--apply``
    flips the snapshot.
    """
    # Append the closeout trio but leave session-state.json untouched.
    append_event(
        str(closeable_set), "closeout_requested", 1,
    )
    append_event(
        str(closeable_set), "closeout_succeeded", 1,
    )

    state_before = read_session_state(str(closeable_set)) or {}
    assert state_before.get("status") == "in-progress"

    # Diagnostic.
    args = _ns(session_set_dir=str(closeable_set), repair=True)
    outcome = close_session.run(args)
    assert outcome.result == "repair_drift"
    assert any(
        "session-state.json is not flipped" in m for m in outcome.messages
    )

    # --apply.
    args2 = _ns(
        session_set_dir=str(closeable_set), repair=True, apply=True,
    )
    outcome2 = close_session.run(args2)
    assert outcome2.result == "succeeded"
    state_after = read_session_state(str(closeable_set)) or {}
    assert state_after.get("status") == "complete"
    assert state_after.get("lifecycleState") == "closed"


def test_repair_reports_stranded_mid_closeout(closeable_set: Path):
    """``closeout_requested`` without a terminal companion → stranded.
    Reported, but ``--apply`` does NOT re-run the gate (that's the
    reconciler's job). Drift remains on a follow-up pass.
    """
    append_event(str(closeable_set), "closeout_requested", 1)

    args = _ns(session_set_dir=str(closeable_set), repair=True)
    outcome = close_session.run(args)
    assert outcome.result == "repair_drift"
    assert any(
        "closeout did not reach a terminal state" in m
        for m in outcome.messages
    )

    # --apply: still drift, repair declines to re-run the gate.
    args2 = _ns(
        session_set_dir=str(closeable_set), repair=True, apply=True,
    )
    outcome2 = close_session.run(args2)
    # Stranded mid-closeout cannot be safely auto-resolved by repair —
    # it stays in the messages list but the result becomes succeeded
    # because there are no apply-eligible cases left.
    assert any(
        "closeout did not reach a terminal state" in m
        for m in outcome2.messages
    )


def test_repair_reports_missing_queue_messages(
    closeable_set: Path, tmp_path: Path,
):
    """A disposition that references a queue message id absent from
    every provider queue is reported as drift; repair declines to
    auto-fix because verifier verdicts can't be synthesized.
    """
    queue_dir = tmp_path / "queues"
    # Create the queue dir but enqueue against a different id than the
    # one we put in the disposition.
    real_mid = _enqueue(queue_dir, "gpt-5-4-mini", idempotency_key="real")
    fake_mid = "msg-does-not-exist-anywhere"

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="phantom-message",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[fake_mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))

    args = _ns(session_set_dir=str(closeable_set), repair=True)
    outcome = close_session.run(args, queue_base_dir=str(queue_dir))
    assert outcome.result == "repair_drift"
    assert any(
        fake_mid in m and "do not resolve" in m
        for m in outcome.messages
    )

    # --apply: repair refuses to fabricate a verdict.
    args2 = _ns(
        session_set_dir=str(closeable_set), repair=True, apply=True,
    )
    outcome2 = close_session.run(args2, queue_base_dir=str(queue_dir))
    assert any(
        "Auto-repair declined" in m for m in outcome2.messages
    )

    # Sanity: repair never opened the real (unrelated) message.
    qdb = QueueDB(provider="gpt-5-4-mini", base_dir=str(queue_dir))
    real_msg = qdb.get_message(real_mid)
    assert real_msg is not None
    assert real_msg.state == "new"


def test_repair_apply_without_repair_rejected(closeable_set: Path):
    """Already covered at the validation layer in skeleton tests; this
    is the end-to-end form."""
    args = _ns(session_set_dir=str(closeable_set), apply=True)
    outcome = close_session.run(args)
    assert outcome.result == "invalid_invocation"
    assert any("--apply requires --repair" in m for m in outcome.messages)


# ===========================================================================
# Group 3: Four end-to-end scenarios from the Set 3 acceptance criteria
# ===========================================================================

def test_e2e_outsource_first_happy_path(closeable_set: Path):
    """Scenario 1 — outsource-first: api method → close-out passes
    gates → session is closed on the events ledger.
    """
    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="api-verified happy path",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    args = _ns(session_set_dir=str(closeable_set))
    outcome = close_session.run(args)

    assert outcome.result == "succeeded"
    assert outcome.exit_code == 0
    assert outcome.verification_method == "api"
    assert all(g.passed for g in outcome.gate_results)

    events = read_events(str(closeable_set))
    assert current_lifecycle_state(events) == SessionLifecycleState.CLOSED


def test_e2e_outsource_last_happy_path(
    closeable_set: Path, tmp_path: Path,
):
    """Scenario 2 — outsource-last: queue method → verifier completes
    during the wait → close-out unblocks → gates pass → session closed.
    """
    queue_dir = tmp_path / "queues"
    mid = _enqueue(queue_dir, "gpt-5-4-mini", idempotency_key="e2e")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="queue-verified happy path",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    qdb = QueueDB(provider="gpt-5-4-mini", base_dir=str(queue_dir))
    poll = {"n": 0}

    def fake_sleep(_seconds: float) -> None:
        poll["n"] += 1
        if poll["n"] == 1:
            qdb.claim(worker_id="verifier-daemon")
        elif poll["n"] == 2:
            qdb.complete(mid, "verifier-daemon", {"verdict": "VERIFIED"})

    args = _ns(session_set_dir=str(closeable_set), timeout=5)
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        poll_interval_seconds=0.001,
        sleep=fake_sleep,
    )

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "queue"
    assert outcome.verification_wait_outcome == "completed"

    events = read_events(str(closeable_set))
    assert current_lifecycle_state(events) == SessionLifecycleState.CLOSED


def test_e2e_bootstrapping_recovery_via_repair_apply(
    closeable_set: Path,
):
    """Scenario 3 — a session got stranded because the legacy close-out
    path wrote ``session-state.json: complete`` without emitting the
    events trio. ``--repair --apply`` brings the ledger into agreement
    so the reconciler / dashboards stop treating the set as stranded.
    """
    # Legacy close-out: state-only, no events.
    mark_session_complete(str(closeable_set), verification_verdict="VERIFIED")
    events_before = read_events(str(closeable_set))
    assert not any(
        e.event_type == "closeout_succeeded" for e in events_before
    )

    args = _ns(
        session_set_dir=str(closeable_set), repair=True, apply=True,
    )
    outcome = close_session.run(args)
    assert outcome.result == "succeeded"

    events_after = read_events(str(closeable_set))
    assert current_lifecycle_state(events_after) == SessionLifecycleState.CLOSED
    repair_events = [
        e for e in events_after if e.fields.get("repaired") is True
    ]
    assert {e.event_type for e in repair_events} == {
        "closeout_requested", "closeout_succeeded",
    }


def test_e2e_manual_verify_skips_queue_gate_runs_session_closes(
    closeable_set: Path, tmp_path: Path,
):
    """Scenario 4 — ``--manual-verify`` skips the queue, gate still
    runs, session closes via the events ledger.
    """
    queue_dir = tmp_path / "queues"
    # Stranded message: would block forever in queue mode, must be
    # bypassed here.
    mid = _enqueue(queue_dir, "gpt-5-4-mini", idempotency_key="m2")

    write_disposition(str(closeable_set), Disposition(
        status="completed",
        summary="manual override",
        verification_method="queue",
        files_changed=[],
        verification_message_ids=[mid],
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _commit_and_push_set(closeable_set)

    reason_path = tmp_path / "manual-attest.md"
    reason_path.write_text(
        "verified out-of-band; queue path was unavailable",
        encoding="utf-8",
    )

    args = _ns(
        session_set_dir=str(closeable_set),
        manual_verify=True,
        reason_file=str(reason_path),
        timeout=1,
    )
    outcome = close_session.run(
        args,
        queue_base_dir=str(queue_dir),
        # Asserts the queue wait is never entered.
        sleep=lambda _s: pytest.fail(
            "manual-verify must not enter queue wait"
        ),
    )

    assert outcome.result == "succeeded", outcome.messages
    assert outcome.verification_method == "manual"
    assert all(g.passed for g in outcome.gate_results)

    events = read_events(str(closeable_set))
    assert current_lifecycle_state(events) == SessionLifecycleState.CLOSED
    manual_events = [
        e for e in events
        if e.event_type == "verification_completed"
        and e.fields.get("method") == "manual"
    ]
    assert len(manual_events) == 1
