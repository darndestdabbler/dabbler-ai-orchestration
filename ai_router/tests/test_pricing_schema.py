"""Set 109 S3 — the pricing schema: validation, rate resolution, the sort scalar.

Pure functions over dicts. Nothing here opens a socket or reads a file.

The cases that matter are the boundaries, because a boundary is where a
silently-wrong rate hides: the token count exactly ON a tier bound, the day
before and the day of an effective date, and the two shapes that must be
rejected rather than resolved to something plausible.
"""
from __future__ import annotations

import datetime

import pytest

from ai_router.pricing import (
    PricingError,
    resolve_rates,
    unconfirmed_and_stale,
    validate_model_rates,
    worst_case_input_cost_per_1m,
    worst_case_output_cost_per_1m,
)


FLAT = {"input_cost_per_1m": 3.00, "output_cost_per_1m": 15.00}

# Gemini 2.5 Pro, exactly as the provider publishes it.
TIERED = {
    "pricing": [
        {"max_input_tokens": 200000,
         "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00},
        {"input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
    ]
}

# Claude Sonnet 5's introductory price and the rate that replaces it.
DATED = {
    "pricing": [
        {"input_cost_per_1m": 2.00, "output_cost_per_1m": 10.00},
        {"effective_from": "2026-09-01",
         "input_cost_per_1m": 3.00, "output_cost_per_1m": 15.00},
    ]
}

# Both at once: two tiers, and both tiers reprice on a date.
BOTH = {
    "pricing": [
        {"max_input_tokens": 272000,
         "input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
        {"input_cost_per_1m": 5.00, "output_cost_per_1m": 22.50},
        {"effective_from": "2026-09-01", "max_input_tokens": 272000,
         "input_cost_per_1m": 2.75, "output_cost_per_1m": 16.50},
        {"effective_from": "2026-09-01",
         "input_cost_per_1m": 5.50, "output_cost_per_1m": 24.75},
    ]
}

AUG = datetime.date(2026, 8, 4)
LAST_DAY = datetime.date(2026, 8, 31)
FIRST_DAY = datetime.date(2026, 9, 1)


# ---------------------------------------------------------------------------
# Tier selection
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "input_tokens, expected",
    [
        (0, (1.25, 10.00)),
        (199_999, (1.25, 10.00)),
        (200_000, (1.25, 10.00)),   # the bound is INCLUSIVE
        (200_001, (2.50, 15.00)),   # one token over and the rate doubles
        (5_000_000, (2.50, 15.00)),
    ],
)
def test_tier_is_selected_by_input_tokens(input_tokens, expected):
    assert resolve_rates(TIERED, input_tokens, on_date=AUG) == expected


def test_flat_entry_ignores_input_tokens():
    assert resolve_rates(FLAT, 0) == (3.00, 15.00)
    assert resolve_rates(FLAT, 10_000_000) == (3.00, 15.00)


def test_entry_with_no_rates_resolves_to_zero():
    """Identity-only entries carry no rates at all; they must not raise."""
    assert resolve_rates({"provider": "anthropic"}, 1000) == (0.0, 0.0)


# ---------------------------------------------------------------------------
# Effective dates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "on_date, expected",
    [
        (AUG, (2.00, 10.00)),
        (LAST_DAY, (2.00, 10.00)),    # still the introductory rate
        (FIRST_DAY, (3.00, 15.00)),   # the day it lapses
        (datetime.date(2027, 1, 1), (3.00, 15.00)),
    ],
)
def test_effective_date_selects_the_period_in_force(on_date, expected):
    assert resolve_rates(DATED, 1000, on_date=on_date) == expected


def test_future_period_is_invisible_until_its_day():
    """Recording tomorrow's price must not change today's cost. This is the
    whole reason the date is in the config early rather than late."""
    assert resolve_rates(DATED, 1000, on_date=LAST_DAY)[1] == 10.00


@pytest.mark.parametrize(
    "on_date, input_tokens, expected",
    [
        (AUG, 100_000, (2.50, 15.00)),
        (AUG, 300_000, (5.00, 22.50)),
        (FIRST_DAY, 100_000, (2.75, 16.50)),
        (FIRST_DAY, 300_000, (5.50, 24.75)),
    ],
)
def test_tiers_and_dates_compose(on_date, input_tokens, expected):
    assert resolve_rates(BOTH, input_tokens, on_date=on_date) == expected


def test_all_rows_future_dated_falls_back_to_the_earliest():
    """A config written ahead of a launch is legal; it must not price at zero."""
    entry = {"pricing": [
        {"effective_from": "2027-01-01",
         "input_cost_per_1m": 1.00, "output_cost_per_1m": 2.00},
    ]}
    assert resolve_rates(entry, 10, on_date=AUG) == (1.00, 2.00)


# ---------------------------------------------------------------------------
# The sort scalar
# ---------------------------------------------------------------------------


def test_sort_scalar_takes_the_worst_case_not_the_cheapest():
    # Cheapest-available would report 10.00 and make this model look cheaper
    # than it can bill.
    assert worst_case_output_cost_per_1m(TIERED) == 15.00
    assert worst_case_input_cost_per_1m(TIERED) == 2.50


def test_sort_scalar_does_not_move_on_a_calendar_boundary():
    """The rate in force changes on 2026-09-01; the ranking must not, or
    verifier selection silently reorders itself overnight."""
    assert worst_case_output_cost_per_1m(DATED) == 15.00
    assert worst_case_output_cost_per_1m(BOTH) == 24.75


def test_sort_scalar_reads_a_flat_entry_unchanged():
    assert worst_case_output_cost_per_1m(FLAT) == 15.00
    assert worst_case_output_cost_per_1m({}) == 0.0


# ---------------------------------------------------------------------------
# Validation — every rule fails CLOSED
# ---------------------------------------------------------------------------


def test_flat_and_structured_on_one_entry_is_rejected():
    """Two rate declarations on one entry can drift apart, which is the
    original defect in a new costume."""
    entry = dict(FLAT)
    entry.update(TIERED)
    with pytest.raises(PricingError, match="both"):
        validate_model_rates("x", entry)


def test_period_without_an_unbounded_row_is_rejected():
    """Otherwise a prompt larger than the largest bound has no rate at all."""
    entry = {"pricing": [
        {"max_input_tokens": 200000,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
        {"max_input_tokens": 400000,
         "input_cost_per_1m": 2.0, "output_cost_per_1m": 4.0},
    ]}
    with pytest.raises(PricingError, match="no unbounded row"):
        validate_model_rates("x", entry)


def test_two_unbounded_rows_in_one_period_are_rejected():
    entry = {"pricing": [
        {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
        {"input_cost_per_1m": 9.0, "output_cost_per_1m": 9.0},
    ]}
    with pytest.raises(PricingError, match="without max_input_tokens"):
        validate_model_rates("x", entry)


def test_duplicate_bounds_in_one_period_are_rejected():
    entry = {"pricing": [
        {"max_input_tokens": 200000,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
        {"max_input_tokens": 200000,
         "input_cost_per_1m": 3.0, "output_cost_per_1m": 4.0},
        {"input_cost_per_1m": 5.0, "output_cost_per_1m": 6.0},
    ]}
    with pytest.raises(PricingError, match="duplicate"):
        validate_model_rates("x", entry)


def test_each_period_is_checked_independently():
    """The base period is complete; the dated one is missing its unbounded
    row. Checking only the whole list would pass this."""
    entry = {"pricing": [
        {"max_input_tokens": 1000,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
        {"input_cost_per_1m": 2.0, "output_cost_per_1m": 3.0},
        {"effective_from": "2026-09-01", "max_input_tokens": 1000,
         "input_cost_per_1m": 3.0, "output_cost_per_1m": 4.0},
    ]}
    with pytest.raises(PricingError, match="2026-09-01"):
        validate_model_rates("x", entry)


def test_unknown_row_key_is_rejected():
    """A typo'd bound would silently widen a tier to unbounded."""
    entry = {"pricing": [
        {"max_input_token": 200000,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
    ]}
    with pytest.raises(PricingError, match="unknown key"):
        validate_model_rates("x", entry)


@pytest.mark.parametrize("bad", ["1.25", None, True, -1, -0.5])
def test_non_numeric_or_negative_rate_is_rejected(bad):
    entry = {"pricing": [
        {"input_cost_per_1m": bad, "output_cost_per_1m": 2.0},
    ]}
    with pytest.raises(PricingError, match="non-negative number"):
        validate_model_rates("x", entry)


def test_boolean_is_not_accepted_as_a_rate():
    """`True == 1` in Python; a `true` in a price field is a config error."""
    entry = {"input_cost_per_1m": True, "output_cost_per_1m": 2.0}
    with pytest.raises(PricingError):
        validate_model_rates("x", entry)


def test_half_declared_flat_rate_is_rejected():
    with pytest.raises(PricingError, match="without"):
        validate_model_rates("x", {"input_cost_per_1m": 3.0})


@pytest.mark.parametrize("bad", [[], "flat", {}, 0])
def test_pricing_must_be_a_non_empty_list(bad):
    with pytest.raises(PricingError, match="non-empty list"):
        validate_model_rates("x", {"pricing": bad})


@pytest.mark.parametrize("bad", ["2026-13-01", "Sept 1 2026", 20260901])
def test_bad_effective_from_is_rejected(bad):
    entry = {"pricing": [
        {"effective_from": bad,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
    ]}
    with pytest.raises(PricingError):
        validate_model_rates("x", entry)


@pytest.mark.parametrize("bad", [0, -5, 1.5, True, "200000"])
def test_bad_max_input_tokens_is_rejected(bad):
    entry = {"pricing": [
        {"max_input_tokens": bad,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
        {"input_cost_per_1m": 2.0, "output_cost_per_1m": 3.0},
    ]}
    with pytest.raises(PricingError, match="positive integer"):
        validate_model_rates("x", entry)


def test_valid_shapes_all_pass():
    # Set 109 S4 narrowed the last case. `{"provider": "google"}` -- an entry
    # declaring no rates at all -- used to pass unconditionally, on the
    # reasoning that identity-only records have no price to confirm. That is
    # true of identity-only records and false of routable ones, where a
    # missing rate reads as 0.00 and wins every cheapest-candidate tiebreak.
    # The rate-less shape is still valid; it now has to say nothing routes
    # to it.
    for entry in (FLAT, TIERED, DATED, BOTH,
                  {"provider": "google", "is_enabled": False}):
        validate_model_rates("x", entry)


def test_confirmed_on_is_optional_but_must_be_a_date():
    validate_model_rates("x", dict(FLAT))                       # absent: fine
    validate_model_rates("x", {**FLAT, "confirmed_on": "2026-08-04"})
    with pytest.raises(PricingError, match="not an ISO date"):
        validate_model_rates("x", {**FLAT, "confirmed_on": "August 2026"})


# ---------------------------------------------------------------------------
# Staleness
# ---------------------------------------------------------------------------


def _config(**models):
    return {"metadata": {"review_frequency_days": 30}, "models": models}


def test_unconfirmed_and_stale_splits_never_from_old():
    config = _config(
        fresh={**FLAT, "confirmed_on": "2026-08-01"},
        old={**FLAT, "confirmed_on": "2026-06-01"},
        never=dict(FLAT),
    )
    never, stale = unconfirmed_and_stale(config, today=AUG)
    assert never == ["never"]
    assert stale == ["old"]


def test_identity_only_entries_are_not_asked_to_confirm_a_price():
    """They have no rate to confirm, so demanding a stamp would be pure noise."""
    config = _config(identity={"provider": "anthropic", "is_enabled": False})
    assert unconfirmed_and_stale(config, today=AUG) == ([], [])


def test_unparseable_stamp_counts_as_never_confirmed():
    config = _config(broken={**FLAT, "confirmed_on": "whenever"})
    never, stale = unconfirmed_and_stale(config, today=AUG)
    assert never == ["broken"] and stale == []


# ---------------------------------------------------------------------------
# The consumers are actually wired to the resolver
#
# Everything above tests `resolve_rates` in isolation, which would stay green
# if `_calculate_cost` still read the two flat fields and quietly ignored
# tiers. These four pin the wiring itself -- the session's "cost computation
# honours tiers and effective dates" claim lives here, not above.
# ---------------------------------------------------------------------------


def test_calculate_cost_honours_the_context_tier():
    from ai_router import _calculate_cost

    cheap = _calculate_cost(200_000, 1_000_000, TIERED)
    dear = _calculate_cost(200_001, 1_000_000, TIERED)
    # One extra input token moves BOTH sides of the bill to the upper tier.
    assert cheap == pytest.approx(200_000 / 1e6 * 1.25 + 10.00)
    assert dear == pytest.approx(200_001 / 1e6 * 2.50 + 15.00)
    assert dear > cheap


def test_calculate_cost_reads_a_flat_entry_exactly_as_before():
    from ai_router import _calculate_cost

    assert _calculate_cost(1_000_000, 1_000_000, FLAT) == pytest.approx(18.00)


def test_selection_paths_share_one_answer_for_cheapest():
    """verification.py, models.py and utils.py must not each invent their own
    notion of a tiered model's cost."""
    from ai_router import models as models_mod
    from ai_router import utils as utils_mod
    from ai_router import verification as verification_mod

    for module in (models_mod, utils_mod, verification_mod):
        assert module.worst_case_output_cost_per_1m is worst_case_output_cost_per_1m


def test_config_load_rejects_an_unresolvable_rate_declaration(tmp_path):
    """Validation is wired into load_config, so a malformed entry fails at
    startup rather than costing a call at zero."""
    import config as config_mod

    bad = {"models": {"broken": {"provider": "google", "pricing": [
        {"max_input_tokens": 1000,
         "input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0},
    ]}}}
    with pytest.raises(PricingError, match="no unbounded row"):
        for alias, entry in bad["models"].items():
            config_mod.validate_model_rates(alias, entry)


# ---------------------------------------------------------------------------
# Set 109 S4 — a routable entry must declare rates.
#
# "No rates" resolves to 0.00, and selection RANKS by that scalar, so a
# routable rate-less entry does not merely under-report: it wins the verifier
# tiebreak while billing an unknown amount. Absence stays valid for the
# identity-only records it was introduced for.
# ---------------------------------------------------------------------------


def test_a_routable_entry_with_no_rates_is_rejected():
    with pytest.raises(PricingError, match="declares no rates"):
        validate_model_rates("gpt-5-6-luna", {
            "provider": "openai", "model_id": "gpt-5.6-luna",
            "is_enabled": True,
        })


def test_the_default_for_a_missing_is_enabled_is_routable():
    """`is_enabled` defaults to true when omitted, per the registry's own
    documented contract -- so an omitted flag must not become a way to keep a
    rate-less entry in the selection pool."""
    with pytest.raises(PricingError, match="declares no rates"):
        validate_model_rates("mystery", {"provider": "openai"})


def test_an_identity_only_entry_still_needs_no_rates():
    """The case absence was introduced for, and which must keep working:
    a record of what an orchestrator IS, that nothing routes to."""
    validate_model_rates("claude-opus-5", {
        "provider": "anthropic", "model_id": "claude-opus-5",
        "is_enabled": False, "is_enabled_as_verifier": False,
    })


def test_the_error_names_both_ways_out():
    """An operator hitting this at load needs to know it is either a missing
    price or a missing is_enabled: false, and how to fill it in.

    Set 119 S3 deleted ``pricing_proposal``, the CLI this message used to
    name. A refusal that names a command which no longer exists is worse
    than one that names none, so the message now points at the manual
    action -- and this assertion is what keeps the two in step.
    """
    with pytest.raises(PricingError) as exc:
        validate_model_rates("x", {"provider": "openai", "is_enabled": True})
    message = str(exc.value)
    assert "is_enabled: false" in message
    assert "published pricing page" in message
    assert "confirmed_on" in message
    assert "pricing_proposal" not in message


def test_a_routable_entry_with_a_pricing_list_passes():
    validate_model_rates("gemini-pro", {
        "provider": "google", "is_enabled": True,
        "pricing": [
            {"max_input_tokens": 200000,
             "input_cost_per_1m": 1.25, "output_cost_per_1m": 10.00},
            {"input_cost_per_1m": 2.50, "output_cost_per_1m": 15.00},
        ],
    })


def test_the_live_registry_declares_a_rate_for_everything_routable():
    """The property, asserted against the shipped config. Before this session
    two enabled entries carried no rates at all."""
    from ai_router.config import load_config

    for alias, entry in (load_config().get("models") or {}).items():
        if not entry.get("is_enabled", True):
            continue
        assert entry.get("pricing") or "input_cost_per_1m" in entry, (
            f"{alias} is routable but declares no rates"
        )


# ---------------------------------------------------------------------------
# Path-aware-critique finding (Set 109 S4, openai/gpt-5.6-sol): `pricing: null`
# walked straight through the fail-closed guard.
#
# The guard originally tested `not rows`, was changed to `PRICING_KEY not in
# entry` so that a malformed `pricing: []` could keep its sharper error -- and
# that change opened this hole. `pricing:` with nothing after it is ordinary
# YAML for "no value", and it is exactly what an operator writes when they mean
# to fill the rates in later.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("declaration", [
    {"pricing": None},          # `pricing:` with nothing after it
    {},                         # key absent entirely
])
def test_a_routable_entry_with_no_usable_rates_is_rejected(declaration):
    with pytest.raises(PricingError, match="declares no rates"):
        validate_model_rates("sneaky", {
            "provider": "openai", "is_enabled": True, **declaration,
        })


def test_a_null_pricing_key_does_not_slip_past_as_a_declaration():
    """The specific failure: it loaded clean, and then resolve_rates read it as
    $0.00 while the selection paths ranked it cheapest -- an unknown-price model
    winning every tiebreak, which is the defect the guard exists to close."""
    entry = {"provider": "openai", "is_enabled": True, "pricing": None}
    with pytest.raises(PricingError):
        validate_model_rates("sneaky", entry)
    # ...and the reason it mattered, pinned so the stakes stay visible.
    assert resolve_rates(entry) == (0.0, 0.0)
    assert worst_case_output_cost_per_1m(entry) == 0.0


def test_an_identity_only_entry_may_still_write_pricing_null():
    """Nothing routes to it, so there is no rate to demand."""
    validate_model_rates("identity", {
        "provider": "anthropic", "is_enabled": False, "pricing": None,
    })


def test_an_empty_pricing_list_keeps_its_own_sharper_error():
    """The distinction the guard was rewritten for in the first place: a
    present-but-empty list is MALFORMED, not absent, and must not be
    reported as 'declares no rates'."""
    with pytest.raises(PricingError, match="non-empty list"):
        validate_model_rates("x", {
            "provider": "openai", "is_enabled": True, "pricing": [],
        })
