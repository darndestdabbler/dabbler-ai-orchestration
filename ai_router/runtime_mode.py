"""Resolves whether the current ai_router invocation suppresses routed calls.

``--no-router`` mode makes an invocation issue no LLM API calls — no routed
dispatch, no auto-verification. It exists for CI and hermetic tests, which
need the CLIs to run end-to-end without spending money or touching a network.

It is a test affordance, not a gate escape: it suppresses routed calls and
nothing else, and never relieves a close of any verification gate.

Precedence (high to low):
  1. CLI flag ``--no-router`` (one-off override)
  2. Env var ``DABBLER_NO_ROUTER`` (CI / shell-session default)
  3. Default: router enabled
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

ENV_VAR_NAME = "DABBLER_NO_ROUTER"

# None means "not yet resolved". Once resolve_no_router_mode runs, the result
# is cached so calls deep in the stack don't re-read the environment.
_NO_ROUTER_MODE: Optional[bool] = None


def _env_var_truthy() -> bool:
    raw = os.environ.get(ENV_VAR_NAME, "")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def resolve_no_router_mode(cli_flag: bool) -> bool:
    """Resolve and cache the --no-router decision for this process.

    Idempotent: subsequent calls return the cached value without
    re-evaluating precedence (a silent cache overwrite is a footgun for
    entry points that resolve twice). Tests call ``reset_for_tests`` first.
    """
    global _NO_ROUTER_MODE

    if _NO_ROUTER_MODE is not None:
        return _NO_ROUTER_MODE

    if cli_flag:
        logger.info("--no-router enabled via CLI flag")
        _NO_ROUTER_MODE = True
        return True

    if _env_var_truthy():
        logger.info("--no-router enabled via env var %s", ENV_VAR_NAME)
        _NO_ROUTER_MODE = True
        return True

    _NO_ROUTER_MODE = False
    return False


def is_no_router_mode() -> bool:
    """Return the cached resolution, falling back to the env var alone.

    The fallback does not cache — callers needing the result more than once
    should call ``resolve_no_router_mode`` at entry-point startup.
    """
    if _NO_ROUTER_MODE is not None:
        return _NO_ROUTER_MODE
    return _env_var_truthy()


def reset_for_tests() -> None:
    """Clear the cached resolution so each test starts fresh."""
    global _NO_ROUTER_MODE
    _NO_ROUTER_MODE = None


__all__ = [
    "ENV_VAR_NAME",
    "is_no_router_mode",
    "reset_for_tests",
    "resolve_no_router_mode",
]
