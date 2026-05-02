"""Unit tests for the Set 3 Session 1 close_session skeleton.

Coverage:
- CLI flag parsing (every flag accepted)
- ``--force --interactive`` and other invalid combinations rejected
- ``--apply`` requires ``--repair``
- ``--timeout`` must be positive
- JSON output shape is stable across exit codes
- ``--force`` bypass with no disposition.json present
- Idempotency: re-running on a closed set is exit 0 with ``noop_already_closed``
- Missing disposition.json without ``--force`` is exit 2
- ``--repair`` skeleton returns ``succeeded``
- ``closeout_requested`` / ``closeout_succeeded`` events are emitted

The conftest.py at this level adds ``ai_router/`` to ``sys.path`` so
``import close_session`` works without the dual-import shim.
"""

from __future__ import annotations

import io
import json
import os
import sys
from contextlib import redirect_stdout
from pathlib import Path
from typing import List

import pytest

import close_session
from close_session import (
    GateResult,
    RESULT_TO_EXIT_CODE,
    _build_parser,
    _validate_args,
    main,
    run,
)
from disposition import (
    Disposition,
    write_disposition,
)
from session_events import append_event, read_events
from session_state import register_session_start


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def session_set_dir(tmp_path: Path) -> str:
    """A bare session-set directory with spec.md but no state yet."""
    d = tmp_path / "test-set"
    d.mkdir()
    (d / "spec.md").write_text("# spec\n", encoding="utf-8")
    return str(d)


@pytest.fixture
def started_session_set(session_set_dir: str) -> str:
    """A session set with session 1 registered and ``work_started`` emitted.

    Mirrors the state immediately after Step 1 of the workflow runs:
    ``session-state.json`` exists, the events ledger has ``work_started``,
    no ``disposition.json`` yet.
    """
    register_session_start(
        session_set=session_set_dir,
        session_number=1,
        total_sessions=2,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    append_event(session_set_dir, "work_started", 1)
    return session_set_dir


@pytest.fixture
def started_with_disposition(started_session_set: str, monkeypatch) -> str:
    """A session set with a valid api-mode disposition.json present.

    These tests focus on the close-out *flow* (idempotency, JSON shape,
    event emission, lock acquisition) rather than gate-check
    correctness — the dedicated gate-check tests in
    ``test_gate_checks.py`` cover predicate behavior. We stub the gate
    runner to "all pass" so a happy-path flow test does not need to
    construct a real git repo with the right HEAD/upstream/working tree
    state.
    """
    disp = Disposition(
        status="completed",
        summary="session 1 work",
        verification_method="api",
        files_changed=["foo.py"],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    )
    write_disposition(started_session_set, disp)

    monkeypatch.setattr(
        close_session, "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )
    return started_session_set


# ---------------------------------------------------------------------------
# CLI parsing
# ---------------------------------------------------------------------------

def test_parser_accepts_every_documented_flag():
    parser = _build_parser()
    args = parser.parse_args([
        "--session-set-dir", "x",
        "--json",
        "--interactive",
        "--allow-empty-commit",
        "--reason-file", "reason.md",
        "--manual-verify",
        "--timeout", "30",
    ])
    assert args.session_set_dir == "x"
    assert args.json is True
    assert args.interactive is True
    assert args.allow_empty_commit is True
    assert args.reason_file == "reason.md"
    assert args.manual_verify is True
    assert args.timeout == 30


def test_parser_force_flag_independent():
    parser = _build_parser()
    args = parser.parse_args(["--force"])
    assert args.force is True
    assert args.repair is False


def test_parser_repair_apply_combination():
    parser = _build_parser()
    args = parser.parse_args(["--repair", "--apply"])
    assert args.repair is True
    assert args.apply is True


def test_parser_default_timeout():
    parser = _build_parser()
    args = parser.parse_args([])
    assert args.timeout == 60


# ---------------------------------------------------------------------------
# Combination validation
# ---------------------------------------------------------------------------

def _ns(**overrides):
    """Build a parsed-args namespace with every flag at its default."""
    parser = _build_parser()
    args = parser.parse_args([])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def test_validate_force_interactive_rejected():
    err = _validate_args(_ns(force=True, interactive=True))
    assert err is not None
    assert "force" in err and "interactive" in err


def test_validate_force_manual_verify_rejected():
    err = _validate_args(_ns(force=True, manual_verify=True))
    assert err is not None
    assert "force" in err and "manual" in err


def test_validate_force_repair_rejected():
    err = _validate_args(_ns(force=True, repair=True))
    assert err is not None


def test_validate_apply_without_repair_rejected():
    err = _validate_args(_ns(apply=True, repair=False))
    assert err is not None
    assert "repair" in err


def test_validate_negative_timeout_rejected():
    err = _validate_args(_ns(timeout=0))
    assert err is not None
    err = _validate_args(_ns(timeout=-1))
    assert err is not None


def test_validate_manual_verify_without_attestation_source_rejected():
    """``--manual-verify`` alone (no --interactive, no --reason-file) is
    a silent bypass — defeats the audit trail. Reject.
    """
    err = _validate_args(_ns(manual_verify=True))
    assert err is not None
    assert "manual-verify" in err


def test_validate_manual_verify_with_interactive_passes():
    assert _validate_args(_ns(manual_verify=True, interactive=True)) is None


def test_validate_manual_verify_with_reason_file_passes():
    assert _validate_args(
        _ns(manual_verify=True, reason_file="reason.md")
    ) is None


def test_validate_clean_args_pass():
    assert _validate_args(_ns()) is None


# ---------------------------------------------------------------------------
# run() outcomes
# ---------------------------------------------------------------------------

def test_invalid_invocation_returns_exit_2(started_session_set):
    args = _ns(force=True, interactive=True, session_set_dir=started_session_set)
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2


def test_missing_session_set_dir_returns_exit_2(tmp_path):
    args = _ns(session_set_dir=str(tmp_path / "nonexistent"))
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any("does not exist" in m for m in outcome.messages)


def test_missing_disposition_without_force_returns_exit_2(started_session_set):
    """A session set with no disposition.json refuses to close out."""
    args = _ns(session_set_dir=started_session_set)
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert any("disposition.json" in m for m in outcome.messages)


def test_force_bypass_without_disposition(
    started_session_set, tmp_path, monkeypatch
):
    """``--force`` accepts a missing disposition once the hard-scope
    gates pass (Set 9 Session 3, D-2: env-var + --reason-file).
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "incident-recovery: gate stuck on stale push lockfile\n",
        encoding="utf-8",
    )
    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert outcome.exit_code == 0
    # Force emits a loud WARNING (no longer a DEPRECATION line) so the
    # operator sees the gate was bypassed even when --json hides
    # outcome.messages inside the JSON payload.
    assert any("WARNING" in m and "force" in m.lower() for m in outcome.messages)
    # And the gate-results list is empty under force.
    assert outcome.gate_results == []
    # The forensic ``closeout_force_used`` event landed in the ledger
    # alongside ``closeout_requested`` / ``closeout_succeeded``.
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_force_used" in events
    # And it carries the operator's reason as a payload field.
    force_events = [
        e for e in read_events(started_session_set)
        if e.event_type == "closeout_force_used"
    ]
    assert len(force_events) == 1
    assert "stale push lockfile" in force_events[0].fields["reason"]


def test_force_rejected_without_env_var(started_session_set, tmp_path, monkeypatch):
    """Without ``AI_ROUTER_ALLOW_FORCE_CLOSE_OUT=1``, ``--force`` exits 2.

    The env-var gate fires before any state mutation: no events are
    written, ``acquire_lock`` is never called, and no lock file lands
    on disk. A normal terminal session that does not have the variable
    exported will fail loudly on accidental ``--force`` invocations.

    Spy assertion (primary): ``acquire_lock`` is monkeypatched to a
    counter and we verify it was never invoked. Spying directly catches
    a regression where the lock is acquired and then released before
    the ``invalid_invocation`` return — a code path that leaves no
    file behind but that would still represent a pre-mutation contract
    violation. The on-disk absence check below is the secondary
    assertion (weaker but defensive — covers the case where the spy
    is wrong about which acquire_lock symbol matters).
    """
    monkeypatch.delenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", raising=False)
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")

    acquire_calls: List[tuple] = []
    real_acquire = close_session.acquire_lock

    def _spy_acquire(*args, **kwargs):
        acquire_calls.append((args, kwargs))
        return real_acquire(*args, **kwargs)

    monkeypatch.setattr(close_session, "acquire_lock", _spy_acquire)

    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any(
        "AI_ROUTER_ALLOW_FORCE_CLOSE_OUT" in m for m in outcome.messages
    )
    # Primary: acquire_lock was never invoked.
    assert acquire_calls == [], (
        "acquire_lock must not be called when --force validation rejects"
    )
    # No ledger events were emitted because validation fired before lock.
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_requested" not in events
    assert "closeout_force_used" not in events
    # Secondary defensive check: no lock file landed on disk.
    from close_lock import LOCK_FILENAME
    lock_path = os.path.join(started_session_set, LOCK_FILENAME)
    assert not os.path.exists(lock_path), (
        "rejected --force must not have acquired the close-out lock"
    )


def test_force_rejected_with_non_one_env_var(
    started_session_set, tmp_path, monkeypatch
):
    """Values like ``"true"``, ``"yes"``, ``"0"``, or ``""`` are rejected.

    The opt-in token is exactly ``"1"`` — anything else trips the gate.
    A loose check (e.g. truthy-ness) would let a stale ``=0`` in a
    process-environment template silently accept ``--force``, which is
    exactly the footgun the hard-scope is meant to close.
    """
    reason_path = tmp_path / "reason.md"
    reason_path.write_text("test reason\n", encoding="utf-8")
    for bad_value in ("0", "true", "yes", "", "TRUE"):
        monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", bad_value)
        args = _ns(
            session_set_dir=started_session_set,
            force=True,
            reason_file=str(reason_path),
        )
        outcome = run(args)
        assert outcome.result == "invalid_invocation", (
            f"value {bad_value!r} should be rejected"
        )


def test_force_rejected_without_reason_file(
    started_session_set, monkeypatch
):
    """``--force`` without ``--reason-file`` exits 2 even with the env var.

    The reason becomes the ``closeout_force_used`` event's payload, so
    refusing the silent-bypass case keeps the forensic audit trail
    honest. (Mirrors the ``--manual-verify`` contract.)

    Spy assertion (primary): same pattern as ``test_force_rejected_
    without_env_var`` — monkeypatch ``acquire_lock`` to a counter and
    verify it was never invoked. The on-disk absence check is the
    secondary defensive assertion.
    """
    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")

    acquire_calls: List[tuple] = []
    real_acquire = close_session.acquire_lock

    def _spy_acquire(*args, **kwargs):
        acquire_calls.append((args, kwargs))
        return real_acquire(*args, **kwargs)

    monkeypatch.setattr(close_session, "acquire_lock", _spy_acquire)

    args = _ns(session_set_dir=started_session_set, force=True)
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any("--reason-file" in m for m in outcome.messages)
    # Primary: acquire_lock was never invoked.
    assert acquire_calls == [], (
        "acquire_lock must not be called when --force validation rejects"
    )
    events = [e.event_type for e in read_events(started_session_set)]
    assert "closeout_force_used" not in events
    # Secondary defensive check: no lock file appears on disk.
    from close_lock import LOCK_FILENAME
    lock_path = os.path.join(started_session_set, LOCK_FILENAME)
    assert not os.path.exists(lock_path), (
        "rejected --force must not have acquired the close-out lock"
    )


def test_force_cli_happy_path_emits_all_artifacts_together(
    started_session_set, tmp_path, monkeypatch
):
    """Set 9 Session 3 (D-2): single end-to-end test for the operator
    path — drive ``close_session.run`` with ``--force`` AND then
    ``mark_session_complete`` (matching what the orchestrator's force-
    close-out flow actually does), and assert every required artifact
    lands together:

    1. A WARNING line in ``outcome.messages``.
    2. Exactly one ``closeout_force_used`` event with the operator's
       reason as a payload field.
    3. ``session-state.json`` carries ``forceClosed: true`` after the
       snapshot flip.

    Splitting these assertions across two layer-specific tests
    (``run()`` vs ``mark_session_complete``) leaves a coverage hole
    where the layers could individually pass while the combined
    operator artifact is missing or scrambled. This test closes that
    hole by exercising both layers in the exact order the
    orchestrator runs them.
    """
    from session_state import (
        mark_session_complete,
        read_session_state,
    )

    monkeypatch.setenv("AI_ROUTER_ALLOW_FORCE_CLOSE_OUT", "1")
    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "incident-recovery: gate stuck on stale upstream marker\n",
        encoding="utf-8",
    )

    # Stub the gate to deliberate failures so force=True actually
    # matters — without failures the bypass adds no forensic value
    # and forceClosed stays False.
    monkeypatch.setattr(
        close_session, "run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check="working_tree_clean", passed=False, remediation="dirty"),
            GateResult(check="pushed_to_remote", passed=False, remediation="not pushed"),
        ],
    )

    # Layer 1: close_session.run owns the WARNING line + the
    # ``closeout_force_used`` event from the CLI path.
    args = _ns(
        session_set_dir=started_session_set,
        force=True,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert any("WARNING" in m and "force" in m.lower() for m in outcome.messages)

    # Layer 2: mark_session_complete owns the snapshot flip + the
    # forceClosed flag.
    mark_session_complete(
        started_session_set,
        verification_verdict="VERIFIED",
        force=True,
    )

    # Combined invariants — every artifact present.
    state = read_session_state(started_session_set)
    assert state["forceClosed"] is True

    events = read_events(started_session_set)
    force_used = [e for e in events if e.event_type == "closeout_force_used"]
    # Two events expected: one from close_session.run (CLI path,
    # carries ``reason``), one from mark_session_complete
    # (snapshot-flip path, carries ``failed_checks``). Both signal
    # the same incident; the distinct payloads make each origin
    # forensically traceable.
    assert len(force_used) == 2
    cli_event = next(e for e in force_used if "reason" in e.fields)
    assert "stale upstream marker" in cli_event.fields["reason"]
    flip_event = next(e for e in force_used if "failed_checks" in e.fields)
    assert flip_event.fields["failed_checks"] == [
        "working_tree_clean",
        "pushed_to_remote",
    ]


def test_force_force_closed_flag_written_via_mark_session_complete(
    tmp_path, monkeypatch
):
    """``mark_session_complete(force=True)`` writes ``forceClosed: true``.

    The CLI emits the ``closeout_force_used`` event from
    ``close_session.run``; the snapshot flip happens via
    ``mark_session_complete``. The forensic flag in
    ``session-state.json`` is the bridge the VS Code Session Set
    Explorer reads — without it, a force-closed set looks
    indistinguishable from a normally-closed one in the tree view.
    """
    from session_state import (
        mark_session_complete,
        register_session_start,
        read_session_state,
    )
    set_dir = tmp_path / "set"
    set_dir.mkdir()
    register_session_start(
        session_set=str(set_dir),
        session_number=1,
        total_sessions=1,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    # Stub the gate to a deliberate failure so force=True actually
    # matters — without a failure the bypass adds no forensic value
    # and forceClosed stays False (this is the documented behavior in
    # mark_session_complete: forced=True is recorded only when the
    # bypass actually fires).
    monkeypatch.setattr(
        close_session, "run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check="working_tree_clean", passed=False, remediation="dirty"),
        ],
    )
    mark_session_complete(
        str(set_dir),
        verification_verdict="VERIFIED",
        force=True,
    )
    state = read_session_state(str(set_dir))
    assert state["forceClosed"] is True
    # And a closeout_force_used event landed alongside closeout_succeeded.
    events = [e.event_type for e in read_events(str(set_dir))]
    assert "closeout_succeeded" in events
    assert "closeout_force_used" in events


def test_happy_path_skeleton_succeeds(started_with_disposition):
    """With disposition present and stub gates passing, exit 0."""
    args = _ns(session_set_dir=started_with_disposition)
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert outcome.exit_code == 0
    # All five named gates appear in the output (shape stability).
    assert {g.check for g in outcome.gate_results} == {
        "working_tree_clean",
        "pushed_to_remote",
        "activity_log_entry",
        "next_orchestrator_present",
        "change_log_fresh",
    }
    assert all(g.passed for g in outcome.gate_results)


def test_happy_path_emits_closeout_events(started_with_disposition):
    """closeout_requested + closeout_succeeded land in the events ledger."""
    args = _ns(session_set_dir=started_with_disposition)
    outcome = run(args)
    assert "closeout_requested" in outcome.events_emitted
    assert "closeout_succeeded" in outcome.events_emitted
    # And they're durable on disk.
    events_on_disk = [
        e.event_type for e in read_events(started_with_disposition)
    ]
    assert "closeout_requested" in events_on_disk
    assert "closeout_succeeded" in events_on_disk


def test_idempotent_noop_on_already_closed(started_with_disposition):
    """A set with a ``closeout_succeeded`` event is a no-op on re-run."""
    # First run flips the set to ``closed``.
    args = _ns(session_set_dir=started_with_disposition)
    first = run(args)
    assert first.result == "succeeded"

    # Second run should be a noop.
    second = run(_ns(session_set_dir=started_with_disposition))
    assert second.result == "noop_already_closed"
    assert second.exit_code == 0
    # Idempotency means we did NOT emit another closeout_requested.
    assert "closeout_requested" not in second.events_emitted


def test_repair_skeleton_succeeds(started_session_set):
    """``--repair`` short-circuits the gate flow and returns ``succeeded``."""
    args = _ns(session_set_dir=started_session_set, repair=True)
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert outcome.exit_code == 0
    # Skeleton repair never detects drift; with --apply on, also succeeds.
    args2 = _ns(
        session_set_dir=started_session_set, repair=True, apply=True,
    )
    outcome2 = run(args2)
    assert outcome2.result == "succeeded"


# ---------------------------------------------------------------------------
# main() / output emission
# ---------------------------------------------------------------------------

def test_main_returns_exit_code(started_with_disposition):
    rc = main([
        "--session-set-dir", started_with_disposition,
    ])
    assert rc == 0


def test_main_json_output_is_parseable(started_with_disposition):
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = main([
            "--session-set-dir", started_with_disposition,
            "--json",
        ])
    assert rc == 0
    payload = json.loads(buf.getvalue())
    # Required keys per the documented JSON shape.
    assert payload["result"] == "succeeded"
    assert payload["exit_code"] == 0
    assert payload["session_set_dir"].endswith("test-set")
    assert isinstance(payload["messages"], list)
    assert isinstance(payload["gate_results"], list)
    assert "verification" in payload
    assert isinstance(payload["events_emitted"], list)


def test_main_json_invalid_invocation_keeps_shape(tmp_path):
    """Even on exit 2, the JSON object has every documented top-level key."""
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = main([
            "--session-set-dir", str(tmp_path / "nonexistent"),
            "--json",
        ])
    assert rc == 2
    payload = json.loads(buf.getvalue())
    assert payload["result"] == "invalid_invocation"
    assert payload["exit_code"] == 2
    for key in (
        "session_set_dir",
        "session_number",
        "messages",
        "gate_results",
        "verification",
        "events_emitted",
    ):
        assert key in payload


def test_reason_file_text_lands_in_closeout_requested_event(
    started_with_disposition, tmp_path
):
    """``--reason-file`` contents are captured in the closeout_requested payload."""
    reason_path = tmp_path / "reason.md"
    reason_path.write_text(
        "operator note: closing 003-session-1 after pytest green\n",
        encoding="utf-8",
    )
    args = _ns(
        session_set_dir=started_with_disposition,
        reason_file=str(reason_path),
    )
    outcome = run(args)
    assert outcome.result == "succeeded"

    # Verify the reason landed in the event ledger.
    events = read_events(started_with_disposition)
    requested = [e for e in events if e.event_type == "closeout_requested"]
    assert len(requested) == 1
    assert requested[0].fields.get("reason") == (
        "operator note: closing 003-session-1 after pytest green"
    )


def test_unreadable_reason_file_returns_invalid_invocation(
    started_with_disposition, tmp_path
):
    """A missing --reason-file path yields exit 2 with a clear message."""
    args = _ns(
        session_set_dir=started_with_disposition,
        reason_file=str(tmp_path / "does-not-exist.md"),
    )
    outcome = run(args)
    assert outcome.result == "invalid_invocation"
    assert outcome.exit_code == 2
    assert any("--reason-file" in m for m in outcome.messages)


def test_gate_failure_emits_closeout_failed_event(
    started_with_disposition, monkeypatch
):
    """A failing gate surfaces gate_failed and emits closeout_failed."""
    failing = [
        GateResult(
            check="working_tree_clean",
            passed=False,
            remediation="commit your changes",
        ),
    ]
    # Monkeypatch the gate runner so the rest of the flow is exercised
    # end-to-end against the real session-set fixture (events ledger
    # is real, idempotency is real).
    monkeypatch.setattr(
        close_session, "_run_gate_checks",
        lambda *_a, **_kw: failing,
    )

    args = _ns(session_set_dir=started_with_disposition)
    outcome = run(args)

    assert outcome.result == "gate_failed"
    assert outcome.exit_code == 1
    assert "closeout_requested" in outcome.events_emitted
    assert "closeout_failed" in outcome.events_emitted
    assert "closeout_succeeded" not in outcome.events_emitted

    events_on_disk = [e.event_type for e in read_events(started_with_disposition)]
    assert "closeout_failed" in events_on_disk

    # And the failed-check name is in the event payload, so an auditor
    # walking the ledger can see what tripped without re-running the
    # gates.
    failed_event = [
        e for e in read_events(started_with_disposition)
        if e.event_type == "closeout_failed"
    ][0]
    assert failed_event.fields.get("failed_checks") == ["working_tree_clean"]


def test_events_emitted_with_session_zero_when_state_file_absent(
    session_set_dir, tmp_path, monkeypatch,
):
    """A set with disposition but no session-state.json defaults events to session 0."""
    # Build the disposition without ever calling register_session_start —
    # that's the failure-mode shape (state file pruned or never written
    # but disposition still landed).
    disp = Disposition(
        status="completed",
        summary="session work",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=None,
        blockers=[],
    )
    write_disposition(session_set_dir, disp)

    # Real gate checks would fail without git/state; this test cares
    # about session_number defaulting, not gate correctness.
    monkeypatch.setattr(
        close_session, "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )

    args = _ns(session_set_dir=session_set_dir)
    outcome = run(args)
    assert outcome.result == "succeeded"
    assert outcome.session_number is None  # nothing to peek at

    events = read_events(session_set_dir)
    assert len(events) == 2  # closeout_requested, closeout_succeeded
    assert all(e.session_number == 0 for e in events)


def test_result_to_exit_code_table_complete():
    """Every result string maps to an exit code."""
    expected = {
        "succeeded": 0,
        "noop_already_closed": 0,
        "gate_failed": 1,
        "invalid_invocation": 2,
        "lock_contention": 3,
        "verification_timeout": 4,
        "repair_drift": 5,
    }
    assert RESULT_TO_EXIT_CODE == expected
