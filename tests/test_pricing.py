import datetime

import pytest

from ai_router.pricing import (
    PricingError,
    calculate_cost,
    resolve_rates,
    validate_model_rates,
    worst_case_output_cost_per_1m,
)

TIERED = {
    "pricing": [
        {"input_cost_per_1m": 1.25, "output_cost_per_1m": 10.0,
         "max_input_tokens": 200000},
        {"input_cost_per_1m": 2.5, "output_cost_per_1m": 15.0},
    ]
}

DATED = {
    "pricing": [
        {"input_cost_per_1m": 2.0, "output_cost_per_1m": 10.0},
        {"input_cost_per_1m": 3.0, "output_cost_per_1m": 15.0,
         "effective_from": "2026-09-01"},
    ]
}


class TestValidateModelRates:
    def test_routable_entry_without_rates_is_rejected(self):
        with pytest.raises(PricingError, match="declares no rates"):
            validate_model_rates("m", {"provider": "x"})

    def test_identity_only_entry_without_rates_passes(self):
        validate_model_rates("m", {"provider": "x", "is_enabled": False})

    def test_flat_and_pricing_together_are_rejected(self):
        entry = {"input_cost_per_1m": 1.0, "output_cost_per_1m": 2.0, **TIERED}
        with pytest.raises(PricingError, match="both"):
            validate_model_rates("m", entry)

    def test_duplicate_tier_bounds_rejected(self):
        entry = {"pricing": [
            {"input_cost_per_1m": 1, "output_cost_per_1m": 1,
             "max_input_tokens": 100},
            {"input_cost_per_1m": 2, "output_cost_per_1m": 2,
             "max_input_tokens": 100},
            {"input_cost_per_1m": 3, "output_cost_per_1m": 3},
        ]}
        with pytest.raises(PricingError, match="duplicate"):
            validate_model_rates("m", entry)

    def test_period_without_unbounded_row_rejected(self):
        entry = {"pricing": [
            {"input_cost_per_1m": 1, "output_cost_per_1m": 1,
             "max_input_tokens": 100},
        ]}
        with pytest.raises(PricingError, match="unbounded"):
            validate_model_rates("m", entry)

    def test_each_dated_period_validated_separately(self):
        entry = {"pricing": [
            {"input_cost_per_1m": 1, "output_cost_per_1m": 1},
            {"input_cost_per_1m": 2, "output_cost_per_1m": 2,
             "max_input_tokens": 100, "effective_from": "2027-01-01"},
        ]}
        with pytest.raises(PricingError, match="2027-01-01"):
            validate_model_rates("m", entry)


class TestResolveRates:
    def test_flat_entry(self):
        entry = {"input_cost_per_1m": 0.3, "output_cost_per_1m": 2.5}
        assert resolve_rates(entry) == (0.3, 2.5)

    def test_tier_bound_is_inclusive(self):
        assert resolve_rates(TIERED, input_tokens=200000) == (1.25, 10.0)

    def test_above_bound_uses_unbounded_row(self):
        assert resolve_rates(TIERED, input_tokens=200001) == (2.5, 15.0)

    def test_before_effective_date_uses_base_period(self):
        rates = resolve_rates(
            DATED, on_date=datetime.date(2026, 8, 31)
        )
        assert rates == (2.0, 10.0)

    def test_on_effective_date_switches_period(self):
        rates = resolve_rates(
            DATED, on_date=datetime.date(2026, 9, 1)
        )
        assert rates == (3.0, 15.0)

    def test_all_future_periods_fall_back_to_earliest(self):
        entry = {"pricing": [
            {"input_cost_per_1m": 9, "output_cost_per_1m": 9,
             "effective_from": "2030-01-01"},
        ]}
        assert resolve_rates(entry, on_date=datetime.date(2026, 1, 1)) == (9, 9)

    def test_date_and_tier_compose(self):
        entry = {"pricing": [
            {"input_cost_per_1m": 1, "output_cost_per_1m": 1},
            {"input_cost_per_1m": 2, "output_cost_per_1m": 2,
             "max_input_tokens": 100, "effective_from": "2026-01-01"},
            {"input_cost_per_1m": 3, "output_cost_per_1m": 3,
             "effective_from": "2026-01-01"},
        ]}
        on = datetime.date(2026, 6, 1)
        assert resolve_rates(entry, input_tokens=50, on_date=on) == (2, 2)
        assert resolve_rates(entry, input_tokens=500, on_date=on) == (3, 3)


class TestWorstCase:
    def test_rows_take_the_maximum(self):
        assert worst_case_output_cost_per_1m(TIERED) == 15.0
        assert worst_case_output_cost_per_1m(DATED) == 15.0


class TestCalculateCost:
    def test_flat_cost(self):
        entry = {"input_cost_per_1m": 1.0, "output_cost_per_1m": 10.0}
        assert calculate_cost(1_000_000, 100_000, entry) == pytest.approx(2.0)

    def test_input_tokens_select_the_tier(self):
        cheap = calculate_cost(100_000, 0, TIERED)
        expensive = calculate_cost(300_000, 0, TIERED)
        assert cheap == pytest.approx(0.125)
        assert expensive == pytest.approx(0.75)
