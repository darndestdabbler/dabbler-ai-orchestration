"""Complexity estimation and model selection for the direct-API transport.

``surviving_candidates`` is the one implementation of "which models may this
call use" — every selection path (initial pick, task-type pin, caller
preference, tier fallback, escalation) filters through it. A model survives
when its registry entry is enabled, its provider is enabled with a resolvable
API key, and its provider is not excluded. A provider whose key does not
resolve is simply not a candidate: selection can never land on a model the
process could not call.
"""

from __future__ import annotations

from .pricing import worst_case_output_cost_per_1m
from .secret_resolver import resolve_secret


def estimate_complexity(
    text: str,
    task_type: str,
    hint: int | None,
    config: dict,
) -> int:
    """Estimate a 1-100 complexity score from prompt length, keyword
    signals, task type, and an optional caller hint. *config* is the
    ``complexity:`` block of router-config.yaml."""
    weights = config["weights"]
    scores = {}

    char_count = len(text)
    length_score = 85
    for bracket in config["context_length_scores"]:
        if char_count <= bracket["max_chars"]:
            length_score = bracket["score"]
            break
    scores["context_length"] = length_score

    lower_text = text.lower()
    high_hits = sum(
        1 for kw in config["high_complexity_keywords"] if kw in lower_text
    )
    low_hits = sum(
        1 for kw in config["low_complexity_keywords"] if kw in lower_text
    )
    keyword_adjustment = min(high_hits * 3, 15) - min(low_hits * 3, 15)
    scores["keywords"] = max(5, min(95, 50 + keyword_adjustment))

    type_scores = config["task_type_scores"]
    scores["task_type"] = type_scores.get(task_type, type_scores["general"])

    if hint is not None:
        scores["hint"] = max(1, min(100, hint))
    else:
        # No hint — redistribute its weight proportionally to the others.
        weights = {**weights}
        hint_weight = weights.pop("explicit_hint", 0.15)
        remaining = sum(weights.values())
        weights = {
            k: v + (hint_weight * v / remaining) for k, v in weights.items()
        }
        scores["hint"] = 0

    weight_map = {
        "context_length": weights["context_length"],
        "keywords": weights["keyword_signals"],
        "task_type": weights["task_type"],
        "hint": weights.get("explicit_hint", 0),
    }
    total = sum(
        scores[k] * weight_map[k] for k in weight_map if weight_map[k] > 0
    )
    return max(1, min(100, round(total)))


def provider_reachable(config: dict, provider_name: str) -> bool:
    """True when *provider_name* is configured, enabled, and its API key
    resolves. A keyless provider cannot be dispatched to, so it is not a
    candidate anywhere."""
    provider = (config.get("providers") or {}).get(provider_name)
    if not isinstance(provider, dict) or not provider.get("enabled", True):
        return False
    env_var = provider.get("api_key_env")
    if env_var and not resolve_secret(env_var):
        return False
    return True


def _normalize_exclusions(exclude_providers) -> set[str]:
    return {str(p).strip().lower() for p in (exclude_providers or []) if p}


def surviving_candidates(
    config: dict,
    *,
    tier: int | None = None,
    exclude_providers=None,
    require_verifier: bool = False,
) -> list[str]:
    """Model aliases that survive every selection constraint, cheapest first.

    Constraints: registry entry enabled; provider reachable (enabled, key
    resolves); provider not in *exclude_providers*; matching *tier* when
    given; ``is_enabled_as_verifier`` when *require_verifier*. Sorted by
    worst-case output rate ascending, alias as the deterministic tiebreak.
    """
    exclude = _normalize_exclusions(exclude_providers)
    reachable_cache: dict[str, bool] = {}

    def _reachable(provider: str) -> bool:
        if provider not in reachable_cache:
            reachable_cache[provider] = provider_reachable(config, provider)
        return reachable_cache[provider]

    candidates = []
    for name, entry in (config.get("models") or {}).items():
        if not isinstance(entry, dict) or not entry.get("is_enabled", True):
            continue
        if require_verifier and not entry.get("is_enabled_as_verifier", True):
            continue
        if tier is not None and entry.get("tier") != tier:
            continue
        provider = str(entry.get("provider") or "").strip().lower()
        if not provider or provider in exclude or not _reachable(provider):
            continue
        candidates.append((worst_case_output_cost_per_1m(entry), name))
    candidates.sort()
    return [name for _, name in candidates]


def pick_model(
    complexity_score: int,
    max_tier: int,
    task_type: str,
    config: dict,
    exclude_providers=None,
    prefer_model: str | None = None,
) -> str | None:
    """Pick the model for this call. Returns ``None`` when no candidate
    survives — the caller's fail-closed case, never a silent fallback.

    *exclude_providers* is a hard constraint nothing overrides. The
    ``task_type_overrides`` pin and *prefer_model* are preferences: honored
    only when they survive (enabled, reachable provider, tier within
    *max_tier*), falling through to tier selection otherwise. A caller
    preference outranks the pin, and both lose to the exclusion.
    """
    routing = config["routing"]
    survivors = set(
        surviving_candidates(config, exclude_providers=exclude_providers)
    )

    def _tier_of(name: str) -> int | None:
        entry = (config.get("models") or {}).get(name)
        tier = entry.get("tier") if isinstance(entry, dict) else None
        # bools are ints in Python; `tier: true` is a config error, not 1.
        if isinstance(tier, int) and not isinstance(tier, bool):
            return tier
        return None

    for preference in (prefer_model, (routing.get("task_type_overrides") or {}).get(task_type)):
        if not preference:
            continue
        tier = _tier_of(preference)
        if tier is not None and tier <= max_tier and preference in survivors:
            return preference

    if complexity_score <= routing["tier1_max_complexity"]:
        tier = 1
    elif complexity_score <= routing["tier2_max_complexity"]:
        tier = 2
    else:
        tier = 3
    tier = min(tier, max_tier)

    assigned = routing["tier_assignments"].get(tier)
    if assigned in survivors:
        return assigned

    # The tier assignment did not survive: cheapest survivor at the same
    # tier, then widen upward first (a stronger model is the safe direction),
    # then downward, all within max_tier.
    tiers_to_try = [tier]
    tiers_to_try.extend(range(tier + 1, max_tier + 1))
    tiers_to_try.extend(range(tier - 1, 0, -1))
    for t in tiers_to_try:
        at_tier = surviving_candidates(
            config, tier=t, exclude_providers=exclude_providers
        )
        if at_tier:
            return at_tier[0]
    return None


def next_escalation_model(
    current_model: str,
    config: dict,
    escalation_count: int,
    exclude_providers=None,
) -> str | None:
    """The next-tier model for an escalation, or ``None`` when escalation
    stops (max escalations reached, no higher tier, or nothing survives).

    Honors the same exclusion as the initial pick: an escalation must never
    land on an excluded or unreachable provider.
    """
    if escalation_count >= config["escalation"]["max_escalations"]:
        return None

    current_entry = (config.get("models") or {}).get(current_model) or {}
    current_tier = current_entry.get("tier")
    if not isinstance(current_tier, int) or isinstance(current_tier, bool):
        return None
    next_tier = current_tier + 1

    assignments = config["routing"]["tier_assignments"]
    if next_tier not in assignments:
        return None

    survivors_at_tier = surviving_candidates(
        config, tier=next_tier, exclude_providers=exclude_providers
    )
    assigned = assignments[next_tier]
    if assigned in survivors_at_tier:
        return assigned
    return survivors_at_tier[0] if survivors_at_tier else None
