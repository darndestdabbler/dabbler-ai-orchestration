"""Set 077 S5 — cross-provider gate extension (A6) + start-time guardrail (M1).

Covers the shared ``cross_provider_satisfied`` predicate, the extended
``validate_dedicated_verification`` (engine-or-provider difference,
fail-closed missing data, M5 legacy corrective), the ``start_session
--type verification`` same-pair refusal (plain + handoff paths), and the
bundle-C policy captures on typed starts.
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import dedicated_verification as dv
import start_session

D = dv.VERIFICATION_MODE_DEDICATED
OOB = dv.VERIFICATION_MODE_OUT_OF_BAND


def _make_set(
    tmp_path: Path,
    *,
    name: str = "077-s5",
    sessions: List[Dict[str, Any]],
    total: int,
    mode: Optional[str] = D,
    spec_yaml: str = "tier: lightweight",
    activity_entries: Optional[List[Dict[str, Any]]] = None,
) -> Path:
    d = tmp_path / name
    d.mkdir()
    (d / "spec.md").write_text(
        f"# spec\n\n## Session Set Configuration\n\n```yaml\n{spec_yaml}\n```\n",
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
    log_entries = activity_entries if activity_entries is not None else []
    (d / "activity-log.json").write_text(
        json.dumps({"entries": log_entries}, indent=2), encoding="utf-8"
    )
    if mode is not None:
        dv.record_verification_mode(d, mode)
    return d


def _work(num: int, status: str, engine: Optional[str], provider: Optional[str]):
    orchestrator = {}
    if engine:
        orchestrator["engine"] = engine
    if provider:
        orchestrator["provider"] = provider
    return {
        "number": num,
        "title": f"Work {num}",
        "status": status,
        "startedAt": f"t{num}",
        "completedAt": f"t{num}b" if status == "complete" else None,
        "orchestrator": orchestrator,
        "verificationVerdict": None,
    }


def _verif(num: int, status: str, engine: Optional[str], provider: Optional[str]):
    e = _work(num, status, engine, provider)
    e["title"] = f"Verification round {num}"
    e["type"] = "verification"
    return e


# Surface 1: dedicated_verification extensions
# =============================================================================


def test_work_session_pairs_filters_types():
    sessions = [
        _work(1, "complete", "claude", "anthropic"),
        _verif(2, "complete", "gpt", "openai"),
        _work(3, "complete", "copilot", "github"),
    ]
    pairs = dv.work_session_pairs(sessions)
    assert pairs == [("claude", "anthropic"), ("copilot", "github")]


def test_work_session_pairs_handles_missing_data():
    sessions = [
        {"number": 1, "status": "complete", "orchestrator": {"engine": "claude"}},
        {"number": 2, "status": "complete", "orchestrator": {"provider": "openai"}},
        {"number": 3, "status": "complete", "orchestrator": {}},
        {"number": 4, "status": "complete"},
    ]
    pairs = dv.work_session_pairs(sessions)
    assert pairs == [("claude", None), (None, "openai"), (None, None), (None, None)]


def test_work_session_pairs_empty_input():
    assert dv.work_session_pairs([]) == []


@pytest.mark.parametrize(
    "v_engine, v_provider, work_pairs, expected",
    [
        # Legacy engine arm
        ("gpt", "openai", [("claude", "anthropic")], True),
        ("gpt", "openai", [("claude", "anthropic"), ("gemini", "google")], True),
        # Engine arm alone would fail here (gpt is a work engine) but the
        # NEW provider arm passes: every pair differs by provider.
        ("gpt", "openai", [("gpt", "anthropic")], True),
        ("gpt", "openai", [("claude", "openai")], True),
        ("gpt", "openai", [("gpt", "openai")], False),
        # Fail closed on missing data
        ("gpt", None, [("gpt", "anthropic")], False),
        ("gpt", "openai", [("gpt", None)], False),
        ("gpt", "openai", [(None, "openai")], False),
        ("gpt", "openai", [(None, None)], False),
        # Mixed bag
        ("gpt", "openai", [("claude", "anthropic"), ("gpt", "openai")], False),
        # Empty work baseline
        ("gpt", "openai", [], False),
    ],
)
def test_cross_provider_satisfied(v_engine, v_provider, work_pairs, expected):
    result = dv.cross_provider_satisfied(v_engine, v_provider, work_pairs)
    assert result is expected


def test_validate_dedicated_verification_not_applicable(tmp_path):
    set_dir = _make_set(tmp_path, sessions=[], total=0, mode=OOB)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.applicable is False
    assert result.ok is True


def _bare_set_with_mode(tmp_path: Path, name: str) -> Path:
    """A dir with only an activity log carrying the dedicated-mode record."""
    set_dir = tmp_path / name
    set_dir.mkdir()
    (set_dir / "activity-log.json").write_text(
        json.dumps({"entries": []}, indent=2), encoding="utf-8"
    )
    dv.record_verification_mode(set_dir, D)
    return set_dir


def test_validate_dedicated_verification_no_state_file(tmp_path):
    set_dir = _bare_set_with_mode(tmp_path, "no-state")
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "no session-state.json" in result.reason


def test_validate_dedicated_verification_unreadable_state_file(tmp_path):
    set_dir = _bare_set_with_mode(tmp_path, "bad-state")
    (set_dir / "session-state.json").write_text("{malformed", encoding="utf-8")
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "unreadable" in result.reason


def test_validate_dedicated_verification_no_completed_verif(tmp_path):
    sessions = [_work(1, "complete", "claude", "anthropic")]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "no completed verification session" in result.reason


def test_validate_dedicated_verification_closing_session_satisfies(tmp_path):
    sessions = [
        _work(1, "complete", "claude", "anthropic"),
        _verif(2, "in-progress", "gpt", "openai"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir, closing_session_number=2)
    assert result.ok is True
    assert "differs from every implementation session by engine" in result.reason


def test_validate_dedicated_verification_no_work_baseline(tmp_path):
    sessions = [
        _work(1, "complete", None, None),
        _verif(2, "complete", "gpt", "openai"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "no implementation-session engine or provider is recorded" in result.reason


def test_validate_dedicated_verification_success_by_engine(tmp_path):
    sessions = [
        _work(1, "complete", "claude", "anthropic"),
        _verif(2, "complete", "gpt", "openai"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is True
    assert "by engine" in result.reason


def test_validate_dedicated_verification_success_by_provider(tmp_path):
    sessions = [
        _work(1, "complete", "copilot", "anthropic"),
        _verif(2, "complete", "copilot", "openai"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is True
    assert "by provider" in result.reason


def test_validate_dedicated_verification_failure_corrective_hint(tmp_path):
    sessions = [
        _work(1, "complete", "copilot", None),  # No provider recorded
        _verif(2, "complete", "copilot", "openai"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "work sessions carry no recorded provider" in result.corrective


def test_validate_dedicated_verification_failure_no_hint(tmp_path):
    sessions = [
        _work(1, "complete", "copilot", "anthropic"),
        _verif(2, "complete", "copilot", "anthropic"),
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=2)
    result = dv.validate_dedicated_verification(set_dir)
    assert result.ok is False
    assert "work sessions carry no recorded provider" not in result.corrective


# Surface 2: start_session guardrail and policy captures
# =============================================================================


def _run_start_session(args: List[str]) -> int:
    parser = start_session._build_arg_parser()
    parsed_args = parser.parse_args(args)
    return start_session.run(parsed_args)


def _session_count(set_dir: Path) -> int:
    state = json.loads((set_dir / "session-state.json").read_text(encoding="utf-8"))
    return len(state.get("sessions") or [])


def test_start_session_guardrail_blocks_same_identity(tmp_path, capsys):
    sessions = [_work(1, "complete", "copilot", "anthropic")]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "copilot",
        "--provider", "anthropic",
        # Set 084 F1: multi-provider engines require a registry-known
        # --model at start; the 077 guardrail under test fires after it.
        "--model", "claude-sonnet-4.6",
    ])
    assert exit_code == start_session.EXIT_BOUNDARY
    stderr = capsys.readouterr().err
    assert "does not differ from the work sessions" in stderr
    # M1: fail-loud BEFORE any write — no typed session was appended.
    assert _session_count(set_dir) == 1


def test_start_session_guardrail_blocks_undeclared_provider_same_engine(tmp_path, capsys):
    # A Copilot-locked shop forgetting --provider gets the model-picker
    # pattern inline instead of a doomed-at-close verification session.
    sessions = [_work(1, "complete", "copilot", "anthropic")]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "copilot",
        # Set 084 F1 boundary passes (model given); the 077 guardrail's
        # undeclared-provider arm is what this test exercises.
        "--model", "claude-sonnet-4.6",
    ])
    assert exit_code == start_session.EXIT_BOUNDARY
    stderr = capsys.readouterr().err
    assert "--provider" in stderr
    assert _session_count(set_dir) == 1


def test_start_session_guardrail_allows_different_engine(tmp_path):
    sessions = [_work(1, "complete", "copilot", "anthropic")]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "gpt-4",
        "--provider", "anthropic",
    ])
    assert exit_code == start_session.EXIT_OK
    assert _session_count(set_dir) == 2


def test_start_session_guardrail_allows_different_provider(tmp_path):
    sessions = [_work(1, "complete", "copilot", "anthropic")]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "copilot",
        "--provider", "openai",
        # Set 084 F1 boundary: registry-known model matching the label.
        "--model", "gpt-5.4",
    ])
    assert exit_code == start_session.EXIT_OK
    assert _session_count(set_dir) == 2


def test_start_session_guardrail_allows_no_baseline(tmp_path):
    # No recorded work identity: the guardrail stays silent; the close
    # gate's fail-closed no-baseline posture owns this case.
    sessions = [_work(1, "complete", None, None)]
    set_dir = _make_set(tmp_path, sessions=sessions, total=1)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "copilot",
        "--provider", "openai",
        # Set 084 F1 boundary: registry-known model matching the label.
        "--model", "gpt-5.4",
    ])
    assert exit_code == start_session.EXIT_OK
    assert _session_count(set_dir) == 2


def test_start_session_handoff_guardrail_blocks_same_identity(tmp_path, capsys):
    # The remediation -> re-verification handoff opens a verification
    # session too; the same start-time guardrail applies before any write.
    sessions = [
        _work(1, "complete", "copilot", "anthropic"),
        _verif(2, "complete", "copilot", "openai"),
        {
            **_work(3, "in-progress", "copilot", "anthropic"),
            "title": "Remediation round 1",
            "type": "remediation",
        },
    ]
    set_dir = _make_set(tmp_path, sessions=sessions, total=3)
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--handoff",
        "--engine", "copilot",
        "--provider", "anthropic",
        # Set 084 F1: multi-provider engines require a registry-known
        # --model at start; the 077 guardrail under test fires after it.
        "--model", "claude-sonnet-4.6",
    ])
    assert exit_code == start_session.EXIT_BOUNDARY
    assert "does not differ from the work sessions" in capsys.readouterr().err
    assert _session_count(set_dir) == 3


def test_start_session_captures_spec_policies(tmp_path):
    spec_yaml = (
        "tier: lightweight\n"
        "pathAwareCritique: required\n"
        "contractGate: advisory"
    )
    set_dir = _make_set(
        tmp_path,
        sessions=[_work(1, "complete", "claude", "anthropic")],
        total=1,
        spec_yaml=spec_yaml,
    )
    exit_code = _run_start_session([
        "--session-set-dir", str(set_dir),
        "--type", "verification",
        "--engine", "gpt",
        "--provider", "openai",
    ])
    assert exit_code == start_session.EXIT_OK

    with (set_dir / "activity-log.json").open("r", encoding="utf-8") as f:
        log = json.load(f)

    kinds = {e.get("kind") for e in log["entries"]}
    assert "path_aware_critique" in kinds
    assert "contract_gate" in kinds



# Surface 1b: derive_state blank-verdict adjudication (S1 bundle E)
# =============================================================================


def _dv_sessions(verdict):
    return [
        {"number": 1, "status": "complete"},
        {
            "number": 2,
            "type": "verification",
            "status": "complete",
            "verificationVerdict": verdict,
        },
    ]


def test_derive_state_blank_verdict_no_envelope_pre_terminal_is_awaiting_human():
    state = dv.derive_state(
        _dv_sessions(None),
        verification_mode=D,
        set_status="in-progress",
        latest_issues=None,
    )
    assert state == dv.STATE_AWAITING_HUMAN


def test_derive_state_issues_found_verdict_no_envelope_pre_terminal_is_awaiting_human():
    # A non-VERIFIED verdict with no envelope is incoherent (issues
    # claimed, none seeded) — surface to a human, never guess clean.
    state = dv.derive_state(
        _dv_sessions("ISSUES_FOUND"),
        verification_mode=D,
        set_status="in-progress",
        latest_issues=None,
    )
    assert state == dv.STATE_AWAITING_HUMAN


def test_derive_state_blank_verdict_no_envelope_terminal_keeps_closed_verified():
    # A terminally-closed set keeps the legacy reading: the Q6 close gate
    # vouched at close time; re-deriving a nag onto it would make the S5
    # banner chase finished sets.
    state = dv.derive_state(
        _dv_sessions(None),
        verification_mode=D,
        set_status="complete",
        latest_issues=None,
    )
    assert state == dv.STATE_CLOSED_VERIFIED


def test_derive_state_verified_verdict_still_closed_verified():
    state = dv.derive_state(
        _dv_sessions("VERIFIED"),
        verification_mode=D,
        set_status="in-progress",
        latest_issues=None,
    )
    assert state == dv.STATE_CLOSED_VERIFIED
