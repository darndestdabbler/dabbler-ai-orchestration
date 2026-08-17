import copy

import pytest

KEY_ENV = {
    "anthropic": "TEST_ANTHROPIC_KEY",
    "google": "TEST_GOOGLE_KEY",
    "openai": "TEST_OPENAI_KEY",
}

_PROVIDER_TEMPLATE = {
    "rate_limit": {"requests_per_minute": 1000, "tokens_per_minute": 1000000},
    "timeout_seconds": 30,
    "retry": {"max_retries": 1, "backoff_base_seconds": 0},
}

_BASE_CONFIG = {
    "providers": {
        "anthropic": {
            "api_key_env": KEY_ENV["anthropic"],
            "base_url": "https://fake.anthropic.test/v1/messages",
            **_PROVIDER_TEMPLATE,
        },
        "google": {
            "api_key_env": KEY_ENV["google"],
            "base_url": "https://fake.google.test/v1beta",
            **_PROVIDER_TEMPLATE,
        },
        "openai": {
            "api_key_env": KEY_ENV["openai"],
            "base_url": "https://fake.openai.test/v1",
            **_PROVIDER_TEMPLATE,
        },
    },
    "models": {
        "flash": {
            "provider": "google", "model_id": "g-flash", "tier": 1,
            "input_cost_per_1m": 0.30, "output_cost_per_1m": 2.50,
            "max_context_tokens": 1000000, "max_output_tokens": 65536,
        },
        "pro": {
            "provider": "google", "model_id": "g-pro", "tier": 2,
            "max_context_tokens": 1000000, "max_output_tokens": 65536,
            "pricing": [
                {"input_cost_per_1m": 1.25, "output_cost_per_1m": 10.0,
                 "max_input_tokens": 200000},
                {"input_cost_per_1m": 2.5, "output_cost_per_1m": 15.0},
            ],
        },
        "sonnet": {
            "provider": "anthropic", "model_id": "a-sonnet", "tier": 2,
            "max_context_tokens": 200000, "max_output_tokens": 16000,
            "pricing": [
                {"input_cost_per_1m": 2.0, "output_cost_per_1m": 10.0},
                {"input_cost_per_1m": 3.0, "output_cost_per_1m": 15.0,
                 "effective_from": "2026-09-01"},
            ],
        },
        "opus": {
            "provider": "anthropic", "model_id": "a-opus", "tier": 3,
            "input_cost_per_1m": 5.0, "output_cost_per_1m": 25.0,
            "max_context_tokens": 200000, "max_output_tokens": 32000,
        },
        "gpt": {
            "provider": "openai", "model_id": "o-gpt", "tier": 3,
            "input_cost_per_1m": 2.5, "output_cost_per_1m": 15.0,
            "max_context_tokens": 272000, "max_output_tokens": 32000,
        },
        "gpt-mini": {
            "provider": "openai", "model_id": "o-mini", "tier": 2,
            "input_cost_per_1m": 0.75, "output_cost_per_1m": 4.50,
            "max_context_tokens": 400000, "max_output_tokens": 16000,
            "is_enabled_as_verifier": False,
        },
        "ghost": {
            "provider": "anthropic", "model_id": "a-ghost",
            "is_enabled": False, "is_enabled_as_verifier": False,
        },
    },
    "routing": {
        "tier1_max_complexity": 30,
        "tier2_max_complexity": 65,
        "default_tier": 2,
        "tier_assignments": {1: "flash", 2: "pro", 3: "opus"},
        "task_type_overrides": {"code-review": "sonnet"},
    },
    "complexity": {
        "weights": {
            "context_length": 0.30, "keyword_signals": 0.35,
            "task_type": 0.20, "explicit_hint": 0.15,
        },
        "context_length_scores": [
            {"max_chars": 500, "score": 10},
            {"max_chars": 2000, "score": 25},
            {"max_chars": 5000, "score": 45},
            {"max_chars": 10000, "score": 65},
            {"max_chars": 999999, "score": 85},
        ],
        "task_type_scores": {
            "code-review": 40, "architecture": 80, "formatting": 10,
            "general": 50,
        },
        "high_complexity_keywords": ["security", "concurrency"],
        "low_complexity_keywords": ["typo", "rename"],
    },
    "escalation": {
        "enabled": True,
        "max_escalations": 2,
        "triggers": {
            "empty_response": True,
            "max_tokens_hit": True,
            "min_output_tokens": 30,
            "refusal_detection": True,
        },
        "refusal_phrases": ["i can't help with", "i'm unable to"],
    },
    "transports": {
        "copilot-cli": {
            "lockfile": "copilot-catalog.lock",
            "roles": {
                "generator": {
                    "prefer": ["claude-x", "gpt-x", "gemini-x"],
                    "require_provider_in": ["anthropic", "openai", "google"],
                },
            },
        },
    },
    "metrics": {"enabled": True},
}


def make_config(**overrides) -> dict:
    """A deep copy of the schema-valid test config, with top-level keys
    replaced by *overrides*."""
    config = copy.deepcopy(_BASE_CONFIG)
    config.update(overrides)
    return config


@pytest.fixture
def base_config():
    return make_config()


@pytest.fixture
def provider_keys(monkeypatch):
    for env_var in KEY_ENV.values():
        monkeypatch.setenv(env_var, "test-key")


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    """Reset process-level state and scrub routing-relevant env vars so no
    test observes another's environment or the operator's real keys."""
    import importlib

    # ai_router.route the ATTRIBUTE is the route() function (shadowed by the
    # package __init__); import_module returns the module itself.
    route = importlib.import_module("ai_router.route")
    runtime_mode = importlib.import_module("ai_router.runtime_mode")

    for var in (
        "DABBLER_NO_ROUTER", "DABBLER_TRANSPORT", "AI_ROUTER_CONFIG",
        "AI_ROUTER_METRICS_PATH", "COPILOT_AGENT_SESSION_ID",
    ):
        monkeypatch.delenv(var, raising=False)
    for env_var in KEY_ENV.values():
        monkeypatch.delenv(env_var, raising=False)
    runtime_mode.reset_for_tests()
    route.reset_for_tests()
    yield
    runtime_mode.reset_for_tests()
    route.reset_for_tests()
