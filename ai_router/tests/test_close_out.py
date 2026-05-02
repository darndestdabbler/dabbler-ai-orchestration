"""Tests for the mode-aware fresh close-out hook (Set 006 Session 2).

Covers:

* Outsource-first: hook routes a fresh turn via the injected ``route_fn``
  with ``task_type='session-close-out'``.
* Outsource-last: hook invokes ``close_session.run`` directly via the
  injected runner (no fresh API turn).
* Failure paths: missing disposition, non-completed disposition,
  invalid mode config, route_fn raising, runner raising — all return
  populated ``FreshCloseOutResult`` rather than raising.

The reconciler-recovery path (a failed close-out leaves the session in
``closeout_pending``, next sweep retries) is covered indirectly: the
hook's contract is "never raise", and the failure-result tests confirm
that the orchestrator wrapper would see a ``*_failed`` result and not
get a stray exception. The actual reconciler-sweep behavior is
exercised by ``test_reconciler.py``.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pytest

import close_out
from close_out import (
    SESSION_CLOSE_OUT_TASK_TYPE,
    FreshCloseOutResult,
    route_fresh_close_out_turn,
)
from disposition import Disposition, write_disposition
from session_state import (
    NextOrchestrator,
    NextOrchestratorReason,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _spec(tmp_path: Path, *, mode: str = "first", orchestrator: str = "claude",
          verifier: str = "openai") -> Path:
    """Build a session-set directory with a spec block for the given mode."""
    set_dir = tmp_path / "set"
    set_dir.mkdir(parents=True, exist_ok=True)
    if mode == "first":
        (set_dir / "spec.md").write_text(
            "# spec\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: first\n"
            "```\n",
            encoding="utf-8",
        )
    else:
        (set_dir / "spec.md").write_text(
            "# spec\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            f"outsourceMode: last\n"
            f"orchestratorRole: {orchestrator}\n"
            f"verifierRole: {verifier}\n"
            "```\n",
            encoding="utf-8",
        )
    return set_dir


def _valid_next_orc() -> NextOrchestrator:
    return NextOrchestrator(
        engine="claude-code",
        provider="anthropic",
        model="claude-opus-4-7",
        effort="high",
        reason=NextOrchestratorReason(
            code="continue-current-trajectory",
            specifics="stay on opus for the heavy lifting next session",
        ),
    )


def _completed_disposition(set_dir: Path, *, method: str = "api",
                           message_ids=None) -> Disposition:
    d = Disposition(
        status="completed",
        summary="work landed cleanly",
        verification_method=method,
        files_changed=[],
        verification_message_ids=list(message_ids or []),
        next_orchestrator=_valid_next_orc(),
        blockers=[],
    )
    write_disposition(str(set_dir), d)
    return d


# ---------------------------------------------------------------------------
# Outsource-first: routes a fresh turn
# ---------------------------------------------------------------------------

class TestOutsourceFirst:
    def test_routes_fresh_turn_with_close_out_task_type(self, tmp_path):
        set_dir = _spec(tmp_path, mode="first")
        _completed_disposition(set_dir, method="api")

        captured = {}

        def fake_route(*, content, task_type, session_set):
            captured["content"] = content
            captured["task_type"] = task_type
            captured["session_set"] = session_set
            # Return a stand-in route result; the hook only stores it
            # on the FreshCloseOutResult, so any non-None object works.
            return {"sentinel": "route-result"}

        out = route_fresh_close_out_turn(str(set_dir), route_fn=fake_route)

        assert out.result == "first_routed"
        assert out.mode == "first"
        assert out.error is None
        assert captured["task_type"] == SESSION_CLOSE_OUT_TASK_TYPE
        assert captured["session_set"] == str(set_dir)
        # The prompt must reference the canonical doc and the close_session
        # CLI verbatim — that's the single-source-of-truth handoff to the
        # routed agent.
        assert "ai_router/docs/close-out.md" in captured["content"]
        assert "ai_router.close_session" in captured["content"]
        assert out.route_result == {"sentinel": "route-result"}

    def test_route_fn_raising_lands_failed_result_without_propagating(
        self, tmp_path,
    ):
        set_dir = _spec(tmp_path, mode="first")
        _completed_disposition(set_dir)

        def boom(**_kwargs):
            raise RuntimeError("provider outage")

        out = route_fresh_close_out_turn(str(set_dir), route_fn=boom)

        assert out.result == "first_route_failed"
        assert out.error is not None
        assert "provider outage" in out.error
        assert out.route_result is None
        # The failure message hints at the recovery path so observers
        # know they don't need to retry by hand.
        assert any("reconciler" in m for m in out.messages)


# ---------------------------------------------------------------------------
# Outsource-last: invokes close_session directly
# ---------------------------------------------------------------------------

class TestOutsourceLast:
    def test_invokes_close_session_runner_directly(self, tmp_path):
        set_dir = _spec(tmp_path, mode="last")
        _completed_disposition(
            set_dir, method="queue", message_ids=["msg-1"],
        )

        captured = {}

        class FakeOutcome:
            result = "succeeded"
            exit_code = 0

        def fake_runner(args):
            captured["args"] = args
            return FakeOutcome()

        out = route_fresh_close_out_turn(
            str(set_dir),
            close_session_runner=fake_runner,
        )

        assert out.result == "last_invoked"
        assert out.mode == "last"
        assert out.error is None
        ns = captured["args"]
        assert isinstance(ns, argparse.Namespace)
        assert ns.session_set_dir == str(set_dir)
        # Defaults that matter for a non-interactive in-process call.
        assert ns.interactive is False
        assert ns.force is False
        assert ns.repair is False
        assert ns.manual_verify is False
        assert out.close_session_outcome.result == "succeeded"

    def test_runner_raising_lands_failed_result_without_propagating(
        self, tmp_path,
    ):
        set_dir = _spec(tmp_path, mode="last")
        _completed_disposition(
            set_dir, method="queue", message_ids=["m"],
        )

        def boom(_args):
            raise OSError("disk full")

        out = route_fresh_close_out_turn(
            str(set_dir), close_session_runner=boom,
        )

        assert out.result == "last_invocation_failed"
        assert out.error is not None
        assert "disk full" in out.error
        assert out.close_session_outcome is None

    def test_does_not_call_route_fn_in_last_mode(self, tmp_path):
        # Cost-control assertion: outsource-last must never route a
        # fresh API turn. If the hook ever did, the user would pay a
        # subscription-CLI call they explicitly declined by choosing
        # outsource-last.
        set_dir = _spec(tmp_path, mode="last")
        _completed_disposition(
            set_dir, method="queue", message_ids=["m"],
        )

        def must_not_be_called(**_kwargs):
            raise AssertionError("route_fn should not run in outsource-last")

        class FakeOutcome:
            result = "succeeded"
            exit_code = 0

        out = route_fresh_close_out_turn(
            str(set_dir),
            route_fn=must_not_be_called,
            close_session_runner=lambda _a: FakeOutcome(),
        )
        assert out.result == "last_invoked"


# ---------------------------------------------------------------------------
# Pre-flight skips
# ---------------------------------------------------------------------------

class TestPreflightSkips:
    def test_missing_disposition_skips(self, tmp_path):
        set_dir = _spec(tmp_path, mode="first")
        # No disposition.json written.

        called = {"route": False, "runner": False}

        def fake_route(**_kw):
            called["route"] = True
            return {}

        def fake_runner(_a):
            called["runner"] = True

        out = route_fresh_close_out_turn(
            str(set_dir),
            route_fn=fake_route,
            close_session_runner=fake_runner,
        )
        assert out.result == "skipped_disposition_missing"
        assert called == {"route": False, "runner": False}

    def test_failed_disposition_skips(self, tmp_path):
        set_dir = _spec(tmp_path, mode="first")
        write_disposition(str(set_dir), Disposition(
            status="failed",
            summary="work could not be verified",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=["blocker"],
        ))

        called = {"route": False}

        def fake_route(**_kw):
            called["route"] = True
            return {}

        out = route_fresh_close_out_turn(
            str(set_dir), route_fn=fake_route,
        )
        assert out.result == "skipped_disposition_not_completed"
        assert called["route"] is False

    def test_requires_review_disposition_skips(self, tmp_path):
        set_dir = _spec(tmp_path, mode="first")
        write_disposition(str(set_dir), Disposition(
            status="requires_review",
            summary="needs human eyes",
            verification_method="api",
            files_changed=[],
            verification_message_ids=[],
            next_orchestrator=None,
            blockers=[],
        ))
        out = route_fresh_close_out_turn(
            str(set_dir), route_fn=lambda **_: {},
        )
        assert out.result == "skipped_disposition_not_completed"

    def test_invalid_mode_config_skips(self, tmp_path):
        # outsourceMode: last with no role fields → validate_mode_config
        # rejects → hook refuses rather than silently routing.
        set_dir = tmp_path / "set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# spec\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "```\n",
            encoding="utf-8",
        )
        _completed_disposition(set_dir, method="api")

        out = route_fresh_close_out_turn(
            str(set_dir), route_fn=lambda **_: {},
        )
        assert out.result == "skipped_invalid_mode_config"
        assert out.error is not None
        assert "invalid mode config" in out.error


# ---------------------------------------------------------------------------
# CLI smoke
# ---------------------------------------------------------------------------

class TestCli:
    def test_cli_returns_zero_on_skip(self, tmp_path, capsys):
        set_dir = _spec(tmp_path, mode="first")
        # No disposition → skipped, not an error.
        rc = close_out.main(["--session-set-dir", str(set_dir)])
        assert rc == 0
        out = capsys.readouterr().out
        assert "skipped_disposition_missing" in out

    def test_cli_returns_one_on_invalid_mode(self, tmp_path, capsys):
        set_dir = tmp_path / "set"
        set_dir.mkdir()
        (set_dir / "spec.md").write_text(
            "# spec\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "```\n",
            encoding="utf-8",
        )
        _completed_disposition(set_dir, method="api")
        rc = close_out.main(["--session-set-dir", str(set_dir)])
        # Invalid mode config populates `error`, so exit 1.
        assert rc == 1
