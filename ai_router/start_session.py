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
        [--effort medium] [--provider anthropic] \\
        [--chat-session-id <uuid>] [--total-sessions N] [--force]

Behavior:

- ``--session-number`` is optional. When absent, the CLI infers the
  next session via ``compute_effective_completed_sessions(dir)``:
  ``max(closed) + 1``, or ``1`` for a not-started set.
- **``--total-sessions`` is optional (Set 046 Session 2).** When
  absent, the writer resolves the session plan size from the
  existing ``session-state.json``'s ``totalSessions`` field (if any),
  falling back to the spec.md Session Set Configuration block's
  ``totalSessions`` field, and finally to ``null``. A ``null``
  result writes a **plan-less in-progress** snapshot — no
  ``sessions[]`` ledger, ``totalSessions: null``,
  ``currentSession`` set, ``completedSessions: []`` — so the
  Session Set Explorer renders ``0/?`` per Set 046's deliverable
  (a). Pre-Set-046 writers fell back to
  ``max(spec_headings, completedSessions, session_number)``; that
  derivation has been removed because just-having-``### Session N``-
  headings is not a strong-enough signal of operator intent to
  lock a total. Pass ``--total-sessions N`` to lock the count
  explicitly, or declare ``totalSessions: N`` in spec.md's
  configuration block.
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
- **Hard coordination (Set 033, H3 + H4; Set 036 Q5 + Q1 refinement).**
  When the existing ``orchestrator`` block names a different
  ``engine + provider + chatSessionId`` composite than the caller,
  the CLI REFUSES with a clear error naming the current holder
  (including the existing ``chatSessionId`` when present) + both
  release paths (``--force`` and the "Release Check-Out" Command
  Palette action), unless ``--force`` is set. Force-override appends
  a single line to ``~/.dabbler/orchestrator-writer.log`` and
  proceeds with the write; the writer logic in
  ``register_session_start`` rewrites ``checkedOutAt`` and
  ``lastActivityAt`` for the new holder.

  *Tolerant-on-read.* A prior block missing ``chatSessionId``
  entirely (pre-Set-036 writer) or with the field present and
  ``null`` (Set 036 writer that had no ID at the time of write) is
  treated as a match against any caller-supplied chatSessionId for
  engine + provider equality. The first new write populates the
  field strictly.

- **Per-set lifecycle lock (Set 036 Q5).** Both ``start_session`` and
  ``close_session`` acquire the same ``<set-dir>/.lifecycle.lock``
  for the duration of their read/check/write window so a hybrid
  migration (one orchestrator opening a new session while another
  is in mid-close-out) never interleaves writes. ``start_session``
  polls for up to 30s before giving up; close_session fails
  immediately on contention (its existing contract).

Exit codes:

- ``0`` — success (or idempotent no-op).
- ``2`` — usage error (bad args, missing session set directory).
- ``3`` — boundary violation (request to advance while a session is
  still open, re-open of a closed session, or skip-ahead).
- ``4`` — check-out conflict (Set 033 H3, Set 036 chatSessionId
  refinement): a different ``engine + provider + chatSessionId``
  composite holds the in-progress check-out and ``--force`` was not
  set.
- ``5`` — lock contention (Set 036 Q5): the per-set lifecycle lock
  is held by a live peer and could not be acquired within the
  configured timeout (default 30s).
- ``6`` — read-only chosen (Set 036 Q3 CLI side): operator answered
  "r" at the interactive TTY takeover prompt; no state was written.
  Caller (the agent) is expected to observe the exit code and treat
  the session set as read-only for the remainder of the chat.

The CLI never makes routed LLM calls — it only writes state and emits
events. Safe to invoke under any budget / cost regime.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
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
    from close_lock import (  # type: ignore[import-not-found]
        DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
        LockContention,
        acquire_lock_with_timeout,
        release_lock,
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
    from .close_lock import (  # type: ignore[no-redef]
        DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
        LockContention,
        acquire_lock_with_timeout,
        release_lock,
    )


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_BOUNDARY = 3
EXIT_CHECKOUT_CONFLICT = 4
EXIT_LOCK_CONTENTION = 5
EXIT_READ_ONLY = 6  # Set 036 Session 4: operator chose Read-Only at TTY prompt

# Set 036 Session 1: env var that provides the chatSessionId when the
# ``--chat-session-id`` argument is omitted. Wrapper scripts (the
# Claude Code hook invoker in Set 036 Session 2) populate this from
# their native per-chat metadata surface; manual workflows set it via
# ``python -m ai_router.new_chat_id --export | source`` (also Set 036
# Session 2).
CHAT_SESSION_ID_ENV_VAR = "CHAT_SESSION_ID"

# Set 046 mid-Session-2 hotfix: hard-coordination enforcement (Set 033
# H3 + Set 036 H4) is opt-in. The mechanics — orchestrator block,
# checkedOutAt, lastActivityAt, chatSessionId composite identity — are
# still tracked on every write; only the REFUSAL (and the
# chatSessionId-mismatch interactive prompt that lives behind it) is
# gated.
#
# Why off by default: in real multi-orchestrator workflows (the
# operator running claude on one machine and codex on another, both
# pointed at the same workspace), the H3 refusal surfaced a
# poll/force-override/dismiss toast that blocked the second
# orchestrator's session-start hook. The friction outweighed the
# state-corruption protection the refusal was designed to provide.
# The audit trail in ``session-state.json``'s ``orchestrator`` block
# history remains the operator's diagnostic surface.
#
# Why an env var rather than a permanent rip-out: the Set 033 / Set
# 036 test suites continue to exercise the refusal logic when this
# env var is set, so a future audit-then-spec rollback of the
# coordination layer (or a future re-enable) doesn't have to
# resurrect deleted code.
ENFORCE_COORDINATION_ENV_VAR = "DABBLER_ENFORCE_CHECKOUT_COORDINATION"


def _coordination_enforced() -> bool:
    """True iff the operator opted in to H3 + chatSessionId refusal.

    The check is "env var is a truthy string". ``1``, ``true``,
    ``yes``, ``on`` (case-insensitive) all turn enforcement back on;
    unset, empty, ``0``, ``false`` are the (default) off state.
    """
    raw = os.environ.get(ENFORCE_COORDINATION_ENV_VAR, "")
    if not isinstance(raw, str):
        return False
    return raw.strip().lower() in ("1", "true", "yes", "on")

# Set 033 Session 1 (H3): the force-override audit trail. Append-only,
# best-effort — a log-write failure does not block the override (the
# state file is the source of truth; the log is observability).
ORCHESTRATOR_WRITER_LOG = os.path.expanduser(
    "~/.dabbler/orchestrator-writer.log"
)


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
    p.add_argument(
        "--chat-session-id",
        default=None,
        help=(
            "Per-chat session identifier (Set 036 Q1). Refines the "
            "H4 holder-identity predicate to "
            "``engine + provider + chatSessionId``. Defaults to the "
            "$CHAT_SESSION_ID env var when set, otherwise None. "
            "Claude Code's hook invoker populates this from the "
            "SessionStart payload's ``session_id`` field; other "
            "orchestrators source it via ``python -m "
            "ai_router.new_chat_id`` (Set 036 Session 2)."
        ),
    )
    p.add_argument(
        "--total-sessions",
        type=int,
        default=None,
        help=(
            "Total number of sessions in this set (Set 046 Session "
            "2). When omitted, the writer resolves the total from "
            "the existing state file, then spec.md's configuration "
            "block, and writes a plan-less in-progress snapshot "
            "(``totalSessions: null``, no ``sessions[]`` ledger) if "
            "neither yields a value. Plan-less snapshots render as "
            "``0/?`` in the Session Set Explorer per Set 046 "
            "deliverable (a). Pass this flag to lock the count "
            "explicitly without editing spec.md."
        ),
    )
    p.add_argument(
        "--force",
        action="store_true",
        help=(
            "Override an existing check-out held by a different "
            "engine + provider + chatSessionId composite (Set 033 H3 "
            "+ Set 036 Q5 refinement). Appends a force-override "
            "entry to ~/.dabbler/orchestrator-writer.log and "
            "proceeds. Does not override other boundary checks "
            "(in-flight session, closed-session re-open, skip-ahead)."
        ),
    )
    return p


def _identity_label(
    engine: Optional[str],
    provider: Optional[str],
    chat_session_id: Optional[str] = None,
    *,
    chat_session_id_present: bool = True,
) -> str:
    """Render the H4 holder identity composite for refusal + audit trail.

    Pre-Set-036 composite: ``engine + provider``. Set 036 refinement
    extends to ``engine + provider + chatSessionId``. The chatSessionId
    segment is appended unless ``chat_session_id_present`` is False
    (legacy state file with no chatSessionId field), in which case
    the segment is rendered as ``chatSessionId=<none recorded>`` so
    the operator-facing error message is unambiguous about the
    legacy state.

    ``provider`` is optional on the CLI side, so a None provider
    displays as ``<unspecified>`` rather than producing
    ``claude+None`` in the error text.
    """
    engine_label = engine or "<unknown>"
    provider_label = provider or "<unspecified>"
    if not chat_session_id_present:
        chat_label = "<no chat session ID recorded>"
    elif chat_session_id is None:
        chat_label = "<null>"
    else:
        chat_label = chat_session_id
    return (
        f"{engine_label} + {provider_label} + chatSessionId={chat_label}"
    )


def _log_force_override(
    session_set_dir: str,
    session_number: int,
    prior_engine: Optional[str],
    prior_provider: Optional[str],
    prior_chat_session_id: Optional[str],
    prior_chat_session_id_present: bool,
    new_engine: str,
    new_provider: Optional[str],
    new_chat_session_id: Optional[str],
) -> None:
    """Append a force-override entry to ``~/.dabbler/orchestrator-writer.log``.

    Best-effort: directory creation and write are wrapped in a
    broad except so a permissions or disk-full failure does not
    block the override itself. The state file remains the source of
    truth; the writer log is an observability surface.

    Format: one timestamped line per entry, parseable by
    ``awk`` / ``rg`` without further structure. Format is documented
    in ``ai_router/docs/close-out.md`` (Set 033 S6); Set 036 extends
    the prior= and new= labels with the ``chatSessionId`` segment.
    """
    try:
        os.makedirs(os.path.dirname(ORCHESTRATOR_WRITER_LOG), exist_ok=True)
        ts = datetime.now().astimezone().isoformat()
        set_name = os.path.basename(session_set_dir.rstrip("/\\"))
        prior_label = _identity_label(
            prior_engine,
            prior_provider,
            prior_chat_session_id,
            chat_session_id_present=prior_chat_session_id_present,
        )
        new_label = _identity_label(
            new_engine,
            new_provider,
            new_chat_session_id,
        )
        line = (
            f"{ts} force-override "
            f"session-set={set_name} "
            f"session={session_number} "
            f"prior={prior_label} "
            f"new={new_label}\n"
        )
        with open(ORCHESTRATOR_WRITER_LOG, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        # Observability surface only; never block the override.
        pass


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


# Set 036 Session 4 (Q3 CLI side): when the H3 + chatSessionId refusal
# fires under an interactive TTY, prompt the operator for one of the
# three audit-locked actions. Non-interactive invocations (no TTY)
# still receive the EXIT_CHECKOUT_CONFLICT exit code with no prompt,
# matching the proposal-addendum's directive to "refuse with
# EXIT_CHECKOUT_CONFLICT and direct the operator to re-run with
# --force if takeover is intended."
#
# Choice mapping:
#   t / T   → "take-over" — caller proceeds via the existing
#             force-override branch (logs to the writer log + writes).
#   r / R   → "read-only" — exits EXIT_READ_ONLY with a stderr note;
#             no state mutation. The agent observes the exit code and
#             can self-impose read-only behavior.
#   c / C   → "cancel" — exits EXIT_CHECKOUT_CONFLICT (the original
#             refusal exit code), same as non-interactive.
#
# Empty line / Ctrl-D / any other char defaults to cancel — explicit
# operator confirmation is required to take over.
def _is_interactive_tty() -> bool:
    """Return True only when stdin AND stderr are both TTYs.

    Stdin alone is insufficient — a script that captures stderr but
    leaves stdin open would otherwise see the prompt swallowed and
    the operator would never see the question.
    """
    try:
        return bool(sys.stdin.isatty() and sys.stderr.isatty())
    except (AttributeError, ValueError):
        return False


def _prompt_takeover_choice(
    prior_label: str,
    new_label: str,
) -> str:
    """Read a single-char choice from stdin. Returns one of
    'take-over' / 'read-only' / 'cancel'.

    Writes the prompt to stderr (not stdout) so any caller that
    captures stdout still sees the question on the terminal.
    """
    sys.stderr.write(
        f"\nstart_session: chatSessionId mismatch on the check-out.\n"
        f"  held by:    {prior_label}\n"
        f"  this chat:  {new_label}\n\n"
        f"  [t] Take Over (force-override; audit-logged)\n"
        f"  [r] Open in Read-Only Mode (no claim; exit "
        f"{EXIT_READ_ONLY})\n"
        f"  [c] Cancel (default; exit {EXIT_CHECKOUT_CONFLICT})\n"
        f"choice [t/r/c]: "
    )
    sys.stderr.flush()
    try:
        line = sys.stdin.readline()
    except (EOFError, KeyboardInterrupt):
        return "cancel"
    if not line:
        return "cancel"
    ch = line.strip()[:1].lower()
    if ch == "t":
        return "take-over"
    if ch == "r":
        return "read-only"
    return "cancel"


def _resolve_chat_session_id(args: argparse.Namespace) -> Optional[str]:
    """Return the effective chatSessionId for this invocation.

    Precedence:

    1. ``--chat-session-id`` explicitly supplied (any string value,
       including the empty string) — the CLI is authoritative; an
       empty string is interpreted as "deliberately clear", not
       "fall through to env". This lets a caller in a shell with an
       inherited ``$CHAT_SESSION_ID`` opt out of the env value for
       a single invocation (verifier Round A finding).
    2. ``$CHAT_SESSION_ID`` env var when set to a non-empty string.
    3. ``None``.

    An empty string at either level collapses to ``None`` in the
    returned value so the state file never carries an empty-string
    identity (downstream consumers compare against ``None`` for the
    "no ID recorded" case, not ``""``).
    """
    explicit = getattr(args, "chat_session_id", None)
    if explicit is not None:
        # Explicit CLI override — empty string clears, non-empty wins.
        return explicit if isinstance(explicit, str) and explicit else None
    env_value = os.environ.get(CHAT_SESSION_ID_ENV_VAR)
    if isinstance(env_value, str) and env_value:
        return env_value
    return None


def run(args: argparse.Namespace) -> int:
    """Execute the start_session boundary write. Returns exit code.

    Wraps :func:`session_state.register_session_start` with:

    1. Session-number inference (when ``--session-number`` is absent).
    2. Idempotency check (skip the write when the requested session is
       already the in-flight session).
    3. Boundary enforcement (refuse to advance past an open session).
    4. Set 036 Session 1: per-set lifecycle lock acquisition (Q5)
       around the read/check/write window.

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

    # Set 036 Session 1: acquire the per-set lifecycle lock around the
    # entire read/check/write window. The lock serializes against any
    # concurrent close_session on the same set (which now holds the
    # same lock) so a hybrid migration never interleaves writes. The
    # timeout-poll variant gives a small (default 30s) blocking window
    # so a brief race against an in-progress close-out resolves
    # cleanly without an operator-visible failure.
    try:
        lock_handle = acquire_lock_with_timeout(
            session_set_dir,
            timeout_seconds=DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
            worker_id=f"start_session/{os.getpid()}",
        )
    except LockContention as exc:
        print(
            f"start_session: refused -- lifecycle lock contention: "
            f"{exc}",
            file=sys.stderr,
        )
        return EXIT_LOCK_CONTENTION

    try:
        return _run_under_lock(args)
    finally:
        try:
            release_lock(lock_handle)
        except OSError:
            pass


def _run_under_lock(args: argparse.Namespace) -> int:
    """The original boundary + identity + write flow, executed with the
    per-set lifecycle lock already held by the caller.

    Split out so tests that want to assert the lock's external
    behavior can inspect :func:`run` while tests that pre-acquire the
    lock (e.g., to simulate close_session holding it) can drive the
    inner flow directly.
    """
    session_set_dir = args.session_set_dir
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

    # Set 033 Session 1 (H3 + H4) + Set 036 Session 1 (Q5): hard
    # coordination check. If the existing orchestrator block on disk
    # names a different ``engine + provider + chatSessionId``
    # composite than the caller, refuse the write unless ``--force``
    # is set.
    #
    # Set 046 mid-Session-2 hotfix: the refusal (and the
    # chatSessionId-mismatch interactive prompt) only fires when
    # ``DABBLER_ENFORCE_CHECKOUT_COORDINATION`` is set. The default-
    # off behavior treats every conflicting check-out as an authority
    # handoff: the new holder claims the slot, the writer log
    # captures the handoff (best-effort audit trail), and execution
    # falls through to ``register_session_start`` to rewrite the
    # orchestrator block.
    #
    # Tolerant-on-read for chatSessionId: a prior block missing the
    # ``chatSessionId`` field entirely (pre-Set-036 writer) or with
    # the field present and ``null`` (Set 036 writer that had no ID
    # to record) treats the caller's chatSessionId as a match for
    # engine + provider equality. The first new write populates the
    # field strictly via :func:`register_session_start`.
    new_chat_session_id = _resolve_chat_session_id(args)
    prior_orch = state.get("orchestrator") if isinstance(state, dict) else None
    # The H3 + H4 check only fires when there is a prior orchestrator
    # block (a check-out is in progress). On a fresh check-out
    # (prior_orch is None), there is no holder to coordinate against
    # and we fall through to the register_session_start call which
    # records the caller as the new holder.
    if isinstance(prior_orch, dict):
        prior_engine = prior_orch.get("engine")
        prior_provider = prior_orch.get("provider")
        prior_chat_session_id = prior_orch.get("chatSessionId")
        prior_chat_session_id_present = "chatSessionId" in prior_orch
        engine_provider_match = (
            prior_engine == args.engine
            and prior_provider == args.provider
        )
        chat_session_id_matches = (
            not prior_chat_session_id_present
            or prior_chat_session_id is None
            or prior_chat_session_id == new_chat_session_id
        )
        same_holder = engine_provider_match and chat_session_id_matches
        if not same_holder:
            forced = bool(getattr(args, "force", False))
            enforcement_on = _coordination_enforced()
            prior_label = _identity_label(
                prior_engine,
                prior_provider,
                prior_chat_session_id,
                chat_session_id_present=prior_chat_session_id_present,
            )
            new_label = _identity_label(
                args.engine,
                args.provider,
                new_chat_session_id,
            )
            # Set 046 mid-Session-2 hotfix: when enforcement is off
            # (the default), the chatSessionId-mismatch interactive
            # prompt is suppressed entirely. We still log the handoff
            # to the writer log so the orchestrator change is
            # observable in the audit trail, then fall through to
            # register_session_start.
            if enforcement_on:
                # Set 036 Session 4 (Q3 CLI side): only prompt when the
                # mismatch is specifically a chatSessionId one (same
                # engine+provider, different chat). The engine+provider
                # case stays on the non-interactive refusal path — the
                # operator routes that flow through the extension's
                # poll/force/dismiss prompt or invokes --force directly.
                chat_session_id_mismatch = (
                    engine_provider_match and not chat_session_id_matches
                )
                if not forced and chat_session_id_mismatch and _is_interactive_tty():
                    choice = _prompt_takeover_choice(prior_label, new_label)
                    if choice == "take-over":
                        forced = True
                    elif choice == "read-only":
                        sys.stderr.write(
                            f"start_session: read-only mode chosen; no "
                            f"claim written for {new_label} on this "
                            f"session set.\n"
                        )
                        return EXIT_READ_ONLY
                    # 'cancel' falls through to the standard refusal below.
                if not forced:
                    print(
                        f"start_session: refused -- session set is checked "
                        f"out by a different orchestrator "
                        f"({prior_label}); caller is {new_label}. Release "
                        f"the check-out before starting: re-run with "
                        f"--force to override, or invoke the "
                        f"\"Release Check-Out\" Command Palette action.",
                        file=sys.stderr,
                    )
                    return EXIT_CHECKOUT_CONFLICT
            # Handoff: log to the writer log (best-effort) then proceed.
            # When enforcement was on, this branch fires only after
            # ``--force`` (or the interactive take-over choice). When
            # enforcement is off (the default), every handoff lands here
            # so the orchestrator-writer.log captures the holder change
            # as the canonical audit signal.
            _log_force_override(
                session_set_dir=session_set_dir,
                session_number=requested,
                prior_engine=prior_engine,
                prior_provider=prior_provider,
                prior_chat_session_id=prior_chat_session_id,
                prior_chat_session_id_present=prior_chat_session_id_present,
                new_engine=args.engine,
                new_provider=args.provider,
                new_chat_session_id=new_chat_session_id,
            )

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
    #
    # Set 046 Session 2: ``--total-sessions`` on the CLI is the
    # caller-supplied value when present. The v3-view fallback
    # protects the common "re-start an in-flight session" case
    # (totalSessions already populated from a prior write) and is
    # the path that lets the writer's existing-state fallback do
    # the right thing without changing register_session_start's
    # resolution chain.
    cli_total = getattr(args, "total_sessions", None)
    if isinstance(cli_total, int) and cli_total > 0:
        total_sessions = cli_total
    else:
        total_sessions = (
            view.total_sessions if view is not None and view.total_sessions > 0 else None
        )

    register_session_start(
        session_set=session_set_dir,
        session_number=requested,
        total_sessions=total_sessions,
        orchestrator_engine=args.engine,
        orchestrator_model=args.model,
        orchestrator_effort=args.effort,
        orchestrator_provider=args.provider,
        orchestrator_chat_session_id=new_chat_session_id,
    )
    return EXIT_OK


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
