"""Set 109 S4 — the discovery fan-out's cheap-model preference.

Discovery runs K calls with IDENTICAL prompts and is bought for BREADTH of
findings, so it is the one verification surface where the cheap variant is the
right tool: ``gpt-5.6-luna`` bills $0.20/$1.20 against ``-sol``'s $5.00/$30.00.

The design constraint that shaped this, and that these tests exist to keep:
**it could not be a new task_type.** ``route()`` gates the dynamic orchestrator
exclusion on ``task_type == "session-verification"``, and that exclusion is the
only thing guaranteeing a session is not verified by its own provider. A
``session-verification-discovery`` task type would have looked correct and
silently dropped it. So the preference is a route() ARGUMENT, the task_type is
unchanged, and every one of its failure modes degrades to the pinned verifier
rather than to a weaker guarantee.

No test here opens a socket or loads the live registry: ``pick_model`` is
driven against synthetic configs so a Session-5 registry edit cannot make these
pass or fail for the wrong reason.
"""
from __future__ import annotations

import pytest

from ai_router import verify_session as vs
from ai_router.models import pick_model


PIN = "expensive-pinned"
CHEAP = "cheap-preferred"


def _config(**overrides):
    """A two-model tier-3 registry with the pin wired the way the real one is."""
    models = {
        PIN: {
            "provider": "openai", "model_id": "x-sol", "tier": 3,
            "is_enabled": True, "is_enabled_as_verifier": True,
            "input_cost_per_1m": 5.00, "output_cost_per_1m": 30.00,
        },
        CHEAP: {
            "provider": "openai", "model_id": "x-luna", "tier": 3,
            "is_enabled": True, "is_enabled_as_verifier": False,
            "input_cost_per_1m": 0.20, "output_cost_per_1m": 1.20,
        },
        "other-provider": {
            "provider": "google", "model_id": "g-pro", "tier": 3,
            "is_enabled": True, "is_enabled_as_verifier": True,
            "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00,
        },
    }
    for alias, patch in overrides.items():
        models[alias] = {**models[alias], **patch}
    return {
        "models": models,
        "routing": {
            "tier1_max_complexity": 30,
            "tier2_max_complexity": 65,
            "tier_assignments": {1: PIN, 2: PIN, 3: PIN},
            "task_type_overrides": {"session-verification": PIN},
        },
    }


def _pick(config, *, prefer=None, exclude=None, max_tier=3):
    return pick_model(
        90, max_tier, "session-verification", config,
        exclude_providers=exclude, prefer_model=prefer,
    )


# ---------------------------------------------------------------------------
# The preference itself
# ---------------------------------------------------------------------------


def test_the_preference_outranks_the_task_type_pin():
    """The whole point: discovery gets the cheap model, not the pin."""
    assert _pick(_config(), prefer=CHEAP) == CHEAP


def test_no_preference_leaves_the_pin_in_charge():
    """Deleting verification.discovery.model must restore the old behaviour
    exactly -- the preference is additive, not a rewrite of selection."""
    assert _pick(_config(), prefer=None) == PIN


def test_a_preference_does_not_leak_into_other_task_types():
    config = _config()
    assert pick_model(
        90, 3, "architecture", config, prefer_model=None,
    ) == PIN


# ---------------------------------------------------------------------------
# Every way the preference can be wrong degrades to the pin, never to a
# weaker guarantee. Each case was named by the routed design review.
# ---------------------------------------------------------------------------


def test_an_excluded_provider_beats_the_preference():
    """The load-bearing one. ``exclude_providers`` is a hard constraint and
    the preference is not allowed to reopen same-provider verification -- so
    when the cheap model's provider is excluded, selection must leave the
    provider entirely rather than fall back to the same-provider pin."""
    chosen = _pick(_config(), prefer=CHEAP, exclude=["openai"])
    assert chosen == "other-provider"


def test_a_disabled_preference_falls_through_to_the_pin():
    config = _config(**{CHEAP: {"is_enabled": False}})
    assert _pick(config, prefer=CHEAP) == PIN


def test_an_unknown_preference_falls_through_to_the_pin():
    """A typo in router-config.yaml degrades to the pinned verifier. It must
    not raise: a config nit is not worth voiding a mandatory gate."""
    assert _pick(_config(), prefer="no-such-model") == PIN


def test_a_preference_above_max_tier_falls_through_to_the_pin():
    config = _config(**{CHEAP: {"tier": 3}, PIN: {"tier": 2}})
    assert _pick(config, prefer=CHEAP, max_tier=2) == PIN


def test_a_malformed_preference_entry_falls_through_to_the_pin():
    """A tier that is not an integer must not blow up the comparison."""
    config = _config(**{CHEAP: {"tier": "three"}})
    assert _pick(config, prefer=CHEAP) == PIN


# ---------------------------------------------------------------------------
# Reading the knob
# ---------------------------------------------------------------------------


def test_the_model_knob_is_read_from_the_discovery_block():
    assert vs.load_discovery_model(
        {"verification": {"discovery": {"model": "gpt-5-6-luna"}}}
    ) == "gpt-5-6-luna"


@pytest.mark.parametrize("block", [
    {},
    {"verification": {}},
    {"verification": {"discovery": {}}},
    {"verification": {"discovery": {"model": ""}}},
    {"verification": {"discovery": {"model": "   "}}},
    {"verification": {"discovery": {"model": 7}}},
    {"verification": {"discovery": None}},
])
def test_an_absent_or_malformed_knob_reads_as_no_preference(block):
    assert vs.load_discovery_model(block) is None


def test_the_live_config_ships_the_mechanism_with_the_pin_UNSET():
    """The shipped state, and the reason for it.

    S4 first armed this pin on price alone. Its own verification caught that
    the spec's risk register requires evidence of finding QUALITY before the
    fan-out moves to a cheaper variant, and no such evidence exists -- what
    little there is points the wrong way. So the mechanism ships and the pin
    does not, and the fan-out keeps using the pinned verifier.

    This asserts the withdrawal rather than the arming, so re-arming it
    without an accompanying decision fails here first."""
    from ai_router.config import load_config

    config = load_config()
    assert vs.load_discovery_model(config) is None
    assert config["routing"]["task_type_overrides"][
        "session-verification"] == "gpt-5-6-sol"

    # Luna is still registered, priced, and enabled -- the split of the bare
    # `gpt-5.6` alias is the deliverable and stands on its own. It is NOT a
    # general verifier, so with the pin unset nothing routes verification to
    # it, and it cannot win a cheapest-survivor tiebreak for an adjudicating
    # round either.
    luna = config["models"]["gpt-5-6-luna"]
    assert luna["is_enabled"] is True
    assert luna["is_enabled_as_verifier"] is False
    assert luna["input_cost_per_1m"] == 0.20


def test_a_boolean_tier_does_not_pass_for_tier_one():
    """bools are ints in Python, so `tier: true` would satisfy a bare
    isinstance(..., int) check and compare as 1 -- a config typo silently
    becoming a valid tier-1 preference (project-guidance.md, the
    validator-parity convention)."""
    config = _config(**{CHEAP: {"tier": True}})
    assert _pick(config, prefer=CHEAP) == PIN
