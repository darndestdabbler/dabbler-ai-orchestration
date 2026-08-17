"""Model rate resolution: context tiers, effective dates, and the selection
sort scalar.

An entry declares its rates exactly one of two ways:

- Flat: ``input_cost_per_1m`` / ``output_cost_per_1m`` scalars.
- ``pricing:`` — a list of rate rows. ``max_input_tokens`` (inclusive) selects
  a context tier; ``effective_from`` (ISO date) opens a new period. Rows
  sharing an ``effective_from`` form one period, and each period needs exactly
  one unbounded row to price prompts above the largest bound.

Structural validation of the rows lives in the config JSON schema
(``schemas/router-config.schema.json``). This module keeps the semantic rules
a schema cannot express, both of which fail closed because an absent rate
resolves to 0.0 — and a zero-rate entry sorts cheapest in every selection
tiebreak while billing an unknown amount.
"""

from __future__ import annotations

import datetime
from typing import Optional

PRICING_KEY = "pricing"
_TIER_KEY = "max_input_tokens"
_DATE_KEY = "effective_from"
_INPUT_KEY = "input_cost_per_1m"
_OUTPUT_KEY = "output_cost_per_1m"


class PricingError(ValueError):
    """A model entry's rate declaration is unusable. Raised at config load,
    never lazily mid-call."""


def validate_model_rates(alias: str, entry: dict) -> None:
    """Raise :class:`PricingError` on the semantic defects the JSON schema
    cannot express.

    1. A routable entry (``is_enabled`` not false) must declare rates —
       flat fields or a ``pricing:`` list. Identity-only entries
       (``is_enabled: false``) legitimately carry none.
    2. Within each ``pricing:`` period: no duplicate tier bounds, and exactly
       one unbounded row (else a large prompt has no rate at all).
    """
    rows = entry.get(PRICING_KEY)
    has_flat = _INPUT_KEY in entry or _OUTPUT_KEY in entry

    # `pricing: null` is "not declared", not an empty declaration.
    declared = rows is not None
    if not declared and not has_flat and entry.get("is_enabled", True):
        raise PricingError(
            f"model {alias!r} is routable (is_enabled is not false) but "
            f"declares no rates. An absent rate is read as 0.00, which would "
            "make this the cheapest candidate in every selection tiebreak "
            "while billing an unknown amount. Add rates, or set "
            "is_enabled: false to make it an identity-only record."
        )

    if rows is not None and has_flat:
        raise PricingError(
            f"model {alias!r} declares both {PRICING_KEY!r} and the flat "
            f"{_INPUT_KEY}/{_OUTPUT_KEY} fields; two rate declarations on "
            "one entry can drift apart silently."
        )

    if not isinstance(rows, list):
        return

    periods: dict[Optional[str], list[dict]] = {}
    for row in rows:
        if isinstance(row, dict):
            periods.setdefault(row.get(_DATE_KEY), []).append(row)

    for effective_from, period_rows in periods.items():
        label = effective_from or "the base period"
        bounds = [r[_TIER_KEY] for r in period_rows if _TIER_KEY in r]
        if len(bounds) != len(set(bounds)):
            raise PricingError(
                f"model {alias!r}: {label} has duplicate {_TIER_KEY} bounds "
                f"{sorted(bounds)}; two rows would claim the same prompt size."
            )
        unbounded = len(period_rows) - len(bounds)
        if unbounded != 1:
            raise PricingError(
                f"model {alias!r}: {label} has {unbounded} rows without "
                f"{_TIER_KEY}; every period needs exactly one unbounded row "
                "to price a prompt larger than the largest bound."
            )


def resolve_rates(
    entry: dict,
    input_tokens: int = 0,
    *,
    on_date: Optional[datetime.date] = None,
) -> tuple[float, float]:
    """Return ``(input_cost_per_1m, output_cost_per_1m)`` for one call.

    *input_tokens* selects the context tier and *on_date* (default: today)
    selects the effective period. An entry with no rates resolves to
    ``(0.0, 0.0)`` — identity-only entries are never routed to, and the
    load-time validator keeps routable entries out of that state.
    """
    rows = entry.get(PRICING_KEY)
    if not rows:
        return (
            float(entry.get(_INPUT_KEY) or 0.0),
            float(entry.get(_OUTPUT_KEY) or 0.0),
        )

    today = on_date or datetime.date.today()

    # The period in force: the latest effective_from that has arrived; rows
    # with no date are the base period. A future-dated period is invisible
    # until its day — that is the point of recording it early.
    in_force: Optional[datetime.date] = None
    for row in rows:
        raw = row.get(_DATE_KEY)
        if raw is None:
            continue
        starts = datetime.date.fromisoformat(raw)
        if starts <= today and (in_force is None or starts > in_force):
            in_force = starts

    wanted = in_force.isoformat() if in_force else None
    period = [r for r in rows if r.get(_DATE_KEY) == wanted]
    if not period:
        # Every row is future-dated (legitimately written ahead of a launch).
        # Fall back to the earliest declared period rather than returning
        # nothing.
        earliest = min(str(r.get(_DATE_KEY)) for r in rows)
        period = [r for r in rows if str(r.get(_DATE_KEY)) == earliest]

    bounded = sorted(
        (r for r in period if _TIER_KEY in r), key=lambda r: r[_TIER_KEY]
    )
    for row in bounded:
        if input_tokens <= row[_TIER_KEY]:
            return float(row[_INPUT_KEY]), float(row[_OUTPUT_KEY])

    for row in period:
        if _TIER_KEY not in row:
            return float(row[_INPUT_KEY]), float(row[_OUTPUT_KEY])

    # Only reachable on a hand-built dict that never passed validation.
    last = bounded[-1]
    return float(last[_INPUT_KEY]), float(last[_OUTPUT_KEY])


def worst_case_output_cost_per_1m(entry: dict) -> float:
    """The single comparable scalar the selection paths rank models by.

    Selection happens before the output length or the billing date is known,
    so it needs one number per model: the highest declared output rate.
    "Cheapest tier" makes a tiered model look cheaper than it can bill;
    "rate in force today" silently reorders the candidate list on a calendar
    boundary. The worst case is stable and errs toward treating a model as
    more expensive than it may prove to be — the safe direction for a
    cost-control tiebreak.
    """
    rows = entry.get(PRICING_KEY)
    if not rows:
        return float(entry.get(_OUTPUT_KEY) or 0.0)
    return max(float(r.get(_OUTPUT_KEY) or 0.0) for r in rows)


def calculate_cost(input_tokens: int, output_tokens: int, entry: dict) -> float:
    """Cost in USD of one call against *entry*'s resolved rates.

    ``input_tokens`` selects the context tier; today's date selects the
    period.
    """
    input_rate, output_rate = resolve_rates(entry, input_tokens)
    return (
        (input_tokens / 1_000_000) * input_rate
        + (output_tokens / 1_000_000) * output_rate
    )
