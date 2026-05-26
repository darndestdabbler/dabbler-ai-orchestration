"""Unit tests for the --no-router short-circuit in ai_router.route() / verify().

Set 048 Session 2 §3.1 A3: route() and verify() must return zero-cost
stubs when runtime_mode.is_no_router_mode() is True, WITHOUT calling
_init(), loading config, validating credentials, or making any HTTP
calls. The short-circuit is a defensive safety net for callers that
didn't check is_no_router_mode() before invoking.
"""
from __future__ import annotations

import pytest

import ai_router
import runtime_mode
from runtime_mode import ENV_VAR_NAME


@pytest.fixture(autouse=True)
def _reset_runtime_mode(monkeypatch):
    """Ensure each test starts with a clean runtime-mode cache + no env."""
    monkeypatch.delenv(ENV_VAR_NAME, raising=False)
    runtime_mode.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()


# ---------- route() short-circuit ----------


def test_route_short_circuits_under_no_router(monkeypatch):
    """route() returns a stub WITHOUT calling _init() or making any HTTP request."""
    monkeypatch.setenv(ENV_VAR_NAME, "1")

    # Sentinel: if route() actually tried to load config, the patched
    # _init would raise and the test would fail.
    def explode_if_called():
        raise AssertionError(
            "route() called _init() despite --no-router mode being active"
        )

    monkeypatch.setattr(ai_router, "_init", explode_if_called)

    result = ai_router.route(content="hello", task_type="general")

    assert result.model_name == "no-router-mode"
    assert result.model_id == "no-router-mode"
    assert result.tier == 0
    assert result.input_tokens == 0
    assert result.output_tokens == 0
    assert result.cost_usd == 0.0
    assert result.total_cost_usd == 0.0
    assert result.content == ""
    assert result.escalated is False
    assert result.escalation_history == []
    assert result.elapsed_seconds == 0.0
    assert result.truncated is False
    assert result.verification is None


def test_route_no_short_circuit_under_full_mode(monkeypatch):
    """Without --no-router mode, route() proceeds through _init()."""
    sentinel_called = {"value": False}

    def fake_init():
        sentinel_called["value"] = True
        raise RuntimeError("stopped after _init for test purposes")

    monkeypatch.setattr(ai_router, "_init", fake_init)

    with pytest.raises(RuntimeError, match="stopped after _init"):
        ai_router.route(content="hello")

    assert sentinel_called["value"] is True


# ---------- verify() short-circuit ----------


def test_verify_short_circuits_under_no_router(monkeypatch):
    """verify() returns a stub WITHOUT calling _init() or pickling a verifier."""
    monkeypatch.setenv(ENV_VAR_NAME, "1")

    def explode_if_called():
        raise AssertionError(
            "verify() called _init() despite --no-router mode being active"
        )

    monkeypatch.setattr(ai_router, "_init", explode_if_called)

    # Build a mock RouteResult to pass in.
    route_result = ai_router.RouteResult(
        content="generated stuff",
        model_name="claude-opus-4-7",
        model_id="claude-opus-4-7",
        tier=3,
        input_tokens=100,
        output_tokens=50,
        cost_usd=0.05,
        total_cost_usd=0.05,
        complexity_score=42,
        escalated=False,
        escalation_history=[],
        elapsed_seconds=1.0,
    )

    result = ai_router.verify(route_result=route_result, original_task="test")

    assert result.verdict == "no_router_skipped"
    assert result.verified is False
    assert result.issues == []
    assert result.verifier_model == "no-router-mode"
    assert result.verifier_provider == "no-router-mode"
    assert result.generator_model == "claude-opus-4-7"
    assert result.generator_provider == "no-router-mode"
    assert result.verifier_input_tokens == 0
    assert result.verifier_output_tokens == 0
    assert result.verifier_cost_usd == 0.0
    assert "no-router" in result.raw_response.lower()


def test_verify_no_short_circuit_under_full_mode(monkeypatch):
    """Without --no-router mode, verify() proceeds through _init()."""
    sentinel_called = {"value": False}

    def fake_init():
        sentinel_called["value"] = True
        raise RuntimeError("stopped after _init for test purposes")

    monkeypatch.setattr(ai_router, "_init", fake_init)

    route_result = ai_router.RouteResult(
        content="x",
        model_name="m",
        model_id="m",
        tier=1,
        input_tokens=0,
        output_tokens=0,
        cost_usd=0.0,
        total_cost_usd=0.0,
        complexity_score=0,
        escalated=False,
        escalation_history=[],
        elapsed_seconds=0.0,
    )

    with pytest.raises(RuntimeError, match="stopped after _init"):
        ai_router.verify(route_result=route_result)

    assert sentinel_called["value"] is True


# ---------- precedence integration ----------


def test_route_short_circuits_when_runtime_mode_cached(monkeypatch):
    """If resolve_no_router_mode was called explicitly, the cache wins."""
    runtime_mode.resolve_no_router_mode(cli_flag=True, session_set_dir=None)
    monkeypatch.setattr(
        ai_router,
        "_init",
        lambda: pytest.fail("route() should not reach _init under cached --no-router"),
    )
    result = ai_router.route(content="hi")
    assert result.model_name == "no-router-mode"
