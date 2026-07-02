"""Set 077 S5 (Feature 4) — pending-verification notices + banner.

Per-state coverage for ``pending_verification_notices`` (owed /
in-flight / verified / opt-out; current set and sibling scan) and the
ASCII ``format_banner``. All fixtures are Lightweight-shaped and carry
NO router config anywhere — the module must derive everything without
one (the no-router requirement of the Feature 4 standard).
"""
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

import dedicated_verification as dv
import pending_verification as pv

D = dv.VERIFICATION_MODE_DEDICATED
OOB = dv.VERIFICATION_MODE_OUT_OF_BAND


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    repo_dir = tmp_path / "session-sets"
    repo_dir.mkdir()
    return repo_dir


def _make_set_in_repo(
    repo_dir: Path,
    name: str,
    *,
    state_content: Dict[str, Any],
    mode: str = OOB,
    ext_verif_content: Optional[str] = None,
    issues_content: Optional[Dict[str, Any]] = None,
) -> Path:
    d = repo_dir / name
    d.mkdir()
    (d / "spec.md").write_text("# spec", encoding="utf-8")
    (d / "session-state.json").write_text(
        json.dumps(state_content, indent=2), encoding="utf-8"
    )
    (d / "activity-log.json").write_text(
        json.dumps({"entries": []}, indent=2), encoding="utf-8"
    )
    if mode == D:
        dv.record_verification_mode(d, mode)
    if ext_verif_content:
        (d / "external-verification.md").write_text(
            ext_verif_content, encoding="utf-8"
        )
    if issues_content:
        # A simple name is fine for derive_workflow_state to find it.
        (d / "s2-issues.json").write_text(
            json.dumps(issues_content, indent=2), encoding="utf-8"
        )
    return d


def _state(status: str, sessions: List[Dict[str, Any]], completed_at: str = "t99"):
    base = {
        "schemaVersion": 4,
        "status": status,
        "sessions": sessions,
    }
    if status == "complete":
        base["completedAt"] = completed_at
    return base


def _work(num: int = 1, status: str = "complete"):
    return {
        "number": num,
        "title": f"Work {num}",
        "status": status,
        "startedAt": f"t{num}",
        "completedAt": f"t{num}b" if status == "complete" else None,
        "orchestrator": {"engine": "copilot", "provider": "anthropic"},
        "verificationVerdict": None,
    }


def _verif(
    verdict: Optional[str] = None,
    num: int = 2,
    completed_at: Optional[str] = None,
):
    return {
        "number": num,
        "title": f"Verification round {num}",
        "type": "verification",
        "status": "complete",
        "startedAt": f"t{num}",
        # v4 is per-session-authoritative: recency ranking reads the
        # completedAt the shim derives FROM the session entries.
        "completedAt": completed_at if completed_at is not None else f"t{num}b",
        "verificationVerdict": verdict,
    }


def _issue(resolved: bool = False):
    return {
        "id": "i1",
        "resolution_status": "fixed" if resolved else None,
    }


def test_notice_current_set_awaiting_verification(repo: Path):
    current_set = _make_set_in_repo(
        repo,
        "current",
        state_content=_state("in-progress", [_work(1, "complete")]),
        mode=D,
    )
    notices = pv.pending_verification_notices(current_set)
    assert len(notices) == 1
    assert "verification owed" in notices[0]
    assert "--type verification" in notices[0]
    # S5 verification round 1 (finding 3): neutral placeholders + the
    # differ-by rule — "<other-engine>" would wrongly exclude the
    # sanctioned same-engine different-provider (Copilot) path.
    assert "--engine <your-engine>" in notices[0]
    assert "must differ from the work sessions by engine or provider" in notices[0]
    assert "<other-engine>" not in notices[0]


def test_notice_current_set_awaiting_remediation(repo: Path):
    current_set = _make_set_in_repo(
        repo,
        "current",
        state_content=_state(
            "in-progress", [_work(1, "complete"), _verif(verdict="ISSUES_FOUND")]
        ),
        mode=D,
        issues_content={"issues": [_issue(resolved=False)]},
    )
    notices = pv.pending_verification_notices(current_set)
    assert len(notices) == 1
    assert "remediation owed" in notices[0]


def test_notice_current_set_awaiting_human(repo: Path):
    issue = _issue()
    issue["resolution_status"] = "escalate-human"
    current_set = _make_set_in_repo(
        repo,
        "current",
        state_content=_state(
            "in-progress", [_work(1, "complete"), _verif(verdict="ISSUES_FOUND")]
        ),
        mode=D,
        issues_content={"issues": [issue]},
    )
    notices = pv.pending_verification_notices(current_set)
    assert len(notices) == 1
    assert "stopped to a human" in notices[0]


def test_no_notice_current_set_verified_or_in_progress(repo: Path):
    verified_set = _make_set_in_repo(
        repo,
        "verified",
        state_content=_state(
            "in-progress", [_work(1, "complete"), _verif(verdict="VERIFIED")]
        ),
        mode=D,
    )
    assert pv.pending_verification_notices(verified_set) == []

    wip_set = _make_set_in_repo(
        repo,
        "wip",
        state_content=_state("in-progress", [_work(1, "in-progress")]),
        mode=D,
    )
    assert pv.pending_verification_notices(wip_set) == []


def test_notice_sibling_mode_a_completed_owed_no_file(repo: Path):
    _make_set_in_repo(
        repo,
        "completed-sibling",
        state_content=_state("complete", [_verif(verdict=None)]),
    )
    current_set = _make_set_in_repo(repo, "current", state_content=_state("not-started", []))
    notices = pv.pending_verification_notices(current_set)
    assert len(notices) == 1
    assert "external verification owed" in notices[0]
    assert "completed-sibling" in notices[0]


def test_notice_sibling_mode_a_completed_owed_issues_found(repo: Path):
    _make_set_in_repo(
        repo,
        "completed-sibling",
        state_content=_state("complete", [_verif(verdict=None)]),
        ext_verif_content="## Round 2\n\nVerdict: ISSUES_FOUND",
    )
    current_set = _make_set_in_repo(repo, "current", state_content=_state("not-started", []))
    notices = pv.pending_verification_notices(current_set)
    assert len(notices) == 1
    assert "review and respond" in notices[0]
    assert "round 2" in notices[0]


@pytest.mark.parametrize("verdict", ["VERIFIED", "WAIVED - budget constraints"])
def test_no_notice_sibling_mode_a_completed_not_owed(repo: Path, verdict: str):
    _make_set_in_repo(
        repo,
        "completed-sibling",
        state_content=_state("complete", [_verif(verdict=None)]),
        ext_verif_content=f"## Round 1\n\nVerdict: {verdict}",
    )
    current_set = _make_set_in_repo(repo, "current", state_content=_state("not-started", []))
    assert pv.pending_verification_notices(current_set) == []


def test_notice_sibling_most_recent_completed_only(repo: Path):
    # Older, owed sibling
    _make_set_in_repo(
        repo,
        "older-owed",
        state_content=_state(
            "complete",
            [_verif(None, completed_at="2023-01-01T00:00:00Z")],
            completed_at="2023-01-01T00:00:00Z",
        ),
    )
    # Newer, satisfied sibling
    _make_set_in_repo(
        repo,
        "newer-ok",
        state_content=_state(
            "complete",
            [_verif("VERIFIED", completed_at="2023-01-02T00:00:00Z")],
            completed_at="2023-01-02T00:00:00Z",
        ),
        mode=D,
    )
    current_set = _make_set_in_repo(repo, "current", state_content=_state("not-started", []))
    # Should be no notice, because the most recent completed set is fine.
    assert pv.pending_verification_notices(current_set) == []


def test_notices_max_cap(repo: Path, monkeypatch):
    monkeypatch.setattr(pv, "MAX_NOTICES", 2)
    for i in range(4):
        _make_set_in_repo(
            repo,
            f"owed-{i}",
            state_content=_state("in-progress", [_work(1, "complete")]),
            mode=D,
        )
    current_set = _make_set_in_repo(
        repo,
        "current",
        state_content=_state("in-progress", [_work(1, "complete")]),
        mode=D,
    )
    notices = pv.pending_verification_notices(current_set)
    # Current set + owed siblings, clipped at the (patched) cap.
    assert len(notices) == 2


def test_notices_robust_to_unreadable_sibling_state(repo: Path):
    bad_sibling = repo / "bad-sibling"
    bad_sibling.mkdir()
    (bad_sibling / "spec.md").touch()
    (bad_sibling / "session-state.json").write_text("{bad", encoding="utf-8")

    current_set = _make_set_in_repo(repo, "current", state_content=_state("not-started", []))
    # Should not raise, just quietly skips the bad sibling
    notices = pv.pending_verification_notices(current_set)
    assert notices == []


def test_format_banner_empty():
    assert pv.format_banner([]) == ""


def test_format_banner_single_notice():
    banner = pv.format_banner(["notice one"])
    lines = banner.split("\n")
    assert len(lines) == 4
    assert "PENDING VERIFICATION" in lines[1]
    assert "[dabbler]   notice one" in lines[2]
    assert lines[0] == lines[3]
    assert lines[0].startswith("[dabbler] ======")


def test_format_banner_multiple_notices():
    banner = pv.format_banner(["notice one", "notice two"])
    lines = banner.split("\n")
    assert len(lines) == 5
    assert "[dabbler]   notice one" in lines[2]
    assert "[dabbler]   notice two" in lines[3]



# ---------------------------------------------------------------------------
# CLI integration: the banner rides the work-session start (both tiers;
# the --no-router flag proves no router config is needed — Feature 4).
# ---------------------------------------------------------------------------

import start_session
from session_state import synthesize_not_started_state


def _fresh_work_set(repo_dir: Path, name: str = "078-next") -> Path:
    d = repo_dir / name
    d.mkdir()
    (d / "spec.md").write_text(
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\ntotalSessions: 1\ntier: lightweight\n```\n",
        encoding="utf-8",
    )
    synthesize_not_started_state(str(d))
    return d


def _start_args(set_dir: Path, extra: Optional[List[str]] = None):
    parser = start_session._build_arg_parser()
    argv = [
        "--session-set-dir", str(set_dir),
        "--engine", "copilot",
        "--provider", "anthropic",
    ] + (extra or [])
    return parser.parse_args(argv)


def test_banner_fires_on_work_start_with_owed_sibling(repo: Path, capsys):
    _make_set_in_repo(
        repo,
        "077-owed",
        state_content=_state("in-progress", [_work(1, "complete")]),
        mode=D,
    )
    new_set = _fresh_work_set(repo)
    exit_code = start_session.run(_start_args(new_set))
    assert exit_code == start_session.EXIT_OK
    err = capsys.readouterr().err
    assert "PENDING VERIFICATION" in err
    assert "077-owed" in err
    assert "verification owed" in err


def test_banner_fires_under_no_router_flag(repo: Path, capsys):
    _make_set_in_repo(
        repo,
        "077-owed",
        state_content=_state("in-progress", [_work(1, "complete")]),
        mode=D,
    )
    new_set = _fresh_work_set(repo)
    exit_code = start_session.main(
        [
            "--session-set-dir", str(new_set),
            "--engine", "copilot",
            "--provider", "anthropic",
            "--no-router",
        ]
    )
    assert exit_code == start_session.EXIT_OK
    err = capsys.readouterr().err
    assert "PENDING VERIFICATION" in err


def test_no_banner_when_nothing_owed(repo: Path, capsys):
    new_set = _fresh_work_set(repo)
    exit_code = start_session.run(_start_args(new_set))
    assert exit_code == start_session.EXIT_OK
    assert "PENDING VERIFICATION" not in capsys.readouterr().err
