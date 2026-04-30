"""Unit tests for the production ``run_verification`` in verifier_role.

Mocks ``call_model`` and ``load_config`` so the test never makes a real
API call. The default config exposes one provider with one verifier-
eligible model on it, which is the minimal shape the function needs.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

import verifier_role
from queue_db import QueueDB, QueueMessage


def _fake_config():
    """Minimal router config sufficient for run_verification."""
    return {
        "models": {
            "fake-claude": {
                "provider": "anthropic",
                "model_id": "claude-test",
                "tier": 3,
                "max_output_tokens": 4096,
                "input_cost_per_1m": 15.0,
                "output_cost_per_1m": 75.0,
                "is_enabled": True,
                "is_enabled_as_verifier": True,
                "_system_prompt": "You are an expert verifier.",
            },
            "fake-cheap": {
                "provider": "anthropic",
                "model_id": "claude-cheap",
                "tier": 2,
                "max_output_tokens": 2048,
                "input_cost_per_1m": 3.0,
                "output_cost_per_1m": 15.0,
                "is_enabled": True,
                "is_enabled_as_verifier": True,
            },
            "disabled-other": {
                "provider": "anthropic",
                "model_id": "claude-disabled",
                "tier": 3,
                "max_output_tokens": 4096,
                "input_cost_per_1m": 1.0,
                "output_cost_per_1m": 5.0,
                "is_enabled": False,
                "is_enabled_as_verifier": True,
            },
        },
        "providers": {
            "anthropic": {
                "rate_limit": {
                    "requests_per_minute": 60,
                    "tokens_per_minute": 100000,
                },
                "timeout_seconds": 30,
            },
        },
        "_verification_template": (
            "Task: {original_task}\n"
            "Type: {task_type}\n"
            "Response: {original_response}\n"
            "Verdict?\n"
        ),
    }


class _FakeApiResult:
    def __init__(self, content, in_tokens=100, out_tokens=50, stop="end_turn"):
        self.content = content
        self.input_tokens = in_tokens
        self.output_tokens = out_tokens
        self.stop_reason = stop


def _msg(payload, *, to_provider="anthropic", task_type="code-review"):
    return QueueMessage(
        id="msg-1",
        from_provider="openai",
        to_provider=to_provider,
        task_type=task_type,
        payload=payload,
        idempotency_key="k1",
        state="claimed",
        enqueued_at="2026-04-30T08:00:00+00:00",
    )


# --------------------------------------------------------------------------
# Happy path: VERIFIED verdict
# --------------------------------------------------------------------------

class TestRunVerificationVerified:
    def test_picks_cheapest_eligible_model_on_provider(self, monkeypatch):
        captured = {}

        def _fake_call(**kw):
            captured["model_id"] = kw["model_id"]
            captured["system_prompt"] = kw["system_prompt"]
            return _FakeApiResult("VERIFIED — looks good.")

        # Patch sibling-module imports the function uses.
        import config as cfg_mod  # type: ignore[import-not-found]
        import providers as prov_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: _fake_config())
        monkeypatch.setattr(prov_mod, "call_model", _fake_call)

        msg = _msg({
            "content": "def add(a, b): return a + b",
            "context": "tiny demo",
            "task_type": "code-review",
            "complexity_hint": 30,
            "max_tier": 3,
        })
        result = verifier_role.run_verification(msg)

        # Cheapest-output verifier on anthropic = fake-cheap (output 15.0
        # vs fake-claude's 75.0); disabled-other is excluded by is_enabled=False.
        assert result["verifier_model"] == "fake-cheap"
        assert captured["model_id"] == "claude-cheap"
        assert result["verifier_provider"] == "anthropic"
        assert result["verdict"] == "VERIFIED"
        assert result["verified"] is True
        assert isinstance(result["issues"], list)
        assert "raw_response" in result
        assert result["task_type"] == "code-review"
        assert result["session_set"] is None  # not provided in payload

    def test_cost_calculated_from_pricing(self, monkeypatch):
        import config as cfg_mod  # type: ignore[import-not-found]
        import providers as prov_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: _fake_config())
        monkeypatch.setattr(
            prov_mod, "call_model",
            lambda **kw: _FakeApiResult(
                "VERIFIED.",
                in_tokens=1_000_000, out_tokens=500_000,
            ),
        )
        msg = _msg({
            "content": "x", "context": "", "task_type": "code-review",
            "complexity_hint": 0, "max_tier": 3,
        })
        result = verifier_role.run_verification(msg)
        # fake-cheap: $3 input/M + $15 output/M → 3.0 + 7.5 = 10.5
        assert result["verifier_cost_usd"] == pytest.approx(10.5, rel=1e-6)

    def test_session_metadata_passed_through(self, monkeypatch):
        import config as cfg_mod  # type: ignore[import-not-found]
        import providers as prov_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: _fake_config())
        monkeypatch.setattr(
            prov_mod, "call_model",
            lambda **kw: _FakeApiResult("VERIFIED."),
        )
        msg = _msg({
            "content": "x", "context": "", "task_type": "code-review",
            "complexity_hint": 0, "max_tier": 3,
            "session_set": "docs/session-sets/foo",
            "session_number": 7,
        })
        result = verifier_role.run_verification(msg)
        assert result["session_set"] == "docs/session-sets/foo"
        assert result["session_number"] == 7


# --------------------------------------------------------------------------
# ISSUES_FOUND verdict
# --------------------------------------------------------------------------

class TestRunVerificationIssues:
    def test_issues_found_parsed(self, monkeypatch):
        import config as cfg_mod  # type: ignore[import-not-found]
        import providers as prov_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: _fake_config())
        monkeypatch.setattr(
            prov_mod, "call_model",
            lambda **kw: _FakeApiResult(
                "ISSUES FOUND\n"
                "- **Issue 1:** Off-by-one error\n"
                "  - **Category:** Correctness\n"
                "  - **Severity:** Major\n"
            ),
        )
        msg = _msg({
            "content": "x", "context": "", "task_type": "code-review",
            "complexity_hint": 0, "max_tier": 3,
        })
        result = verifier_role.run_verification(msg)
        assert result["verdict"] == "ISSUES_FOUND"
        assert result["verified"] is False


# --------------------------------------------------------------------------
# Error handling
# --------------------------------------------------------------------------

class TestRunVerificationErrors:
    def test_no_eligible_verifier_raises(self, monkeypatch):
        cfg = _fake_config()
        # Disable every model so the candidate list is empty.
        for m in cfg["models"].values():
            m["is_enabled"] = False
        import config as cfg_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: cfg)
        msg = _msg({
            "content": "x", "context": "", "task_type": "code-review",
            "complexity_hint": 0, "max_tier": 3,
        })
        with pytest.raises(RuntimeError, match="no enabled verifier"):
            verifier_role.run_verification(msg)

    def test_disabled_as_verifier_excluded(self, monkeypatch):
        cfg = _fake_config()
        # Mark fake-cheap not enabled-as-verifier so fake-claude wins.
        cfg["models"]["fake-cheap"]["is_enabled_as_verifier"] = False
        import config as cfg_mod  # type: ignore[import-not-found]
        import providers as prov_mod  # type: ignore[import-not-found]
        monkeypatch.setattr(cfg_mod, "load_config", lambda *_a, **_kw: cfg)
        captured = {}

        def _fake_call(**kw):
            captured["model_id"] = kw["model_id"]
            return _FakeApiResult("VERIFIED.")

        monkeypatch.setattr(prov_mod, "call_model", _fake_call)
        msg = _msg({
            "content": "x", "context": "", "task_type": "code-review",
            "complexity_hint": 0, "max_tier": 3,
        })
        result = verifier_role.run_verification(msg)
        assert result["verifier_model"] == "fake-claude"
        assert captured["model_id"] == "claude-test"
