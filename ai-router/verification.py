"""Cross-provider verification logic for IV&V.

Verifier selection is rule-based, not map-based. The rules:

  1. Different provider from the generator.
  2. ``is_enabled`` is true (model is in the active pool).
  3. ``is_enabled_as_verifier`` is true (model is trusted to verify,
     not just to generate).
  4. Tier equal to the generator's tier, or one tier higher.
  5. Provider not in the ``exclude_providers`` list (used when a
     previous verifier call failed at the HTTPS layer).

Among surviving candidates, ``preferred_pairings`` (if any) is
consulted as a tiebreaker. If the preferred pairing survives the
rules, it wins. Otherwise candidates are ranked by tier distance
ascending then cheapest-output-cost ascending, and the top wins.

This design lets a reviewer swap or retire a model by editing the
``models:`` section alone, without hunting through a pairing table.
It also lets a new model be added as a generator only
(``is_enabled_as_verifier: false``) and promoted to verifier duty
later by flipping one flag.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class VerifierSelection:
    """Result of pick_verifier_model.

    Attributes:
        model_name: The chosen verifier model name.
        preferred_skipped: If a ``preferred_pairings`` entry existed
            for this generator but was rejected by the rules, this
            holds the skipped model name and the reason (used for
            metrics). None if no preferred pairing was consulted or
            the preferred pairing survived the rules.
    """
    model_name: str
    preferred_skipped: Optional[tuple[str, str]] = None


def pick_verifier_model(
    generator_model: str,
    config: dict,
    exclude_providers: Optional[list[str]] = None,
) -> Optional[VerifierSelection]:
    """Pick a verification model using rule-based selection.

    Args:
        generator_model: Name of the model that produced the output
            being verified.
        config: The loaded router-config.yaml dict.
        exclude_providers: Optional list of provider names to exclude
            from candidate selection. Used when a previous verifier
            call failed so the fallback picks a different provider.

    Returns:
        A ``VerifierSelection`` with the chosen model name, or None
        if no eligible verifier exists under the current rules.
    """
    exclude = set(exclude_providers or [])

    models = config.get("models", {}) or {}
    if generator_model not in models:
        return None

    gen_cfg = models[generator_model]
    gen_provider = gen_cfg.get("provider")
    gen_tier = gen_cfg.get("tier")
    if gen_provider is None or gen_tier is None:
        return None

    # Read preferred pairings. Backward-compat: accept the legacy
    # ``cross_provider_map`` key if ``preferred_pairings`` is absent,
    # so old configs and existing metrics log branches keep working.
    v_config = config.get("verification", {}) or {}
    preferred = (
        v_config.get("preferred_pairings")
        or v_config.get("cross_provider_map")
        or {}
    )

    # Build the rule-qualified candidate set.
    candidates: list[tuple[int, float, str]] = []
    for name, cfg in models.items():
        if name == generator_model:
            continue
        if cfg.get("provider") == gen_provider:
            continue                                       # rule 1
        if not cfg.get("is_enabled", True):
            continue                                       # rule 2
        if not cfg.get("is_enabled_as_verifier", True):
            continue                                       # rule 3
        tier = cfg.get("tier")
        if tier is None:
            continue
        tier_distance = tier - gen_tier
        if tier_distance < 0 or tier_distance > 1:
            continue                                       # rule 4
        if cfg.get("provider") in exclude:
            continue                                       # rule 5

        # Sort key: closest tier first, then cheapest output cost.
        # Falls back to input cost then name for deterministic ordering
        # when costs are missing or tied.
        out_cost = float(cfg.get("output_cost_per_1m") or 0.0)
        candidates.append((tier_distance, out_cost, name))

    if not candidates:
        return None

    candidates.sort(key=lambda t: (t[0], t[1], t[2]))
    surviving_names = [c[2] for c in candidates]

    # Apply the preferred-pairing tiebreaker if one exists and survived.
    pref = preferred.get(generator_model)
    if pref:
        if pref in surviving_names:
            return VerifierSelection(model_name=pref)
        # Preferred pairing exists but did not survive the rules.
        # Record the skip reason for the metrics layer.
        skip_reason = _why_preferred_skipped(
            pref, models, gen_provider, gen_tier, exclude
        )
        chosen = surviving_names[0]
        return VerifierSelection(
            model_name=chosen,
            preferred_skipped=(pref, skip_reason),
        )

    # No preferred pairing — rules alone pick.
    return VerifierSelection(model_name=surviving_names[0])


def _why_preferred_skipped(
    pref: str,
    models: dict,
    gen_provider: str,
    gen_tier: int,
    exclude: set[str],
) -> str:
    """Diagnose why the preferred pairing did not survive the rules.
    Used for metrics only — the chosen verifier is already decided."""
    cfg = models.get(pref)
    if cfg is None:
        return "preferred_not_in_models"
    if cfg.get("provider") == gen_provider:
        return "same_provider_as_generator"
    if not cfg.get("is_enabled", True):
        return "not_enabled"
    if not cfg.get("is_enabled_as_verifier", True):
        return "not_enabled_as_verifier"
    tier = cfg.get("tier")
    if tier is None:
        return "preferred_missing_tier"
    tier_distance = tier - gen_tier
    if tier_distance < 0 or tier_distance > 1:
        return "tier_out_of_range"
    if cfg.get("provider") in exclude:
        return "provider_excluded_after_failure"
    return "unknown"


def build_verification_prompt(
    original_task: str,
    original_response: str,
    task_type: str,
    template: str = ""
) -> str:
    """Build the verification prompt from template or default."""
    if template:
        return (template
                .replace("{original_task}", original_task or "(not provided)")
                .replace("{original_response}", original_response)
                .replace("{task_type}", task_type))

    # Default template if no file was configured
    return (
        "## Independent Verification\n\n"
        "A different AI model completed the task below. "
        "Check its work for errors, omissions, and incorrect reasoning.\n\n"
        f"### Original Task\n\n{original_task or '(not provided)'}\n\n"
        f"### Task Type: {task_type}\n\n"
        f"### Response Under Review\n\n{original_response}\n\n"
        "### Instructions\n\n"
        "Evaluate for:\n"
        "1. **Correctness** — errors, flaws, wrong conclusions\n"
        "2. **Completeness** — missing items the task required\n"
        "3. **False Positives** — issues flagged that aren't real\n\n"
        "Start with **VERIFIED** or **ISSUES FOUND**, then explain.\n"
        "Do NOT re-do the task. Only evaluate what was produced."
    )


def parse_verification_response(response: str) -> tuple[str, list]:
    """
    Parse the verifier's response into a verdict and issue list.

    Returns:
        (verdict, issues) where verdict is "VERIFIED" or "ISSUES_FOUND"
        and issues is a list of dicts with keys:
        description, category, severity
    """
    upper = response.upper().strip()

    if upper.startswith("VERIFIED") or upper.startswith("**VERIFIED**"):
        return "VERIFIED", []

    # Default to ISSUES_FOUND for anything that isn't a clear VERIFIED
    verdict = "ISSUES_FOUND"

    # Parse individual issues
    issues = []
    # Look for patterns like "Issue 1:", "**Issue 1:**", "- Issue:"
    issue_pattern = re.compile(
        r'\*?\*?Issue\s*\d*\*?\*?\s*[:.]?\s*(.*?)(?=\*?\*?Issue\s*\d|\Z)',
        re.IGNORECASE | re.DOTALL
    )

    matches = issue_pattern.findall(response)
    for match in matches:
        issue = {"description": match.strip()}

        # Try to extract category
        cat_match = re.search(
            r'\*?\*?Category\*?\*?\s*[:.]?\s*([\w\s]+)',
            match, re.IGNORECASE
        )
        if cat_match:
            issue["category"] = cat_match.group(1).strip()

        # Try to extract severity
        sev_match = re.search(
            r'\*?\*?Severity\*?\*?\s*[:.]?\s*(Critical|Major|Minor)',
            match, re.IGNORECASE
        )
        if sev_match:
            issue["severity"] = sev_match.group(1).strip()

        if issue["description"]:
            issues.append(issue)

    # If no structured issues found but verdict is ISSUES_FOUND,
    # treat the whole response as one issue
    if not issues and verdict == "ISSUES_FOUND":
        # Strip the "ISSUES FOUND" header
        body = re.sub(
            r'^\*?\*?ISSUES?\s*FOUND\*?\*?\s*[-:.]?\s*',
            '', response, flags=re.IGNORECASE
        ).strip()
        if body:
            issues.append({
                "description": body,
                "category": "unknown",
                "severity": "unknown"
            })

    return verdict, issues
