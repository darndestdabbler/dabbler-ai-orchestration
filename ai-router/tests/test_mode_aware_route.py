"""Unit tests for mode-aware route() and verify() in ai-router/__init__.py.

Loads the package via ``importlib.util.spec_from_file_location`` (the
production import shape) so the tests exercise the public API rather
than the test-time bare-script import.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
AI_ROUTER_INIT = REPO_ROOT / "ai-router" / "__init__.py"
AI_ROUTER_DIR = REPO_ROOT / "ai-router"


@pytest.fixture(scope="module")
def ai_router():
    """Load ai-router as a real package and return the module."""
    spec = importlib.util.spec_from_file_location(
        "ai_router", str(AI_ROUTER_INIT),
        submodule_search_locations=[str(AI_ROUTER_DIR)],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["ai_router"] = mod
    spec.loader.exec_module(mod)
    return mod


# --------------------------------------------------------------------------
# Spec helpers
# --------------------------------------------------------------------------

def _write_spec_first(tmp_path):
    """Write a session-set spec declaring outsourceMode: first."""
    spec_dir = tmp_path / "set"
    spec_dir.mkdir()
    (spec_dir / "spec.md").write_text(
        "# Set\n\n## Session Set Configuration\n\n"
        "```yaml\n"
        "outsourceMode: first\n"
        "```\n",
        encoding="utf-8",
    )
    return spec_dir


def _write_spec_last(tmp_path, *, orchestrator="claude", verifier="openai"):
    """Write a session-set spec declaring outsourceMode: last."""
    spec_dir = tmp_path / "set"
    spec_dir.mkdir()
    (spec_dir / "spec.md").write_text(
        "# Set\n\n## Session Set Configuration\n\n"
        "```yaml\n"
        f"outsourceMode: last\n"
        f"orchestratorRole: {orchestrator}\n"
        f"verifierRole: {verifier}\n"
        "```\n",
        encoding="utf-8",
    )
    return spec_dir


# --------------------------------------------------------------------------
# _resolve_outsource_mode precedence
# --------------------------------------------------------------------------

class TestResolveOutsourceMode:
    def test_default_is_first_when_no_session_set(self, ai_router, monkeypatch):
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        mode, orch, ver = ai_router._resolve_outsource_mode(None, None)
        assert mode == "first"
        assert orch is None
        assert ver is None

    def test_explicit_mode_overrides_everything(self, ai_router, tmp_path, monkeypatch):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.setenv("AI_ROUTER_OUTSOURCE_MODE", "first")
        mode, orch, ver = ai_router._resolve_outsource_mode(
            str(spec_dir), "last"
        )
        assert mode == "last"
        # Explicit mode does not also pull role names from spec.
        assert orch is None
        assert ver is None

    def test_explicit_mode_invalid_raises(self, ai_router):
        with pytest.raises(ValueError):
            ai_router._resolve_outsource_mode(None, "bogus")

    def test_env_var_wins_over_spec(self, ai_router, tmp_path, monkeypatch):
        spec_dir = _write_spec_first(tmp_path)
        monkeypatch.setenv("AI_ROUTER_OUTSOURCE_MODE", "last")
        mode, orch, ver = ai_router._resolve_outsource_mode(
            str(spec_dir), None
        )
        assert mode == "last"
        # Env-var path does not populate role names.
        assert orch is None
        assert ver is None

    def test_env_var_typo_falls_back_to_spec(self, ai_router, tmp_path, monkeypatch):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.setenv("AI_ROUTER_OUTSOURCE_MODE", "lasr")
        mode, orch, ver = ai_router._resolve_outsource_mode(
            str(spec_dir), None
        )
        # Typo'd env var is ignored; spec's outsourceMode wins.
        assert mode == "last"
        assert orch == "claude"
        assert ver == "openai"

    def test_spec_path_used_when_present(self, ai_router, tmp_path, monkeypatch):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        mode, orch, ver = ai_router._resolve_outsource_mode(
            str(spec_dir), None
        )
        assert mode == "last"
        assert orch == "claude"
        assert ver == "openai"

    def test_spec_first_returns_first(self, ai_router, tmp_path, monkeypatch):
        spec_dir = _write_spec_first(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        mode, orch, ver = ai_router._resolve_outsource_mode(
            str(spec_dir), None
        )
        assert mode == "first"

    def test_invalid_spec_config_raises(self, ai_router, tmp_path, monkeypatch):
        # outsourceMode: last requires both role fields. Missing them →
        # validate_mode_config returns errors → resolver raises rather
        # than silently falling back to first.
        spec_dir = tmp_path / "set"
        spec_dir.mkdir()
        (spec_dir / "spec.md").write_text(
            "# Set\n\n## Session Set Configuration\n\n"
            "```yaml\n"
            "outsourceMode: last\n"
            "```\n",
            encoding="utf-8",
        )
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        with pytest.raises(ValueError, match="invalid mode config"):
            ai_router._resolve_outsource_mode(str(spec_dir), None)


# --------------------------------------------------------------------------
# route() in outsource-last mode
# --------------------------------------------------------------------------

class TestRouteOutsourceLast:
    def test_returns_pending_route_result(
        self, ai_router, tmp_path, monkeypatch
    ):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)

        result = ai_router.route(
            content="def add(a, b): return a + b",
            task_type="code-review",
            session_set=str(spec_dir),
            session_number=1,
            queue_base_dir=str(tmp_path / "provider-queues"),
        )
        assert result.pending is True
        assert result.message_id is not None
        assert result.queue_provider == "openai"
        # Generation fields are zero — no synchronous call ran.
        assert result.cost_usd == 0.0
        assert result.model_name == ""
        assert result.input_tokens == 0
        assert result.output_tokens == 0

    def test_message_actually_enqueued_to_verifier_queue(
        self, ai_router, tmp_path, monkeypatch
    ):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        queue_root = tmp_path / "provider-queues"

        result = ai_router.route(
            content="hello world",
            task_type="code-review",
            session_set=str(spec_dir),
            session_number=2,
            queue_base_dir=str(queue_root),
        )
        # Verify the message landed on the verifier provider's queue.
        from queue_db import QueueDB
        queue = QueueDB(provider="openai", base_dir=queue_root)
        msg = queue.get_message(result.message_id)
        assert msg is not None
        assert msg.from_provider == "claude"
        assert msg.task_type == "code-review"
        assert msg.payload["content"] == "hello world"
        assert msg.session_set == str(spec_dir)
        assert msg.session_number == 2

    def test_repeat_route_is_idempotent(
        self, ai_router, tmp_path, monkeypatch
    ):
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)
        kw = dict(
            content="same",
            task_type="code-review",
            session_set=str(spec_dir),
            session_number=3,
            queue_base_dir=str(tmp_path / "provider-queues"),
        )
        first = ai_router.route(**kw)
        second = ai_router.route(**kw)
        # Identical inputs → identical idempotency_key → same row id.
        assert first.message_id == second.message_id

    def test_session_verification_forced_synchronous(
        self, ai_router, tmp_path, monkeypatch
    ):
        # session-verification is in _FORCE_SYNC_TASK_TYPES, so even in
        # outsource-last mode it must run synchronously. Here we
        # short-circuit by failing the API call and asserting the call
        # path went through _init/pick_model rather than _enqueue.
        spec_dir = _write_spec_last(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)

        called = {}

        def _fake_pick_model(*args, **kwargs):
            called["picked"] = True
            raise RuntimeError("synchronous path entered")

        monkeypatch.setattr(ai_router, "pick_model", _fake_pick_model)
        with pytest.raises(RuntimeError, match="synchronous path"):
            ai_router.route(
                content="anything",
                task_type="session-verification",
                session_set=str(spec_dir),
                session_number=1,
                queue_base_dir=str(tmp_path / "provider-queues"),
            )
        assert called.get("picked") is True


# --------------------------------------------------------------------------
# verify() on a pending RouteResult
# --------------------------------------------------------------------------

class TestVerifyPending:
    def test_returns_pending_verification(self, ai_router):
        # Build a pending route result by hand (no real route() needed).
        rr = ai_router.RouteResult(
            content="",
            model_name="",
            model_id="",
            tier=0,
            input_tokens=0,
            output_tokens=0,
            cost_usd=0.0,
            total_cost_usd=0.0,
            complexity_score=0,
            escalated=False,
            escalation_history=[],
            elapsed_seconds=0.0,
            pending=True,
            message_id="msg-123",
            queue_provider="openai",
        )
        v = ai_router.verify(rr)
        assert v.pending is True
        assert v.message_id == "msg-123"
        assert v.queue_provider == "openai"
        assert v.verified is False
        assert v.verdict == "PENDING"
        # No synchronous verifier ran — costs are zero.
        assert v.verifier_cost_usd == 0.0


# --------------------------------------------------------------------------
# route() in first mode behaves unchanged
# --------------------------------------------------------------------------

class TestRouteFirstModeUnchanged:
    def test_first_mode_takes_synchronous_path(
        self, ai_router, tmp_path, monkeypatch
    ):
        spec_dir = _write_spec_first(tmp_path)
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)

        called = {}

        def _fake_pick_model(*args, **kwargs):
            called["picked"] = True
            # Raise so we don't actually call any API; we just want to
            # assert the synchronous code path was entered.
            raise RuntimeError("sync path")

        monkeypatch.setattr(ai_router, "pick_model", _fake_pick_model)
        with pytest.raises(RuntimeError, match="sync path"):
            ai_router.route(
                content="x",
                task_type="code-review",
                session_set=str(spec_dir),
                queue_base_dir=str(tmp_path / "provider-queues"),
            )
        assert called.get("picked") is True

    def test_no_session_set_defaults_to_first(
        self, ai_router, monkeypatch, tmp_path
    ):
        monkeypatch.delenv("AI_ROUTER_OUTSOURCE_MODE", raising=False)

        called = {}

        def _fake_pick_model(*args, **kwargs):
            called["picked"] = True
            raise RuntimeError("sync path")

        monkeypatch.setattr(ai_router, "pick_model", _fake_pick_model)
        with pytest.raises(RuntimeError):
            ai_router.route(
                content="x",
                task_type="code-review",
                queue_base_dir=str(tmp_path / "provider-queues"),
            )
        assert called.get("picked") is True


# --------------------------------------------------------------------------
# RouteResult / VerificationResult dataclass shape
# --------------------------------------------------------------------------

class TestDataclassFields:
    def test_route_result_has_pending_fields(self, ai_router):
        rr = ai_router.RouteResult(
            content="x", model_name="m", model_id="mid", tier=1,
            input_tokens=0, output_tokens=0, cost_usd=0.0, total_cost_usd=0.0,
            complexity_score=0, escalated=False, escalation_history=[],
            elapsed_seconds=0.0,
        )
        assert rr.pending is False
        assert rr.message_id is None
        assert rr.queue_provider is None

    def test_verification_result_has_pending_fields(self, ai_router):
        v = ai_router.VerificationResult(
            verdict="VERIFIED", verified=True, issues=[],
            verifier_model="m", verifier_provider="p",
            generator_model="g", generator_provider="gp",
            verifier_input_tokens=0, verifier_output_tokens=0,
            verifier_cost_usd=0.0, raw_response="",
        )
        assert v.pending is False
        assert v.message_id is None
        assert v.queue_provider is None
