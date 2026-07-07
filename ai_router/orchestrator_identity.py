"""Shared orchestrator-identity resolution (Set 084 F1).

The third live verification bypass (2026-07-06, cold-start Copilot-seat
walk) exploited the fact that the close gate compared the verifier's
provider against a free-text seat label the orchestrator itself supplied
(``provider: openai`` one session, ``provider: anthropic`` the next, same
seat class). This module makes identity **the underlying model, resolved
through the model registry** — the effective provider is always *derived*
at use time by registry lookup on the orchestrator block's ``model``
field, never stored (stored-vs-derived drift is the disease Set 084
treats). The free-text ``provider`` label remains only as the seat
descriptor, consulted as an explicit second choice for single-vendor
engines that recorded no model (the pre-084 behavior, preserved).

One resolution helper serves every consumer — the Set 083 close gate
(``gate_checks.check_verification_integrity``), verifier selection
(``verify_session`` / ``route()`` dynamic exclusion), and
``start_session`` boundary validation — so the fix covers every sibling
site in one pass (L-069-1). Unresolvable identity **fails closed**
everywhere it is consumed: this module raises the typed
:class:`IdentityResolutionError` and callers refuse rather than guessing.

The registry
------------

Two registry surfaces back the lookup, both bounded (never a bare
name-prefix guess on an arbitrary string — the Set 078 S3 round-3
finding):

1. ``router-config.yaml``'s ``models:`` map — matched by entry key, by
   ``model_id``, and by normalized token (lowercase, ``.`` -> ``-``), so
   ``claude-sonnet-4.6`` resolves against the ``claude-sonnet-4-6``
   ``model_id``.
2. :data:`ai_router.copilot_catalog.KNOWN_MODEL_UNIVERSE` — the CLI's
   documented static model universe, resolved through
   :func:`ai_router.copilot_catalog.infer_provider` and accepted only
   when the result is in :data:`ai_router.copilot_catalog.KNOWN_PROVIDERS`.
   Membership in the documented universe is what makes this a registry
   lookup rather than a heuristic guess.

Provenance
----------

``identityProvenance`` records *how identity was established* and is
derived from the engine, never a free choice: ``asserted`` for
multi-provider engines (:data:`MULTI_PROVIDER_ENGINES` — a Copilot seat
relays whatever model the picker selected, so the model claim is the
orchestrator's assertion), ``direct`` for single-vendor engines (the
engine itself implies the vendor). A Copilot-seat row must never look
identical to a direct-API row (operator decision, Set 084 spec).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

try:  # package vs bare-import (mirrors the rest of ai_router)
    from .copilot_catalog import (
        KNOWN_MODEL_UNIVERSE,
        KNOWN_PROVIDERS,
        infer_provider,
    )
except ImportError:  # pragma: no cover - test/bare context
    from copilot_catalog import (  # type: ignore[import-not-found]
        KNOWN_MODEL_UNIVERSE,
        KNOWN_PROVIDERS,
        infer_provider,
    )


# The engines whose seat can serve models from more than one underlying
# vendor. ONE module constant (spec Session 1 step 1) — every consumer
# (start_session validation, the close gate, verifier exclusion) reads
# this set, so adding a future multi-provider engine is a one-line change.
MULTI_PROVIDER_ENGINES = frozenset({"github-copilot", "copilot"})

PROVENANCE_DIRECT = "direct"
PROVENANCE_ASSERTED = "asserted"
IDENTITY_PROVENANCE_VALUES = frozenset(
    {PROVENANCE_DIRECT, PROVENANCE_ASSERTED}
)

# Resolution sources reported on OrchestratorIdentity.source.
SOURCE_MODEL_REGISTRY = "model-registry"
SOURCE_PROVIDER_FIELD = "provider-field"


class IdentityResolutionError(Exception):
    """Typed fail-closed error: the orchestrator's effective provider
    could not be established. Consumers refuse (gate fails closed,
    verifier selection refuses, start_session exits non-zero) rather
    than falling back to a guess. The message always names the
    remediation (``start_session --model``)."""


@dataclass(frozen=True)
class OrchestratorIdentity:
    """A resolved orchestrator identity.

    Attributes:
        effective_provider: canonical lowercase provider name, derived
            at resolution time (never read from storage).
        provenance: ``direct`` / ``asserted`` (derived from the engine),
            or ``None`` when the block records no engine.
        source: which surface resolved the provider —
            :data:`SOURCE_MODEL_REGISTRY` or :data:`SOURCE_PROVIDER_FIELD`.
        model: the block's model string, verbatim (``None`` when absent).
        engine: the block's engine string, verbatim (``None`` when absent).
    """

    effective_provider: str
    provenance: Optional[str]
    source: str
    model: Optional[str] = None
    engine: Optional[str] = None


def is_multi_provider_engine(engine: Optional[str]) -> bool:
    """True when *engine* names a multi-provider seat (case-insensitive)."""
    if not isinstance(engine, str):
        return False
    return engine.strip().lower() in MULTI_PROVIDER_ENGINES


def classify_identity_provenance(engine: Optional[str]) -> Optional[str]:
    """Derive ``identityProvenance`` from the engine — never a free choice.

    ``asserted`` for multi-provider engines, ``direct`` for every other
    non-empty engine, ``None`` when the engine is missing/blank (nothing
    to derive from; omit-null drops the field).
    """
    if not isinstance(engine, str) or not engine.strip():
        return None
    return (
        PROVENANCE_ASSERTED
        if is_multi_provider_engine(engine)
        else PROVENANCE_DIRECT
    )


_DATE_SUFFIX = re.compile(r"-\d{8}$")


def _normalize_model_token(model: str) -> str:
    """Canonical comparison token: lowercase, ``.`` collapsed to ``-``;
    for the ANTHROPIC id family only, a trailing ``-YYYYMMDD`` snapshot
    date is also stripped.

    Model ids drift between dot and dash forms across surfaces (the
    Copilot CLI documents ``claude-sonnet-4.6``; router-config.yaml's
    Anthropic ``model_id`` is ``claude-sonnet-4-6``). Anthropic's
    canonical API ids additionally carry a dated suffix
    (``claude-haiku-4-5-20251001``) that denotes the same underlying
    model as the undated alias — that alias convention is Anthropic's
    (``claude-*``), so the strip is scoped to it (R3 finding
    I-084-S1-5: an unscoped strip let an INVENTED dated variant of any
    provider's id — e.g. ``gpt-5.4-20251001`` — normalize onto a real
    registry entry and slip past the start_session boundary; other
    providers have no such dated-alias contract, so their dated
    variants must fail to resolve).
    """
    token = model.strip().lower().replace(".", "-")
    if token.startswith("claude-"):
        token = _DATE_SUFFIX.sub("", token)
    return token


def _load_default_registry() -> dict:
    """``router-config.yaml``'s ``models:`` map, or ``{}`` when unloadable.

    Lazy import so this module stays importable in bare/test contexts
    with no loadable config; an unloadable config degrades to the
    copilot-universe half of the registry rather than raising here
    (the *caller's* fail-closed contract still applies — a model that
    resolves nowhere raises :class:`IdentityResolutionError`).
    """
    try:
        try:
            from .config import load_config
        except ImportError:  # pragma: no cover - bare context
            from config import load_config  # type: ignore[import-not-found]
        models = load_config().get("models")
        return models if isinstance(models, dict) else {}
    except Exception:
        return {}


def resolve_model_provider(
    model: Optional[str],
    models_registry: Optional[dict] = None,
) -> Optional[str]:
    """The provider *model* resolves to via the registry, or ``None``.

    Lookup order: registry key (exact), registry ``model_id`` (exact),
    normalized-token match across keys and model_ids, then the Copilot
    CLI's documented model universe via the name-prefix convention
    (accepted only for universe members whose inferred provider is in
    :data:`KNOWN_PROVIDERS`). Returns the canonical lowercase provider
    name, or ``None`` when the model resolves nowhere — the caller
    decides what fail-closed means at its boundary.

    *models_registry* defaults to the loaded ``router-config.yaml``
    ``models:`` map; tests pass an explicit dict for hermeticity.
    """
    if not isinstance(model, str) or not model.strip():
        return None
    registry = (
        models_registry
        if models_registry is not None
        else _load_default_registry()
    )

    def _provider_of(entry: object) -> Optional[str]:
        if isinstance(entry, dict):
            provider = entry.get("provider")
            if isinstance(provider, str) and provider.strip():
                return provider.strip().lower()
        return None

    # 1. Exact registry key.
    provider = _provider_of(registry.get(model))
    if provider:
        return provider
    # 2. Exact model_id.
    for entry in registry.values():
        if isinstance(entry, dict) and entry.get("model_id") == model:
            provider = _provider_of(entry)
            if provider:
                return provider
    # 3. Normalized token across keys and model_ids.
    token = _normalize_model_token(model)
    for key, entry in registry.items():
        if not isinstance(entry, dict):
            continue
        candidates = {str(key)}
        model_id = entry.get("model_id")
        if isinstance(model_id, str):
            candidates.add(model_id)
        if any(_normalize_model_token(c) == token for c in candidates):
            provider = _provider_of(entry)
            if provider:
                return provider
    # 4. The Copilot CLI's documented model universe (bounded — never a
    #    bare prefix guess on an arbitrary string).
    for universe_id in KNOWN_MODEL_UNIVERSE:
        if _normalize_model_token(universe_id) == token:
            inferred, _source = infer_provider(universe_id)
            if inferred in KNOWN_PROVIDERS:
                return inferred
            return None
    return None


def resolve_orchestrator_identity(
    orchestrator: Optional[dict],
    *,
    models_registry: Optional[dict] = None,
) -> OrchestratorIdentity:
    """Resolve a session-state orchestrator block to its effective provider.

    Resolution order (spec Session 1 step 1):

    1. **Model, via the registry** — always first; when the block's
       ``model`` resolves, it wins over any ``provider`` label (the
       arbitrary-label case: seat label says ``openai``, model says
       anthropic — the model wins).
    2. **Provider field, single-vendor engines only** — the pre-084
       behavior, now explicitly second choice. A multi-provider engine
       (:data:`MULTI_PROVIDER_ENGINES`) never falls back to the label:
       a missing or registry-unknown model **fails closed** with
       :class:`IdentityResolutionError`.

    Raises:
        IdentityResolutionError: block missing/malformed; multi-provider
            engine with a missing or registry-unknown model; or nothing
            resolvable at all. The message names the remediation
            (``start_session --model``).
    """
    if not isinstance(orchestrator, dict) or not orchestrator:
        raise IdentityResolutionError(
            "no orchestrator block recorded for this session, so the "
            "effective provider cannot be resolved (missing identity "
            "fails closed). Re-run start_session with --engine, "
            "--provider and --model."
        )

    engine_raw = orchestrator.get("engine")
    engine = engine_raw if isinstance(engine_raw, str) and engine_raw.strip() else None
    model_raw = orchestrator.get("model")
    model = model_raw if isinstance(model_raw, str) and model_raw.strip() else None
    provenance = classify_identity_provenance(engine)
    multi = is_multi_provider_engine(engine)

    if model is not None:
        provider = resolve_model_provider(model, models_registry)
        if provider is not None:
            return OrchestratorIdentity(
                effective_provider=provider,
                provenance=provenance,
                source=SOURCE_MODEL_REGISTRY,
                model=model,
                engine=engine,
            )
        if multi:
            raise IdentityResolutionError(
                f"orchestrator model {model!r} (engine {engine!r}) does "
                "not resolve in the model registry, and a multi-provider "
                "engine's identity is the registry-resolved model — the "
                "seat label is not trusted (fails closed). Re-run "
                "start_session with a registry-known --model."
            )
        # Single-vendor engine with an unresolvable model string: fall
        # through to the provider-field second choice below. READ-SIDE
        # LEGACY TOLERANCE ONLY (I-084-S1-4): pre-084 state files carry
        # model strings the registry does not cover (this repo's own
        # history has "claude-sonnet-5" and dated snapshot ids), and a
        # single-vendor engine's label is exactly as trustworthy as its
        # engine (one vendor). The Set 084 boundary prevents NEW
        # occurrences: start_session refuses any supplied model that
        # does not resolve, for every engine.

    if multi:
        raise IdentityResolutionError(
            f"multi-provider engine {engine!r} recorded no model; its "
            "identity is the underlying model resolved through the "
            "registry, never the seat label (fails closed). Re-run "
            "start_session with --model."
        )

    provider_raw = orchestrator.get("provider")
    if isinstance(provider_raw, str) and provider_raw.strip():
        return OrchestratorIdentity(
            effective_provider=provider_raw.strip().lower(),
            provenance=provenance,
            source=SOURCE_PROVIDER_FIELD,
            model=model,
            engine=engine,
        )

    raise IdentityResolutionError(
        f"orchestrator block (engine {engine!r}) records neither a "
        "registry-resolvable model nor a provider label (missing "
        "identity fails closed). Re-run start_session with --model "
        "(preferred) or --provider."
    )


def resolve_session_orchestrator_identity(
    session_set: str,
    session_number: Optional[int] = None,
    *,
    models_registry: Optional[dict] = None,
) -> OrchestratorIdentity:
    """Resolve the orchestrator identity recorded for a session on disk.

    The one shared session-level resolution path (L-069-1): both the
    ``verify_session`` CLI and ``route(task_type="session-verification")``
    with session context resolve the orchestrator whose provider must be
    EXCLUDED from verifier selection through this function, so the CLI
    and a bare call can never diverge (spec Session 1 step 4).

    *session_set* is a session-set directory path or a bare set-number
    handle (resolved like every lifecycle CLI). *session_number* picks
    the session whose orchestrator block is resolved; when ``None``, the
    in-progress session is used, falling back to the most recent session
    carrying an orchestrator block.

    Raises:
        IdentityResolutionError: the set/state/session cannot be read,
            or the block does not resolve (fail closed — a verification
            whose exclusion target is unknown must not run).
    """
    import os

    try:  # lazy: keeps this module import-light for bare/test contexts
        try:
            from .resolve_set import resolve_session_set_dir
            from .session_state import read_session_state
            from .progress import normalize_to_v4_shape
        except ImportError:  # pragma: no cover - bare context
            from resolve_set import resolve_session_set_dir  # type: ignore[no-redef]
            from session_state import read_session_state  # type: ignore[no-redef]
            from progress import normalize_to_v4_shape  # type: ignore[no-redef]
    except Exception as exc:  # pragma: no cover - packaging failure
        raise IdentityResolutionError(
            f"session-state readers unavailable ({type(exc).__name__}: "
            f"{exc}; fails closed)"
        ) from exc

    set_dir = session_set
    if not os.path.isdir(set_dir):
        try:
            set_dir = resolve_session_set_dir(session_set)
        except Exception as exc:
            raise IdentityResolutionError(
                f"session set {session_set!r} does not resolve to a "
                f"directory ({exc}); the orchestrator identity cannot be "
                "read (fails closed)."
            ) from exc
    if not os.path.isdir(set_dir):
        raise IdentityResolutionError(
            f"session set directory not found: {set_dir!r} (fails closed)."
        )

    state = read_session_state(str(set_dir))
    if not isinstance(state, dict) or not state:
        raise IdentityResolutionError(
            f"no readable session-state.json in {set_dir!r}; the "
            "orchestrator identity cannot be resolved (fails closed). "
            "Run start_session first."
        )
    spec_md_path = os.path.join(str(set_dir), "spec.md")
    try:
        normalized = normalize_to_v4_shape(state, spec_md_path)
    except Exception as exc:
        raise IdentityResolutionError(
            f"session-state.json failed to normalize "
            f"({type(exc).__name__}: {exc}; fails closed)."
        ) from exc

    sessions = [
        e for e in (normalized.get("sessions") or []) if isinstance(e, dict)
    ]
    target: Optional[dict] = None
    if session_number is not None:
        for entry in sessions:
            if entry.get("number") == session_number:
                target = entry
                break
    else:
        for entry in sessions:
            if entry.get("status") == "in-progress":
                target = entry
                break
        if target is None:
            for entry in reversed(sessions):
                if isinstance(entry.get("orchestrator"), dict):
                    target = entry
                    break
    if target is None:
        raise IdentityResolutionError(
            f"no session record found in {set_dir!r} for session "
            f"{session_number!r} (fails closed)."
        )

    orch = target.get("orchestrator")
    orch_block = orch if isinstance(orch, dict) else None
    return resolve_orchestrator_identity(
        orch_block, models_registry=models_registry
    )
