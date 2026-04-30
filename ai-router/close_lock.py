"""Concurrency lock for ``close_session``.

Two ``close_session`` invocations on the same session set must not run
simultaneously: they would both append ``closeout_requested`` events,
both attempt the same gate checks, and both attempt to flip lifecycle
state — a race that can leave the events ledger and ``session-state.json``
disagreeing about the truth.

The lock is a single file at
``<session-set-dir>/.close_session.lock`` containing a small JSON
record::

    {
      "pid": 12345,
      "worker_id": "<freeform tag>",
      "acquired_at": "2026-04-30T12:34:56.789012-04:00"
    }

Acquisition is best-effort but Windows-safe:

1. Attempt ``os.open`` with ``O_CREAT | O_EXCL | O_RDWR``. On success
   the caller holds the lock.
2. On collision, parse the existing record and decide whether to
   reclaim:

   - If ``acquired_at`` is older than :data:`STALE_LOCK_TTL_SECONDS`
     OR the PID is no longer running, the lock is *stale*; we delete
     it and retry once.
   - Otherwise the lock is held by a live peer; raise
     :class:`LockContention` so the caller can surface the result
     ``lock_contention`` and exit code 3.

The reclaim path emits a warning string (returned via the
``acquire_lock`` return value's ``warnings`` list) so the caller can
include it in the structured output and the human can see *why* the
peer was reclaimed.

This module does **not** depend on ``close_session`` — it is a leaf
utility. ``close_session`` imports it (not the other way around) so
tests can exercise the lock in isolation.
"""

from __future__ import annotations

import json
import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, List, Optional


LOCK_FILENAME = ".close_session.lock"
STALE_LOCK_TTL_SECONDS = 600  # 10 minutes per spec


class LockContention(Exception):
    """Raised when the lock is held by a live peer.

    Carries the parsed record (as a dict) under :attr:`record` so the
    caller can include the holder's PID / worker_id / acquired_at in
    the human-readable output.
    """

    def __init__(self, message: str, record: Optional[dict] = None) -> None:
        super().__init__(message)
        self.record = record or {}


@dataclass
class LockHandle:
    """Returned by :func:`acquire_lock`. Pass to :func:`release_lock`.

    ``warnings`` carries any reclaim diagnostics so the caller can
    surface them in the structured output. ``path`` is the absolute
    path to the lock file (useful in test diagnostics).
    """

    path: str
    pid: int
    worker_id: str
    acquired_at: str
    warnings: List[str] = field(default_factory=list)


def _lock_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, LOCK_FILENAME)


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def _parse_acquired_at(value: object) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        # Naive timestamps from older lock files: treat as UTC for the
        # purposes of TTL comparison rather than crash the gate.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _read_lock_record(path: str) -> Optional[dict]:
    """Return the parsed lock record, or None if absent / unparseable."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def _pid_running(pid: object) -> bool:
    """Best-effort cross-platform liveness probe.

    Returns ``True`` when we believe the PID names a live process.
    Returns ``False`` when we are confident it does not. Returns
    ``True`` (conservative) if we cannot tell — better to wait for the
    TTL to expire than to reclaim a real holder.

    Implementation:

    * On POSIX: ``os.kill(pid, 0)`` — raises ``ProcessLookupError`` for
      a dead PID, ``PermissionError`` for a live PID owned by another
      user (we treat that as live), and returns cleanly for a live PID
      we own.
    * On Windows: ``os.kill`` does not implement signal 0 the same way,
      so we use ``OpenProcess`` via ctypes. Failure to import / call
      falls back to the conservative "alive" answer.
    """
    if not isinstance(pid, int) or pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
        except Exception:
            return True

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        ERROR_INVALID_PARAMETER = 87
        ERROR_ACCESS_DENIED = 5

        # use_last_error=True attaches a private SetLastError slot so
        # GetLastError calls return the right error code from the
        # most recent call (Windows shares the global thread state
        # otherwise and the value is unreliable).
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.OpenProcess.argtypes = (
            wintypes.DWORD, wintypes.BOOL, wintypes.DWORD,
        )
        kernel32.OpenProcess.restype = wintypes.HANDLE
        kernel32.GetExitCodeProcess.argtypes = (
            wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD),
        )
        kernel32.GetExitCodeProcess.restype = wintypes.BOOL
        kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
        kernel32.CloseHandle.restype = wintypes.BOOL

        handle = kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid,
        )
        if not handle:
            err = ctypes.get_last_error()
            # Invalid parameter / no such process → dead. Access denied
            # → alive (a different user / SYSTEM process exists).
            if err == ERROR_INVALID_PARAMETER:
                return False
            if err == ERROR_ACCESS_DENIED:
                return True
            # Other errors: be conservative and treat as alive.
            return True
        try:
            exit_code = wintypes.DWORD()
            ok = kernel32.GetExitCodeProcess(
                handle, ctypes.byref(exit_code),
            )
            if not ok:
                return True
            return exit_code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return True
    return True


def _is_stale(record: dict, *, now: Optional[datetime] = None) -> bool:
    """Return True iff *record* is stale (TTL expired or PID dead)."""
    now = now or datetime.now().astimezone()
    acquired = _parse_acquired_at(record.get("acquired_at"))
    if acquired is None:
        # Unparseable timestamp — treat as stale; the record is junk.
        return True
    age = (now - acquired).total_seconds()
    if age >= STALE_LOCK_TTL_SECONDS:
        return True
    if not _pid_running(record.get("pid")):
        return True
    return False


def _write_lock_atomic(path: str, payload: dict) -> bool:
    """Create *path* atomically with O_EXCL semantics. Return True on success.

    Falsy return means the lock already exists. Any other OS-level
    failure (permission denied, disk full) is propagated as the
    underlying ``OSError`` so the caller can surface it rather than
    swallowing.
    """
    try:
        flags = os.O_CREAT | os.O_EXCL | os.O_RDWR
        if hasattr(os, "O_BINARY"):
            flags |= os.O_BINARY
        fd = os.open(path, flags, 0o644)
    except FileExistsError:
        return False
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.write("\n")
    except Exception:
        # Best-effort cleanup if write fails after the file was created.
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    return True


def acquire_lock(
    session_set_dir: str,
    *,
    worker_id: Optional[str] = None,
) -> LockHandle:
    """Acquire the close-session lock for *session_set_dir*.

    Returns a :class:`LockHandle` on success. Raises
    :class:`LockContention` when a live peer holds the lock.

    Stale-lock reclaim path: if the existing lock is stale per
    :func:`_is_stale`, it is deleted, a warning is recorded on the
    returned handle, and acquisition is retried exactly once. We only
    retry once — a second collision after a successful unlink almost
    certainly means another peer raced us and won.
    """
    path = _lock_path(session_set_dir)
    pid = os.getpid()
    worker = worker_id or f"close_session/{pid}"
    warnings: List[str] = []

    for attempt in range(2):
        payload = {
            "pid": pid,
            "worker_id": worker,
            "acquired_at": _now_iso(),
        }
        if _write_lock_atomic(path, payload):
            return LockHandle(
                path=path,
                pid=pid,
                worker_id=worker,
                acquired_at=payload["acquired_at"],
                warnings=warnings,
            )

        existing = _read_lock_record(path)
        if existing is not None and _is_stale(existing):
            old_pid = existing.get("pid")
            old_age_note = existing.get("acquired_at", "<no timestamp>")
            try:
                os.unlink(path)
            except FileNotFoundError:
                # Someone else cleaned it up; retry directly.
                pass
            except OSError as exc:
                raise LockContention(
                    f"lock at {path} is stale but could not be removed: {exc}",
                    record=existing,
                ) from exc
            warnings.append(
                f"WARNING: reclaimed stale lock (pid={old_pid}, "
                f"acquired_at={old_age_note})"
            )
            # Loop and retry the create.
            continue

        # Live peer holds it.
        raise LockContention(
            f"close_session lock at {path} is held by another process",
            record=existing or {},
        )

    # Two collisions in a row → treat as live contention.
    raise LockContention(
        f"close_session lock at {path} could not be acquired after retry",
        record=_read_lock_record(path) or {},
    )


def release_lock(handle: LockHandle) -> None:
    """Release the lock identified by *handle*.

    Best-effort: a missing lock file is ignored (someone else already
    cleaned up). A lock file with a different PID is *not* removed —
    that means the lock has been reclaimed by a peer and removing it
    would be incorrect. Any other ``OSError`` propagates.
    """
    if not os.path.isfile(handle.path):
        return
    record = _read_lock_record(handle.path)
    if record is None:
        # Junk file; remove it since we believed we held the lock.
        try:
            os.unlink(handle.path)
        except OSError:
            pass
        return
    if record.get("pid") != handle.pid:
        # Reclaimed by someone else; do not touch.
        return
    try:
        os.unlink(handle.path)
    except FileNotFoundError:
        pass


@contextmanager
def close_session_lock(
    session_set_dir: str, *, worker_id: Optional[str] = None,
) -> Iterator[LockHandle]:
    """Context manager: acquire on enter, release on exit.

    Re-raises :class:`LockContention` from acquisition; release errors
    are best-effort and do not propagate from the ``__exit__`` path
    (a release that fails because the file vanished is fine, and a
    release that fails for some other reason should not mask whatever
    exception is unwinding through the ``with`` block).
    """
    handle = acquire_lock(session_set_dir, worker_id=worker_id)
    try:
        yield handle
    finally:
        try:
            release_lock(handle)
        except OSError:
            pass
