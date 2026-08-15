"""Concurrency lock for session-set lifecycle writers.

Two writers on the same session set must not run simultaneously: they
would both read/check/write the same ``session-state.json`` snapshot
and append overlapping events to ``session-events.jsonl`` — a race
that can leave the events ledger and the snapshot disagreeing about
the truth.

Set 036 Session 1 (Q5 hard requirement) renamed the lock from
``.close_session.lock`` to ``.lifecycle.lock`` and extended its
acquirers from ``close_session`` alone to both ``start_session`` and
``close_session``. The lock now serializes the full lifecycle window
— from the boundary "I am about to take this session" through "I am
flipping the session to closed."

Cross-version interop during the R1 alias window
------------------------------------------------

Pre-Set-036 ``close_session`` deployments (consumer repos still
pinned to ``dabbler-ai-router < 0.7.0``) read/write only the legacy
``.close_session.lock`` filename. To actually serialize against them
during the alias window, **every acquisition holds BOTH filenames**
atomically: the new canonical ``.lifecycle.lock`` plus the legacy
``.close_session.lock``. A legacy writer trying to take the
``.close_session.lock`` mutex sees our hold and backs off; a new
writer sees the same hold via either path. This dual-hold is the
mitigation for the spec R1 risk (the read-only legacy sweep is not
sufficient — flagged by the cross-provider verifier on the Set 036
Session 1 Round A pass).

Both filenames carry the same small JSON record::

    {
      "pid": 12345,
      "worker_id": "<freeform tag>",
      "acquired_at": "2026-04-30T12:34:56.789012-04:00"
    }

Acquisition (per :func:`acquire_lock`) is best-effort but
Windows-safe:

1. Sweep any stale ``.close_session.lock`` (dead PID OR
   ``acquired_at`` older than :data:`STALE_LOCK_TTL_SECONDS`). A
   live legacy holder raises :class:`LockContention` — they ARE the
   peer we contend with.
2. Atomically create ``.lifecycle.lock`` via ``os.open`` with
   ``O_CREAT | O_EXCL | O_RDWR``. On collision, attempt stale
   reclaim (one retry) before raising LockContention.
3. Atomically create ``.close_session.lock`` (legacy-interop
   mutex). On collision after step 2's success, roll back the
   new-name file and treat as contention.

Release reverses the order: ``.lifecycle.lock`` first, then
``.close_session.lock``. A crash between the two leaves an orphan
that the next acquirer's stale-check reaps via TTL or dead-PID
probe.

The reclaim path emits a warning string (returned via the
``acquire_lock`` return value's ``warnings`` list) so the caller can
include it in the structured output and the human can see *why* the
peer was reclaimed.

For callers that want bounded blocking rather than immediate-failure
semantics (Set 036 Q5 — the hybrid migration safety contract),
:func:`acquire_lock_with_timeout` polls for up to ``timeout_seconds``
before raising :class:`LockContention`. ``start_session`` uses this
path with a default 30s window so a normal sequential workflow that
races a still-running ``close_session`` finishes cleanly without an
operator-visible failure.

Caller-visible exit-code mapping when LockContention propagates:

* ``start_session`` → ``EXIT_LOCK_CONTENTION = 5`` (Set 036 Session 1)
* ``close_session`` → exit code ``3`` (``lock_contention`` result)

The two callers pick different codes because they have independent
exit-code spaces; the lock helper itself raises a single exception
type and lets each CLI map it.

This module does **not** depend on ``close_session`` — it is a leaf
utility. ``close_session`` and ``start_session`` import it (not the
other way around) so tests can exercise the lock in isolation.
"""

from __future__ import annotations

import json
import os
import sys
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator, List, Optional


# Set 036 Session 1: lifecycle lock. The constant is kept as
# ``LOCK_FILENAME`` for backwards compatibility with importers (the
# existing test suite and gate_checks reference this name) but now
# resolves to ``.lifecycle.lock``. ``LEGACY_LOCK_FILENAME`` is the
# pre-Set-036 name, honored on read only — see :func:`_legacy_lock_path`.
LOCK_FILENAME = ".lifecycle.lock"
LEGACY_LOCK_FILENAME = ".close_session.lock"
STALE_LOCK_TTL_SECONDS = 600  # 10 minutes per spec
DEFAULT_ACQUIRE_TIMEOUT_SECONDS = 30  # Set 036 Q5 — bounded blocking default
_ACQUIRE_POLL_INTERVAL_SECONDS = 0.25


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


def _legacy_lock_path(session_set_dir: str) -> str:
    """Path to the pre-Set-036 ``.close_session.lock`` filename.

    Honored on read for one release per Set 036 spec R1: scripts and
    monitoring that reference the legacy path see a graceful migration
    window. New writes always go to :func:`_lock_path`.
    """
    return os.path.join(session_set_dir, LEGACY_LOCK_FILENAME)


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


def _try_create_with_stale_reclaim(
    path: str,
    payload: dict,
    warnings: List[str],
    label: str,
) -> bool:
    """Attempt an atomic create with one stale-reclaim retry.

    Returns True if the file now exists and is owned by us, False if
    a live peer holds the path. The reclaim path appends a warning
    line to *warnings* so the caller can include it in the returned
    handle. *label* identifies the file in the warning text
    ("lifecycle.lock" vs ".close_session.lock") so a mixed-failure
    diagnostic surface stays readable.

    Raises :class:`LockContention` when a stale-but-unremovable file
    blocks acquisition (the OS reports the file present, but we
    cannot unlink it — usually a permission anomaly).
    """
    for _attempt in range(2):
        if _write_lock_atomic(path, payload):
            return True
        existing = _read_lock_record(path)
        if existing is None or not _is_stale(existing):
            return False
        old_pid = existing.get("pid")
        old_age_note = existing.get("acquired_at", "<no timestamp>")
        try:
            os.unlink(path)
        except FileNotFoundError:
            # Someone else cleaned it up; retry directly.
            pass
        except OSError as exc:
            raise LockContention(
                f"lock at {path} is stale but could not be removed: "
                f"{exc}",
                record=existing,
            ) from exc
        warnings.append(
            f"WARNING: reclaimed stale lock at {label} (pid={old_pid}, "
            f"acquired_at={old_age_note})"
        )
    return False


def acquire_lock(
    session_set_dir: str,
    *,
    worker_id: Optional[str] = None,
) -> LockHandle:
    """Acquire the lifecycle lock for *session_set_dir*.

    Returns a :class:`LockHandle` on success. Raises
    :class:`LockContention` when a live peer holds the lock.

    Set 036 Session 1 dual-acquisition: during the R1 alias window
    we hold BOTH the new ``.lifecycle.lock`` and the legacy
    ``.close_session.lock`` filenames so a pre-Set-036
    ``close_session`` that still reads/writes only the legacy
    filename actually serializes against us. Acquisition order:

    1. New-name ``.lifecycle.lock`` first — the canonical Set-036
       gate. Stale-reclaim retry on collision.
    2. Legacy ``.close_session.lock`` second — the interop gate.
       Stale-reclaim retry on collision; if a live peer (typically
       a pre-Set-036 close_session) holds it, roll back the
       new-name file and raise :class:`LockContention`.

    The dual-hold means the returned ``LockHandle.path`` is the
    new-name file (``.lifecycle.lock``) — callers that need to read
    the legacy file go through :data:`LEGACY_LOCK_FILENAME` directly.
    :func:`release_lock` deletes both files; partial releases are
    benign (the surviving file gets swept by the next acquirer's
    stale check).

    Stale-lock reclaim path: a file whose ``acquired_at`` is older
    than :data:`STALE_LOCK_TTL_SECONDS` OR whose PID is no longer
    running is deleted in place, a warning is recorded on the
    returned handle, and the create is retried exactly once. We
    only retry once — a second collision after a successful unlink
    almost certainly means another peer raced us and won.
    """
    new_path = _lock_path(session_set_dir)
    legacy_path = _legacy_lock_path(session_set_dir)
    pid = os.getpid()
    worker = worker_id or f"lifecycle/{pid}"
    warnings: List[str] = []
    payload = {
        "pid": pid,
        "worker_id": worker,
        "acquired_at": _now_iso(),
    }

    # Step 1: acquire the new canonical file. A live peer here is a
    # Set-036+ writer holding the same set's lock; refuse cleanly.
    if not _try_create_with_stale_reclaim(
        new_path, payload, warnings, label=LOCK_FILENAME,
    ):
        existing = _read_lock_record(new_path) or {}
        raise LockContention(
            f"lifecycle lock at {new_path} is held by another process",
            record=existing,
        )

    # Step 2: acquire the legacy-interop file. A live peer here is
    # typically a pre-Set-036 close_session; refusing serializes the
    # hybrid-migration window correctly. Roll back the new-name file
    # so the caller's failure does not leak a half-acquired lock.
    if not _try_create_with_stale_reclaim(
        legacy_path, payload, warnings, label=LEGACY_LOCK_FILENAME,
    ):
        existing = _read_lock_record(legacy_path) or {}
        # Roll back the new-name acquisition. Best-effort: a vanish
        # between create and unlink is benign (someone reaped it).
        try:
            os.unlink(new_path)
        except FileNotFoundError:
            pass
        except OSError:
            # Leaking the new-name file is preferable to crashing the
            # caller; the next acquirer's stale check will reap it
            # when our PID disappears.
            pass
        raise LockContention(
            f"legacy-interop lock at {legacy_path} is held by another "
            "process (likely a pre-Set-036 close_session); refusing "
            "to acquire the lifecycle lock until the legacy holder "
            "releases",
            record=existing,
        )

    return LockHandle(
        path=new_path,
        pid=pid,
        worker_id=worker,
        acquired_at=payload["acquired_at"],
        warnings=warnings,
    )


def acquire_lock_with_timeout(
    session_set_dir: str,
    *,
    timeout_seconds: float = DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
    worker_id: Optional[str] = None,
    poll_interval_seconds: float = _ACQUIRE_POLL_INTERVAL_SECONDS,
) -> LockHandle:
    """Acquire the lifecycle lock, polling up to *timeout_seconds*.

    Set 036 Session 1 (Q5 hard requirement): ``start_session`` uses
    this entry point so a normal sequential workflow that briefly
    races a still-running ``close_session`` finishes cleanly instead
    of producing an operator-visible failure. The poll interval is
    short (250 ms) — lock holds are bounded by the duration of one
    boundary write, so the typical resolution is sub-second.

    Returns the :class:`LockHandle` on success. Raises
    :class:`LockContention` after the timeout elapses without a
    successful acquisition; the record on the exception is the last
    observed holder (useful for the operator-facing error message).

    A ``timeout_seconds <= 0`` short-circuits to a single immediate
    attempt — equivalent to :func:`acquire_lock` — and is the recipe
    for tests that want to assert "no waiting" semantics.
    """
    if timeout_seconds <= 0:
        return acquire_lock(session_set_dir, worker_id=worker_id)

    deadline = time.monotonic() + timeout_seconds
    last_record: dict = {}
    last_message = ""
    while True:
        try:
            return acquire_lock(session_set_dir, worker_id=worker_id)
        except LockContention as exc:
            last_record = exc.record or {}
            last_message = str(exc)
            now = time.monotonic()
            if now >= deadline:
                raise LockContention(
                    f"{last_message} (waited {timeout_seconds:.1f}s)",
                    record=last_record,
                ) from None
            remaining = deadline - now
            time.sleep(min(poll_interval_seconds, remaining))


def acquire_file_mutex(
    lock_path: str,
    *,
    timeout_seconds: float = DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
    worker_id: Optional[str] = None,
    poll_interval_seconds: float = _ACQUIRE_POLL_INTERVAL_SECONDS,
) -> LockHandle:
    """Acquire a SINGLE-file mutex at *lock_path*, polling up to the timeout.

    Set 121 S2. The lifecycle lock above is scoped to a session-set
    directory and carries the Set-036 dual-hold. Repo-level append-only
    state that is not owned by any one session set — the guidance usage
    ledger is the first — needs the same **stale-reclaim and TTL**
    discipline without the dual-hold, so this entry point exposes the
    proven primitive rather than letting a second module grow its own
    copy of it. There is exactly one lock-acquisition implementation in
    this package, and this is the seam onto it.

    Raises :class:`LockContention` when a live peer still holds the file
    after *timeout_seconds*. ``timeout_seconds <= 0`` makes a single
    immediate attempt.
    """
    pid = os.getpid()
    worker = worker_id or f"mutex/{pid}"
    label = os.path.basename(lock_path)
    deadline = time.monotonic() + max(timeout_seconds, 0.0)
    while True:
        warnings: List[str] = []
        payload = {
            "pid": pid,
            "worker_id": worker,
            "acquired_at": _now_iso(),
        }
        parent = os.path.dirname(lock_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        if _try_create_with_stale_reclaim(lock_path, payload, warnings, label=label):
            return LockHandle(
                path=lock_path,
                pid=pid,
                worker_id=worker,
                acquired_at=payload["acquired_at"],
                warnings=warnings,
            )
        existing = _read_lock_record(lock_path) or {}
        now = time.monotonic()
        if timeout_seconds <= 0 or now >= deadline:
            raise LockContention(
                f"lock at {lock_path} is held by another process"
                + ("" if timeout_seconds <= 0 else f" (waited {timeout_seconds:.1f}s)"),
                record=existing,
            )
        time.sleep(min(poll_interval_seconds, deadline - now))


def release_file_mutex(handle: LockHandle) -> None:
    """Release a mutex taken with :func:`acquire_file_mutex` (single file)."""
    _release_one(handle.path, handle.pid)


@contextmanager
def file_mutex(
    lock_path: str,
    *,
    timeout_seconds: float = DEFAULT_ACQUIRE_TIMEOUT_SECONDS,
    worker_id: Optional[str] = None,
) -> Iterator[LockHandle]:
    """Context manager form of :func:`acquire_file_mutex`."""
    handle = acquire_file_mutex(
        lock_path, timeout_seconds=timeout_seconds, worker_id=worker_id
    )
    try:
        yield handle
    finally:
        try:
            release_file_mutex(handle)
        except OSError:
            pass


def _release_one(path: str, owner_pid: int) -> None:
    """Best-effort unlink of *path* if we still own it.

    A missing file is ignored (someone else already cleaned up). A
    file whose recorded PID differs from *owner_pid* is left in
    place (reclaimed by a peer; removing it would be incorrect). A
    junk record (parse failure) is removed under the same assumption
    the existing single-file release used to make — we believed we
    held the lock when this function was called, so a malformed
    record is most likely ours-but-corrupt.
    """
    if not os.path.isfile(path):
        return
    record = _read_lock_record(path)
    if record is None:
        try:
            os.unlink(path)
        except OSError:
            pass
        return
    if record.get("pid") != owner_pid:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def release_lock(handle: LockHandle) -> None:
    """Release the lock identified by *handle*.

    Set 036 Session 1 dual-release: removes BOTH the new
    ``.lifecycle.lock`` and the legacy ``.close_session.lock``
    filenames acquired by :func:`acquire_lock`. New file first so a
    crash between the two removals leaves only the legacy file
    behind — the next acquirer's stale-check reaps it via TTL or
    dead-PID probe.

    Best-effort: a missing lock file is ignored (someone else already
    cleaned up). A lock file with a different PID is *not* removed —
    that means the lock has been reclaimed by a peer and removing it
    would be incorrect.
    """
    _release_one(handle.path, handle.pid)
    # ``handle.path`` is the new-name file by contract; the legacy
    # file lives in the same directory under the legacy filename.
    legacy_path = os.path.join(
        os.path.dirname(handle.path), LEGACY_LOCK_FILENAME,
    )
    _release_one(legacy_path, handle.pid)


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
