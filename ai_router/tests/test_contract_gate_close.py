"""Set 068 S5 - the contract-test / CDC gate wired into close_session.

When the durable ``contractGate`` record is ``advisory`` or ``required`` and the
**set-terminal** close cannot confirm a valid manifest + a PASSING, identity-
matched, coverage-complete contract floor, the gate:

  * for ``required``: HARD-blocks in an interactive TTY (result ``gate_failed`` +
    ``closeout_failed`` event) and SOFT-warns non-TTY / headless or under
    ``--accept-suggestions`` (proceeds to ``succeeded``);
  * for ``advisory``: ALWAYS soft-warns and never blocks;
  * for ``none``: skips entirely.

It fires ONLY on the set-terminal close and is tier-orthogonal. Harness mirrors
``test_path_aware_critique_close_gate.py``.
"""
from __future__ import annotations

import json

import pytest

import close_session
import contract_gate as cg
from close_session import GateResult, _build_parser, run
from disposition import Disposition, write_disposition

NONE = cg.CONTRACT_GATE_NONE
ADVISORY = cg.CONTRACT_GATE_ADVISORY
REQUIRED = cg.CONTRACT_GATE_REQUIRED


def _manifest(set_name, level=REQUIRED):
    return {
        "schemaVersion": 1,
        "sessionSetName": set_name,
        "contractGate": level,
        "command": ["python", "-c", "pass"],
        "defectClasses": [
            {"id": "DC1", "description": "covered", "probeable": True,
             "coveredBy": ["test_dc1"]},
            {"id": "DC2", "description": "residual", "probeable": False,
             "coveredBy": []},
        ],
    }


def _floor(set_name, level=REQUIRED, passed=True):
    return {
        "schemaVersion": 1,
        "sessionSetName": set_name,
        "contractGate": level,
        "ref": "HEAD",
        "command": ["python", "-c", "pass"],
        "ran": True,
        "passed": passed,
        "exitCode": 0 if passed else 1,
        "timedOut": False,
        "wallSeconds": 0.1,
        "worktreeCreated": True,
        "worktreeRemoved": True,
        "output": "",
    }


def _make_set(tmp_path, *, sessions, total, level=REQUIRED, tier="full",
              manifest=None, floor=None):
    d = tmp_path / "068-contract"
    d.mkdir()
    (d / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        f"```yaml\ntier: {tier}\n```\n",
        encoding="utf-8",
    )
    state = {
        "schemaVersion": 4,
        "sessionSetName": d.name,
        "status": "in-progress",
        "totalSessions": total,
        "sessions": sessions,
    }
    (d / "session-state.json").write_text(
        json.dumps(state, indent=2), encoding="utf-8"
    )
    (d / "activity-log.json").write_text(
        json.dumps({"entries": []}, indent=2), encoding="utf-8"
    )
    # Set 077 S4 (A3): the external-verification soft gate now keys off
    # the RESOLVED tier, so lightweight-parameterized fixtures receive
    # it too. Seed a recorded verdict to keep it quiet — these tests
    # exercise the contract gate, not the soft gate.
    (d / "external-verification.md").write_text(
        "## Round 1 — 2026-07-02\n\nVerdict: VERIFIED\n", encoding="utf-8"
    )
    if level is not None:
        cg.record_contract_gate(d, level)
    if manifest is not None:
        (d / cg.CONTRACT_MANIFEST_FILENAME).write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
    if floor is not None:
        (d / cg.CONTRACT_FLOOR_RESULT_FILENAME).write_text(
            json.dumps(floor, indent=2), encoding="utf-8"
        )
    write_disposition(
        str(d),
        Disposition(
            status="completed",
            summary="contract-gate fixture",
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


@pytest.fixture(autouse=True)
def _stub_gates(monkeypatch):
    """Stub the deterministic gates + flip so the flow reaches the S5 gate.

    Also stub the Set 066 path-aware gate to a no-op pass so this set's
    contract-gate is the only set-terminal gate under test.
    """
    monkeypatch.setattr(
        close_session,
        "_run_gate_checks",
        lambda *_a, **_kw: [
            GateResult(check=name, passed=True, remediation="")
            for name in close_session._GATE_CHECK_NAMES
        ],
    )
    import session_state

    monkeypatch.setattr(
        session_state, "_flip_state_to_closed", lambda *_a, **_kw: None
    )
    yield


def _ns(set_dir, **overrides):
    args = _build_parser().parse_args(["--session-set-dir", str(set_dir)])
    for k, v in overrides.items():
        setattr(args, k, v)
    return args


# --- none: never fires ------------------------------------------------------


@pytest.mark.parametrize("tier", ["full", "lightweight"])
def test_none_does_not_fire(tmp_path, monkeypatch, capsys, tier):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=NONE,
        tier=tier,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "contract-gate" not in capsys.readouterr().err


def test_unrecorded_default_does_not_fire(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=None,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert run(_ns(d)).result == "succeeded"


# --- required: hard-block / soft-warn ---------------------------------------


@pytest.mark.parametrize("tier", ["full", "lightweight"])
def test_required_missing_tty_hard_blocks(tmp_path, monkeypatch, tier):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        tier=tier,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"
    assert any("contract_gate" in m for m in outcome.messages)
    assert "closeout_failed" in outcome.events_emitted


def test_required_missing_non_tty_soft_warns(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "contract-gate soft gate" in capsys.readouterr().err


def test_required_accept_suggestions_soft_warns(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d, accept_suggestions=True))
    assert outcome.result == "succeeded"
    assert any("soft gate" in m for m in outcome.messages)


def test_required_happy_path_passes_in_tty(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        manifest=_manifest("068-contract"), floor=_floor("068-contract"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert run(_ns(d)).result == "succeeded"


def test_required_non_passing_floor_hard_blocks(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        manifest=_manifest("068-contract"),
        floor=_floor("068-contract", passed=False),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert run(_ns(d)).result == "gate_failed"


def test_required_wrong_set_manifest_hard_blocks(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        manifest=_manifest("some-other-set"), floor=_floor("068-contract"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert run(_ns(d)).result == "gate_failed"


# --- advisory: always soft ---------------------------------------------------


def test_advisory_missing_tty_soft_warns_not_blocks(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=ADVISORY,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "contract-gate advisory" in capsys.readouterr().err


def test_advisory_happy_path_no_warning(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=ADVISORY,
        manifest=_manifest("068-contract", ADVISORY),
        floor=_floor("068-contract", ADVISORY),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "contract-gate" not in capsys.readouterr().err


# --- set-terminal scoping ----------------------------------------------------


def test_non_terminal_close_does_not_fire(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path,
        sessions=[_work(1, "in-progress"), _work(2, "not-started")],
        total=2,
        level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    assert run(_ns(d)).result == "succeeded"


# --- corrupt activity-log: loud, non-blocking warning ------------------------


def test_unreadable_activity_log_warns_not_silently_disarms(
    tmp_path, monkeypatch, capsys
):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        manifest=_manifest("068-contract"), floor=_floor("068-contract"),
    )
    (d / "activity-log.json").write_text("{ corrupt", encoding="utf-8")
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    err = capsys.readouterr().err
    assert "could not be parsed" in err
    assert "contract-gate" in err
    # collapses to none -> does not hard-block
    assert outcome.result == "succeeded"
