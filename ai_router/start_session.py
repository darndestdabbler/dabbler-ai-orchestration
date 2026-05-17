"""Session-start CLI — the "state first, work second" boundary writer.

Set 022 made session-set lifecycle transitions visible and clean. The
orchestrator runs this CLI **before any other work in a session** so
``session-state.json`` and ``session-events.jsonl`` declare "session N
is in flight" on disk the moment work begins. The Session Set
Explorer tree view bucket-flips the set from Not Started (or "between
sessions") to In Progress within the watcher's debounce.

Companion writer to :mod:`ai_router.close_session`. Both share
:func:`session_state.compute_effective_completed_sessions` as the
single source of truth for "how many sessions are closed."

CLI shape::

    python -m ai_router.start_session --session-set-dir <path> \\
        --engine claude --model claude-opus-4-7 [--session-number N] \\
        [--effort medium] [--provider anthropic]

Behavior:

- ``--session-number`` is optional. When absent, the CLI infers the
  next session via ``compute_effective_completed_sessions(dir)``:
  ``max(closed) + 1``, or ``1`` for a not-started set.
- **Idempotent.** Re-running for the same session N when N is already
  the in-flight session (``currentSession == N`` and N not in
  ``completedSessions[]``) is a no-op. The underlying
  :func:`session_state.register_session_start` dedupes the
  ``work_started`` event in the ledger as well, so re-running across
  a re-entered orchestrator (e.g., after a context reset) is safe.
- **Refuses to skip.** Asking for session N+1 while session N is still
  open (``currentSession == N`` and N not in ``completedSessions[]``,
  with N != N+1) exits non-zero. The operator must close N first.
  This is the boundary the v0.13.11 defensive guards are *recovering
  from*; making the writer refuse the bad input is the prevention
  layer.

Exit codes:

- ``0`` — success (or idempotent no-op).
- ``2`` — usage error (bad args, missing session set directory).
- ``3`` — boundary violation (request to advance while a session is
  still open).

The CLI never makes routed LLM calls — it only writes state and emits
events. Safe to invoke under any budget / cost regime.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

try:
    from progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from session_state import (  # type: ignore[import-not-found]
        compute_effective_completed_sessions,
        read_session_state,
        register_session_start,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from .session_state import (  # type: ignore[no-redef]
        compute_effective_completed_sessions,
        read_session_state,
        register_session_start,
    )


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BOUNDARY = 3


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="start_session",
        description=(
            "Boundary write that marks session N of a session set as "
            "in flight. Run before any other work in the session. "
            "Companion to close_session: every session's first call "
            "is start_session; every session's last call is "
            "close_session."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help=(
            "Path to the session-set directory "
            "(e.g. docs/session-sets/022-active-lifecycle-management)."
        ),
    )
    p.add_argument(
        "--session-number",
        type=int,
        default=None,
        help=(
            "Session number to mark in flight. Inferred from "
            "completedSessions[] when omitted: max(closed)+1, or 1 "
            "for a not-started set."
        ),
    )
    p.add_argument(
        "--engine",
        required=True,
        help=(
            "Orchestrator engine name (e.g. claude, gpt-5-4, "
            "gemini-pro)."
        ),
    )
    p.add_argument(
        "--model",
        required=True,
        help="Orchestrator model id (e.g. claude-opus-4-7).",
    )
    p.add_argument(
        "--effort",
        default="unknown",
        help=(
            "Orchestrator effort level: low, medium, high, fast, "
            "normal, or unknown (default: unknown)."
        ),
    )
    p.add_argument(
        "--provider",
        default=None,
        help=(
            "Orchestrator provider name (e.g. anthropic, openai, "
            "google). Optional."
        ),
    )
    return p


def _infer_next_session(session_set_dir: str) -> int:
    """Return the next session number to start.

    ``max(closed) + 1`` when the set has any closed sessions;
    ``1`` for a not-started set. Reads via
    :func:`compute_effective_completed_sessions` so legacy sets
    without ``completedSessions[]`` are handled correctly (the helper
    falls back to the events ledger).
    """
    closed = compute_effective_completed_sessions(session_set_dir)
    if closed:
        return max(closed) + 1
    return 1


def run(args: argparse.Namespace) -> int:
    """Execute the start_session boundary write. Returns exit code.

    Wraps :func:`session_state.register_session_start` with:

    1. Session-number inference (when ``--session-number`` is absent).
    2. Idempotency check (skip the write when the requested session is
       already the in-flight session).
    3. Boundary enforcement (refuse to advance past an open session).

    Separated from :func:`main` so tests can call ``run`` with a
    namespace built from :func:`_build_arg_parser` without needing
    to capture stdout/stderr from argparse error exits.
    """
    session_set_dir = args.session_set_dir
    if not os.path.isdir(session_set_dir):
        print(
            f"start_session: session-set directory not found: "
            f"{session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_USAGE

    state = read_session_state(session_set_dir) or {}
    closed = compute_effective_completed_sessions(session_set_dir)
    closed_set = set(closed)

    # Set 030 Session 3: route progress reads through the v3 helper.
    # ``read_progress`` branches v2/v3 internally; on a brand-new set
    # (empty state) or a v2 file whose synthesizer trips an invariant,
    # we fall through with view=None and skip the in-flight check.
    # ``compute_effective_completed_sessions`` remains the source of
    # truth for the closed set (v2-compat carve-out per D13) so this
    # migration does not touch the boundary-enforcement math.
    spec_md_path = os.path.join(session_set_dir, "spec.md")
    try:
        view = read_progress(state, spec_md_path) if state else None
    except (SessionStateInvariantError, TypeError, ValueError):
        view = None
    current = view.current_session if view is not None else None
    current_in_flight = current is not None

    requested = args.session_number
    if requested is None:
        if current_in_flight:
            # The previous session never closed — resuming, not
            # starting fresh. Idempotently re-emit the work_started
            # event (register_session_start dedupes) and refresh the
            # snapshot's startedAt window for the still-in-flight
            # session.
            requested = current
        else:
            requested = (max(closed) + 1) if closed else 1

    if not isinstance(requested, int) or requested < 1:
        print(
            f"start_session: --session-number must be a positive int "
            f"(got {requested!r})",
            file=sys.stderr,
        )
        return EXIT_USAGE

    # Boundary enforcement: if a session is in flight and the caller
    # asked for a different (later) session, refuse. The operator
    # needs to close the in-flight session first. The exception is
    # "ask for the same session that's already in flight" — that's
    # idempotent resume, handled by register_session_start's event-
    # ledger dedupe.
    if current_in_flight and requested != current:
        print(
            f"start_session: refused -- session {current} is still "
            f"in flight (currentSession={current}, "
            f"completedSessions={sorted(closed_set)}). Close "
            f"session {current} via close_session before starting "
            f"session {requested}.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    # Boundary enforcement: refuse to "re-open" a session that's
    # already in completedSessions[]. close_session is the writer
    # for the closed-set; re-opening a closed session via
    # start_session would be a snapshot regression the extension
    # would surface as drift.
    if requested in closed_set:
        print(
            f"start_session: refused -- session {requested} is already "
            f"closed (in completedSessions{sorted(closed_set)}). "
            f"start_session does not re-open closed sessions.",
            file=sys.stderr,
        )
        return EXIT_BOUNDARY

    # Boundary enforcement: refuse to skip ahead. When no session is
    # in flight, the only legitimate next session is
    # max(closed_set, default=0) + 1. Asking for, say, session 5 on
    # a fresh set creates a gap that the protocol does not model —
    # the extension's "in flight" predicate and the
    # compute_effective_completed_sessions fallback both assume
    # contiguous closure. The exception is the in-flight idempotent
    # path above (already handled): a re-entry asking for the
    # current in-flight session is fine.
    if not current_in_flight:
        expected_next = (max(closed_set) + 1) if closed_set else 1
        if requested != expected_next:
            print(
                f"start_session: refused -- requested session "
                f"{requested} is not the next sequential session "
                f"(expected {expected_next}; "
                f"completedSessions={sorted(closed_set)}). "
                f"start_session does not skip ahead; close the "
                f"intervening sessions first.",
                file=sys.stderr,
            )
            return EXIT_BOUNDARY

    # Idempotent path: caller asked for the in-flight session
    # exactly. Re-emitting work_started is a no-op (ledger dedupes),
    # but we still let register_session_start refresh the snapshot's
    # startedAt so the tree view's "session 1 in flight" annotation
    # reflects the most recent resume. This matches the existing
    # behavior register_session_start has had since Set 1.
    #
    # Set 030 Session 3: derive total via the v3 view when available;
    # ``register_session_start`` tolerates None and falls back to its
    # own resolution chain (caller-supplied -> existing state -> spec).
    total_sessions = view.total_sessions if view is not None and view.total_sessions > 0 else None

    register_session_start(
        session_set=session_set_dir,
        session_number=requested,
        total_sessions=total_sessions,
        orchestrator_engine=args.engine,
        orchestrator_model=args.model,
        orchestrator_effort=args.effort,
        orchestrator_provider=args.provider,
    )
    return EXIT_OK


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
