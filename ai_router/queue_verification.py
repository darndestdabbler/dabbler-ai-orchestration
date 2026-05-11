"""Queue-mediated verification wait — outsource-last path only.

This module is only used by ``dabbler-platform`` (``outsourceMode: last``).
All other consumers use ``outsourceMode: first`` (synchronous API path) and
never reach this code.

The public entry point is :func:`wait_for_verifications` (called
``_wait_for_verifications`` in the module for backward-compat with
``close_session.py``'s namespace). It polls per-provider SQLite queue
databases until all queued verification messages reach a terminal state
or the timeout expires.

See also: ``ai_router/docs/two-cli-workflow.md`` — daemon setup, recovery,
and the full outsource-last operating guide.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Callable, Iterable, List, Optional

try:
    from queue_db import (  # type: ignore[import-not-found]
        DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
        TERMINAL_STATES,
        QueueDB,
        QueueMessage,
    )
    from disposition import Disposition  # type: ignore[import-not-found]
except ImportError:
    from .queue_db import (  # type: ignore[no-redef]
        DEFAULT_BASE_DIR as QUEUE_DEFAULT_BASE_DIR,
        TERMINAL_STATES,
        QueueDB,
        QueueMessage,
    )
    from .disposition import Disposition  # type: ignore[no-redef]

# Default poll interval (seconds). Tests pass a smaller value via run() so the
# integration suite does not spend real wall-clock time on the wait.
DEFAULT_POLL_INTERVAL_SECONDS = 5.0


@dataclass
class _MessageOutcome:
    """Snapshot of one queue message at the moment polling terminated.

    ``state`` is the terminal queue state (``completed`` / ``failed`` /
    ``timed_out``) when ``terminal`` is True, or the last observed
    non-terminal state when the wait timed out before resolution.
    ``failure_reason`` is set for the ``failed`` / ``timed_out`` cases
    and is ``None`` otherwise (including for ``completed`` and for
    "still pending at timeout"). ``provider`` records which
    per-provider queue directory the message resolved under, since the
    disposition records only the message id.
    """

    message_id: str
    provider: Optional[str]
    state: str
    terminal: bool
    failure_reason: Optional[str] = None


def _discover_queue_providers(queue_base_dir: str) -> List[str]:
    """Return the list of per-provider subdirectories under ``queue_base_dir``.

    The queue layout is ``<base>/<provider>/queue.db``. We don't know
    up front which provider holds a given message id (the disposition
    records only the id), so the wait logic enumerates providers and
    asks each. Empty list is acceptable — the caller treats it as "no
    queues exist; messages cannot resolve".

    Filters to directories containing a ``queue.db`` so an unrelated
    folder dropped under the queue root doesn't get probed. Returns
    providers in sorted order so the search is deterministic across
    runs (helps debugging and test stability).
    """
    if not os.path.isdir(queue_base_dir):
        return []
    out: List[str] = []
    try:
        entries = sorted(os.listdir(queue_base_dir))
    except OSError:
        return []
    for name in entries:
        candidate = os.path.join(queue_base_dir, name, "queue.db")
        if os.path.isfile(candidate):
            out.append(name)
    return out


def _lookup_message(
    message_id: str,
    queue_base_dir: str,
    providers: Iterable[str],
) -> tuple[Optional[QueueMessage], Optional[str]]:
    """Search every per-provider queue for *message_id*.

    Returns ``(message, provider_name)``. Both are ``None`` when the
    id is not present in any queue (treat as a logical drift — the
    disposition references an id we cannot resolve). Errors opening a
    specific provider's database are swallowed: the goal is "find this
    id somewhere", and a single corrupted queue should not blind us to
    the others.
    """
    for provider in providers:
        try:
            qdb = QueueDB(provider=provider, base_dir=queue_base_dir)
        except (ValueError, OSError):
            continue
        try:
            msg = qdb.get_message(message_id)
        except Exception:  # pragma: no cover — defensive
            continue
        if msg is not None:
            return msg, provider
    return None, None


def _wait_for_verifications(
    session_set_dir: str,
    disposition: Optional[Disposition],
    *,
    manual_verify: bool,
    timeout_minutes: int,
    queue_base_dir: str = QUEUE_DEFAULT_BASE_DIR,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    sleep: Optional[Callable[[float], None]] = None,
    monotonic: Optional[Callable[[], float]] = None,
) -> tuple[str, str, List[str], List[_MessageOutcome]]:
    """Wait for queued verifications to reach a terminal state.

    Returns ``(method, wait_outcome, message_ids, outcomes)``:

    * ``method`` — ``"api"`` (synchronous; nothing to wait on),
      ``"queue"`` (waited on the queue), ``"manual"``
      (``--manual-verify`` skipped the wait), or ``"skipped"`` (no
      disposition; nothing to do — the gate-failure path catches this
      separately).
    * ``wait_outcome`` — one of ``"not_run"`` (api / manual / skipped /
      empty queue list), ``"completed"`` (every queued message ended
      in ``completed``), ``"failed"`` (any message ended in ``failed``),
      ``"timed_out"`` (any message ended in ``timed_out`` OR the wait
      itself timed out before all messages resolved).
    * ``message_ids`` — verbatim copy of
      ``disposition.verification_message_ids`` (so the JSON output
      carries the audit trail even when the wait was skipped).
    * ``outcomes`` — per-message :class:`_MessageOutcome` snapshots,
      used by :func:`close_session.run` to emit ``verification_completed`` /
      ``verification_timed_out`` ledger events with structured
      payloads. Empty list when the wait did not run.

    Polling cadence is ``poll_interval_seconds`` (default 5 s) and the
    overall budget is ``timeout_minutes`` (multiplied by 60 to get
    seconds). The two clock primitives ``sleep`` and ``monotonic`` are
    injectable so tests don't pay real wall-clock latency for the wait.
    """
    sleep_fn = sleep if sleep is not None else time.sleep
    clock = monotonic if monotonic is not None else time.monotonic

    if manual_verify:
        return "manual", "skipped_via_manual_verify", [], []

    if disposition is None:
        return "skipped", "no_disposition", [], []

    method = disposition.verification_method or "skipped"
    message_ids = list(disposition.verification_message_ids)

    # outsource-first / synchronous API path: verification result is
    # already on disk by the time close-out runs. Nothing to wait on.
    if method != "queue":
        return method, "not_run", message_ids, []

    # outsource-last / queue-mediated path. An empty message list with
    # method=queue is a malformed disposition (validate_disposition
    # rejects it), but defensively we still return "not_run" rather
    # than spinning a zero-length poll loop.
    if not message_ids:
        return method, "not_run", message_ids, []

    providers = _discover_queue_providers(queue_base_dir)
    deadline = clock() + max(0, timeout_minutes) * 60.0

    # Per-message terminal outcome cache. As soon as a message reaches
    # a terminal state we record it and stop re-polling that id —
    # terminal states cannot transition back, so further reads would
    # waste DB roundtrips.
    resolved: dict[str, _MessageOutcome] = {}

    while True:
        for mid in message_ids:
            if mid in resolved:
                continue
            msg, provider = _lookup_message(mid, queue_base_dir, providers)
            if msg is None:
                # The id isn't present in any queue we can see. Record
                # a synthetic timed-out outcome with a reason naming
                # the drift; the caller treats this as a verification
                # failure surface (gate_failed) at the top of run().
                resolved[mid] = _MessageOutcome(
                    message_id=mid,
                    provider=None,
                    state="missing",
                    terminal=True,
                    failure_reason=(
                        f"queue message {mid!r} not found in any "
                        f"provider under {queue_base_dir!r}"
                    ),
                )
                continue
            if msg.state in TERMINAL_STATES:
                resolved[mid] = _MessageOutcome(
                    message_id=mid,
                    provider=provider,
                    state=msg.state,
                    terminal=True,
                    failure_reason=msg.failure_reason,
                )

        if len(resolved) == len(message_ids):
            break

        # Some messages still in flight. Sleep up to one full poll
        # interval, but never past the overall deadline — capping the
        # sleep at the remaining budget keeps the timeout sharp.
        remaining = deadline - clock()
        if remaining <= 0:
            break
        sleep_fn(min(poll_interval_seconds, remaining))

    # Decide the aggregate outcome based on the per-message states.
    # Order of severity (most severe wins): timed_out > failed > completed.
    # A "still pending at deadline" message is recorded as a synthetic
    # timed_out outcome below so the aggregate reflects "we couldn't
    # finish the wait".
    outcomes: List[_MessageOutcome] = []
    saw_failed = False
    saw_timed_out = False
    for mid in message_ids:
        out = resolved.get(mid)
        if out is None:
            # Wait deadline expired while this message was still
            # non-terminal. Reflect that as a synthetic timed_out
            # outcome rather than a missing record so the aggregate
            # logic treats it consistently.
            out = _MessageOutcome(
                message_id=mid,
                provider=None,
                state="pending_at_deadline",
                terminal=False,
                failure_reason="close_session timeout exceeded",
            )
        outcomes.append(out)
        if out.state == "failed" or out.state == "missing":
            saw_failed = True
        elif out.state == "timed_out" or not out.terminal:
            saw_timed_out = True

    if saw_timed_out:
        wait_outcome = "timed_out"
    elif saw_failed:
        wait_outcome = "failed"
    else:
        wait_outcome = "completed"

    return method, wait_outcome, message_ids, outcomes
