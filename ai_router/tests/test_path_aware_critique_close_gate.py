"""Set 066 Session 2 — the path-aware-critique close-out gate in close_session.

When the durable ``pathAwareCritique`` record is ``advisory`` or ``required``
and the **set-terminal** close cannot confirm a valid multi-provider critique
artifact, the gate:

  * for ``required``: HARD-blocks in an interactive TTY (result
    ``gate_failed`` + ``closeout_failed`` event) and SOFT-warns in non-TTY /
    headless or under ``--accept-suggestions`` (proceeds to ``succeeded``);
  * for ``advisory``: ALWAYS soft-warns and never blocks;
  * for ``none``: skips entirely.

It fires ONLY on the set-terminal close. It is **tier-orthogonal** — it gates
on the tier-independent ``pathAwareCritique`` record, so the behavior is
identical on Full and Lightweight (the net-new Full-tier wiring is the whole
point of Set 066: the Set-057 dedicated_verification gate is Lightweight-only).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

import close_session
import path_aware_critique as pac
from close_session import GateResult, _build_parser, run
from disposition import Disposition, write_disposition

NONE = pac.PATH_AWARE_CRITIQUE_NONE
ADVISORY = pac.PATH_AWARE_CRITIQUE_ADVISORY
REQUIRED = pac.PATH_AWARE_CRITIQUE_REQUIRED


def _valid_artifact(set_name: str, level: str = REQUIRED) -> dict:
    return {
        "schemaVersion": 1,
        "sessionSetName": set_name,
        "pathAwareCritique": level,
        "critiques": [
            {
                "provider": "openai",
                "model": "gpt-5.4",
                "verdict": "ISSUES_FOUND",
                "summary": "Read the gate wiring over the repo; one defect.",
                "findings": [
                    {
                        "description": "The gate fired on a non-terminal close.",
                        "severity": "Major",
                    }
                ],
            },
            {
                "provider": "google",
                "model": "gemini-2.5-pro",
                "verdict": "VERIFIED",
                "summary": "Independently read the validator; no defects.",
            },
        ],
    }


def _single_provider_artifact(set_name: str) -> dict:
    art = _valid_artifact(set_name)
    art["critiques"][1]["provider"] = "openai"  # collapse to one provider
    return art


def _trivial_artifact(set_name: str) -> dict:
    art = _valid_artifact(set_name)
    for c in art["critiques"]:
        c.pop("summary", None)
        c.pop("findings", None)
    return art


def _make_set(tmp_path, *, sessions, total, level=REQUIRED, tier="full",
              artifact=None):
    d = tmp_path / "066-gate"
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
    # exercise the path-aware-critique gate, not the soft gate.
    (d / "external-verification.md").write_text(
        "## Round 1 — 2026-07-02\n\nVerdict: VERIFIED\n", encoding="utf-8"
    )
    if level is not None:
        pac.record_path_aware_critique(d, level)
    if artifact is not None:
        (d / pac.PATH_AWARE_CRITIQUE_ARTIFACT_FILENAME).write_text(
            json.dumps(artifact, indent=2), encoding="utf-8"
        )
    write_disposition(
        str(d),
        Disposition(
            status="completed",
            summary="path-aware-critique gate fixture",
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
    """Stub the deterministic gates + flip so the flow reaches the S2 gate."""
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


# --- none: gate never fires -------------------------------------------------

@pytest.mark.parametrize("tier", ["full", "lightweight"])
def test_none_does_not_fire_gate(tmp_path, monkeypatch, capsys, tier):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=NONE,
        tier=tier,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "path-aware-critique" not in capsys.readouterr().err


def test_none_unrecorded_default_does_not_fire(tmp_path, monkeypatch):
    # No record at all -> default 'none' -> gate skips even on a TTY.
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=None,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


# --- required: hard-block / soft-warn posture -------------------------------

@pytest.mark.parametrize("tier", ["full", "lightweight"])
def test_required_missing_artifact_tty_hard_blocks(tmp_path, monkeypatch, tier):
    # Tier-orthogonal: identical hard-block on Full and Lightweight.
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        tier=tier,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"
    assert any("path_aware_critique" in m for m in outcome.messages)
    assert "closeout_failed" in outcome.events_emitted


def test_required_missing_artifact_non_tty_soft_warns(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "path-aware-critique soft gate" in capsys.readouterr().err


def test_required_missing_artifact_accept_suggestions_soft_warns(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d, accept_suggestions=True))
    assert outcome.result == "succeeded"
    assert any("soft gate" in m for m in outcome.messages)


def test_required_valid_artifact_passes_in_tty(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        artifact=_valid_artifact("066-gate"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


def test_required_single_provider_artifact_tty_hard_blocks(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        artifact=_single_provider_artifact("066-gate"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"
    assert any("path_aware_critique" in m for m in outcome.messages)


def test_required_trivial_artifact_tty_hard_blocks(tmp_path, monkeypatch):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        artifact=_trivial_artifact("066-gate"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"


# --- advisory: always soft, never blocks ------------------------------------

def test_advisory_missing_artifact_tty_soft_warns_not_blocks(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=ADVISORY,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "path-aware-critique advisory" in capsys.readouterr().err


def test_advisory_valid_artifact_no_warning(tmp_path, monkeypatch, capsys):
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=ADVISORY,
        artifact=_valid_artifact("066-gate", level=ADVISORY),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"
    assert "path-aware-critique" not in capsys.readouterr().err


# --- set-terminal scoping ---------------------------------------------------

def test_non_terminal_close_does_not_fire_gate(tmp_path, monkeypatch):
    # Closing work session 1 of a 2-session set: not terminal, so the gate
    # does not fire even though no artifact exists and we are on a TTY.
    d = _make_set(
        tmp_path,
        sessions=[_work(1, "in-progress"), _work(2, "not-started")],
        total=2,
        level=REQUIRED,
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "succeeded"


# --- S3 dogfood remediations ------------------------------------------------

def test_wrong_set_name_artifact_tty_hard_blocks(tmp_path, monkeypatch):
    # GPT-5.4 finding #2: a structurally valid artifact copied from another set
    # must not satisfy this set's required gate.
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        artifact=_valid_artifact("some-other-set"),
    )
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    assert outcome.result == "gate_failed"
    assert any("path_aware_critique" in m for m in outcome.messages)


def test_unreadable_activity_log_warns_not_silently_disarms(
    tmp_path, monkeypatch, capsys
):
    # GPT-5.4 finding #1: a corrupt activity-log collapses the policy read to
    # 'none' (so the required gate cannot fire), but the terminal close now
    # surfaces a loud, non-blocking warning instead of disarming silently.
    d = _make_set(
        tmp_path, sessions=[_work(1, "in-progress")], total=1, level=REQUIRED,
        artifact=_valid_artifact("066-gate"),
    )
    (d / "activity-log.json").write_text("{ corrupt", encoding="utf-8")
    monkeypatch.setattr("sys.stdin.isatty", lambda: True)
    outcome = run(_ns(d))
    err = capsys.readouterr().err
    assert "could not be parsed" in err
    assert "path-aware-critique" in err
