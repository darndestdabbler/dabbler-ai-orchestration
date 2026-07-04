"""Tests for transport profile validation in ai_router.config.load_config.

Covers the Set 078 Session 2 code-review finding: API key validation
must be skipped when transport.profile is "copilot-cli".
"""

import textwrap
from pathlib import Path

import pytest
import config as config_mod  # type: ignore[import-not-found]

# A fake env var name used for testing API key checks.
_TEST_API_KEY_ENV = "AI_ROUTER_TESTS__SOME_PROVIDER_API_KEY"


def _write_config_yaml(target_dir: Path, content: str) -> Path:
    """Write the given content to router-config.yaml in the target dir."""
    path = target_dir / "router-config.yaml"
    path.write_text(textwrap.dedent(content), encoding="utf-8")
    return path


def test_load_config_default_api_profile_requires_api_keys(
    tmp_path: Path, monkeypatch
) -> None:
    """Regression: Default 'api' profile must check for provider API keys."""
    monkeypatch.delenv(_TEST_API_KEY_ENV, raising=False)
    config_path = _write_config_yaml(
        tmp_path,
        f"""
        providers:
          anthropic:
            api_key_env: {_TEST_API_KEY_ENV}
            enabled: true
        models: {{}}
        routing:
          tier_assignments: {{}}
        # No transport block -> defaults to profile: api
        """,
    )

    with pytest.raises(EnvironmentError) as excinfo:
        config_mod.load_config(str(config_path))

    assert f"Missing environment variable {_TEST_API_KEY_ENV}" in str(excinfo.value)


def test_load_config_copilot_cli_profile_skips_api_key_check(
    tmp_path: Path, monkeypatch
) -> None:
    """The 'copilot-cli' profile must skip provider API key validation."""
    monkeypatch.delenv(_TEST_API_KEY_ENV, raising=False)
    config_path = _write_config_yaml(
        tmp_path,
        f"""
        transport:
          profile: copilot-cli
        transports:
          copilot-cli:
            lockfile: "ai_router/copilot-seats.lock"
            roles: {{}}
        providers:
          anthropic:
            api_key_env: {_TEST_API_KEY_ENV}
            enabled: true
        models: {{}}
        routing:
          tier_assignments: {{}}
        """,
    )

    # This must NOT raise an EnvironmentError, even with the key missing.
    config = config_mod.load_config(str(config_path))
    assert config.get("transport", {}).get("profile") == "copilot-cli"


def test_load_config_raises_on_invalid_transport_profile(tmp_path: Path) -> None:
    """load_config must raise ValueError for an unknown transport.profile."""
    config_path = _write_config_yaml(
        tmp_path,
        """
        transport:
          profile: bogus-profile-name
        providers: {}
        models: {}
        routing:
          tier_assignments: {}
        """,
    )

    with pytest.raises(ValueError) as excinfo:
        config_mod.load_config(str(config_path))

    assert "transport.profile must be one of" in str(excinfo.value)
    assert "'bogus-profile-name'" in str(excinfo.value)


def test_load_config_raises_on_copilot_profile_with_missing_block(
    tmp_path: Path,
) -> None:
    """load_config must raise ValueError if copilot-cli profile is selected
    but its configuration block under transports is missing.
    """
    config_path = _write_config_yaml(
        tmp_path,
        """
        transport:
          profile: copilot-cli
        # Missing 'transports:' block entirely
        providers: {}
        models: {}
        routing:
          tier_assignments: {}
        """,
    )

    with pytest.raises(ValueError) as excinfo:
        config_mod.load_config(str(config_path))

    assert "transports.copilot-cli is missing" in str(excinfo.value)


def test_load_config_respects_local_override_disabling_a_provider(
    tmp_path: Path, monkeypatch
) -> None:
    """Session-verification finding (Set 078 S2): API-key validation ran
    against the pre-local-override config, so a local-overrides.yaml that
    disables a provider (providers.<id>.enabled: false, an existing
    supported override path) was not respected -- the shared config's
    "enabled: true" stuck regardless. local-overrides.yaml must be merged
    BEFORE the API-key check runs.
    """
    monkeypatch.delenv(_TEST_API_KEY_ENV, raising=False)
    config_path = _write_config_yaml(
        tmp_path,
        f"""
        providers:
          anthropic:
            api_key_env: {_TEST_API_KEY_ENV}
            enabled: true
        models: {{}}
        routing:
          tier_assignments: {{}}
        """,
    )
    (tmp_path / "local-overrides.yaml").write_text(
        textwrap.dedent(
            """
            providers:
              anthropic:
                enabled: false
            """
        ),
        encoding="utf-8",
    )

    # Must NOT raise, even though the key is genuinely absent: the local
    # override disabling anthropic must be applied before the key check.
    config = config_mod.load_config(str(config_path))
    assert config["providers"]["anthropic"]["enabled"] is False
