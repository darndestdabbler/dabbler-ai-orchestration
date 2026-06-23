"""Blessed enable / disable / inspect for the ``.dabbler/local-only`` marker.

A repository that is *deliberately* remote-less (no git remote, by operator
decision — and never will have one) carries a ``.dabbler/local-only`` marker
file. When the marker is present **and no git remote is configured**,
:func:`ai_router.gate_checks.check_pushed_to_remote` turns the missing-upstream
case into a *pass-with-note* instead of a configuration-error failure, so the
close-out gate passes cleanly without forcing ``--force`` on every session.
The full rationale and the behavior matrix live in
``ai_router/docs/close-out.md`` → *The sanctioned local-only close path*.

Why a CLI
---------
The marker is just a file — an operator *could* ``touch`` it by hand — but a
blessed entry point (1) removes the guesswork about the exact path, (2) is
idempotent so re-running is always safe, and (3) records a small human-readable
**audit note** *inside the marker file itself* on enable (when, by what, why).
That note is the durable record explaining why the push gate later
passes-with-note rather than runs — it reuses the marker as its own record
rather than inventing a parallel ledger, and it is the same fact the gate's
``gate_results`` note surfaces at close-out.

Only the marker's *presence* gates behavior (:func:`gate_checks.is_local_only`
reads presence only and never parses the contents), so the note is free-form
context for a human reading the file; changing or removing the note never
changes the gate decision.

Usage
-----

::

    python -m ai_router.local_only --status
    python -m ai_router.local_only --enable [--reason "<why>"]
    python -m ai_router.local_only --disable

By default the marker is resolved against the git repository that contains the
current working directory (falling back to the working directory itself when it
is not inside a git tree). Pass ``--repo-root PATH`` to target a specific tree.

This module makes no routed LLM calls and is dependency-free beyond the
standard library plus the sibling :mod:`ai_router.gate_checks` (for the marker
contract it shares), so it is safe to run under any budget regime.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from typing import List, Optional, Tuple

try:
    from .gate_checks import (  # type: ignore[import-not-found]
        _LOCAL_ONLY_MARKER,
        _has_remote,
        _repo_root_for,
        is_local_only,
    )
except ImportError:  # pragma: no cover - flat-path import for the test harness
    from gate_checks import (  # type: ignore[no-redef]
        _LOCAL_ONLY_MARKER,
        _has_remote,
        _repo_root_for,
        is_local_only,
    )


# Sentinel written as the first line of the marker so a human opening the file
# immediately understands what it is. Kept ASCII-only and stable; the gate
# never reads it.
_MARKER_BANNER = (
    "# .dabbler/local-only -- this repository is deliberately remote-less.\n"
    "# The close-out push gate (ai_router.gate_checks.check_pushed_to_remote)\n"
    "# passes-with-note instead of failing on the missing upstream, but ONLY\n"
    "# while no git remote is configured. See ai_router/docs/close-out.md.\n"
)


def _ascii_safe(text: str) -> str:
    """Render *text* so it cannot crash a Windows ``cp1252`` console.

    The CLI echoes externally-sourced strings (the repo path, the marker path,
    and the marker contents — which include a free-form ``--reason``). Any of
    those can carry non-ASCII (a UTF-8 reason, a non-ASCII username in the path).
    The project Code Style convention requires console output to be ASCII-only so
    a ``cp1252`` console never raises ``UnicodeEncodeError`` mid-line; the marker
    *file* stays UTF-8 (it is written separately) so the stored reason is never
    mangled. Non-encodable characters become ``\\xNN`` / ``\\uNNNN`` escapes.
    """
    return text.encode("ascii", "backslashreplace").decode("ascii")


def marker_path(repo_root: str) -> str:
    """Absolute path of the ``.dabbler/local-only`` marker under *repo_root*."""
    return os.path.join(repo_root, _LOCAL_ONLY_MARKER)


def _now_iso(now: Optional[datetime] = None) -> str:
    """ISO-8601, timezone-aware. Injectable for deterministic tests."""
    dt = now or datetime.now().astimezone()
    return dt.isoformat()


def _render_note(reason: Optional[str], now: Optional[datetime] = None) -> str:
    """Build the marker file body: the banner plus the enable audit note."""
    reason_line = reason.strip() if reason and reason.strip() else "(none given)"
    return (
        _MARKER_BANNER
        + f"enabled_at: {_now_iso(now)}\n"
        + "enabled_by: ai_router.local_only --enable\n"
        + f"reason: {reason_line}\n"
    )


def read_marker_note(repo_root: str) -> Optional[str]:
    """Return the marker file's contents, or ``None`` when it is absent.

    Used by ``--status`` to echo the enable audit note back to the operator.
    A present-but-unreadable marker returns ``None`` rather than raising — the
    gate cares only about presence, and so does status reporting.
    """
    path = marker_path(repo_root)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def enable_local_only(
    repo_root: str,
    reason: Optional[str] = None,
    *,
    now: Optional[datetime] = None,
) -> Tuple[bool, str]:
    """Create the marker (with its audit note) if absent. Idempotent.

    Returns ``(changed, path)``. ``changed`` is ``True`` when the marker was
    newly written, ``False`` when it already existed (a no-op that preserves
    the original audit note — re-running enable never rewrites the recorded
    timestamp/reason). Creates the ``.dabbler/`` directory if needed so the
    marker can sit beside the extension's ``.dabbler/install-method``.
    """
    path = marker_path(repo_root)
    if os.path.isfile(path):
        return False, path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(_render_note(reason, now))
    return True, path


def disable_local_only(repo_root: str) -> Tuple[bool, str]:
    """Remove the marker if present. Idempotent.

    Returns ``(changed, path)``. ``changed`` is ``True`` when a marker was
    removed, ``False`` when none existed. The ``.dabbler/`` directory itself is
    left in place — it may hold the extension's ``install-method`` marker.
    """
    path = marker_path(repo_root)
    if not os.path.isfile(path):
        return False, path
    os.remove(path)
    return True, path


def _resolve_repo_root(explicit: Optional[str]) -> str:
    """Resolve the target tree: explicit path, else git toplevel of CWD, else CWD.

    The marker is a plain file, so a non-git directory is still a valid target
    (the gate simply will not fire there) — falling back to CWD keeps the CLI
    usable in that case rather than refusing.
    """
    if explicit:
        return os.path.abspath(explicit)
    cwd = os.getcwd()
    return _repo_root_for(cwd) or cwd


# --- CLI ---------------------------------------------------------------------


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ai_router.local_only",
        description=(
            "Enable, disable, or inspect the .dabbler/local-only marker that "
            "waives the close-out push gate for a deliberately remote-less "
            "repository (only while no git remote is configured)."
        ),
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument(
        "--enable",
        action="store_true",
        help="Create the marker (idempotent) and record an enable audit note.",
    )
    action.add_argument(
        "--disable",
        action="store_true",
        help="Remove the marker (idempotent).",
    )
    action.add_argument(
        "--status",
        action="store_true",
        help="Report whether the marker is present and whether it would fire.",
    )
    parser.add_argument(
        "--reason",
        default=None,
        help="Optional human note recorded in the marker on --enable.",
    )
    parser.add_argument(
        "--repo-root",
        default=None,
        help=(
            "Repository tree to target. Default: the git toplevel of the "
            "current directory, else the current directory."
        ),
    )
    ns = parser.parse_args(argv)

    repo_root = _resolve_repo_root(ns.repo_root)

    safe_root = _ascii_safe(repo_root)

    if ns.enable:
        changed, path = enable_local_only(repo_root, ns.reason)
        safe_path = _ascii_safe(path)
        if changed:
            print(f"[x] local-only enabled: {safe_path}")
        else:
            print(f"[x] local-only already enabled (unchanged): {safe_path}")
        if _has_remote(repo_root):
            print(
                "    note: a git remote is configured, so the push gate is "
                "NOT waived -- the marker only fires on a remote-less repo."
            )
        return 0

    if ns.disable:
        changed, path = disable_local_only(repo_root)
        safe_path = _ascii_safe(path)
        if changed:
            print(f"[ ] local-only disabled: {safe_path}")
        else:
            print(f"[ ] local-only already disabled (no marker): {safe_path}")
        return 0

    # --status
    present = is_local_only(repo_root)
    has_remote = _has_remote(repo_root)
    box = "[x]" if present else "[ ]"
    print(f"{box} local-only marker: {'present' if present else 'absent'}")
    print(f"    repo root: {safe_root}")
    print(f"    git remote configured: {'yes' if has_remote else 'no'}")
    if present and has_remote:
        print(
            "    -> push gate is NOT waived: a remote exists, so the marker "
            "is ignored (it can never mask a real forgot-to-push)."
        )
    elif present:
        print("    -> push gate is waived (marker present, no remote).")
    note = read_marker_note(repo_root)
    if note:
        print("    marker contents:")
        for line in note.rstrip("\n").splitlines():
            print(f"      {_ascii_safe(line)}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())


__all__ = [
    "marker_path",
    "read_marker_note",
    "enable_local_only",
    "disable_local_only",
    "is_local_only",
    "main",
]
