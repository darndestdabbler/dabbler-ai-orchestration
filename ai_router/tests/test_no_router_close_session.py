"""Unit tests for --no-router close_session behavior after Set 112.

``--no-router`` is a **test affordance**: it suppresses routed API calls so
CI and hermetic tests can drive the CLIs end-to-end without spending money
or needing a network. Set 112 deleted the Lightweight tier, and with it
everything that made this flag a *verification* posture:

  * the ``external-verification.md`` soft gate (Mode A) it used to fire;
  * the stock manual attestation it wrote on the operator's behalf;
  * the ``verification_method="manual"`` it recorded without a human;
  * the ``check_verification_integrity`` / run-of-record-freshness
    early-outs it inherited from ``_set_is_lightweight``.

What survives, and what these tests pin:

  * it still suppresses the routed close backstop (that gate DISPATCHES,
    so a suppressed-dispatch invocation genuinely cannot run it);
  * it self-attests nothing;
  * the env var activates it exactly like the flag;
  * ``--manual-verify`` remains the one attested bypass, and it is
    unaffected by ``--no-router``.
"""
from __future__ import annotations

from pathlib import Path

import pytest

import close_session
import runtime_mode
from close_session import (
    GateResult,
    _build_parser,
    _resolve_no_router_for_run,
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
        "```yaml\nrequiresUAT: false\n```\n",
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
            summary="no-router test session",
            verification_method="api",
            files_changed=["foo.py"],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
        ),
    )
    # Stub the gate-check runner so the flow reaches the code under test
    # without needing a real git repo etc.
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


def _verification_completed(set_dir: str):
    return [
        e for e in read_events(set_dir) if e.event_type == "verification_completed"
    ]


# ---------- activation sources ----------


def test_cli_flag_activates(started_set: str):
    args = _ns(started_set, no_router=True)
    assert _resolve_no_router_for_run(args, started_set) is True


def test_env_var_activates_without_the_flag(started_set: str, monkeypatch):
    """The Set 077 A3 fix, preserved: the env var must reach run()."""
    monkeypatch.setenv(ENV_VAR_NAME, "1")
    args = _ns(started_set)
    assert _resolve_no_router_for_run(args, started_set) is True


def test_neither_source_leaves_the_router_enabled(started_set: str):
    args = _ns(started_set)
    assert _resolve_no_router_for_run(args, started_set) is False


def test_spec_tier_line_does_not_activate(tmp_path: Path, monkeypatch):
    """Set 112: a spec field can no longer switch the router off.

    A leftover ``tier: lightweight`` line in a consumer's spec must not
    silently suppress dispatch -- the spec loader refuses such a spec, and
    this resolver never consults the spec at all.
    """
    d = tmp_path / "legacy-set"
    d.mkdir()
    (d / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntier: lightweight\n```\n",
        encoding="utf-8",
    )
    args = _ns(str(d))
    assert _resolve_no_router_for_run(args, str(d)) is False


# ---------- no soft gate, no prompt ----------


def test_no_router_does_not_fire_a_soft_gate(started_set: str, monkeypatch, capsys):
    """Set 112: the external-verification.md soft gate is gone.

    A --no-router close over a set with no external-verification.md used to
    warn (non-TTY) or prompt (TTY). It now proceeds silently: the artifact
    was Mode A's hand-recorded verdict, and Mode A is deleted.
    """
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    outcome = run(_ns(started_set, no_router=True))
    assert outcome.result == "succeeded"
    combined = capsys.readouterr().err + " ".join(outcome.messages)
    assert "external-verification.md" not in combined


def test_no_router_never_prompts_on_a_tty(started_set: str, monkeypatch):
    """No interactive stop survives on this path."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)

    def _should_not_be_called(_p):
        pytest.fail("close_session prompted on a --no-router close")

    outcome = run(_ns(started_set, no_router=True), prompt_fn=_should_not_be_called)
    assert outcome.result == "succeeded"


# ---------- no self-attestation ----------


def test_no_router_does_not_record_method_manual(started_set: str, monkeypatch):
    """The recorded method now reflects the disposition's own claim.

    Recording "manual" for a flag that no human passed described a
    verification that never happened. The disposition says ``api``; that is
    what the outcome carries, and the deterministic evidence gate -- which
    --no-router no longer disarms -- is what checks it.
    """
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    outcome = run(_ns(started_set, no_router=True))
    assert outcome.verification_method == "api"


def test_no_router_writes_no_attestation(started_set: str, monkeypatch):
    """No stock attestation event is emitted on the operator's behalf."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    run(_ns(started_set, no_router=True))
    for event in _verification_completed(started_set):
        assert not event.fields.get("attestation")


def test_no_router_reason_file_is_not_promoted_to_an_attestation(
    started_set: str, monkeypatch, tmp_path: Path
):
    """--reason-file alone is not an attestation.

    ``--reason-file`` supplies text; ``--manual-verify`` is what claims a
    human verified the work. Set 112 stopped --no-router from silently
    combining the two.
    """
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    reason = tmp_path / "reason.txt"
    reason.write_text("CI batch close", encoding="utf-8")
    outcome = run(
        _ns(started_set, no_router=True, reason_file=str(reason))
    )
    assert outcome.verification_method == "api"


# ---------- --manual-verify is unaffected ----------


def test_manual_verify_still_attests_under_no_router(
    started_set: str, monkeypatch, tmp_path: Path
):
    """The one attested bypass keeps working, and it is explicit."""
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    reason = tmp_path / "reason.txt"
    reason.write_text("provider outage; operator reviewed by hand", encoding="utf-8")
    outcome = run(
        _ns(
            started_set,
            no_router=True,
            manual_verify=True,
            reason_file=str(reason),
        )
    )
    assert outcome.result == "succeeded"
    assert outcome.verification_method == "manual"
    events = _verification_completed(started_set)
    assert events
    assert "operator reviewed by hand" in events[-1].fields.get("attestation", "")


# ---------- the backstop: suppressed for the one honest reason ----------


def test_no_router_suppresses_the_routed_backstop(started_set: str, monkeypatch):
    """--no-router skips the close backstop because the backstop DISPATCHES.

    This is the one relief the flag legitimately buys: you cannot run a
    routed verification with routing suppressed. It is not gate relief --
    the deterministic gates all still run.
    """
    called: list[str] = []

    import close_backstop

    monkeypatch.setattr(
        close_backstop,
        "run_close_backstop",
        lambda *_a, **_kw: called.append("ran"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    run(_ns(started_set, no_router=True))
    assert called == []


# ---------- CLI surface ----------


def test_no_router_help_does_not_advertise_a_tier():
    """The flag's own help text describes a test affordance, not a tier."""
    parser = _build_parser()
    action = next(
        a for a in parser._actions if "--no-router" in (a.option_strings or [])
    )
    help_text = (action.help or "").lower()
    assert "lightweight" not in help_text
    assert "tier" not in help_text
    assert "--manual-verify" in help_text
