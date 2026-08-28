import pytest

from ai_router.identity import (
    IdentityResolutionError,
    classify_identity_provenance,
    resolve_model_provider,
    resolve_orchestrator_identity,
)

REGISTRY = {
    "sonnet": {"provider": "anthropic", "model_id": "claude-sonnet-5"},
    "gpt-5-4": {"provider": "openai", "model_id": "gpt-5.4"},
    "gemini-pro": {"provider": "google", "model_id": "gemini-2.5-pro"},
}


class TestModelResolution:
    def test_exact_registry_key(self):
        assert resolve_model_provider("sonnet", REGISTRY) == "anthropic"

    def test_exact_model_id(self):
        assert resolve_model_provider("gpt-5.4", REGISTRY) == "openai"

    def test_claude_date_suffix_stripped(self):
        assert resolve_model_provider(
            "claude-sonnet-5-20260101", REGISTRY
        ) == "anthropic"

    def test_date_strip_scoped_to_claude_only(self):
        # An invented dated variant of another provider's id must NOT
        # normalize onto a real entry.
        assert resolve_model_provider("gpt-5.4-20251001", REGISTRY) is None

    def test_unknown_model_is_none(self):
        assert resolve_model_provider("mystery-9000", REGISTRY) is None


class TestIdentityResolution:
    def test_model_wins_over_provider_label(self):
        identity = resolve_orchestrator_identity(
            {"engine": "claude-code", "provider": "openai", "model": "sonnet"},
            models_registry=REGISTRY,
        )
        assert identity.effective_provider == "anthropic"
        assert identity.source == "model-registry"

    def test_copilot_seat_label_never_trusted(self):
        with pytest.raises(IdentityResolutionError, match="multi-provider"):
            resolve_orchestrator_identity(
                {"engine": "github-copilot", "provider": "openai",
                 "model": "mystery-9000"},
                models_registry=REGISTRY,
            )

    def test_copilot_seat_without_model_fails_closed(self):
        with pytest.raises(IdentityResolutionError):
            resolve_orchestrator_identity(
                {"engine": "copilot", "provider": "openai"},
                models_registry=REGISTRY,
            )

    def test_single_vendor_engine_falls_back_to_label(self):
        identity = resolve_orchestrator_identity(
            {"engine": "gemini", "provider": "Google"},
            models_registry=REGISTRY,
        )
        assert identity.effective_provider == "google"
        assert identity.source == "provider-field"

    def test_missing_block_raises(self):
        with pytest.raises(IdentityResolutionError):
            resolve_orchestrator_identity(None, models_registry=REGISTRY)
        with pytest.raises(IdentityResolutionError):
            resolve_orchestrator_identity({}, models_registry=REGISTRY)

    def test_provenance_derived_from_engine(self):
        assert classify_identity_provenance("github-copilot") == "asserted"
        assert classify_identity_provenance("claude-code") == "direct"
        assert classify_identity_provenance("") is None
