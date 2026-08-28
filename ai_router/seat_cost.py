"""Measure real Copilot-seat spend from the CLI's local SQLite usage store.

The Copilot CLI reports no dollar cost at dispatch time, but it keeps a
per-turn usage store at ``~/.copilot/session-store.db``. This module prices
a set of CLI conversation ids against it:

    SUM(assistant_usage_events.total_nano_aiu) / 1e9 = AI credits
    credits / 100 = US dollars

Attribution is by conversation id, never by wall clock — a clock window
cannot attribute at all. The store is opened ``mode=ro`` and nothing else:
``immutable=1`` skips the WAL and has been shown to undercount a live store
by ~7%.

Statuses (closed vocabulary):

- ``measured``   — every requested id was found; the number is exact.
- ``floor``      — a real number that is known to be incomplete: some ids
                   were missing from the store, or the measurement includes
                   the caller's own still-running conversation (a session
                   cannot measure itself — its closing turns are not in the
                   store yet).
- ``unmeasured`` — no number at all (no store, unrecognized schema, or no
                   requested id present). ``credits`` is ``None``; an
                   absent measurement is never 0.0.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence

NANO_AIU_PER_CREDIT = 1_000_000_000
CREDITS_PER_USD = 100.0

STATUS_MEASURED = "measured"
STATUS_FLOOR = "floor"
STATUS_UNMEASURED = "unmeasured"
STATUSES = (STATUS_MEASURED, STATUS_FLOOR, STATUS_UNMEASURED)

#: Store schema versions this reader has been verified against. Anything
#: else is refused (unmeasured) rather than assumed compatible — the
#: columns belong to a private store and can change without notice.
SUPPORTED_SCHEMA_VERSIONS = (6,)

USAGE_TABLE = "assistant_usage_events"
SESSIONS_TABLE = "sessions"
REQUIRED_USAGE_COLUMNS = frozenset({"session_id", "total_nano_aiu"})

DEFAULT_STORE_RELPATH = Path(".copilot") / "session-store.db"

#: Exported by the Copilot CLI into every child process: the id of the
#: conversation that spawned it. Presence in a measured set makes the
#: result a floor (self-measurement).
SEAT_SESSION_ID_ENV = "COPILOT_AGENT_SESSION_ID"

# mode=ro and NOTHING else — see the module docstring on immutable=1.
_READ_URI_TEMPLATE = "file:{path}?mode=ro"

# SQLite's parameter ceiling is 999 on older builds; chunk well under it.
_ID_CHUNK = 400


@dataclass(frozen=True)
class SeatCost:
    """One measurement. ``credits``/``usd`` are ``None`` iff unmeasured —
    never 0.0 to mean "could not tell"; that distinction is the point."""

    status: str
    credits: Optional[float]
    event_count: int = 0
    session_ids: tuple = ()
    measured_session_ids: tuple = ()
    missing_session_ids: tuple = ()
    reason: Optional[str] = None

    @property
    def usd(self) -> Optional[float]:
        if self.credits is None:
            return None
        return self.credits / CREDITS_PER_USD

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "credits": self.credits,
            "usd": self.usd,
            "event_count": self.event_count,
            "session_ids": list(self.session_ids),
            "measured_session_ids": list(self.measured_session_ids),
            "missing_session_ids": list(self.missing_session_ids),
            "reason": self.reason,
        }


def resolve_store_path(
    explicit: Optional[str] = None, *, home: Optional[str] = None
) -> Optional[Path]:
    """Locate the usage store, or ``None``. *explicit* wins; otherwise
    ``<home>/.copilot/session-store.db``."""
    if explicit:
        candidate = Path(explicit).expanduser()
        return candidate if candidate.is_file() else None
    base = Path(home).expanduser() if home else Path.home()
    candidate = base / DEFAULT_STORE_RELPATH
    return candidate if candidate.is_file() else None


def _connect(path: Path) -> sqlite3.Connection:
    uri = _READ_URI_TEMPLATE.format(path=path.as_posix())
    return sqlite3.connect(uri, uri=True)


def check_store_shape(path: Optional[Path]) -> tuple[bool, Optional[str]]:
    """Look at the store before trusting a number out of it. Returns
    ``(ok, reason)``: openable, a supported schema_version, the usage table
    present with the columns actually read."""
    if path is None:
        return False, "no local usage store found"
    try:
        conn = _connect(path)
    except sqlite3.Error as exc:
        return False, f"store could not be opened: {exc}"
    try:
        try:
            row = conn.execute("SELECT version FROM schema_version").fetchone()
        except sqlite3.Error as exc:
            return False, f"store has no readable schema_version: {exc}"
        version = None
        if row is not None and len(row) >= 1:
            try:
                version = int(row[0])
            except (TypeError, ValueError):
                version = None
        if version is None:
            return False, "store reported no usable schema_version"
        if version not in SUPPORTED_SCHEMA_VERSIONS:
            return False, (
                f"store schema_version {version} is not one this reader has "
                f"been verified against {SUPPORTED_SCHEMA_VERSIONS}; refusing "
                "to price against a shape it may no longer have"
            )
        try:
            columns = {
                r[1] for r in conn.execute(f"PRAGMA table_info({USAGE_TABLE})")
            }
        except sqlite3.Error as exc:
            return False, f"store has no readable {USAGE_TABLE}: {exc}"
        if not columns:
            return False, f"store has no {USAGE_TABLE} table"
        missing = REQUIRED_USAGE_COLUMNS - columns
        if missing:
            return False, (
                f"{USAGE_TABLE} is missing column(s) {sorted(missing)}"
            )
        return True, None
    finally:
        conn.close()


def _chunks(items: Sequence[str], size: int) -> Iterable[Sequence[str]]:
    for start in range(0, len(items), size):
        yield items[start:start + size]


def _normalize_ids(value) -> tuple:
    if value is None:
        return ()
    if isinstance(value, str):
        value = [value]
    seen: list = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if text and text not in seen:
            seen.append(text)
    return tuple(seen)


def measure_conversations(
    conversation_ids,
    *,
    store_path: Optional[str] = None,
    home: Optional[str] = None,
    env: Optional[dict] = None,
) -> SeatCost:
    """Price the given CLI conversation ids against the local usage store.

    A conversation present in ``sessions`` with no usage rows is a genuine
    zero, not an absence. An id the store does not know at all makes the
    result a ``floor`` (the spend is real but incomplete), as does measuring
    the caller's own live conversation (``COPILOT_AGENT_SESSION_ID``).
    """
    ids = _normalize_ids(conversation_ids)
    if not ids:
        return SeatCost(
            status=STATUS_UNMEASURED, credits=None,
            reason="no conversation ids to measure",
        )

    path = resolve_store_path(store_path, home=home)
    ok, reason = check_store_shape(path)
    if not ok:
        return SeatCost(
            status=STATUS_UNMEASURED, credits=None,
            session_ids=ids, missing_session_ids=ids, reason=reason,
        )

    conn = _connect(path)
    try:
        total_nano = 0
        event_count = 0
        known: set = set()
        for chunk in _chunks(list(ids), _ID_CHUNK):
            marks = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT session_id, COALESCE(SUM(total_nano_aiu), 0), COUNT(*) "
                f"FROM {USAGE_TABLE} WHERE session_id IN ({marks}) "
                f"GROUP BY session_id",
                tuple(chunk),
            ).fetchall()
            for session_id, nano, count in rows:
                total_nano += int(nano or 0)
                event_count += int(count or 0)
                known.add(session_id)
            try:
                present = conn.execute(
                    f"SELECT id FROM {SESSIONS_TABLE} WHERE id IN ({marks})",
                    tuple(chunk),
                ).fetchall()
            except sqlite3.Error:
                present = []
            for (session_id,) in present:
                known.add(session_id)
    finally:
        conn.close()

    measured = tuple(i for i in ids if i in known)
    missing = tuple(i for i in ids if i not in known)
    if not measured:
        return SeatCost(
            status=STATUS_UNMEASURED, credits=None,
            session_ids=ids, missing_session_ids=missing,
            reason="none of the requested conversation ids are in the store",
        )

    credits = total_nano / NANO_AIU_PER_CREDIT
    environ = env if env is not None else os.environ
    own_id = (environ.get(SEAT_SESSION_ID_ENV) or "").strip()
    self_measured = bool(own_id) and own_id in measured

    if missing or self_measured:
        reasons = []
        if missing:
            reasons.append(
                f"{len(missing)} of {len(ids)} conversation id(s) not in the store"
            )
        if self_measured:
            reasons.append(
                "includes the caller's own live conversation, whose closing "
                "turns are not in the store yet"
            )
        return SeatCost(
            status=STATUS_FLOOR, credits=credits, event_count=event_count,
            session_ids=ids, measured_session_ids=measured,
            missing_session_ids=missing, reason="; ".join(reasons),
        )

    return SeatCost(
        status=STATUS_MEASURED, credits=credits, event_count=event_count,
        session_ids=ids, measured_session_ids=measured,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Price Copilot CLI conversation ids against the local "
                    "seat usage store."
    )
    parser.add_argument("ids", nargs="+", help="CLI conversation id(s)")
    parser.add_argument("--store", default=None, help="explicit store path")
    args = parser.parse_args(argv)

    result = measure_conversations(args.ids, store_path=args.store)
    if result.credits is None:
        print(f"status: {result.status} ({result.reason})")
    else:
        qualifier = f" ({result.reason})" if result.reason else ""
        print(
            f"status: {result.status}{qualifier}\n"
            f"credits: {result.credits:.3f}\n"
            f"usd: ${result.usd:.4f}\n"
            f"events: {result.event_count}"
        )
    return 0 if result.status != STATUS_UNMEASURED else 1


if __name__ == "__main__":
    raise SystemExit(main())
