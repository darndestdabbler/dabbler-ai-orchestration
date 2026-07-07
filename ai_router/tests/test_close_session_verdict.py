"""Set 054 Session 2 — verificationVerdict persistence tests.

Coverage:
- ``resolve_close_verdict`` pure-function precedence rules
- ``close_session`` persists verdict to ``session-state.json``
- R4 invariant: re-close / repair-reflip with null verdict does NOT
  clobber a stored verdict (writer's ``if not None`` guard +
  ``_is_already_closed`` short-circuit)
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Optional

import pytest

import close_session
from close_session import resolve_close_verdict
from disposition import Disposition, write_disposition
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    _flip_state_to_closed,
    read_session_state,
    register_session_start,
)
from stamp_fixtures import write_stamped_evidence


# ---------------------------------------------------------------------------
# Helpers (mirrors test_close_session_snapshot_flip.py)
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


def _make_closeable(repo_root: Path, set_dir: Path, disposition: Disposition) -> None:
    write_disposition(str(set_dir), disposition)
    (set_dir / "change-log.md").write_text(
        "# change log\n\nSession 1 work landed.\n",
        encoding="utf-8",
    )
    _commit_and_push(repo_root, "land work")


def _corroborate_api_close(
    set_dir: Path, session_number: int, monkeypatch, tmp_path: Path,
    *, verdict: str = "VERIFIED",
) -> None:
    """Seed the evidence the Set 083/084 verification-integrity gate
    demands for an api-method close claiming a verdict: the raw
    verification artifact plus a STAMPED cross-provider
    session-verification metrics row (Set 084 F3 — a bare row no
    longer corroborates, and an unsettled close triggers the
    backstop). An ``ISSUES_FOUND`` claim additionally gets a
    Minor-only findings envelope so the claim reads as non-blocking
    (effectively VERIFIED for the loop, L-071-1) and the backstop
    stands down."""
    row = write_stamped_evidence(
        set_dir, session_number=session_number, content=f"{verdict}\n",
    )
    metrics = tmp_path / "router-metrics.jsonl"
    metrics.write_text(json.dumps(row) + "\n", encoding="utf-8")
    monkeypatch.setenv("AI_ROUTER_METRICS_PATH", str(metrics))
    if verdict == "ISSUES_FOUND":
        (set_dir / f"s{session_number}-issues.json").write_text(
            json.dumps({
                "schemaVersion": 1,
                "sessionNumber": session_number,
                "verificationRound": 1,
                "verificationVerdict": "ISSUES_FOUND",
                "issues": [{
                    "severity": "Minor",
                    "description": "nit recorded for the ledger",
                }],
            }, indent=2) + "\n",
            encoding="utf-8",
        )


# ---------------------------------------------------------------------------
# resolve_close_verdict — pure function unit tests
# ---------------------------------------------------------------------------

class TestResolveCloseVerdict:
    def test_none_disposition_returns_none(self):
        assert resolve_close_verdict(None) is None

    def test_explicit_verified_wins(self):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            verification_verdict="VERIFIED",
        )
        assert resolve_close_verdict(d) == "VERIFIED"

    def test_explicit_issues_found_wins(self):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            verification_verdict="ISSUES_FOUND",
        )
        assert resolve_close_verdict(d) == "ISSUES_FOUND"

    def test_explicit_extension_token_wins(self):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="api",
            verification_verdict="ISSUES_FOUND_RESOLVED_IN_FLIGHT",
        )
        assert resolve_close_verdict(d) == "ISSUES_FOUND_RESOLVED_IN_FLIGHT"

    def test_api_completed_derives_verified(self, capsys):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="api",
        )
        result = resolve_close_verdict(d)
        assert result == "VERIFIED"
        captured = capsys.readouterr()
        assert "NOTE" in captured.err

    def test_api_failed_derives_issues_found(self, capsys):
        d = Disposition(
            status="failed",
            summary="s",
            verification_method="api",
        )
        result = resolve_close_verdict(d)
        assert result == "ISSUES_FOUND"
        captured = capsys.readouterr()
        assert "NOTE" in captured.err

    def test_api_requires_review_derives_issues_found(self, capsys):
        d = Disposition(
            status="requires_review",
            summary="s",
            verification_method="api",
        )
        result = resolve_close_verdict(d)
        assert result == "ISSUES_FOUND"

    def test_manual_method_returns_none(self):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="manual-via-other-engine",
        )
        assert resolve_close_verdict(d) is None

    def test_skipped_method_returns_none(self):
        d = Disposition(
            status="completed",
            summary="s",
            verification_method="skipped",
        )
        assert resolve_close_verdict(d) is None

    def test_explicit_wins_over_api_derivation(self):
        d = Disposition(
            status="failed",
            summary="s",
            verification_method="api",
            verification_verdict="VERIFIED",  # explicit overrides status
        )
        assert resolve_close_verdict(d) == "VERIFIED"


# ---------------------------------------------------------------------------
# close_session persists verdict (integration)
# ---------------------------------------------------------------------------

class TestCloseSessionPersistsVerdict:
    def test_api_explicit_verdict_persisted(self, tmp_path: Path, monkeypatch):
        repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
        _make_closeable(repo, set_dir, Disposition(
            status="completed",
            summary="verdict threading test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
            verification_verdict="VERIFIED",
        ))
        _corroborate_api_close(set_dir, 1, monkeypatch, tmp_path)
        _commit_and_push(repo, "corroborating evidence")

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        state = read_session_state(str(set_dir))
        assert state is not None
        sessions = state.get("sessions", [])
        session1 = next((s for s in sessions if s.get("number") == 1), None)
        assert session1 is not None
        assert session1.get("verificationVerdict") == "VERIFIED"

    def test_api_status_derived_verdict_persisted(self, tmp_path: Path, monkeypatch):
        repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
        _make_closeable(repo, set_dir, Disposition(
            status="completed",
            summary="api-derived verdict test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
            # no explicit verification_verdict → should derive VERIFIED from status
        ))
        # The derived VERIFIED is a claimed verdict too (Set 083) — seed evidence.
        _corroborate_api_close(set_dir, 1, monkeypatch, tmp_path)
        _commit_and_push(repo, "corroborating evidence")

        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        state = read_session_state(str(set_dir))
        assert state is not None
        sessions = state.get("sessions", [])
        session1 = next((s for s in sessions if s.get("number") == 1), None)
        assert session1 is not None
        assert session1.get("verificationVerdict") == "VERIFIED"

    def test_manual_method_records_null_verdict(self, tmp_path: Path):
        repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
        _make_closeable(repo, set_dir, Disposition(
            status="completed",
            summary="manual verify test",
            verification_method="manual-via-other-engine",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
        ))

        args = _ns(
            session_set_dir=str(set_dir),
            manual_verify=True,
            interactive=True,
            reason_file=None,
        )
        # Inject attestation directly (no TTY in test)
        outcome = close_session.run(
            args,
            prompt_fn=lambda _: "operator-confirmed manually",
        )
        assert outcome.result == "succeeded", outcome.messages

        state = read_session_state(str(set_dir))
        sessions = state.get("sessions", [])
        session1 = next((s for s in sessions if s.get("number") == 1), None)
        assert session1 is not None
        # manual with no explicit verdict → null (not present or None)
        assert session1.get("verificationVerdict") is None


# ---------------------------------------------------------------------------
# R4 invariant: re-close / flip with null does not clobber stored verdict
# ---------------------------------------------------------------------------

class TestR4VerdicClobberInvariant:
    def test_flip_with_null_does_not_clobber_stored_verdict(self, tmp_path: Path, monkeypatch):
        """_flip_state_to_closed(verdict=None) must not overwrite an existing
        verdict already stored in session-state.json."""
        repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
        _make_closeable(repo, set_dir, Disposition(
            status="completed",
            summary="R4 re-close test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
            verification_verdict="VERIFIED",
        ))
        _corroborate_api_close(set_dir, 1, monkeypatch, tmp_path)
        _commit_and_push(repo, "corroborating evidence")

        # First close: persists VERIFIED
        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        state = read_session_state(str(set_dir))
        sessions = state.get("sessions", [])
        session1 = next((s for s in sessions if s.get("number") == 1), None)
        assert session1.get("verificationVerdict") == "VERIFIED"

        # Re-close attempt: should be a no-op (already closed)
        outcome2 = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome2.result == "noop_already_closed"

        # Verdict must be unchanged
        state2 = read_session_state(str(set_dir))
        sessions2 = state2.get("sessions", [])
        session1_after = next((s for s in sessions2 if s.get("number") == 1), None)
        assert session1_after.get("verificationVerdict") == "VERIFIED"

    def test_direct_flip_with_null_does_not_clobber(self, tmp_path: Path, monkeypatch):
        """Direct call to ``_flip_state_to_closed(verdict=None)`` on an
        already-stored verdict must not overwrite it via the writer's
        ``if not None`` guard.

        Approach: do a real close (verdict=ISSUES_FOUND stored), then call
        ``_flip_state_to_closed(verdict=None)`` again to confirm the stored
        value is preserved through the read-modify-write cycle.
        """
        repo, set_dir = _build_repo_with_set(tmp_path, total_sessions=1)
        _make_closeable(repo, set_dir, Disposition(
            status="failed",
            summary="R4 direct flip test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
            verification_verdict="ISSUES_FOUND",
        ))
        _corroborate_api_close(
            set_dir, 1, monkeypatch, tmp_path, verdict="ISSUES_FOUND",
        )
        _commit_and_push(repo, "corroborating evidence")

        # First close stores ISSUES_FOUND
        outcome = close_session.run(_ns(session_set_dir=str(set_dir)))
        assert outcome.result == "succeeded", outcome.messages

        # Now call _flip_state_to_closed directly with verdict=None on the
        # closed state — the writer guard must preserve the stored verdict.
        _flip_state_to_closed(str(set_dir), verification_verdict=None)

        loaded = read_session_state(str(set_dir))
        sessions = loaded.get("sessions", [])
        s1 = next((s for s in sessions if s.get("number") == 1), None)
        assert s1.get("verificationVerdict") == "ISSUES_FOUND", (
            "R4 invariant violated: _flip_state_to_closed with None "
            "must not overwrite an existing stored verdict"
        )
