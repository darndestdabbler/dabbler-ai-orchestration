"""Tests for the close-out reconciler.

Covers:

* The walk discovers session sets only via spec.md presence.
* A session that's not in a stranded lifecycle state is skipped.
* A stranded session younger than the quiet window is deferred.
* A stranded-and-old session triggers a re-run; the result is
  reflected in the entry's action.
* Per-set runner exceptions are logged but do not abort the sweep.
* The CLI emits both human-readable and JSON output cleanly.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import List

import pytest

import close_session
import reconciler
from session_events import append_event


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_set(tmp_path: Path, name: str, *, with_spec: bool = True) -> Path:
    """Create a minimal session-set directory under tmp_path."""
    set_dir = tmp_path / name
    set_dir.mkdir(parents=True)
    if with_spec:
        (set_dir / "spec.md").write_text("# spec\n", encoding="utf-8")
    return set_dir


def _add_event(
    set_dir: Path, event_type: str, *, session_number: int = 1, **fields,
):
    append_event(
        str(set_dir),
        event_type,
        session_number,
        **fields,
    )


def _backdate_last_event(set_dir: Path, minutes_ago: int) -> None:
    """Rewrite the last line of session-events.jsonl with an older timestamp.

    The reconciler's quiet-window check reads the most recent event's
    timestamp; this lets a test put a session set "old enough to be
    eligible for retry" without sleeping.
    """
    path = set_dir / "session-events.jsonl"
    lines = path.read_text(encoding="utf-8").splitlines()
    last = json.loads(lines[-1])
    last["timestamp"] = (
        datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    ).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    lines[-1] = json.dumps(last)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@dataclass
class _FakeOutcome:
    """Stand-in for close_session.CloseoutOutcome for runner injection."""

    result: str
    messages: List[str]


# ---------------------------------------------------------------------------
# Walk discovery
# ---------------------------------------------------------------------------

def test_walk_skips_non_session_set_directories(tmp_path: Path):
    """A directory without spec.md is not treated as a session set."""
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "real-set")
    _add_event(set_a, "work_started")

    # Decoy directory with no spec.md.
    (base / "scratch").mkdir()
    (base / "scratch" / "notes.txt").write_text("ignored\n", encoding="utf-8")

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        runner=lambda _d: _FakeOutcome(result="succeeded", messages=[]),
    )
    paths = [e.session_set_dir for e in summary.entries]
    assert str(set_a) in paths
    assert not any("scratch" in p for p in paths)


def test_walk_returns_empty_when_base_dir_missing(tmp_path: Path):
    summary = reconciler.reconcile_sessions(base_dir=str(tmp_path / "nope"))
    assert summary.entries == []


# ---------------------------------------------------------------------------
# Skipping rules
# ---------------------------------------------------------------------------

def test_session_in_progress_is_skipped(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "in-progress-set")
    # work_started only — lifecycle is WORK_IN_PROGRESS, not stranded.
    _add_event(set_a, "work_started")

    runner_calls: List[str] = []

    def runner(d: str) -> _FakeOutcome:
        runner_calls.append(d)
        return _FakeOutcome(result="succeeded", messages=[])

    summary = reconciler.reconcile_sessions(
        base_dir=str(base), runner=runner,
    )
    [entry] = summary.entries
    assert entry.action == "skipped_not_stranded"
    assert entry.lifecycle_state == "work_in_progress"
    assert runner_calls == []


def test_no_events_set_is_skipped(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    _make_set(base, "fresh-set")  # no events file at all

    summary = reconciler.reconcile_sessions(base_dir=str(base))
    [entry] = summary.entries
    assert entry.action == "skipped_no_events"


def test_recently_stranded_set_is_deferred_to_quiet_window(tmp_path: Path):
    """A stranded set whose last event is younger than the quiet window is skipped."""
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "recently-blocked")
    _add_event(set_a, "work_started")
    _add_event(set_a, "closeout_requested")
    # No backdating — the last event is "now".

    runner_calls: List[str] = []

    def runner(d: str) -> _FakeOutcome:
        runner_calls.append(d)
        return _FakeOutcome(result="succeeded", messages=[])

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=runner,
    )
    [entry] = summary.entries
    assert entry.action == "skipped_too_recent"
    assert entry.lifecycle_state == "closeout_pending"
    assert runner_calls == []


# ---------------------------------------------------------------------------
# Re-run dispatch
# ---------------------------------------------------------------------------

def test_old_stranded_set_triggers_rerun_and_records_result(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "old-blocked")
    _add_event(set_a, "work_started")
    _add_event(set_a, "closeout_requested")
    _backdate_last_event(set_a, minutes_ago=30)

    runner_calls: List[str] = []

    def runner(d: str) -> _FakeOutcome:
        runner_calls.append(d)
        return _FakeOutcome(
            result="succeeded",
            messages=["all gates passed"],
        )

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=runner,
    )
    [entry] = summary.entries
    assert entry.action == "rerun_succeeded"
    assert entry.close_session_result == "succeeded"
    assert "all gates passed" in entry.messages
    assert runner_calls == [str(set_a)]
    assert entry.last_event_age_minutes is not None
    assert entry.last_event_age_minutes >= 5


@pytest.mark.parametrize(
    "result_str, expected_action",
    [
        ("noop_already_closed", "rerun_succeeded"),
        ("gate_failed", "rerun_gate_failed"),
        ("verification_timeout", "rerun_verification_timeout"),
        ("lock_contention", "rerun_lock_contention"),
        ("repair_drift", "rerun_other"),
    ],
)
def test_action_mapping_for_each_close_session_result(
    tmp_path: Path, result_str: str, expected_action: str,
):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, f"set-for-{result_str}")
    _add_event(set_a, "work_started")
    _add_event(set_a, "closeout_requested")
    _backdate_last_event(set_a, minutes_ago=30)

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=lambda _d: _FakeOutcome(result=result_str, messages=[]),
    )
    [entry] = summary.entries
    assert entry.action == expected_action
    assert entry.close_session_result == result_str


def test_runner_exception_does_not_abort_sweep(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_bad = _make_set(base, "bad-set")
    set_good = _make_set(base, "good-set")
    for s in (set_bad, set_good):
        _add_event(s, "work_started")
        _add_event(s, "closeout_requested")
        _backdate_last_event(s, minutes_ago=30)

    def runner(d: str) -> _FakeOutcome:
        if "bad-set" in d:
            raise RuntimeError("simulated failure")
        return _FakeOutcome(result="succeeded", messages=[])

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=runner,
    )
    by_dir = {e.session_set_dir: e for e in summary.entries}
    assert by_dir[str(set_bad)].action == "error"
    assert any(
        "simulated failure" in m for m in by_dir[str(set_bad)].messages
    )
    assert by_dir[str(set_good)].action == "rerun_succeeded"


# ---------------------------------------------------------------------------
# Closed sessions are not re-run
# ---------------------------------------------------------------------------

def test_already_closed_session_is_skipped(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "closed-set")
    _add_event(set_a, "work_started")
    _add_event(set_a, "closeout_requested")
    _add_event(set_a, "closeout_succeeded")
    _backdate_last_event(set_a, minutes_ago=30)

    runner_calls: List[str] = []

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=lambda d: runner_calls.append(d) or _FakeOutcome("x", []),
    )
    [entry] = summary.entries
    assert entry.action == "skipped_not_stranded"
    assert entry.lifecycle_state == "closed"
    assert runner_calls == []


# ---------------------------------------------------------------------------
# Sweeper hook + format helpers
# ---------------------------------------------------------------------------

def test_register_sweeper_hook_invokes_callback_with_summary(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    seen: List[reconciler.ReconcileSummary] = []

    def callback(summary):
        seen.append(summary)

    hook = reconciler.register_sweeper_hook(callback, base_dir=str(base))
    summary = hook()
    assert isinstance(summary, reconciler.ReconcileSummary)
    assert seen == [summary]


def test_format_summary_shape(tmp_path: Path):
    base = tmp_path / "session-sets"
    base.mkdir()
    set_a = _make_set(base, "blocked")
    _add_event(set_a, "work_started")
    _add_event(set_a, "closeout_requested")
    _backdate_last_event(set_a, minutes_ago=30)

    summary = reconciler.reconcile_sessions(
        base_dir=str(base),
        quiet_window_minutes=5,
        runner=lambda _d: _FakeOutcome(result="gate_failed", messages=["foo"]),
    )
    text = reconciler.format_summary(summary)
    assert "rerun_gate_failed" in text
    assert "blocked" in text
    assert "foo" in text


def test_cli_json_output(tmp_path: Path, capsys):
    base = tmp_path / "session-sets"
    base.mkdir()
    rc = reconciler.main(["--base-dir", str(base), "--json"])
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["base_dir"] == str(base)
    assert payload["entries"] == []
    assert rc == 0


# ---------------------------------------------------------------------------
# Real end-to-end: stranded session is recovered through close_session
# ---------------------------------------------------------------------------

def test_reconciler_recovers_stranded_session_via_real_close_session(
    tmp_path: Path,
):
    """Wire the reconciler to the real close_session runner and confirm
    a stranded set transitions to closeout_succeeded.

    The set is built so the api-mode close-out's gate naturally passes;
    the only reason it's stuck is that an earlier closeout_requested
    event was emitted but no closeout_succeeded followed (simulating
    the case where the orchestrator was killed mid-Step-8).
    """
    import subprocess

    from disposition import Disposition, write_disposition
    from session_state import (
        NextOrchestrator,
        NextOrchestratorReason,
        register_session_start,
    )

    repo_root = tmp_path / "repo"
    repo_root.mkdir()

    def _git(*args):
        proc = subprocess.run(
            ["git", *args], cwd=str(repo_root),
            capture_output=True, text=True, check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(
                f"git {' '.join(args)} failed: {proc.stderr.strip()}"
            )
        return proc

    _git("init", "-b", "main")
    _git("config", "user.email", "test@example.invalid")
    _git("config", "user.name", "Test")
    _git("config", "commit.gpgsign", "false")
    (repo_root / "README.md").write_text("baseline\n", encoding="utf-8")
    _git("add", "README.md")
    _git("commit", "-m", "baseline")
    bare = tmp_path / "repo.git"
    bare.mkdir()
    subprocess.run(
        ["git", "init", "--bare", "-b", "main"],
        cwd=str(bare), check=True, capture_output=True,
    )
    _git("remote", "add", "origin", str(bare))
    _git("push", "-u", "origin", "main")

    sets_root = repo_root / "docs" / "session-sets"
    sets_root.mkdir(parents=True)
    set_dir = sets_root / "stranded"
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
    (set_dir / "activity-log.json").write_text(
        json.dumps({
            "sessionSetName": "stranded",
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
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="api-verified session",
        verification_method="api",
        files_changed=[],
        verification_message_ids=[],
        next_orchestrator=NextOrchestrator(
            engine="claude-code",
            provider="anthropic",
            model="claude-opus-4-7",
            effort="high",
            reason=NextOrchestratorReason(
                code="continue-current-trajectory",
                specifics="stay on opus for the heavy lifting in the next set",
            ),
        ),
        blockers=[],
    ))

    # Simulate a stranded close-out: append closeout_requested but
    # never the matching closeout_succeeded. Backdate so the
    # reconciler considers it eligible.
    append_event(str(set_dir), "closeout_requested", 1)
    _backdate_last_event(set_dir, minutes_ago=30)

    _git("add", "-A")
    _git("commit", "-m", "land set")
    _git("push", "origin", "main")

    summary = reconciler.reconcile_sessions(
        base_dir=str(sets_root),
        quiet_window_minutes=5,
    )
    [entry] = summary.entries
    assert entry.action == "rerun_succeeded", entry
    assert entry.close_session_result == "succeeded"

    # Confirm the close-out left a closeout_succeeded event behind.
    from session_events import read_events
    events = read_events(str(set_dir))
    succeeded_events = [
        e for e in events if e.event_type == "closeout_succeeded"
    ]
    assert len(succeeded_events) >= 1
