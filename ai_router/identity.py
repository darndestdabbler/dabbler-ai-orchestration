"""Orchestrator identity: which provider effectively ran this session.

The independence guarantee rests here — the verifier must come from a
different provider than the orchestrator, so the orchestrator's effective
provider must be *derived*, never trusted. Identity is the underlying model
resolved through the model registry at use time; the free-text ``provider``
label on the orchestrator block is a seat descriptor and an explicit second
choice. A Copilot seat's label is never trusted at all: multi-provider
engines resolve through the model or fail closed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

MULTI_PROVIDER_ENGINES = frozenset({"github-copilot", "copilot"})
PROVENANCE_DIRECT = "direct"
PROVENANCE_ASSERTED = "asserted"

SOURCE_MODEL_REGISTRY = "model-registry"
SOURCE_PROVIDER_FIELD = "provider-field"

_DATE_SUFFIX = re.compile(r"-\d{8}$")


class IdentityResolutionError(Exception):
    """The orchestrator's effective provider cannot be established. Fail
    closed — the fix is always ``start_session --model``."""


@dataclass(frozen=True)
class OrchestratorIdentity:
    effective_provider: str
    provenance: Optional[str]
    source: str
    model: Optional[str] = None
    engine: Optional[str] = None


def is_multi_provider_engine(engine) -> bool:
    if not isinstance(engine, str):
        return False
    return engine.strip().lower() in MULTI_PROVIDER_ENGINES


def classify_identity_provenance(engine) -> Optional[str]:
    """Derived from the engine, never a free choice: 'asserted' for seats
    that can front any vendor, 'direct' for single-vendor engines."""
    if not isinstance(engine, str) or not engine.strip():
        return None
    return (
        PROVENANCE_ASSERTED if is_multi_provider_engine(engine)
        else PROVENANCE_DIRECT
    )


def normalize_model_token(model: str) -> str:
    """Dots to hyphens, lowercased. A trailing ``-YYYYMMDD`` is stripped
    only on ``claude-`` ids — an unscoped strip once let an invented dated
    variant of another provider's id normalize onto a real entry.

    Public because the registry and a seat catalog spell the same model
    differently, and more than one caller has to decide whether two ids name
    one model."""
    token = model.strip().lower().replace(".", "-")
    if token.startswith("claude-"):
        token = _DATE_SUFFIX.sub("", token)
    return token


def _load_default_registry() -> dict:
    try:
        from .config import load_config
        return load_config().get("models") or {}
    except Exception:
        return {}


def _catalog_provider(token: str) -> Optional[str]:
    """The seat-catalog fallback: the Copilot CLI's confirmed model universe
    is documented truth, so membership there is a registry lookup, not a
    name-prefix guess. Best-effort — an unreadable lock resolves nothing."""
    try:
        from .transports.copilot import KNOWN_PROVIDERS, load_catalog
        lock = Path(__file__).parent / "copilot-catalog.lock"
        catalog = load_catalog(lock)
    except Exception:
        return None
    for entry in catalog.confirmed_models():
        if normalize_model_token(entry.id) == token:
            provider = str(entry.provider or "").strip().lower()
            return provider if provider in KNOWN_PROVIDERS else None
    return None


def resolve_model_provider(
    model, models_registry: Optional[dict] = None
) -> Optional[str]:
    """Canonical lowercase provider for a model string, or ``None``. Four
    bounded lookups: exact registry key, exact model_id, normalized token
    across both, then the confirmed seat-catalog universe."""
    if not isinstance(model, str) or not model.strip():
        return None
    registry = (
        models_registry if models_registry is not None
        else _load_default_registry()
    )

    entry = registry.get(model)
    if isinstance(entry, dict) and entry.get("provider"):
        return str(entry["provider"]).strip().lower()

    for entry in registry.values():
        if isinstance(entry, dict) and entry.get("model_id") == model:
            provider = entry.get("provider")
            if provider:
                return str(provider).strip().lower()

    token = normalize_model_token(model)
    for alias, entry in registry.items():
        if not isinstance(entry, dict):
            continue
        if normalize_model_token(alias) == token or (
            entry.get("model_id")
            and normalize_model_token(str(entry["model_id"])) == token
        ):
            provider = entry.get("provider")
            if provider:
                return str(provider).strip().lower()

    return _catalog_provider(token)


def resolve_orchestrator_identity(
    orchestrator, *, models_registry: Optional[dict] = None
) -> OrchestratorIdentity:
    """Resolve the effective provider from a persisted orchestrator block.

    Precedence: the model resolved through the registry wins over any
    ``provider`` label. A multi-provider engine whose model does not
    resolve fails closed — the seat label is not trusted. A single-vendor
    engine may fall back to its label (read-side legacy tolerance only;
    ``start_session`` refuses any new unresolvable model).
    """
    if not isinstance(orchestrator, dict) or not orchestrator:
        raise IdentityResolutionError(
            "session-state carries no orchestrator block; re-run "
            "start_session with --engine and --model, then retry."
        )
    engine = orchestrator.get("engine")
    engine = engine.strip() if isinstance(engine, str) and engine.strip() else None
    model = orchestrator.get("model")
    model = model.strip() if isinstance(model, str) and model.strip() else None
    provenance = classify_identity_provenance(engine)
    multi = is_multi_provider_engine(engine)

    if model is not None:
        provider = resolve_model_provider(model, models_registry)
        if provider:
            return OrchestratorIdentity(
                effective_provider=provider, provenance=provenance,
                source=SOURCE_MODEL_REGISTRY, model=model, engine=engine,
            )
        if multi:
            raise IdentityResolutionError(
                f"orchestrator model {model!r} does not resolve in the model "
                "registry and the engine is a multi-provider seat, so the "
                "provider label cannot be trusted. Re-run start_session "
                "with a registry-known --model, then retry."
            )
    elif multi:
        raise IdentityResolutionError(
            "a multi-provider engine (Copilot seat) recorded no model; the "
            "effective provider cannot be derived. Re-run start_session "
            "with --model, then retry."
        )

    label = orchestrator.get("provider")
    if isinstance(label, str) and label.strip():
        return OrchestratorIdentity(
            effective_provider=label.strip().lower(), provenance=provenance,
            source=SOURCE_PROVIDER_FIELD, model=model, engine=engine,
        )
    raise IdentityResolutionError(
        "orchestrator block resolves no provider (no registry-known model, "
        "no provider label). Re-run start_session with --model, then retry."
    )


def resolve_session_orchestrator_identity(
    set_dir, session_number: Optional[int] = None, *,
    models_registry: Optional[dict] = None,
) -> OrchestratorIdentity:
    """The one session-level path: read state, normalize, pick the session
    (explicit number, else the in-progress one, else the last session with
    an orchestrator block), resolve. Every failure is an
    :class:`IdentityResolutionError`."""
    from .progress import read_session_state

    state = read_session_state(set_dir)
    if state is None:
        raise IdentityResolutionError(
            f"no readable session-state.json under {set_dir}"
        )
    sessions = state.get("sessions") or []

    chosen = None
    if session_number is not None:
        chosen = next(
            (s for s in sessions if s.get("number") == session_number), None
        )
    if chosen is None and session_number is None:
        chosen = next(
            (s for s in sessions if s.get("status") == "in-progress"), None
        )
        if chosen is None:
            with_block = [
                s for s in sessions if isinstance(s.get("orchestrator"), dict)
            ]
            chosen = with_block[-1] if with_block else None
    block = (
        chosen.get("orchestrator") if isinstance(chosen, dict) else None
    ) or state.get("orchestrator")
    if not block:
        raise IdentityResolutionError(
            f"no session under {set_dir} carries an orchestrator block "
            f"(session_number={session_number!r}); re-run start_session "
            "with --model, then retry."
        )
    return resolve_orchestrator_identity(
        block, models_registry=models_registry
    )
