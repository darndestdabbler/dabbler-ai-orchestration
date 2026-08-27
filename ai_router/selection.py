"""Selection by role: the one rule both transports resolve candidates through.

A role declares two things and nothing else — **the provider set it may draw
from**, which is a hard filter, and **a preference order**, which is ordering
only. A model absent from the preference list still qualifies; it sorts after
the named ones. That is the whole reason the list is not the candidate
universe: a preference list that has gone stale costs a slightly older model
and never costs a candidate.

The transports differ only in what they can enumerate — the model registry on
the direct-API path, the confirmed seat catalog on the Copilot path. Both hand
their enumeration to :func:`resolve_role`, so the rule has one implementation.

A provider whose key does not resolve is not a candidate anywhere: selection
can never land on a model the process could not call.
"""

from __future__ import annotations

from .secret_resolver import resolve_secret

ROLE_GENERATOR = "generator"
ROLE_VERIFIER = "verifier"


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


def _normalize_providers(providers) -> set[str]:
    return {str(p).strip().lower() for p in (providers or []) if p}


def role_declaration(config: dict, role: str) -> tuple[list, set]:
    """``(preference order, permitted providers)`` for *role*.

    An undeclared role resolves to no preference and no provider restriction,
    which is every reachable candidate in declared order. Refusing here would
    make a role a thing that has to be declared before it can be asked for,
    and the preference order is an optimisation rather than a permission.
    """
    role_cfg = ((config.get("roles") or {}).get(role)) or {}
    prefer = [str(model_id) for model_id in (role_cfg.get("prefer") or [])]
    permitted = _normalize_providers(role_cfg.get("require_provider_in"))
    return prefer, permitted


def _untrusted_as_verifier(config: dict) -> set[str]:
    """Normalized ids the registry does not trust to review another model's
    output.

    Trust is a property of the model, not of the path that reaches it. The
    seat catalog carries no such flag, so without this the seat could verify
    with a model the registry explicitly marks untrusted — the exact gap the
    flag exists to close. A model the registry says nothing about stays
    eligible: an absent record is unknown, never unsupported, and a hard
    filter on missing metadata would end cross-vendor verification by
    accident.
    """
    from .identity import normalize_model_token

    tokens: set[str] = set()
    for alias, entry in (config.get("models") or {}).items():
        if not isinstance(entry, dict):
            continue
        if entry.get("is_enabled_as_verifier", True):
            continue
        tokens.add(normalize_model_token(alias))
        if entry.get("model_id"):
            tokens.add(normalize_model_token(str(entry["model_id"])))
    return tokens


def resolve_role(config: dict, role: str, candidates, *, exclude_providers=None):
    """The candidates that survive *role*, in preference order.

    *candidates* is an ordered sequence of tuples whose first element is the
    model id the preference order names and whose second is that model's
    provider; anything after those two is passed through untouched, so a
    transport can carry its own handle along.

    Survival is the role's provider set, the caller's exclusion, and — for
    the verifier role — the registry's judgment about which models may review
    another's work. The preference order only sorts, and ``sorted`` is
    stable, so candidates the order does not name keep the sequence the
    transport enumerated them in.
    """
    from .identity import normalize_model_token

    prefer, permitted = role_declaration(config, role)
    exclude = _normalize_providers(exclude_providers)
    untrusted = (
        _untrusted_as_verifier(config) if role == ROLE_VERIFIER else set()
    )
    surviving = [
        candidate for candidate in candidates
        if candidate[1]
        and candidate[1] not in exclude
        and (not permitted or candidate[1] in permitted)
        and (
            not untrusted
            or normalize_model_token(str(candidate[0])) not in untrusted
        )
    ]
    rank = {model_id: index for index, model_id in enumerate(prefer)}
    return sorted(surviving, key=lambda c: rank.get(c[0], len(prefer)))


def registry_candidates(
    config: dict, role: str, *, exclude_providers=None
) -> list[str]:
    """Registry aliases that survive *role*, in preference order.

    The direct-API path's enumeration. An entry qualifies when it is enabled
    and its provider is enabled with a resolvable API key; the role itself,
    including the verifier-trust rule, is applied by :func:`resolve_role`.
    """
    reachable: dict[str, bool] = {}
    candidates: list[tuple[str, str, str]] = []

    for alias, entry in (config.get("models") or {}).items():
        if not isinstance(entry, dict) or not entry.get("is_enabled", True):
            continue
        provider = str(entry.get("provider") or "").strip().lower()
        if not provider:
            continue
        if provider not in reachable:
            reachable[provider] = provider_reachable(config, provider)
        if not reachable[provider]:
            continue
        candidates.append((str(entry.get("model_id") or alias), provider, alias))

    return [
        alias for _, _, alias in resolve_role(
            config, role, candidates, exclude_providers=exclude_providers
        )
    ]
