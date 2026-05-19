"""Tests for ``delegation.decision_consensus`` schema validation.

Exercises ``config._validate_decision_consensus`` directly so a
schema-violation assertion does not need to also satisfy
``load_config``'s full provider/API-key sanity checks. The validator
runs at the same load_config boundary the existing tier_assignments
check does, so its behavior in isolation is the contract consumer
repos depend on.
"""

import pytest

import config as config_mod  # type: ignore[import-not-found]


def _models_fixture() -> dict:
    """Return a minimal ``models:`` table covering the engines used in
    these tests. The validator only reads ``provider`` per model."""
    return {
        "gpt-5-4": {"provider": "openai"},
        "gemini-pro": {"provider": "google"},
        "sonnet": {"provider": "anthropic"},
    }


def _make_config(decision_consensus: dict | None) -> dict:
    cfg = {"models": _models_fixture(), "delegation": {}}
    if decision_consensus is not None:
        cfg["delegation"]["decision_consensus"] = decision_consensus
    return cfg


# --- Absent block is a no-op ---------------------------------------------


def test_absent_block_is_accepted() -> None:
    config_mod._validate_decision_consensus({"models": _models_fixture()})


def test_absent_block_under_delegation_is_accepted() -> None:
    config_mod._validate_decision_consensus(_make_config(None))


# --- Default-shaped block is accepted ------------------------------------


def test_default_shape_accepted() -> None:
    cfg = _make_config({
        "enabled": False,
        "engines": ["openai:gpt-5-4", "google:gemini-pro"],
        "categories": [
            "refactor-placement",
            "file-layout",
            "scoping",
            "spec-clarification",
        ],
        "unresolved_action": "ask_user",
        "journal_path": "ai_router/consensus-decisions.jsonl",
        "journal_full_payloads_dir": "ai_router/consensus-decisions",
    })
    config_mod._validate_decision_consensus(cfg)


def test_null_payload_dir_accepted() -> None:
    cfg = _make_config({
        "enabled": True,
        "engines": ["openai:gpt-5-4"],
        "journal_full_payloads_dir": None,
    })
    config_mod._validate_decision_consensus(cfg)


# --- enabled must be bool ------------------------------------------------


def test_enabled_must_be_bool() -> None:
    cfg = _make_config({"enabled": "yes"})
    with pytest.raises(ValueError, match="enabled must be a boolean"):
        config_mod._validate_decision_consensus(cfg)


# --- engines validation --------------------------------------------------


def test_engine_must_be_provider_colon_model() -> None:
    cfg = _make_config({"enabled": True, "engines": ["gpt-5-4"]})
    with pytest.raises(ValueError, match="'provider:model'"):
        config_mod._validate_decision_consensus(cfg)


def test_engine_unknown_model_rejected() -> None:
    cfg = _make_config({"enabled": True, "engines": ["openai:not-a-model"]})
    with pytest.raises(ValueError, match="unknown model 'not-a-model'"):
        config_mod._validate_decision_consensus(cfg)


def test_engine_provider_mismatch_rejected() -> None:
    # gpt-5-4 is registered under provider 'openai' in the fixture.
    cfg = _make_config({"enabled": True, "engines": ["anthropic:gpt-5-4"]})
    with pytest.raises(ValueError, match="provider mismatch"):
        config_mod._validate_decision_consensus(cfg)


def test_engine_provider_missing_in_model_rejected() -> None:
    # Round-A verifier finding (Set 031 S1): a model entry that lacks a
    # provider key would silently pass the mismatch check because the
    # comparison short-circuited on empty model_provider. The validator
    # must reject this — the orchestrator cannot route to a
    # provider-less model.
    cfg = {
        "models": {"orphan": {}},  # no provider key at all
        "delegation": {
            "decision_consensus": {
                "enabled": True,
                "engines": ["anything:orphan"],
            }
        },
    }
    with pytest.raises(ValueError, match="missing a 'provider' key"):
        config_mod._validate_decision_consensus(cfg)


# --- categories validation -----------------------------------------------


def test_unknown_category_rejected() -> None:
    cfg = _make_config({"enabled": True, "categories": ["banana"]})
    with pytest.raises(ValueError, match="unknown"):
        config_mod._validate_decision_consensus(cfg)


def test_v15_v2_categories_accepted_forward_compat() -> None:
    # Operators must be able to opt these in without bumping the schema.
    cfg = _make_config({
        "enabled": True,
        "categories": ["testing-strategy", "api-surface", "design", "architecture"],
    })
    config_mod._validate_decision_consensus(cfg)


# --- unresolved_action validation ----------------------------------------


def test_unresolved_action_default_when_omitted() -> None:
    cfg = _make_config({"enabled": True})
    config_mod._validate_decision_consensus(cfg)


def test_unresolved_action_rejects_unknown_value() -> None:
    cfg = _make_config({"enabled": True, "unresolved_action": "shrug"})
    with pytest.raises(ValueError, match="unresolved_action"):
        config_mod._validate_decision_consensus(cfg)


def test_unresolved_action_proceed_value_accepted() -> None:
    cfg = _make_config({
        "enabled": True,
        "unresolved_action": "proceed_with_orchestrator_judgment",
    })
    config_mod._validate_decision_consensus(cfg)


# --- journal-path field shapes -------------------------------------------


def test_journal_path_must_be_string_or_null() -> None:
    cfg = _make_config({"enabled": True, "journal_path": 42})
    with pytest.raises(ValueError, match="journal_path"):
        config_mod._validate_decision_consensus(cfg)


def test_full_payload_dir_must_be_string_or_null() -> None:
    cfg = _make_config({"enabled": True, "journal_full_payloads_dir": ["a"]})
    with pytest.raises(ValueError, match="journal_full_payloads_dir"):
        config_mod._validate_decision_consensus(cfg)


# --- Forward-compat: unknown sub-keys are tolerated -----------------------


def test_unknown_subkey_tolerated() -> None:
    # V1.5 may add agreement_level heuristic config; we must not reject
    # an older reader running against a newer config that has the field.
    cfg = _make_config({"enabled": True, "agreement_level_thresholds": {"x": 1}})
    config_mod._validate_decision_consensus(cfg)
