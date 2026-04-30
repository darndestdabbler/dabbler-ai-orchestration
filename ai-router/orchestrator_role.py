"""Orchestrator-role daemon: long-running CLI worker for outsource-last mode.

Counterpart to ``verifier_role.py``. Polls the orchestrator's own
per-provider queue (``provider-queues/<provider>/queue.db``), claims
messages addressed *to* this orchestrator from peer providers, and
processes them. The two daemons together close the asynchronous
verification loop:

::

    orchestrator               verifier
    -----------------          -----------------
    route(task=...) ----enqueue--->  verifier provider's queue
                                     verifier_role claims
                                     -> follow-up?     -> add_follow_up
                                     -> rejection?     -> fail
                                     -> verified?      -> complete
    orchestrator_role claims <----enqueue---  the verifier's
       (verification_followup     reply (to *this* orchestrator's
        or verification_rejected)  queue)
    handles -> add_follow_up    ---->  verifier re-claims and
       (reply) or starts revision      finishes the dialogue

Worker identity, heartbeat cadence, lease handling, graceful shutdown,
and restart safety are identical to ``verifier_role`` — that contract
is the queue's, not the daemon's. See ``verifier_role.py`` for the
narrative description; this module reuses the same shape so the two
daemons read the same in production.

What this daemon is NOT
-----------------------
This daemon does **not** generate session work autonomously. Session
work — the human-typed trigger phrase that starts a session — still
runs in the orchestrator's *primary* CLI session. This daemon handles
only the asynchronous follow-up / rejection traffic that arrives
between trigger phrases. The primary CLI session and this background
daemon coexist; both can be running at the same time without
contention because they operate on different surfaces (the primary
session edits files and runs builds; the daemon only manipulates the
queue).

Task types
----------
* ``verification_followup`` — the verifier asked a clarifying question.
  The handler reads the message + accumulated follow-ups, formulates a
  reply, and appends it via ``add_follow_up``. The message is left in
  the verifier's claimed state; the verifier's next heartbeat or
  reclaim cycle picks up the dialogue.
* ``verification_rejected`` — the verifier returned ``failed`` because
  the work needs revision. The handler transitions the message to
  ``completed`` with a structured result describing the planned
  revision (or to ``failed`` if revision is not feasible). Re-running
  the underlying work is the orchestrator-primary session's job; this
  daemon only acknowledges the rejection so the queue audit trail
  shows it was seen.

Unknown task types are treated as failures so they do not silently
loop forever. The default handler raises ``NotImplementedError`` —
Session 3 of this set wires the production handlers; tests inject
their own callables.
"""

from __future__ import annotations

import argparse
import os
import signal
import sys
import threading
from pathlib import Path
from typing import Callable, Optional

# Match the import discipline in verifier_role.py — see that module's
# header for the rationale (three import shapes, hyphenated package
# directory). Keeping them in lockstep means a future package-rename
# touches both files identically.
if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from queue_db import (  # type: ignore[import-not-found]
        DEFAULT_LEASE_SECONDS,
        DEFAULT_MAX_FOLLOWUP_ROUNDS,
        QueueDB,
        QueueMessage,
    )
    from verifier_role import (  # type: ignore[import-not-found]
        DEFAULT_POLL_INTERVAL_SECONDS,
        FollowUpRequested,
        HEARTBEAT_INTERVAL_SECONDS,
        make_worker_id,
        process_one_message,
    )
except ImportError:
    from .queue_db import (  # type: ignore[no-redef]
        DEFAULT_LEASE_SECONDS,
        DEFAULT_MAX_FOLLOWUP_ROUNDS,
        QueueDB,
        QueueMessage,
    )
    from .verifier_role import (  # type: ignore[no-redef]
        DEFAULT_POLL_INTERVAL_SECONDS,
        FollowUpRequested,
        HEARTBEAT_INTERVAL_SECONDS,
        make_worker_id,
        process_one_message,
    )


# --------------------------------------------------------------------------
# Task-type constants
# --------------------------------------------------------------------------

# Names match the spec verbatim. Other modules (Session 3's mode-aware
# route()/verify(), Session 4's failure-injection tests) import these
# symbols rather than the string literals so a future rename is a
# single-file change.
TASK_VERIFICATION_FOLLOWUP = "verification_followup"
TASK_VERIFICATION_REJECTED = "verification_rejected"

ORCHESTRATOR_TASK_TYPES = (
    TASK_VERIFICATION_FOLLOWUP,
    TASK_VERIFICATION_REJECTED,
)


class UnknownTaskTypeError(Exception):
    """The orchestrator daemon received a message with an unrecognized task_type.

    Handled inside the daemon as a regular failure so the queue's
    fail/retry/timeout machinery applies. Surfaced as its own type so
    tests and observers can distinguish "this orchestrator does not
    know how to handle this work" from "the handler ran and crashed".
    """

    def __init__(self, task_type: str, message_id: str):
        super().__init__(
            f"orchestrator_role does not handle task_type "
            f"{task_type!r} (message {message_id!r})"
        )
        self.task_type = task_type
        self.message_id = message_id


# --------------------------------------------------------------------------
# Default handlers
# --------------------------------------------------------------------------

def _default_followup_handler(msg: QueueMessage) -> dict:
    """Stub for ``verification_followup`` messages.

    Production implementation lands in Session 3 alongside the
    mode-aware ``route()``/``verify()`` paths. Real handler must:

    1. Read ``msg.payload`` and ``QueueDB.read_follow_ups(msg.id)`` for
       the dialogue history.
    2. Formulate a reply (route through the AI router for the actual
       reasoning; see Rule #5 — orchestrator never self-opines).
    3. Raise :class:`FollowUpRequested` with the reply content. The
       daemon's ``process_one_message`` will append it via
       ``add_follow_up`` and leave the message claimed for the
       verifier to re-claim.

    Returning a dict instead of raising would cause the message to be
    marked completed, ending the dialogue prematurely — that is why
    this stub raises ``NotImplementedError`` rather than returning an
    empty dict.
    """
    raise NotImplementedError(
        "orchestrator_role._default_followup_handler is a stub; "
        "the real implementation lands in Session 3 of session set 002 "
        "(mode-aware route()/verify())"
    )


def _default_rejection_handler(msg: QueueMessage) -> dict:
    """Stub for ``verification_rejected`` messages.

    Production implementation lands in Session 3. Real handler returns
    a dict acknowledging the rejection — typically a structured
    summary recording that the orchestrator saw the failure and what
    it intends to do about it. Returning a dict transitions the
    message to ``completed``; the actual revision work happens in the
    orchestrator's primary CLI session, not in this daemon.

    Raising any exception here will be caught by ``process_one_message``
    and routed through the queue's fail/retry path, so a transient
    failure (e.g. logging-system blip) gets one or two retries before
    the message is permanently failed.
    """
    raise NotImplementedError(
        "orchestrator_role._default_rejection_handler is a stub; "
        "the real implementation lands in Session 3 of session set 002 "
        "(mode-aware route()/verify())"
    )


# --------------------------------------------------------------------------
# Verifier callable
# --------------------------------------------------------------------------

def make_dispatch_verifier(
    *,
    followup_handler: Callable[[QueueMessage], dict],
    rejection_handler: Callable[[QueueMessage], dict],
) -> Callable[[QueueMessage], dict]:
    """Build the callable passed to :func:`process_one_message`.

    The returned callable inspects ``msg.task_type`` and routes to the
    appropriate handler. ``FollowUpRequested`` raised by the handler
    propagates through unchanged so the queue's follow-up plumbing
    sees it. Any other exception likewise propagates so
    ``process_one_message`` can fail the message via ``QueueDB.fail``.

    Unknown task types raise :class:`UnknownTaskTypeError` — wrapped
    rather than ignored, so the queue retries once or twice and then
    fails the message permanently. Silent ignores would loop until
    the lease expired and reclaim_expired bumped attempts; making it
    a fail-fast exception cuts that wasted work.
    """
    def dispatch(msg: QueueMessage) -> dict:
        if msg.task_type == TASK_VERIFICATION_FOLLOWUP:
            return followup_handler(msg)
        if msg.task_type == TASK_VERIFICATION_REJECTED:
            return rejection_handler(msg)
        raise UnknownTaskTypeError(msg.task_type, msg.id)

    return dispatch


# --------------------------------------------------------------------------
# Daemon main loop
# --------------------------------------------------------------------------

class OrchestratorDaemon:
    """Long-running poll loop for one provider's orchestrator-side queue.

    Mirrors :class:`verifier_role.VerifierDaemon` step for step. The
    only differences are the dispatch logic (two task types, not one)
    and the public-facing names — same lease, heartbeat, shutdown,
    and reclaim plumbing apply.

    Pluggable handlers make tests trivial to write without faking the
    AI router. Production wiring (Session 3) replaces the defaults
    with real router-backed callables.
    """

    def __init__(
        self,
        provider: str,
        base_dir: str | os.PathLike[str] = "provider-queues",
        worker_id: Optional[str] = None,
        poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
        heartbeat_interval: float = HEARTBEAT_INTERVAL_SECONDS,
        max_followup_rounds: int = DEFAULT_MAX_FOLLOWUP_ROUNDS,
        followup_handler: Optional[Callable[[QueueMessage], dict]] = None,
        rejection_handler: Optional[Callable[[QueueMessage], dict]] = None,
    ):
        self.provider = provider
        self.queue = QueueDB(provider=provider, base_dir=base_dir)
        self.worker_id = worker_id or make_worker_id(provider)
        self.poll_interval_seconds = poll_interval_seconds
        self.lease_seconds = lease_seconds
        self.heartbeat_interval = heartbeat_interval
        self.max_followup_rounds = max_followup_rounds
        self._followup_handler = followup_handler or _default_followup_handler
        self._rejection_handler = (
            rejection_handler or _default_rejection_handler
        )
        self._shutdown = threading.Event()

    # --- shutdown plumbing ---

    @property
    def shutdown_event(self) -> threading.Event:
        return self._shutdown

    def request_shutdown(self) -> None:
        """Signal the loop to exit after the current job (if any) completes."""
        self._shutdown.set()

    def install_signal_handlers(self) -> None:
        """Wire SIGTERM and SIGINT to ``request_shutdown``.

        Only call from the main thread of the main process — Python's
        ``signal`` module enforces this. The ``__main__`` entry point
        does so; tests use ``request_shutdown()`` directly.
        """
        def _handler(signum, frame):  # noqa: ARG001
            self.request_shutdown()
        signal.signal(signal.SIGINT, _handler)
        try:
            signal.signal(signal.SIGTERM, _handler)
        except (AttributeError, ValueError):
            pass

    # --- single tick ---

    def run_one(self) -> Optional[str]:
        """Try to claim one message and process it.

        Returns the final outcome string from
        :func:`verifier_role.process_one_message`, or ``None`` if the
        queue was empty. Calls ``reclaim_expired`` before each claim
        so recovery proceeds without an external scheduler.
        """
        try:
            self.queue.reclaim_expired()
        except Exception as exc:  # noqa: BLE001
            print(
                f"[orchestrator_role] reclaim_expired failed: {exc!r}",
                file=sys.stderr,
            )
        msg = self.queue.claim(
            self.worker_id, lease_seconds=self.lease_seconds
        )
        if msg is None:
            return None
        verifier_callable = make_dispatch_verifier(
            followup_handler=self._followup_handler,
            rejection_handler=self._rejection_handler,
        )
        return process_one_message(
            self.queue, msg, self.worker_id,
            verifier=verifier_callable,
            heartbeat_interval=self.heartbeat_interval,
            lease_seconds=self.lease_seconds,
            max_followup_rounds=self.max_followup_rounds,
        )

    # --- main loop ---

    def run_forever(self) -> None:
        """Poll until ``request_shutdown`` is signaled."""
        while not self._shutdown.is_set():
            outcome = self.run_one()
            if outcome is None:
                self._shutdown.wait(self.poll_interval_seconds)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="orchestrator_role",
        description=(
            "Long-running orchestrator daemon for outsource-last mode. "
            "Polls provider-queues/<provider>/queue.db, claims "
            "verification_followup and verification_rejected messages "
            "addressed to this orchestrator, and dispatches them to "
            "the appropriate handlers."
        ),
    )
    p.add_argument(
        "--provider",
        required=True,
        help=(
            "Orchestrator's provider name (matches the directory under "
            "--base-dir). Examples: claude, gemini, openai."
        ),
    )
    p.add_argument(
        "--base-dir",
        default="provider-queues",
        help="Queue root (default: provider-queues).",
    )
    p.add_argument(
        "--poll-interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL_SECONDS,
        help=(
            f"Seconds to wait when the queue is empty "
            f"(default: {DEFAULT_POLL_INTERVAL_SECONDS})."
        ),
    )
    p.add_argument(
        "--lease-seconds",
        type=int,
        default=DEFAULT_LEASE_SECONDS,
        help=f"Claim lease length (default: {DEFAULT_LEASE_SECONDS}).",
    )
    p.add_argument(
        "--heartbeat-interval",
        type=float,
        default=HEARTBEAT_INTERVAL_SECONDS,
        help=(
            f"Heartbeat cadence in seconds "
            f"(default: {HEARTBEAT_INTERVAL_SECONDS})."
        ),
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    daemon = OrchestratorDaemon(
        provider=args.provider,
        base_dir=args.base_dir,
        poll_interval_seconds=args.poll_interval,
        lease_seconds=args.lease_seconds,
        heartbeat_interval=args.heartbeat_interval,
    )
    daemon.install_signal_handlers()
    print(
        f"[orchestrator_role] worker_id={daemon.worker_id} "
        f"polling provider={args.provider} "
        f"base_dir={args.base_dir}",
        file=sys.stderr,
        flush=True,
    )
    try:
        daemon.run_forever()
    finally:
        print(
            "[orchestrator_role] shutdown complete",
            file=sys.stderr,
            flush=True,
        )
    return 0


# Re-export FollowUpRequested at module scope for test ergonomics. The
# orchestrator daemon's followup_handler raises FollowUpRequested in
# exactly the same way the verifier does — having the symbol on this
# module too means callers wiring the production handlers do not need
# to import from verifier_role just to get the exception class.
__all__ = [
    "FollowUpRequested",
    "ORCHESTRATOR_TASK_TYPES",
    "OrchestratorDaemon",
    "TASK_VERIFICATION_FOLLOWUP",
    "TASK_VERIFICATION_REJECTED",
    "UnknownTaskTypeError",
    "main",
    "make_dispatch_verifier",
]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
