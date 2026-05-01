"""End-to-end tests for the mode-aware fresh close-out hook.

Per Set 006 Session 2 acceptance criteria:

* Outsource-first: simulate work-agent producing disposition.json;
  orchestrator routes a fresh close-out turn; close_session runs;
  session closes.
* Outsource-last: same but orchestrator self-invokes close-out via the
  in-process runner; session closes via the queue path.
* Failure path: close-out turn fails; reconciler picks up the next
  sweep and recovers the session.

These tests exercise the *real* :func:`close_session.run` rather than
a fake runner — the hook's job is to invoke it correctly, and the
acceptance criterion is "session closes" end-to-end. The outsource-
first test still uses a fake ``route_fn`` because the routed agent is
the LLM that runs close_session inside its turn; faking that LLM is
the correct seam at this layer.
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

import close_out
import close_session
import reconciler
from disposition import Disposition, write_disposition
from session_events import (
    SessionLifecycleState,
    append_event,
    current_lifecycle_state,
    read_events,
)
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
    register_session_start,
)


# ---------------------------------------------------------------------------
# Repo helpers (kept inline to keep this file independently runnable)
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
            specifics="stay on opus for the heavy lifting in the next session",
        ),
    )


def _spec_block(mode: str) -> str:
    if mode == "first":
        return (
            "# spec\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: first\n"
            "```\n"
        )
    return (
        "# spec\n\n## Session Set Configuration\n\n"
        "```yaml\n"
        "outsourceMode: last\n"
        "orchestratorRole: claude\n"
        "verifierRole: openai\n"
        "```\n"
    )


def _make_repo_with_set(
    tmp_path: Path,
    *,
    mode: str,
    verification_method: str,
    message_ids: list[str] | None = None,
) -> Path:
    """Build a closeable session-set fixture parameterized by mode."""
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
    (set_dir / "spec.md").write_text(_spec_block(mode), encoding="utf-8")
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
    write_disposition(str(set_dir), Disposition(
        status="completed",
        summary="session 1 closed",
        verification_method=verification_method,
        files_changed=[],
        verification_message_ids=list(message_ids or []),
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    ))
    _git(root, "add", "-A")
    _git(root, "commit", "-m", "land set")
    _git(root, "push", "origin", "main")
    return set_dir


# ---------------------------------------------------------------------------
# Outsource-first end-to-end
# ---------------------------------------------------------------------------

def test_e2e_outsource_first_close_out_via_routed_turn(tmp_path: Path):
    """The routed agent is what calls close_session in outsource-first.

    We fake the routed agent (an LLM) by having ``route_fn`` invoke
    close_session.run synchronously in-process. The hook itself doesn't
    care which body is in the routed turn — its contract is to call
    route_fn with the right task type and prompt. End-to-end: the fake
    "agent" runs close_session, the session reaches CLOSED.
    """
    set_dir = _make_repo_with_set(
        tmp_path, mode="first", verification_method="api",
    )

    captured = {}

    def fake_route(*, content, task_type, session_set):
        captured["task_type"] = task_type
        captured["session_set"] = session_set
        # Simulate the routed agent reading the prompt and running
        # close_session in its own turn. In production this is an LLM
        # tool-use call; here we synchronously invoke close_session.run.
        import argparse
        ns = argparse.Namespace(
            session_set_dir=session_set,
            json=False, interactive=False, force=False,
            allow_empty_commit=False, reason_file=None,
            manual_verify=False, repair=False, apply=False, timeout=30,
        )
        cs_outcome = close_session.run(ns)
        return {"agent_ran_close_session": True, "result": cs_outcome.result}

    out = close_out.route_fresh_close_out_turn(
        str(set_dir), route_fn=fake_route,
    )

    assert out.result == "first_routed", out.error
    assert captured["task_type"] == "session-close-out"
    assert out.route_result["result"] == "succeeded"

    # End-to-end check: the session is closed.
    state = current_lifecycle_state(read_events(str(set_dir)))
    assert state == SessionLifecycleState.CLOSED


# ---------------------------------------------------------------------------
# Outsource-last end-to-end
# ---------------------------------------------------------------------------

def test_e2e_outsource_last_close_out_via_inprocess_runner(tmp_path: Path):
    """Outsource-last: orchestrator self-invokes close_session in-process.

    The verification_method is "queue" with a stub message id. The
    queue won't resolve it, so the gate's verification wait will time
    out — but for the close-out happy path, we use verification_method
    "api" with no message ids, mirroring how an outsource-last session
    reaches the close-out gate after its queued verifications have
    already completed and been written to disposition.json. The hook's
    job is to invoke close_session; that close_session knows how to
    handle either method.
    """
    # NOTE: We use verification_method="api" so the queue wait is
    # skipped (no message ids to wait on). The mode-aware aspect of
    # this test is that the hook does NOT route a fresh API turn; it
    # invokes close_session directly. That's what the assertion below
    # verifies.
    set_dir = _make_repo_with_set(
        tmp_path, mode="last", verification_method="api",
    )

    routed = {"called": False}

    def must_not_route(**_kwargs):
        routed["called"] = True
        raise AssertionError("outsource-last must not route a fresh turn")

    out = close_out.route_fresh_close_out_turn(
        str(set_dir),
        route_fn=must_not_route,
    )

    assert out.result == "last_invoked", out.error
    assert routed["called"] is False
    assert out.close_session_outcome is not None
    assert out.close_session_outcome.result == "succeeded"

    # End-to-end check: session is closed.
    state = current_lifecycle_state(read_events(str(set_dir)))
    assert state == SessionLifecycleState.CLOSED


# ---------------------------------------------------------------------------
# Failure path: hook fails, reconciler recovers
# ---------------------------------------------------------------------------

def test_e2e_close_out_failure_then_reconciler_recovery(tmp_path: Path):
    """A failed close-out turn leaves the session for the reconciler.

    Scenario:
      1. Hook fires. route_fn raises (provider outage).
      2. Hook returns ``first_route_failed`` without raising.
      3. The orchestrator wrapper continues; the session is left in
         ``closeout_pending`` (no closeout_succeeded event was emitted
         because no close_session ran).
      4. Next orchestrator startup runs the reconciler sweep.
      5. The reconciler finds the stranded session and re-runs
         close_session. The session reaches ``closed``.
    """
    set_dir = _make_repo_with_set(
        tmp_path, mode="first", verification_method="api",
    )

    # Step 1-2: hook fires, route_fn raises.
    def boom(**_kwargs):
        raise RuntimeError("anthropic 503 — provider outage")

    out = close_out.route_fresh_close_out_turn(
        str(set_dir), route_fn=boom,
    )
    assert out.result == "first_route_failed"
    assert "provider outage" in (out.error or "")

    # Step 3: simulate the orchestrator wrapper having marked the session
    # as closeout_pending after the routed turn failed. (Production-side,
    # this event would be appended by the wrapper; in this test we do it
    # directly so the reconciler's "stranded" detection kicks in.)
    append_event(
        str(set_dir),
        session_number=1,
        event_type="closeout_requested",
        trigger="fresh_turn_hook_failed",
    )

    # Antedate the event so it falls outside the reconciler's quiet
    # window — production sweeps run on a separate timeline; this
    # shortcut keeps the test deterministic.
    events_path = Path(set_dir) / "session-events.jsonl"
    lines = events_path.read_text(encoding="utf-8").splitlines()
    backdated_lines = []
    for line in lines:
        if not line.strip():
            backdated_lines.append(line)
            continue
        rec = json.loads(line)
        # Replace the timestamp on every event with one well beyond the
        # quiet window. read_events orders by line; the *last* event's
        # timestamp is what the reconciler reads to compute age.
        rec["timestamp"] = "2020-01-01T00:00:00.000Z"
        backdated_lines.append(json.dumps(rec, separators=(",", ":")))
    events_path.write_text("\n".join(backdated_lines) + "\n", encoding="utf-8")

    # Confirm the session is now stranded.
    state = current_lifecycle_state(read_events(str(set_dir)))
    assert state == SessionLifecycleState.CLOSEOUT_PENDING

    # Step 4-5: run the reconciler's sweep. Use the production runner
    # so we exercise the real close_session.run path.
    base_dir = set_dir.parent
    summary = reconciler.reconcile_sessions(base_dir=str(base_dir))
    assert len(summary.entries) == 1
    entry = summary.entries[0]
    assert entry.action == "rerun_succeeded", (
        entry.messages, entry.close_session_result,
    )

    # End-to-end: session is now closed.
    state = current_lifecycle_state(read_events(str(set_dir)))
    assert state == SessionLifecycleState.CLOSED


# ---------------------------------------------------------------------------
# Cost-control regression: outsource-last never adds API surface
# ---------------------------------------------------------------------------

def test_outsource_last_does_not_increase_api_surface(tmp_path: Path):
    """Per the spec acceptance: outsource-last has NO additional API
    cost from the fresh-turn pattern (since it self-invokes).

    Operationalized: the hook in outsource-last mode must invoke the
    close_session runner exactly once and must NEVER call route_fn.
    Any drift here would silently re-introduce the subscription-CLI
    cost we explicitly avoid by choosing outsource-last.
    """
    set_dir = _make_repo_with_set(
        tmp_path, mode="last", verification_method="api",
    )

    runner_calls = []
    route_calls = []

    def fake_runner(args):
        runner_calls.append(args.session_set_dir)
        return close_session.run(args)

    def must_not_route(**kwargs):
        route_calls.append(kwargs)
        raise AssertionError("outsource-last must not route()")

    out = close_out.route_fresh_close_out_turn(
        str(set_dir),
        route_fn=must_not_route,
        close_session_runner=fake_runner,
    )

    assert out.result == "last_invoked"
    assert len(runner_calls) == 1
    assert len(route_calls) == 0
