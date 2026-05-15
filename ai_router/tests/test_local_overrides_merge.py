"""Tests for local-overrides.yaml merge logic in config.load_config."""

import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest
import config as config_mod  # type: ignore[import-not-found]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_MINIMAL_RC = textwrap.dedent("""\
    metadata:
      pricing_reviewed: "2099-01-01"
      review_frequency_days: 3650
    providers:
      anthropic:
        display_label: Anthropic
        enabled: true
        api_key_env: FAKE_ANTHROPIC_KEY
        base_url: https://api.anthropic.com/v1/messages
        api_version: "2023-06-01"
        rate_limit:
          requests_per_minute: 10
          tokens_per_minute: 10000
        timeout_seconds: 30
        retry:
          max_retries: 1
          backoff_base_seconds: 1
    models:
      test-model:
        provider: anthropic
        model_id: claude-test
        tier: 1
        is_enabled: true
        is_enabled_as_verifier: false
        input_cost_per_1m: 1.0
        output_cost_per_1m: 5.0
        max_context_tokens: 100000
        max_output_tokens: 4096
    routing:
      outsourcing_mode: whenever-helpful
      tier1_max_complexity: 30
      tier2_max_complexity: 65
      default_tier: 1
      tier_assignments:
        1: test-model
      task_type_overrides: {}
    delegation:
      always_route_task_types: []
    task_type_params: {}
    complexity:
      weights:
        context_length: 0.5
        keyword_signals: 0.5
        task_type: 0.0
        explicit_hint: 0.0
      context_length_scores:
        - {max_chars: 999999, score: 50}
      task_type_scores:
        general: 50
      high_complexity_keywords: []
      low_complexity_keywords: []
    escalation:
      enabled: false
      max_escalations: 0
      triggers:
        empty_response: false
        max_tokens_hit: false
        min_output_tokens: 0
        refusal_detection: false
      refusal_phrases: []
    verification:
      enabled: false
      preferred_pairings: {}
      auto_verify_task_types: []
      settings:
        check_categories: []
        on_disagreement: merge
        on_disagreement_by_task_type: {}
        tiebreaker_model: test-model
        max_cost_multiplier: 1.0
        prompt_template_file: null
    metrics:
      enabled: false
      log_filename: test-metrics.jsonl
    state:
      db_path: test-state.db
      log_prompts: false
      log_responses: false
    output:
      cost_report_on_exit: false
      verbose: false
""")


def _setup_workspace(tmp_path: Path, overrides_yaml: str | None = None) -> Path:
    """Write a minimal workspace and return the path to router-config.yaml."""
    ai_router_dir = tmp_path / "ai_router"
    ai_router_dir.mkdir()
    rc = ai_router_dir / "router-config.yaml"
    rc.write_text(_MINIMAL_RC, encoding="utf-8")
    if overrides_yaml is not None:
        lo = ai_router_dir / "local-overrides.yaml"
        lo.write_text(textwrap.dedent(overrides_yaml), encoding="utf-8")
    return rc


def _load(rc_path: Path, monkeypatch) -> dict:
    """Load config with the fake API key set."""
    monkeypatch.setenv("FAKE_ANTHROPIC_KEY", "fake-key-value")
    return config_mod.load_config(str(rc_path))


# ---------------------------------------------------------------------------
# Precedence: local wins over shared
# ---------------------------------------------------------------------------


def test_local_outsourcing_mode_overrides_shared(tmp_path: Path, monkeypatch) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        routing:
          outsourcing_mode: disabled
    """)
    cfg = _load(rc, monkeypatch)
    assert cfg["routing"]["outsourcing_mode"] == "disabled"


def test_local_provider_display_label_overrides_shared(
    tmp_path: Path, monkeypatch
) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        providers:
          anthropic:
            display_label: Anthropic (local)
    """)
    cfg = _load(rc, monkeypatch)
    assert cfg["providers"]["anthropic"]["display_label"] == "Anthropic (local)"


def test_local_provider_enabled_false_overrides_shared(
    tmp_path: Path, monkeypatch
) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        providers:
          anthropic:
            enabled: false
    """)
    # With anthropic disabled, the API key check is skipped for it.
    # Load should succeed even if the key were missing, but we still set it
    # to keep the fixture simple.
    monkeypatch.setenv("FAKE_ANTHROPIC_KEY", "key")
    cfg = config_mod.load_config(str(rc))
    assert cfg["providers"]["anthropic"]["enabled"] is False


def test_local_only_section_notifications_merged(
    tmp_path: Path, monkeypatch
) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        notifications:
          pushover_enabled: true
          user_key_env: PUSHOVER_USER_KEY
    """)
    cfg = _load(rc, monkeypatch)
    assert cfg["notifications"]["pushover_enabled"] is True


def test_local_only_section_decision_review_merged(
    tmp_path: Path, monkeypatch
) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        decision_review:
          honor_annotations: false
    """)
    cfg = _load(rc, monkeypatch)
    assert cfg["decision_review"]["honor_annotations"] is False


# ---------------------------------------------------------------------------
# Allowlist violations
# ---------------------------------------------------------------------------


def test_disallowed_routing_field_raises(tmp_path: Path, monkeypatch) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        routing:
          tier1_max_complexity: 99
    """)
    with pytest.raises(ValueError, match="not allowed as a local override"):
        _load(rc, monkeypatch)


def test_disallowed_provider_field_raises(tmp_path: Path, monkeypatch) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        providers:
          anthropic:
            api_key_env: DIFFERENT_KEY
    """)
    with pytest.raises(ValueError, match="not allowed as a local override"):
        _load(rc, monkeypatch)


# ---------------------------------------------------------------------------
# Local-only providers / models rejected
# ---------------------------------------------------------------------------


def test_new_provider_in_local_overrides_raises(tmp_path: Path, monkeypatch) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        providers:
          newprovider:
            display_label: New
    """)
    with pytest.raises(ValueError, match="does not exist in router-config.yaml"):
        _load(rc, monkeypatch)


# ---------------------------------------------------------------------------
# Unknown keys — warn and ignore
# ---------------------------------------------------------------------------


def test_unknown_top_level_key_warns_and_ignores(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    rc = _setup_workspace(tmp_path, overrides_yaml="""\
        some_unknown_key: true
    """)
    cfg = _load(rc, monkeypatch)
    captured = capsys.readouterr()
    assert "unknown key" in captured.err.lower() or "unknown" in captured.err
    assert "some_unknown_key" not in cfg
