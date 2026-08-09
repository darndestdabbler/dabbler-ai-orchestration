"""Resolves whether the current ai_router invocation suppresses routed calls.

``--no-router`` mode makes an invocation issue **no LLM API calls** — no
routed dispatch, no auto-verification. It exists for CI and hermetic
tests, which need the CLIs to run end-to-end without spending money or
depending on a network.

Set 112 deleted the Lightweight tier, and with it the spec-field source
(``tier: lightweight``) that used to sit third in this precedence chain.
Two sources remain:

  1. CLI flag ``--no-router`` (highest; one-off override)
  2. Env var ``DABBLER_NO_ROUTER`` (CI / shell-session default)
  3. Default: router enabled (lowest)

**``--no-router`` is a test affordance, not a tier and not a gate
escape.** It suppresses routed calls and nothing else: it does not
relieve a close of any verification gate. Before Set 112 the env var
alone disarmed ``check_verification_integrity`` and the expensive-suite
freshness check, because it was one of the ways the Lightweight tier
turned itself on. That escape retired with the tier.

This module also handles the "lazy LLM-SDK imports" deliverable from
the audit (§3.1 A2). In this codebase, providers already call LLMs via
httpx (see ``ai_router/providers.py``) — there are NO module-level
``anthropic`` / ``openai`` / ``google-generativeai`` imports to make
lazy. The audit work for A2 is therefore a no-op for this codebase;
documenting it here for the next architect who wonders.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

ENV_VAR_NAME = "DABBLER_NO_ROUTER"

# Module-level cache: None means "not yet resolved." Once
# ``resolve_no_router_mode`` runs, the result is cached here so that
# ``is_no_router_mode`` calls from deep in the call stack don't have
# to re-read the env var.
_NO_ROUTER_MODE: Optional[bool] = None


def _env_var_truthy() -> bool:
    """Return True if DABBLER_NO_ROUTER is set to a truthy value.

    Truthy set follows the operator's existing convention from the
    Set 033 enforcement flag: ``1``, ``true``, ``yes``, ``on``
    (case-insensitive). Anything else (including unset) is falsy.
    """
    raw = os.environ.get(ENV_VAR_NAME, "")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def resolve_no_router_mode(
    cli_flag: bool,
    session_set_dir: Optional[Path] = None,
) -> bool:
    """Resolve whether the current invocation is in --no-router mode.

    Precedence (high to low):
      1. ``cli_flag`` (explicit ``--no-router`` on the command line)
      2. ``DABBLER_NO_ROUTER`` env var
      3. Default (router enabled)

    ``session_set_dir`` is accepted and ignored. Set 112 removed the
    spec-field source that used to read it; the parameter stays in the
    signature so consumer-repo callers (and the several in-repo entry
    points that pass it positionally) keep working across the upgrade.

    Side effect: caches the result in module-level ``_NO_ROUTER_MODE``.
    Subsequent calls to ``is_no_router_mode`` return the cached value
    without re-reading the environment.

    Logging: emits an ``INFO`` line naming the source that won.

    **Idempotency**: subsequent invocations of this function are no-ops
    that return the cached value (Set 048 S2 Round-A verifier-flagged
    Major #4 fix — silent cache overwrite was a footgun for entry points
    that resolve twice). If a test or harness needs to re-resolve,
    call ``reset_for_tests()`` first.
    """
    global _NO_ROUTER_MODE

    del session_set_dir  # accepted for signature stability; see docstring

    if _NO_ROUTER_MODE is not None:
        # Already resolved; return cached. Don't re-log or re-evaluate
        # precedence — that would be misleading on the second call.
        logger.debug(
            "resolve_no_router_mode called again (cached=%s); returning cache",
            _NO_ROUTER_MODE,
        )
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
    """Return the cached --no-router resolution.

    If ``resolve_no_router_mode`` has not run yet, falls back to the env
    var alone (no CLI-flag context is available here). The fallback does
    NOT cache — callers that need the result more than once should call
    ``resolve_no_router_mode`` explicitly at entry-point startup.
    """
    if _NO_ROUTER_MODE is not None:
        return _NO_ROUTER_MODE
    return _env_var_truthy()


def reset_for_tests() -> None:
    """Test helper: clear the cached resolution so each test starts fresh."""
    global _NO_ROUTER_MODE
    _NO_ROUTER_MODE = None


__all__ = [
    "ENV_VAR_NAME",
    "is_no_router_mode",
    "reset_for_tests",
    "resolve_no_router_mode",
]
