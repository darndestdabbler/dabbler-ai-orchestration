"""Secret resolver: the single call site for looking up secret values.

The env-var backend is the only built-in backend; additional backends
(keyring, secretStorage) can be registered via ``register_backend``
without touching callers. An empty-string value is normalized to ``None``
so callers can use a simple truthiness check.
"""

from __future__ import annotations

import os
from typing import Callable

_BACKENDS: dict[str, Callable[[str], str | None]] = {}


def register_backend(name: str, fn: Callable[[str], str | None]) -> None:
    """Register a secret backend under *name*.

    *fn* receives the secret name (e.g. ``"DABBLER_ANTHROPIC_API_KEY"``)
    and returns its value, or ``None`` if the secret is absent.
    """
    _BACKENDS[name] = fn


def resolve_secret(name: str, source: str = "env") -> str | None:
    """Look up *name* via the named *source* backend.

    Returns the secret value, or ``None`` if it is absent or empty.
    Raises ``ValueError`` if *source* names an unregistered backend.
    """
    backend = _BACKENDS.get(source)
    if backend is None:
        raise ValueError(
            f"Unknown secret backend: {source!r}. Registered: {list(_BACKENDS)}"
        )
    value = backend(name)
    if value == "":
        return None
    return value


def _env_backend(name: str) -> str | None:
    return os.environ.get(name)


register_backend("env", _env_backend)
