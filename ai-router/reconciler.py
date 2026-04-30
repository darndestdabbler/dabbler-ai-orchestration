"""Reconciler — sweep stranded sessions and re-attempt close-out.

The close-out gate (``close_session.py``) is the sole synchronization
barrier between session work and session-state ``closed``. When the
gate trips on a transient signal — a verifier still in flight at the
``--timeout`` boundary, an `outsource-last` queue that has not yet
drained, a lock contention from a peer process — the session lands in
``closeout_pending`` or ``closeout_blocked`` rather than ``closed``.
Without an external nudge those sessions stay there indefinitely,
because no part of the orchestrator's normal flow re-invokes
``close_session`` after Step 8 is over.

This module is that external nudge. It walks the session-set tree,
identifies sessions stuck in ``closeout_pending`` /
``closeout_blocked`` for longer than a quiet-window threshold, and
re-runs the gate. Per-session-set failures are logged but do not abort
the sweep — a hung lock on one set should not blind the reconciler to
the other 50.

How callers invoke it
---------------------
* CLI: ``python -m ai_router.reconciler`` for a manual sweep
  (operators during the bootstrapping window).
* Programmatic: :func:`reconcile_sessions` from another Python module
  (Set 6's orchestrator-startup hook will call this).
* Hook registration: :func:`register_sweeper_hook` is the integration
  point Set 6 wires up. In Set 3 we ship the registration function so
  consumers can already import it; the actual invocation cadence is
  Set 6's call.

What this module is NOT
-----------------------
The reconciler is **best-effort**. It does not retry forever, does not
guarantee progress on every sweep, and does not invent new state — it
only re-invokes the gate. If the gate fails for the same reason on
every sweep, the underlying problem (a verifier outage, a stale lock
that pre-dates lock TTL, a mis-scoped allowlist) is what the operator
needs to fix; the reconciler will not paper over it.

The reconciler also does NOT touch ``mark_session_complete`` directly.
That wiring lands in Set 4 along with the ``--force`` deprecation
transition. Until then, the reconciler's "successful re-run" outcome
is a ``closeout_succeeded`` event in the ledger; the orchestrator's
own Step 8 path is what flips ``session-state.json`` to ``complete``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, List, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    # See close_session.py for the rationale on this dual-import shape.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from session_events import (  # type: ignore[import-not-found]
        SessionLifecycleState,
        current_lifecycle_state,
        read_events,
    )
    import close_session  # type: ignore[import-not-found]
except ImportError:
    from .session_events import (  # type: ignore[no-redef]
        SessionLifecycleState,
        current_lifecycle_state,
        read_events,
    )
    from . import close_session  # type: ignore[no-redef]


DEFAULT_BASE_DIR = "docs/session-sets"

# Quiet-window threshold (minutes) — a session must have been in its
# stranded lifecycle state for at least this long before the
# reconciler will re-attempt close-out. Smaller would race the
# orchestrator's normal Step 8 path; larger would leave operators
# waiting unnecessarily on the bootstrapping-window happy case.
DEFAULT_QUIET_WINDOW_MINUTES = 5

# The set of lifecycle states the reconciler considers "stranded" and
# eligible for a re-run. ``CLOSEOUT_PENDING`` is the normal stranded
# case (close_session was started but did not reach closeout_succeeded
# / closeout_failed). ``CLOSEOUT_BLOCKED`` is the structured-failure
# case (close_session emitted closeout_failed and surfaced a reason);
# we re-run because the reason may have been transient (verifier
# outage, lock contention, queue still draining).
STRANDED_STATES = frozenset({
    SessionLifecycleState.CLOSEOUT_PENDING,
    SessionLifecycleState.CLOSEOUT_BLOCKED,
})


_logger = logging.getLogger("ai_router.reconciler")
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(_handler)
_logger.setLevel(logging.INFO)
_logger.propagate = False


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class ReconcileEntry:
    """One session set's outcome from a single sweep.

    ``action`` records what the reconciler did:

    - ``"skipped_not_stranded"`` — the latest session is not in a
      stranded lifecycle state.
    - ``"skipped_too_recent"`` — stranded, but the most recent
      lifecycle event is younger than the quiet-window threshold; we
      defer to the orchestrator's normal flow.
    - ``"skipped_no_events"`` — the session set has no events ledger
      yet (newly initialized; nothing to reconcile).
    - ``"rerun_succeeded"`` — close_session ran and returned a
      ``succeeded`` / ``noop_already_closed`` result.
    - ``"rerun_gate_failed"`` — close_session ran and returned a
      ``gate_failed`` result. The session stays in
      ``closeout_blocked``; the next sweep will retry.
    - ``"rerun_verification_timeout"`` — close_session ran and timed
      out waiting on queued verifications. The session stays
      ``closeout_blocked``; next sweep retries.
    - ``"rerun_lock_contention"`` — close_session lost the lock to a
      peer (probably an in-flight orchestrator Step 8). Next sweep
      retries.
    - ``"rerun_other"`` — close_session returned some other result
      string; recorded verbatim.
    - ``"error"`` — close_session raised. The exception text is in
      ``messages``.

    The ``close_session_result`` mirrors :attr:`CloseoutOutcome.result`
    when a re-run was attempted, otherwise ``None``.
    """

    session_set_dir: str
    action: str
    lifecycle_state: Optional[str] = None
    last_event_age_minutes: Optional[float] = None
    close_session_result: Optional[str] = None
    messages: List[str] = field(default_factory=list)


@dataclass
class ReconcileSummary:
    """Aggregate result of one sweep across many session sets."""

    base_dir: str
    entries: List[ReconcileEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "base_dir": self.base_dir,
            "entries": [
                {
                    "session_set_dir": e.session_set_dir,
                    "action": e.action,
                    "lifecycle_state": e.lifecycle_state,
                    "last_event_age_minutes": e.last_event_age_minutes,
                    "close_session_result": e.close_session_result,
                    "messages": list(e.messages),
                }
                for e in self.entries
            ],
        }


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_event_timestamp(ts: str) -> Optional[datetime]:
    """Parse the ``Z``-suffixed ISO 8601 strings the events ledger writes.

    Returns ``None`` for anything we can't parse — defensive in case a
    hand-edit corrupted a record. The reconciler treats unparsable
    timestamps as "infinitely old" so a stuck set with bad timestamps
    is still eligible for retry rather than wedged forever.
    """
    if not ts:
        return None
    # The on-disk format is ``%Y-%m-%dT%H:%M:%S.%fZ``; strip the Z and
    # attach UTC explicitly. ``datetime.fromisoformat`` learned to
    # accept the Z suffix only in 3.11; strip it for 3.10 compatibility.
    cleaned = ts.rstrip("Z")
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Per-session-set evaluation
# ---------------------------------------------------------------------------

def _is_session_set_dir(path: str) -> bool:
    """A session-set directory contains a ``spec.md``.

    Filtering on spec.md avoids picking up template/scratch
    directories under ``docs/session-sets/`` that aren't real sets.
    """
    return os.path.isfile(os.path.join(path, "spec.md"))


def _evaluate_one(
    session_set_dir: str,
    *,
    quiet_window_minutes: int,
    now: datetime,
    runner: Callable[[str], Any],
) -> ReconcileEntry:
    """Decide what to do for one session set, and (if appropriate) do it.

    The runner injection point is what the integration tests use to
    avoid spinning up real subprocesses; production callers leave it
    at the default which invokes :func:`close_session.run` in-process.
    """
    entry = ReconcileEntry(session_set_dir=session_set_dir, action="")
    events = read_events(session_set_dir)
    if not events:
        entry.action = "skipped_no_events"
        return entry

    state = current_lifecycle_state(events)
    entry.lifecycle_state = state.value if state is not None else None

    if state not in STRANDED_STATES:
        entry.action = "skipped_not_stranded"
        return entry

    last_ts = _parse_event_timestamp(events[-1].timestamp)
    if last_ts is None:
        # Treat unparsable as old enough to retry. Better to nudge a
        # set with broken timestamps than to silently wedge it.
        age_minutes = float("inf")
    else:
        age_minutes = max(0.0, (now - last_ts).total_seconds() / 60.0)
    entry.last_event_age_minutes = (
        None if age_minutes == float("inf") else age_minutes
    )

    if age_minutes < quiet_window_minutes:
        entry.action = "skipped_too_recent"
        return entry

    # Re-run close_session on this set. Catch every exception — one
    # corrupt set should not abort the sweep for the other sets.
    try:
        result = runner(session_set_dir)
    except Exception as exc:  # pragma: no cover — defensive
        entry.action = "error"
        entry.messages.append(f"{type(exc).__name__}: {exc}")
        return entry

    # Map the close_session result string to an action verb.
    result_str = getattr(result, "result", None)
    entry.close_session_result = result_str
    if result_str in ("succeeded", "noop_already_closed"):
        entry.action = "rerun_succeeded"
    elif result_str == "gate_failed":
        entry.action = "rerun_gate_failed"
    elif result_str == "verification_timeout":
        entry.action = "rerun_verification_timeout"
    elif result_str == "lock_contention":
        entry.action = "rerun_lock_contention"
    elif result_str is None:
        entry.action = "error"
        entry.messages.append("runner returned no result")
    else:
        entry.action = "rerun_other"

    # Surface any reconciler-relevant messages from the close_session
    # outcome so the operator can see them in the sweep summary.
    msgs = getattr(result, "messages", None) or []
    entry.messages.extend(msgs)

    return entry


def _default_runner(session_set_dir: str):
    """Invoke ``close_session.run`` with a minimal argparse Namespace.

    Production sweep path. Tests inject their own runner instead so
    they can pre-build the namespace with custom timeouts / sleep
    primitives, or assert against a fake.
    """
    args = argparse.Namespace(
        session_set_dir=session_set_dir,
        json=False,
        interactive=False,
        force=False,
        allow_empty_commit=False,
        reason_file=None,
        manual_verify=False,
        repair=False,
        apply=False,
        # The reconciler's job is to nudge — it should not block on a
        # long verification wait. Use a short timeout (1 minute) so
        # the sweep stays responsive; a real outage will surface as
        # ``rerun_verification_timeout`` and the next sweep retries.
        timeout=1,
    )
    return close_session.run(args)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def reconcile_sessions(
    base_dir: str = DEFAULT_BASE_DIR,
    *,
    quiet_window_minutes: int = DEFAULT_QUIET_WINDOW_MINUTES,
    runner: Optional[Callable[[str], Any]] = None,
    now: Optional[datetime] = None,
) -> ReconcileSummary:
    """Walk *base_dir* and re-attempt close-out on stranded sessions.

    Returns a :class:`ReconcileSummary` describing what was found and
    what was done. Callers that want to print a human report use
    :func:`format_summary`; callers that want to feed structured data
    to a dashboard read ``summary.to_dict()`` instead.

    Per-set errors do not abort the sweep — they are recorded as
    ``ReconcileEntry`` rows with ``action="error"`` and the exception
    text in ``messages``. The contract is "best-effort, never make it
    worse".
    """
    summary = ReconcileSummary(base_dir=base_dir)
    if not os.path.isdir(base_dir):
        return summary

    runner = runner if runner is not None else _default_runner
    now = now if now is not None else _utc_now()

    try:
        entries = sorted(os.listdir(base_dir))
    except OSError as exc:
        _logger.warning(
            "reconciler: cannot list base_dir %r: %s", base_dir, exc,
        )
        return summary

    for name in entries:
        candidate = os.path.join(base_dir, name)
        if not os.path.isdir(candidate):
            continue
        if not _is_session_set_dir(candidate):
            continue
        try:
            entry = _evaluate_one(
                candidate,
                quiet_window_minutes=quiet_window_minutes,
                now=now,
                runner=runner,
            )
        except Exception as exc:  # pragma: no cover — defensive
            entry = ReconcileEntry(
                session_set_dir=candidate,
                action="error",
                messages=[f"{type(exc).__name__}: {exc}"],
            )
            _logger.warning(
                "reconciler: %s: %s: %s",
                candidate, type(exc).__name__, exc,
            )
        summary.entries.append(entry)

    return summary


def format_summary(summary: ReconcileSummary) -> str:
    """Render a :class:`ReconcileSummary` as a short human-readable report."""
    if not summary.entries:
        return f"reconciler: no session sets under {summary.base_dir}"
    lines = [f"reconciler: swept {summary.base_dir}"]
    for e in summary.entries:
        suffix = ""
        if e.lifecycle_state is not None:
            suffix += f" state={e.lifecycle_state}"
        if e.close_session_result is not None:
            suffix += f" result={e.close_session_result}"
        if e.last_event_age_minutes is not None:
            suffix += f" age={e.last_event_age_minutes:.1f}m"
        lines.append(f"  [{e.action}] {e.session_set_dir}{suffix}")
        for msg in e.messages:
            lines.append(f"    - {msg}")
    return "\n".join(lines)


def register_sweeper_hook(
    callback: Callable[[ReconcileSummary], None],
    *,
    base_dir: str = DEFAULT_BASE_DIR,
    quiet_window_minutes: int = DEFAULT_QUIET_WINDOW_MINUTES,
) -> Callable[[], ReconcileSummary]:
    """Build an orchestrator-startup hook that runs one sweep on call.

    Returns a zero-arg callable. Set 6 wires this up to the
    orchestrator startup path; until then, callers can register their
    own callbacks and invoke them by hand.

    The returned callable is the integration surface — it executes
    one sweep and passes the summary through ``callback`` (typically
    a logging or notification hook). The callback is invoked even
    when no sets were found / no work was done, so observers can
    distinguish "the sweep ran and found nothing" from "the sweep
    didn't run".
    """
    def _hook() -> ReconcileSummary:
        summary = reconcile_sessions(
            base_dir=base_dir,
            quiet_window_minutes=quiet_window_minutes,
        )
        try:
            callback(summary)
        except Exception as exc:  # pragma: no cover — defensive
            _logger.warning(
                "reconciler hook callback raised: %s: %s",
                type(exc).__name__, exc,
            )
        return summary

    return _hook


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m ai_router.reconciler",
        description=(
            "Sweep session sets and re-attempt close-out on stranded "
            "sessions. Best-effort: per-set failures are logged but "
            "do not abort the sweep."
        ),
    )
    p.add_argument(
        "--base-dir",
        default=DEFAULT_BASE_DIR,
        help=f"Session-sets root (default: {DEFAULT_BASE_DIR})",
    )
    p.add_argument(
        "--quiet-window-minutes",
        type=int,
        default=DEFAULT_QUIET_WINDOW_MINUTES,
        help=(
            "Skip sets whose most recent lifecycle event is younger "
            "than this many minutes (default: "
            f"{DEFAULT_QUIET_WINDOW_MINUTES})."
        ),
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit the sweep summary as JSON instead of human-readable text.",
    )
    return p


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    summary = reconcile_sessions(
        base_dir=args.base_dir,
        quiet_window_minutes=args.quiet_window_minutes,
    )
    if args.json:
        sys.stdout.write(json.dumps(summary.to_dict(), indent=2))
        sys.stdout.write("\n")
    else:
        print(format_summary(summary))
    # Exit code is intentionally 0 on a successful sweep regardless of
    # whether any individual re-run failed. The reconciler is a
    # background nudge; failure to make progress is normal and not an
    # error condition. Only an exception escaping the sweep itself
    # would be a non-zero exit, and we don't catch those at this layer.
    return 0


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    sys.exit(main())
