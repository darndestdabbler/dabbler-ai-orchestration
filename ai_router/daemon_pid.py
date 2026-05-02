"""PID-file tracking for verifier_role and orchestrator_role daemons.

A daemon writes ``provider-queues/<provider>/<role>.daemon-pid`` on startup
and removes it on graceful shutdown. ``role_status`` reads the file to
report which daemons are running; ``restart_role`` reads it to find the
process to signal.

File format (one JSON object, written atomically via write+rename):

::

    {
      "role": "verifier" | "orchestrator",
      "provider": "<provider>",
      "pid": <int>,
      "worker_id": "<hostname>:<pid>:<provider>:<rand>",
      "started_at": "<ISO 8601>",
      "lease_seconds": <int>,
      "heartbeat_interval": <float>
    }

The directory layout matches the queue layout (one folder per provider)
so ``role_status`` can iterate ``provider-queues/`` once and report
both daemons living under the same provider in a single row.

Why JSON rather than the bare PID
---------------------------------
The spec originally described "a ``<provider>.daemon-pid`` file"; we
write JSON instead so ``role_status`` can render rich rows
(role + worker_id + started_at) without a second metadata file. The
format is forward-compatible — extra keys are ignored by ``read_pid_file``,
and consumers that only care about the integer PID call ``.get("pid")``.

Stale detection
---------------
A pid file whose process is no longer alive is stale. ``is_pid_alive``
is best-effort cross-platform: on POSIX it uses ``os.kill(pid, 0)``;
on Windows it uses ``OpenProcess`` via ``ctypes``.

Concurrency
-----------
The daemon writes the file once at startup and removes it at shutdown.
A second daemon for the same provider+role overwriting the file is
the documented restart_role flow (the old process is signaled to
exit first). If two daemons race on startup without the restart
helper, the later writer wins — the earlier daemon will still run
but become invisible to role_status / restart_role until it exits.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


VERIFIER_ROLE = "verifier"
ORCHESTRATOR_ROLE = "orchestrator"
VALID_ROLES = (VERIFIER_ROLE, ORCHESTRATOR_ROLE)


def pid_file_path(
    role: str,
    provider: str,
    base_dir: str | os.PathLike[str] = "provider-queues",
) -> Path:
    """Return the path to the pid file for ``(role, provider)``.

    The file is named ``<role>.daemon-pid`` so a single provider can
    host both a verifier and an orchestrator daemon without collision.
    """
    if role not in VALID_ROLES:
        raise ValueError(
            f"role must be one of {VALID_ROLES} (got {role!r})"
        )
    return Path(base_dir) / provider / f"{role}.daemon-pid"


def write_pid_file(
    role: str,
    provider: str,
    *,
    worker_id: str,
    lease_seconds: int,
    heartbeat_interval: float,
    base_dir: str | os.PathLike[str] = "provider-queues",
    pid: Optional[int] = None,
    started_at: Optional[str] = None,
) -> Path:
    """Write the daemon's pid file. Returns the path written.

    Atomically replaces any existing file via ``os.replace``. The
    caller is responsible for arranging removal on shutdown
    (typically via try/finally around ``run_forever``).
    """
    path = pid_file_path(role, provider, base_dir=base_dir)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "role": role,
        "provider": provider,
        "pid": pid if pid is not None else os.getpid(),
        "worker_id": worker_id,
        "started_at": started_at or datetime.now().astimezone().isoformat(),
        "lease_seconds": lease_seconds,
        "heartbeat_interval": heartbeat_interval,
    }

    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)
    return path


def read_pid_file(
    role: str,
    provider: str,
    base_dir: str | os.PathLike[str] = "provider-queues",
) -> Optional[dict]:
    """Return the parsed pid file, or ``None`` if it does not exist or is malformed."""
    path = pid_file_path(role, provider, base_dir=base_dir)
    if not path.is_file():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return data


def remove_pid_file(
    role: str,
    provider: str,
    base_dir: str | os.PathLike[str] = "provider-queues",
) -> bool:
    """Best-effort delete of the pid file. Returns True if the file was removed."""
    path = pid_file_path(role, provider, base_dir=base_dir)
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False
    except OSError:
        # Permission error or similar — leave the stale file rather than
        # crashing the daemon's shutdown. role_status will surface it as
        # stale once the pid is no longer alive.
        return False


def is_pid_alive(pid: int) -> bool:
    """Return True if a process with ``pid`` is currently running.

    Cross-platform best-effort:

    * On POSIX, ``os.kill(pid, 0)`` succeeds for live processes and
      raises ``ProcessLookupError`` for dead ones; ``PermissionError``
      means the process exists but is owned by another user (still
      alive from our perspective).
    * On Windows, ``ctypes`` opens the process and checks the exit code.
      Returns False on any access error so a stale pid file does not
      survive forever just because we cannot introspect.
    """
    if pid <= 0:
        return False

    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
        except ImportError:
            return False

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259

        kernel32 = ctypes.windll.kernel32
        OpenProcess = kernel32.OpenProcess
        OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        OpenProcess.restype = wintypes.HANDLE
        GetExitCodeProcess = kernel32.GetExitCodeProcess
        GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        GetExitCodeProcess.restype = wintypes.BOOL
        CloseHandle = kernel32.CloseHandle

        handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        try:
            exit_code = wintypes.DWORD()
            ok = GetExitCodeProcess(handle, ctypes.byref(exit_code))
            if not ok:
                return False
            return exit_code.value == STILL_ACTIVE
        finally:
            CloseHandle(handle)
    else:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except OSError:
            return False
        return True


__all__ = [
    "ORCHESTRATOR_ROLE",
    "VALID_ROLES",
    "VERIFIER_ROLE",
    "is_pid_alive",
    "pid_file_path",
    "read_pid_file",
    "remove_pid_file",
    "write_pid_file",
]
