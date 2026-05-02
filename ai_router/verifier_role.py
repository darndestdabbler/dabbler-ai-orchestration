"""Verifier-role daemon: long-running CLI worker for outsource-last mode.

Polls a per-provider SQLite queue (``provider-queues/<provider>/queue.db``),
claims verification jobs, runs them, and writes the result back. Crash safety
comes from the queue's lease + heartbeat machinery (see ``queue_db.py``).

Usage
-----
::

    python -m ai_router.verifier_role --provider openai
    python ai_router/verifier_role.py --provider openai  # script form

The two forms are equivalent. ``-m`` works whenever the parent of
``ai_router/`` is on ``sys.path`` (the standard case for ``pip install
-e .`` or ``pip install dabbler-ai-router``); the script form falls
back on the in-file ``sys.path`` setup at the bottom of this module.

Worker identity
---------------
``<hostname>:<pid>:<provider>:<random-suffix>``. Serialized into the
``claimed_by`` column so observers can attribute claims to a specific
physical worker. The random suffix protects against PID reuse across
restarts when reclaim semantics need to distinguish "same hostname+PID,
different process" from "same process".

Loop contract
-------------

1. ``queue_db.claim(worker_id, lease_seconds=600)``.
   On ``None`` (empty queue), sleep ``poll_interval`` and re-check the
   shutdown signal. Otherwise advance to step 2.

2. Start the heartbeat thread for the claimed message. The thread emits
   ``queue_db.heartbeat`` every ``HEARTBEAT_INTERVAL_SECONDS`` while the
   message is being processed, so a 600-second lease never expires under
   a healthy worker. If ``heartbeat`` raises ``ConcurrencyError`` (the
   lease was revoked, e.g. ``reclaim_expired`` ran), the thread exits
   cleanly and the main thread learns about it on its next state-change
   call.

3. ``run_verification(msg)``:

   - returns ``dict``                 -> ``complete(msg.id, worker_id, result)``
   - raises :class:`FollowUpRequested` -> ``add_follow_up(msg.id, ...)``;
     leave the message in ``claimed`` state. The lease will eventually
     expire and ``reclaim_expired`` will roll the message back to ``new``,
     at which point a re-claim picks up the recorded follow-up. The
     orchestrator-role daemon (Session 2) participates by appending its
     reply via ``add_follow_up`` on the same message.
   - raises any other ``Exception``    -> ``fail(msg.id, worker_id, reason)``;
     the queue retries up to ``max_attempts``.

4. Stop the heartbeat thread. Loop.

Graceful shutdown
-----------------
SIGTERM / SIGINT (Ctrl+C, Windows console close) sets a shutdown event.
The loop checks it after every state-change call and after every poll
sleep. An in-flight job is allowed to finish — the daemon does NOT
forcibly abandon a claimed message, because doing so would leak the
lease until reclaim, blocking re-attempts.

Restart safety
--------------
On startup, messages still in ``claimed`` state from a prior worker
process are left alone. ``queue_db.reclaim_expired()`` is the canonical
recovery path: once the prior worker's lease expires, the message rolls
back to ``new`` and is picked up on the next ``claim()``. The daemon
calls ``reclaim_expired`` opportunistically before each ``claim`` so
recovery happens without an external scheduler.
"""

from __future__ import annotations

import argparse
import os
import secrets
import signal
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Optional

# Resolve sibling modules under three import shapes:
#
# 1. ``import verifier_role`` (script form, used by tests via
#    conftest.py adding ``ai_router/`` to sys.path) -> top-level
#    ``queue_db`` is importable.
# 2. ``from ai_router.verifier_role import ...`` (package form, when
#    the parent re-exposes ``ai_router/`` as ``ai_router``) -> the
#    sibling is ``.queue_db`` (relative).
# 3. ``python ai_router/verifier_role.py --provider X`` (running as
#    __main__) -> add ai_router/ to sys.path so the absolute import
#    above resolves.
if __name__ == "__main__" and __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from queue_db import (  # type: ignore[import-not-found]
        ConcurrencyError,
        DEFAULT_LEASE_SECONDS,
        DEFAULT_MAX_FOLLOWUP_ROUNDS,
        QueueDB,
        QueueMessage,
    )
    from daemon_pid import (  # type: ignore[import-not-found]
        VERIFIER_ROLE,
        remove_pid_file,
        write_pid_file,
    )
    from capacity import write_capacity_signal  # type: ignore[import-not-found]
except ImportError:
    from .queue_db import (  # type: ignore[no-redef]
        ConcurrencyError,
        DEFAULT_LEASE_SECONDS,
        DEFAULT_MAX_FOLLOWUP_ROUNDS,
        QueueDB,
        QueueMessage,
    )
    from .daemon_pid import (  # type: ignore[no-redef]
        VERIFIER_ROLE,
        remove_pid_file,
        write_pid_file,
    )
    from .capacity import write_capacity_signal  # type: ignore[no-redef]


# --------------------------------------------------------------------------
# Tunables
# --------------------------------------------------------------------------

# Heartbeat cadence. Lease is 600s; 30s gives ~20x margin against CPU
# starvation under heavy provider calls. Keep this well under
# ``DEFAULT_LEASE_SECONDS / 5`` to preserve the safety margin documented
# in the spec's risks section.
HEARTBEAT_INTERVAL_SECONDS = 30

# Polling cadence when the queue is empty. Short enough that a freshly
# enqueued message starts processing within a couple seconds; long
# enough that an idle daemon does not hammer SQLite.
DEFAULT_POLL_INTERVAL_SECONDS = 2.0


# --------------------------------------------------------------------------
# Public exceptions
# --------------------------------------------------------------------------

class FollowUpRequested(Exception):
    """The verification needs clarification before it can produce a verdict.

    Carries the question text. The daemon records it via
    :meth:`QueueDB.add_follow_up` and leaves the message in the
    ``claimed`` state so the orchestrator can pick up the dialogue.

    ``MaxFollowUpRoundsExceeded`` from ``queue_db`` propagates out of
    ``add_follow_up`` if the cap is hit; the daemon does not swallow
    it — see :func:`process_one_message`.
    """

    def __init__(self, content: str):
        super().__init__(content)
        self.content = content


# --------------------------------------------------------------------------
# Worker identity
# --------------------------------------------------------------------------

def make_worker_id(provider: str) -> str:
    """Build a worker_id of shape ``<hostname>:<pid>:<provider>:<random>``.

    The random suffix is 8 hex chars (32 bits of entropy). PID reuse
    across restarts is rare on modern OSes, but the random suffix
    removes the ambiguity entirely and lets observers distinguish
    "this is the same process restarted" from "this is a fresh one"
    purely from the worker_id.
    """
    hostname = socket.gethostname()
    pid = os.getpid()
    suffix = secrets.token_hex(4)
    return f"{hostname}:{pid}:{provider}:{suffix}"


# --------------------------------------------------------------------------
# Heartbeat thread
# --------------------------------------------------------------------------

class _HeartbeatThread(threading.Thread):
    """Background thread that extends a claim's lease while work runs.

    Lifecycle:

    * Constructed with the ``QueueDB``, message id, worker id, and a
      stop ``threading.Event``. Optional ``interval`` and ``lease_seconds``
      override the defaults — tests use shorter intervals.
    * ``run`` waits for the stop event up to ``interval`` seconds, then
      calls ``QueueDB.heartbeat``. Repeats until stopped or until
      ``heartbeat`` raises ``ConcurrencyError`` (lease lost). On
      ``ConcurrencyError`` the thread sets ``self.lost_lease = True``
      and exits silently — the main thread will discover the loss when
      its own state-change call (complete/fail/add_follow_up) raises.
    * Other exceptions are stored on ``self.exception`` and the thread
      exits. The main thread's ``stop()`` re-raises in the joiner so
      the failure is not swallowed.

    Daemon=True ensures process exit is not held up by a stuck
    heartbeat — the queue's lease will eventually expire and recovery
    proceeds anyway.
    """

    def __init__(
        self,
        queue: QueueDB,
        message_id: str,
        worker_id: str,
        stop_event: threading.Event,
        interval: float = HEARTBEAT_INTERVAL_SECONDS,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ):
        super().__init__(daemon=True, name=f"heartbeat-{message_id[:8]}")
        self._queue = queue
        self._message_id = message_id
        self._worker_id = worker_id
        self._stop_event = stop_event
        self._interval = interval
        self._lease_seconds = lease_seconds
        self.lost_lease = False
        self.exception: Optional[BaseException] = None

    def run(self) -> None:
        # Wait first, then beat — claim() set lease_expires_at = now+lease,
        # so the very first heartbeat is unnecessary. Beating immediately
        # would also cause spurious test flakiness when the test asserts
        # "no heartbeat yet" right after claim.
        while not self._stop_event.wait(self._interval):
            try:
                self._queue.heartbeat(
                    self._message_id,
                    self._worker_id,
                    lease_seconds=self._lease_seconds,
                )
            except ConcurrencyError:
                self.lost_lease = True
                return
            except BaseException as exc:  # noqa: BLE001
                # Capture and exit; the main thread will surface this
                # via stop() rather than swallowing it.
                self.exception = exc
                return


def _start_heartbeat(
    queue: QueueDB,
    message_id: str,
    worker_id: str,
    interval: float = HEARTBEAT_INTERVAL_SECONDS,
    lease_seconds: int = DEFAULT_LEASE_SECONDS,
) -> tuple[_HeartbeatThread, threading.Event]:
    stop = threading.Event()
    t = _HeartbeatThread(
        queue, message_id, worker_id, stop,
        interval=interval, lease_seconds=lease_seconds,
    )
    t.start()
    return t, stop


def _stop_heartbeat(thread: _HeartbeatThread, stop_event: threading.Event,
                    join_timeout: float = 5.0) -> None:
    stop_event.set()
    thread.join(timeout=join_timeout)
    if thread.exception is not None:
        # The heartbeat thread captured a non-ConcurrencyError exception
        # (a real bug, e.g., DB corruption). Re-raise so the daemon
        # surfaces it instead of silently looping.
        raise thread.exception


# --------------------------------------------------------------------------
# Verification entry point (pluggable)
# --------------------------------------------------------------------------

def run_verification(msg: QueueMessage) -> dict:
    """Run one verification job and return its result.

    Production implementation. The message payload (built by
    :func:`ai_router._enqueue_route_message`) carries the content the
    orchestrator wants verified plus enough metadata to reproduce its
    intent: ``content``, ``context``, ``task_type``, ``complexity_hint``,
    ``max_tier``, ``session_set``, ``session_number``. This function:

    1. Loads the router config (cached on first call).
    2. Picks a verifier model on this daemon's provider — the daemon
       represents a verifier provider, so we constrain pick_verifier_model
       to that provider via ``exclude_providers``-style selection. In
       outsource-last mode the spec guarantees the verifier role is the
       frontier-tier provider, so simply picking the cheapest model
       within ``to_provider`` matches the spec's intent.
    3. Builds a verification prompt via
       :func:`verification.build_verification_prompt`.
    4. Calls the chosen model via :func:`providers.call_model`.
    5. Parses verdict + issues via
       :func:`verification.parse_verification_response`.
    6. Returns a dict the queue can persist.

    A follow-up question from the verifier is signalled via
    :class:`FollowUpRequested`; the caller persists it via
    ``add_follow_up`` and leaves the message claimed for the
    orchestrator daemon to respond. This implementation does not
    proactively raise FollowUpRequested — the underlying call_model
    may produce a clarifying-question response, and a future tightening
    can detect that pattern. For now any verifier output is treated
    as a verdict.

    Tests still monkey-patch this attribute when they want a
    handler-free run loop.
    """
    # Imports deferred to call time so module-import order stays cheap
    # and circular-import-safe (ai_router/__init__.py imports this
    # module).
    try:
        from config import load_config  # type: ignore[import-not-found]
        from providers import call_model  # type: ignore[import-not-found]
        from verification import (  # type: ignore[import-not-found]
            build_verification_prompt,
            parse_verification_response,
        )
        from config import resolve_generation_params  # type: ignore[import-not-found]
    except ImportError:
        from .config import load_config  # type: ignore[no-redef]
        from .providers import call_model  # type: ignore[no-redef]
        from .verification import (  # type: ignore[no-redef]
            build_verification_prompt,
            parse_verification_response,
        )
        from .config import resolve_generation_params  # type: ignore[no-redef]

    payload = msg.payload or {}
    content = payload.get("content", "")
    context = payload.get("context", "")
    task_type = payload.get("task_type", msg.task_type)

    config = load_config(os.environ.get("AI_ROUTER_CONFIG"))

    # Find the verifier model. Constrain to the daemon's provider
    # (msg.to_provider == this daemon's provider). The router config's
    # rule-based pick already filters by enabled+verifier flags and
    # tier; we re-implement the local "must be on provider X" filter
    # because pick_verifier_model is generator-pivoted, not
    # provider-pivoted. Pick the cheapest output-priced enabled
    # verifier on the target provider.
    candidates = []
    for name, cfg in (config.get("models") or {}).items():
        if cfg.get("provider") != msg.to_provider:
            continue
        if not cfg.get("is_enabled", True):
            continue
        if not cfg.get("is_enabled_as_verifier", True):
            continue
        candidates.append((cfg.get("output_cost_per_1m", 0.0), name, cfg))
    if not candidates:
        # No eligible verifier on this provider. Fail the job — the
        # queue's retry/timeout machinery will handle it; an operator
        # has to fix the config.
        raise RuntimeError(
            f"no enabled verifier model on provider {msg.to_provider!r} "
            f"in router-config.yaml"
        )
    candidates.sort()
    _, verifier_name, verifier_cfg = candidates[0]
    verifier_provider = verifier_cfg["provider"]

    # Build the verification prompt. The "original task" is the
    # content; the verifier sees task_type as context.
    template = config.get("_verification_template", "")
    user_message = build_verification_prompt(
        original_task=content,
        original_response=content,
        task_type=task_type,
        template=template,
    )
    system_prompt = verifier_cfg.get(
        "_system_prompt",
        "You are an independent code verifier. Be precise and objective.",
    )

    gen_params = resolve_generation_params(
        verifier_name, "verification", config
    )

    api_result = call_model(
        provider_name=verifier_provider,
        model_id=verifier_cfg["model_id"],
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=verifier_cfg["max_output_tokens"],
        config=config["providers"][verifier_provider],
        generation_params=gen_params,
    )

    verdict, issues = parse_verification_response(api_result.content)

    # Cost calculation matches the formula used in __init__.py to keep
    # billable totals consistent across both code paths.
    cost = (
        api_result.input_tokens / 1_000_000
        * verifier_cfg.get("input_cost_per_1m", 0.0)
        + api_result.output_tokens / 1_000_000
        * verifier_cfg.get("output_cost_per_1m", 0.0)
    )

    return {
        "verdict": verdict,
        "verified": verdict == "VERIFIED",
        "issues": issues,
        "verifier_model": verifier_name,
        "verifier_provider": verifier_provider,
        "verifier_input_tokens": api_result.input_tokens,
        "verifier_output_tokens": api_result.output_tokens,
        "verifier_cost_usd": cost,
        "raw_response": api_result.content,
        "stop_reason": api_result.stop_reason,
        "task_type": task_type,
        "session_set": payload.get("session_set"),
        "session_number": payload.get("session_number"),
    }


# --------------------------------------------------------------------------
# Single-message processing
# --------------------------------------------------------------------------

def process_one_message(
    queue: QueueDB,
    msg: QueueMessage,
    worker_id: str,
    *,
    verifier: Optional[Callable[[QueueMessage], dict]] = None,
    heartbeat_interval: float = HEARTBEAT_INTERVAL_SECONDS,
    lease_seconds: int = DEFAULT_LEASE_SECONDS,
    max_followup_rounds: int = DEFAULT_MAX_FOLLOWUP_ROUNDS,
) -> str:
    """Run the lifecycle for one already-claimed message.

    Returns one of ``"completed"``, ``"failed"`` (or ``"new"`` if the
    queue chose to retry), or ``"awaiting_followup"`` (caller must
    treat the message as still claimed and let the lease govern
    recovery).

    ``verifier`` overrides the module-level ``run_verification`` for
    callers that want explicit injection (the daemon's main loop
    relies on monkey-patching for tests, but explicit injection is
    simpler for unit tests of this function alone).
    """
    fn = verifier if verifier is not None else run_verification
    hb_thread, hb_stop = _start_heartbeat(
        queue, msg.id, worker_id,
        interval=heartbeat_interval, lease_seconds=lease_seconds,
    )
    try:
        try:
            result = fn(msg)
        except FollowUpRequested as fu:
            # Persist the question. If add_follow_up itself fails (e.g.
            # MaxFollowUpRoundsExceeded), let the exception propagate —
            # the queue has already transitioned the message to failed
            # in that case, so no further state change is needed here.
            queue.add_follow_up(
                msg.id, msg.to_provider, fu.content,
                max_rounds=max_followup_rounds,
            )
            return "awaiting_followup"
        except BaseException as exc:  # noqa: BLE001
            # Any non-FollowUp exception is a failure. fail() bumps
            # attempts and either rolls back to 'new' (retry) or
            # transitions to 'failed' (terminal).
            try:
                state_after = queue.fail(msg.id, worker_id, repr(exc))
            except ConcurrencyError:
                # Lease was revoked while we were processing. Nothing
                # to do — reclaim_expired already handled the message.
                state_after = "concurrency-lost"
            return state_after
        # Happy path
        try:
            queue.complete(msg.id, worker_id, result)
        except ConcurrencyError:
            return "concurrency-lost"
        # Capacity heartbeat (Set 004 / Session 2). Best-effort,
        # fire-and-forget — write_capacity_signal already swallows
        # OSError so a transient FS hiccup cannot wedge the loop. We
        # still wrap in a broad except as a final belt + suspenders
        # against an unexpected error from a future addition (e.g., a
        # JSON-encode failure on a payload with a non-serializable
        # element).
        try:
            _emit_capacity_signal(queue, msg, result)
        except Exception:  # noqa: BLE001
            pass
        return "completed"
    finally:
        _stop_heartbeat(hb_thread, hb_stop)


def _emit_capacity_signal(
    queue: QueueDB,
    msg: QueueMessage,
    result: dict,
) -> None:
    """Write one capacity-signal record after a successful ``complete()``.

    Inspects the verifier-shaped result dict for token counts and the
    chosen model. Fields the verifier doesn't populate (e.g., the
    orchestrator daemon's default-handler dict, which has no token
    counts) come through as ``None`` — the signal-writer stores them
    as null and ``read_capacity_summary`` accumulates zero for those
    records. Heartbeat presence still records "this provider produced
    a completion at time T".

    The provider-and-base-dir for the signal file mirror the queue's
    own — verifier and orchestrator daemons each own their provider
    directory, and their capacity log lives alongside ``queue.db``.
    """
    completion_metadata = {
        "task_type": msg.task_type,
        "tokens_input": (
            result.get("verifier_input_tokens")
            or result.get("tokens_input")
        ),
        "tokens_output": (
            result.get("verifier_output_tokens")
            or result.get("tokens_output")
        ),
        "elapsed_seconds": result.get("elapsed_seconds"),
        "model_name": (
            result.get("verifier_model")
            or result.get("model_name")
        ),
    }
    write_capacity_signal(
        queue.provider,
        completion_metadata,
        base_dir=str(queue.base_dir),
    )


# --------------------------------------------------------------------------
# Daemon main loop
# --------------------------------------------------------------------------

class VerifierDaemon:
    """Long-running poll loop for one provider's verification queue.

    Methods are designed for both production use (``run_forever``) and
    test use (``run_one`` returns after a single claim attempt). The
    shutdown event is exposed so tests can signal stop without sending
    real signals.
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
        verifier: Optional[Callable[[QueueMessage], dict]] = None,
    ):
        self.provider = provider
        self.base_dir = str(base_dir)
        self.queue = QueueDB(provider=provider, base_dir=base_dir)
        self.worker_id = worker_id or make_worker_id(provider)
        self.poll_interval_seconds = poll_interval_seconds
        self.lease_seconds = lease_seconds
        self.heartbeat_interval = heartbeat_interval
        self.max_followup_rounds = max_followup_rounds
        self._verifier = verifier
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
        does so; tests use ``request_shutdown()`` directly and skip
        installing real handlers.
        """
        def _handler(signum, frame):  # noqa: ARG001
            self.request_shutdown()
        signal.signal(signal.SIGINT, _handler)
        try:
            signal.signal(signal.SIGTERM, _handler)
        except (AttributeError, ValueError):
            # SIGTERM is not available on all platforms (e.g. some
            # Windows shells). SIGINT is enough on those.
            pass

    # --- single tick (used by tests + run_forever) ---

    def run_one(self) -> Optional[str]:
        """Try to claim one message and process it.

        Returns the final outcome string from :func:`process_one_message`,
        or ``None`` if the queue was empty. Calls ``reclaim_expired``
        before each claim so recovery proceeds without an external
        scheduler. Does NOT sleep on empty — the caller decides
        cadence.
        """
        # Best-effort recovery before claim. A reclaim failure should
        # not stop the daemon — log via stderr and continue.
        try:
            self.queue.reclaim_expired()
        except Exception as exc:  # noqa: BLE001
            print(
                f"[verifier_role] reclaim_expired failed: {exc!r}",
                file=sys.stderr,
            )
        msg = self.queue.claim(self.worker_id, lease_seconds=self.lease_seconds)
        if msg is None:
            return None
        return process_one_message(
            self.queue, msg, self.worker_id,
            verifier=self._verifier,
            heartbeat_interval=self.heartbeat_interval,
            lease_seconds=self.lease_seconds,
            max_followup_rounds=self.max_followup_rounds,
        )

    # --- main loop ---

    def run_forever(self) -> None:
        """Poll until ``request_shutdown`` is signaled.

        Sleep granularity is bounded by ``poll_interval_seconds`` so
        shutdown is responsive even when the queue is empty.
        """
        while not self._shutdown.is_set():
            outcome = self.run_one()
            if outcome is None:
                # Empty queue. Wait up to poll_interval, but break out
                # immediately on shutdown so SIGTERM doesn't have to
                # wait for the next poll cycle.
                self._shutdown.wait(self.poll_interval_seconds)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="verifier_role",
        description=(
            "Long-running verifier daemon for outsource-last mode. "
            "Polls provider-queues/<provider>/queue.db, claims "
            "verification jobs, and writes results back."
        ),
    )
    p.add_argument(
        "--provider",
        required=True,
        help=(
            "Provider name (matches the directory under --base-dir). "
            "Examples: openai, gemini, claude."
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
    daemon = VerifierDaemon(
        provider=args.provider,
        base_dir=args.base_dir,
        poll_interval_seconds=args.poll_interval,
        lease_seconds=args.lease_seconds,
        heartbeat_interval=args.heartbeat_interval,
    )
    daemon.install_signal_handlers()

    # Write the pid file so role_status / restart_role can find this
    # daemon. Removed in finally so a graceful shutdown leaves nothing
    # behind; a hard kill leaves the file for is_pid_alive to mark stale.
    write_pid_file(
        VERIFIER_ROLE,
        args.provider,
        worker_id=daemon.worker_id,
        lease_seconds=args.lease_seconds,
        heartbeat_interval=args.heartbeat_interval,
        base_dir=args.base_dir,
    )

    print(
        f"[verifier_role] worker_id={daemon.worker_id} "
        f"polling provider={args.provider} "
        f"base_dir={args.base_dir}",
        file=sys.stderr,
        flush=True,
    )
    try:
        daemon.run_forever()
    finally:
        remove_pid_file(VERIFIER_ROLE, args.provider, base_dir=args.base_dir)
        print("[verifier_role] shutdown complete", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
