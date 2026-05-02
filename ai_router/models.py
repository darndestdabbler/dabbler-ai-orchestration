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


def pick_model(
    complexity_score: int,
    max_tier: int,
    task_type: str,
    config: dict
) -> str:
    """Pick the best model for this complexity score."""
    routing = config["routing"]

    # Check task-type overrides first
    overrides = routing.get("task_type_overrides") or {}
    if task_type in overrides:
        override_model = overrides[task_type]
        if config["models"][override_model]["tier"] <= max_tier:
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

    return routing["tier_assignments"][tier]
