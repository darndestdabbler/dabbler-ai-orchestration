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
    for entry in (FLAT, TIERED, DATED, BOTH, {"provider": "google"}):
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
