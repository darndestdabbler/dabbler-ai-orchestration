"""Model rate resolution: context tiers, effective dates, and the sort scalar
(Set 109 S3).

The registry used to carry exactly two numbers per model — ``input_cost_per_1m``
and ``output_cost_per_1m`` — and the providers do not bill that way:

- **Context tiers.** Gemini 2.5 Pro bills $1.25/$10.00 for prompts of 200k
  tokens or fewer and $2.50/$15.00 above that. The registry recorded only the
  cheap tier, so every long-prompt call was under-costed and nothing said so.
  OpenAI's published table carries the same split for *every* model
  (short-context vs long-context columns); the registry recorded it as a prose
  comment on one entry.
- **Effective dates.** Claude Sonnet 5 bills $2.00/$10.00 through 2026-08-31
  and $3.00/$15.00 from 2026-09-01. A single scalar goes silently wrong on a
  calendar boundary, with no code change and no signal — the exact failure
  shape Set 109 exists to end.

So an entry may now carry a ``pricing:`` list *instead of* the two flat fields:

.. code-block:: yaml

    # Flat — still fully valid, still the right answer for a single-rate model.
    gpt-5-4-mini:
      input_cost_per_1m: 0.75
      output_cost_per_1m: 4.50

    # Context-tiered.
    gemini-pro:
      pricing:
        - max_input_tokens: 200000     # applies when input_tokens <= this
          input_cost_per_1m: 1.25
          output_cost_per_1m: 10.00
        - input_cost_per_1m: 2.50      # no bound == "and above"
          output_cost_per_1m: 15.00

    # Effective-dated.
    claude-sonnet-5:
      pricing:
        - input_cost_per_1m: 2.00      # no effective_from == the base period
          output_cost_per_1m: 10.00
        - effective_from: "2026-09-01"
          input_cost_per_1m: 3.00
          output_cost_per_1m: 15.00

The two features compose without nesting: rows sharing an ``effective_from``
form one period, and within a period ``max_input_tokens`` selects the tier. A
routed design proposed a list of periods each *containing* a list of tiers; two
levels of nesting were rejected because a flat list expresses all four cases
(neither / tiered / dated / both) and a 12-entry registry where ten entries are
single-rate should not pay for structure ten of them will never use.

**The flat fields and ``pricing:`` are mutually exclusive on one entry.** Not
"the structured form wins" and not "they must agree" — either of those leaves
two numbers that can drift apart, which is this module's origin defect wearing
a new hat. An entry declares its rates one way, and :func:`validate_model_rates`
rejects the entry that tries both.

Every rule below fails **closed**: a period with no unbounded row would leave a
large prompt with no rate at all, so the validator rejects it rather than
letting a call fall through to zero.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

#: Rows are keyed on these two optional bounds. ``max_input_tokens`` is
#: INCLUSIVE and ``effective_from`` is the first day the row applies.
_TIER_KEY = "max_input_tokens"
_DATE_KEY = "effective_from"

_INPUT_KEY = "input_cost_per_1m"
_OUTPUT_KEY = "output_cost_per_1m"

#: Recognised row keys. An unknown key is rejected rather than ignored: a
#: typo'd ``max_input_token`` would silently widen a tier to unbounded, and a
#: silently-widened tier is exactly how the registry came to under-report.
_ROW_KEYS = frozenset({_TIER_KEY, _DATE_KEY, _INPUT_KEY, _OUTPUT_KEY})

PRICING_KEY = "pricing"
CONFIRMED_ON_KEY = "confirmed_on"


class PricingError(ValueError):
    """A model entry's rate declaration is unusable. Never raised lazily —
    :func:`validate_model_rates` runs at config load, so a malformed entry
    fails at startup rather than mid-call."""


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _is_number(value: Any) -> bool:
    # bools are ints in Python; a `true` in a price field is a config error,
    # not the number 1 (project-guidance.md, validator-parity convention).
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _parse_date(raw: Any, where: str) -> datetime.date:
    if not isinstance(raw, str):
        raise PricingError(f"{where}: {_DATE_KEY} must be an ISO date string, got {raw!r}")
    try:
        return datetime.date.fromisoformat(raw)
    except ValueError as exc:
        raise PricingError(f"{where}: {_DATE_KEY} is not an ISO date: {raw!r}") from exc


def validate_model_rates(alias: str, entry: dict) -> None:
    """Raise :class:`PricingError` if *entry*'s rate declaration is unusable.

    Silence means every ``(date, input_tokens)`` pair resolves to exactly one
    row. Identity-only entries — which carry no rates at all because nothing
    routes to them — pass: absence is a valid declaration, disagreement is not.
    Set 109 S4 narrowed that to what it always meant: absence is valid for an
    entry marked ``is_enabled: false``, and a defect for a routable one.
    """
    has_flat = _INPUT_KEY in entry or _OUTPUT_KEY in entry
    rows = entry.get(PRICING_KEY)

    # "Declared" means the key is present AND carries a value. Three cases,
    # deliberately distinguished:
    #
    #   pricing: null   -> NOT declared. `pricing:` with nothing after it is
    #                      ordinary YAML for "no value", and it is what an
    #                      operator writes when they mean to fill it in later.
    #   pricing: []     -> declared and MALFORMED; keeps its own sharper
    #                      "non-empty list" error below.
    #   (key absent)    -> NOT declared.
    #
    # The null case is a hole this session opened and its own path-aware
    # critique caught: an earlier draft tested `PRICING_KEY not in entry`, so
    # `pricing: null` skipped this guard, fell through the `rows is None`
    # branch with nothing to check, and loaded clean — leaving a routable entry
    # that `resolve_rates` reads as $0.00 and the selection paths rank as the
    # cheapest candidate. That is the exact defect the guard exists to close,
    # reachable by typing one word.
    declared = entry.get(PRICING_KEY) is not None
    if not declared and not has_flat and entry.get("is_enabled", True):
        # Set 109 S4. Absence of rates is honest for an identity-only record,
        # and a lie for a routable one. `resolve_rates` reads a missing rate as
        # 0.0 and `worst_case_output_cost_per_1m` returns 0.0, which does not
        # merely under-report: selection ranks candidates by that scalar, so a
        # routable entry with no rates sorts CHEAPEST and wins the verifier
        # tiebreak outright — a free-looking model that bills whatever it bills.
        # That is this set's origin defect (a price nobody could see was wrong)
        # in its most complete form, so it fails at load rather than at
        # reconciliation time. Identity-only entries are unaffected: they carry
        # is_enabled: false, which is what "nothing routes here" already means.
        raise PricingError(
            f"model {alias!r} is routable (is_enabled is not false) but "
            f"declares no rates. Add {_INPUT_KEY}/{_OUTPUT_KEY} or a "
            f"{PRICING_KEY}: list — an absent rate is read as 0.00, which "
            "would make this the cheapest candidate in every selection "
            "tiebreak while billing an unknown amount. If nothing should "
            "route here, set is_enabled: false and it becomes an "
            "identity-only record, which needs no rates. To fill it in from "
            "the provider's published page: python -m "
            "ai_router.pricing_proposal --fetch"
        )

    if rows is not None and has_flat:
        raise PricingError(
            f"model {alias!r} declares both {PRICING_KEY!r} and the flat "
            f"{_INPUT_KEY}/{_OUTPUT_KEY} fields. Use one or the other — two "
            "rate declarations on one entry can drift apart silently, which "
            "is the defect this schema exists to prevent."
        )

    if rows is None:
        if has_flat:
            for key, sibling in ((_INPUT_KEY, _OUTPUT_KEY), (_OUTPUT_KEY, _INPUT_KEY)):
                if key not in entry:
                    raise PricingError(
                        f"model {alias!r} declares {sibling!r} without {key!r}; "
                        "a half-declared rate costs one side of every call at zero."
                    )
                if not _is_number(entry[key]) or entry[key] < 0:
                    raise PricingError(
                        f"model {alias!r}: {key} must be a non-negative number, "
                        f"got {entry[key]!r}"
                    )
        _validate_confirmed_on(alias, entry)
        return

    if not isinstance(rows, list) or not rows:
        raise PricingError(
            f"model {alias!r}: {PRICING_KEY} must be a non-empty list of rate rows"
        )

    periods: dict[Optional[str], list[dict]] = {}
    for index, row in enumerate(rows):
        where = f"model {alias!r} {PRICING_KEY}[{index}]"
        if not isinstance(row, dict):
            raise PricingError(f"{where}: each rate row must be a mapping, got {row!r}")

        unknown = set(row) - _ROW_KEYS
        if unknown:
            raise PricingError(
                f"{where}: unknown key(s) {sorted(unknown)}. Recognised keys are "
                f"{sorted(_ROW_KEYS)}; a typo'd bound would silently widen a tier."
            )

        for key in (_INPUT_KEY, _OUTPUT_KEY):
            if key not in row:
                raise PricingError(f"{where}: missing required {key!r}")
            if not _is_number(row[key]) or row[key] < 0:
                raise PricingError(
                    f"{where}: {key} must be a non-negative number, got {row[key]!r}"
                )

        if _TIER_KEY in row:
            bound = row[_TIER_KEY]
            if not isinstance(bound, int) or isinstance(bound, bool) or bound <= 0:
                raise PricingError(
                    f"{where}: {_TIER_KEY} must be a positive integer, got {bound!r}"
                )

        if _DATE_KEY in row:
            _parse_date(row[_DATE_KEY], where)

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
        if unbounded == 0:
            raise PricingError(
                f"model {alias!r}: {label} has no unbounded row. Every period "
                f"needs exactly one row without {_TIER_KEY} to price a prompt "
                "larger than the largest bound; without it a long prompt has "
                "no rate at all."
            )
        if unbounded > 1:
            raise PricingError(
                f"model {alias!r}: {label} has {unbounded} rows without "
                f"{_TIER_KEY}; only one row per period may be unbounded."
            )

    _validate_confirmed_on(alias, entry)


def _validate_confirmed_on(alias: str, entry: dict) -> None:
    """``confirmed_on`` is optional — its ABSENCE is the honest state for a
    rate no human has checked yet, and turning absence into an error would
    only pressure someone into stamping an unverified number."""
    raw = entry.get(CONFIRMED_ON_KEY)
    if raw is None:
        return
    _parse_confirmed_on(alias, raw)


def _parse_confirmed_on(alias: str, raw: Any) -> datetime.date:
    if not isinstance(raw, str):
        raise PricingError(
            f"model {alias!r}: {CONFIRMED_ON_KEY} must be an ISO date string, got {raw!r}"
        )
    try:
        return datetime.date.fromisoformat(raw)
    except ValueError as exc:
        raise PricingError(
            f"model {alias!r}: {CONFIRMED_ON_KEY} is not an ISO date: {raw!r}"
        ) from exc


# ---------------------------------------------------------------------------
# Rate resolution
# ---------------------------------------------------------------------------


def resolve_rates(
    entry: dict,
    input_tokens: int = 0,
    *,
    on_date: Optional[datetime.date] = None,
) -> tuple[float, float]:
    """Return ``(input_cost_per_1m, output_cost_per_1m)`` for one call.

    *input_tokens* selects the context tier and *on_date* (default: today)
    selects the effective period. An entry with no rates at all resolves to
    ``(0.0, 0.0)``, matching the pre-Set-109 behaviour of the flat reader for
    identity-only entries.
    """
    rows = entry.get(PRICING_KEY)
    if not rows:
        return (
            float(entry.get(_INPUT_KEY) or 0.0),
            float(entry.get(_OUTPUT_KEY) or 0.0),
        )

    today = on_date or datetime.date.today()

    # The period in force is the one with the latest effective_from that has
    # already arrived; rows with no effective_from are the base period and are
    # always eligible. A period dated in the future is deliberately invisible
    # until its day — that is the whole point of recording it early.
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
        # Only reachable when every row is future-dated, which validation
        # cannot forbid (a config may legitimately be written ahead of a
        # launch). Fall back to the earliest declared period rather than
        # returning nothing.
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

    # Validation guarantees an unbounded row per period, so this is only
    # reachable on a hand-built dict that never passed through load_config.
    last = bounded[-1]
    return float(last[_INPUT_KEY]), float(last[_OUTPUT_KEY])


def worst_case_output_cost_per_1m(entry: dict) -> float:
    """The single comparable scalar the *selection* paths rank models by.

    Verifier selection and escalation fallback sort candidate models against
    each other before either the output length or (for a long-lived process)
    the billing date is known, so they need one number per model. This returns
    the **highest** declared output rate across every row.

    The alternatives both fail in ways that matter. *Cheapest available* makes
    a tiered model look cheaper than it can bill, and picking a verifier on a
    rate it will not charge is how a "cheapest" choice becomes the expensive
    one. *The rate in force today* silently reorders the candidate list on a
    calendar boundary with no code change — the same invisible-flip failure
    that put Sonnet 5's dated price in this schema in the first place. The
    worst case is stable, date-independent, and errs toward treating a model
    as more expensive than it may prove to be, which is the safe direction for
    a cost-control tiebreak.
    """
    rows = entry.get(PRICING_KEY)
    if not rows:
        return float(entry.get(_OUTPUT_KEY) or 0.0)
    return max(float(r.get(_OUTPUT_KEY) or 0.0) for r in rows)


def worst_case_input_cost_per_1m(entry: dict) -> float:
    """Input-side companion to :func:`worst_case_output_cost_per_1m`."""
    rows = entry.get(PRICING_KEY)
    if not rows:
        return float(entry.get(_INPUT_KEY) or 0.0)
    return max(float(r.get(_INPUT_KEY) or 0.0) for r in rows)


# ---------------------------------------------------------------------------
# Staleness
# ---------------------------------------------------------------------------


def unconfirmed_and_stale(
    config: dict,
    *,
    today: Optional[datetime.date] = None,
) -> tuple[list[str], list[str]]:
    """Return ``(never_confirmed, stale)`` model aliases by ``confirmed_on``.

    Only entries that actually declare rates are considered — an identity-only
    entry records what an orchestrator *is* and has no price to confirm, so
    demanding a stamp on it would be noise.
    """
    today = today or datetime.date.today()
    threshold = int((config.get("metadata") or {}).get("review_frequency_days", 30))
    never: list[str] = []
    stale: list[str] = []
    for alias, entry in sorted((config.get("models") or {}).items()):
        if not isinstance(entry, dict):
            continue
        if not (entry.get(PRICING_KEY) or _INPUT_KEY in entry or _OUTPUT_KEY in entry):
            continue
        raw = entry.get(CONFIRMED_ON_KEY)
        if not raw:
            never.append(alias)
            continue
        try:
            confirmed = _parse_confirmed_on(alias, raw)
        except PricingError:
            never.append(alias)
            continue
        if (today - confirmed).days > threshold:
            stale.append(alias)
    return never, stale
