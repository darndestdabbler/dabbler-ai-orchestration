"""Resolves whether the current ai_router invocation is in --no-router mode.

Set 048 Session 2: the Lightweight tier suppresses AI router runtime
calls (no LLM API hits, no auto-verification). The mode is resolved
once at process start from three precedence-ordered sources:

  1. CLI flag ``--no-router`` (highest; one-off override)
  2. Env var ``DABBLER_NO_ROUTER`` (CI / shell-session default)
  3. Spec.md field ``tier: lightweight`` (declarative per-set default)
  4. Default ``full`` mode (lowest; router enabled)

When a higher-precedence source overrides a lower one (e.g., CLI
``--no-router`` on a ``tier: full`` spec), the resolver emits an
informational message naming the override so the operator sees what
just happened. No refusal — explicit overrides always win.

This module also handles the "lazy LLM-SDK imports" deliverable from
the audit (§3.1 A2). In this codebase, providers already call LLMs via
httpx (see ``ai_router/providers.py``) — there are NO module-level
``anthropic`` / ``openai`` / ``google-generativeai`` imports to make
lazy. The audit work for A2 is therefore a no-op for this codebase;
documenting it here for the next architect who wonders.

The next session (S2 Commit C) wires this into ``route()`` and
``verify()`` so they short-circuit cleanly under no-router mode and
return a manual-attestation result without ever issuing httpx calls.
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
# to re-parse the spec or the env var.
_NO_ROUTER_MODE: Optional[bool] = None


def _env_var_truthy() -> bool:
    """Return True if DABBLER_NO_ROUTER is set to a truthy value.

    Truthy set follows the operator's existing convention from the
    Set 033 enforcement flag: ``1``, ``true``, ``yes``, ``on``
    (case-insensitive). Anything else (including unset) is falsy.
    """
    raw = os.environ.get(ENV_VAR_NAME, "")
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _spec_tier(session_set_dir: Optional[Path]) -> Optional[str]:
    """Return the spec.md's ``tier`` field, or None if no readable spec.

    Returns ``"lightweight"`` / ``"full"`` when the spec is parseable,
    or ``None`` when the dir is missing, the spec is missing, or the
    parser raised. The None case is distinct from ``"full"`` so the
    override-logging logic can tell "no spec" apart from "spec says
    full" — the former does not generate an override message; the
    latter does.
    """
    if session_set_dir is None:
        return None
    spec = Path(session_set_dir) / "spec.md"
    if not spec.exists():
        return None
    try:
        # Lazy-import the parser so this module stays cheap to import
        # even from test contexts that mock out spec.md.
        # S5 UAT fix: relative import resolves under pip-install mode
        # (bare `from spec_config` only worked via the test conftest's
        # sys.path shim, silently broken in production package consumers).
        from .spec_config import parse_session_set_config

        cfg = parse_session_set_config(spec)
        return cfg.tier
    except Exception:  # noqa: BLE001
        return None


def _spec_says_lightweight(session_set_dir: Optional[Path]) -> bool:
    """Convenience wrapper: True iff spec exists and says tier=lightweight."""
    return _spec_tier(session_set_dir) == "lightweight"


def resolve_no_router_mode(
    cli_flag: bool,
    session_set_dir: Optional[Path] = None,
) -> bool:
    """Resolve whether the current invocation is in --no-router mode.

    Precedence (high to low):
      1. ``cli_flag`` (explicit ``--no-router`` on the command line)
      2. ``DABBLER_NO_ROUTER`` env var
      3. ``tier: lightweight`` in ``<session_set_dir>/spec.md``
      4. Default (full mode)

    Side effect: caches the result in module-level ``_NO_ROUTER_MODE``.
    Subsequent calls to ``is_no_router_mode`` return the cached value
    without re-parsing.

    Logging: when a higher-precedence source contradicts a lower one,
    emits an ``INFO`` log line naming the source that won.

    **Idempotency**: subsequent invocations of this function are no-ops
    that return the cached value (Set 048 S2 Round-A verifier-flagged
    Major #4 fix — silent cache overwrite was a footgun for entry points
    that resolve twice). If a test or harness needs to re-resolve,
    call ``reset_for_tests()`` first.
    """
    global _NO_ROUTER_MODE

    if _NO_ROUTER_MODE is not None:
        # Already resolved; return cached. Don't re-log or re-evaluate
        # precedence — that would be misleading on the second call.
        logger.debug(
            "resolve_no_router_mode called again (cached=%s); returning cache",
            _NO_ROUTER_MODE,
        )
        return _NO_ROUTER_MODE

    env_says = _env_var_truthy()
    tier = _spec_tier(session_set_dir)  # "lightweight" | "full" | None

    if cli_flag:
        if tier == "full":
            logger.info(
                "CLI flag --no-router overrides spec tier=full for this invocation"
            )
        elif tier == "lightweight":
            logger.info(
                "--no-router enabled via CLI flag (spec tier=lightweight agreed)"
            )
        else:
            logger.info("--no-router enabled via CLI flag")
        _NO_ROUTER_MODE = True
        return True

    if env_says:
        if tier == "full":
            logger.info(
                "Env var %s overrides spec tier=full for this invocation",
                ENV_VAR_NAME,
            )
        elif tier == "lightweight":
            logger.info(
                "--no-router enabled via env var %s (spec tier=lightweight agreed)",
                ENV_VAR_NAME,
            )
        else:
            logger.info("--no-router enabled via env var %s", ENV_VAR_NAME)
        _NO_ROUTER_MODE = True
        return True

    if tier == "lightweight":
        logger.info("--no-router enabled via spec tier=lightweight")
        _NO_ROUTER_MODE = True
        return True

    _NO_ROUTER_MODE = False
    return False


def is_no_router_mode() -> bool:
    """Return the cached --no-router resolution.

    If ``resolve_no_router_mode`` has not run yet, attempts a lazy
    resolution from env var + active-session-set spec only (no CLI
    flag context available). The lazy resolution does NOT cache —
    callers that need the result more than once should call
    ``resolve_no_router_mode`` explicitly at entry-point startup.
    """
    if _NO_ROUTER_MODE is not None:
        return _NO_ROUTER_MODE
    # Lazy resolution: env var + active session set's spec, no CLI
    if _env_var_truthy():
        return True
    try:
        # Avoid hard-coded import of find_active_session_set — that
        # module is heavy and may not be available in test contexts.
        # Set 077 S1: bare-then-relative, matching every other lazy
        # import — the bare-only form raised ModuleNotFoundError under
        # pip-install mode, so the lazy path always returned False there.
        try:
            from session_state import find_active_session_set
        except ImportError:
            from .session_state import (  # type: ignore[no-redef]
                find_active_session_set,
            )

        active = find_active_session_set()
        if active:
            return _spec_says_lightweight(Path(active))
    except Exception:  # noqa: BLE001
        pass
    return False


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
