"""Set 4 Session 3 — ``mark_session_complete`` runs the close-out gate.

Coverage:

1. **Gate-pass case (unit).** A mocked-passing gate flips the snapshot
   and emits a ``closeout_succeeded`` event with ``forced=False``.
2. **Gate-fail without force.** A failing gate raises
   :class:`CloseoutGateFailure` with the structured failure list,
   leaves the snapshot at ``in-progress``, and emits no event.
3. **Gate-fail with force.** A failing gate plus ``force=True`` logs
   a DEPRECATION warning, appends ``closeout_succeeded`` with
   ``forced=True`` and ``failed_checks=[...]``, and proceeds with the
   flip.
4. **Multi-failure case.** Two failing gates both surface in
   ``CloseoutGateFailure.failures``, and (under ``force=True``) both
   surface in the event payload.
5. **Integration end-to-end.** A real git repo + bare remote +
   disposition.json + activity-log.json reaches mark_session_complete
   with one failing gate (an unpushed commit) and surfaces the
   structured ``CloseoutGateFailure``. ``force=True`` overrides and
   the snapshot lands at ``closed``.

The unit tests stub :func:`close_session.run_gate_checks` so they do
not require a real git tree; the integration test uses the same real-
git fixture as ``test_close_session_session4.py`` so the assertion
chain reflects production behavior end-to-end.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import List

import pytest

import close_session
from disposition import Disposition, write_disposition
from session_events import read_events
from session_state import (
    CloseoutGateFailure,
    GateCheckFailure,
    NextOrchestrator,
    NextOrchestratorReason,
    SessionLifecycleState,
    mark_session_complete,
    read_session_state,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Fixtures + helpers
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
def started_session_set(tmp_path: Path) -> str:
    """A session-set directory with session-state.json + spec.md only.

    Just enough state for ``mark_session_complete`` to find the snapshot
    and read currentSession. The gate's verdict is whatever the test
    stubs ``run_gate_checks`` to return.
    """
    set_dir = tmp_path / "test-set"
    set_dir.mkdir()
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
    return str(set_dir)


def _stub_gate(
    monkeypatch: pytest.MonkeyPatch,
    results: List[close_session.GateResult],
) -> None:
    """Replace ``close_session.run_gate_checks`` with a stub returning *results*.

    The stub's signature accepts the public keyword args so any call-site
    drift between the test and the real implementation surfaces as a
    TypeError rather than a silent shadow.
    """
    def fake_run_gate_checks(
        session_set_dir: str,
        *,
        allow_empty_commit: bool = False,
    ) -> List[close_session.GateResult]:
        return list(results)

    monkeypatch.setattr(close_session, "run_gate_checks", fake_run_gate_checks)


# ===========================================================================
# Group 1: gate-pass / gate-fail mechanics (unit, stubbed gate)
# ===========================================================================

class TestGatePassFlipsSnapshot:
    def test_pass_case_flips_snapshot_and_emits_event(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(check="working_tree_clean", passed=True),
            close_session.GateResult(check="pushed_to_remote", passed=True),
        ])

        path = mark_session_complete(
            started_session_set, verification_verdict="VERIFIED",
        )

        assert path is not None
        state = read_session_state(started_session_set)
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value
        assert state["status"] == "complete"
        assert state["verificationVerdict"] == "VERIFIED"
        assert state["completedAt"] is not None

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is False
        assert succeeded[0].fields.get("verdict") == "VERIFIED"
        assert succeeded[0].fields.get("method") == "snapshot_flip"
        assert succeeded[0].session_number == 1
        # On the pass path, no failed_checks should ride along.
        assert "failed_checks" not in succeeded[0].fields

    def test_pass_case_without_verdict_omits_verdict_field(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(check="working_tree_clean", passed=True),
        ])

        mark_session_complete(started_session_set)

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert "verdict" not in succeeded[0].fields


class TestGateFailWithoutForce:
    def test_single_failure_raises_with_structured_failures(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean",
                passed=False,
                remediation="commit or stash docs/foo.md before close-out",
            ),
        ])

        with pytest.raises(CloseoutGateFailure) as exc_info:
            mark_session_complete(
                started_session_set, verification_verdict="VERIFIED",
            )

        failures = exc_info.value.failures
        assert len(failures) == 1
        assert isinstance(failures[0], GateCheckFailure)
        assert failures[0].check == "working_tree_clean"
        assert "commit or stash docs/foo.md" in failures[0].remediation
        # The exception's str form contains all the remediation strings.
        assert "commit or stash docs/foo.md" in str(exc_info.value)
        assert "working_tree_clean" in str(exc_info.value)

    def test_failure_does_not_flip_snapshot(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="pushed_to_remote",
                passed=False,
                remediation="git push origin main",
            ),
        ])

        with pytest.raises(CloseoutGateFailure):
            mark_session_complete(
                started_session_set, verification_verdict="VERIFIED",
            )

        # Snapshot must stay at in-progress.
        state = read_session_state(started_session_set)
        assert state["lifecycleState"] == SessionLifecycleState.WORK_IN_PROGRESS.value
        assert state["status"] == "in-progress"
        assert state["completedAt"] is None

    def test_failure_emits_no_event(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="activity_log_entry", passed=False,
                remediation="add at least one log_step entry",
            ),
        ])

        with pytest.raises(CloseoutGateFailure):
            mark_session_complete(started_session_set)

        events = read_events(started_session_set)
        assert events == [], (
            "no events should land when the gate rejects without force; "
            f"got: {[e.event_type for e in events]}"
        )

    def test_multiple_failures_all_surface(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
            close_session.GateResult(
                check="pushed_to_remote", passed=False,
                remediation="push to origin/main",
            ),
            close_session.GateResult(
                check="activity_log_entry", passed=True,
            ),
            close_session.GateResult(
                check="next_orchestrator_present", passed=False,
                remediation="set disposition.next_orchestrator",
            ),
        ])

        with pytest.raises(CloseoutGateFailure) as exc_info:
            mark_session_complete(started_session_set)

        names = [f.check for f in exc_info.value.failures]
        assert names == [
            "working_tree_clean",
            "pushed_to_remote",
            "next_orchestrator_present",
        ]
        # Order matches the GATE_CHECKS declaration order — the passing
        # check is dropped, but the surviving failures keep relative order.


class TestGateFailWithForce:
    def test_force_logs_deprecation_warning(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
        ])

        # session_state's logger has propagate=False (noisy DEPRECATION
        # warnings shouldn't bubble into the parent logging tree of an
        # embedding application), so caplog can't see the record without
        # an explicit handler attached. Add one for the test, then
        # detach in finally.
        records: List[logging.LogRecord] = []

        class _Capture(logging.Handler):
            def emit(self, record):
                records.append(record)

        ss_logger = logging.getLogger("ai_router.session_state")
        handler = _Capture(level=logging.WARNING)
        ss_logger.addHandler(handler)
        try:
            mark_session_complete(
                started_session_set,
                verification_verdict="VERIFIED",
                force=True,
            )
        finally:
            ss_logger.removeHandler(handler)

        deprecation_records = [
            r for r in records if "DEPRECATION" in r.getMessage()
        ]
        assert len(deprecation_records) == 1
        msg = deprecation_records[0].getMessage()
        assert "force=True" in msg
        assert "1 failing gate" in msg
        assert "working_tree_clean" in msg

    def test_force_emits_event_with_forced_true_and_failed_checks(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
            close_session.GateResult(
                check="pushed_to_remote", passed=False,
                remediation="push to origin/main",
            ),
        ])

        mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is True
        assert succeeded[0].fields.get("failed_checks") == [
            "working_tree_clean",
            "pushed_to_remote",
        ]
        assert succeeded[0].fields.get("verdict") == "VERIFIED"

    def test_force_flips_the_snapshot(
        self, started_session_set, monkeypatch,
    ):
        _stub_gate(monkeypatch, [
            close_session.GateResult(
                check="working_tree_clean", passed=False,
                remediation="commit pending edits",
            ),
        ])

        path = mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        assert path is not None
        state = read_session_state(started_session_set)
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value
        assert state["status"] == "complete"
        assert state["completedAt"] is not None

    def test_force_on_passing_gate_records_forced_false(
        self, started_session_set, monkeypatch,
    ):
        """``force=True`` is harmless on a passing gate — the event records
        ``forced=False`` because nothing was actually bypassed."""
        _stub_gate(monkeypatch, [
            close_session.GateResult(check="working_tree_clean", passed=True),
        ])

        mark_session_complete(
            started_session_set,
            verification_verdict="VERIFIED",
            force=True,
        )

        events = read_events(started_session_set)
        succeeded = [e for e in events if e.event_type == "closeout_succeeded"]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is False
        assert "failed_checks" not in succeeded[0].fields


class TestMarkCompleteEdgeCases:
    def test_missing_state_file_returns_none(self, tmp_path):
        """No state file at all → no-op return None, no gate run."""
        empty = tmp_path / "empty"
        empty.mkdir()
        result = mark_session_complete(str(empty))
        assert result is None

    def test_missing_state_file_with_force_still_returns_none(self, tmp_path):
        """force=True does not conjure a state file out of thin air."""
        empty = tmp_path / "empty"
        empty.mkdir()
        result = mark_session_complete(str(empty), force=True)
        assert result is None


# ===========================================================================
# Group 2: integration — end-to-end with real gate, real git
# ===========================================================================

@pytest.fixture
def integration_set(tmp_path: Path) -> Path:
    """Real git repo + bare remote + session-state + activity-log + spec.

    Mirrors test_close_session_session4.closeable_set so the integration
    assertions reflect production gate behavior. Disposition is NOT
    written here — individual tests author it as needed.
    """
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


def _commit_set(set_dir: Path) -> None:
    repo_root = set_dir
    while not (repo_root / ".git").exists():
        repo_root = repo_root.parent
    _git(repo_root, "add", "-A")
    _git(repo_root, "commit", "-m", "land work")


def _commit_and_push_set(set_dir: Path) -> None:
    _commit_set(set_dir)
    repo_root = set_dir
    while not (repo_root / ".git").exists():
        repo_root = repo_root.parent
    _git(repo_root, "push", "origin", "main")


class TestIntegrationFullCloseout:
    def test_failing_gate_blocks_flip_and_surfaces_remediation(
        self, integration_set,
    ):
        """Disposition is written and committed but NOT pushed → the
        ``pushed_to_remote`` gate fails and ``mark_session_complete``
        raises ``CloseoutGateFailure`` carrying the gate's remediation
        string. The snapshot stays in-progress; no event is appended.
        """
        write_disposition(str(integration_set), Disposition(
            status="completed",
            summary="integration test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
        ))
        _commit_set(integration_set)  # commit but don't push

        with pytest.raises(CloseoutGateFailure) as exc_info:
            mark_session_complete(
                str(integration_set), verification_verdict="VERIFIED",
            )

        failed_names = [f.check for f in exc_info.value.failures]
        assert "pushed_to_remote" in failed_names
        # Remediation strings must be non-empty (the spec requires them
        # to be specific enough to act on).
        for failure in exc_info.value.failures:
            assert failure.remediation.strip() != ""

        # Snapshot did not flip.
        state = read_session_state(str(integration_set))
        assert state["lifecycleState"] == SessionLifecycleState.WORK_IN_PROGRESS.value

        # No event landed.
        events = read_events(str(integration_set))
        assert not any(e.event_type == "closeout_succeeded" for e in events)

    def test_force_overrides_failing_gate_end_to_end(
        self, integration_set,
    ):
        """The same un-pushed disposition + ``force=True`` lands the
        snapshot at closed and emits a ``forced=True`` event."""
        write_disposition(str(integration_set), Disposition(
            status="completed",
            summary="integration test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
        ))
        _commit_set(integration_set)  # commit but don't push

        path = mark_session_complete(
            str(integration_set),
            verification_verdict="VERIFIED",
            force=True,
        )
        assert path is not None

        state = read_session_state(str(integration_set))
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value

        events = read_events(str(integration_set))
        succeeded = [
            e for e in events if e.event_type == "closeout_succeeded"
        ]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is True
        assert "pushed_to_remote" in succeeded[0].fields.get("failed_checks", [])

    def test_passing_gate_end_to_end(self, integration_set):
        """Disposition written, committed, pushed → all gates pass and
        the snapshot flips with ``forced=False``."""
        write_disposition(str(integration_set), Disposition(
            status="completed",
            summary="integration test",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=_valid_next_orc(),
            blockers=[],
        ))
        _commit_and_push_set(integration_set)

        path = mark_session_complete(
            str(integration_set), verification_verdict="VERIFIED",
        )
        assert path is not None

        state = read_session_state(str(integration_set))
        assert state["lifecycleState"] == SessionLifecycleState.CLOSED.value

        events = read_events(str(integration_set))
        succeeded = [
            e for e in events if e.event_type == "closeout_succeeded"
        ]
        assert len(succeeded) == 1
        assert succeeded[0].fields.get("forced") is False
        assert "failed_checks" not in succeeded[0].fields
