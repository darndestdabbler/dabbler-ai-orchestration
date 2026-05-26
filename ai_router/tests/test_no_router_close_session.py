"""Unit tests for --no-router close_session behavior.

Set 048 Session 2 §3.1 A3 + §3.5: close_session.run() under --no-router
mode short-circuits routed verification (records method="manual" with
a stock attestation) AND fires a soft gate when external-verification.md
is missing.

The soft gate:
  * --accept-suggestions OR non-TTY → stderr warning + proceed
  * Interactive TTY → "[y/N]" prompt; "y" proceeds, anything else aborts
"""
from __future__ import annotations

from pathlib import Path

import pytest

import close_session
import runtime_mode
from close_session import (
    GateResult,
    _build_parser,
    run,
)
from disposition import (
    Disposition,
    write_disposition,
)
from runtime_mode import ENV_VAR_NAME
from session_events import append_event, read_events
from session_state import register_session_start


# ---------- shared fixtures ----------


@pytest.fixture(autouse=True)
def _reset_runtime_mode(monkeypatch):
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    runtime_mode.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()


@pytest.fixture
def started_set(tmp_path: Path, monkeypatch) -> str:
    """Session-set fixture with S1 registered, gates stubbed to pass."""
    d = tmp_path / "test-set"
    d.mkdir()
    (d / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntier: lightweight\nrequiresUAT: false\n```\n",
        encoding="utf-8",
    )
    register_session_start(
        session_set=str(d),
        session_number=1,
        total_sessions=1,
        orchestrator_engine="claude-code",
        orchestrator_model="claude-opus-4-7",
        orchestrator_effort="high",
        orchestrator_provider="anthropic",
    )
    append_event(str(d), "work_started", 1)
    write_disposition(
        str(d),
        Disposition(
            status="completed",
            summary="lightweight test session",
            verification_method="api",
            files_changed=["foo.py"],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
        ),
    )
    # Stub the gate-check runner so the flow reaches our new soft-gate
    # code without needing a real git repo etc.
    monkeypatch.setattr(
        close_session,
        "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )
    # The state-flip helper is lazy-imported from session_state inside
    # close_session.run(); patch the source so the lazy import resolves
    # to our no-op stub.
    import session_state

    monkeypatch.setattr(
        session_state,
        "_flip_state_to_closed",
        lambda *_a, **_kw: None,
    )
    return str(d)


def _ns(set_dir: str, **overrides):
    """Build a parsed-args namespace pointing at set_dir, with overrides."""
    parser = _build_parser()
    args = parser.parse_args(["--session-set-dir", set_dir])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


# ---------- non-interactive (CI / no-TTY) branch ----------


def test_no_router_non_tty_with_missing_ext_verify_warns_and_proceeds(
    started_set: str, monkeypatch, capsys
):
    """No external-verification.md + no TTY → stderr warning, proceeds."""
    # Simulate no TTY.
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    args = _ns(started_set, no_router=True)
    outcome = run(args)
    assert outcome.result == "succeeded"
    captured = capsys.readouterr()
    assert "external-verification.md missing" in captured.err
    assert "external-verification.md missing" in " ".join(outcome.messages)


def test_no_router_accept_suggestions_bypasses_prompt(
    started_set: str, monkeypatch, capsys
):
    """--accept-suggestions forces non-interactive even with TTY."""
    # Simulate TTY (the flag should override).
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    def prompt_fn_should_not_be_called(_p):
        pytest.fail("prompt_fn called despite --accept-suggestions")

    args = _ns(started_set, no_router=True, accept_suggestions=True)
    outcome = run(args, prompt_fn=prompt_fn_should_not_be_called)
    assert outcome.result == "succeeded"


# ---------- interactive (TTY) branch ----------


def test_no_router_tty_prompt_y_proceeds(started_set: str, monkeypatch):
    """TTY + answer 'y' → close-out proceeds, message recorded."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    args = _ns(started_set, no_router=True)
    outcome = run(args, prompt_fn=lambda _p: "y")
    assert outcome.result == "succeeded"
    assert "operator confirmed" in " ".join(outcome.messages)


def test_no_router_tty_prompt_yes_proceeds(started_set: str, monkeypatch):
    """TTY + answer 'yes' (full word) → close-out proceeds."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    args = _ns(started_set, no_router=True)
    outcome = run(args, prompt_fn=lambda _p: "yes")
    assert outcome.result == "succeeded"


def test_no_router_tty_prompt_n_aborts(started_set: str, monkeypatch):
    """TTY + answer 'n' → aborted_at_soft_gate."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    args = _ns(started_set, no_router=True)
    outcome = run(args, prompt_fn=lambda _p: "n")
    assert outcome.result == "aborted_at_soft_gate"
    assert "soft gate" in " ".join(outcome.messages).lower()


def test_no_router_tty_prompt_empty_aborts(started_set: str, monkeypatch):
    """TTY + empty answer → default-no behavior → abort."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    args = _ns(started_set, no_router=True)
    outcome = run(args, prompt_fn=lambda _p: "")
    assert outcome.result == "aborted_at_soft_gate"


def test_no_router_tty_abort_emits_closeout_failed_event(
    started_set: str, monkeypatch
):
    """Soft-gate abort emits a closeout_failed event for audit trail."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    args = _ns(started_set, no_router=True)
    run(args, prompt_fn=lambda _p: "n")
    events = read_events(started_set)
    failed = [e for e in events if e.event_type == "closeout_failed"]
    assert failed, "soft-gate abort should emit a closeout_failed event"
    assert "external_verification_soft_gate" in failed[-1].fields.get(
        "failed_checks", []
    )


# ---------- external-verification.md present skips the gate ----------


def test_no_router_with_ext_verify_present_does_not_fire_soft_gate(
    started_set: str, monkeypatch
):
    """When the artifact exists, the soft gate is silent."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    Path(started_set, "external-verification.md").write_text(
        "operator's manual verification notes\n", encoding="utf-8"
    )

    def prompt_fn_should_not_be_called(_p):
        pytest.fail("prompt_fn called despite external-verification.md present")

    args = _ns(started_set, no_router=True)
    outcome = run(args, prompt_fn=prompt_fn_should_not_be_called)
    assert outcome.result == "succeeded"


# ---------- full-tier (no --no-router) is unaffected ----------


def test_full_tier_does_not_fire_soft_gate(started_set: str, monkeypatch):
    """Without --no-router, the soft gate never fires (full tier ignores it)."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    def prompt_fn_should_not_be_called(_p):
        pytest.fail("prompt_fn called despite full-tier invocation")

    args = _ns(started_set, manual_verify=True)
    # manual_verify requires a reason — provide one via reason_file
    reason = Path(started_set) / "reason.md"
    reason.write_text("manual attestation for test\n", encoding="utf-8")
    args.reason_file = str(reason)
    outcome = run(args, prompt_fn=prompt_fn_should_not_be_called)
    assert outcome.result == "succeeded"


# ---------- method resolution and attestation ----------


def test_no_router_records_method_manual(started_set: str, monkeypatch):
    """--no-router records verification_method='manual' on the outcome."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)  # non-interactive
    args = _ns(started_set, no_router=True)
    outcome = run(args)
    assert outcome.verification_method == "manual"


def test_no_router_uses_stock_attestation_when_no_reason_file(
    started_set: str, monkeypatch
):
    """Without --reason-file, --no-router auto-provides a stock attestation."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    args = _ns(started_set, no_router=True)
    run(args)
    events = read_events(started_set)
    verify_completed = [
        e for e in events if e.event_type == "verification_completed"
    ]
    assert verify_completed
    attestation = verify_completed[-1].fields.get("attestation", "")
    assert "Lightweight tier" in attestation
    assert "--no-router" in attestation


def test_no_router_uses_reason_file_when_provided(
    started_set: str, monkeypatch, tmp_path: Path
):
    """When --reason-file is provided, --no-router uses it as the attestation."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    reason = tmp_path / "reason.md"
    reason.write_text("operator's custom close-out narrative", encoding="utf-8")
    args = _ns(started_set, no_router=True, reason_file=str(reason))
    run(args)
    events = read_events(started_set)
    verify_completed = [
        e for e in events if e.event_type == "verification_completed"
    ]
    assert verify_completed
    attestation = verify_completed[-1].fields.get("attestation", "")
    assert "operator's custom close-out narrative" in attestation
