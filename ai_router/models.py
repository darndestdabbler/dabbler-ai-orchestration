"""Complexity estimation and model selection."""

import re


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
    overrides = routing.get("task_type_overrides") or {}
    if task_type in overrides:
        override_model = overrides[task_type]
        if (
            config["models"][override_model]["tier"] <= max_tier
            and _survives(override_model)
        ):
            return override_model
        if not exclude and config["models"][override_model]["tier"] <= max_tier:
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

    assigned = routing["tier_assignments"][tier]
    if not exclude or _survives(assigned):
        return assigned

    # The tier assignment's provider is excluded: pick the cheapest
    # surviving enabled model at the same tier, then widen outward
    # (tier+1 first — a stronger verifier is the safe direction — then
    # downward) within max_tier.
    def _cheapest_at(t: int) -> str | None:
        candidates = [
            (float(cfg.get("output_cost_per_1m") or 0.0), name)
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
