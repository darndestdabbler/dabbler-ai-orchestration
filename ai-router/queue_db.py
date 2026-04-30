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
from typing import Iterator, Optional


DEFAULT_BASE_DIR = "provider-queues"
DEFAULT_LEASE_SECONDS = 300
DEFAULT_MAX_ATTEMPTS = 3

VALID_STATES = ("new", "claimed", "completed", "failed", "timed_out")

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


class ConcurrencyError(Exception):
    """A state-change call lost a race or did not own the claim it referenced."""


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
