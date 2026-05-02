"""``queue_status`` — read-only inspection of provider queues, plus emergency intervention.

Set 5 / Session 1. The VS Code extension's ``Provider Queues`` tree
view shells out to this module rather than embedding a SQLite client
of its own. Two reasons:

1. The queue schema lives in :mod:`queue_db`. A second reader written
   in TypeScript would either duplicate that schema or drift out of
   sync the moment the migration tool lands. Shelling out keeps a
   single source of truth.
2. Emergency interventions (``--mark-failed``, ``--force-reclaim``)
   need the same transactional guarantees as the role-loop daemons.
   Reusing :class:`QueueDB` is the cheapest way to inherit them.

Invocation::

    python -m ai_router.queue_status                       # human text, all providers
    python -m ai_router.queue_status --format json         # JSON for the extension
    python -m ai_router.queue_status --provider anthropic  # filter to one provider
    python -m ai_router.queue_status --state claimed       # filter to one state
    python -m ai_router.queue_status --mark-failed <id>    # force-fail a stuck message
    python -m ai_router.queue_status --force-reclaim <id>  # release a stuck lease

Output schema (``--format json``)::

    {
      "providers": {
        "<name>": {
          "queue_path": "<absolute path>",
          "queue_present": true|false,
          "states": {"new": int, "claimed": int, "completed": int,
                     "failed": int, "timed_out": int},
          "messages": [
            {"id": str, "task_type": str, "session_set": str|null,
             "session_number": int|null, "state": str,
             "claimed_by": str|null, "lease_expires_at": str|null,
             "enqueued_at": str, "attempts": int, "max_attempts": int,
             "from_provider": str},
            ...
          ]
        }
      }
    }

The ``queue_present`` field distinguishes "no queue.db on disk yet"
(provider has never been targeted) from "queue.db exists but is
empty". The extension uses this to decide between rendering a
zero-row tree node vs. hiding the provider entirely.

Read concurrency
----------------
The queue DBs are written by the role-loop daemons and read here.
Reads use ``QueueDB``'s short-lived connections, which acquire
SQLite's reader lock without blocking writers (WAL mode). No special
``PRAGMA query_only`` is needed — the read helpers do not issue
writes — but every read path opens its own connection so a slow
extension refresh cannot starve a daemon's BEGIN IMMEDIATE.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterable, List, Optional

if __name__ == "__main__" and __package__ in (None, ""):
    # See close_session.py for the rationale on this dual-import shape.
    sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    from queue_db import (  # type: ignore[import-not-found]
        DEFAULT_BASE_DIR,
        VALID_STATES,
        ConcurrencyError,
        QueueDB,
        QueueMessage,
    )
except ImportError:
    from .queue_db import (  # type: ignore[no-redef]
        DEFAULT_BASE_DIR,
        VALID_STATES,
        ConcurrencyError,
        QueueDB,
        QueueMessage,
    )


DEFAULT_LIMIT = 50

# Forced-failure reason used by ``--mark-failed`` so audit logs can
# distinguish operator interventions from real verifier failures.
MARK_FAILED_REASON = "manual_intervention_via_queue_status"


def _discover_providers(base_dir: Path) -> List[str]:
    """Return providers that have a queue.db under ``base_dir``.

    A provider is considered present if ``<base_dir>/<provider>/queue.db``
    exists. Subdirectories without a queue.db (e.g. a provider that has
    only emitted capacity signals but never had a queue created) are
    skipped — the queue view is queue-only, capacity signals are the
    heartbeat view's job.
    """
    if not base_dir.is_dir():
        return []
    out: List[str] = []
    for entry in sorted(base_dir.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / "queue.db").is_file():
            out.append(entry.name)
    return out


def _list_messages(
    qdb: QueueDB,
    *,
    state_filter: Optional[str],
    limit: int,
) -> List[QueueMessage]:
    """Return up to ``limit`` messages, optionally filtered by state.

    Ordering: newest enqueue first. The extension's tree view groups
    by state, so within a state the operator wants to see the most
    recent activity first.
    """
    conn = qdb._connect()
    try:
        if state_filter:
            rows = conn.execute(
                """
                SELECT * FROM messages
                WHERE state = ?
                ORDER BY enqueued_at DESC, rowid DESC
                LIMIT ?
                """,
                (state_filter, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM messages
                ORDER BY enqueued_at DESC, rowid DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    finally:
        conn.close()
    return [QueueMessage.from_row(r) for r in rows]


def _message_summary(msg: QueueMessage) -> dict:
    """Return the tree-view-friendly subset of a QueueMessage.

    Drops ``payload`` and ``result`` — both can be large and the tree
    view fetches them on demand via the Open Payload command. The
    payload-on-demand path opens a fresh QueueDB lookup so we don't
    ship megabytes of JSON across the JSON-stdout boundary on every
    refresh.
    """
    return {
        "id": msg.id,
        "task_type": msg.task_type,
        "session_set": msg.session_set,
        "session_number": msg.session_number,
        "state": msg.state,
        "claimed_by": msg.claimed_by,
        "lease_expires_at": msg.lease_expires_at,
        "enqueued_at": msg.enqueued_at,
        "completed_at": msg.completed_at,
        "attempts": msg.attempts,
        "max_attempts": msg.max_attempts,
        "from_provider": msg.from_provider,
    }


def collect_status(
    *,
    base_dir: Path,
    provider_filter: Optional[str] = None,
    state_filter: Optional[str] = None,
    limit: int = DEFAULT_LIMIT,
) -> dict:
    """Build the JSON payload the VS Code extension consumes.

    ``base_dir`` is the queue root (typically ``provider-queues``).
    ``provider_filter`` restricts to a single provider; missing
    providers produce an empty result rather than an error so the
    extension can render "queue not yet created" gracefully.
    """
    if state_filter and state_filter not in VALID_STATES:
        raise ValueError(
            f"unknown state {state_filter!r}; "
            f"expected one of {VALID_STATES}"
        )
    if limit <= 0:
        raise ValueError(f"limit must be positive (got {limit!r})")

    providers = _discover_providers(base_dir)
    if provider_filter is not None:
        providers = [p for p in providers if p == provider_filter]
        # If the operator named a provider that doesn't have a queue
        # yet, surface it anyway with queue_present=false. Saves the
        # extension a follow-up call to figure out "is this a typo or
        # is it just empty".
        if provider_filter not in providers:
            providers = [provider_filter]

    out_providers: dict[str, dict] = {}
    for provider in providers:
        queue_path = base_dir / provider / "queue.db"
        present = queue_path.is_file()
        if not present:
            out_providers[provider] = {
                "queue_path": str(queue_path),
                "queue_present": False,
                "states": {s: 0 for s in VALID_STATES},
                "messages": [],
            }
            continue
        qdb = QueueDB(provider=provider, base_dir=base_dir)
        counts = qdb.count_by_state()
        # Emit zero entries for unseen states so the extension's tree
        # view always has the same five children, regardless of which
        # ones currently have rows.
        states = {s: counts.get(s, 0) for s in VALID_STATES}
        messages = [
            _message_summary(m)
            for m in _list_messages(
                qdb, state_filter=state_filter, limit=limit
            )
        ]
        out_providers[provider] = {
            "queue_path": str(queue_path),
            "queue_present": True,
            "states": states,
            "messages": messages,
        }

    return {"providers": out_providers}


def get_payload(
    *,
    base_dir: Path,
    provider: str,
    message_id: str,
) -> Optional[dict]:
    """Fetch the full payload for one message (extension's Open Payload)."""
    qdb = QueueDB(provider=provider, base_dir=base_dir)
    msg = qdb.get_message(message_id)
    if msg is None:
        return None
    return {
        "id": msg.id,
        "from_provider": msg.from_provider,
        "to_provider": msg.to_provider,
        "task_type": msg.task_type,
        "session_set": msg.session_set,
        "session_number": msg.session_number,
        "state": msg.state,
        "enqueued_at": msg.enqueued_at,
        "claimed_by": msg.claimed_by,
        "claimed_at": msg.claimed_at,
        "lease_expires_at": msg.lease_expires_at,
        "completed_at": msg.completed_at,
        "attempts": msg.attempts,
        "max_attempts": msg.max_attempts,
        "failure_reason": msg.failure_reason,
        "payload": msg.payload,
        "result": msg.result,
    }


def mark_failed(
    *,
    base_dir: Path,
    provider: str,
    message_id: str,
    reason: str = MARK_FAILED_REASON,
) -> dict:
    """Force a message into ``state='failed'`` regardless of who claims it.

    Operator escape hatch for messages that are stuck in ``claimed``
    with a live lease but the worker is known dead, or for ``new``
    messages that the operator has decided to abandon. Bypasses the
    normal :meth:`QueueDB.fail` ownership check on purpose.

    Returns ``{"ok": True, "previous_state": <str>}`` on success.
    Returns ``{"ok": False, "error": <str>}`` if the message is unknown
    or already terminal.
    """
    import sqlite3
    from datetime import datetime, timezone

    qdb = QueueDB(provider=provider, base_dir=base_dir)
    now = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(qdb.db_path, isolation_level=None, timeout=30.0)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT state FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                return {"ok": False, "error": f"unknown message_id: {message_id!r}"}
            previous = row["state"]
            if previous in ("completed", "failed", "timed_out"):
                conn.execute("ROLLBACK")
                return {
                    "ok": False,
                    "error": (
                        f"refusing to mark-failed: message {message_id} "
                        f"already in terminal state {previous!r}"
                    ),
                }
            conn.execute(
                """
                UPDATE messages
                SET state = 'failed',
                    failure_reason = ?,
                    completed_at = ?,
                    claimed_by = NULL,
                    claimed_at = NULL,
                    lease_expires_at = NULL
                WHERE id = ?
                """,
                (reason, now, message_id),
            )
            conn.execute("COMMIT")
            return {"ok": True, "previous_state": previous}
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
    finally:
        conn.close()


def force_reclaim(
    *,
    base_dir: Path,
    provider: str,
    message_id: str,
) -> dict:
    """Release a stuck lease so the next ``claim()`` can pick the message up.

    Sets ``state='new'`` and clears the claim fields. Bumps ``attempts``
    so a message that has been force-reclaimed many times eventually
    times out via the normal max-attempts path rather than looping
    forever.

    Returns ``{"ok": True, "previous_state": <str>, "attempts": <int>}``
    on success, or ``{"ok": False, "error": <str>}`` if the target is
    not currently in ``state='claimed'``.
    """
    import sqlite3

    qdb = QueueDB(provider=provider, base_dir=base_dir)

    conn = sqlite3.connect(qdb.db_path, isolation_level=None, timeout=30.0)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT state, attempts, max_attempts FROM messages WHERE id = ?",
                (message_id,),
            ).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                return {"ok": False, "error": f"unknown message_id: {message_id!r}"}
            if row["state"] != "claimed":
                conn.execute("ROLLBACK")
                return {
                    "ok": False,
                    "error": (
                        f"refusing to force-reclaim: message {message_id} "
                        f"is in state {row['state']!r}, not 'claimed'"
                    ),
                }
            new_attempts = row["attempts"] + 1
            # Do NOT set failure_reason here. force_reclaim returns the
            # message to ``state='new'`` for retry; the message is not
            # failed. The audit trail of who reclaimed it lives in the
            # operator's command history, not in the row.
            conn.execute(
                """
                UPDATE messages
                SET state = 'new',
                    attempts = ?,
                    failure_reason = NULL,
                    claimed_by = NULL,
                    claimed_at = NULL,
                    lease_expires_at = NULL,
                    last_heartbeat_at = NULL
                WHERE id = ?
                """,
                (new_attempts, message_id),
            )
            conn.execute("COMMIT")
            return {
                "ok": True,
                "previous_state": "claimed",
                "attempts": new_attempts,
            }
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise
    finally:
        conn.close()


# ---------- CLI ----------


def _print_text(payload: dict, out=sys.stdout) -> None:
    providers = payload.get("providers", {})
    if not providers:
        print("(no provider queues found)", file=out)
        return
    for name, info in providers.items():
        print(f"== {name} ==", file=out)
        if not info.get("queue_present"):
            print(f"  (no queue.db at {info['queue_path']})", file=out)
            continue
        states = info.get("states", {})
        # Stable ordering of states matches the queue_db state machine
        # progression; same as the tree view.
        for s in ("new", "claimed", "completed", "failed", "timed_out"):
            print(f"  {s:10s} {states.get(s, 0):>5}", file=out)
        msgs = info.get("messages", [])
        if msgs:
            print(f"  ---", file=out)
            for m in msgs:
                claimer = m.get("claimed_by") or "-"
                ss = m.get("session_set") or "-"
                print(
                    f"  {m['id'][:8]} {m['state']:10s} "
                    f"{m['task_type']:24s} {ss}/{m.get('session_number') or '-'} "
                    f"by={claimer}",
                    file=out,
                )


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="queue_status",
        description=(
            "Inspect provider queues and (with --mark-failed / "
            "--force-reclaim) intervene on stuck messages. The VS "
            "Code extension's Provider Queues view shells out to "
            "the JSON form of this command."
        ),
    )
    p.add_argument(
        "--workspace",
        default=None,
        help=(
            "Workspace root. The queue base dir is "
            "<workspace>/provider-queues. Defaults to the current "
            "working directory."
        ),
    )
    p.add_argument(
        "--base-dir",
        default=None,
        help=(
            "Override the queue base dir directly. Takes precedence "
            f"over --workspace. Default: <workspace>/{DEFAULT_BASE_DIR}."
        ),
    )
    p.add_argument(
        "--provider",
        default=None,
        help="Limit output to one provider name.",
    )
    p.add_argument(
        "--state",
        default=None,
        choices=list(VALID_STATES),
        help="Limit message listing to one state.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Max messages per provider (default: {DEFAULT_LIMIT}).",
    )
    p.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format. The extension uses --format json.",
    )

    intervention = p.add_argument_group("intervention (mutually exclusive)")
    intervention.add_argument(
        "--mark-failed",
        metavar="MESSAGE_ID",
        default=None,
        help=(
            "Force a message into state=failed, regardless of who "
            "owns the claim. Requires --provider."
        ),
    )
    intervention.add_argument(
        "--force-reclaim",
        metavar="MESSAGE_ID",
        default=None,
        help=(
            "Release a stuck claim (state=claimed) back to state=new. "
            "Bumps attempts. Requires --provider."
        ),
    )
    intervention.add_argument(
        "--get-payload",
        metavar="MESSAGE_ID",
        default=None,
        help=(
            "Print the full payload of a single message as JSON "
            "(extension's Open Payload action). Requires --provider."
        ),
    )

    return p


def _resolve_base_dir(args: argparse.Namespace) -> Path:
    if args.base_dir:
        return Path(args.base_dir).resolve()
    workspace = Path(args.workspace) if args.workspace else Path.cwd()
    return (workspace / DEFAULT_BASE_DIR).resolve()


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    intervention_flags = [
        ("--mark-failed", args.mark_failed),
        ("--force-reclaim", args.force_reclaim),
        ("--get-payload", args.get_payload),
    ]
    chosen = [(name, val) for name, val in intervention_flags if val]
    if len(chosen) > 1:
        parser.error(
            "intervention flags are mutually exclusive: "
            + ", ".join(name for name, _ in chosen)
        )

    base_dir = _resolve_base_dir(args)

    if chosen:
        if not args.provider:
            parser.error(
                f"{chosen[0][0]} requires --provider so we know which "
                f"queue.db to mutate"
            )
        flag, message_id = chosen[0]
        if flag == "--mark-failed":
            result = mark_failed(
                base_dir=base_dir,
                provider=args.provider,
                message_id=message_id,
            )
        elif flag == "--force-reclaim":
            result = force_reclaim(
                base_dir=base_dir,
                provider=args.provider,
                message_id=message_id,
            )
        else:  # --get-payload
            payload = get_payload(
                base_dir=base_dir,
                provider=args.provider,
                message_id=message_id,
            )
            if payload is None:
                result = {"ok": False, "error": f"unknown message_id: {message_id!r}"}
            else:
                result = {"ok": True, "message": payload}
        print(json.dumps(result, sort_keys=True))
        return 0 if result.get("ok") else 1

    payload = collect_status(
        base_dir=base_dir,
        provider_filter=args.provider,
        state_filter=args.state,
        limit=args.limit,
    )
    if args.format == "json":
        print(json.dumps(payload, sort_keys=True))
    else:
        _print_text(payload)
    return 0


if __name__ == "__main__":  # pragma: no cover — exercised via subprocess
    raise SystemExit(main())
