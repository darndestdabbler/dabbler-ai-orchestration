"""Secret resolver abstraction.

Provides ``resolve_secret(name, source)`` — the single call site for
looking up secret values (API keys, tokens). The env-var backend is the
only backend in Set 026; future sets can register additional backends
(secretStorage, keyring, etc.) via ``register_backend`` without touching
callers.

Usage::

    from secret_resolver import resolve_secret

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if api_key is None:
        raise EnvironmentError("ANTHROPIC_API_KEY not set")
"""

from __future__ import annotations

import os
from typing import Callable

# Registry: backend_name → callable(name) → str | None
_BACKENDS: dict[str, Callable[[str], str | None]] = {}


def register_backend(name: str, fn: Callable[[str], str | None]) -> None:
    """Register a secret backend under *name*.

    *fn* receives the secret name (e.g. ``"ANTHROPIC_API_KEY"``) and
    returns its value, or ``None`` if the secret is absent.
    """
    _BACKENDS[name] = fn


def resolve_secret(name: str, source: str = "env") -> str | None:
    """Look up *name* via the named *source* backend.

    Returns the secret value, or ``None`` if it is absent (or if the
    value is an empty string — callers should treat empty-string the same
    as absent).

    Raises ``ValueError`` if *source* names an unregistered backend.
    """
    backend = _BACKENDS.get(source)
    if backend is None:
        raise ValueError(
            f"Unknown secret backend: {source!r}. "
            f"Registered: {list(_BACKENDS)}"
        )
    value = backend(name)
    # Normalize empty-string to None so callers can do a simple truthiness check.
    if value == "":
        return None
    return value


# --- Built-in backends -------------------------------------------------------


def _env_backend(name: str) -> str | None:
    return os.environ.get(name)


register_backend("env", _env_backend)
