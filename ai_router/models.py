"""Complexity estimation and model selection."""

import re

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .pricing import worst_case_output_cost_per_1m
except ImportError:  # pragma: no cover - test/bare context
    from pricing import worst_case_output_cost_per_1m  # type: ignore[import-not-found]


def estimate_complexity(
    text: str,
    task_type: str,
    hint: int | None,
    config: dict
) -> int:
    """
    Estimate complexity score (1-100) from the prompt text,
    task type, and optional human hint.
    """
    weights = config["weights"]
    scores = {}

    # Factor 1: Context length
    char_count = len(text)
    length_score = 85  # default to high if very long
    for bracket in config["context_length_scores"]:
        if char_count <= bracket["max_chars"]:
            length_score = bracket["score"]
            break
    scores["context_length"] = length_score

    # Factor 2: Keyword signals
    lower_text = text.lower()
    high_hits = sum(
        1 for kw in config["high_complexity_keywords"]
        if kw in lower_text
    )
    low_hits = sum(
        1 for kw in config["low_complexity_keywords"]
        if kw in lower_text
    )
    keyword_adjustment = min(high_hits * 3, 15) - min(low_hits * 3, 15)
    # Base 50 ± adjustments, clamped
    keyword_score = max(5, min(95, 50 + keyword_adjustment))
    scores["keywords"] = keyword_score

    # Factor 3: Task type
    type_scores = config["task_type_scores"]
    scores["task_type"] = type_scores.get(task_type, type_scores["general"])

    # Factor 4: Explicit hint
    if hint is not None:
        scores["hint"] = max(1, min(100, hint))
    else:
        # No hint — redistribute its weight to other factors
        weights = {**weights}
        hint_weight = weights.pop("explicit_hint", 0.15)
        remaining = sum(weights.values())
        weights = {
            k: v + (hint_weight * v / remaining)
            for k, v in weights.items()
        }
        scores["hint"] = 0  # won't matter, weight is 0

    # Weighted combination
    weight_map = {
        "context_length": weights["context_length"],
        "keywords": weights["keyword_signals"],
        "task_type": weights["task_type"],
        "hint": weights.get("explicit_hint", 0)
    }

    total = sum(
        scores[k] * weight_map[k]
        for k in weight_map
        if weight_map[k] > 0
    )

    return max(1, min(100, round(total)))


def _provider_of(config: dict, model_name: str) -> str:
    """The lowercase provider of *model_name* per the models registry."""
    entry = (config.get("models") or {}).get(model_name) or {}
    return str(entry.get("provider") or "").strip().lower()


def pick_model(
    complexity_score: int,
    max_tier: int,
    task_type: str,
    config: dict,
    exclude_providers=None,
    prefer_model: str | None = None,
) -> str | None:
    """Pick the best model for this complexity score.

    Set 084 (F2): *exclude_providers* is a hard constraint no other
    selection input can override. A ``task_type_overrides`` pin (e.g.
    the ``session-verification: gpt-5-4`` pin) is demoted to a
    PREFERENCE — it is honored only when its provider survives the
    exclusion. When the tier assignment's provider is excluded, the
    cheapest enabled same-tier model from a surviving provider wins,
    widening to adjacent tiers (within ``max_tier``) before giving up.
    Returns ``None`` when NO enabled model survives the exclusion —
    the caller's fail-closed case (never a silent same-provider pick).
    """
    routing = config["routing"]
    exclude = {
        str(p).strip().lower() for p in (exclude_providers or []) if p
    }

    def _survives(model_name: str) -> bool:
        cfg = (config.get("models") or {}).get(model_name)
        if not isinstance(cfg, dict):
            return False
        if not cfg.get("is_enabled", True):
            return False
        return _provider_of(config, model_name) not in exclude

    # Check task-type overrides first — a preference, never an
    # exclusion override (Set 084 F2).
    #
    # Set 109 S2: a second branch used to sit here, returning the pinned
    # model without ``_survives`` whenever no provider exclusion applied.
    # Because ``_survives`` reduces to ``is_enabled`` when nothing is
    # excluded, that branch did one thing only: bypass ``is_enabled`` for
    # pinned task types. Session 1 established that ``is_enabled: false``
    # entries are "identity registry only, never routed to" — the record of
    # what an orchestrator IS — and a synthetic config confirmed the bypass
    # returned exactly such an entry as a work destination. The branch is
    # REMOVED rather than guarded: honouring the pin only when the registry
    # says the model is routable is the whole rule, and one rule needs one
    # code path. A pin on a disabled model now falls through to ordinary tier
    # selection below, which is what "disabled" already meant everywhere else.
    # Its sibling short-circuit on the tier assignment went the same way; see
    # the note there.
    # Set 109 S4: a CALL-level preference, consulted before the task-type pin
    # and under the identical guard, so it outranks the pin without outranking
    # anything that matters. It exists so the verification discovery fan-out
    # can run on a cheap model while the adjudicating calls keep the pinned
    # one, WITHOUT inventing a second task_type -- the dynamic orchestrator
    # exclusion, the verification_stamp check and the session-verification
    # metrics event are all gated on task_type == "session-verification", so a
    # discovery-specific task type would have silently dropped the exclusion
    # that is the only thing guaranteeing a session is not verified by its own
    # provider. Every way this preference can be wrong -- unknown alias,
    # disabled entry, excluded provider, tier above max_tier -- falls through
    # to the pin, which is the pre-Set-109 behaviour.
    if prefer_model:
        preferred = (config.get("models") or {}).get(prefer_model)
        tier = preferred.get("tier") if isinstance(preferred, dict) else None
        if (
            # bools are ints in Python; `tier: true` is a config error, not
            # the number 1 (project-guidance.md, validator-parity convention).
            isinstance(tier, int)
            and not isinstance(tier, bool)
            and tier <= max_tier
            and _survives(prefer_model)
        ):
            return prefer_model

    overrides = routing.get("task_type_overrides") or {}
    if task_type in overrides:
        override_model = overrides[task_type]
        if (
            config["models"][override_model]["tier"] <= max_tier
            and _survives(override_model)
        ):
            return override_model

    # Tier from complexity score
    if complexity_score <= routing["tier1_max_complexity"]:
        tier = 1
    elif complexity_score <= routing["tier2_max_complexity"]:
        tier = 2
    else:
        tier = 3

    # Cap at max_tier
    tier = min(tier, max_tier)

    # Set 109 S2: this read ``if not exclude or _survives(assigned)`` — the
    # same ``is_enabled`` bypass as the pin branch above, four lines apart and
    # governing every non-pinned call rather than only the pinned ones
    # (L-069-1: fix the class, not the reported site). With nothing excluded,
    # ``_survives`` reduces to ``is_enabled``, so the short-circuit did one
    # thing: route work to a tier assignment the registry had disabled.
    # Falling through instead lands on ``_cheapest_at``, which already picks
    # the cheapest SURVIVING model at the tier and widens outward.
    assigned = routing["tier_assignments"][tier]
    if _survives(assigned):
        return assigned

    # The tier assignment did not survive — its provider is excluded, or the
    # registry disables it: pick the cheapest surviving enabled model at the
    # same tier, then widen outward (tier+1 first — a stronger verifier is the
    # safe direction — then downward) within max_tier.
    def _cheapest_at(t: int) -> str | None:
        candidates = [
            (worst_case_output_cost_per_1m(cfg), name)
            for name, cfg in (config.get("models") or {}).items()
            if isinstance(cfg, dict)
            and cfg.get("tier") == t
            and _survives(name)
        ]
        if not candidates:
            return None
        candidates.sort()
        return candidates[0][1]

    tiers_to_try = [tier]
    tiers_to_try.extend(
        t for t in range(tier + 1, max_tier + 1)
    )
    tiers_to_try.extend(t for t in range(tier - 1, 0, -1))
    for t in tiers_to_try:
        chosen = _cheapest_at(t)
        if chosen is not None:
            return chosen
    return None
