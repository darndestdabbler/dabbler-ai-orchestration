"""SQLite-backed queue for cross-CLI verification handoffs.

One database per worker provider at ``<base_dir>/<provider>/queue.db``,
with a per-message state machine that survives worker crashes via lease
expiry + reclamation.

State machine
-------------
::

    new -> claimed -> completed
                   -> failed       (max_attempts reached on fail())
                   -> timed_out    (max_attempts reached on reclaim_expired())
    claimed -> new  (fail() with attempts < max_attempts;
                     reclaim_expired() with attempts < max_attempts)

Tables
------
* ``messages``    — one row per task; ``idempotency_key`` is unique.
* ``follow_ups``  — append-only multi-round dialogue. Schema lives here so
  Session 2 can wire the API on top without a second migration.

Invariants
----------
* ``state='new'``        ⇒ ``claimed_by``/``claimed_at``/``lease_expires_at``
  all NULL.
* ``state='claimed'``    ⇒ ``claimed_by``/``claimed_at``/``lease_expires_at``
  all NOT NULL.
* ``state='completed'``  ⇒ ``result`` NOT NULL, ``completed_at`` NOT NULL.
* ``state in ('failed','timed_out')`` ⇒ ``failure_reason`` NOT NULL,
  ``completed_at`` NOT NULL.
* ``idempotency_key`` is UNIQUE; a duplicate ``enqueue()`` raises
  :class:`DuplicateIdempotencyKeyError`. Callers that want
  enqueue-or-fetch semantics call :meth:`QueueDB.get_by_idempotency_key`
  first.
* ``last_heartbeat_at`` is NULL while ``state='claimed'`` and the
  worker has not yet sent a heartbeat. ``claim()`` deliberately does
  not initialise it — that lets observers distinguish "just claimed"
  from "heartbeat-seen" without adding a sixth state.

Crash safety
------------
WAL mode is enabled on first open. ``reclaim_expired()`` is the recovery
path: a worker that died mid-claim has its lease expire, the message
rolls back to ``new`` (or ``timed_out`` if attempts exhausted), and the
next ``claim()``er picks it up.

Concurrency
-----------
Every state-changing operation runs inside a ``BEGIN IMMEDIATE``
transaction, which acquires SQLite's writer lock for the duration. The
``claim`` race is therefore serialized at the DB level — two
simultaneous claimers will see exactly one winner and one ``None``
return. Read helpers run without a transaction.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, List, Optional


DEFAULT_BASE_DIR = "provider-queues"
DEFAULT_LEASE_SECONDS = 300
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_MAX_FOLLOWUP_ROUNDS = 3

MAX_FOLLOWUP_ROUNDS_REASON = "max_followup_rounds_exceeded"

VALID_STATES = ("new", "claimed", "completed", "failed", "timed_out")
TERMINAL_STATES = ("completed", "failed", "timed_out")

_PROVIDER_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


@dataclass
class QueueMessage:
    """In-memory view of one ``messages`` row.

    ``payload`` and ``result`` are stored as JSON on disk and exposed as
    dicts here; everything else is a verbatim column copy.
    """

    id: str
    from_provider: str
    to_provider: str
    task_type: str
    payload: dict
    idempotency_key: str
    state: str
    enqueued_at: str
    session_set: Optional[str] = None
    session_number: Optional[int] = None
    claimed_by: Optional[str] = None
    claimed_at: Optional[str] = None
    lease_expires_at: Optional[str] = None
    last_heartbeat_at: Optional[str] = None
    result: Optional[dict] = None
    failure_reason: Optional[str] = None
    attempts: int = 0
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    completed_at: Optional[str] = None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "QueueMessage":
        return cls(
            id=row["id"],
            from_provider=row["from_provider"],
            to_provider=row["to_provider"],
            task_type=row["task_type"],
            session_set=row["session_set"],
            session_number=row["session_number"],
            payload=json.loads(row["payload"]),
            idempotency_key=row["idempotency_key"],
            state=row["state"],
            claimed_by=row["claimed_by"],
            claimed_at=row["claimed_at"],
            lease_expires_at=row["lease_expires_at"],
            last_heartbeat_at=row["last_heartbeat_at"],
            result=json.loads(row["result"]) if row["result"] else None,
            failure_reason=row["failure_reason"],
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
            enqueued_at=row["enqueued_at"],
            completed_at=row["completed_at"],
        )


@dataclass
class FollowUp:
    """In-memory view of one ``follow_ups`` row.

    Follow-ups are an append-only multi-round dialogue attached to a
    message. ``id`` is the autoincrement primary key (also serves as
    chronological order within a message).
    """

    id: int
    message_id: str
    from_provider: str
    content: str
    created_at: str

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "FollowUp":
        return cls(
            id=row["id"],
            message_id=row["message_id"],
            from_provider=row["from_provider"],
            content=row["content"],
            created_at=row["created_at"],
        )


class ConcurrencyError(Exception):
    """A state-change call lost a race or did not own the claim it referenced."""


class MaxFollowUpRoundsExceeded(Exception):
    """An ``add_follow_up()`` call would exceed the configured round limit.

    When this is raised, the underlying message has already been
    transitioned to ``state='failed'`` with
    :data:`MAX_FOLLOWUP_ROUNDS_REASON` so the queue does not keep
    trying. The caller's job is to surface the situation for human
    escalation. The blocked follow-up is *not* persisted — the
    rationale is that capping the dialogue is a deliberate refusal,
    not a "this last message exists but we won't reply" record.
    """

    def __init__(self, message_id: str, current_count: int, max_rounds: int):
        super().__init__(
            f"follow-up rounds exceeded for message {message_id!r}: "
            f"existing={current_count} max={max_rounds}; "
            f"message has been failed with reason "
            f"{MAX_FOLLOWUP_ROUNDS_REASON!r}"
        )
        self.message_id = message_id
        self.current_count = current_count
        self.max_rounds = max_rounds


class ImportNotAllowedError(Exception):
    """``import_jsonl()`` refused because the target queue.db is not empty.

    Import is intended as a recovery / restoration operation against a
    fresh provider DB. Allowing it to overwrite a populated queue
    would silently destroy in-flight work. Callers can either point
    at a different provider name, delete the existing DB, or migrate
    by hand.
    """


class DuplicateIdempotencyKeyError(Exception):
    """``enqueue()`` was called with an ``idempotency_key`` that already exists.

    Carries the existing message's id in :attr:`existing_id` so callers
    that hit this can fetch the prior message without a second round-trip.
    """

    def __init__(self, idempotency_key: str, existing_id: str):
        super().__init__(
            f"idempotency_key {idempotency_key!r} already exists "
            f"(message id {existing_id!r})"
        )
        self.idempotency_key = idempotency_key
        self.existing_id = existing_id


_SCHEMA_DDL = """
CREATE TABLE IF NOT EXISTS messages (
    id                TEXT PRIMARY KEY,
    from_provider     TEXT NOT NULL,
    to_provider       TEXT NOT NULL,
    task_type         TEXT NOT NULL,
    session_set       TEXT,
    session_number    INTEGER,
    payload           TEXT NOT NULL,
    idempotency_key   TEXT NOT NULL UNIQUE,
    state             TEXT NOT NULL CHECK (state IN
                          ('new','claimed','completed','failed','timed_out')),
    claimed_by        TEXT,
    claimed_at        TEXT,
    lease_expires_at  TEXT,
    last_heartbeat_at TEXT,
    result            TEXT,
    failure_reason    TEXT,
    attempts          INTEGER NOT NULL DEFAULT 0,
    max_attempts      INTEGER NOT NULL DEFAULT 3,
    enqueued_at       TEXT NOT NULL,
    completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_state_enqueued
    ON messages (state, enqueued_at);

CREATE INDEX IF NOT EXISTS idx_messages_lease
    ON messages (state, lease_expires_at);

CREATE TABLE IF NOT EXISTS follow_ups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id    TEXT NOT NULL REFERENCES messages(id),
    from_provider TEXT NOT NULL,
    content       TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_message
    ON follow_ups (message_id, id);
"""


class QueueDB:
    """Per-provider SQLite-backed queue.

    One instance corresponds to a single ``<base_dir>/<provider>/queue.db``
    file. Methods open short-lived connections, so the class is safe to
    share across threads or to instantiate per-call from worker
    processes.
    """

    def __init__(
        self,
        provider: str,
        base_dir: str | os.PathLike[str] = DEFAULT_BASE_DIR,
    ):
        # Strict allowlist: alphanumerics, underscore, hyphen. Rejects "",
        # ".", "..", path separators, and anything else that could escape
        # the per-provider subdirectory (e.g. via "../other-provider").
        if not _PROVIDER_NAME_RE.fullmatch(provider or ""):
            raise ValueError(
                f"invalid provider name: {provider!r} "
                "(must match [A-Za-z0-9_-]+)"
            )
        self.provider = provider
        self.base_dir = Path(base_dir)
        self.db_path = self.base_dir / provider / "queue.db"
        # Defense-in-depth: even with the regex check, confirm the
        # resolved path stays under base_dir. Catches symlink games and
        # any future loosening of the regex.
        try:
            resolved_db = self.db_path.resolve()
            resolved_base = self.base_dir.resolve()
            resolved_db.relative_to(resolved_base)
        except ValueError:
            raise ValueError(
                f"resolved db path {resolved_db} escapes base_dir {resolved_base}"
            )
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, isolation_level=None, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_schema(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path, isolation_level=None, timeout=30.0)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            # Leave synchronous at SQLite's default of FULL. WAL + FULL
            # keeps the queue durable across OS crashes and power loss
            # — the queue is the canonical record of in-flight work
            # and "lost an enqueue/complete on power loss" would be a
            # silent correctness bug. NORMAL would be faster but
            # weakens that contract; if write latency ever becomes a
            # problem, address it via batching, not by downgrading
            # synchronous.
            conn.executescript(_SCHEMA_DDL)
        finally:
            conn.close()

    @contextmanager
    def _txn(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
                conn.execute("COMMIT")
            except Exception:
                try:
                    conn.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
                raise
        finally:
            conn.close()

    # ---------- core API ----------

    def enqueue(
        self,
        from_provider: str,
        task_type: str,
        payload: dict,
        idempotency_key: str,
        session_set: Optional[str] = None,
        session_number: Optional[int] = None,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    ) -> str:
        """Insert a new message; return its id.

        Raises :class:`DuplicateIdempotencyKeyError` if ``idempotency_key``
        already exists. Callers that want enqueue-or-fetch semantics
        should call :meth:`get_by_idempotency_key` first, or catch the
        exception and read ``.existing_id`` off it.
        """
        message_id = str(uuid.uuid4())
        now = _iso(_utc_now())
        with self._txn() as conn:
            existing = conn.execute(
                "SELECT id FROM messages WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            if existing:
                raise DuplicateIdempotencyKeyError(
                    idempotency_key, existing["id"]
                )
            conn.execute(
                """
                INSERT INTO messages (
                    id, from_provider, to_provider, task_type,
                    session_set, session_number, payload,
                    idempotency_key, state, max_attempts, enqueued_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
                """,
                (
                    message_id,
                    from_provider,
                    self.provider,
                    task_type,
                    session_set,
                    session_number,
                    json.dumps(payload),
                    idempotency_key,
                    max_attempts,
                    now,
                ),
            )
            return message_id

    def claim(
        self,
        worker_id: str,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> Optional[QueueMessage]:
        """Atomically pick the oldest ``new`` message and mark it claimed.

        Returns the claimed message, or ``None`` if the queue is empty.
        Two simultaneous claimers contend on SQLite's writer lock — at
        most one wins per available message; the loser sees ``None``.
        """
        now_dt = _utc_now()
        now = _iso(now_dt)
        lease = _iso(now_dt + timedelta(seconds=lease_seconds))
        with self._txn() as conn:
            # Tie-break on rowid (insertion order) rather than the UUID
            # primary key. enqueued_at on Windows can collapse to the
            # same value for back-to-back inserts, and a UUID secondary
            # sort would shuffle insertion order randomly.
            row = conn.execute(
                """
                SELECT id FROM messages
                WHERE state = 'new'
                ORDER BY enqueued_at ASC, rowid ASC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                return None
            updated = conn.execute(
                """
                UPDATE messages
                SET state = 'claimed',
                    claimed_by = ?,
                    claimed_at = ?,
                    lease_expires_at = ?,
                    last_heartbeat_at = NULL,
                    failure_reason = NULL
                WHERE id = ? AND state = 'new'
                """,
                (worker_id, now, lease, row["id"]),
            )
            if updated.rowcount == 0:
                return None  # lost the race; the WHERE filter caught it
            full = conn.execute(
                "SELECT * FROM messages WHERE id = ?", (row["id"],)
            ).fetchone()
            return QueueMessage.from_row(full)

    def heartbeat(
        self,
        message_id: str,
        worker_id: str,
        lease_seconds: int = DEFAULT_LEASE_SECONDS,
    ) -> None:
        """Extend the lease for a claimed message.

        Raises :class:`ConcurrencyError` if the message is not currently
        claimed by ``worker_id`` (because it was reclaimed, completed,
        failed, or claimed by someone else).
        """
        now_dt = _utc_now()
        now = _iso(now_dt)
        lease = _iso(now_dt + timedelta(seconds=lease_seconds))
        with self._txn() as conn:
            updated = conn.execute(
                """
                UPDATE messages
                SET lease_expires_at = ?, last_heartbeat_at = ?
                WHERE id = ? AND state = 'claimed' AND claimed_by = ?
                """,
                (lease, now, message_id, worker_id),
            )
            if updated.rowcount == 0:
                raise ConcurrencyError(
                    f"heartbeat denied: message {message_id} is not "
                    f"claimed by {worker_id!r}"
                )

    def complete(
        self,
        message_id: str,
        worker_id: str,
        result: dict,
    ) -> bool:
        """Mark a claimed message complete. Idempotent on already-completed.

        Returns ``True`` if this call performed the transition; ``False``
        if the message was already in ``completed`` state. Raises
        :class:`ConcurrencyError` if the message is in any other state
        or is claimed by a different worker.
        """
        now = _iso(_utc_now())
        with self._txn() as conn:
            row = conn.execute(
                "SELECT state, claimed_by FROM messages WHERE id = ?",
                (message_id,),
            ).fetchone()
            if row is None:
                raise ConcurrencyError(
                    f"complete: unknown message {message_id}"
                )
            if row["state"] == "completed":
                return False
            if row["state"] != "claimed" or row["claimed_by"] != worker_id:
                raise ConcurrencyError(
                    f"complete denied: message {message_id} "
                    f"state={row['state']!r} "
                    f"claimed_by={row['claimed_by']!r} "
                    f"(caller={worker_id!r})"
                )
            conn.execute(
                """
                UPDATE messages
                SET state = 'completed',
                    result = ?,
                    completed_at = ?,
                    failure_reason = NULL
                WHERE id = ?
                """,
                (json.dumps(result), now, message_id),
            )
            return True

    def fail(
        self,
        message_id: str,
        worker_id: str,
        reason: str,
    ) -> str:
        """Mark a claimed message failed.

        Bumps ``attempts``. Returns the resulting state — ``'new'`` if
        the message will be retried (``attempts < max_attempts``),
        ``'failed'`` if it has exhausted its retry budget. Raises
        :class:`ConcurrencyError` if the caller does not own the claim.
        """
        now = _iso(_utc_now())
        with self._txn() as conn:
            row = conn.execute(
                """
                SELECT state, claimed_by, attempts, max_attempts
                FROM messages WHERE id = ?
                """,
                (message_id,),
            ).fetchone()
            if row is None:
                raise ConcurrencyError(f"fail: unknown message {message_id}")
            if row["state"] != "claimed" or row["claimed_by"] != worker_id:
                raise ConcurrencyError(
                    f"fail denied: message {message_id} "
                    f"state={row['state']!r} "
                    f"claimed_by={row['claimed_by']!r} "
                    f"(caller={worker_id!r})"
                )
            new_attempts = row["attempts"] + 1
            if new_attempts >= row["max_attempts"]:
                conn.execute(
                    """
                    UPDATE messages
                    SET state = 'failed',
                        attempts = ?,
                        failure_reason = ?,
                        completed_at = ?,
                        claimed_by = NULL,
                        claimed_at = NULL,
                        lease_expires_at = NULL
                    WHERE id = ?
                    """,
                    (new_attempts, reason, now, message_id),
                )
                return "failed"
            conn.execute(
                """
                UPDATE messages
                SET state = 'new',
                    attempts = ?,
                    failure_reason = ?,
                    claimed_by = NULL,
                    claimed_at = NULL,
                    lease_expires_at = NULL,
                    last_heartbeat_at = NULL
                WHERE id = ?
                """,
                (new_attempts, reason, message_id),
            )
            return "new"

    def reclaim_expired(self) -> int:
        """Recover crashed workers' messages.

        Finds ``claimed`` messages whose lease has expired, increments
        ``attempts``, and either rolls them back to ``new`` (if attempts
        remain) or moves them to ``timed_out``. Returns the count of
        messages reclaimed.
        """
        now = _iso(_utc_now())
        with self._txn() as conn:
            expired = conn.execute(
                """
                SELECT id, attempts, max_attempts FROM messages
                WHERE state = 'claimed' AND lease_expires_at < ?
                """,
                (now,),
            ).fetchall()
            if not expired:
                return 0
            for row in expired:
                new_attempts = row["attempts"] + 1
                if new_attempts >= row["max_attempts"]:
                    conn.execute(
                        """
                        UPDATE messages
                        SET state = 'timed_out',
                            attempts = ?,
                            failure_reason = 'lease expired without heartbeat',
                            completed_at = ?,
                            claimed_by = NULL,
                            claimed_at = NULL,
                            lease_expires_at = NULL
                        WHERE id = ?
                        """,
                        (new_attempts, now, row["id"]),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE messages
                        SET state = 'new',
                            attempts = ?,
                            failure_reason = 'lease expired without heartbeat',
                            claimed_by = NULL,
                            claimed_at = NULL,
                            lease_expires_at = NULL,
                            last_heartbeat_at = NULL
                        WHERE id = ?
                        """,
                        (new_attempts, row["id"]),
                    )
            return len(expired)

    # ---------- read helpers ----------

    def get_message(self, message_id: str) -> Optional[QueueMessage]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
            return QueueMessage.from_row(row) if row else None
        finally:
            conn.close()

    def get_by_idempotency_key(
        self, idempotency_key: str
    ) -> Optional[QueueMessage]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM messages WHERE idempotency_key = ?",
                (idempotency_key,),
            ).fetchone()
            return QueueMessage.from_row(row) if row else None
        finally:
            conn.close()

    def count_by_state(self) -> dict[str, int]:
        """Return {state: count} across all states the table currently holds."""
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT state, COUNT(*) AS n FROM messages GROUP BY state"
            ).fetchall()
            return {r["state"]: r["n"] for r in rows}
        finally:
            conn.close()

    # ---------- follow-ups ----------

    def add_follow_up(
        self,
        message_id: str,
        from_provider: str,
        content: str,
        max_rounds: int = DEFAULT_MAX_FOLLOWUP_ROUNDS,
    ) -> int:
        """Append a follow-up to ``message_id``; return its row id.

        Enforces ``max_rounds`` as a cap on the *count* of follow-ups
        attached to one message. When adding this follow-up would
        push the count over the cap, the call:

        1. Does NOT insert the follow-up.
        2. Transitions the underlying message to ``state='failed'``
           with reason :data:`MAX_FOLLOWUP_ROUNDS_REASON` (unless it
           is already in a terminal state, in which case the state is
           left alone — failure is recorded only when meaningful).
        3. Raises :class:`MaxFollowUpRoundsExceeded` so the caller
           knows to surface the message for human escalation.

        ``max_rounds`` is a per-call argument because it depends on
        consumer policy, not on the queue's persistent configuration.
        Callers that want a different cap (e.g. ``1`` for
        single-shot, or ``0`` to forbid follow-ups entirely) pass it
        explicitly.
        """
        if max_rounds < 0:
            raise ValueError(f"max_rounds must be >= 0, got {max_rounds}")
        now = _iso(_utc_now())
        # The overflow path needs to commit a state transition AND
        # then raise. Doing both inside one ``_txn()`` would roll back
        # the UPDATE (the raise triggers rollback). So we capture the
        # decision inside the transaction, let the transaction commit,
        # then raise outside it.
        overflow_count: Optional[int] = None
        with self._txn() as conn:
            msg_row = conn.execute(
                "SELECT state FROM messages WHERE id = ?", (message_id,)
            ).fetchone()
            if msg_row is None:
                raise ValueError(f"unknown message_id: {message_id!r}")
            count_row = conn.execute(
                "SELECT COUNT(*) AS n FROM follow_ups WHERE message_id = ?",
                (message_id,),
            ).fetchone()
            current = count_row["n"]
            if current >= max_rounds:
                # Block the follow-up; escalate the message if it's
                # not already in a terminal state. We do NOT bump
                # attempts here — round-limit overflow is not a retry
                # failure; it's a hard human-escalation signal.
                if msg_row["state"] not in TERMINAL_STATES:
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
                        (MAX_FOLLOWUP_ROUNDS_REASON, now, message_id),
                    )
                overflow_count = current
            else:
                cur = conn.execute(
                    """
                    INSERT INTO follow_ups (message_id, from_provider, content, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (message_id, from_provider, content, now),
                )
                return cur.lastrowid  # type: ignore[return-value]
        # Transaction committed; now signal overflow to the caller.
        raise MaxFollowUpRoundsExceeded(
            message_id=message_id,
            current_count=overflow_count,  # type: ignore[arg-type]
            max_rounds=max_rounds,
        )

    def read_follow_ups(self, message_id: str) -> List[FollowUp]:
        """Return all follow-ups for ``message_id`` in chronological order."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT id, message_id, from_provider, content, created_at
                FROM follow_ups
                WHERE message_id = ?
                ORDER BY id ASC
                """,
                (message_id,),
            ).fetchall()
            return [FollowUp.from_row(r) for r in rows]
        finally:
            conn.close()

    def count_follow_ups(self, message_id: str) -> int:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM follow_ups WHERE message_id = ?",
                (message_id,),
            ).fetchone()
            return row["n"]
        finally:
            conn.close()

    # ---------- export / import (audit + recovery) ----------

    def export_jsonl(self, out: Iterator[str] | None = None) -> List[str]:
        """Emit every message and follow-up as JSONL records.

        Returns a list of JSON-encoded lines (without trailing
        newlines). The format is deterministic and suitable for
        committing to git for audit:

        * messages are emitted in (``enqueued_at``, ``rowid``) order
        * each message is followed immediately by its follow-ups in
          ``follow_ups.id`` order
        * each line is a single JSON object whose ``type`` is
          ``"message"`` or ``"follow_up"``
        * keys within each object are sorted alphabetically and the
          encoder uses compact separators, so the same database
          state always produces byte-identical output

        The ``out`` parameter is reserved for a future streaming
        variant; in the current implementation it is ignored.
        """
        del out  # reserved for streaming in a future revision
        conn = self._connect()
        try:
            messages = conn.execute(
                """
                SELECT id, from_provider, to_provider, task_type,
                       session_set, session_number, payload,
                       idempotency_key, state, claimed_by, claimed_at,
                       lease_expires_at, last_heartbeat_at, result,
                       failure_reason, attempts, max_attempts,
                       enqueued_at, completed_at, rowid AS rowid
                FROM messages
                ORDER BY enqueued_at ASC, rowid ASC
                """
            ).fetchall()
            lines: List[str] = []
            for m in messages:
                msg_obj = {
                    "type": "message",
                    "id": m["id"],
                    "from_provider": m["from_provider"],
                    "to_provider": m["to_provider"],
                    "task_type": m["task_type"],
                    "session_set": m["session_set"],
                    "session_number": m["session_number"],
                    # payload/result are JSON-on-disk; decode so the
                    # exported line carries structured data, not a
                    # double-encoded string.
                    "payload": json.loads(m["payload"]),
                    "idempotency_key": m["idempotency_key"],
                    "state": m["state"],
                    "claimed_by": m["claimed_by"],
                    "claimed_at": m["claimed_at"],
                    "lease_expires_at": m["lease_expires_at"],
                    "last_heartbeat_at": m["last_heartbeat_at"],
                    "result": json.loads(m["result"]) if m["result"] else None,
                    "failure_reason": m["failure_reason"],
                    "attempts": m["attempts"],
                    "max_attempts": m["max_attempts"],
                    "enqueued_at": m["enqueued_at"],
                    "completed_at": m["completed_at"],
                }
                lines.append(
                    json.dumps(msg_obj, sort_keys=True, separators=(",", ":"))
                )
                fu_rows = conn.execute(
                    """
                    SELECT id, message_id, from_provider, content, created_at
                    FROM follow_ups
                    WHERE message_id = ?
                    ORDER BY id ASC
                    """,
                    (m["id"],),
                ).fetchall()
                for f in fu_rows:
                    fu_obj = {
                        "type": "follow_up",
                        "id": f["id"],
                        "message_id": f["message_id"],
                        "from_provider": f["from_provider"],
                        "content": f["content"],
                        "created_at": f["created_at"],
                    }
                    lines.append(
                        json.dumps(fu_obj, sort_keys=True, separators=(",", ":"))
                    )
            return lines
        finally:
            conn.close()

    def export_jsonl_to_path(self, path: str | os.PathLike[str]) -> int:
        """Convenience wrapper: write export_jsonl() output to ``path``.

        Returns the number of lines written. Always uses UTF-8 with
        LF line endings so exports diff cleanly across platforms.
        """
        lines = self.export_jsonl()
        text = "\n".join(lines)
        if lines:
            text += "\n"
        Path(path).write_text(text, encoding="utf-8", newline="\n")
        return len(lines)

    def import_jsonl(self, lines: Iterator[str]) -> tuple[int, int]:
        """Restore from a JSONL dump produced by :meth:`export_jsonl`.

        Returns ``(messages_imported, follow_ups_imported)``. Refuses
        with :class:`ImportNotAllowedError` if the target queue.db
        already contains any messages — import is for restoring an
        empty / fresh DB, not for merging.

        Each record's ``type`` field selects ``messages`` or
        ``follow_ups``. Lines that are blank or start with ``#`` are
        ignored, so callers can hand-edit dumps if needed. Unknown
        ``type`` values raise ``ValueError``.
        """
        with self._txn() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) AS n FROM messages"
            ).fetchone()
            if existing["n"] > 0:
                raise ImportNotAllowedError(
                    f"target queue.db at {self.db_path} already contains "
                    f"{existing['n']} messages; import refuses to merge"
                )
            msg_count = 0
            fu_count = 0
            for raw in lines:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                obj = json.loads(line)
                kind = obj.get("type")
                if kind == "message":
                    conn.execute(
                        """
                        INSERT INTO messages (
                            id, from_provider, to_provider, task_type,
                            session_set, session_number, payload,
                            idempotency_key, state, claimed_by, claimed_at,
                            lease_expires_at, last_heartbeat_at, result,
                            failure_reason, attempts, max_attempts,
                            enqueued_at, completed_at
                        ) VALUES (
                            :id, :from_provider, :to_provider, :task_type,
                            :session_set, :session_number, :payload,
                            :idempotency_key, :state, :claimed_by, :claimed_at,
                            :lease_expires_at, :last_heartbeat_at, :result,
                            :failure_reason, :attempts, :max_attempts,
                            :enqueued_at, :completed_at
                        )
                        """,
                        {
                            "id": obj["id"],
                            "from_provider": obj["from_provider"],
                            "to_provider": obj["to_provider"],
                            "task_type": obj["task_type"],
                            "session_set": obj.get("session_set"),
                            "session_number": obj.get("session_number"),
                            "payload": json.dumps(obj["payload"]),
                            "idempotency_key": obj["idempotency_key"],
                            "state": obj["state"],
                            "claimed_by": obj.get("claimed_by"),
                            "claimed_at": obj.get("claimed_at"),
                            "lease_expires_at": obj.get("lease_expires_at"),
                            "last_heartbeat_at": obj.get("last_heartbeat_at"),
                            "result": (
                                json.dumps(obj["result"])
                                if obj.get("result") is not None
                                else None
                            ),
                            "failure_reason": obj.get("failure_reason"),
                            "attempts": obj.get("attempts", 0),
                            "max_attempts": obj.get(
                                "max_attempts", DEFAULT_MAX_ATTEMPTS
                            ),
                            "enqueued_at": obj["enqueued_at"],
                            "completed_at": obj.get("completed_at"),
                        },
                    )
                    msg_count += 1
                elif kind == "follow_up":
                    # Preserve the original autoincrement id so a
                    # round-trip export-then-import is byte-identical.
                    conn.execute(
                        """
                        INSERT INTO follow_ups (
                            id, message_id, from_provider, content, created_at
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            obj["id"],
                            obj["message_id"],
                            obj["from_provider"],
                            obj["content"],
                            obj["created_at"],
                        ),
                    )
                    fu_count += 1
                else:
                    raise ValueError(
                        f"unknown record type {kind!r} in import stream"
                    )
            return msg_count, fu_count

    def import_jsonl_from_path(
        self, path: str | os.PathLike[str]
    ) -> tuple[int, int]:
        """Convenience wrapper: read JSONL from ``path`` and import."""
        with open(path, "r", encoding="utf-8") as f:
            return self.import_jsonl(f)


# ---------- CLI ----------

def _build_arg_parser():
    import argparse

    p = argparse.ArgumentParser(
        prog="queue_db",
        description=(
            "Inspect and manage SQLite-backed provider queues. The "
            "primary use case is git-trackable audit dumps via "
            "--export-jsonl and recovery via --import-jsonl."
        ),
    )
    p.add_argument(
        "--base-dir",
        default=DEFAULT_BASE_DIR,
        help=f"Queue root (default: {DEFAULT_BASE_DIR}).",
    )
    sub = p.add_subparsers(dest="command", required=True)

    exp = sub.add_parser(
        "export-jsonl",
        help="Dump a provider's queue as deterministic JSONL.",
    )
    exp.add_argument("provider", help="Provider name (e.g. claude, gpt-5-4).")
    exp.add_argument(
        "--out",
        help="Path to write the JSONL dump. Defaults to stdout.",
    )

    imp = sub.add_parser(
        "import-jsonl",
        help="Restore a provider's queue from a JSONL dump (refuses non-empty target).",
    )
    imp.add_argument("provider", help="Provider name.")
    imp.add_argument(
        "--in",
        dest="in_path",
        required=True,
        help="Path to the JSONL dump to import.",
    )
    return p


def main(argv: Optional[list[str]] = None) -> int:
    import sys

    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    qdb = QueueDB(provider=args.provider, base_dir=args.base_dir)
    if args.command == "export-jsonl":
        lines = qdb.export_jsonl()
        if args.out:
            count = qdb.export_jsonl_to_path(args.out)
            print(f"wrote {count} lines to {args.out}", file=sys.stderr)
        else:
            for line in lines:
                print(line)
        return 0
    if args.command == "import-jsonl":
        msg_count, fu_count = qdb.import_jsonl_from_path(args.in_path)
        print(
            f"imported {msg_count} messages and {fu_count} follow-ups "
            f"into {qdb.db_path}",
            file=sys.stderr,
        )
        return 0
    parser.error(f"unknown command: {args.command}")
    return 2  # unreachable; argparse exits


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
