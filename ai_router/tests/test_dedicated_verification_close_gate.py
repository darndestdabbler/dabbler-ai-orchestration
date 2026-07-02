"""Set 057 Session 3 — the Q6 close-out gate strength in close_session.

When ``verificationMode == dedicated-sessions`` and the **set-terminal**
close cannot confirm a different-engine verification session ran, the
gate:

  * HARD-blocks in an interactive TTY (result ``gate_failed`` +
    ``closeout_failed`` event), and
  * SOFT-warns in non-TTY / headless or under ``--accept-suggestions``
    (proceeds to ``succeeded``).

It fires ONLY on the set-terminal close, and never for the
out-of-band-or-none default or Full tier. The session being closed
counts as the satisfying verification when it is itself a cross-provider
verification session (the happy-path single-round terminal close).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import close_session
import dedicated_verification as dv
from close_session import GateResult, _build_parser, run
from disposition import Disposition, write_disposition

D = dv.VERIFICATION_MODE_DEDICATED
OOB = dv.VERIFICATION_MODE_OUT_OF_BAND


def _make_set(tmp_path, *, sessions, total, mode=D):
    d = tmp_path / "057-gate"
    d.mkdir()
    (d / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntier: lightweight\n```\n",
        encoding="utf-8",
    )
    state = {
        "schemaVersion": 4,
        "sessionSetName": d.name,
        "status": "in-progress",
        "totalSessions": total,
        "sessions": sessions,
    }
    (d / "session-state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
    (d / "activity-log.json").write_text(
        json.dumps({"entries": []}, indent=2), encoding="utf-8"
    )
    # Set 077 S4 (A3): the external-verification soft gate now keys off
    # the RESOLVED tier, so this lightweight fixture receives it too.
    # Seed a recorded verdict to keep it quiet — these tests exercise
    # the dedicated-verification gate, not the soft gate.
    (d / "external-verification.md").write_text(
        "## Round 1 — 2026-07-02\n\nVerdict: VERIFIED\n", encoding="utf-8"
    )
    if mode is not None:
        dv.record_verification_mode(d, mode)
    write_disposition(
        str(d),
        Disposition(
            status="completed",
            summary="dedicated-sessions gate fixture",
            verification_method="api",
            files_changed=["foo.py"],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
        ),
    )
    return d


def _work(num, status, engine="claude-code"):
    return {
        "number": num,
        "title": f"Work {num}",
        "status": status,
        "startedAt": f"t{num}",
        "completedAt": f"t{num}b" if status == "complete" else None,
        "orchestrator": {"engine": engine, "provider": "anthropic"},
        "verificationVerdict": None,
    }


def _verif(num, status, engine="gpt-5-4"):
    e = _work(num, status, engine=engine)
    e["title"] = f"Verification round {num}"
    e["type"] = "verification"
    return e


@pytest.fixture(autouse=True)
def _stub_gates(monkeypatch):
    """Stub the deterministic gates + flip so the flow reaches the Q6 gate."""
    monkeypatch.setattr(
        close_session,
        "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )
    import session_state

    monkeypatch.setattr(session_state, "_flip_state_to_closed", lambda *_a, **_kw: None)
    yield


def _ns(set_dir, **overrides):
    args = _build_parser().parse_args(["--session-set-dir", str(set_dir)])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


def test_terminal_no_verification_tty_hard_blocks(tmp_path, monkeypatch):
    d = _make_set(tmp_path, sessions=[_work(1, "in-progress")], total=1)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"
    assert any("dedicated_verification" in m for m in outcome.messages)
    assert "closeout_failed" in outcome.events_emitted


def test_terminal_no_verification_non_tty_soft_warns(tmp_path, monkeypatch, capsys):
    d = _make_set(tmp_path, sessions=[_work(1, "in-progress")], total=1)
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "dedicated-sessions soft gate" in capsys.readouterr().err


def test_terminal_no_verification_accept_suggestions_soft_warns(tmp_path, monkeypatch):
    d = _make_set(tmp_path, sessions=[_work(1, "in-progress")], total=1)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d, accept_suggestions=True))
    assert outcome.result == "succeeded"
    assert any("soft gate" in m for m in outcome.messages)


def test_terminal_closing_the_verification_session_passes_in_tty(tmp_path, monkeypatch):
    # Happy path: the session being terminally closed IS a cross-provider
    # verification session (in-flight at gate time) -> gate passes even in TTY.
    d = _make_set(
        tmp_path,
        sessions=[_work(1, "complete", engine="claude-code"), _verif(2, "in-progress")],
        total=2,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


def test_terminal_prior_completed_verification_passes(tmp_path, monkeypatch):
    # A completed earlier cross-provider verification round satisfies the
    # gate even when the terminal close is of a later (work/remediation)
    # session.
    d = _make_set(
        tmp_path,
        sessions=[
            _work(1, "complete", engine="claude-code"),
            _verif(2, "complete"),
            {**_work(3, "in-progress", engine="claude-code"), "title": "Remediation round 1", "type": "remediation"},
        ],
        total=3,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


def test_non_terminal_close_does_not_fire_gate(tmp_path, monkeypatch):
    # Closing work session 1 of a 2-session set: not terminal, so the gate
    # does not fire even though no verification ran and we are on a TTY.
    d = _make_set(
        tmp_path,
        sessions=[_work(1, "in-progress"), _work(2, "not-started")],
        total=2,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


def test_out_of_band_mode_does_not_fire_gate(tmp_path, monkeypatch):
    d = _make_set(tmp_path, sessions=[_work(1, "in-progress")], total=1, mode=OOB)
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
